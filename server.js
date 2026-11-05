/* ============================================================
   Slide Studio WEG — servidor local (Node.js, sem dependências)
   - Serve o aplicativo em http://127.0.0.1:5178
   - Executa o Kiro CLI para gerar apresentações a partir do prompt
   - Guarda cada geração em ./projetos/<id>/ (prompt.md + presentation.html)
   Uso: node server.js   (ou pelo atalho "Slide Studio WEG")
============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { spawn, execFile } = require('child_process');
const PPTX = require('./pptx');

const HOST = '127.0.0.1';
const PORT = Number(process.env.SSW_PORT) || 5178;
// Empacotado como .exe (Node SEA): a interface vem de dentro do executável e os dados ficam na pasta do usuário
const SEA = (() => { try { const s = require('node:sea'); return s.isSea() ? s : null; } catch (e) { return null; } })();
const PACKED = !!SEA;
const ROOT = PACKED ? path.dirname(process.execPath) : __dirname;
const DATA_DIR = PACKED ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'SlideStudioWEG') : ROOT;
function defaultProjectsDir() {
  if (!PACKED) return path.join(ROOT, 'projetos');
  const docs = [path.join(os.homedir(), 'Documents'), path.join(os.homedir(), 'OneDrive', 'Documents'), path.join(os.homedir(), 'Documentos')].find(d => { try { return fs.statSync(d).isDirectory(); } catch (e) { return false; } });
  return path.join(docs || DATA_DIR, 'Slide Studio WEG');
}
const PROJECTS_DIR = path.resolve(process.env.SSW_PROJECTS_DIR || defaultProjectsDir());
const TRASH_DIR = path.join(PROJECTS_DIR, '_lixeira');
const TOKEN = crypto.randomBytes(24).toString('hex');
const JOB_TIMEOUT_MS = 25 * 60 * 1000;
const SLIDE_TIMEOUT_MS = 8 * 60 * 1000;
const PDF_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_BODY = 50 * 1024 * 1024;

// Ferramentas que o Kiro pode usar sem pedir confirmação: apenas ler o prompt e pesquisar na web.
// Sem escrita de arquivos e sem acesso a URLs arbitrárias (anexos podem conter instruções maliciosas).
// O HTML é capturado da resposta do Kiro e gravado pelo próprio servidor.
// Obs.: o nome interno da busca na web no --trust-tools do Kiro CLI é "web_search" (não "remote_web_search",
// que é só o nome exposto via ACP). Sem o nome certo, a busca cai no pedido de permissão interativo e,
// no modo stream-json não interativo, falha com "tool permission approval is not supported".
const TRUSTED_TOOLS = ['read_file', 'web_search'];
const MAX_RESPONSE_CHARS = 3 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.md': 'text/markdown; charset=utf-8', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

fs.mkdirSync(PROJECTS_DIR, { recursive: true });
if (PACKED) {
  // sem console no .exe: as mensagens vão para um arquivo de log
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const logFile = path.join(DATA_DIR, 'servidor.log');
  try { fs.writeFileSync(logFile, ''); } catch (e) { /* sem acesso */ }
  const toLog = (...a) => { try { fs.appendFileSync(logFile, a.map(String).join(' ') + '\n'); } catch (e) { /* sem acesso */ } };
  console.log = toLog; console.error = toLog;
  process.on('uncaughtException', e => toLog('ERRO', e && e.stack || e));
}

/* ---------------- Localizar o Kiro CLI ---------------- */
function findKiro() {
  const candidates = [];
  if (process.env.KIRO_CLI) candidates.push(process.env.KIRO_CLI);
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Kiro-Cli', 'kiro-cli.exe'));
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    candidates.push(path.join(dir, process.platform === 'win32' ? 'kiro-cli.exe' : 'kiro-cli'));
  }
  return candidates.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}
const KIRO = findKiro();

/* ---------------- Localizar Edge/Chrome (exportação PDF) ---------------- */
function isFile(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }
function findBrowser() {
  const c = [];
  if (process.env.SSW_BROWSER) c.push(process.env.SSW_BROWSER);
  for (const base of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean)) {
    c.push(path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    c.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  if (process.platform !== 'win32') {
    c.push('/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  }
  return c.find(isFile) || null;
}
const BROWSER = findBrowser();

/* ---------------- Utilidades ---------------- */
function send(res, status, body, headers) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, Object.assign({
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, headers || {}));
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Corpo da requisição muito grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}
function slugify(s) {
  return String(s || 'apresentacao').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'apresentacao';
}
function newProjectId(title) {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  return stamp + '-' + slugify(title);
}
function projectPath(id) {
  if (!/^[a-z0-9-]+$/i.test(id || '')) return null;
  const p = path.join(PROJECTS_DIR, id);
  return p.startsWith(PROJECTS_DIR + path.sep) ? p : null;
}
function extractHtml(text) {
  const t = String(text || '').replace(/```html/gi, '').replace(/```/g, '');
  const lower = t.toLowerCase();
  let i = lower.indexOf('<!doctype html');
  if (i < 0) i = lower.indexOf('<html');
  const j = lower.lastIndexOf('</html>');
  return (i >= 0 && j > i) ? t.slice(i, j + 7) : null;
}
function readMeta(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); } catch (e) { return {}; }
}
function writeMeta(dir, meta) {
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
}

