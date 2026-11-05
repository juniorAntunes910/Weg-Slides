/* ============================================================
   Slide Studio WEG — aplicativo (orquestração)
============================================================ */
(function () {
  'use strict';
  const { $, $$, esc, el, icons, debounce, toast, modal, confirm, popover, closePop, menu, colorPicker, downloadBlob, downloadText, copyText, fileSafe, fmtDate, fmtClock, fmtSize } = UI;
  const P = SSWPalette, D = SSWDeck, IMP = SSWImport;
  const W = D.W, H = D.H;

  /* ======================= estado ======================= */
  const LS = 'ssw_config_v2';
  const DEFAULTS = {
    colors: { primary: '#00579D', secondary: '#FCA304', tertiary: '#9F7BBA' }, preset: 'weg', font: 'Inter',
    slideCount: 12, lang: 'pt-BR', tone: 'Corporativo',
    components: { progressbar: true, pagination: true, swipe: true, darkmode: false, counters: true, timeline: false, compareCards: true },
    logoType: 'weg', customLogoSvg: null, provider: 'gemini', engine: 'kiro', panel: 'gerar', panelOpen: true
  };
  const cfg = (() => {
    let c = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const saved = JSON.parse(localStorage.getItem(LS) || 'null') || JSON.parse(localStorage.getItem('ssw_config_v1') || 'null');
      if (saved) {
        c = Object.assign(c, saved);
        c.colors = Object.assign({}, DEFAULTS.colors, saved.colors || {});
        c.components = Object.assign({}, DEFAULTS.components, saved.components || {});
      }
    } catch (e) { /* config corrompida: usa padrão */ }
    return c;
  })();
  const saveCfg = () => { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { /* cheio */ } };

  const TOKEN = (document.querySelector('meta[name="ssw-token"]') || {}).content || '';
  const SERVED = /^https?:$/.test(location.protocol) && TOKEN && TOKEN !== '__SSW_' + 'TOKEN__';
  const server = { ok: false, kiro: false, pdf: false, checked: false };
  const attachments = [];
  const uploads = [];
  const project = { id: null, title: '', dirty: false, saving: false, pending: false };
  let view = 'home';
  let deckPalette = null;
  let iconReplaceId = null;
  let uid = 0;
  const nextUid = () => 'u' + (++uid);

  const MODEL_DEFAULTS = Object.fromEntries(Object.entries(SSWAI.PROVIDERS).map(([k, v]) => [k, v.fallbackModel]));
  const API_HELP = Object.fromEntries(Object.entries(SSWAI.PROVIDERS).map(([k, v]) => [k, v.help]));

  /* ======================= chaves de API ======================= */
  // Com o servidor local: a chave fica criptografada (DPAPI do Windows) em %LOCALAPPDATA%\SlideStudioWEG, fora do navegador.
  // Sem servidor (arquivo aberto direto): fica no localStorage deste navegador, como antes.
  const keys = { has: {}, encrypted: false, loaded: false };
  async function loadKeys() {
    if (!SERVED) { Object.keys(SSWAI.PROVIDERS).forEach(p => { keys.has[p] = !!localStorage.getItem('ssw_key_' + p); }); keys.loaded = true; return; }
    try {
      // migra chaves antigas do localStorage para o armazenamento criptografado
      for (const p of Object.keys(SSWAI.PROVIDERS)) {
        const old = (localStorage.getItem('ssw_key_' + p) || '').trim();
        if (old) { await api('/api/keys/' + p, { method: 'POST', body: { key: old } }); localStorage.removeItem('ssw_key_' + p); }
      }
      const r = await api('/api/keys');
      Object.assign(keys, { has: r.keys || {}, encrypted: !!r.encrypted, loaded: true });
    } catch (e) { keys.loaded = true; }
  }
  async function getApiKey(p) {
    if (!SERVED) return (localStorage.getItem('ssw_key_' + p) || '').trim();
    return ((await api('/api/keys/' + p)).key || '').trim();
  }
  async function saveApiKey(p, key) {
    key = (key || '').trim();
    if (!SERVED) { if (key) localStorage.setItem('ssw_key_' + p, key); else localStorage.removeItem('ssw_key_' + p); }
    else await api('/api/keys/' + p, { method: 'POST', body: { key } });
    keys.has[p] = !!key;
    delete modelCatalog[p];
  }
  function hasApiKey(p) { return !!keys.has[p]; }

  /* ---------------- modelos: catálogo do provedor + validação ---------------- */
  const modelCatalog = {};
  function currentModel(p) { return (localStorage.getItem('ssw_model_' + p) || '').trim(); }
  async function refreshModels(p, quiet) {
    const status = $('#modelStatus');
    if (!hasApiKey(p)) { if (p === cfg.provider) status.textContent = ''; return null; }
    try {
      if (!modelCatalog[p]) { if (p === cfg.provider) status.textContent = 'Consultando os modelos disponíveis…'; modelCatalog[p] = await SSWAI.listModels(p, await getApiKey(p)); }
      const list = modelCatalog[p];
      const rec = SSWAI.pickDefault(p, list);
      let cur = currentModel(p), replaced = '';
      // modelo de voz, imagem ou vídeo escolhido antes (o catálogo antigo listava esses modelos): não escreve slides
      if (cur && !SSWAI.isTextModel(cur)) { replaced = cur; cur = ''; }
      if (!cur) { cur = rec; localStorage.setItem('ssw_model_' + p, cur); }
      if (p !== cfg.provider) return list;
      $('#modelInput').value = cur;
      $('#modelList').innerHTML = list.map(m => '<option value="' + esc(m.id) + '">' + esc(m.label) + '</option>').join('');
      if (replaced) {
        status.innerHTML = '<span class="warn-text"><b>' + esc(replaced) + '</b> não escreve texto (é um modelo de voz, imagem ou vídeo). Trocado pelo recomendado, <b>' + esc(rec) + '</b>.</span>';
      } else if (list.length && !list.some(m => m.id === cur)) {
        status.innerHTML = '<span class="warn-text">O modelo <b>' + esc(cur) + '</b> não está disponível para esta chave.</span> <button class="link" id="useRec" type="button">Usar ' + esc(rec) + '</button>';
        $('#useRec').onclick = () => { localStorage.setItem('ssw_model_' + p, rec); refreshModels(p); };
      } else status.textContent = list.length + ' modelos disponíveis para esta chave' + (cur === rec ? ' · usando o recomendado' : ' · recomendado: ' + rec) + '.';
      return list;
    } catch (e) { if (!quiet && p === cfg.provider) status.innerHTML = '<span class="warn-text">' + esc(e.message) + '</span>'; return null; }
  }
  /** modelo a usar na geração: o escolhido se existir no catálogo; senão o recomendado */
  async function resolveModel(p) {
    const list = await refreshModels(p, true);
    const cur = currentModel(p);
    if (!list || !list.length) return (cur && SSWAI.isTextModel(cur)) ? cur : MODEL_DEFAULTS[p];
    return list.some(m => m.id === cur) ? cur : SSWAI.pickDefault(p, list);
  }
  /** modelos para seguir se o escolhido estiver sobrecarregado ou sem cota (só Gemini) */
  function backupModels(p, model) { return SSWAI.backupModels(p, modelCatalog[p], model); }

  /* ======================= servidor ======================= */
  async function api(path, opts) {
    opts = opts || {};
    if (!SERVED) throw new Error('Servidor local indisponível (abra pelo atalho Slide Studio WEG).');
    const headers = { 'x-ssw-token': TOKEN };
    if (opts.body) headers['content-type'] = 'application/json';
    const res = await fetch(path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined, signal: opts.signal });
    if (opts.raw) {
      if (!res.ok) { let msg = 'Erro ' + res.status; try { msg = (await res.json()).error || msg; } catch (e) { /* sem json */ } throw new Error(msg); }
      return res;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || ('Erro ' + res.status)); e.status = res.status; e.data = data; throw e; }
    return data;
  }
  async function checkServer() {
    if (!SERVED) { server.checked = true; if (!keys.loaded) { await loadKeys(); renderEngine(); } renderConn(); return; }
    try {
      const h = await api('/api/health');
      Object.assign(server, { ok: true, kiro: !!h.kiro, pdf: !!h.pdf, packed: !!h.packed, checked: true });
      if (!keys.loaded) { await loadKeys(); renderEngine(); }
      if (h.running && !gen.active) attachJob(h.running, 'Geração em andamento');
    } catch (e) { Object.assign(server, { ok: false, kiro: false, pdf: false, checked: true }); }
    renderConn();
    if (server.kiro && !kiroUsage.asked) refreshKiroUsage(); else renderKiroUsage();
    refreshProjects();
  }

  /* ---------------- créditos do Kiro: uso do plano (barra superior) ---------------- */
  const kiroUsage = { data: null, loading: false, asked: false };
  const fmtCredits = n => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // "0,85 crédito", "2,40 créditos" (abaixo de 2, singular)
  const creditsText = n => fmtCredits(n) + (Math.abs(Number(n) || 0) < 2 ? ' crédito' : ' créditos');
  const fmtNum = n => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  function fmtReset(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : (s || ''); }
  /** lê o uso do plano (o servidor guarda por 5 min; fresh força nova leitura, que leva uns 15 s) */
  async function refreshKiroUsage(fresh) {
    if (!SERVED || !server.kiro || kiroUsage.loading) return;
    kiroUsage.loading = true; kiroUsage.asked = true; renderKiroUsage();
    try { kiroUsage.data = await api('/api/kiro-usage' + (fresh ? '?fresh=1' : '')); }
    // 404: a janela tem a versão nova do app, mas o servidor que está rodando foi iniciado antes dela
    catch (e) { kiroUsage.data = { error: e.status === 404 ? 'O servidor local está numa versão anterior: reinicie o Slide Studio para ver os créditos.' : e.message }; }
    kiroUsage.loading = false; renderKiroUsage();
  }
  function renderKiroUsage() {
    const b = $('#kiroUsage'), d = kiroUsage.data;
    b.classList.toggle('hidden', !SERVED || !server.kiro || (!d && !kiroUsage.loading));
    b.classList.toggle('is-loading', kiroUsage.loading);
    const ok = !!(d && d.percent != null && (!d.error || d.stale));
    const pct = ok ? Math.max(0, Math.min(100, d.percent)) : 0;
    $('#kiroUsageFill').style.width = pct + '%';
    b.classList.toggle('is-high', ok && pct >= 80);
    b.classList.toggle('is-full', ok && pct >= 95);
    // falha na leitura do uso não quer dizer que o Kiro está fora: o texto convida a tentar de novo e o motivo fica no title
    $('#kiroUsageText').textContent = ok ? Math.round(pct) + '% usado' : kiroUsage.loading ? 'Kiro…' : 'Ver créditos';
    const lines = [];
    if (ok) {
      lines.push('Créditos do Kiro' + (d.plan ? ' · ' + d.plan : ''));
      if (d.limit) lines.push(fmtCredits(d.used) + ' de ' + fmtNum(d.limit) + ' créditos usados (' + fmtNum(d.percent) + '%)', 'Restam ' + fmtCredits(Math.max(0, d.limit - d.used)) + ' créditos' + (d.resetsOn ? ' · renova em ' + fmtReset(d.resetsOn) : ''));
      else lines.push(fmtNum(d.percent) + '% usado' + (d.resetsOn ? ' · renova em ' + fmtReset(d.resetsOn) : ''));
      if (d.bonus && d.bonus.limit) lines.push('Bônus: ' + fmtCredits(d.bonus.used) + ' de ' + fmtNum(d.bonus.limit) + ' usados' + (d.bonus.expiresInDays != null ? ' · expira em ' + d.bonus.expiresInDays + ' dias' : ''));
      if (d.stale) lines.push('Não foi possível atualizar agora: ' + d.error);
    } else if (d && d.error) lines.push(d.error);
    if (d && d.updatedAt) lines.push('Atualizado às ' + new Date(d.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + (ok ? ' · valor estimado pelo Kiro, que leva alguns minutos para somar os pedidos mais recentes' : ''));
    lines.push(kiroUsage.loading ? 'Consultando o Kiro…' : ok ? 'Clique para atualizar' : 'Clique para tentar de novo');
    b.title = lines.join('\n');
  }
  function renderConn() {
    const dot = $('#connDot'), txt = $('#connText'), info = $('#connInfo');
    const banner = $('#engineBanner');
    let msg, cls = 'info', icon = 'info';
    if (!SERVED) {
      dot.className = 'dot off'; txt.textContent = 'Modo arquivo'; info.title = 'Aberto direto do arquivo: sem Kiro, sem salvar projetos.';
      msg = 'Você abriu o arquivo direto. Para gerar com o Kiro, salvar projetos e exportar PDF em 1 clique, abra pelo atalho <b>Slide Studio WEG</b>.'; cls = 'warn'; icon = 'alert-triangle';
    } else if (!server.ok) {
      dot.className = 'dot off'; txt.textContent = 'Servidor offline'; info.title = 'O servidor local não respondeu.';
      msg = 'O servidor local não respondeu. Feche e abra o Slide Studio pelo atalho.'; cls = 'warn'; icon = 'alert-triangle';
    } else if (!server.kiro && server.packed) {
      dot.className = 'dot on'; txt.textContent = 'Pronto'; info.title = 'Gere com a sua chave de API ou copie o prompt para qualquer IA.';
      msg = 'Para gerar com IA, escolha o motor <b>API</b> e cadastre uma chave. O <b>Google Gemini</b> tem cota gratuita. Sem chave, use <b>Prompt</b> e cole em qualquer IA.'; cls = 'ai'; icon = 'key-round';
    } else if (!server.kiro) {
      dot.className = 'dot off'; txt.textContent = 'Kiro não encontrado'; info.title = 'Kiro CLI não encontrado neste computador.';
      msg = 'Kiro CLI não encontrado. Use o motor <b>API</b> ou <b>Prompt</b>.'; cls = 'warn'; icon = 'alert-triangle';
    } else {
      dot.className = 'dot on'; txt.textContent = 'Kiro conectado'; info.title = 'Kiro CLI pronto' + (server.pdf ? ' · PDF em 1 clique ativo' : '');
      msg = '<b>Kiro conectado.</b> Ele lê seus documentos, pesquisa na web e cria os slides. Leva de 2 a 10 minutos.'; cls = 'ai'; icon = 'bot';
    }
    banner.className = 'banner ' + cls;
    banner.innerHTML = '<i data-lucide="' + icon + '"></i><span>' + msg + '</span>';
    icons(banner);
    renderEngine();
  }

  /* ======================= editor ======================= */
  const editor = new SSWEditor({
    scroller: $('#stage'), pageHost: $('#pageHost'), filmstrip: $('#filmstrip'), filmstripAdd: $('#fsAdd'),
    fitPadding: { x: 120, y: 150 },
    onSelect: (info, quiet) => { if (quiet && UI.hasPop()) return; tb.render(info); },
    onRect: () => tb.updatePill(),
    onEditing: () => tb.render(editor.sel),
    onChange: () => markDirty(),
    onHistory: () => { $('#undoBtn').disabled = !editor.canUndo; $('#redoBtn').disabled = !editor.canRedo; },
    onSlides: () => renderPageHead(),
    onZoom: z => renderZoom(z),
    onContext: (x, y, hasSel) => tb.contextMenu(x, y, hasSel),
    onSlideMenu: (i, x, y) => tb.slideMenu(i, x, y),
    onAction: (action, id) => { if (action === 'replaceImage') replaceImage(id); else if (action === 'replaceIcon') replaceIcon(id); },
    onKey: m => handleKey(m),
    onPaste: m => handlePaste(m.kind === 'files' ? m.files : [], m.text || ''),
    onDrop: (dt, x, y) => handleCanvasDrop(dt, x, y),
    onFrameFocus: () => { closePop(); tb.hidePill(); },
    onToast: msg => toast(msg, { type: 'warn' }),
    onReady: () => { tb.updatePill(); loadDeckPalette(); }
  });
  const tb = SSWToolbar.create({
    editor, bar: $('#ctxbar'),
    docColors: () => docColors(),
    fonts: () => P.FONTS,
    loadFontPreviews,
    applyFont,
    openPanel,
    insertText: key => insertElement(D.ELEMENTS[key]()),
    onReplaceImage: id => replaceImage(id),
    onReplaceIcon: id => replaceIcon(id),
    onAiEdit: i => window.__SSW2 && window.__SSW2.aiEditSlide(i),
    onSlideBgImage: () => pickFile('#imgPicker', async files => {
      const r = await IMP.imageToDataUrl(files[0], 1920).catch(e => { toast(e.message, { type: 'err' }); return null; });
      if (r) editor.slideBackground({ 'background-image': 'url("' + r.dataUrl + '")', 'background-size': 'cover', 'background-position': 'center' });
    }),
    stageRect: () => $('#stage').getBoundingClientRect(),
    isHidden: () => view !== 'editor' || gen.active
  });
  document.addEventListener('ssw:popclose', () => { if (editor.deck) setTimeout(() => { if (!UI.hasPop()) tb.render(editor.sel); }, 0); });
  $('#stage').addEventListener('scroll', () => tb.updatePill());
  window.addEventListener('resize', () => tb.updatePill());
  $('#stage').addEventListener('mousedown', e => { if (e.target === $('#stage') || e.target === $('#stageInner')) editor.deselect(); });

  function docColors() {
    const src = deckPalette || P.colorsObject(cfg.colors);
    const pick = (k, s) => (src[k] && src[k][s]) || null;
    return [pick('primary', 900), pick('primary', 700), pick('primary', 500), pick('primary', 300), pick('primary', 100), pick('primary', 50),
      pick('secondary', 700), pick('secondary', 500), pick('secondary', 300), pick('secondary', 100),
      pick('tertiary', 700), pick('tertiary', 500), pick('tertiary', 200), pick('neutral', 900), pick('neutral', 600), pick('neutral', 300)]
      .filter(Boolean).map(c => String(c).toUpperCase());
  }
  async function loadDeckPalette() {
    const r = await editor.request('getConfig');
    const c = r && r.config && r.config.theme && r.config.theme.extend && r.config.theme.extend.colors;
    deckPalette = c && c.primary ? c : null;
  }
  let fontsLoaded = false;
  function loadFontPreviews() {
    if (fontsLoaded) return; fontsLoaded = true;
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?' + P.FONTS.map(f => 'family=' + f.replace(/ /g, '+') + ':wght@400;700').join('&') + '&display=swap';
    document.head.appendChild(l);
  }
  function applyFont(name) {
    if (!editor.deck) return;
    const link = editor.deck.ensureFont(name);
    if (link) editor.addHead(link);
    editor.setStyle({ 'font-family': "'" + name + "', sans-serif" }, 'Fonte');
  }
  function logoSvg() { return cfg.logoType === 'custom' && cfg.customLogoSvg ? cfg.customLogoSvg : P.WEG_LOGO_SVG; }
  function insertElement(html, at, label) {
    if (!editor.deck) { toast('Abra ou crie uma apresentação primeiro.', { type: 'warn' }); return null; }
    return editor.insertElement(html, { at, label });
  }

  /* ======================= visão / cabeçalho ======================= */
  let panelBeforeHome = null;
  function setView(v) {
    const wasHome = view === 'home';
    view = v;
    $('#home').classList.toggle('hidden', v !== 'home');
    // tela inicial limpa: sem painel lateral e sem os controles do editor no topo
    $('#app').classList.toggle('is-home', v === 'home');
    if (v === 'home' && panelBeforeHome === null) { panelBeforeHome = cfg.panelOpen; if (cfg.panelOpen) setPanelOpen(false); }
    else if (v !== 'home' && wasHome && panelBeforeHome !== null) { if (panelBeforeHome && !cfg.panelOpen) setPanelOpen(true); panelBeforeHome = null; }
    if (v === 'home') { renderHomeResume(); refreshProjects(); }
    if (v === 'editor') setTimeout(() => editor.fit(), 0);
    tb.updatePill();
  }
  function renderPageHead() {
    const n = editor.slideCount;
    $('#phNum').textContent = n ? editor.current + 1 : 0;
    $('#phLabel').textContent = 'de ' + n;
    $('#sbSlidesText').textContent = n + (n === 1 ? ' slide' : ' slides');
  }
  function renderZoom(z) {
    const pct = Math.round(z * 100);
    $('#zoomRange').value = Math.max(10, Math.min(200, pct));
    $('#zoomValue').textContent = pct + '%';
    $('#zoomFit').classList.toggle('is-on', editor.zoomMode === 'fit');
    tb.updatePill();
  }
  function enableDeckUi(on) {
    ['#presentBtn', '#pdfBtn', '#exportMenuBtn'].forEach(s => { $(s).disabled = !on; });
    $('#applyThemeBtn').disabled = !on;
  }

  /* ======================= painéis ======================= */
  const PANEL_TITLES = { gerar: 'Gerar com IA', layouts: 'Layouts', elementos: 'Elementos', texto: 'Texto', uploads: 'Uploads', estilo: 'Estilo da marca', projetos: 'Projetos' };
  const PANEL_ICONS = { gerar: 'sparkles', layouts: 'layout-template', elementos: 'shapes', texto: 'type', uploads: 'cloud-upload', estilo: 'palette', projetos: 'folder-open' };
  function openPanel(name, toggle) {
    if (toggle && cfg.panel === name && cfg.panelOpen) { setPanelOpen(false); return; }
    cfg.panel = name; saveCfg();
    $$('.rail-btn[data-panel]').forEach(b => b.classList.toggle('is-active', b.dataset.panel === name));
    $$('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== name));
    $('#panelTitle').innerHTML = '<i data-lucide="' + PANEL_ICONS[name] + '"></i>' + esc(PANEL_TITLES[name] || '');
    icons($('#panelTitle'));
    setPanelOpen(true);
    if (name === 'projetos') refreshProjects();
    if (name === 'elementos') renderIconGrid();
    if (name === 'layouts') renderLayouts();
  }
  function setPanelOpen(open) {
    cfg.panelOpen = open; saveCfg();
    $('#panel').classList.toggle('is-collapsed', !open);
    $('#panelOpen').classList.toggle('hidden', open);
    if (!open) $$('.rail-btn[data-panel]').forEach(b => b.classList.remove('is-active'));
    else $$('.rail-btn[data-panel]').forEach(b => b.classList.toggle('is-active', b.dataset.panel === cfg.panel));
  }

  /* ---------------- Gerar: formulário ---------------- */
  const DRAFT = 'ssw_draft_v2';
  function bindGenerateForm() {
    let d = {}; try { d = JSON.parse(localStorage.getItem(DRAFT) || '{}'); } catch (e) { d = {}; }
    $('#themeInput').value = d.theme || ''; $('#audienceInput').value = d.audience || ''; $('#contextInput').value = d.context || '';
    $('#homePrompt').value = d.theme || '';
    const saveDraft = debounce(() => localStorage.setItem(DRAFT, JSON.stringify({ theme: $('#themeInput').value, audience: $('#audienceInput').value, context: $('#contextInput').value })), 400);
    ['#themeInput', '#audienceInput', '#contextInput'].forEach(s => $(s).addEventListener('input', saveDraft));
    $('#themeInput').addEventListener('input', () => { $('#homePrompt').value = $('#themeInput').value; });
    $('#homePrompt').addEventListener('input', () => { $('#themeInput').value = $('#homePrompt').value; saveDraft(); });
    $('#homePrompt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); } });

    const sc = $('#slideCount');
    sc.value = cfg.slideCount; $('#slideCountLabel').textContent = cfg.slideCount; $('#homeSlidesText').textContent = cfg.slideCount + ' slides';
    sc.addEventListener('input', () => { cfg.slideCount = +sc.value; $('#slideCountLabel').textContent = sc.value; $('#homeSlidesText').textContent = sc.value + ' slides'; saveCfg(); });
    $('#langSelect').value = cfg.lang; $('#langSelect').onchange = e => { cfg.lang = e.target.value; saveCfg(); };
    $('#toneSelect').value = cfg.tone; $('#toneSelect').onchange = e => { cfg.tone = e.target.value; saveCfg(); };

    $$('#engineSeg button').forEach(b => b.onclick = () => { cfg.engine = b.dataset.engine; saveCfg(); renderEngine(); });
    $('#providerSelect').onchange = e => { cfg.provider = e.target.value; saveCfg(); renderEngine(); };
    $('#modelInput').onchange = e => { localStorage.setItem('ssw_model_' + cfg.provider, e.target.value.trim()); refreshModels(cfg.provider); };
    $('#apiKeyInput').onchange = async e => {
      const v = e.target.value.trim(); if (!v) return;
      try { await saveApiKey(cfg.provider, v); e.target.value = ''; toast(keys.encrypted ? 'Chave salva e criptografada neste computador.' : 'Chave salva.', { type: 'ok' }); }
      catch (err) { toast('Não foi possível salvar a chave: ' + err.message, { type: 'err' }); }
      renderEngine();
    };
    $('#keyRemove').onclick = async () => { await saveApiKey(cfg.provider, ''); toast('Chave removida.'); renderEngine(); };
    $('#generateBtn').onclick = generate;
    $('#homeGenerate').onclick = generate;
    $('#homeAttach').onclick = () => pickFile('#docPicker', addAttachments, IMP.ACCEPT_DOCS);
    $('#homeSlides').onclick = e => menu(e.currentTarget, [6, 8, 10, 12, 14, 16, 20].map(n => ({ label: n + ' slides', icon: n === cfg.slideCount ? 'check' : null, onClick: () => { cfg.slideCount = n; sc.value = n; sc.dispatchEvent(new Event('input')); } })));
    const sug = ['Eficiência energética com motores W22', 'Resultados do trimestre', 'Roadmap de digitalização da fábrica'];
    $('#suggestions').innerHTML = sug.map(s => '<button class="suggestion">' + esc(s) + '</button>').join('');
    $$('#suggestions .suggestion').forEach(b => b.onclick = () => { $('#homePrompt').value = b.textContent; $('#homePrompt').dispatchEvent(new Event('input')); $('#homePrompt').focus(); });
  }
  function renderEngine() {
    if (cfg.engine === 'kiro' && server.checked && !server.kiro) cfg.engine = hasApiKey(cfg.provider) ? 'api' : 'copy';
    $$('#engineSeg button').forEach(b => {
      b.classList.toggle('is-on', b.dataset.engine === cfg.engine);
      if (b.dataset.engine === 'kiro') { b.disabled = server.checked && !server.kiro; b.title = b.disabled ? 'Kiro indisponível' : 'Gerar com o Kiro CLI'; }
    });
    $('#apiBox').classList.toggle('hidden', cfg.engine !== 'api');
    $('#providerSelect').value = cfg.provider;
    $('#modelInput').value = currentModel(cfg.provider);
    $('#modelInput').placeholder = 'Recomendado (escolhido automaticamente)';
    $('#apiKeyInput').value = '';
    const has = hasApiKey(cfg.provider);
    $('#apiKeyInput').placeholder = has ? 'Chave salva · cole outra para trocar' : 'Cole a chave';
    $('#keyStatus').textContent = has ? (keys.encrypted ? 'Chave salva, criptografada neste computador.' : (SERVED ? 'Chave salva neste computador.' : 'Chave salva só neste navegador.')) : 'Nenhuma chave salva para este provedor.';
    $('#keyRemove').classList.toggle('hidden', !has);
    if (cfg.engine === 'api') refreshModels(cfg.provider, true); else $('#modelStatus').textContent = '';
    $('#apiHelpLink').href = API_HELP[cfg.provider];
    $('#engineHint').textContent = {
      kiro: 'O Kiro pesquisa na web e escreve os slides. Você acompanha cada etapa e pode cancelar.',
      api: cfg.provider === 'gemini' ? 'Gera direto pelo Google Gemini, com busca na web e fontes quando o modelo permitir.' : 'Gera direto pelo provedor escolhido, sem busca na web: use anexos para dados atuais.',
      copy: 'Copia o prompt completo para colar em qualquer IA. Depois cole o HTML de volta para editar aqui.'
    }[cfg.engine];
    $('#generateBtn').innerHTML = cfg.engine === 'copy' ? '<i data-lucide="clipboard-copy"></i>Montar e copiar prompt' : '<i data-lucide="sparkles"></i>Gerar apresentação';
    icons($('#generateBtn'));
  }

  /* ---------------- anexos (documentos para a IA) ---------------- */
  const TYPE_COLORS = { pdf: '#C80D0D', docx: '#00579D', docm: '#00579D', odt: '#00579D', rtf: '#00579D', pptx: '#EF8300', pptm: '#EF8300', odp: '#EF8300', xlsx: '#0B8A45', xlsm: '#0B8A45', ods: '#0B8A45', csv: '#0B8A45', html: '#6C4A81', htm: '#6C4A81' };
  async function addAttachments(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    openPanel('gerar');
    for (const file of list) {
      const kind = IMP.classify(file);
      if (kind === 'image') { await addUploads([file]); toast('Imagem enviada para Uploads: ' + file.name, { type: 'ok' }); continue; }
      const a = { id: nextUid(), name: file.name, size: file.size, ext: IMP.extOf(file.name), status: 'reading', progress: 0 };
      attachments.push(a); renderFiles();
      try {
        const r = await IMP.extractText(file, (i, n) => { a.progress = i / n; renderFileProgress(a); });
        Object.assign(a, { status: 'ok', content: r.content, chars: r.chars, info: r.info + ' · ' + Math.round(r.chars / 1000) + ' mil caracteres' + (r.truncated ? ' (truncado)' : '') });
      } catch (e) {
        Object.assign(a, { status: 'error', error: e.message });
      }
      renderFiles();
    }
  }
  function renderFiles() {
    const ul = $('#fileList');
    ul.innerHTML = attachments.map(a => '<li class="file" data-id="' + a.id + '">' +
      '<span class="fi" style="background:' + (TYPE_COLORS[a.ext] || '#64748B') + '">' + esc((a.ext || '?').slice(0, 4).toUpperCase()) + '</span>' +
      '<div class="fm"><div class="fn" title="' + esc(a.name) + '">' + esc(a.name) + '</div>' +
      (a.status === 'reading' ? '<div class="fs"><i data-lucide="loader-2" class="spin" style="width:11px;height:11px;vertical-align:-1px"></i> Lendo…</div><div class="bar"><i style="width:' + Math.round(a.progress * 100) + '%"></i></div>'
        : a.status === 'error' ? '<div class="fs err">' + esc(a.error) + '</div>'
          : '<div class="fs">' + esc(a.info || '') + '</div>') +
      '</div><button class="fx" title="Remover" aria-label="Remover"><i data-lucide="x"></i></button></li>').join('');
    $$('#fileList .fx').forEach(b => b.onclick = () => { const id = b.closest('.file').dataset.id; const i = attachments.findIndex(a => a.id === id); if (i >= 0) attachments.splice(i, 1); renderFiles(); });
    icons(ul);
    const ok = attachments.filter(a => a.status === 'ok').length;
    $('#attachBadge').textContent = ok; $('#attachBadge').classList.toggle('hidden', !ok);
    $('#clearFiles').classList.toggle('hidden', !attachments.length);
    $('#homeAttachText').textContent = ok ? ok + (ok === 1 ? ' documento' : ' documentos') : 'Anexar documentos';
  }
  function renderFileProgress(a) {
    const li = $('#fileList .file[data-id="' + a.id + '"] .bar i');
    if (li) li.style.width = Math.round(a.progress * 100) + '%';
  }

  /* ---------------- uploads (imagens) ---------------- */
  async function addUploads(files) {
    const added = [];
    for (const f of Array.from(files || [])) {
      if (IMP.classify(f) !== 'image') continue;
      try {
        const r = await IMP.imageToDataUrl(f, 1920);
        const u = { id: nextUid(), name: f.name, dataUrl: r.dataUrl, w: r.width, h: r.height };
        uploads.unshift(u); added.push(u);
      } catch (e) { toast(e.message, { type: 'err' }); }
    }
    renderUploads();
    return added;
  }
  function renderUploads() {
    const g = $('#uploadGrid');
    g.innerHTML = uploads.map(u => '<div class="up-item" draggable="true" data-id="' + u.id + '"><img src="' + u.dataUrl + '" alt=""><button title="Inserir ' + esc(u.name) + '" aria-label="Inserir imagem"></button></div>').join('');
    $('#uploadEmpty').classList.toggle('hidden', uploads.length > 0);
    $$('#uploadGrid .up-item').forEach(it => {
      const u = uploads.find(x => x.id === it.dataset.id);
      it.querySelector('button').onclick = () => insertElement(D.imageHtml(u.dataUrl, u.w, u.h), null, 'Inserir imagem');
      it.addEventListener('dragstart', e => dragPayload(e, { type: 'upload', id: u.id }));
    });
  }

  /* ---------------- arrastar do painel ---------------- */
  function dragPayload(e, data) {
    e.dataTransfer.setData('application/x-ssw', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'copy';
    if (editor.deck) editor.showDrop(true);
  }
  function payloadHtml(p) {
    if (p.type === 'element' && D.ELEMENTS[p.key]) return D.ELEMENTS[p.key]();
    if (p.type === 'icon') return D.iconHtml(p.name);
    if (p.type === 'upload') { const u = uploads.find(x => x.id === p.id); return u ? D.imageHtml(u.dataUrl, u.w, u.h) : null; }
    return null;
  }

  /* ---------------- elementos: formas e ícones ---------------- */
  const SHAPES = [
    ['rect', 'Retângulo', ''], ['rounded', 'Arredondado', 'border-radius:22%'], ['circle', 'Círculo', 'border-radius:50%'], ['pill', 'Pílula', 'border-radius:999px;height:30%'],
    ['line', 'Linha', 'height:5%'], ['triangle', 'Triângulo', 'clip-path:polygon(50% 0,100% 100%,0 100%)'], ['diamond', 'Losango', 'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)'],
    ['arrow', 'Seta', 'clip-path:polygon(0 30%,70% 30%,70% 0,100% 50%,70% 100%,70% 70%,0 70%)'], ['star', 'Estrela', 'clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)'],
    ['hexagon', 'Hexágono', 'clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)'], ['card', 'Card', 'background:#fff;border-radius:16%;box-shadow:0 4px 12px rgba(15,23,42,.18);border:1px solid #E2E8F0']
  ];
  function renderShapes() {
    const g = $('#shapeGrid');
    g.innerHTML = SHAPES.map(([k, label, css]) => '<button class="tile" draggable="true" data-k="' + k + '" title="' + label + '"><span class="shape" style="' + css + '"></span></button>').join('') +
      '<button class="tile" draggable="true" data-k="number" title="Número em destaque" style="font-weight:800;font-size:18px;color:var(--primary-700)">85%</button>';
    $$('#shapeGrid .tile').forEach(t => {
      t.onclick = () => insertElement(D.ELEMENTS[t.dataset.k](), null, 'Inserir forma');
      t.addEventListener('dragstart', e => dragPayload(e, { type: 'element', key: t.dataset.k }));
    });
  }
  const PT_ICONS = {
    motor: ['cog', 'settings', 'fan', 'gauge', 'zap'], energia: ['zap', 'battery', 'plug', 'sun', 'power'], eletric: ['zap', 'plug', 'cable', 'power'],
    grafic: ['chart', 'trending'], dado: ['database', 'chart', 'server'], dinheiro: ['dollar', 'banknote', 'coins', 'wallet', 'piggy'], custo: ['dollar', 'banknote', 'receipt', 'coins'],
    pessoa: ['user'], equipe: ['users', 'handshake'], cliente: ['user', 'handshake', 'building'], fabrica: ['factory', 'warehouse', 'building'], industria: ['factory', 'cog', 'hard-hat'],
    seta: ['arrow', 'chevron', 'move'], check: ['check', 'badge-check'], certo: ['check'], alerta: ['alert', 'siren', 'bell'], erro: ['x', 'ban', 'octagon'], meta: ['target', 'goal', 'flag'], alvo: ['target', 'crosshair'],
    tempo: ['clock', 'timer', 'hourglass', 'calendar'], relogio: ['clock', 'watch'], calendario: ['calendar'], seguranca: ['shield', 'lock', 'hard-hat'], sustent: ['leaf', 'sprout', 'recycle', 'tree'],
    verde: ['leaf', 'sprout', 'tree'], agua: ['droplet', 'waves'], sol: ['sun'], vento: ['wind'], solar: ['sun', 'panel'], carro: ['car'], caminhao: ['truck'], mundo: ['globe', 'earth', 'map'],
    global: ['globe', 'earth'], ideia: ['lightbulb', 'sparkles'], inova: ['lightbulb', 'rocket', 'sparkles', 'atom'], foguete: ['rocket'], estrela: ['star'], coracao: ['heart'], email: ['mail'],
    telefone: ['phone'], document: ['file', 'clipboard'], pasta: ['folder'], busca: ['search'], pesquisa: ['search', 'microscope'], config: ['settings', 'sliders', 'cog'], nuvem: ['cloud'],
    rede: ['network', 'wifi', 'share'], chip: ['cpu', 'microchip', 'circuit'], robo: ['bot'], ferrament: ['wrench', 'hammer', 'drill'], qualidade: ['award', 'medal', 'badge'], premio: ['award', 'trophy', 'medal'],
    cresc: ['trending-up', 'sprout', 'chart'], queda: ['trending-down'], mapa: ['map'], local: ['map-pin', 'navigation'], casa: ['house', 'home'], acordo: ['handshake'], educa: ['graduation', 'book', 'school'],
    saude: ['heart-pulse', 'stethoscope', 'activity'], compra: ['shopping', 'cart', 'store'], venda: ['store', 'tag', 'shopping'], logist: ['truck', 'package', 'warehouse'], caixa: ['package', 'box'],
    bateria: ['battery'], tomada: ['plug'], raio: ['zap'], engrenagem: ['cog', 'settings'], lampada: ['lightbulb'], automa: ['bot', 'cpu', 'workflow', 'cog'], digital: ['monitor', 'cpu', 'smartphone', 'cloud'],
    comunica: ['message', 'megaphone', 'mail'], apresenta: ['presentation', 'projector'], usuario: ['user'], cadeado: ['lock'], chave: ['key'], tendencia: ['trending'], processo: ['workflow', 'git', 'list-checks'],
    lista: ['list'], tarefa: ['list-checks', 'clipboard-check', 'square-check'], velocidade: ['gauge', 'rocket', 'zap'], eficien: ['gauge', 'zap', 'leaf', 'trending-up'], economia: ['piggy', 'trending-down', 'leaf', 'coins']
  };
  const FEATURED = ['zap', 'factory', 'cog', 'gauge', 'leaf', 'sun', 'wind', 'battery-charging', 'plug', 'cpu', 'bot', 'shield-check', 'target', 'trending-up', 'trending-down', 'chart-column',
    'chart-pie', 'chart-line', 'users', 'user', 'handshake', 'globe', 'map-pin', 'truck', 'package', 'warehouse', 'wrench', 'hard-hat', 'lightbulb', 'rocket', 'award', 'trophy', 'star', 'check-circle-2',
    'circle-alert', 'clock', 'calendar', 'dollar-sign', 'piggy-bank', 'coins', 'wallet', 'recycle', 'droplet', 'thermometer', 'flame', 'atom', 'microscope', 'graduation-cap', 'book-open', 'presentation',
    'megaphone', 'message-circle', 'mail', 'phone', 'monitor', 'smartphone', 'cloud', 'database', 'server', 'network', 'workflow', 'list-checks', 'layers', 'puzzle', 'sparkles', 'quote', 'flag', 'medal',
    'arrow-right', 'arrow-up-right', 'circle-check', 'badge-check'];
  let iconIndex = null;
  function buildIconIndex() {
    if (iconIndex) return iconIndex;
    const seen = new Set(), list = [];
    const toKebab = k => k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Za-z])(\d)/g, '$1-$2').toLowerCase();
    for (const [k, node] of Object.entries(lucide.icons || {})) {
      if (seen.has(node)) continue; seen.add(node);
      list.push({ key: k, name: toKebab(k), node });
    }
    iconIndex = list;
    $('#iconCount').textContent = '· ' + list.length;
    return list;
  }
  function searchIcons(q) {
    const list = buildIconIndex();
    const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    q = norm(q || '');
    if (!q) {
      const byName = new Map(list.map(i => [i.name, i]));
      const feat = FEATURED.map(n => byName.get(n)).filter(Boolean);
      return feat.concat(list.filter(i => !FEATURED.includes(i.name))).slice(0, 96);
    }
    const terms = new Set([q.replace(/\s+/g, '-')]);
    Object.keys(PT_ICONS).forEach(k => { if (q.startsWith(k) || k.startsWith(q) || q.includes(k)) PT_ICONS[k].forEach(t => terms.add(t)); });
    const res = list.filter(i => Array.from(terms).some(t => i.name.includes(t)));
    res.sort((a, b) => (a.name.startsWith(q) ? 0 : 1) - (b.name.startsWith(q) ? 0 : 1) || a.name.length - b.name.length);
    return res.slice(0, 144);
  }
  function renderIconGrid() {
    const g = $('#iconGrid');
    const res = searchIcons($('#iconSearch').value);
    g.innerHTML = '';
    if (!res.length) { g.innerHTML = '<p class="hint" style="grid-column:1/-1">Nenhum ícone encontrado. Tente em inglês (ex.: "factory", "chart").</p>'; return; }
    res.forEach(i => {
      const t = document.createElement('button');
      t.className = 'tile'; t.title = i.name; t.draggable = true;
      try { t.appendChild(lucide.createElement(i.node)); } catch (e) { return; }
      t.onclick = () => {
        if (iconReplaceId) { editor.setIcon(iconReplaceId, i.name); endIconReplace(); return; }
        insertElement(D.iconHtml(i.name), null, 'Inserir ícone');
      };
      t.addEventListener('dragstart', e => dragPayload(e, { type: 'icon', name: i.name }));
      g.appendChild(t);
    });
    $('#iconReplaceBanner').classList.toggle('hidden', !iconReplaceId);
  }
  function replaceIcon(id) { iconReplaceId = id; openPanel('elementos'); $('#iconSearch').focus(); }
  function endIconReplace() { iconReplaceId = null; $('#iconReplaceBanner').classList.add('hidden'); }
  function replaceImage(id) {
    pickFile('#replaceImgPicker', async files => {
      try { const r = await IMP.imageToDataUrl(files[0], 1920); editor.setImageSrc(id, r.dataUrl); }
      catch (e) { toast(e.message, { type: 'err' }); }
    });
  }

  /* ---------------- layouts ---------------- */
  let layoutsKey = null;
  function renderLayouts() {
    const key = JSON.stringify(cfg.colors) + cfg.font + cfg.logoType;
    const g = $('#layoutGrid');
    if (layoutsKey === key && g.children.length) return;
    layoutsKey = key;
    g.innerHTML = Object.entries(D.LAYOUTS).map(([k, L]) => '<button class="layout-card" data-k="' + k + '"><div class="lc-prev"><div class="th-host"></div></div><div class="lc-name"><i data-lucide="' + L.icon + '"></i>' + esc(L.label) + '</div></button>').join('');
    icons(g);
    const colors = P.colorsObject(cfg.colors);
    $$('#layoutGrid .layout-card').forEach(card => {
      card.onclick = () => {
        if (!editor.deck) { newBlank(card.dataset.k); return; }
        editor.addSlide(card.dataset.k, { logoSvg: logoSvg(), title: project.title || 'Título da apresentação' });
      };
      const host = card.querySelector('.th-host');
      const L = D.LAYOUTS[card.dataset.k];
      const html = D.blankDeckHtml({ title: 'Prévia', colors, font: cfg.font, logoSvg: logoSvg(), slidesHtml: [L.html({ logoSvg: logoSvg(), title: 'Título da apresentação' })] });
      requestAnimationFrame(() => {
        host.style.setProperty('--th-scale', (host.clientWidth || 150) / W);
        SSWThumb.loadThumbFrame(host, D.thumbHtml(new D.Deck(html), 0));
      });
    });
  }

  /* ---------------- estilo ---------------- */
  function renderStyle() {
    $('#presetGrid').innerHTML = Object.entries(P.PRESETS).map(([k, p]) => '<button class="preset' + (cfg.preset === k ? ' is-on' : '') + '" data-k="' + k + '"><span class="sw"><i style="background:' + p.primary + '"></i><i style="background:' + p.secondary + '"></i><i style="background:' + p.tertiary + '"></i></span>' + esc(p.label) + '</button>').join('');
    $$('#presetGrid .preset').forEach(b => b.onclick = () => { const p = P.PRESETS[b.dataset.k]; cfg.colors = { primary: p.primary, secondary: p.secondary, tertiary: p.tertiary }; cfg.preset = b.dataset.k; saveCfg(); renderStyle(); });
    const rows = [['primary', 'Primária', 'marca, títulos e ações'], ['secondary', 'Secundária', 'destaques e números'], ['tertiary', 'Terciária', 'apoio e gráficos']];
    $('#colorRows').innerHTML = rows.map(([k, label, sub]) => {
      const sc = P.genScale(cfg.colors[k]);
      return '<div class="color-row"><span class="cbtn"><i style="background:' + cfg.colors[k] + '"></i><input type="color" data-k="' + k + '" value="' + cfg.colors[k].toLowerCase() + '"></span>' +
        '<div class="lbl">' + label + ' <small>' + sub + ' · ' + cfg.colors[k].toUpperCase() + '</small><div class="scale">' + Object.values(sc).map(c => '<i style="background:' + c + '"></i>').join('') + '</div></div></div>';
    }).join('');
    $$('#colorRows input[type=color]').forEach(inp => {
      inp.addEventListener('input', () => { inp.previousElementSibling.style.background = inp.value; });
      inp.addEventListener('change', () => { cfg.colors[inp.dataset.k] = inp.value.toUpperCase(); cfg.preset = null; saveCfg(); renderStyle(); });
    });
    const fs = $('#fontSelect');
    if (!fs.options.length) fs.innerHTML = P.FONTS.map(f => '<option>' + esc(f) + '</option>').join('');
    fs.value = cfg.font;
    $('#fontPreview').style.fontFamily = "'" + cfg.font + "', sans-serif";
    $('#fontPreview').firstElementChild.style.color = cfg.colors.primary;
    $$('#logoSeg button').forEach(b => b.classList.toggle('is-on', b.dataset.logo === cfg.logoType));
    $('#logoUpload').classList.toggle('hidden', cfg.logoType !== 'custom');
    $('#logoStatus').textContent = cfg.customLogoSvg ? 'Logo próprio carregado.' : 'Nenhum SVG carregado: será usado o logo WEG.';
    $$('.comp').forEach(c => { c.checked = !!cfg.components[c.value]; });
    layoutsKey = null;
  }
  function bindStyle() {
    $('#fontSelect').onchange = e => { cfg.font = e.target.value; saveCfg(); loadFontPreviews(); renderStyle(); };
    $$('#logoSeg button').forEach(b => b.onclick = () => { cfg.logoType = b.dataset.logo; saveCfg(); renderStyle(); });
    $('#logoPick').onclick = () => pickFile('#logoPicker', async files => {
      const f = files[0];
      if (f.size > 50 * 1024) { toast('O SVG passa de 50 KB.', { type: 'err' }); return; }
      let txt = await f.text();
      if (!/<svg[\s>]/i.test(txt)) { toast('O arquivo não parece um SVG válido.', { type: 'err' }); return; }
      txt = txt.replace(/<\?xml[^>]*>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/(href|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '');
      cfg.customLogoSvg = txt.trim(); cfg.logoType = 'custom'; saveCfg(); renderStyle();
      toast('Logo carregado.', { type: 'ok' });
    });
    $$('.comp').forEach(c => c.onchange = () => { cfg.components[c.value] = c.checked; saveCfg(); });
    $('#applyThemeBtn').onclick = async () => {
      if (!editor.deck) return;
      const ok = await confirm('A paleta (primária, secundária, terciária) e a fonte "' + cfg.font + '" serão aplicadas à apresentação aberta. Elementos com cor própria mantêm a cor. Dá para desfazer com Ctrl+Z.', { title: 'Aplicar estilo ao design', ok: 'Aplicar' });
      if (!ok) return;
      await editor.applyTheme({ colors: P.colorsObject(cfg.colors), font: cfg.font });
      deckPalette = P.colorsObject(cfg.colors);
      toast('Estilo aplicado.', { type: 'ok' });
    };
  }

  /* ---------------- seletores de arquivo ---------------- */
  function pickFile(sel, cb, accept) {
    const inp = $(sel);
    if (accept) inp.setAttribute('accept', accept);
    inp.value = '';
    inp.onchange = () => { if (inp.files && inp.files.length) cb(Array.from(inp.files)); };
    inp.click();
  }
  function bindDropzone(zone, onFiles, accept) {
    zone.addEventListener('click', () => pickFile(zone.id === 'imgDrop' ? '#imgPicker' : '#docPicker', onFiles, accept));
    zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zone.click(); } });
    zone.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('is-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('is-over'); onFiles(Array.from(e.dataTransfer.files || [])); });
  }

  /* --- continua na parte 2 --- */
  window.__SSW = {
    cfg, server, attachments, uploads, project, editor, tb, api, SERVED,
    setView, renderPageHead, enableDeckUi, openPanel, setPanelOpen, bindGenerateForm, renderEngine, renderConn, checkServer,
    addAttachments, renderFiles, addUploads, renderUploads, renderShapes, renderIconGrid, endIconReplace, renderLayouts, renderStyle, bindStyle,
    pickFile, bindDropzone, payloadHtml, insertElement, logoSvg, docColors, nextUid, MODEL_DEFAULTS,
    keys, loadKeys, getApiKey, hasApiKey, resolveModel, backupModels, saveCfg, refreshKiroUsage, fmtCredits, creditsText,
    get view() { return view; }, set deckPalette(v) { deckPalette = v; }
  };
  // funções definidas na parte 2 (hoisting via window.__SSW2)
  function markDirty() { window.__SSW2 && window.__SSW2.markDirty(); }
  function handleKey(m) { window.__SSW2 && window.__SSW2.handleKey(m); }
  function handlePaste(files, text) { window.__SSW2 && window.__SSW2.handlePaste(files, text); }
  function handleCanvasDrop(dt, x, y) { window.__SSW2 && window.__SSW2.handleCanvasDrop(dt, x, y); }
  function refreshProjects() { window.__SSW2 && window.__SSW2.refreshProjects(); }
  function renderHomeResume() { window.__SSW2 && window.__SSW2.renderHomeResume(); }
  function generate() { window.__SSW2 && window.__SSW2.generate(); }
  function attachJob(id, title) { window.__SSW2 && window.__SSW2.attachJob(id, title); }
  function newBlank(layout) { window.__SSW2 && window.__SSW2.newBlank(layout); }
  const gen = { get active() { return !!(window.__SSW2 && window.__SSW2.genActive()); } };
})();
