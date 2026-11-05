/* ============================================================
   Slide Studio WEG — fluxos: projetos, geração, importação, exportação, atalhos
============================================================ */
(function () {
  'use strict';
  const S = window.__SSW;
  const { $, $$, esc, el, icons, debounce, toast, modal, confirm, closePop, menu, downloadBlob, downloadText, copyText, fileSafe, fmtDate, fmtClock, fmtSize } = UI;
  const P = SSWPalette, D = SSWDeck, IMP = SSWImport;
  const { cfg, server, attachments, uploads, project, editor, tb, api, SERVED } = S;
  const W = D.W, H = D.H;

  /* ======================= salvar ======================= */
  function markDirty() { if (!editor.deck) return; project.dirty = true; renderSave(); scheduleSave(); }
  const scheduleSave = debounce(() => save(), 1500);
  async function save(force) {
    if (!editor.deck) return;
    if (!SERVED || !server.ok) { renderSave(); return false; }
    if (project.saving) { project.pending = true; return; }
    if (!project.dirty && !force && project.id) return true;
    project.saving = true; renderSave();
    const v = editor.version;
    const body = { html: editor.cleanHtml(), title: project.title || 'Apresentação' };
    try {
      if (!project.id) { const r = await api('/api/projects-new', { method: 'POST', body }); project.id = r.id; }
      else await api('/api/projects/' + project.id + '/save', { method: 'POST', body });
      if (editor.version === v) project.dirty = false;
      localStorage.setItem('ssw_last', project.id);
      return true;
    } catch (e) {
      toast('Não foi possível salvar: ' + e.message, { type: 'err' });
      return false;
    } finally {
      project.saving = false; renderSave();
      if (project.pending || project.dirty) { project.pending = false; if (project.dirty) scheduleSave(); }
    }
  }
  function renderSave() {
    const pill = $('#savePill');
    let icon = 'cloud', text = 'Pronto', dirty = false;
    if (!editor.deck) { icon = 'cloud'; text = ''; }
    else if (!SERVED || !server.ok) { icon = 'hard-drive-download'; text = project.dirty ? 'Não salvo — baixe o HTML' : 'Somente neste navegador'; dirty = project.dirty; }
    else if (project.saving) { icon = 'loader-2'; text = 'Salvando…'; }
    else if (project.dirty) { icon = 'cloud-upload'; text = 'Alterações pendentes'; dirty = true; }
    else { icon = 'cloud-check'; text = 'Salvo'; }
    pill.classList.toggle('is-dirty', dirty);
    pill.innerHTML = text ? '<i data-lucide="' + icon + '"' + (icon === 'loader-2' ? ' class="spin"' : '') + '></i><span>' + esc(text) + '</span>' : '';
    icons(pill);
  }
  window.addEventListener('beforeunload', e => { if (project.dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ======================= abrir / criar ======================= */
  function openDeck(html, meta) {
    meta = meta || {};
    closePop();
    editor.load(html, { current: 0 });
    project.id = meta.id || null;
    project.title = meta.title || editor.deck.title();
    project.dirty = !meta.id;
    $('#titleInput').value = project.title;
    S.deckPalette = null;
    S.enableDeckUi(true);
    S.setView('editor');
    S.renderPageHead();
    renderSave();
    if (!project.id) save(true);
    else localStorage.setItem('ssw_last', project.id);
  }
  function newBlank(layout) {
    const title = 'Apresentação sem título';
    const L = D.LAYOUTS[layout] || D.LAYOUTS.title;
    const html = D.blankDeckHtml({ title, colors: P.colorsObject(cfg.colors), font: cfg.font, logoSvg: S.logoSvg(), slidesHtml: [L.html({ logoSvg: S.logoSvg(), title: 'Título da apresentação' })] });
    openDeck(html, { title });
    S.openPanel('layouts');
  }
  async function openProject(id) {
    if (project.dirty && project.id !== id) await save();
    const t = toast('Abrindo projeto…', { type: 'busy', duration: 0 });
    try {
      const r = await api('/api/projects/' + id);
      if (!r.html) throw new Error('Este projeto ainda não tem apresentação gerada.');
      openDeck(r.html, { id, title: (r.meta && r.meta.title) || id });
    } catch (e) { toast(e.message, { type: 'err' }); }
    finally { t.close(); }
  }
  async function deleteProject(id, title) {
    const ok = await confirm('"' + title + '" vai para a lixeira (pasta projetos/_lixeira). Dá para recuperar copiando a pasta de volta.', { title: 'Excluir projeto', ok: 'Excluir', danger: true });
    if (!ok) return;
    try {
      await api('/api/projects/' + id + '/delete', { method: 'POST' });
      if (project.id === id) { project.id = null; project.dirty = true; renderSave(); }
      toast('Projeto movido para a lixeira.', { type: 'ok' });
      refreshProjects();
    } catch (e) { toast(e.message, { type: 'err' }); }
  }

  /* ======================= projetos (lista) ======================= */
  let projects = [];
  const thumbObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { thumbObserver.unobserve(en.target); loadProjectThumb(en.target); } });
  }, { rootMargin: '200px' }) : null;
  const thumbCache = new Map();
  async function loadProjectThumb(host) {
    const id = host.dataset.pid;
    try {
      let html = thumbCache.get(id);
      if (!html) {
        const r = await api('/api/projects/' + id);
        if (!r.html) return;
        html = D.thumbHtml(new D.Deck(r.html), 0);
        thumbCache.set(id, html);
      }
      host.style.setProperty('--th-scale', (host.clientWidth || 220) / W);
      await SSWThumb.loadThumbFrame(host, html);
      const ph = host.parentElement.querySelector('.pv-ph'); if (ph) ph.remove();
    } catch (e) { /* sem miniatura */ }
  }
  async function refreshProjects() {
    if (!SERVED || !server.ok) { renderProjects(); return; }
    try { projects = (await api('/api/projects')).projects || []; } catch (e) { projects = []; }
    renderProjects();
  }
  function projectCard(p) {
    const n = p.slides ? p.slides + ' slides' : (p.status === 'running' ? 'gerando…' : p.status === 'error' ? 'falhou' : '');
    const cr = p.credits > 0 ? '<span>·</span><span title="Créditos do Kiro gastos com esta apresentação (geração e edições de slide)">' + esc(S.creditsText(p.credits)) + '</span>' : '';
    return '<div class="proj" data-id="' + esc(p.id) + '" role="button" tabindex="0"><div class="pv"><div class="pv-ph"><i data-lucide="presentation"></i></div>' + (p.hasHtml ? '<div class="th-host" data-pid="' + esc(p.id) + '"></div>' : '') + '</div>' +
      '<div class="pm"><div class="pt" title="' + esc(p.title) + '">' + esc(p.title) + '</div><div class="pd"><span>' + esc(fmtDate(p.updatedAt || p.createdAt)) + '</span>' + (n ? '<span>·</span><span>' + esc(n) + '</span>' : '') + cr + '</div></div>' +
      '<button class="pdel" title="Excluir" aria-label="Excluir projeto"><i data-lucide="trash-2"></i></button></div>';
  }
  // Assinatura do que afeta os cartões: enquanto não muda, não reconstruímos a grade.
  // Reconstruir via innerHTML destrói os .th-host e faz o IntersectionObserver recarregar as miniaturas
  // (iframes) — era isso que fazia os projetos recentes "piscarem" a cada refreshProjects (health, setView, openPanel).
  let lastProjectsSig = null;
  function projectsSignature() {
    const state = (!SERVED ? 'file' : !server.ok ? 'off' : 'ok');
    const usable = projects.filter(p => p.hasHtml || p.status === 'running');
    return state + '|' + usable.map(p => [p.id, p.title, p.status, p.slides, p.credits, p.hasHtml ? 1 : 0, p.updatedAt || p.createdAt].join('~')).join('||');
  }
  function renderProjects(force) {
    const sig = projectsSignature();
    if (!force && sig === lastProjectsSig) return; // nada mudou: preserva as miniaturas já carregadas
    lastProjectsSig = sig;
    const usable = projects.filter(p => p.hasHtml || p.status === 'running');
    const empty = !SERVED ? '<div class="empty-note">Abra pelo atalho <b>Slide Studio WEG</b> para salvar e listar projetos.</div>'
      : '<div class="empty-note">Nenhum projeto ainda. Gere com a IA ou crie uma apresentação em branco.</div>';
    $('#recentGrid').innerHTML = usable.length ? usable.slice(0, 8).map(projectCard).join('') : empty;
    $('#panelProjects').innerHTML = usable.length ? usable.map(projectCard).join('') : empty;
    [$('#recentGrid'), $('#panelProjects')].forEach(root => {
      icons(root);
      $$('.proj', root).forEach(card => {
        const p = projects.find(x => x.id === card.dataset.id);
        const open = () => { if (p.hasHtml) openProject(p.id); else toast('Essa apresentação ainda está sendo gerada.', { type: 'warn' }); };
        card.addEventListener('click', e => { if (!e.target.closest('.pdel')) open(); });
        card.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
        card.querySelector('.pdel').onclick = e => { e.stopPropagation(); deleteProject(p.id, p.title); };
        const host = card.querySelector('.th-host');
        if (host) { if (thumbObserver) thumbObserver.observe(host); else loadProjectThumb(host); }
      });
    });
  }
  function renderHomeResume() {
    let b = $('#homeResume');
    if (!editor.deck) { if (b) b.remove(); return; }
    if (!b) {
      b = el('<button class="resume-card" id="homeResume" type="button"><span class="rc-ic"><i data-lucide="pencil-ruler"></i></span><span class="rc-txt"><strong></strong><span>Voltar para o editor</span></span><span class="rc-go"><i data-lucide="arrow-right"></i></span></button>');
      $('.hero').appendChild(b); icons(b);
      b.onclick = () => S.setView('editor');
    }
    b.querySelector('strong').textContent = 'Continuar editando: ' + (project.title || 'Apresentação');
  }

  /* ======================= geração ======================= */
  const STEPS = [
    { label: 'Lendo o pedido e os documentos', icon: 'file-search' },
    { label: 'Pesquisando dados e fontes', icon: 'globe' },
    { label: 'Estruturando a narrativa (Regra dos 3)', icon: 'list-tree' },
    { label: 'Escrevendo os slides', icon: 'pen-line' },
    { label: 'Finalizando', icon: 'check-check' }
  ];
  const genState = { active: false, jobId: null, step: 0, timer: null, poll: null, start: 0, since: 0, abort: null, total: 12 };
  function showGen(title, total) {
    Object.assign(genState, { active: true, step: 0, start: Date.now(), since: 0, total: total || cfg.slideCount });
    $('#gen').classList.remove('hidden');
    $('#genTitle').textContent = 'Criando sua apresentação';
    $('#genSub').textContent = title || '';
    $('#genLog').innerHTML = '';
    $('#genSkel').innerHTML = Array.from({ length: Math.min(12, genState.total) }, () => '<i></i>').join('');
    renderSteps(0, 0);
    clearInterval(genState.timer);
    genState.timer = setInterval(() => { $('#genTime').textContent = fmtClock(Date.now() - genState.start); }, 500);
    tb.hidePill();
  }
  function renderSteps(step, written) {
    genState.step = Math.max(genState.step, step);
    $('#genSteps').innerHTML = STEPS.map((s, i) => {
      const cls = i < genState.step ? 'is-done' : i === genState.step ? 'is-on' : '';
      const ic = i < genState.step ? 'check' : i === genState.step ? 'loader-2' : s.icon;
      const label = i === 3 && written ? s.label + ' · ' + written + ' de ' + genState.total : s.label;
      return '<div class="step ' + cls + '"><span class="si"><i data-lucide="' + ic + '"' + (i === genState.step ? ' class="spin"' : '') + '></i></span>' + esc(label) + '</div>';
    }).join('');
    icons($('#genSteps'));
    const sk = $$('#genSkel i');
    const lit = genState.step >= 4 ? sk.length : Math.round((written || 0) / genState.total * sk.length);
    sk.forEach((x, i) => x.classList.toggle('on', i < lit));
  }
  function genLog(text) {
    const box = $('#genLog');
    const d = document.createElement('div'); d.textContent = '› ' + text;
    box.appendChild(d); box.scrollTop = box.scrollHeight;
  }
  function hideGen() {
    genState.active = false; clearInterval(genState.timer); clearTimeout(genState.poll);
    $('#gen').classList.add('hidden');
    tb.updatePill();
  }

  const ATTACH_BUDGET = 300000;
  // o que foi cortado na última montagem do prompt (para avisar o usuário antes de enviar)
  const promptInfo = { cut: [], dropped: [], files: 0, chars: 0 };
  function buildPrompt() {
    const ok = attachments.filter(a => a.status === 'ok');
    let budget = ATTACH_BUDGET;
    promptInfo.cut = []; promptInfo.dropped = []; promptInfo.files = ok.length; promptInfo.chars = 0;
    ok.forEach(a => { if (/truncad/i.test(a.info || '')) promptInfo.cut.push(a.name + ' (limite de 100 mil caracteres por arquivo)'); });
    const atts = ok.map(a => {
      let c = a.content;
      if (budget <= 0) { promptInfo.dropped.push(a.name); return { name: a.name, content: '' }; }
      if (c.length > budget) { promptInfo.cut.push(a.name + ' (limite total de 300 mil caracteres)'); c = c.slice(0, Math.max(0, budget)) + '\n[... truncado: limite total de anexos ...]'; }
      budget -= c.length; promptInfo.chars += c.length;
      return { name: a.name, content: c };
    }).filter(a => a.content.trim());
    return SSWPrompt.buildPrompt({
      theme: $('#themeInput').value, audience: $('#audienceInput').value, context: $('#contextInput').value,
      tone: cfg.tone, lang: cfg.lang, slideCount: cfg.slideCount, font: cfg.font,
      colors: P.colorsObject(cfg.colors), primary700: cfg.colors.primary, logoSvg: S.logoSvg(),
      today: new Date().toLocaleDateString(cfg.lang === 'en' ? 'en-US' : cfg.lang === 'es' ? 'es-ES' : 'pt-BR', { year: 'numeric', month: 'long', day: 'numeric' }),
      components: cfg.components, attachments: atts
    });
  }
  /**
   * Confirma o envio de dados para um serviço externo (A6). Lembra a escolha por destino quando o usuário pede.
   * target: 'kiro' | 'gemini' | 'anthropic' | 'openai'
   */
  function confirmDataSend(target, what) {
    const names = { kiro: 'Kiro (Amazon Web Services)', gemini: 'Google (Gemini)', anthropic: 'Anthropic (Claude)', openai: 'OpenAI' };
    const atts = attachments.filter(a => a.status === 'ok');
    const truncated = promptInfo.cut.length || promptInfo.dropped.length;
    cfg.consent = cfg.consent || {};
    if (cfg.consent[target] && !truncated) return Promise.resolve(true);
    return new Promise(resolve => {
      let decided = false;
      const body = el('<div>' +
        '<p style="margin:0 0 10px">' + esc(what) + ' será enviado para <b>' + esc(names[target] || target) + '</b>, um serviço fora deste computador.</p>' +
        (atts.length ? '<p style="margin:0 0 6px">Inclui o texto de ' + atts.length + ' documento(s) anexado(s):</p><ul class="consent-list">' + atts.slice(0, 8).map(a => '<li>' + esc(a.name) + '</li>').join('') + (atts.length > 8 ? '<li>… e mais ' + (atts.length - 8) + '</li>' : '') + '</ul>' : '') +
        (truncated ? '<div class="banner warn"><i data-lucide="alert-triangle"></i><span>Parte dos anexos não cabe no pedido e <b>não será lida pela IA</b>: ' + esc(promptInfo.cut.concat(promptInfo.dropped.map(n => n + ' (não incluído)')).join('; ')) + '.</span></div>' : '') +
        '<p class="hint" style="margin:10px 0">Não envie informações confidenciais sem autorização da sua empresa. O uso desses dados segue os termos do provedor.</p>' +
        '<label class="check"><input type="checkbox" data-a="remember"> Não perguntar de novo para ' + esc(names[target] || target) + '</label></div>');
      const m = modal({ title: 'Envio de dados para a IA', icon: 'shield-alert', body, onClose: () => { if (!decided) resolve(false); },
        buttons: [{ label: 'Cancelar', cls: 'btn-outline' }, { label: 'Enviar', cls: 'btn-primary', icon: 'send', onClick: () => {
          decided = true;
          if (body.querySelector('[data-a=remember]').checked) { cfg.consent[target] = true; S.saveCfg(); }
          resolve(true);
        } }] });
      icons(m.el);
    });
  }

  async function generate() {
    const theme = $('#themeInput').value.trim() || $('#homePrompt').value.trim();
    if (!theme) {
      toast('Escreva o tema da apresentação.', { type: 'warn' });
      if (S.view === 'home') $('#homePrompt').focus(); else { S.openPanel('gerar'); $('#themeInput').focus(); }
      return;
    }
    $('#themeInput').value = theme;
    if (attachments.some(a => a.status === 'reading')) { toast('Aguarde a leitura dos documentos terminar.', { type: 'warn' }); return; }
    if (genState.active) { toast('Já existe uma geração em andamento.', { type: 'warn' }); return; }
    const prompt = buildPrompt();
    if (cfg.engine === 'copy') return promptModal(prompt);
    if (cfg.engine === 'api') {
      if (!(await confirmDataSend(cfg.provider, 'O pedido da apresentação'))) return;
      return generateViaApi(prompt, theme);
    }
    if (!server.kiro) return promptModal(prompt, 'O Kiro não está disponível agora. Copie o prompt e cole em qualquer IA.');
    if (!(await confirmDataSend('kiro', 'O pedido da apresentação'))) return;
    try {
      const r = await api('/api/generate', { method: 'POST', body: { prompt, title: theme.slice(0, 120), model: S.resolveKiroModel() } });
      attachJob(r.jobId, theme);
    } catch (e) {
      if (e.status === 409 && e.data && e.data.jobId) { attachJob(e.data.jobId, theme); return; }
      toast('Não foi possível iniciar o Kiro: ' + e.message, { type: 'err' });
    }
  }
  function attachJob(jobId, title) {
    showGen(title);
    genState.jobId = jobId;
    genState.engine = 'kiro';
    genLog('Pedido enviado ao Kiro');
    const tick = async () => {
      if (!genState.active || genState.jobId !== jobId) return;
      try {
        const j = await api('/api/jobs/' + jobId + '?since=' + genState.since);
        genState.since = j.logSeq;
        (j.log || []).forEach(l => {
          genLog(l.text);
          if (l.kind === 'tool') renderSteps(/search|pesquis|web|fetch/i.test(l.text) ? 1 : 0, 0);
        });
        if (j.receivedChars > 0 && genState.step < 2) renderSteps(2, 0);
        if (j.slidesWritten > 0 || /<html/i.test(j.html || '')) renderSteps(3, j.slidesWritten);
        if (j.status === 'done' && j.html) {
          renderSteps(4, genState.total);
          const spent = j.credits > 0 ? ' O Kiro gastou ' + S.creditsText(j.credits) + '.' : '';
          setTimeout(() => { hideGen(); openDeck(j.html, { id: j.id, title: j.title || title }); toast('Apresentação pronta!' + spent + ' Clique em qualquer elemento para editar.', { type: 'ok', duration: spent ? 8000 : 5000 }); checkGenerated({ expected: genState.total }); }, 600);
          kiroUsageAfterJob();
          return;
        }
        if (j.status === 'error') { genFailed(j.error || 'Falha na geração.'); kiroUsageAfterJob(); return; }
        if (j.status === 'cancelled') { hideGen(); toast('Geração cancelada.'); kiroUsageAfterJob(); return; }
      } catch (e) {
        if (e.status === 404) { genFailed('A geração não foi encontrada (o servidor pode ter reiniciado).'); return; }
      }
      genState.poll = setTimeout(tick, 1500);
    };
    tick();
  }
  /** depois de um pedido ao Kiro o uso do plano muda, mas o Kiro leva um tempo para somar (no teste, mais de 10 s) */
  let usageTimer = null;
  function kiroUsageAfterJob() { clearTimeout(usageTimer); usageTimer = setTimeout(() => S.refreshKiroUsage(true), 90000); }
  function genFailed(msg) {
    clearInterval(genState.timer);
    $('#genTitle').textContent = 'Não deu certo desta vez';
    $('#genSub').textContent = msg;
    genLog('ERRO: ' + msg);
    const foot = $('.gen-foot');
    foot.innerHTML = '<span></span><span style="display:flex;gap:8px"><button class="btn btn-outline" id="genCopy"><i data-lucide="clipboard-copy"></i>Usar prompt em outra IA</button><button class="btn btn-primary" id="genClose">Fechar</button></span>';
    icons(foot);
    $('#genClose').onclick = () => { hideGen(); resetGenFoot(); };
    $('#genCopy').onclick = () => { hideGen(); resetGenFoot(); promptModal(buildPrompt()); };
  }
  function resetGenFoot() {
    $('.gen-foot').innerHTML = '<span id="genTime">0:00</span><button class="btn btn-outline" id="genCancel"><i data-lucide="x"></i>Cancelar</button>';
    icons($('.gen-foot'));
    $('#genCancel').onclick = cancelGen;
  }
  async function cancelGen() {
    if (genState.engine === 'kiro' && genState.jobId) { try { await api('/api/jobs/' + genState.jobId + '/cancel', { method: 'POST' }); } catch (e) { /* já terminou */ } }
    if (genState.abort) genState.abort.abort();
    hideGen(); toast('Geração cancelada.');
  }

  /* ---------------- API direta ---------------- */
  const SYS_DECK = 'Você é um especialista em design de apresentações corporativas e desenvolvimento front-end. Responda exclusivamente com o código HTML completo e funcional solicitado, sem blocos de markdown, sem crases e sem explicações.';
  const SYS_SLIDE = 'Você é um especialista em design de apresentações corporativas e desenvolvimento front-end. Responda exclusivamente com o elemento <section> do slide solicitado, sem blocos de markdown, sem crases e sem explicações.';
  /** chama o provedor pelo cliente SSWAI (novas tentativas, prazo, continuação, catálogo de modelos, busca) */
  async function callApi(prompt, signal, system, o) {
    o = o || {};
    const provider = cfg.provider;
    const key = await S.getApiKey(provider);
    if (!key) throw new Error('Cadastre a chave de API no painel Gerar (motor API).');
    const model = await S.resolveModel(provider);
    if (o.onProgress) o.onProgress('Modelo: ' + model);
    return SSWAI.generate({ provider, key, model, fallbackModels: S.backupModels(provider, model), system: system || SYS_DECK, prompt, signal, search: !!o.search && provider === 'gemini',
      timeoutMs: o.timeoutMs, onProgress: o.onProgress });
  }
  function extractHtml(text) {
    const t = String(text || '').replace(/```html/gi, '').replace(/```/g, '');
    const lower = t.toLowerCase();
    let i = lower.indexOf('<!doctype html'); if (i < 0) i = lower.indexOf('<html');
    const j = lower.lastIndexOf('</html>');
    return (i >= 0 && j > i) ? t.slice(i, j + 7) : null;
  }
  /** resposta sem </html> (cortada): aproveita os slides completos em vez de descartar tudo (A4) */
  function salvageHtml(text) {
    const t = String(text || '').replace(/```html/gi, '').replace(/```/g, '');
    const lower = t.toLowerCase();
    let i = lower.indexOf('<!doctype html'); if (i < 0) i = lower.indexOf('<html');
    const j = lower.lastIndexOf('</section>');
    if (i < 0 || j < i) return null;
    const html = t.slice(i, j + 10) + '\n</main>\n</body>\n</html>';
    return (html.match(/<section\b/gi) || []).length ? html : null;
  }
  /** verificação depois de gerar: quantidade de slides e conteúdo saindo da área / texto cortado (A10) */
  async function checkGenerated(o) {
    o = o || {};
    const warns = [];
    const n = editor.slideCount;
    if (o.expected && (n < o.expected - 1 || n > o.expected + 2)) warns.push('a IA entregou ' + n + ' slides (pedido: ' + o.expected + ')');
    if (o.repaired) warns.push('a resposta veio incompleta e só os slides completos foram aproveitados; a navegação da apresentação pode precisar de ajuste');
    const issues = await editor.audit(o.slides).catch(() => null);
    const bad = (issues || []).map(x => x.slide + 1);
    if (bad.length) warns.push((bad.length === 1 ? 'o slide ' : 'os slides ') + bad.join(', ') + (bad.length === 1 ? ' tem' : ' têm') + ' conteúdo saindo da área ou texto cortado');
    if (o.sources && o.sources.length) sourcesFound = o.sources;
    if (warns.length) {
      toast('Revise: ' + warns.join('; ') + '.', { type: 'warn', duration: 12000, action: bad.length ? { label: 'Ir para o slide ' + bad[0], onClick: () => editor.goTo(bad[0] - 1) } : null });
    }
    if (o.sources && o.sources.length) setTimeout(() => toast(o.sources.length + ' fontes da web consultadas pela IA.', { type: 'info', duration: 9000, action: { label: 'Ver fontes', onClick: showSources } }), warns.length ? 800 : 0);
    return { warns, issues };
  }
  let sourcesFound = [];
  function showSources() {
    const list = sourcesFound.map(s => '<li><a class="link" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title || s.url) + '</a><div class="hint">' + esc(s.url) + '</div></li>').join('');
    modal({ title: 'Fontes consultadas', sub: 'Páginas que a busca na web devolveu para esta geração. Confira os dados antes de apresentar.', icon: 'globe', wide: true,
      body: '<ol class="sources-list">' + list + '</ol>', buttons: [{ label: 'Copiar lista', cls: 'btn-outline', icon: 'clipboard-copy', onClick: async () => { await copyText(sourcesFound.map(s => (s.title || '') + ' — ' + s.url).join('\n')); toast('Lista copiada.', { type: 'ok' }); return false; } }, { label: 'Fechar', cls: 'btn-primary' }] });
  }
  async function generateViaApi(prompt, title) {
    showGen(title);
    genState.engine = 'api'; genState.abort = new AbortController();
    genLog('Enviando para ' + SSWAI.PROVIDERS[cfg.provider].label + (cfg.provider === 'gemini' ? ' (com busca na web)' : ''));
    renderSteps(2, 0);
    const bump = setTimeout(() => renderSteps(3, 0), 6000);
    try {
      const r = await callApi(prompt, genState.abort.signal, SYS_DECK, { search: true, timeoutMs: 8 * 60000, onProgress: genLog });
      if (r.usedSearch) genLog(r.sources.length ? 'Busca na web: ' + r.sources.length + ' fontes consultadas' : 'Busca na web ativa (o modelo não citou fontes)');
      else if (cfg.provider === 'gemini') genLog('Gerado sem busca na web');
      if (r.continuations) genLog('Resposta longa: juntada em ' + (r.continuations + 1) + ' partes');
      let html = extractHtml(r.text), repaired = false;
      if (!html) { html = salvageHtml(r.text); repaired = !!html; }
      if (!html) throw new Error('A IA não devolveu um HTML válido' + (r.truncated ? ' (a resposta passou do limite de tamanho; peça menos slides)' : '') + '. Tente de novo ou troque o modelo.');
      renderSteps(4, genState.total);
      hideGen();
      openDeck(html, { title });
      toast('Apresentação pronta!', { type: 'ok' });
      checkGenerated({ expected: genState.total, repaired, sources: r.sources });
    } catch (e) {
      if (e.name === 'AbortError') return;
      genFailed(e.message);
    } finally { clearTimeout(bump); genState.abort = null; }
  }

  /* ---------------- prompt manual ---------------- */
  function promptModal(prompt, note) {
    const body = el('<div>' + (note ? '<div class="banner warn"><i data-lucide="alert-triangle"></i><span>' + esc(note) + '</span></div>' : '') +
      '<div class="sec-title">1. Copie o prompt e cole na IA de sua preferência</div>' +
      '<textarea class="code" readonly style="min-height:150px"></textarea>' +
      '<div style="display:flex;gap:8px;margin:8px 0 18px"><button class="btn btn-primary" data-a="copy"><i data-lucide="clipboard-copy"></i>Copiar prompt</button><button class="btn btn-outline" data-a="dl"><i data-lucide="download"></i>Baixar .md</button><span class="hint" style="margin:auto 0 auto 6px">' + prompt.length.toLocaleString('pt-BR') + ' caracteres</span></div>' +
      '<div class="sec-title">2. Cole aqui o HTML que a IA devolver</div>' +
      '<textarea class="code" data-a="html" placeholder="<!DOCTYPE html> ..." style="min-height:120px"></textarea></div>');
    body.querySelector('textarea').value = prompt;
    const m = modal({ title: 'Prompt pronto', sub: 'Funciona com Kiro, ChatGPT, Claude, Gemini e outras IAs', icon: 'clipboard-copy', wide: true, body,
      buttons: [{ label: 'Fechar', cls: 'btn-outline' }, { label: 'Abrir no editor', cls: 'btn-primary', icon: 'pencil-ruler', onClick: () => {
        const html = extractHtml(body.querySelector('[data-a=html]').value);
        if (!html) { toast('Cole o HTML completo (de <!DOCTYPE html> até </html>).', { type: 'warn' }); return false; }
        openDeck(html, { title: $('#themeInput').value.trim() || 'Apresentação' });
      } }] });
    body.querySelector('[data-a=copy]').onclick = async () => { toast(await copyText(prompt) ? 'Prompt copiado!' : 'Não consegui copiar; selecione o texto manualmente.', { type: 'ok' }); };
    body.querySelector('[data-a=dl]').onclick = () => downloadText('prompt-gerado.md', prompt, 'text/markdown;charset=utf-8');
    icons(m.el);
  }

  /* ======================= editar slide com IA ======================= */
  const AI_SUGGESTIONS = ['Deixar mais conciso', 'Transformar em 3 tópicos com ícones', 'Melhorar o visual e a hierarquia', 'Destacar os números principais',
    'Deixar o tom mais executivo', 'Transformar em comparativo antes e depois', 'Traduzir para inglês'];
  const aiState = { busy: false, jobId: null, abort: null, toast: null };
  let aiSources = [];
  function slideOutline() {
    return editor.deck.slides().map(s => { const h = s.querySelector('h1,h2,h3'); return h ? h.textContent.trim().replace(/\s+/g, ' ').slice(0, 90) : ''; });
  }
  function aiEngine() {
    if (cfg.engine === 'kiro' && server.kiro) return 'kiro';
    if (cfg.engine === 'api' && S.hasApiKey(cfg.provider)) return 'api';
    return 'copy';
  }
  function buildSlidePromptFor(index, instruction) {
    const src = editor.deck.slideSource(index);
    const tw = editor.deck.tailwindConfigScript();
    const prompt = SSWPrompt.buildSlidePrompt({
      instruction, slideHtml: src.html, index, total: editor.slideCount, deckTitle: project.title || editor.deck.title(),
      outline: slideOutline(), themeConfig: tw ? tw.textContent.trim() : '', font: cfg.font, lang: cfg.lang
    });
    return { prompt, images: src.images };
  }
  function aiEditSlide(index) {
    if (!editor.deck) return;
    index = index == null ? editor.current : index;
    if (aiState.busy) { toast('A IA ainda está reescrevendo um slide. Aguarde terminar.', { type: 'warn' }); return; }
    editor.endEdit();
    const engine = aiEngine();
    const engineName = engine === 'kiro' ? 'Kiro' : engine === 'api' ? ({ gemini: 'Google Gemini', anthropic: 'Anthropic', openai: 'OpenAI' }[cfg.provider]) : 'copiar e colar em qualquer IA';
    const body = el('<div class="ai-edit">' +
      '<label class="sec-title" for="aiInstr">O que você quer mudar neste slide?</label>' +
      '<textarea id="aiInstr" class="input" rows="4" placeholder="Ex.: resuma em 3 tópicos curtos, troque o título por uma pergunta e destaque o 72%"></textarea>' +
      '<div class="ai-chips">' + AI_SUGGESTIONS.map(s => '<button class="ai-chip" type="button">' + esc(s) + '</button>').join('') + '</div>' +
      '<div class="hint"><i data-lucide="info"></i><span>Usando: <b>' + esc(engineName) + '</b>. O slide é trocado inteiro; se não gostar, use Desfazer (Ctrl+Z).</span></div></div>');
    const ta = body.querySelector('textarea');
    body.querySelectorAll('.ai-chip').forEach(c => c.onclick = () => { ta.value = ta.value.trim() ? ta.value.trim().replace(/[.;]?$/, '; ') + c.textContent.toLowerCase() : c.textContent; ta.focus(); });
    const m = modal({ title: 'Editar slide ' + (index + 1) + ' com IA', sub: 'A IA reescreve só este slide, mantendo o estilo da apresentação', icon: 'wand-sparkles', body,
      buttons: [{ label: 'Cancelar', cls: 'btn-outline' }, { label: engine === 'copy' ? 'Gerar prompt' : 'Reescrever slide', cls: 'btn-primary', icon: 'wand-sparkles', onClick: () => {
        const instr = ta.value.trim();
        if (!instr) { toast('Escreva o que mudar no slide.', { type: 'warn' }); ta.focus(); return false; }
        runAiEdit(index, instr, engine);
      } }] });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); m.el.querySelector('.modal-foot .btn-primary').click(); } });
    setTimeout(() => ta.focus(), 50);
  }
  async function runAiEdit(index, instruction, engine) {
    const slideId = editor.deck.slideAt(index).getAttribute(D.ID);
    const { prompt, images } = buildSlidePromptFor(index, instruction);
    if (engine === 'copy') return slidePromptModal(slideId, prompt, images);
    if (!(await confirmDataSend(engine === 'kiro' ? 'kiro' : cfg.provider, 'O conteúdo deste slide e o seu pedido'))) return;
    aiState.busy = true;
    editor.page.classList.add('is-ai');
    aiState.toast = toast('Reescrevendo o slide ' + (index + 1) + ' com IA…', { type: 'busy', duration: 0, action: { label: 'Cancelar', onClick: cancelAiEdit } });
    try {
      let text, credits = 0;
      if (engine === 'kiro') { const k = await kiroSlide(prompt); if (k) { text = k.text; credits = k.credits; } }
      else {
        aiState.abort = new AbortController();
        const r = await callApi(prompt, aiState.abort.signal, SYS_SLIDE, { search: true, timeoutMs: 3 * 60000, onProgress: m => aiState.toast && aiState.toast.set('Reescrevendo o slide… ' + m) });
        text = r.text; aiSources = r.sources;
      }
      if (text == null) return; // cancelado
      if (applyAiSlide(slideId, text, images, credits)) {
        const idx = editor.current;
        setTimeout(() => checkGenerated({ slides: [idx], sources: aiSources }), 400);
      }
      aiSources = [];
    } catch (e) {
      if (e.name !== 'AbortError') toast('A IA não conseguiu editar o slide: ' + e.message, { type: 'err' });
    } finally {
      if (engine === 'kiro') kiroUsageAfterJob();
      aiState.busy = false; aiState.jobId = null; aiState.abort = null;
      editor.page.classList.remove('is-ai');
      if (aiState.toast) { aiState.toast.close(); aiState.toast = null; }
    }
  }
  async function kiroSlide(prompt) {
    let r;
    // o id do projeto aberto faz os créditos desta edição somarem no total da apresentação
    try { r = await api('/api/edit-slide', { method: 'POST', body: { prompt, projectId: project.id || null, model: S.resolveKiroModel() } }); }
    catch (e) { throw new Error(e.status === 409 ? 'o Kiro já está trabalhando em outro pedido' : e.message); }
    aiState.jobId = r.jobId;
    let since = 0;
    for (;;) {
      await new Promise(res => setTimeout(res, 1500));
      if (aiState.jobId !== r.jobId) return null;
      const j = await api('/api/jobs/' + r.jobId + '?since=' + since);
      since = j.logSeq;
      const last = (j.log || []).filter(l => l.kind === 'tool').pop();
      if (last && aiState.toast) aiState.toast.set('Reescrevendo o slide com IA… ' + last.text);
      if (j.status === 'done') return { text: j.result || '', credits: j.credits || 0 };
      if (j.status === 'error') throw new Error(j.error || 'falha no Kiro');
      if (j.status === 'cancelled') return null;
    }
  }
  async function cancelAiEdit() {
    const id = aiState.jobId;
    aiState.jobId = null;
    if (id) { try { await api('/api/jobs/' + id + '/cancel', { method: 'POST' }); } catch (e) { /* já terminou */ } }
    if (aiState.abort) aiState.abort.abort();
    aiState.toast = null;
    toast('Edição com IA cancelada.');
  }
  function applyAiSlide(slideId, text, images, credits) {
    const orig = editor.deck.byId(slideId);
    if (!orig) { toast('O slide foi excluído enquanto a IA trabalhava; nada foi alterado.', { type: 'warn' }); return false; }
    const sec = editor.deck.slideFromAi(text, images, orig);
    if (!sec) { toast('A IA não devolveu um slide válido. Tente de novo com outro pedido.', { type: 'err' }); return false; }
    const index = editor.deck.indexOfSlide(orig);
    editor.replaceSlide(index, sec, 'Editar slide com IA');
    toast('Slide ' + (index + 1) + ' reescrito pela IA' + (credits > 0 ? ' · o Kiro gastou ' + S.creditsText(credits) : '') + '.', { type: 'ok', duration: 7000, action: { label: 'Desfazer', onClick: () => editor.undo() } });
    return true;
  }
  function slidePromptModal(slideId, prompt, images) {
    const body = el('<div>' +
      '<div class="sec-title">1. Copie o prompt e cole na IA de sua preferência</div>' +
      '<textarea class="code" readonly style="min-height:150px"></textarea>' +
      '<div style="display:flex;gap:8px;margin:8px 0 18px"><button class="btn btn-primary" data-a="copy"><i data-lucide="clipboard-copy"></i>Copiar prompt</button></div>' +
      '<div class="sec-title">2. Cole aqui o &lt;section&gt; que a IA devolver</div>' +
      '<textarea class="code" data-a="html" placeholder="<section class=&quot;slide&quot;> ..." style="min-height:120px"></textarea></div>');
    body.querySelector('textarea').value = prompt;
    const m = modal({ title: 'Prompt para editar o slide', sub: 'Funciona com Kiro, ChatGPT, Claude, Gemini e outras IAs', icon: 'wand-sparkles', wide: true, body,
      buttons: [{ label: 'Fechar', cls: 'btn-outline' }, { label: 'Aplicar no slide', cls: 'btn-primary', icon: 'check', onClick: () => applyAiSlide(slideId, body.querySelector('[data-a=html]').value, images) }] });
    body.querySelector('[data-a=copy]').onclick = async () => { toast(await copyText(prompt) ? 'Prompt copiado!' : 'Não consegui copiar; selecione o texto manualmente.', { type: 'ok' }); };
    icons(m.el);
  }

  /* ======================= importação (roteamento por tipo) ======================= */
  async function importFiles(files, opts) {
    opts = opts || {};
    const list = Array.from(files || []);
    const images = list.filter(f => IMP.classify(f) === 'image');
    const htmls = list.filter(f => IMP.classify(f) === 'html');
    const pdfs = list.filter(f => IMP.classify(f) === 'pdf');
    const docs = list.filter(f => IMP.classify(f) === 'doc');
    const bad = list.filter(f => ['legacy', 'unsupported'].includes(IMP.classify(f)));
    bad.forEach(f => toast(IMP.classify(f) === 'legacy' ? '"' + f.name + '" é um formato antigo. Salve como DOCX/PPTX/XLSX ou PDF.' : 'Formato não suportado: ' + f.name, { type: 'err' }));
    if (images.length) {
      const added = await S.addUploads(images);
      if (editor.deck && S.view === 'editor') added.forEach((u, k) => S.insertElement(D.imageHtml(u.dataUrl, u.w, u.h), opts.at ? { x: opts.at.x + k * 24, y: opts.at.y + k * 24 } : null, 'Inserir imagem'));
      else { S.openPanel('uploads'); toast(added.length + ' imagem(ns) em Uploads.', { type: 'ok' }); }
    }
    for (const f of htmls) {
      const txt = IMP.decodeText(await f.arrayBuffer());
      if (IMP.isPresentationHtml(txt) || await confirm('"' + f.name + '" não parece uma apresentação de slides. Abrir mesmo assim no editor?', { title: 'Abrir HTML', ok: 'Abrir' })) {
        if (project.dirty) await save();
        openDeck(txt, { title: f.name.replace(/\.html?$/i, '') });
      } else S.addAttachments([f]);
    }
    if (pdfs.length) {
      const choice = await chooseDocUse(pdfs, true);
      if (choice === 'slides') for (const f of pdfs) await pdfAsSlides(f);
      else if (choice === 'ai') S.addAttachments(pdfs);
    }
    if (docs.length) S.addAttachments(docs);
  }
  function chooseDocUse(files, isPdf) {
    return new Promise(resolve => {
      let done = false;
      const names = files.map(f => f.name).join(', ');
      const body = el('<div><p class="hint" style="margin:0 0 12px">' + esc(names) + '</p>' +
        '<button class="choice" data-c="ai"><span class="ci" style="background:var(--ai-soft);color:var(--primary-700)"><i data-lucide="sparkles"></i></span><span><strong>Criar slides com IA a partir do conteúdo</strong><span>O texto vira contexto para a IA montar uma apresentação nova, no padrão WEG.</span></span></button>' +
        (isPdf ? '<button class="choice" data-c="slides"><span class="ci" style="background:#FFF1F1;color:#C80D0D"><i data-lucide="file-image"></i></span><span><strong>Importar as páginas como slides</strong><span>Cada página vira um slide (imagem). Você adiciona textos e elementos por cima.</span></span></button>' : '') + '</div>');
      const m = modal({ title: 'Como usar este arquivo?', icon: 'file-up', body, onClose: () => { if (!done) resolve(null); } });
      body.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { done = true; m.close(); resolve(b.dataset.c); });
    });
  }
  async function pdfAsSlides(file) {
    const t = toast('Lendo páginas de "' + file.name + '"…', { type: 'busy', duration: 0 });
    try {
      const r = await IMP.pdfToImages(file, { width: 1600, maxPages: 60, onProgress: (i, n) => t.set('Convertendo página ' + i + ' de ' + n + '…') });
      const inner = r.images.map(img => D.fullImageSlideInner(img.dataUrl));
      if (editor.deck) editor.addSlidesHtml(inner, 'Importar PDF');
      else {
        const html = D.blankDeckHtml({ title: file.name.replace(/\.pdf$/i, ''), colors: P.colorsObject(cfg.colors), font: cfg.font, logoSvg: S.logoSvg(), slidesHtml: inner });
        openDeck(html, { title: file.name.replace(/\.pdf$/i, '') });
      }
      toast(r.images.length + ' páginas importadas' + (r.truncated ? ' (limite de 60)' : '') + '.', { type: 'ok' });
    } catch (e) { toast(e.message, { type: 'err' }); }
    finally { t.close(); }
  }

  /* ======================= área de transferência / arrastar ======================= */
  function handlePaste(files, text) {
    if (!editor.deck || S.view !== 'editor') return;
    const imgs = Array.from(files || []).filter(f => IMP.classify(f) === 'image');
    if (imgs.length) { importFiles(imgs); return; }
    if (editor.clip && (!text || text === editor.clip.marker || /^ssw-element:/.test(text))) { editor.pasteClip(); return; }
    if (text && text.trim()) {
      const t = text.trim().slice(0, 4000);
      if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(t)) { S.insertElement(D.imageHtml(t, 0, 0), null, 'Colar imagem'); return; }
      const html = D.ELEMENTS.body().replace('Adicione um pouco de texto ao corpo do slide', esc(t).replace(/\n/g, '<br>'));
      S.insertElement(html, null, 'Colar texto');
    } else if (editor.clip) editor.pasteClip();
  }
  function handleCanvasDrop(dt, x, y) {
    const raw = dt.getData('application/x-ssw');
    if (raw) {
      try { const p = JSON.parse(raw); const html = S.payloadHtml(p); if (html) S.insertElement(html, { x, y }, 'Inserir'); } catch (e) { /* payload inválido */ }
      return;
    }
    if (dt.files && dt.files.length) { importFiles(dt.files, { at: { x, y } }); return; }
    const t = dt.getData('text/uri-list') || dt.getData('text/plain');
    if (t) handlePaste([], t);
  }
  const isTyping = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  document.addEventListener('copy', e => {
    if (isTyping(e.target) || !editor.sel || S.view !== 'editor') return;
    const marker = 'ssw-element:' + editor.sel.id + ':' + Date.now();
    if (editor.copySelection(false, marker)) { e.clipboardData.setData('text/plain', marker); e.preventDefault(); }
  });
  document.addEventListener('cut', e => {
    if (isTyping(e.target) || !editor.sel || S.view !== 'editor') return;
    const marker = 'ssw-element:' + editor.sel.id + ':' + Date.now();
    if (editor.copySelection(true, marker)) { e.clipboardData.setData('text/plain', marker); e.preventDefault(); }
  });
  document.addEventListener('paste', e => {
    if (isTyping(e.target) || S.view !== 'editor') return;
    e.preventDefault();
    handlePaste(Array.from(e.clipboardData.files || []), e.clipboardData.getData('text/plain'));
  });
  window.addEventListener('dragover', e => { e.preventDefault(); });
  window.addEventListener('drop', e => {
    e.preventDefault();
    editor.showDrop(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
  });

  /* ======================= atalhos ======================= */
  function handleKey(m, e) {
    const k = m.key, mod = !!m.mod;
    const stop = () => { if (e) { e.preventDefault(); e.stopPropagation(); } };
    if (k === 'present' || k === 'F5' || (mod && k === 'Enter')) { stop(); present(); return; }
    if (mod && k === 's') { stop(); save(true).then(ok => ok && toast('Salvo.', { type: 'ok', duration: 1500 })); return; }
    if (!editor.deck || S.view !== 'editor') return;
    if (mod && k === 'z') { stop(); m.shift ? editor.redo() : editor.undo(); return; }
    if (mod && k === 'y') { stop(); editor.redo(); return; }
    if (mod && k === 'd') { stop(); editor.duplicateSelection(); return; }
    if (mod && k === 'l') { stop(); editor.toggleLock(); return; }
    if (mod && k === 'a') { stop(); editor.selectAll(); return; }
    if (mod && (k === 'b' || k === 'i' || k === 'u') && editor.sel && editor.sel.kind === 'text') {
      stop(); const s = editor.sel.style;
      if (k === 'b') editor.setStyle({ 'font-weight': parseInt(s.fontWeight, 10) >= 600 ? '400' : '700' }, 'Negrito');
      if (k === 'i') editor.setStyle({ 'font-style': s.fontStyle === 'italic' ? 'normal' : 'italic' }, 'Itálico');
      if (k === 'u') editor.setStyle({ 'text-decoration': s.underline ? 'none' : 'underline' }, 'Sublinhado');
      return;
    }
    if (mod && (k === '+' || k === '=')) { stop(); editor.setZoom(editor.zoom * 1.15); return; }
    if (mod && k === '-') { stop(); editor.setZoom(editor.zoom / 1.15); return; }
    if (mod && k === '0') { stop(); editor.fit(); return; }
    if (k === 'Delete' || k === 'Backspace') { if (editor.sel) { stop(); editor.deleteSelection(); } return; }
    if (k === 'Escape') { if (editor.sel) { stop(); editor.deselect(); } else closePop(); return; }
    if (k === 'PageDown' || (mod && k === 'ArrowDown')) { stop(); editor.goTo(editor.current + 1); return; }
    if (k === 'PageUp' || (mod && k === 'ArrowUp')) { stop(); editor.goTo(editor.current - 1); return; }
    if (/^Arrow/.test(k) && !mod) {
      stop();
      if (editor.sel) { const st = m.shift ? 10 : 1; editor.nudge(k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0); }
      else if (k === 'ArrowRight' || k === 'ArrowDown') editor.goTo(editor.current + 1);
      else editor.goTo(editor.current - 1);
    }
  }
  document.addEventListener('keydown', e => {
    if (document.querySelector('.overlay, .present')) return;
    if (isTyping(e.target)) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(true); }
      return;
    }
    handleKey({ key: e.key.length === 1 ? e.key.toLowerCase() : e.key, mod: e.ctrlKey || e.metaKey, shift: e.shiftKey }, e);
  });
  function shortcutsModal() {
    const rows = [['Desfazer / Refazer', 'Ctrl+Z / Ctrl+Y'], ['Salvar', 'Ctrl+S'], ['Duplicar elemento', 'Ctrl+D'], ['Copiar / Colar', 'Ctrl+C / Ctrl+V'],
      ['Excluir elemento', 'Delete'], ['Selecionar vários', 'Shift+clique ou arrastar no vazio'], ['Selecionar tudo no slide', 'Ctrl+A'], ['Editar texto', 'Duplo clique ou Enter'], ['Sair da edição / seleção', 'Esc'], ['Mover 1 px / 10 px', 'Setas / Shift+Setas'],
      ['Manter proporção ao redimensionar', 'Shift'], ['Sem encaixe ao mover', 'Alt'], ['Selecionar item dentro do grupo', 'Alt+clique'], ['Slide anterior / próximo', 'PageUp / PageDown'],
      ['Zoom', 'Ctrl + / Ctrl − / Ctrl 0'], ['Negrito / Itálico / Sublinhado', 'Ctrl+B / I / U'], ['Bloquear elemento', 'Ctrl+L'], ['Apresentar', 'F5']];
    modal({ title: 'Atalhos do teclado', icon: 'keyboard', wide: true, body: '<div class="kbd-list">' + rows.map(r => '<div><span>' + esc(r[0]) + '</span><span class="kbd">' + esc(r[1]) + '</span></div>').join('') + '</div>', buttons: [{ label: 'Fechar', cls: 'btn-primary' }] });
  }

  /* ======================= exportar / apresentar ======================= */
  async function exportPdf() {
    if (!editor.deck) return;
    editor.endEdit();
    const title = project.title || 'apresentacao';
    if (SERVED && server.pdf) {
      const t = toast('Gerando PDF em alta qualidade (' + editor.slideCount + ' páginas)…', { type: 'busy', duration: 0 });
      try {
        await new Promise(r => setTimeout(r, 120));
        const res = await api('/api/export-pdf', { method: 'POST', body: { html: editor.printHtml(false), title }, raw: true });
        const blob = await res.blob();
        downloadBlob(fileSafe(title) + '.pdf', blob);
        t.close();
        toast('PDF exportado: ' + editor.slideCount + ' páginas 16:9, ' + fmtSize(blob.size) + '.', { type: 'ok', duration: 4500 });
        return;
      } catch (e) { t.close(); toast('PDF automático falhou (' + e.message + '). Abrindo a janela de impressão…', { type: 'warn', duration: 6000 }); }
    }
    printPdf();
  }
  async function exportPptx(mode) {
    if (!editor.deck) return;
    if (!(SERVED && server.pdf)) { toast('A exportação para PowerPoint precisa do servidor local e do Edge. Abra pelo atalho Slide Studio WEG.', { type: 'warn' }); return; }
    editor.endEdit();
    const title = project.title || 'apresentacao';
    const t = toast('Gerando PowerPoint (' + editor.slideCount + ' slides)…', { type: 'busy', duration: 0 });
    try {
      await new Promise(r => setTimeout(r, 120));
      const res = await api('/api/export-pptx', { method: 'POST', body: { html: editor.printHtml(false), title, mode }, raw: true });
      const blob = await res.blob();
      downloadBlob(fileSafe(title) + '.pptx', blob);
      t.close();
      const texts = +res.headers.get('X-SSW-Texts') || 0;
      let subs = {}; try { subs = JSON.parse(decodeURIComponent(res.headers.get('X-SSW-Fonts') || '%7B%7D')); } catch (e) { /* sem dados */ }
      const subTxt = Object.keys(subs).map(k => k + ' → ' + subs[k]).join(', ');
      toast(mode === 'image' ? 'PowerPoint exportado: ' + editor.slideCount + ' slides como imagem, ' + fmtSize(blob.size) + '.'
        : 'PowerPoint exportado: ' + editor.slideCount + ' slides, ' + texts + ' caixas de texto editáveis, ' + fmtSize(blob.size) + '.' +
          (subTxt ? ' Fonte não instalada neste computador, trocada por uma parecida: ' + subTxt + '.' : ''), { type: 'ok', duration: subTxt ? 9000 : 5500 });
    } catch (e) { t.close(); toast('Não foi possível gerar o PowerPoint: ' + e.message, { type: 'err' }); }
  }
  function printPdf() {
    if (!editor.deck) return;
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts allow-modals');
    f.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + W + 'px;height:' + H + 'px;border:0';
    f.srcdoc = editor.printHtml(true);
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 5 * 60 * 1000);
    toast('Na janela de impressão escolha "Salvar como PDF", margens "Nenhuma" e ative "Gráficos de plano de fundo".', { type: 'info', duration: 9000 });
  }
  function downloadHtml() {
    if (!editor.deck) return;
    downloadText(fileSafe(project.title) + '.html', editor.cleanHtml(), 'text/html;charset=utf-8');
  }
  function present() {
    if (!editor.deck) return;
    editor.endEdit();
    const ov = el('<div class="present"><iframe sandbox="allow-scripts" title="Apresentação"></iframe><button class="px" title="Sair (Esc)" aria-label="Sair"><i data-lucide="x"></i></button></div>');
    const f = ov.querySelector('iframe');
    f.style.width = W + 'px'; f.style.height = H + 'px';
    f.srcdoc = editor.presentHtml();
    document.body.appendChild(ov); icons(ov);
    const fit = () => { f.style.transform = 'scale(' + Math.min(innerWidth / W, innerHeight / H) + ')'; };
    fit();
    const onFs = () => { if (!document.fullscreenElement) close(); };
    function close() {
      removeEventListener('resize', fit); document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      ov.remove();
    }
    addEventListener('resize', fit);
    if (ov.requestFullscreen) ov.requestFullscreen().then(() => document.addEventListener('fullscreenchange', onFs)).catch(() => {});
    ov.querySelector('.px').onclick = close;
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    f.addEventListener('load', () => setTimeout(() => f.focus(), 80));
  }

  /* ======================= menus do topo ======================= */
  function fileMenu(anchor) {
    const has = !!editor.deck;
    menu(anchor, [
      { label: 'Nova apresentação com IA', icon: 'sparkles', onClick: () => { S.setView('home'); $('#homePrompt').focus(); } },
      { label: 'Nova apresentação em branco', icon: 'square-plus', onClick: () => newBlank() },
      { label: 'Importar arquivo…', icon: 'upload', onClick: () => S.pickFile('#anyPicker', importFiles, IMP.ACCEPT_DOCS + ',' + IMP.ACCEPT_IMAGES) },
      { label: 'Abrir projeto…', icon: 'folder-open', onClick: () => S.openPanel('projetos') },
      { sep: true },
      { label: 'Salvar', icon: 'save', kb: 'Ctrl+S', disabled: !has, onClick: () => save(true).then(ok => ok && toast('Salvo.', { type: 'ok', duration: 1500 })) },
      { label: 'Exportar PDF', icon: 'file-down', disabled: !has, onClick: exportPdf },
      { label: 'Exportar PowerPoint (.pptx)', icon: 'presentation', disabled: !has || !(SERVED && server.pdf), onClick: () => exportPptx('editable') },
      { label: 'Baixar HTML da apresentação', icon: 'file-code-2', disabled: !has, onClick: downloadHtml },
      { label: 'Baixar prompt (.md)', icon: 'file-text', onClick: () => downloadText('prompt-gerado.md', buildPrompt(), 'text/markdown;charset=utf-8') },
      { sep: true },
      { label: 'Atalhos do teclado', icon: 'keyboard', onClick: shortcutsModal },
      { label: 'Voltar ao início', icon: 'layout-grid', onClick: () => S.setView('home') }
    ]);
  }
  function exportMenu(anchor) {
    menu(anchor, [
      { head: 'Exportar' },
      { label: 'PDF em alta qualidade', icon: 'file-down', disabled: !(SERVED && server.pdf), onClick: exportPdf },
      { label: 'PDF pela janela de impressão', icon: 'printer', onClick: printPdf },
      { label: 'PowerPoint (.pptx) com textos editáveis', icon: 'presentation', disabled: !(SERVED && server.pdf), onClick: () => exportPptx('editable') },
      { label: 'PowerPoint (.pptx) só imagens', icon: 'file-image', disabled: !(SERVED && server.pdf), onClick: () => exportPptx('image') },
      { label: 'HTML (apresentação interativa)', icon: 'file-code-2', onClick: downloadHtml },
      { sep: true },
      { label: 'Apresentar em tela cheia', icon: 'play', kb: 'F5', onClick: present }
    ], { align: 'right' });
  }

  /* ======================= ligações e inicialização ======================= */
  function bindActions() {
    $('#fileMenuBtn').onclick = e => fileMenu(e.currentTarget);
    $('#exportMenuBtn').onclick = e => exportMenu(e.currentTarget);
    $('#homeBtn').onclick = () => S.setView(S.view === 'home' && editor.deck ? 'editor' : 'home');
    const brand = document.querySelector('.brand');
    if (brand) {
      brand.onclick = () => S.setView('home');
      brand.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S.setView('home'); } };
    }
    $('#undoBtn').onclick = () => editor.undo();
    $('#redoBtn').onclick = () => editor.redo();
    $('#pdfBtn').onclick = exportPdf;
    $('#presentBtn').onclick = present;
    $('#kiroUsage').onclick = () => S.refreshKiroUsage(true);
    $('#fullBtn').onclick = present;
    $('#aiBtn').onclick = () => { if (S.view === 'home') $('#homePrompt').focus(); else { S.openPanel('gerar'); $('#themeInput').focus(); } };
    $('#shortcutsBtn').onclick = shortcutsModal;
    $('#genCancel').onclick = cancelGen;
    $('#titleInput').addEventListener('change', e => {
      project.title = e.target.value.trim() || 'Apresentação sem título';
      e.target.value = project.title;
      if (editor.deck) { editor.deck.setTitle(project.title); markDirty(); }
    });
    $('#titleInput').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
    $$('.rail-btn[data-panel]').forEach(b => b.onclick = () => S.openPanel(b.dataset.panel, true));
    $('#panelClose').onclick = () => S.setPanelOpen(false);
    $('#panelOpen').onclick = () => S.openPanel(cfg.panel || 'gerar');
    document.addEventListener('click', e => {
      const g = e.target.closest('[data-goto]');
      if (g) { e.preventDefault(); S.openPanel(g.dataset.goto); }
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'newBlank') newBlank();
      else if (act === 'importAny') S.pickFile('#anyPicker', importFiles, IMP.ACCEPT_DOCS + ',' + IMP.ACCEPT_IMAGES);
      else if (act === 'openHtml') S.pickFile('#htmlPicker', importFiles, '.html,.htm');
      else if (act === 'pdfSlides') S.pickFile('#pdfPicker', fs => pdfAsSlides(fs[0]), '.pdf');
      else if (!editor.deck) return;
      else if (act === 'dupSlide') editor.duplicateSlide();
      else if (act === 'delSlide') editor.deleteSlide();
      else if (act === 'addSlide') S.openPanel('layouts');
      else if (act === 'slideUp') editor.moveSlide(editor.current, editor.current - 1);
      else if (act === 'slideDown') editor.moveSlide(editor.current, editor.current + 1);
    });
    $('#fsAdd').onclick = e => {
      const r = e.currentTarget.getBoundingClientRect();
      menu({ x: r.left, y: r.top - 8 }, Object.entries(D.LAYOUTS).map(([k, L]) => ({ label: L.label, icon: L.icon, onClick: () => editor.addSlide(k, { logoSvg: S.logoSvg(), title: project.title }) })));
      const pop = document.querySelector('.pop'); if (pop) pop.style.top = Math.max(8, r.top - pop.offsetHeight - 8) + 'px';
    };
    $('#sbSlides').onclick = () => { const t = $('#filmstrip .fs-item.is-active'); if (t) t.scrollIntoView({ inline: 'center', behavior: 'smooth' }); };
    $('#zoomRange').addEventListener('input', e => editor.setZoom(+e.target.value / 100));
    $('#zoomIn').onclick = () => editor.setZoom(editor.zoom * 1.15);
    $('#zoomOut').onclick = () => editor.setZoom(editor.zoom / 1.15);
    $('#zoomFit').onclick = () => editor.fit();
    $('#clearFiles').onclick = () => { attachments.splice(0, attachments.length); S.renderFiles(); };
    $('#iconSearch').addEventListener('input', debounce(() => S.renderIconGrid(), 120));
    $('#iconReplaceCancel').onclick = e => { e.preventDefault(); S.endIconReplace(); };
    $$('[data-text]').forEach(b => b.onclick = () => S.insertElement(D.ELEMENTS[b.dataset.text](), null, 'Inserir texto'));
    $$('[data-text]').forEach(b => { b.draggable = true; b.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-ssw', JSON.stringify({ type: 'element', key: b.dataset.text })); if (editor.deck) editor.showDrop(true); }); });
    S.bindDropzone($('#docDrop'), files => importFiles(files), IMP.ACCEPT_DOCS);
    S.bindDropzone($('#imgDrop'), files => S.addUploads(files), IMP.ACCEPT_IMAGES);
  }

  window.__SSW2 = { aiEditSlide, exportPptx, markDirty, handleKey, handlePaste, handleCanvasDrop, refreshProjects, renderHomeResume, generate, attachJob, newBlank, genActive: () => genState.active, save, openDeck, exportPdf, present, importFiles, pdfAsSlides };

  // inicialização
  icons();
  S.bindGenerateForm();
  S.bindStyle();
  S.renderStyle();
  S.renderShapes();
  S.renderFiles();
  S.renderUploads();
  bindActions();
  S.enableDeckUi(false);
  tb.render(null);
  renderSave();
  S.openPanel(cfg.panel || 'gerar');
  if (!cfg.panelOpen) S.setPanelOpen(false);
  S.setView('home');
  S.renderConn();
  S.checkServer();
  setInterval(() => { if (SERVED) S.checkServer(); }, 60000);
})();