/* ---------------- Chaves de API (criptografadas em repouso) ---------------- */
// Ficam fora da pasta do projeto, em %LOCALAPPDATA%\SlideStudioWEG\chaves.json.
// No Windows, cada chave é protegida com a DPAPI do usuário (só este usuário, neste PC, consegue abrir).
const KEY_PROVIDERS = new Set(['gemini', 'anthropic', 'openai']);
const SECRETS_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'SlideStudioWEG');
const SECRETS_FILE = path.join(SECRETS_DIR, 'chaves.json');
const keyCache = new Map();
function dpapi(op, input) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return resolve(input); // sem DPAPI: arquivo com permissão só do usuário
    const ps = 'Add-Type -AssemblyName System.Security; $in = [Console]::In.ReadToEnd().Trim(); ' + (op === 'protect'
      ? '[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($in), $null, "CurrentUser"))'
      : '[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($in), $null, "CurrentUser"))');
    // o segredo vai pela entrada padrão, nunca pela linha de comando (visível na lista de processos)
    const p = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 20000 }, (err, out) => {
      if (err) return reject(new Error('Não foi possível ' + (op === 'protect' ? 'proteger' : 'abrir') + ' a chave (DPAPI).'));
      resolve(String(out).trim());
    });
    p.stdin.end(input);
  });
}
function readSecrets() { try { return JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8')); } catch (e) { return {}; } }
function writeSecrets(obj) {
  fs.mkdirSync(SECRETS_DIR, { recursive: true });
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(obj, null, 2), { encoding: 'utf8', mode: 0o600 });
}
async function getKey(provider) {
  if (keyCache.has(provider)) return keyCache.get(provider);
  const blob = readSecrets()[provider];
  if (!blob) return '';
  const key = await dpapi('unprotect', blob);
  keyCache.set(provider, key);
  return key;
}
async function setKey(provider, key) {
  const all = readSecrets();
  if (key) { all[provider] = await dpapi('protect', key); keyCache.set(provider, key); }
  else { delete all[provider]; keyCache.delete(provider); }
  writeSecrets(all);
}

/* ---------------- Jobs de geração ---------------- */
const jobs = new Map();
let runningJobId = null;

function pushLog(job, entry) {
  entry.t = Date.now() - job.startedAt;
  job.log.push(entry);
  if (job.log.length > 400) job.log.splice(0, job.log.length - 400);
  job.logSeq++;
}

function handleEvent(job, ev) {
  if (ev.type === 'runFinished') {
    job.finalText = (ev.data && ev.data.finalText) || '';
    job.runStatus = (ev.data && ev.data.status) || 'unknown';
    return;
  }
  const u = ev && ev.data && ev.data.update;
  if (!u) return;
  if (u.sessionUpdate === 'session_info_update') {
    // créditos do Kiro: cada turno concluído traz promptTurnSummaries: [{ unit: 'credit', usage: 0.42 }]
    const k = u._meta && u._meta.kiro;
    if (k && k.kind === 'turn_completion' && Array.isArray(k.promptTurnSummaries)) {
      k.promptTurnSummaries.forEach(s => { const n = Number(s && s.usage); if (/^credit/i.test((s && s.unit) || '') && n > 0) job.credits += n; });
    }
    return;
  }
  if (u.sessionUpdate === 'tool_call') {
    pushLog(job, { kind: 'tool', text: u.title || 'Executando ferramenta' });
  } else if (u.sessionUpdate === 'tool_call_update' && u.status === 'failed') {
    pushLog(job, { kind: 'warn', text: (u.title || 'Ferramenta') + ' falhou' });
  } else if (u.sessionUpdate === 'agent_message_chunk' && u.content && u.content.type === 'text') {
    if (job.fullText.length < MAX_RESPONSE_CHARS) job.fullText += u.content.text;
    if (!job.writing && /<!doctype html|<html/i.test(job.fullText)) {
      job.writing = true;
      pushLog(job, { kind: 'info', text: 'Escrevendo os slides' });
    }
  }
}

// kind 'deck': gera uma apresentação nova em projetos/<id>/
// kind 'slide': reescreve um único slide numa pasta temporária (resultado volta para o app, nada é gravado em projetos/;
// só os créditos gastos entram no meta.json do projeto aberto, quando o app informa qual é)
function startJob({ prompt, title, kind, projectId }) {
  kind = kind === 'slide' ? 'slide' : 'deck';
  const id = kind === 'slide' ? 'slide-' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex') : newProjectId(title);
  const dir = kind === 'slide' ? fs.mkdtempSync(path.join(os.tmpdir(), 'ssw-slide-')) : projectPath(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'prompt.md'), prompt, 'utf8');
  if (kind === 'deck') writeMeta(dir, { id, title: title || 'Apresentação', createdAt: new Date().toISOString(), status: 'running' });
  const projectDir = kind === 'slide' && projectId ? projectPath(projectId) : null;

  const job = { id, dir, kind, title, status: 'running', log: [], logSeq: 0, fullText: '', writing: false, startedAt: Date.now(), finalText: '', runStatus: null, error: null, proc: null, result: null,
    credits: 0, projectDir: projectDir && fs.existsSync(projectDir) ? projectDir : null };
  jobs.set(id, job);
  runningJobId = id;
  pushLog(job, { kind: 'info', text: 'Prompt enviado ao Kiro' });

  const instruction = kind === 'slide'
    ? 'Leia o arquivo prompt.md nesta pasta e execute TODAS as instruções dele. ' +
      'Você pode pesquisar na web. Não crie nem altere arquivos. ' +
      'Sua resposta final deve ser SOMENTE o elemento <section> do slide, de <section até </section>, ' +
      'sem markdown e sem texto antes ou depois.'
    : 'Leia o arquivo prompt.md nesta pasta e execute TODAS as instruções dele. ' +
      'Você pode pesquisar na web. Não crie nem altere arquivos. ' +
      'Sua resposta final deve ser SOMENTE o documento HTML completo, de <!DOCTYPE html> até </html>, ' +
      'sem markdown e sem texto antes ou depois.';

  const args = ['chat', '--output-format', 'stream-json', '--trust-tools=' + TRUSTED_TOOLS.join(','), instruction];
  let proc;
  try {
    proc = spawn(KIRO, args, { cwd: dir, windowsHide: true, env: process.env });
  } catch (e) {
    finishJob(job, 'error', 'Não foi possível iniciar o Kiro CLI: ' + e.message);
    return job;
  }
  job.proc = proc;

  let buf = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', chunk => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith('{')) continue;
      try { handleEvent(job, JSON.parse(line)); } catch (e) { /* linha não-JSON */ }
    }
  });
  let errTail = '';
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', c => { errTail = (errTail + c).slice(-4000); });

  const limit = kind === 'slide' ? SLIDE_TIMEOUT_MS : JOB_TIMEOUT_MS;
  job.timer = setTimeout(() => {
    pushLog(job, { kind: 'warn', text: 'Tempo limite atingido (' + Math.round(limit / 60000) + ' min)' });
    killJob(job);
  }, limit);

  proc.on('error', e => finishJob(job, 'error', 'Falha ao executar o Kiro CLI: ' + e.message));
  proc.on('close', code => {
    clearTimeout(job.timer);
    if (job.status !== 'running') return;
    if (job.cancelled) return finishJob(job, 'cancelled', null);
    if (kind === 'slide') {
      const text = /<section/i.test(job.finalText) ? job.finalText : job.fullText;
      setTimeout(() => rmQuiet(dir), 1500);
      if (/<section[\s>]/i.test(text)) {
        job.result = text.slice(0, MAX_RESPONSE_CHARS);
        pushLog(job, { kind: 'done', text: 'Slide reescrito' });
        return finishJob(job, 'done', null);
      }
      const hint = /login|auth|token/i.test(errTail) ? ' Verifique se você está logado no Kiro (kiro-cli login).' : '';
      return finishJob(job, 'error', 'O Kiro terminou sem devolver o slide (código ' + code + ').' + hint);
    }
    const file = path.join(dir, 'presentation.html');
    const html = extractHtml(job.fullText) || extractHtml(job.finalText);
    if (html) {
      fs.writeFileSync(file, html, 'utf8');
      pushLog(job, { kind: 'done', text: 'Apresentação salva em presentation.html' });
      finishJob(job, 'done', null);
    } else {
      const hint = /login|auth|token/i.test(errTail) ? ' Verifique se você está logado no Kiro (kiro-cli login).' : '';
      finishJob(job, 'error', 'O Kiro terminou sem gerar o presentation.html (código ' + code + ').' + hint);
    }
  });
  return job;
}

