/* ============================================================
   Slide Studio WEG — gera o executável para outros PCs (Windows)
   Uso: node ferramentas/gerar-exe.js
   Saída: dist/Slide Studio WEG.exe e dist/Slide Studio WEG.zip (exe + LEIA-ME)
   Como funciona: Node SEA (single executable application). O servidor e o gerador de
   PowerPoint viram um único script; a interface (index.html + app/) vai embutida como assets.
============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const WORK = path.join(os.tmpdir(), 'ssw-exe-build');
const TOOLS = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'SlideStudioWEG-build');
const EXE = path.join(DIST, 'Slide Studio WEG.exe');
const VERSION = '2.1.0';
const step = m => console.log('› ' + m);

(async () => {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(DIST, { recursive: true });

  step('Ferramentas de build (postject, rcedit)');
  if (!fs.existsSync(path.join(TOOLS, 'node_modules', 'postject')) || !fs.existsSync(path.join(TOOLS, 'node_modules', 'rcedit'))) {
    fs.mkdirSync(TOOLS, { recursive: true });
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--prefix', TOOLS, '--no-audit', '--no-fund', 'postject@1.0.0-alpha.6', 'rcedit@5'], { stdio: 'inherit', shell: true });
  }

  step('Juntando servidor + gerador de PowerPoint em um script');
  const pptx = fs.readFileSync(path.join(ROOT, 'pptx.js'), 'utf8');
  let server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  if (!server.includes("require('./pptx')")) throw new Error("server.js não tem require('./pptx')");
  server = server.replace("require('./pptx')", '__ssw_pptx');
  const main = "'use strict';\nconst __ssw_pptx = (function () { const module = { exports: {} }; const exports = module.exports;\n" + pptx.replace(/^'use strict';/m, '') + "\nreturn module.exports; })();\n" + server.replace(/^'use strict';/m, '');
  fs.writeFileSync(path.join(WORK, 'main.js'), main, 'utf8');

  step('Embutindo a interface');
  const assets = { 'index.html': path.join(ROOT, 'index.html'), 'ferramentas/icone-barra.ps1': path.join(ROOT, 'ferramentas', 'icone-barra.ps1'), 'slide-studio-weg.ico': path.join(ROOT, 'slide-studio-weg.ico') };
  (function walk(dir, rel) {
    for (const n of fs.readdirSync(dir)) {
      if (n.startsWith('.')) continue;
      const full = path.join(dir, n), r = rel + '/' + n;
      if (fs.statSync(full).isDirectory()) walk(full, r); else assets[r] = full;
    }
  })(path.join(ROOT, 'app'), 'app');
  console.log('  ' + Object.keys(assets).length + ' arquivos');
  fs.writeFileSync(path.join(WORK, 'sea-config.json'), JSON.stringify({
    main: path.join(WORK, 'main.js'), output: path.join(WORK, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false, assets
  }, null, 2));
  execFileSync(process.execPath, ['--experimental-sea-config', path.join(WORK, 'sea-config.json')], { stdio: 'inherit' });

  step('Criando o executável');
  try { fs.rmSync(EXE, { force: true }); } catch (e) { throw new Error('Feche o Slide Studio WEG.exe antes de gerar de novo.'); }
  fs.copyFileSync(process.execPath, EXE);
  // ícone e nome do programa (antes de injetar o app: o rcedit reescreve os recursos do .exe)
  const strings = { FileDescription: 'Slide Studio WEG', ProductName: 'Slide Studio WEG', CompanyName: 'Slide Studio WEG', OriginalFilename: 'Slide Studio WEG.exe', InternalName: 'SlideStudioWEG', LegalCopyright: ' ' };
  const rcArgs = [EXE, '--set-icon', path.join(ROOT, 'slide-studio-weg.ico'), '--set-file-version', VERSION, '--set-product-version', VERSION];
  Object.entries(strings).forEach(([k, v]) => rcArgs.push('--set-version-string', k, v));
  execFileSync(path.join(TOOLS, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe'), rcArgs, { stdio: 'inherit' });
  const { inject } = require(path.join(TOOLS, 'node_modules', 'postject'));
  await inject(EXE, 'NODE_SEA_BLOB', fs.readFileSync(path.join(WORK, 'sea-prep.blob')), { sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', overwrite: true });

  step('Marcando como aplicativo de janela (sem console)');
  const buf = fs.readFileSync(EXE);
  const pe = buf.readUInt32LE(0x3C);
  if (buf.readUInt32LE(pe) !== 0x00004550) throw new Error('Cabeçalho PE inválido');
  const subsystemAt = pe + 24 + 68;
  buf.writeUInt16LE(2, subsystemAt); // 2 = IMAGE_SUBSYSTEM_WINDOWS_GUI
  fs.writeFileSync(EXE, buf);

  step('Pacote para enviar (zip)');
  const readme = path.join(WORK, 'LEIA-ME.txt');
  fs.writeFileSync(readme, [
    'SLIDE STUDIO WEG',
    '================',
    '',
    'COMO ABRIR',
    '1. Extraia o "Slide Studio WEG.exe" para qualquer pasta (ex.: Área de Trabalho).',
    '2. Dê dois cliques nele. O app abre em uma janela própria.',
    '',
    'Na primeira vez o Windows pode mostrar "O Windows protegeu o computador".',
    'Clique em "Mais informações" e depois em "Executar assim mesmo".',
    '(Isso acontece com programas que não têm assinatura digital paga.)',
    '',
    'GERAR COM IA',
    'No painel Gerar, escolha o motor "API" e cadastre uma chave.',
    'O Google Gemini tem cota gratuita: https://aistudio.google.com/app/apikey',
    'Sem chave, use o motor "Prompt": o app monta o pedido para você colar em qualquer IA.',
    '',
    'ONDE FICAM AS APRESENTAÇÕES',
    'Na pasta Documentos\\Slide Studio WEG.',
    '',
    'REQUISITOS',
    'Windows 10 ou 11 com o Microsoft Edge (já vem no Windows) e internet.',
    ''
  ].join('\r\n'), 'utf8');
  const zipPath = path.join(DIST, 'Slide Studio WEG.zip');
  fs.rmSync(zipPath, { force: true });
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "Compress-Archive -LiteralPath @('" + EXE.replace(/'/g, "''") + "','" + readme.replace(/'/g, "''") + "') -DestinationPath '" + zipPath.replace(/'/g, "''") + "' -CompressionLevel Optimal"], { stdio: 'inherit' });

  const mb = f => (fs.statSync(f).size / 1048576).toFixed(1) + ' MB';
  console.log('\nPronto:\n  ' + EXE + ' (' + mb(EXE) + ')\n  ' + zipPath + ' (' + mb(zipPath) + ')');
})().catch(e => { console.error('\nFALHOU: ' + (e && e.stack || e)); process.exit(1); });
