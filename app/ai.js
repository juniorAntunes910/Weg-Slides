/* ============================================================
   Slide Studio WEG — cliente dos provedores de IA (API direta)
   - Novas tentativas com backoff exponencial + jitter, respeitando Retry-After / retryDelay
   - Falhas transitórias (rede, 408, 429, 5xx) x permanentes (400, 401, 403, 404): só repete as transitórias
   - Prazo por tentativa (AbortSignal.timeout) somado ao cancelamento do usuário
   - Resposta cortada por limite de tokens: pede a continuação (até 2 vezes) em vez de descartar
   - Gemini: busca na web (google_search) com as fontes devolvidas; sem suporte ou sem cota para a busca, gera sem busca
   - Catálogo de modelos lido do provedor, para escolher e validar o modelo (só modelos que escrevem texto)
   - Gemini: modelo sobrecarregado (503) ou sem cota própria nesta chave: segue com outro modelo de texto do catálogo
============================================================ */
(function (global) {
  'use strict';

  const PROVIDERS = {
    gemini: { label: 'Google Gemini', help: 'https://aistudio.google.com/app/apikey', fallbackModel: 'gemini-2.5-flash', search: true },
    anthropic: { label: 'Anthropic (Claude)', help: 'https://console.anthropic.com/settings/keys', fallbackModel: 'claude-sonnet-5-5', search: false },
    openai: { label: 'OpenAI', help: 'https://platform.openai.com/api-keys', fallbackModel: 'gpt-4o', search: false }
  };
  const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504, 529]);
  const MAX_RETRY_WAIT = 60000; // espera maior que isso (ex.: cota diária) vira erro permanente
  // O catálogo do Gemini marca com generateContent modelos que não escrevem texto: voz (TTS), transcrição, imagem
  // (Nano Banana), vídeo (Omni), música, robótica e uso do computador. Com o pedido de slides eles falham
  // (o TTS responde 400 "Developer instruction is not enabled for this model"), então ficam fora do catálogo.
  const NON_TEXT = /(tts|transcri|image|nano.?banana|omni|veo|lyria|live|audio|embedding|robotics|computer.?use)/i;
  const isTextModel = id => !NON_TEXT.test(String(id || ''));
  const UNSTABLE = /(preview|exp|experimental|latest|tts|image|live|audio|embedding|thinking|lite|nano|8b)/i;

  class AiError extends Error {
    constructor(message, o) {
      super(message);
      this.name = 'AiError';
      o = o || {};
      this.status = o.status || 0; this.retryable = !!o.retryable; this.retryAfter = o.retryAfter || 0;
      this.quota = o.quota || [];
      this.kind = o.kind || (this.retryable ? 'transient' : 'permanent');
    }
  }

  const sleep = (ms, signal) => new Promise((res, rej) => {
    if (signal && signal.aborted) return rej(signal.reason || new DOMException('Cancelado', 'AbortError'));
    const t = setTimeout(res, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(signal.reason || new DOMException('Cancelado', 'AbortError')); }, { once: true });
  });

  function parseRetryAfter(res, body) {
    const h = res && res.headers && res.headers.get('retry-after');
    if (h) { const s = Number(h); if (!isNaN(s)) return s * 1000; const d = Date.parse(h); if (!isNaN(d)) return Math.max(0, d - Date.now()); }
    // Gemini: error.details[].retryDelay = "37s"
    const det = body && body.error && Array.isArray(body.error.details) ? body.error.details : [];
    for (const d of det) if (d && typeof d.retryDelay === 'string') { const m = /([\d.]+)s/.exec(d.retryDelay); if (m) return parseFloat(m[1]) * 1000; }
    return 0;
  }

  /** limites estourados num 429 do Gemini (error.details[].violations[].quotaId), ex.: GenerateRequestsPerMinutePerProjectPerModel-FreeTier */
  function quotaIds(body) {
    const det = body && body.error && Array.isArray(body.error.details) ? body.error.details : [];
    const out = [];
    det.forEach(d => (d && Array.isArray(d.violations) ? d.violations : []).forEach(v => { if (v && (v.quotaId || v.quotaMetric)) out.push(String(v.quotaId || v.quotaMetric)); }));
    return out;
  }

  function friendly(provider, status, body, fallbackText) {
    const raw = (body && body.error && (body.error.message || body.error.type)) || fallbackText || '';
    const name = PROVIDERS[provider].label;
    if (status === 401 || (status === 400 && /api key|API_KEY_INVALID|invalid x-api-key/i.test(raw))) return name + ': a chave de API é inválida. Confira a chave no painel Gerar.';
    // modelo de voz, imagem ou vídeo recebendo o pedido de slides
    if (status === 400 && /developer instruction is not enabled|thinking is not enabled|response modalit/i.test(raw)) return name + ': o modelo escolhido não escreve texto (é de voz, imagem ou vídeo). Escolha um modelo de texto no painel Gerar.';
    if (status === 403) return name + ': acesso negado para esta chave ou modelo (' + raw.slice(0, 160) + ').';
    if (status === 404) return name + ': o modelo não existe ou não está disponível para esta chave. Escolha outro modelo no painel Gerar.';
    if (status === 429 && provider === 'gemini') {
      // o texto do Gemini começa igual em todo 429 ("check your plan and billing details"); qual limite estourou vem nos detalhes
      const ids = quotaIds(body).join(' ');
      const lim = /limit: (\d+), model: ([\w.-]+)/.exec(raw);
      if (lim && lim[1] === '0') return name + ': o modelo ' + lim[2] + ' não está liberado na cota desta chave (limite 0). Escolha outro modelo no painel Gerar.';
      if (/per[ _]?day|daily/i.test(ids)) return name + ': acabou a cota diária' + (lim ? ' do modelo ' + lim[2] + ' (' + lim[1] + ' por dia)' : '') + '. Tente amanhã ou escolha outro modelo no painel Gerar.';
      if (/per[ _]?minute/i.test(ids)) return name + ': limite por minuto atingido' + (lim ? ' no modelo ' + lim[2] + ' (' + lim[1] + (/token/i.test(ids) ? ' tokens' : ' requisições') + ' por minuto)' : '') + '.';
      return name + ': limite de uso atingido. Veja o uso desta chave em https://ai.dev/rate-limit';
    }
    if (status === 429) return name + ': limite de uso atingido (' + raw.slice(0, 160) + ').';
    if (status >= 500) return name + ' está instável no momento (erro ' + status + ').';
    return name + ': ' + (raw || ('erro ' + status)).slice(0, 240);
  }

  async function readJson(res) { try { return await res.json(); } catch (e) { return null; } }

  /** uma tentativa HTTP, com prazo próprio; converte tudo em AiError classificado */
  async function attempt(provider, url, init, timeoutMs, userSignal) {
    // prazo próprio (setTimeout) somado ao cancelamento do usuário
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctl.abort(new DOMException('Tempo esgotado', 'TimeoutError')); }, timeoutMs);
    const onUser = () => ctl.abort(userSignal.reason || new DOMException('Cancelado', 'AbortError'));
    if (userSignal) { if (userSignal.aborted) onUser(); else userSignal.addEventListener('abort', onUser, { once: true }); }
    const signal = ctl.signal;
    let res, body;
    try {
      res = await fetch(url, Object.assign({}, init, { signal }));
      body = await readJson(res); // o prazo vale até o fim da leitura da resposta
      if (timedOut) throw new DOMException('Tempo esgotado', 'TimeoutError');
    } catch (e) {
      if (userSignal && userSignal.aborted) throw (e && e.name === 'AbortError') ? e : new DOMException('Cancelado', 'AbortError');
      const mins = timeoutMs >= 60000 ? Math.round(timeoutMs / 60000) + ' min' : Math.max(1, Math.round(timeoutMs / 1000)) + ' s';
      if (timedOut) throw new AiError(PROVIDERS[provider].label + ' não respondeu em ' + mins + '.', { retryable: true, kind: 'timeout' });
      throw new AiError('Sem conexão com ' + PROVIDERS[provider].label + ' (' + e.message + ').', { retryable: true, kind: 'network' });
    } finally {
      clearTimeout(timer);
      if (userSignal) userSignal.removeEventListener('abort', onUser);
    }
    if (res.ok) return body || {};
    const retryAfter = parseRetryAfter(res, body);
    const quota = res.status === 429 ? quotaIds(body) : [];
    let retryable = RETRYABLE.has(res.status);
    // 429 de cota diária/mensal, sem crédito (OpenAI) ou limite 0: esperar não resolve.
    // "billing" não serve de sinal: o Gemini escreve "check your plan and billing details" em todo 429, até no limite por minuto.
    if (res.status === 429 && (retryAfter > MAX_RETRY_WAIT || /per[ _]?(day|month)|daily|monthly|insufficient_quota|limit: 0,/i.test(JSON.stringify(body || '')))) retryable = false;
    throw new AiError(friendly(provider, res.status, body), { status: res.status, retryable, retryAfter, quota, kind: res.status === 429 ? 'rate' : undefined });
  }

  /** repete só falhas transitórias: backoff exponencial com jitter, respeitando Retry-After */
  async function withRetry(fn, o) {
    o = o || {};
    const attempts = o.attempts || 4, base = o.baseDelay || 1500, cap = o.maxDelay || 20000;
    let last;
    for (let i = 0; i < attempts; i++) {
      try { return await fn(i); }
      catch (e) {
        if (e.name === 'AbortError' || (o.signal && o.signal.aborted)) throw e;
        last = e;
        if (!(e instanceof AiError) || !e.retryable || i === attempts - 1) break;
        const backoff = Math.min(cap, base * Math.pow(2, i)) * (0.5 + Math.random() * 0.5);
        const wait = Math.min(MAX_RETRY_WAIT, Math.max(backoff, e.retryAfter || 0));
        if (o.onRetry) o.onRetry({ attempt: i + 2, of: attempts, waitMs: wait, error: e });
        await sleep(wait, o.signal);
      }
    }
    throw last;
  }

  /* ---------------- requisições por provedor ---------------- */
  function geminiBody(turns, system, maxTokens, search) {
    const b = {
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] })),
      generationConfig: { maxOutputTokens: maxTokens || 65536 } // sem temperature: os modelos novos recomendam o padrão
    };
    if (search) b.tools = [{ google_search: {} }];
    return b;
  }
  function parseGemini(d) {
    const c = (d.candidates || [])[0] || {};
    const text = ((c.content || {}).parts || []).map(p => p.text || '').join('');
    const fr = c.finishReason || '';
    const chunks = ((c.groundingMetadata || {}).groundingChunks || []).map(g => g.web).filter(Boolean);
    const blocked = !text && (fr === 'SAFETY' || fr === 'PROHIBITED_CONTENT' || (d.promptFeedback && d.promptFeedback.blockReason));
    return { text, finish: fr === 'MAX_TOKENS' ? 'length' : (fr === 'STOP' || !fr ? 'stop' : 'other'), finishRaw: fr, blocked, sources: chunks.map(w => ({ title: w.title || w.uri, url: w.uri })) };
  }

  async function once(provider, o, model, turns, search, timeoutMs) {
    const key = o.key;
    if (provider === 'anthropic') {
      const d = await attempt(provider, 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: o.maxTokens || 32000, system: o.system, messages: turns.map(t => ({ role: t.role, content: t.text })) })
      }, timeoutMs, o.signal);
      const text = (d.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('');
      return { text, finish: d.stop_reason === 'max_tokens' ? 'length' : 'stop', finishRaw: d.stop_reason, sources: [] };
    }
    if (provider === 'openai') {
      const d = await attempt(provider, 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: o.system }].concat(turns.map(t => ({ role: t.role, content: t.text }))) })
      }, timeoutMs, o.signal);
      const ch = (d.choices || [])[0] || {};
      return { text: (ch.message && ch.message.content) || '', finish: ch.finish_reason === 'length' ? 'length' : 'stop', finishRaw: ch.finish_reason, sources: [] };
    }
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    const d = await attempt(provider, url, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(geminiBody(turns, o.system, o.maxTokens, search))
    }, timeoutMs, o.signal);
    const r = parseGemini(d);
    if (r.blocked) throw new AiError('Google Gemini recusou gerar este conteúdo (filtro de segurança: ' + (r.finishRaw || 'bloqueado') + ').', { status: 200 });
    return r;
  }

  /**
   * Gera texto com novas tentativas, prazo e continuação de respostas cortadas.
   * o: { provider, key, model, fallbackModels, system, prompt, maxTokens, search, signal, timeoutMs, attempts, onProgress }
   * fallbackModels: modelos para seguir quando o escolhido estiver sobrecarregado (503) ou sem cota própria nesta chave
   * → { text, truncated, continuations, sources, usedSearch, attempts, model }
   */
  async function generate(o) {
    const provider = o.provider;
    if (!PROVIDERS[provider]) throw new AiError('Provedor desconhecido: ' + provider);
    if (!o.key) throw new AiError('Cadastre a chave de API no painel Gerar (motor API).');
    const timeoutMs = o.timeoutMs || 6 * 60000;
    const say = m => { if (o.onProgress) o.onProgress(m); };
    let search = !!(o.search && PROVIDERS[provider].search);
    let model = o.model;
    const backups = (o.fallbackModels || []).filter(m => m && m !== model);
    let usedAttempts = 0;
    const run = turns => withRetry(async () => {
      for (;;) {
        usedAttempts++;
        try { return await once(provider, o, model, turns, search, timeoutMs); }
        catch (e) {
          if (!(e instanceof AiError)) throw e;
          // 429 ligado à cota do próprio modelo (por dia, limite 0); os outros 429 do Gemini não trazem esse detalhe
          const modelQuota = e.quota.some(q => /generate/i.test(q) && !/search|grounding/i.test(q));
          // busca indisponível: segue sem busca, uma vez.
          // 400 = o modelo não aceita a ferramenta; 429 que não é limite do modelo = a cota da chave não inclui a busca
          // (no plano gratuito do Gemini a busca vem com limite 0, e o Google responde 429 sem detalhes)
          const searchRefused = (e.status === 400 && /tool|google_search|grounding|search/i.test(e.message)) || (e.status === 429 && !modelQuota);
          if (search && searchRefused) {
            search = false;
            say(e.status === 429 ? 'A cota desta chave não inclui a busca na web; gerando sem busca.' : 'A busca na web não está disponível para este modelo; gerando sem busca.');
            continue;
          }
          // modelo sobrecarregado ("high demand") ou sem cota própria: o próximo modelo de texto do catálogo responde na hora
          const busy = e.status === 503 || e.status === 529;
          if (backups.length && (busy || (e.status === 429 && modelQuota && !e.retryable))) {
            const prev = model;
            model = backups.shift();
            say('O modelo ' + prev + (busy ? ' está sobrecarregado no Google agora' : ' está sem cota nesta chave') + '; tentando com ' + model + '.');
            continue;
          }
          throw e;
        }
      }
    }, { attempts: o.attempts || 4, signal: o.signal, onRetry: r => say('Falha temporária (' + r.error.message + '). Nova tentativa ' + r.attempt + ' de ' + r.of + ' em ' + Math.round(r.waitMs / 1000) + ' s…') });

    const turns = [{ role: 'user', text: o.prompt }];
    let r = await run(turns);
    let text = r.text, sources = r.sources.slice(), continuations = 0;
    while (r.finish === 'length' && continuations < (o.maxContinuations == null ? 2 : o.maxContinuations)) {
      continuations++;
      say('A resposta passou do limite de tamanho; pedindo a continuação (' + continuations + ')…');
      r = await run([{ role: 'user', text: o.prompt }, { role: 'assistant', text },
        { role: 'user', text: 'Sua resposta foi cortada pelo limite de tamanho. Continue EXATAMENTE do ponto onde parou, sem repetir nada do que já escreveu, sem comentários e sem markdown.' }]);
      text += r.text;
      sources = sources.concat(r.sources);
    }
    const seen = new Set();
    sources = sources.filter(s => s.url && !seen.has(s.url) && seen.add(s.url));
    return { text, truncated: r.finish === 'length', continuations, sources, usedSearch: search, attempts: usedAttempts, model };
  }

  /* ---------------- catálogo de modelos ---------------- */
  async function listModels(provider, key, signal) {
    if (!key) throw new AiError('Informe a chave de API para listar os modelos.');
    if (provider === 'gemini') {
      const out = [];
      let token = '';
      for (let page = 0; page < 5; page++) {
        const d = await attempt(provider, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200' + (token ? '&pageToken=' + encodeURIComponent(token) : ''),
          { headers: { 'x-goog-api-key': key } }, 20000, signal);
        (d.models || []).forEach(m => {
          if ((m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name) && isTextModel(m.name + ' ' + (m.displayName || ''))) out.push({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name, outputTokens: m.outputTokenLimit || 0 });
        });
        token = d.nextPageToken; if (!token) break;
      }
      return out;
    }
    if (provider === 'anthropic') {
      const d = await attempt(provider, 'https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } }, 20000, signal);
      return (d.data || []).map(m => ({ id: m.id, label: m.display_name || m.id }));
    }
    const d = await attempt(provider, 'https://api.openai.com/v1/models', { headers: { authorization: 'Bearer ' + key } }, 20000, signal);
    return (d.data || []).map(m => ({ id: m.id, label: m.id })).filter(m => /^(gpt-|o\d|chatgpt-)/.test(m.id) && !/(audio|realtime|transcribe|tts|image|search|embedding|instruct)/.test(m.id));
  }

  const ver = id => { const m = /(\d+(?:\.\d+)?)/.exec(id); return m ? parseFloat(m[1]) : 0; };
  const byVersion = (a, b) => ver(b) - ver(a) || a.length - b.length;
  /** modelo recomendado a partir do catálogo (estável e rápido) */
  function pickDefault(provider, list) {
    const ids = (list || []).map(m => m.id).filter(isTextModel);
    const stable = ids.filter(id => !UNSTABLE.test(id));
    const best = (re, pool) => pool.filter(id => re.test(id)).sort(byVersion)[0];
    if (provider === 'gemini') return best(/^gemini-[\d.]+-flash$/, stable) || best(/flash/, stable) || best(/flash/, ids) || ids[0] || PROVIDERS.gemini.fallbackModel;
    if (provider === 'anthropic') return best(/sonnet/, stable) || stable[0] || ids[0] || PROVIDERS.anthropic.fallbackModel;
    return best(/^gpt-[\d.o]+$/, stable) || best(/^gpt-/, stable) || ids[0] || PROVIDERS.openai.fallbackModel;
  }
  /**
   * Gemini: modelos estáveis da linha Flash, do mais novo para o mais antigo, para quando o escolhido estiver
   * sobrecarregado ou sem cota (no plano gratuito cada modelo tem a sua cota e a sua fila). Outros provedores: nenhum.
   */
  function backupModels(provider, list, current, max) {
    if (provider !== 'gemini') return [];
    return (list || []).map(m => m.id)
      .filter(id => id !== current && isTextModel(id) && !UNSTABLE.test(id) && /^gemini-[\d.]+-flash$/.test(id))
      .sort(byVersion).slice(0, max || 3);
  }

  global.SSWAI = { PROVIDERS, AiError, generate, listModels, pickDefault, backupModels, isTextModel, withRetry, _internals: { attempt, parseRetryAfter, parseGemini } };
})(typeof window !== 'undefined' ? window : globalThis);