function finishJob(job, status, error) {
  if (job.status !== 'running') return;
  job.status = status;
  job.error = error;
  job.finishedAt = Date.now();
  if (error) pushLog(job, { kind: 'error', text: error });
  if (job.credits > 0) pushLog(job, { kind: 'info', text: 'Créditos do Kiro gastos: ' + fmtCredits(job.credits) });
  if (runningJobId === job.id) runningJobId = null;
  kiroUsage.at = 0; // o uso do plano mudou: a próxima consulta lê de novo
  // créditos acumulam no meta.json do projeto: geração + edições de slide feitas pelo Kiro
  if (job.kind === 'slide') {
    if (!job.projectDir || !(job.credits > 0)) return;
    const meta = readMeta(job.projectDir);
    meta.credits = roundCredits((Number(meta.credits) || 0) + job.credits);
    try { writeMeta(job.projectDir, meta); } catch (e) { /* ignore */ }
    return;
  }
  const meta = readMeta(job.dir);
  meta.status = status; meta.finishedAt = new Date().toISOString(); if (error) meta.error = error;
  if (job.credits > 0) meta.credits = roundCredits(job.credits);
  try { writeMeta(job.dir, meta); } catch (e) { /* ignore */ }
}

function killJob(job) {
  if (!job.proc || job.proc.exitCode !== null) return;
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(job.proc.pid), '/T', '/F'], () => {});
  else job.proc.kill('SIGTERM');
}

function jobView(job, since) {
  const out = {
    id: job.id, status: job.status, error: job.error, title: job.title,
    elapsedMs: (job.finishedAt || Date.now()) - job.startedAt,
    logSeq: job.logSeq, log: job.log.slice(Math.max(0, job.log.length - (job.logSeq - (since || 0)))),
    receivedChars: job.fullText.length,
    slidesWritten: (job.fullText.match(/<section[^>]*class="[^"]*\bslide\b/gi) || []).length,
    credits: roundCredits(job.credits)
  };
  if (job.status === 'done' && job.kind === 'slide') out.result = job.result;
  else if (job.status === 'done') {
    try { out.html = fs.readFileSync(path.join(job.dir, 'presentation.html'), 'utf8'); } catch (e) { /* ignore */ }
  }
  return out;
}

// Jobs terminados saem da memória depois de 30 min (cada um guarda até 3 MB de resposta)
const JOB_RETENTION_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, j] of jobs) if (j.status !== 'running' && j.finishedAt && now - j.finishedAt > JOB_RETENTION_MS) jobs.delete(id);
}, 5 * 60 * 1000).unref();

// Gerações que estavam em andamento quando o servidor fechou não voltam: marca como interrompidas
function markInterruptedJobs() {
  let names = [];
  try { names = fs.readdirSync(PROJECTS_DIR); } catch (e) { return; }
  for (const id of names) {
    const dir = projectPath(id); if (!dir) continue;
    const meta = readMeta(dir);
    if (meta.status === 'running' && !fs.existsSync(path.join(dir, 'presentation.html'))) {
      meta.status = 'interrupted'; meta.error = 'A geração foi interrompida porque o Slide Studio foi fechado. Gere de novo.';
      try { writeMeta(dir, meta); } catch (e) { /* sem acesso */ }
    }
  }
}
markInterruptedJobs();

/* ---------------- Créditos e uso do plano do Kiro ---------------- */
const roundCredits = n => Math.round((Number(n) || 0) * 10000) / 10000;
const fmtCredits = n => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// O uso do plano vem do comando /usage do Kiro CLI. Fora do modo interativo ele só funciona no motor V2:
// no V3 o "/usage" vira pergunta para o modelo e gasta créditos. Não gasta créditos e leva uns 15 s (inicia o CLI),
// por isso fica em cache por 5 min e é lido de novo depois de cada geração do Kiro.
const USAGE_TTL_MS = 5 * 60 * 1000;
const USAGE_DIR = path.join(os.tmpdir(), 'ssw-kiro-usage');
const kiroUsage = { data: null, at: 0, pending: null };
/**
 * Saída do Kiro CLI 2.37:
 *   Estimated Usage | resets on 2026-12-01 | KIRO STUDENT
 *   Credits (560.93 of 1000 covered in plan), 56.1%
 * Versões anteriores desenham uma caixa com "Monthly credits: ███ 56% (resets on 12/01)" e "Bonus credits: 0.00/100 credits used".
 */
function parseKiroUsage(text) {
  const t = String(text || '').replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '');
  const num = s => parseFloat(String(s).replace(/,/g, ''));
  const cov = /([\d.,]+)\s+of\s+([\d.,]+)\s+covered in plan/i.exec(t);
  const pct = /(\d+(?:\.\d+)?)\s*%/.exec(t);
  if (!cov && !pct) return null;
  const plan = /\b(KIRO(?:[ \t]+[A-Z][A-Z0-9+]*(?=[\s|┃]|$))+)/.exec(t);
  const reset = /resets on\s+([\d\/-]+)/i.exec(t);
  const bonus = /([\d.,]+)\s*\/\s*([\d.,]+)\s+credits used(?:,\s*expires in\s+(\d+)\s+days?)?/i.exec(t);
  const used = cov ? num(cov[1]) : null, limit = cov ? num(cov[2]) : null;
  return {
    plan: plan ? plan[1] : null, used, limit,
    // com os dois números a conta é exata; o % impresso fica como reserva
    percent: limit > 0 ? Math.round(used / limit * 1000) / 10 : (pct ? parseFloat(pct[1]) : null),
    resetsOn: reset ? reset[1] : null,
    bonus: bonus ? { used: num(bonus[1]), limit: num(bonus[2]), expiresInDays: bonus[3] ? Number(bonus[3]) : null } : null
  };
}
function runKiroUsage() {
  return new Promise(resolve => {
    try { fs.mkdirSync(USAGE_DIR, { recursive: true }); } catch (e) { /* ignore */ }
    execFile(KIRO, ['chat', '--no-interactive', '--v2', '/usage'], { cwd: USAGE_DIR, windowsHide: true, timeout: 45000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const out = String(stdout || '') + '\n' + String(stderr || '');
      const data = parseKiroUsage(out);
      if (data) return resolve(data);
      resolve({ error: /login|log in|sign in|auth|token|expired/i.test(out) ? 'Entre no Kiro (kiro-cli login) para ver o uso dos créditos.' : 'Não foi possível ler o uso dos créditos do Kiro' + (err && err.killed ? ' (o Kiro demorou para responder).' : '.') });
    });
  });
}
/** uso do plano, do cache quando recente; leituras simultâneas esperam a mesma execução do CLI */
function getKiroUsage(fresh) {
  if (kiroUsage.pending) return kiroUsage.pending;
  if (!fresh && kiroUsage.data && Date.now() - kiroUsage.at < USAGE_TTL_MS) return Promise.resolve(kiroUsage.data);
  kiroUsage.pending = runKiroUsage().then(d => {
    d.updatedAt = new Date().toISOString();
    // falha depois de uma leitura boa: mantém os números anteriores e avisa que estão desatualizados
    kiroUsage.data = d.error && kiroUsage.data && !kiroUsage.data.error ? Object.assign({}, kiroUsage.data, { stale: true, error: d.error }) : d;
    kiroUsage.at = Date.now();
    return kiroUsage.data;
  }).finally(() => { kiroUsage.pending = null; });
  return kiroUsage.pending;
}

/* ---------------- Projetos ---------------- */
function listProjects() {
  let names = [];
  try { names = fs.readdirSync(PROJECTS_DIR); } catch (e) { return []; }
  return names.map(id => {
    const dir = projectPath(id); if (!dir) return null;
    let stat; try { stat = fs.statSync(dir); } catch (e) { return null; }
    if (!stat.isDirectory()) return null;
    const meta = readMeta(dir);
    const htmlFile = path.join(dir, 'presentation.html');
    const hasHtml = fs.existsSync(htmlFile);
    let slides = 0;
    if (hasHtml) { try { slides = (fs.readFileSync(htmlFile, 'utf8').match(/<section\b[^>]*\bclass="[^"]*\bslide\b/gi) || []).length; } catch (e) { /* ignore */ } }
    return { id, title: meta.title || id, createdAt: meta.createdAt || stat.birthtime.toISOString(), updatedAt: meta.updatedAt || null, status: hasHtml ? 'done' : (meta.status || 'empty'), hasHtml, slides, credits: Number(meta.credits) || 0 };
  }).filter(Boolean).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

/* ---------------- Exportação PDF (Edge/Chrome headless) ---------------- */
let pdfBusy = false;

function rmQuiet(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch (e) { /* temp: ignora */ }
}

function exportPdf(html) {
  return new Promise((resolve, reject) => {
    if (!BROWSER) return reject(new Error('Microsoft Edge ou Google Chrome não encontrado para gerar o PDF.'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssw-pdf-'));
    const htmlFile = path.join(dir, 'deck.html');
    const pdfFile = path.join(dir, 'deck.pdf');
    fs.writeFileSync(htmlFile, html, 'utf8');
    const args = [
      '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--disable-sync', '--mute-audio', '--hide-scrollbars', '--user-data-dir=' + path.join(dir, 'perfil'),
      '--run-all-compositor-stages-before-draw', '--virtual-time-budget=15000',
      '--no-pdf-header-footer', '--print-to-pdf-no-header', '--print-to-pdf=' + pdfFile,
      pathToFileURL(htmlFile).href
    ];
    let proc;
    try { proc = spawn(BROWSER, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch (e) { rmQuiet(dir); return reject(new Error('Não foi possível iniciar o navegador: ' + e.message)); }
    let errTail = '';
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', c => { errTail = (errTail + c).slice(-2000); });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(proc); }, PDF_TIMEOUT_MS);
    proc.on('error', e => { clearTimeout(timer); rmQuiet(dir); reject(new Error('Falha ao executar o navegador: ' + e.message)); });
    proc.on('close', () => {
      clearTimeout(timer);
      let buf = null;
      try { buf = fs.readFileSync(pdfFile); } catch (e) { /* sem arquivo */ }
      setTimeout(() => rmQuiet(dir), 1500);
      if (buf && buf.length > 4 && buf.slice(0, 4).toString('latin1') === '%PDF') return resolve(buf);
      reject(new Error(timedOut ? 'Tempo limite ao gerar o PDF.' : 'O navegador não gerou o PDF. ' + errTail.split('\n').slice(-3).join(' ').trim()));
    });
  });
}

/* ---------------- Exportação PowerPoint (Edge headless via CDP) ---------------- */
let pptxBusy = false;

// O .pptx não leva as fontes da web: se a fonte não estiver instalada, o PowerPoint troca por outra bem diferente.
// Por isso, fontes ausentes viram a fonte instalada de métricas mais parecidas.
const FONT_SUBS = {
  inter: ['Segoe UI', 'Arial'], roboto: ['Segoe UI', 'Arial'], 'open sans': ['Segoe UI', 'Arial'], lato: ['Segoe UI', 'Arial'],
  'source sans 3': ['Segoe UI', 'Arial'], 'ibm plex sans': ['Segoe UI', 'Arial'], 'dm sans': ['Segoe UI', 'Arial'], 'work sans': ['Segoe UI', 'Arial'],
  'nunito sans': ['Segoe UI', 'Arial'], nunito: ['Segoe UI', 'Arial'], poppins: ['Verdana', 'Segoe UI'], montserrat: ['Verdana', 'Segoe UI'],
  raleway: ['Segoe UI', 'Arial'], 'plus jakarta sans': ['Segoe UI', 'Arial'], manrope: ['Segoe UI', 'Arial'], 'space grotesk': ['Segoe UI', 'Arial'],
  'playfair display': ['Georgia', 'Times New Roman'], merriweather: ['Georgia', 'Times New Roman'], lora: ['Georgia', 'Times New Roman'],
  'roboto mono': ['Consolas', 'Courier New'], 'jetbrains mono': ['Consolas', 'Courier New']
};
let installedFonts = null; // Set com nomes em minúsculas (null = desconhecido)
function loadInstalledFonts() {
  if (process.platform !== 'win32') return;
  const ps = 'Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }';
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 20000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
    const names = String(out || '').split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!err && names.length > 20) { installedFonts = new Set(names); return; }
    // plano B: nomes dos arquivos em Windows\Fonts e na pasta de fontes do usuário
    const set = new Set(['arial', 'calibri', 'segoe ui', 'verdana', 'tahoma', 'georgia', 'times new roman', 'consolas', 'courier new', 'trebuchet ms', 'cambria']);
    for (const d of [path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'), process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts')].filter(Boolean)) {
      try { fs.readdirSync(d).forEach(f => set.add('file:' + f.toLowerCase().replace(/\.(ttf|otf|ttc)$/, '').replace(/[^a-z0-9]/g, ''))); } catch (e) { /* sem acesso */ }
    }
    installedFonts = set;
  });
}
function fontInstalled(name) {
  if (!installedFonts) return true; // sem informação: mantém a fonte original
  const n = name.toLowerCase();
  if (installedFonts.has(n)) return true;
  const key = 'file:' + n.replace(/[^a-z0-9]/g, '');
  for (const f of installedFonts) if (f.startsWith(key)) return true;
  return false;
}
/** troca fontes não instaladas nos textos extraídos; devolve { 'Inter': 'Segoe UI', ... } */
function substituteFonts(slides) {
  const map = {};
  for (const s of slides) for (const t of s.texts || []) for (const r of t.runs || []) {
    if (!r.font) continue;
    if (!(r.font in map)) {
      if (fontInstalled(r.font)) map[r.font] = null;
      else { const c = (FONT_SUBS[r.font.toLowerCase()] || ['Segoe UI', 'Arial']).find(fontInstalled); map[r.font] = c || null; }
    }
    if (map[r.font]) r.font = map[r.font];
  }
  Object.keys(map).forEach(k => { if (!map[k]) delete map[k]; });
  return map;
}

/** abre o Edge headless com depuração remota e devolve um cliente CDP mínimo da primeira aba */
async function openCdp(dir) {
  const prof = path.join(dir, 'perfil');
  const proc = spawn(BROWSER, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync',
    '--mute-audio', '--hide-scrollbars', '--remote-debugging-port=0', '--user-data-dir=' + prof, '--window-size=' + PPTX.W + ',' + PPTX.H, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });
  let port = null;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = parseInt(fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0], 10) || null; } catch (e) { /* ainda iniciando */ }
    if (!port) await new Promise(r => setTimeout(r, 150));
  }
  if (!port) { killTree(proc); throw new Error('O navegador não iniciou para gerar o PowerPoint.'); }
  let wsUrl = null;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try { const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); const pg = list.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) { /* ainda iniciando */ }
    if (!wsUrl) await new Promise(r => setTimeout(r, 150));
  }
  if (!wsUrl) { killTree(proc); throw new Error('Não foi possível conectar ao navegador.'); }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('Falha na conexão com o navegador.'))); });
  let seq = 0; const pending = new Map(); const waiters = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method) for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].method === m.method) { waiters[i].res(m.params); waiters.splice(i, 1); }
  });
  const send = (method, params) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  const once = (method, ms) => new Promise(res => { const w = { method, res }; waiters.push(w); setTimeout(() => res(null), ms); });
  const close = () => { try { ws.close(); } catch (e) { /* já fechado */ } killTree(proc); };
  return { send, once, close };
}

async function exportPptx(html, title, mode) {
  if (!BROWSER) throw new Error('Microsoft Edge ou Google Chrome não encontrado para gerar o PowerPoint.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssw-pptx-'));
  const htmlFile = path.join(dir, 'deck.html');
  fs.writeFileSync(htmlFile, html, 'utf8');
  let cdp = null;
  const timer = setTimeout(() => { if (cdp) cdp.close(); }, PDF_TIMEOUT_MS);
  try {
    cdp = await openCdp(dir);
    const { send, once } = cdp;
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: PPTX.W, height: PPTX.H, deviceScaleFactor: 1, mobile: false });
    const loaded = once('Page.loadEventFired', 45000);
    await send('Page.navigate', { url: pathToFileURL(htmlFile).href });
    await loaded;
    // fontes da web, Tailwind (gera o CSS depois de carregar) e ícones
    await send('Runtime.evaluate', { expression: '(document.fonts ? document.fonts.ready : Promise.resolve()).then(function(){ return new Promise(function(r){ setTimeout(r, 900); }); })', awaitPromise: true });
    let info;
    if (mode === 'image') {
      const r = await send('Runtime.evaluate', { returnByValue: true, expression: 'Array.prototype.map.call(document.querySelectorAll("[data-ssw-slide]"), function(s){ var b = s.getBoundingClientRect(); return { top: b.top + scrollY, left: b.left + scrollX, texts: [] }; })' });
      info = { slides: r.result.value || [] };
    } else {
      const r = await send('Runtime.evaluate', { expression: PPTX.EXTRACT_JS, returnByValue: true });
      if (r.exceptionDetails) throw new Error('Falha ao ler os textos dos slides.');
      info = r.result.value;
      await new Promise(res => setTimeout(res, 150));
    }
    if (!info || !info.slides || !info.slides.length) throw new Error('Nenhum slide encontrado para exportar.');
    const slides = [];
    for (const s of info.slides) {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: s.left, y: s.top, width: PPTX.W, height: PPTX.H, scale: 1.5 } });
      slides.push({ image: Buffer.from(shot.data, 'base64'), texts: s.texts || [], notes: s.notes || '' });
    }
    const fontSubs = substituteFonts(slides);
    return { buffer: PPTX.buildPptx({ slides, title }), slides: slides.length, texts: slides.reduce((n, s) => n + s.texts.length, 0), fontSubs };
  } finally {
    clearTimeout(timer);
    if (cdp) cdp.close();
    setTimeout(() => rmQuiet(dir), 1500);
  }
}

function killTree(proc) {
  if (!proc || proc.exitCode !== null) return;
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], () => {});
  else proc.kill('SIGTERM');
}

function pdfFileName(title, ext) {
  const base = String(title || 'apresentacao').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 100) || 'apresentacao';
  return base + (ext || '.pdf');
}

/* ---------------- Servidor HTTP ---------------- */
function isAllowedOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true; // navegação direta / mesma origem sem cabeçalho
  return o === 'http://' + HOST + ':' + PORT || o === 'http://localhost:' + PORT;
}

async function handleApi(req, res, url) {
  if (!isAllowedOrigin(req) || req.headers['x-ssw-token'] !== TOKEN) return send(res, 403, { error: 'Acesso negado' });
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (req.method === 'GET' && parts[1] === 'health') {
    return send(res, 200, { ok: true, packed: PACKED, kiro: !!KIRO, kiroPath: KIRO ? path.basename(KIRO) : null, pdf: !!BROWSER, running: runningJobId });
  }
  if (req.method === 'POST' && parts[1] === 'export-pdf') {
    if (pdfBusy) return send(res, 409, { error: 'Já existe uma exportação de PDF em andamento.' });
    const body = await readBody(req);
    if (typeof body.html !== 'string' || !body.html.trim()) return send(res, 400, { error: 'HTML ausente' });
    pdfBusy = true;
    try {
      const pdf = await exportPdf(body.html);
      const name = pdfFileName(body.title);
      return send(res, 200, pdf, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': "attachment; filename=\"apresentacao.pdf\"; filename*=UTF-8''" + encodeURIComponent(name)
      });
    } catch (e) {
      return send(res, 500, { error: e.message });
    } finally {
      pdfBusy = false;
    }
  }
  if (parts[1] === 'keys') {
    // GET /api/keys → quais provedores têm chave (sem revelar) · GET/POST /api/keys/:provedor → ler/gravar (vazio apaga)
    if (req.method === 'GET' && !parts[2]) {
      const all = readSecrets(); const has = {};
      KEY_PROVIDERS.forEach(p => { has[p] = !!all[p]; });
      return send(res, 200, { keys: has, encrypted: process.platform === 'win32' });
    }
    if (!KEY_PROVIDERS.has(parts[2])) return send(res, 404, { error: 'Provedor desconhecido' });
    if (req.method === 'GET') return send(res, 200, { key: await getKey(parts[2]) });
    if (req.method === 'POST') {
      const body = await readBody(req);
      const key = typeof body.key === 'string' ? body.key.trim() : '';
      if (key.length > 400 || /\s/.test(key)) return send(res, 400, { error: 'Chave inválida' });
      await setKey(parts[2], key);
      return send(res, 200, { ok: true, saved: !!key });
    }
  }
  if (req.method === 'POST' && parts[1] === 'export-pptx') {
    if (pptxBusy) return send(res, 409, { error: 'Já existe uma exportação para PowerPoint em andamento.' });
    const body = await readBody(req);
    if (typeof body.html !== 'string' || !body.html.trim()) return send(res, 400, { error: 'HTML ausente' });
    pptxBusy = true;
    try {
      const out = await exportPptx(body.html, body.title, body.mode === 'image' ? 'image' : 'editable');
      const name = pdfFileName(body.title, '.pptx');
      return send(res, 200, out.buffer, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': "attachment; filename=\"apresentacao.pptx\"; filename*=UTF-8''" + encodeURIComponent(name),
        'X-SSW-Slides': String(out.slides), 'X-SSW-Texts': String(out.texts),
        'X-SSW-Fonts': encodeURIComponent(JSON.stringify(out.fontSubs || {}))
      });
    } catch (e) {
      return send(res, 500, { error: e.message });
    } finally {
      pptxBusy = false;
    }
  }
  if (req.method === 'POST' && parts[1] === 'generate') {
    if (!KIRO) return send(res, 503, { error: 'Kiro CLI não encontrado neste computador.' });
    if (runningJobId) return send(res, 409, { error: 'Já existe uma geração em andamento.', jobId: runningJobId });
    const body = await readBody(req);
    if (!body.prompt || typeof body.prompt !== 'string') return send(res, 400, { error: 'Prompt ausente' });
    const job = startJob({ prompt: body.prompt, title: String(body.title || '').slice(0, 120) });
    return send(res, 200, { jobId: job.id });
  }
  if (req.method === 'POST' && parts[1] === 'edit-slide') {
    if (!KIRO) return send(res, 503, { error: 'Kiro CLI não encontrado neste computador.' });
    if (runningJobId) return send(res, 409, { error: 'O Kiro já está trabalhando em outro pedido. Aguarde terminar.', jobId: runningJobId });
    const body = await readBody(req);
    if (!body.prompt || typeof body.prompt !== 'string') return send(res, 400, { error: 'Prompt ausente' });
    const job = startJob({ prompt: body.prompt, title: 'Editar slide', kind: 'slide', projectId: typeof body.projectId === 'string' ? body.projectId : null });
    return send(res, 200, { jobId: job.id });
  }
  if (req.method === 'GET' && parts[1] === 'kiro-usage') {
    // GET /api/kiro-usage[?fresh=1] → { available, plan, used, limit, percent, resetsOn, bonus, updatedAt, error?, stale? }
    if (!KIRO) return send(res, 200, { available: false });
    const data = await getKiroUsage(url.searchParams.get('fresh') === '1');
    return send(res, 200, Object.assign({ available: true }, data));
  }
  if (parts[1] === 'jobs' && parts[2]) {
    const job = jobs.get(parts[2]);
    if (!job) return send(res, 404, { error: 'Geração não encontrada' });
    if (req.method === 'GET') return send(res, 200, jobView(job, Number(url.searchParams.get('since')) || 0));
    if (req.method === 'POST' && parts[3] === 'cancel') {
      job.cancelled = true; killJob(job);
      setTimeout(() => finishJob(job, 'cancelled', null), 1500);
      return send(res, 200, { ok: true });
    }
  }
  if (parts[1] === 'projects') {
    if (req.method === 'GET' && !parts[2]) return send(res, 200, { projects: listProjects() });
    const dir = projectPath(parts[2]);
    if (!dir || !fs.existsSync(dir)) return send(res, 404, { error: 'Projeto não encontrado' });
    const file = path.join(dir, 'presentation.html');
    if (req.method === 'GET' && !parts[3]) {
      let html = null; try { html = fs.readFileSync(file, 'utf8'); } catch (e) { /* ignore */ }
      return send(res, 200, { id: parts[2], meta: readMeta(dir), html });
    }
    if (req.method === 'POST' && parts[3] === 'save') {
      const body = await readBody(req);
      if (typeof body.html !== 'string' || !body.html.trim()) return send(res, 400, { error: 'HTML ausente' });
      fs.writeFileSync(file, body.html, 'utf8');
      const meta = readMeta(dir); meta.updatedAt = new Date().toISOString(); if (body.title) meta.title = String(body.title).slice(0, 120);
      writeMeta(dir, meta);
      return send(res, 200, { ok: true, updatedAt: meta.updatedAt });
    }
    if (req.method === 'POST' && parts[3] === 'delete') {
      // Exclusão reversível: move a pasta para projetos/_lixeira
      fs.mkdirSync(TRASH_DIR, { recursive: true });
      fs.renameSync(dir, path.join(TRASH_DIR, parts[2] + '-' + Date.now()));
      return send(res, 200, { ok: true });
    }
  }
  if (req.method === 'POST' && parts[1] === 'projects-new') {
    // Salva um HTML importado/editado como novo projeto
    const body = await readBody(req);
    if (typeof body.html !== 'string' || !body.html.trim()) return send(res, 400, { error: 'HTML ausente' });
    const id = newProjectId(body.title);
    const dir = projectPath(id); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'presentation.html'), body.html, 'utf8');
    writeMeta(dir, { id, title: body.title || 'Apresentação', createdAt: new Date().toISOString(), status: 'done', imported: true });
    return send(res, 200, { id });
  }
  return send(res, 404, { error: 'Rota não encontrada' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Proibido');
  // Somente o app é servido (nunca projetos, server.js ou arquivos ocultos)
  const relNorm = path.relative(ROOT, file).split(path.sep);
  const allowed = relNorm[0] === 'index.html' || relNorm[0] === 'app';
  if (!allowed || relNorm.some(s => s.startsWith('.'))) return send(res, 404, 'Não encontrado');
  const reply = (err, data) => {
    if (err) return send(res, 404, 'Não encontrado');
    const ext = path.extname(file).toLowerCase();
    let body = data;
    if (ext === '.html') body = Buffer.from(data.toString('utf8').replace('__SSW_TOKEN__', TOKEN), 'utf8');
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  };
  if (!PACKED) return fs.readFile(file, reply);
  let data = null;
  try { data = Buffer.from(SEA.getAsset(relNorm.join('/'))); } catch (e) { /* não embutido */ }
  reply(data ? null : new Error('não encontrado'), data);
}

const ALLOWED_HOSTS = new Set([HOST + ':' + PORT, 'localhost:' + PORT]);

let lastRequestAt = Date.now();
const server = http.createServer(async (req, res) => {
  lastRequestAt = Date.now();
  try {
    // Proteção contra DNS rebinding: só aceita requisições endereçadas ao próprio localhost
    if (!ALLOWED_HOSTS.has(String(req.headers.host || '').toLowerCase())) return send(res, 403, 'Host não permitido');
    const url = new URL(req.url, 'http://' + HOST + ':' + PORT);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET') return send(res, 405, 'Método não permitido');
    return serveStatic(req, res, url);
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

/* ---------------- Ícone nítido na barra de tarefas (Windows) ---------------- */
// A barra usa o ícone do atalho do Menu Iniciar que tem o mesmo AppUserModelID da janela do app (ver ferramentas/icone-barra.ps1).
function fixTaskbarIcon() {
  if (process.platform !== 'win32') return;
  let script;
  try { script = PACKED ? Buffer.from(SEA.getAsset('ferramentas/icone-barra.ps1')).toString('utf8') : fs.readFileSync(path.join(ROOT, 'ferramentas', 'icone-barra.ps1'), 'utf8'); }
  catch (e) { return; }
  const q = v => "'" + String(v).replace(/'/g, "''") + "'";
  const target = PACKED ? process.execPath : path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'wscript.exe');
  const args = PACKED ? '' : '"' + path.join(ROOT, 'iniciar.vbs') + '"';
  let icon = path.join(ROOT, 'slide-studio-weg.ico');
  if (PACKED) {
    // o .ico vai para a pasta de dados: o Windows guarda em cache o ícone de um .exe pelo caminho
    icon = path.join(DATA_DIR, 'slide-studio-weg.ico');
    try { fs.writeFileSync(icon, Buffer.from(SEA.getAsset('slide-studio-weg.ico'))); } catch (e) { icon = process.execPath; }
  }
  const cmd = '& {\n' + script.replace(/^\uFEFF/, '') + '\n} -Target ' + q(target) + ' -Arguments ' + q(args) + ' -Icon ' + q(icon) + ' -WorkDir ' + q(ROOT) + ' -WaitSeconds 90 -Match ' + q(PACKED ? String.raw`127\.0\.0\.1_/\.janela` : String.raw`127\.0\.0\.1_/($|\.(?!janela))`);
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(cmd, 'utf16le').toString('base64')],
    { windowsHide: true, timeout: 120000 }, (err, out, errOut) => console.log('Ícone da barra: ' + (String(out || '') + ' ' + String(errOut || (err && err.message) || '')).trim().replace(/\s+/g, ' ').slice(0, 600)));
}

/* ---------------- Janela do aplicativo (.exe) ---------------- */
// Abre o Edge em modo aplicativo com um perfil próprio; quando a janela fecha, o servidor encerra junto.
function openAppWindow(exitWhenClosed) {
  const url = 'http://' + HOST + ':' + PORT + '/';
  const edge = BROWSER && /msedge|chrome/i.test(BROWSER) ? BROWSER : null;
  if (!edge) {
    execFile('cmd', ['/c', 'start', '', url], { windowsHide: true }, () => {});
    return;
  }
  const proc = spawn(edge, ['--app=' + url, '--user-data-dir=' + path.join(DATA_DIR, 'janela'), '--no-first-run', '--no-default-browser-check',
    '--disable-features=msEdgeStartupBoost', '--window-size=1440,900'], { windowsHide: false, stdio: 'ignore', detached: !exitWhenClosed });
  if (exitWhenClosed) proc.on('exit', () => {
    // só encerra quando nenhuma janela do app fala com o servidor há mais de 75 s
    const t = setInterval(() => { if (Date.now() - lastRequestAt > 75000 && !runningJobId && !pdfBusy && !pptxBusy) { clearInterval(t); shutdown(); } }, 10000);
  });
  else proc.unref();
}

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log('Slide Studio WEG já está rodando em http://' + HOST + ':' + PORT);
    // segundo clique no .exe: só abre outra janela do app que já está rodando
    if (PACKED) { openAppWindow(false); setTimeout(() => process.exit(0), 1500); return; }
    process.exit(0);
  }
  console.error(e); process.exit(1);
});

server.listen(PORT, HOST, () => {
  loadInstalledFonts();
  console.log('Slide Studio WEG rodando em http://' + HOST + ':' + PORT);
  console.log(KIRO ? 'Kiro CLI: ' + KIRO : 'ATENÇÃO: Kiro CLI não encontrado — a geração com Kiro ficará indisponível.');
  console.log(BROWSER ? 'Exportação PDF: ' + BROWSER : 'ATENÇÃO: Edge/Chrome não encontrado — o PDF usará a janela de impressão.');
  console.log('Projetos: ' + PROJECTS_DIR);
  if (PACKED) openAppWindow(true);
  fixTaskbarIcon();
});

function shutdown() { for (const j of jobs.values()) if (j.status === 'running') killJob(j); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
