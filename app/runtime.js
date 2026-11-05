/* ============================================================
   Slide Studio WEG — runtime do editor visual (roda DENTRO do iframe sandbox)
   Esta função é serializada com toString() e injetada no srcdoc: não pode usar
   nada de fora dela. Comunicação com o app somente por postMessage.
============================================================ */
window.SSWRuntime = function SSWRuntime(cfg) {
  'use strict';
  var doc = document, win = window, root = doc.documentElement;
  var ID = 'data-ssw-id', SLIDE = 'data-ssw-slide';
  var ACCENT = '#0A92ED', GUIDE = '#FF2D9B';
  var scale = cfg.scale || 1;
  var current = 0, sel = null, editing = null, hoverEl = null, gesture = null, savedRange = null;
  var sels = []; // seleção múltipla (2+ elementos); sel = o último clicado
  var iconSrc = new Map();
  var liveTimer = null;

  function post(type, data) {
    var msg = { __ssw: true, type: type, token: cfg.token };
    if (data) for (var k in data) msg[k] = data[k];
    try { win.parent.postMessage(msg, cfg.origin || '*'); } catch (e) { win.parent.postMessage(msg, '*'); }
  }

  /* ---------------- util ---------------- */
  function slides() { return Array.prototype.slice.call(doc.querySelectorAll('[' + SLIDE + ']')); }
  function byId(id) { return id ? doc.querySelector('[' + ID + '="' + String(id).replace(/"/g, '') + '"]') : null; }
  function isSvgRoot(el) { return el && el.namespaceURI === 'http://www.w3.org/2000/svg' && el.tagName.toLowerCase() === 'svg'; }
  function cs(el) { return win.getComputedStyle(el); }
  function round(n, d) { var p = Math.pow(10, d == null ? 2 : d); return Math.round(n * p) / p; }
  function vw(px) { return round(px / win.innerWidth * 100, 3) + 'vw'; }
  function vh(px) { return round(px / win.innerHeight * 100, 3) + 'vh'; }
  function parseLen(v, ref, axis) {
    v = String(v || '').trim(); if (!v || v === 'none') return 0;
    var n = parseFloat(v); if (isNaN(n)) return 0;
    if (/vw$/.test(v)) return n * win.innerWidth / 100;
    if (/vh$/.test(v)) return n * win.innerHeight / 100;
    if (/%$/.test(v)) return n * (ref || 0) / 100;
    if (/rem$/.test(v)) return n * parseFloat(cs(root).fontSize || 16);
    return n;
  }
  function getTranslate(el) {
    var t = (el.style && el.style.translate) || '';
    if (!t || t === 'none') return { x: 0, y: 0 };
    var parts = t.split(/\s+/);
    return { x: parseLen(parts[0], el.offsetWidth || 0), y: parseLen(parts[1] || '0', el.offsetHeight || 0) };
  }
  function getRotate(el) { var r = (el.style && el.style.rotate) || ''; var n = parseFloat(r); return isNaN(n) ? 0 : n; }
  function toHex(c) {
    if (!c) return null;
    var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(c);
    if (!m) return c.charAt(0) === '#' ? c : null;
    var a = m[4] === undefined ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    if (a === 0) return 'transparent';
    var h = '#' + [m[1], m[2], m[3]].map(function (x) { return (+x).toString(16).padStart(2, '0'); }).join('').toUpperCase();
    return h;
  }
  function isTransparent(c) { return !c || c === 'transparent' || /rgba\([^)]*,\s*0\s*\)$/.test(c) || /\/\s*0\s*\)$/.test(c); }
  function isSlideOrDeck(el) { return !el || el === doc.body || el === root || el.hasAttribute(SLIDE) || el.hasAttribute('data-ssw-deck'); }
  function slideOf(el) { return el && el.closest ? el.closest('[' + SLIDE + ']') : null; }
  function isLocked(el) { return !!(el && el.closest && el.closest('[data-ssw-lock]')); }

  var INLINE_TAGS = /^(SPAN|B|STRONG|EM|I|U|S|SMALL|SUP|SUB|MARK|A|CODE|ABBR|TIME|Q|LABEL|BR|FONT|DEL|INS)$/;
  function hasDirectText(el) {
    for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && c.nodeValue.trim()) return true;
    return false;
  }
  function isInline(el) {
    if (!el || isSvgRoot(el) || el.hasAttribute('data-lucide')) return false;
    return INLINE_TAGS.test(el.tagName) && cs(el).display === 'inline';
  }
  function isTextBlock(el) {
    if (!el || el.nodeType !== 1 || isSvgRoot(el) || /^(IMG|VIDEO|CANVAS|IFRAME|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return false;
    if (!el.textContent.trim()) return false;
    if (hasDirectText(el)) return true;
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (isSvgRoot(c) || c.tagName === 'BR') continue;
      if (!isInline(c)) return false;
    }
    return true;
  }
  function hasVisual(el) {
    var s = cs(el);
    if (!isTransparent(s.backgroundColor)) return true;
    if (s.backgroundImage && s.backgroundImage !== 'none') return true;
    if (s.boxShadow && s.boxShadow !== 'none') return true;
    if (['Top', 'Right', 'Bottom', 'Left'].some(function (k) { return parseFloat(s['border' + k + 'Width']) > 0 && s['border' + k + 'Style'] !== 'none'; })) return true;
    return false;
  }
  function kindOf(el) {
    if (isSvgRoot(el)) return el.hasAttribute('data-lucide') ? 'icon' : 'svg';
    if (el.tagName === 'IMG') return 'image';
    if (/^(VIDEO|CANVAS|IFRAME)$/.test(el.tagName)) return 'media';
    if (el.getAttribute('data-ssw-el') === 'shape') return 'shape';
    if (isTextBlock(el)) return 'text';
    if (el.getAttribute('data-ssw-el') === 'logo') return 'svg';
    return hasVisual(el) ? 'shape' : 'box';
  }
  function isPassThrough(el) {
    if (el.getAttribute('data-ssw-el')) return false;
    if (kindOf(el) !== 'box') return false;
    return true;
  }
  /** elemento selecionável a partir do alvo do evento */
  function pick(target, deep) {
    var n = target && (target.nodeType === 1 ? target : target.parentElement);
    if (!n || n.closest('[data-ssw-ui]')) return null;
    var svg = n.closest && n.closest('svg');
    if (svg) { var outer = svg; while (outer.parentElement && outer.parentElement.closest && outer.parentElement.closest('svg')) outer = outer.parentElement.closest('svg'); n = outer; }
    while (n && !n.hasAttribute(ID)) n = n.parentElement;
    if (!n || isSlideOrDeck(n)) return null;
    if (deep) return n;
    var cand = n;
    while (cand.parentElement && cand.parentElement.hasAttribute(ID) && !isSlideOrDeck(cand.parentElement) && isInline(cand) && isTextBlock(cand.parentElement)) cand = cand.parentElement;
    while (cand && !isSlideOrDeck(cand) && isPassThrough(cand)) {
      var r = cand.getBoundingClientRect();
      if (r.width * r.height < win.innerWidth * win.innerHeight * 0.5 && cand.children.length > 1) break; // grupo pequeno: permite selecionar
      cand = cand.parentElement;
      while (cand && !cand.hasAttribute(ID)) cand = cand.parentElement;
    }
    return (!cand || isSlideOrDeck(cand)) ? null : cand;
  }

  /* ---------------- overlay ---------------- */
  var css = doc.createElement('style');
  css.setAttribute('data-ssw-ui', '');
  css.textContent =
    '#ssw-ov{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:system-ui,sans-serif}' +
    '#ssw-ov .bx{position:absolute;box-sizing:border-box;pointer-events:none;transform-origin:50% 50%}' +
    '#ssw-ov .hov{border:var(--bw) solid ' + ACCENT + ';opacity:.85}' +
    '#ssw-ov .sel{border:var(--bw) solid ' + ACCENT + '}' +
    '#ssw-ov .sel.ed{border-style:dashed}' +
    '#ssw-ov .sel.lk{border-color:#94A3B8}' +
    '#ssw-ov .hd{position:absolute;box-sizing:border-box;background:#fff;border:calc(var(--bw)*.8) solid ' + ACCENT + ';pointer-events:auto;box-shadow:0 0 calc(var(--u)*3) rgba(0,0,0,.25)}' +
    '#ssw-ov .hd.c{width:calc(var(--u)*12);height:calc(var(--u)*12);border-radius:50%;margin:calc(var(--u)*-6) 0 0 calc(var(--u)*-6)}' +
    '#ssw-ov .hd.v{width:calc(var(--u)*6);height:calc(var(--u)*18);border-radius:calc(var(--u)*4);margin:calc(var(--u)*-9) 0 0 calc(var(--u)*-3)}' +
    '#ssw-ov .hd.h{width:calc(var(--u)*18);height:calc(var(--u)*6);border-radius:calc(var(--u)*4);margin:calc(var(--u)*-3) 0 0 calc(var(--u)*-9)}' +
    '#ssw-ov .hd.rot{width:calc(var(--u)*22);height:calc(var(--u)*22);border-radius:50%;margin:0 0 0 calc(var(--u)*-11);display:flex;align-items:center;justify-content:center;cursor:grab}' +
    '#ssw-ov .hd.rot svg{width:60%;height:60%}' +
    '#ssw-ov .gd{position:absolute;background:' + GUIDE + ';pointer-events:none}' +
    '#ssw-ov .mb{border:calc(var(--bw)*.75) solid ' + ACCENT + ';opacity:.9}' +
    '#ssw-ov .mq{position:absolute;box-sizing:border-box;border:calc(var(--bw)*.75) solid ' + ACCENT + ';background:rgba(10,146,237,.08);pointer-events:none}' +
    '#ssw-ov .tag{position:absolute;padding:calc(var(--u)*2) calc(var(--u)*6);border-radius:calc(var(--u)*4);background:#0F172A;color:#fff;font-size:calc(var(--u)*11);white-space:nowrap;pointer-events:none}' +
    'html.ssw-drag,html.ssw-drag *{cursor:move!important;user-select:none!important;-webkit-user-select:none!important}' +
    'html.ssw-rot,html.ssw-rot *{cursor:grabbing!important;user-select:none!important}' +
    '[data-ssw-editing]{user-select:text!important;-webkit-user-select:text!important;cursor:text!important;outline:none!important;caret-color:auto}' +
    '[data-ssw-editing] *{user-select:text!important;-webkit-user-select:text!important}' +
    'body{user-select:none;-webkit-user-select:none}' +
    'img{-webkit-user-drag:none}';
  doc.head.appendChild(css);

  var ov = doc.createElement('div'); ov.id = 'ssw-ov'; ov.setAttribute('data-ssw-ui', '');
  root.appendChild(ov);
  var hovBox = mk('bx hov'); var selBox = mk('bx sel'); var tag = mk('tag'); var mqBox = mk('mq');
  var guides = [], multiBoxes = [];
  hovBox.style.display = selBox.style.display = tag.style.display = mqBox.style.display = 'none';
  var HANDLES = [
    ['nw', 0, 0, 'c', 'nwse-resize'], ['n', .5, 0, 'h', 'ns-resize'], ['ne', 1, 0, 'c', 'nesw-resize'], ['e', 1, .5, 'v', 'ew-resize'],
    ['se', 1, 1, 'c', 'nwse-resize'], ['s', .5, 1, 'h', 'ns-resize'], ['sw', 0, 1, 'c', 'nesw-resize'], ['w', 0, .5, 'v', 'ew-resize']
  ];
  var handleEls = {};
  HANDLES.forEach(function (h) {
    var d = doc.createElement('div'); d.className = 'hd ' + h[3]; d.setAttribute('data-h', h[0]);
    d.style.left = (h[1] * 100) + '%'; d.style.top = (h[2] * 100) + '%'; d.style.cursor = h[4];
    selBox.appendChild(d); handleEls[h[0]] = d;
  });
  var rotEl = doc.createElement('div'); rotEl.className = 'hd rot'; rotEl.setAttribute('data-h', 'rot');
  rotEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="' + ACCENT + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>';
  rotEl.style.left = '50%'; selBox.appendChild(rotEl);
  function mk(cls) { var d = doc.createElement('div'); d.className = cls; ov.appendChild(d); return d; }
  function setScale(s) {
    scale = s || 1;
    ov.style.setProperty('--u', (1 / scale) + 'px');
    ov.style.setProperty('--bw', Math.max(1, 2 / scale) + 'px');
    rotEl.style.top = 'calc(100% + ' + (22 / scale) + 'px)';
  }
  setScale(scale);

  /** caixa do elemento sem as transformações próprias (translate/rotate) */
  function layoutRect(el) {
    var st = el.style, t = st.translate, r = st.rotate;
    if (t) st.translate = 'none';
    if (r) st.rotate = 'none';
    var rect = el.getBoundingClientRect();
    if (t) st.translate = t;
    if (r) st.rotate = r;
    return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  }
  function visualInfo(el) {
    var lr = layoutRect(el), t = getTranslate(el), rot = getRotate(el);
    return { x: lr.x + t.x, y: lr.y + t.y, w: lr.w, h: lr.h, rot: rot, tx: t.x, ty: t.y, lx: lr.x, ly: lr.y };
  }
  function placeBox(box, vi) {
    box.style.left = vi.lx + 'px'; box.style.top = vi.ly + 'px';
    box.style.width = vi.w + 'px'; box.style.height = vi.h + 'px';
    box.style.transform = 'translate(' + vi.tx + 'px,' + vi.ty + 'px) rotate(' + vi.rot + 'deg)';
  }
  function handleSet(el, kind) {
    if (isLocked(el)) return [];
    if (kind === 'text') return ['nw', 'ne', 'se', 'sw', 'e', 'w'];
    if (kind === 'icon' || kind === 'svg') return ['nw', 'ne', 'se', 'sw'];
    return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  }
  function isMulti() { return sels.length > 1; }
  function groupRect(list) {
    var l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    list.forEach(function (el) { var q = el.getBoundingClientRect(); l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); });
    return { x: l, y: t, w: Math.max(0, r - l), h: Math.max(0, b - t) };
  }
  function drawMulti() {
    sels = sels.filter(function (el) { return el.isConnected; });
    while (multiBoxes.length < sels.length) multiBoxes.push(mk('bx mb'));
    multiBoxes.forEach(function (bx, i) {
      if (i < sels.length) { placeBox(bx, visualInfo(sels[i])); bx.style.display = 'block'; } else bx.style.display = 'none';
    });
    var g = groupRect(sels);
    placeBox(selBox, { lx: g.x, ly: g.y, w: g.w, h: g.h, tx: 0, ty: 0, rot: 0 });
    selBox.style.display = 'block';
    selBox.classList.remove('ed');
    selBox.classList.toggle('lk', sels.every(isLocked));
    HANDLES.forEach(function (h) { handleEls[h[0]].style.display = 'none'; });
    rotEl.style.display = 'none';
  }
  function hideMultiBoxes() { multiBoxes.forEach(function (bx) { bx.style.display = 'none'; }); }
  function drawSel() {
    if (isMulti()) { drawMulti(); return; }
    hideMultiBoxes();
    if (!sel || !sel.isConnected) { selBox.style.display = 'none'; tag.style.display = 'none'; return; }
    var vi = visualInfo(sel), kind = kindOf(sel);
    placeBox(selBox, vi);
    selBox.style.display = 'block';
    selBox.classList.toggle('ed', !!editing);
    selBox.classList.toggle('lk', isLocked(sel));
    var hs = editing ? [] : handleSet(sel, kind);
    HANDLES.forEach(function (h) { handleEls[h[0]].style.display = hs.indexOf(h[0]) >= 0 ? 'block' : 'none'; });
    rotEl.style.display = (!editing && !isLocked(sel)) ? 'flex' : 'none';
  }
  function drawHover() {
    if (!hoverEl || hoverEl === sel || sels.indexOf(hoverEl) >= 0 || gesture || !hoverEl.isConnected) { hovBox.style.display = 'none'; return; }
    placeBox(hovBox, visualInfo(hoverEl)); hovBox.style.display = 'block';
  }
  function showTag(text, x, y) {
    tag.textContent = text; tag.style.display = 'block';
    tag.style.left = (x + 12 / scale) + 'px'; tag.style.top = (y + 12 / scale) + 'px';
  }
  function clearGuides() { guides.forEach(function (g) { g.remove(); }); guides = []; }
  function guide(vertical, pos) {
    var g = mk('gd');
    if (vertical) { g.style.left = (pos - 0.5 / scale) + 'px'; g.style.top = '0'; g.style.width = Math.max(1, 1 / scale) + 'px'; g.style.height = '100%'; }
    else { g.style.top = (pos - 0.5 / scale) + 'px'; g.style.left = '0'; g.style.height = Math.max(1, 1 / scale) + 'px'; g.style.width = '100%'; }
    guides.push(g);
  }

  /* ---------------- descrição do elemento para o app ---------------- */
  function describe(el) {
    var s = cs(el), kind = kindOf(el), vi = visualInfo(el);
    var path = [], n = el;
    while (n && !isSlideOrDeck(n)) {
      if (n.hasAttribute(ID)) path.unshift({ id: n.getAttribute(ID), label: labelOf(n) });
      n = n.parentElement;
    }
    var fs = parseFloat(s.fontSize) || 16;
    return {
      id: el.getAttribute(ID), kind: kind, tag: el.tagName.toLowerCase(), label: labelOf(el),
      slide: slides().indexOf(slideOf(el)), locked: isLocked(el),
      abs: isAbsPct(el), path: path,
      rect: { x: vi.x, y: vi.y, w: vi.w, h: vi.h, rot: vi.rot, tx: vi.tx, ty: vi.ty },
      icon: el.getAttribute('data-lucide') || null,
      style: {
        position: s.position,
        fontFamily: (s.fontFamily || '').split(',')[0].replace(/["']/g, '').trim(),
        fontSize: round(fs, 1), fontWeight: s.fontWeight, fontStyle: s.fontStyle,
        underline: /underline/.test(s.textDecorationLine || s.textDecoration || ''),
        strike: /line-through/.test(s.textDecorationLine || s.textDecoration || ''),
        upper: s.textTransform === 'uppercase',
        color: toHex(s.color), textAlign: s.textAlign,
        lineHeight: s.lineHeight === 'normal' ? 1.2 : round(parseFloat(s.lineHeight) / fs, 2),
        letterSpacing: s.letterSpacing === 'normal' ? 0 : round(parseFloat(s.letterSpacing), 1),
        background: toHex(s.backgroundColor), radius: round(parseFloat(s.borderTopLeftRadius) || 0, 0),
        borderWidth: round(parseFloat(s.borderTopWidth) || 0, 0), borderColor: toHex(s.borderTopColor),
        borderStyle: s.borderTopStyle,
        shadow: s.boxShadow && s.boxShadow !== 'none', opacity: round(parseFloat(s.opacity), 2),
        zIndex: s.zIndex === 'auto' ? 0 : parseInt(s.zIndex, 10) || 0,
        objectFit: s.objectFit, strokeWidth: parseFloat(el.getAttribute('stroke-width') || s.strokeWidth) || 2,
        flipX: /-1/.test(el.style.scale || '')
      }
    };
  }
  function labelOf(el) {
    var k = kindOf(el);
    var names = { text: 'Texto', icon: 'Ícone', image: 'Imagem', shape: 'Forma', box: 'Grupo', svg: 'Gráfico', media: 'Mídia' };
    if (k === 'text' && /^H[1-6]$/.test(el.tagName)) return 'Título';
    return names[k] || el.tagName.toLowerCase();
  }
  function isAbsPct(el) {
    var st = el.style;
    return st.position === 'absolute' && /%$/.test(st.left || '') && /%$/.test(st.top || '');
  }

  /* ---------------- seleção ---------------- */
  function select(el, opts) {
    opts = opts || {};
    if (editing && editing !== el) endEdit();
    sels = [];
    sel = el || null;
    hoverEl = null; drawHover();
    drawSel();
    if (!opts.silent) post('select', sel ? { info: describe(sel) } : { info: null, slide: current });
  }
  function describeMulti() {
    var g = groupRect(sels);
    var kinds = sels.map(kindOf);
    return {
      multi: true, id: null, ids: sels.map(function (el) { return el.getAttribute(ID); }),
      count: sels.length, kind: 'multi', kinds: kinds, label: sels.length + ' elementos',
      slide: current, locked: sels.every(isLocked), anyLocked: sels.some(isLocked),
      rect: { x: g.x, y: g.y, w: g.w, h: g.h, rot: 0, tx: 0, ty: 0 }, path: [], style: {}
    };
  }
  /** define a seleção como uma lista (0 = nada, 1 = simples, 2+ = múltipla) */
  function selectMany(list, opts) {
    opts = opts || {};
    var seen = [];
    (list || []).forEach(function (el) { if (el && el.isConnected && seen.indexOf(el) < 0) seen.push(el); });
    // nunca mistura um elemento com o seu próprio agrupamento
    seen = seen.filter(function (el) { return !seen.some(function (o) { return o !== el && o.contains(el); }); });
    if (seen.length < 2) { select(seen[0] || null, opts); return; }
    if (editing) endEdit();
    sels = seen; sel = seen[seen.length - 1];
    hoverEl = null; drawHover();
    drawSel();
    if (!opts.silent) post('select', { info: describeMulti() });
  }
  function currentSels() { return isMulti() ? sels.slice() : (sel ? [sel] : []); }
  function toggleInSel(el) {
    var list = currentSels();
    var i = list.indexOf(el);
    if (i >= 0) list.splice(i, 1);
    else {
      list = list.filter(function (o) { return !o.contains(el) && !el.contains(o); });
      list.push(el);
    }
    selectMany(list);
  }
  /** elementos selecionáveis do slide atual (o que um clique selecionaria) */
  function candidates() {
    var s = slides()[current]; if (!s) return [];
    var set = [];
    Array.prototype.forEach.call(s.querySelectorAll('[' + ID + ']'), function (n) {
      if (n.parentElement && n.parentElement.closest('svg')) return;
      var r = n.getBoundingClientRect(); if (r.width < 1 && r.height < 1) return;
      var c = pick(n); if (c && set.indexOf(c) < 0) set.push(c);
    });
    // formas absorvem o que está dentro delas; grupos transparentes cedem lugar aos filhos
    return set.filter(function (c) {
      if (set.some(function (o) { return o !== c && o.contains(c) && kindOf(o) !== 'box'; })) return false;
      if (kindOf(c) === 'box' && set.some(function (o) { return o !== c && c.contains(o); })) return false;
      return true;
    });
  }
  function selectAll() {
    if (editing) endEdit();
    selectMany(candidates().filter(function (el) { return !isLocked(el); }));
  }
  function refresh() {
    drawSel();
    if (isMulti()) post('rect', { id: null, multi: true, rect: describeMulti().rect });
    else if (sel && sel.isConnected) post('rect', { id: sel.getAttribute(ID), rect: describe(sel).rect });
  }
  function postSelection(quiet) {
    if (isMulti()) post('select', { info: describeMulti(), quiet: quiet });
    else if (sel && sel.isConnected) post('select', { info: describe(sel), quiet: quiet });
    else if (sel) select(null);
  }
  function showSlide(i) {
    var ss = slides(); if (!ss.length) return;
    current = Math.max(0, Math.min(i, ss.length - 1));
    ss.forEach(function (s, k) {
      if (k === current) { s.setAttribute('data-ssw-current', ''); s.classList.add('active'); }
      else { s.removeAttribute('data-ssw-current'); s.classList.remove('active'); }
    });
    select(null, { silent: true });
  }

  /* ---------------- edição de texto ---------------- */
  function startEdit(el, x, y, selectAll) {
    if (!el || isLocked(el) || kindOf(el) !== 'text') return;
    if (editing === el) return;
    if (editing) endEdit();
    editing = el; sel = el; sels = [];
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-ssw-editing', '');
    el.focus({ preventScroll: true });
    var s = win.getSelection();
    var r = null;
    if (!selectAll && x != null && doc.caretRangeFromPoint) r = doc.caretRangeFromPoint(x, y);
    if (!r || !el.contains(r.startContainer)) { r = doc.createRange(); r.selectNodeContents(el); if (!selectAll) r.collapse(false); }
    s.removeAllRanges(); s.addRange(r);
    savedRange = r.cloneRange();
    drawSel();
    post('editing', { id: el.getAttribute(ID), on: true });
  }
  function endEdit() {
    if (!editing) return;
    var el = editing; editing = null;
    clearTimeout(liveTimer);
    el.removeAttribute('contenteditable'); el.removeAttribute('data-ssw-editing');
    if (el.innerHTML === '<br>') el.innerHTML = '';
    var sl = win.getSelection(); if (sl) sl.removeAllRanges();
    savedRange = null;
    syncCounters(el);
    post('commit', { ops: textOps(el), label: 'Editar texto' });
    post('editing', { id: el.getAttribute(ID), on: false });
    drawSel();
  }
  function syncCounters(el) {
    var list = [el].concat(Array.prototype.slice.call(el.querySelectorAll('[data-count],[data-target],[data-value],[data-to]')));
    list.forEach(function (c) {
      ['data-count', 'data-target', 'data-value', 'data-to'].forEach(function (a) {
        if (!c.hasAttribute(a)) return;
        var num = /-?\d+(?:[.,]\d+)?/.exec(c.textContent.replace(/\.(?=\d{3}\b)/g, ''));
        if (num) c.setAttribute(a, num[0].replace(',', '.'));
      });
    });
  }
  function serializeInner(el) {
    var clone = el.cloneNode(true);
    clone.querySelectorAll('svg[data-lucide][' + ID + ']').forEach(function (svg) {
      var orig = iconSrc.get(svg.getAttribute(ID));
      if (!orig) return;
      var t = doc.createElement('template'); t.innerHTML = orig;
      var i = t.content.firstElementChild;
      if (svg.getAttribute('style')) i.setAttribute('style', svg.getAttribute('style')); else i.removeAttribute('style');
      svg.replaceWith(i);
    });
    clone.querySelectorAll('[data-ssw-ui]').forEach(function (n) { n.remove(); });
    return clone.innerHTML;
  }
  function textOps(el) {
    var ops = [{ t: 'html', id: el.getAttribute(ID), html: serializeInner(el) }];
    ['data-count', 'data-target', 'data-value', 'data-to'].forEach(function (a) {
      if (el.hasAttribute(a)) ops.push({ t: 'attr', id: el.getAttribute(ID), name: a, value: el.getAttribute(a) });
    });
    return ops;
  }
  function scheduleLive() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { if (editing) post('live', { ops: textOps(editing) }); drawSel(); }, 350);
  }
  function restoreRange() {
    if (!editing) return false;
    editing.focus({ preventScroll: true });
    if (savedRange && editing.contains(savedRange.startContainer)) {
      var s = win.getSelection(); s.removeAllRanges(); s.addRange(savedRange);
    }
    return true;
  }
  function execText(cmd, value) {
    if (!restoreRange()) return false;
    var s = win.getSelection();
    var collapsed = !s.rangeCount || s.getRangeAt(0).collapsed;
    if (collapsed) { var r = doc.createRange(); r.selectNodeContents(editing); s.removeAllRanges(); s.addRange(r); }
    if (cmd === 'fontSizePx') {
      var range = s.getRangeAt(0);
      var span = doc.createElement('span'); span.style.fontSize = vw(value);
      span.appendChild(range.extractContents()); range.insertNode(span);
      var nr = doc.createRange(); nr.selectNodeContents(span); s.removeAllRanges(); s.addRange(nr);
    } else {
      doc.execCommand('styleWithCSS', false, cmd === 'foreColor' || cmd === 'hiliteColor');
      doc.execCommand(cmd, false, value);
    }
    savedRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
    scheduleLive();
    return true;
  }

  /* ---------------- gestos: mover / redimensionar / girar ---------------- */
  function snapLines(el, group) {
    var xs = [0, win.innerWidth / 2, win.innerWidth], ys = [0, win.innerHeight / 2, win.innerHeight];
    var list = group || [el];
    var sl = slideOf(el) || doc.body;
    sl.querySelectorAll('[' + ID + ']').forEach(function (o) {
      if (isSvgRoot(o.parentElement)) return;
      if (list.some(function (m) { return o === m || m.contains(o) || o.contains(m); })) return;
      if (!list.some(function (m) { return o.parentElement === m.parentElement; }) && !o.getAttribute('data-ssw-el')) return;
      var r = o.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
      xs.push(r.left, r.left + r.width / 2, r.right); ys.push(r.top, r.top + r.height / 2, r.bottom);
    });
    return { xs: xs, ys: ys };
  }
  function snap(val, sizes, lines) {
    var thr = 6 / scale, best = null;
    sizes.forEach(function (off) {
      lines.forEach(function (l) {
        var d = l - (val + off);
        if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d: d, line: l };
      });
    });
    return best;
  }
  function beginMove(el, e) {
    var vi = visualInfo(el);
    gesture = {
      type: 'move', el: el, sx: e.clientX, sy: e.clientY, moved: false, start: vi,
      abs: isAbsPct(el), left: el.offsetLeft, top: el.offsetTop,
      lines: null, st: { translate: el.style.translate, left: el.style.left, top: el.style.top }
    };
  }
  function moveTo(g, dx, dy, noSnap) {
    var el = g.el;
    if (!g.lines) g.lines = snapLines(el);
    clearGuides();
    if (!noSnap && !g.start.rot) {
      var bx = snap(g.start.x + dx, [0, g.start.w / 2, g.start.w], g.lines.xs);
      var by = snap(g.start.y + dy, [0, g.start.h / 2, g.start.h], g.lines.ys);
      if (bx) { dx += bx.d; guide(true, bx.line); }
      if (by) { dy += by.d; guide(false, by.line); }
    }
    if (g.abs) {
      var p = el.offsetParent || doc.body;
      el.style.left = round((g.left + dx) / (p.clientWidth || win.innerWidth) * 100, 3) + '%';
      el.style.top = round((g.top + dy) / (p.clientHeight || win.innerHeight) * 100, 3) + '%';
    } else {
      el.style.translate = vw(g.start.tx + dx) + ' ' + vh(g.start.ty + dy);
    }
    drawSel();
    showTag('x ' + Math.round(g.start.x + dx) + '  y ' + Math.round(g.start.y + dy), g.start.x + dx + g.start.w, g.start.y + dy + g.start.h);
  }
  /* ----- grupo: estado inicial e deslocamento de cada elemento ----- */
  function startState(el) { var t = getTranslate(el); return { el: el, abs: isAbsPct(el), left: el.offsetLeft, top: el.offsetTop, tx: t.x, ty: t.y }; }
  function shiftFrom(s, dx, dy) {
    var el = s.el;
    if (s.abs) {
      var p = el.offsetParent || doc.body;
      el.style.left = round((s.left + dx) / (p.clientWidth || win.innerWidth) * 100, 3) + '%';
      el.style.top = round((s.top + dy) / (p.clientHeight || win.innerHeight) * 100, 3) + '%';
    } else {
      el.style.translate = vw(s.tx + dx) + ' ' + vh(s.ty + dy);
    }
  }
  function beginGroupMove(e, clicked) {
    var movable = sels.filter(function (el) { return !isLocked(el); });
    gesture = { type: 'gmove', sx: e.clientX, sy: e.clientY, moved: false, clicked: clicked, items: movable.map(startState), box: groupRect(movable), lines: null };
  }
  function groupMoveTo(g, dx, dy, noSnap) {
    if (!g.items.length) return;
    if (!g.lines) g.lines = snapLines(g.items[0].el, g.items.map(function (s) { return s.el; }));
    clearGuides();
    if (!noSnap) {
      var bx = snap(g.box.x + dx, [0, g.box.w / 2, g.box.w], g.lines.xs);
      var by = snap(g.box.y + dy, [0, g.box.h / 2, g.box.h], g.lines.ys);
      if (bx) { dx += bx.d; guide(true, bx.line); }
      if (by) { dy += by.d; guide(false, by.line); }
    }
    g.items.forEach(function (s) { shiftFrom(s, dx, dy); });
    drawSel();
    showTag('x ' + Math.round(g.box.x + dx) + '  y ' + Math.round(g.box.y + dy), g.box.x + dx + g.box.w, g.box.y + dy + g.box.h);
  }
  function beginMarquee(e, additive) {
    gesture = { type: 'marquee', sx: e.clientX, sy: e.clientY, moved: false, base: additive ? currentSels() : [] };
  }
  function marqueeRect(g, e) {
    var x = Math.min(g.sx, e.clientX), y = Math.min(g.sy, e.clientY);
    return { x: x, y: y, w: Math.abs(e.clientX - g.sx), h: Math.abs(e.clientY - g.sy) };
  }
  function marqueeTo(g, e) {
    var r = marqueeRect(g, e);
    mqBox.style.left = r.x + 'px'; mqBox.style.top = r.y + 'px'; mqBox.style.width = r.w + 'px'; mqBox.style.height = r.h + 'px';
    mqBox.style.display = 'block';
    g.rect = r;
  }
  function marqueeHits(r) {
    return candidates().filter(function (el) {
      if (isLocked(el)) return false;
      var q = el.getBoundingClientRect();
      return q.left >= r.x - 1 && q.top >= r.y - 1 && q.right <= r.x + r.w + 1 && q.bottom <= r.y + r.h + 1;
    });
  }
  function groupMoveOps(list) {
    var ops = [];
    list.forEach(function (el) { ops = ops.concat(moveOps(el)); });
    return ops;
  }
  /** alinha os elementos entre si (h/v) ou distribui com espaços iguais */
  function alignGroup(m) {
    var list = sels.filter(function (el) { return !isLocked(el); });
    if (list.length < 2) return;
    var G = groupRect(list);
    var items = list.map(function (el) { return { s: startState(el), r: el.getBoundingClientRect() }; });
    if (m.distribute) {
      if (items.length < 3) return;
      var hz = m.distribute === 'h';
      items.sort(function (a, b) { return hz ? a.r.left - b.r.left : a.r.top - b.r.top; });
      var total = items.reduce(function (acc, it) { return acc + (hz ? it.r.width : it.r.height); }, 0);
      var gap = ((hz ? G.w : G.h) - total) / (items.length - 1);
      var pos = hz ? G.x : G.y;
      items.forEach(function (it) {
        var d = pos - (hz ? it.r.left : it.r.top);
        shiftFrom(it.s, hz ? d : 0, hz ? 0 : d);
        pos += (hz ? it.r.width : it.r.height) + gap;
      });
    } else {
      items.forEach(function (it) {
        var dx = 0, dy = 0, r = it.r;
        if (m.h === 'left') dx = G.x - r.left; else if (m.h === 'center') dx = G.x + G.w / 2 - (r.left + r.width / 2); else if (m.h === 'right') dx = G.x + G.w - r.right;
        if (m.v === 'top') dy = G.y - r.top; else if (m.v === 'middle') dy = G.y + G.h / 2 - (r.top + r.height / 2); else if (m.v === 'bottom') dy = G.y + G.h - r.bottom;
        shiftFrom(it.s, dx, dy);
      });
    }
    post('commit', { ops: groupMoveOps(list), label: m.distribute ? 'Distribuir' : 'Alinhar elementos' });
    refresh();
  }
  function moveOps(el) {
    var css = {};
    if (isAbsPct(el)) { css.left = el.style.left; css.top = el.style.top; }
    else css.translate = el.style.translate || null;
    return [{ t: 'style', id: el.getAttribute(ID), css: css }];
  }
  function beginResize(el, h, e) {
    var vi = visualInfo(el), s = cs(el);
    gesture = {
      type: 'resize', el: el, h: h, sx: e.clientX, sy: e.clientY, start: vi, kind: kindOf(el), abs: isAbsPct(el),
      font: parseFloat(s.fontSize) || 16, moved: false,
      st: { width: el.style.width, height: el.style.height, fontSize: el.style.fontSize, translate: el.style.translate, left: el.style.left, top: el.style.top, maxWidth: el.style.maxWidth }
    };
  }
  function resizeTo(g, e) {
    var el = g.el, st = g.start, th = st.rot * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th);
    var dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    var ldx = dx * cos + dy * sin, ldy = -dx * sin + dy * cos;
    var sx = /e/.test(g.h) ? 1 : (/w/.test(g.h) ? -1 : 0), sy = /s/.test(g.h) ? 1 : (/n/.test(g.h) ? -1 : 0);
    var corner = sx !== 0 && sy !== 0;
    var nw = Math.max(8, st.w + sx * ldx), nh = Math.max(8, st.h + sy * ldy);
    var keep = corner && (g.kind === 'image' || g.kind === 'icon' || g.kind === 'svg' || g.kind === 'text' || e.shiftKey);
    if (keep) { var k = Math.max(nw / st.w, nh / st.h); nw = Math.max(8, st.w * k); nh = Math.max(8, st.h * k); }
    if (g.kind === 'text') {
      if (corner) el.style.fontSize = vw(g.font * nw / st.w);
      setWidth(el, nw, g.abs); el.style.maxWidth = 'none';
      nh = el.getBoundingClientRect().height; // texto: altura automática
    } else if (g.kind === 'icon' || g.kind === 'svg') {
      setWidth(el, nw, g.abs); setHeight(el, nw * st.h / st.w, g.abs); nh = nw * st.h / st.w;
    } else {
      setWidth(el, nw, g.abs); el.style.maxWidth = 'none';
      if (sy !== 0 || keep) setHeight(el, nh, g.abs); else nh = st.h;
    }
    // âncora oposta fixa: centro desejado
    var dW = nw - st.w, dH = nh - st.h;
    var lcx = sx * dW / 2, lcy = (g.kind === 'text' ? dH / 2 * (sy === -1 ? -1 : 1) : sy * dH / 2);
    var wantCx = st.x + st.w / 2 + (lcx * cos - lcy * sin), wantCy = st.y + st.h / 2 + (lcx * sin + lcy * cos);
    var lr = layoutRect(el);
    var t = getTranslate(el);
    var offX = wantCx - (lr.x + lr.w / 2) - t.x, offY = wantCy - (lr.y + lr.h / 2) - t.y;
    if (g.abs) {
      var p = el.offsetParent || doc.body;
      el.style.left = round((el.offsetLeft + offX) / (p.clientWidth || win.innerWidth) * 100, 3) + '%';
      el.style.top = round((el.offsetTop + offY) / (p.clientHeight || win.innerHeight) * 100, 3) + '%';
    } else {
      el.style.translate = vw(t.x + offX) + ' ' + vh(t.y + offY);
    }
    drawSel();
    showTag(Math.round(nw) + ' × ' + Math.round(nh), e.clientX, e.clientY);
  }
  function setWidth(el, w, abs) {
    if (abs) { var p = el.offsetParent || doc.body; el.style.width = round(w / (p.clientWidth || win.innerWidth) * 100, 3) + '%'; }
    else el.style.width = vw(w);
    if (cs(el).display === 'inline') el.style.display = 'inline-block';
  }
  function setHeight(el, h, abs) {
    if (abs) { var p = el.offsetParent || doc.body; el.style.height = round(h / (p.clientHeight || win.innerHeight) * 100, 3) + '%'; }
    else el.style.height = vh(h);
  }
  function resizeOps(el) {
    var css = { width: el.style.width || null, height: el.style.height || null, 'max-width': el.style.maxWidth || null, 'font-size': el.style.fontSize || null, display: el.style.display || null };
    if (isAbsPct(el)) { css.left = el.style.left; css.top = el.style.top; } else css.translate = el.style.translate || null;
    return [{ t: 'style', id: el.getAttribute(ID), css: css }];
  }
  function beginRotate(el, e) {
    var vi = visualInfo(el);
    var cx = vi.x + vi.w / 2, cy = vi.y + vi.h / 2;
    gesture = { type: 'rotate', el: el, cx: cx, cy: cy, start: vi.rot, a0: Math.atan2(e.clientY - cy, e.clientX - cx), moved: false, st: { rotate: el.style.rotate } };
  }
  function rotateTo(g, e) {
    var a = Math.atan2(e.clientY - g.cy, e.clientX - g.cx);
    var deg = g.start + (a - g.a0) * 180 / Math.PI;
    deg = ((deg % 360) + 540) % 360 - 180;
    if (!e.shiftKey) { var near = Math.round(deg / 45) * 45; if (Math.abs(deg - near) < 4) deg = near; }
    deg = round(deg, 1);
    g.el.style.rotate = deg ? deg + 'deg' : '';
    drawSel();
    showTag(deg + '°', e.clientX, e.clientY);
  }

  /* ---------------- eventos ---------------- */
  var lastDown = 0;
  doc.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    var hd = e.target.closest && e.target.closest('#ssw-ov .hd');
    if (hd && sel) {
      e.preventDefault(); e.stopPropagation();
      try { e.target.setPointerCapture(e.pointerId); } catch (x) { }
      var h = hd.getAttribute('data-h');
      if (h === 'rot') { beginRotate(sel, e); root.classList.add('ssw-rot'); } else beginResize(sel, h, e);
      return;
    }
    if (editing && editing.contains(e.target)) return; // seleção de texto normal
    var el = pick(e.target, e.altKey);
    if (editing) endEdit();
    var additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!el) {
      // vazio: retângulo de seleção (Shift soma à seleção atual)
      e.preventDefault();
      if (!additive) select(null);
      beginMarquee(e, additive);
      post('focus');
      return;
    }
    e.preventDefault();
    if (additive) {
      toggleInSel(el);
      if (isMulti() && sels.indexOf(el) >= 0) beginGroupMove(e, null);
      else if (sel === el && !isLocked(el)) beginMove(el, e);
    } else if (isMulti() && sels.indexOf(el) >= 0) {
      beginGroupMove(e, el); // clique sem arrastar seleciona só este
    } else {
      if (el !== sel || isMulti()) select(el);
      if (!isLocked(el)) { beginMove(el, e); }
    }
    lastDown = Date.now();
    post('focus');
  }, true);

  doc.addEventListener('pointermove', function (e) {
    if (gesture) {
      var g = gesture;
      if (g.type === 'move') {
        var dx = e.clientX - g.sx, dy = e.clientY - g.sy;
        if (!g.moved && Math.abs(dx) + Math.abs(dy) < 3 / scale) return;
        if (!g.moved) { g.moved = true; root.classList.add('ssw-drag'); hovBox.style.display = 'none'; }
        moveTo(g, dx, dy, e.altKey);
      } else if (g.type === 'gmove' || g.type === 'marquee') {
        var gdx = e.clientX - g.sx, gdy = e.clientY - g.sy;
        if (!g.moved && Math.abs(gdx) + Math.abs(gdy) < 3 / scale) return;
        if (!g.moved) { g.moved = true; hovBox.style.display = 'none'; if (g.type === 'gmove') root.classList.add('ssw-drag'); }
        if (g.type === 'gmove') groupMoveTo(g, gdx, gdy, e.altKey); else marqueeTo(g, e);
      } else if (g.type === 'resize') { g.moved = true; resizeTo(g, e); }
      else if (g.type === 'rotate') { g.moved = true; rotateTo(g, e); }
      return;
    }
    if (editing) return;
    var el = pick(e.target, e.altKey);
    if (el !== hoverEl) { hoverEl = el; drawHover(); }
  }, true);

  function endGesture(e) {
    if (!gesture) return;
    var g = gesture; gesture = null;
    root.classList.remove('ssw-drag', 'ssw-rot');
    clearGuides(); tag.style.display = 'none';
    if (g.type === 'marquee') {
      mqBox.style.display = 'none';
      if (g.moved && g.rect) selectMany(g.base.concat(marqueeHits(g.rect)));
      return;
    }
    if (g.type === 'gmove') {
      if (!g.moved) { if (g.clicked) select(g.clicked); else refresh(); return; }
      post('commit', { ops: groupMoveOps(g.items.map(function (s) { return s.el; })), label: 'Mover' });
      refresh();
      return;
    }
    if (!g.moved) { refresh(); return; }
    var ops = g.type === 'move' ? moveOps(g.el) : g.type === 'resize' ? resizeOps(g.el)
      : [{ t: 'style', id: g.el.getAttribute(ID), css: { rotate: g.el.style.rotate || null } }];
    post('commit', { ops: ops, label: g.type === 'move' ? 'Mover' : g.type === 'resize' ? 'Redimensionar' : 'Girar' });
    refresh();
  }
  doc.addEventListener('pointerup', endGesture, true);
  doc.addEventListener('pointercancel', endGesture, true);
  doc.addEventListener('mouseleave', function () { if (!gesture) { hoverEl = null; drawHover(); } });

  doc.addEventListener('dblclick', function (e) {
    var el = pick(e.target);
    if (el && kindOf(el) === 'text') { e.preventDefault(); startEdit(el, e.clientX, e.clientY); }
    else if (el && kindOf(el) === 'image') post('action', { action: 'replaceImage', id: el.getAttribute(ID) });
    else if (el && kindOf(el) === 'icon') post('action', { action: 'replaceIcon', id: el.getAttribute(ID) });
  }, true);

  ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'wheel', 'submit'].forEach(function (t) {
    doc.addEventListener(t, function (e) {
      if (editing && editing.contains(e.target) && t !== 'wheel') return;
      if (t === 'wheel') {
        e.preventDefault();
        post('wheel', { dx: e.deltaX, dy: e.deltaY, ctrl: e.ctrlKey || e.metaKey });
      }
      if (t === 'click' || t === 'submit') e.preventDefault();
      e.stopPropagation();
    }, { capture: true, passive: false });
  });
  doc.addEventListener('dragstart', function (e) { if (!editing) e.preventDefault(); }, true);
  doc.addEventListener('dragenter', function (e) { e.preventDefault(); post('dragenter'); }, true);
  doc.addEventListener('dragover', function (e) { e.preventDefault(); }, true);
  doc.addEventListener('drop', function (e) { e.preventDefault(); }, true);

  doc.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    if (editing && editing.contains(e.target)) return;
    var el = pick(e.target);
    if (!(isMulti() && sels.indexOf(el) >= 0) && el !== sel) select(el);
    post('contextmenu', { x: e.clientX, y: e.clientY, hasSel: !!el });
  }, true);

  doc.addEventListener('input', function (e) { if (editing) scheduleLive(); }, true);
  var selTimer = null;
  doc.addEventListener('selectionchange', function () {
    if (!editing) return;
    var s = win.getSelection();
    if (s.rangeCount && editing.contains(s.getRangeAt(0).startContainer)) savedRange = s.getRangeAt(0).cloneRange();
    clearTimeout(selTimer);
    selTimer = setTimeout(function () { var c = !savedRange || savedRange.collapsed; post('textsel', { collapsed: c }); }, 120);
  });
  var pasteTimer = null;
  doc.addEventListener('paste', function (e) {
    clearTimeout(pasteTimer);
    var cd = e.clipboardData;
    if (editing) {
      e.preventDefault();
      var txt = cd ? cd.getData('text/plain') : '';
      if (txt) doc.execCommand('insertText', false, txt);
      return;
    }
    e.preventDefault();
    if (!cd) return;
    var files = Array.prototype.slice.call(cd.files || []).filter(function (f) { return /^image\//.test(f.type); });
    if (files.length) { post('paste', { kind: 'files', files: files }); return; }
    var text = cd.getData('text/plain') || '';
    post('paste', { kind: 'text', text: text });
  }, true);
  var lastClipEvt = 0;
  doc.addEventListener('copy', function (e) {
    if (editing) return;
    if (!sel) return;
    lastClipEvt = Date.now();
    e.preventDefault();
    var marker = 'ssw-element:' + sel.getAttribute(ID) + ':' + Date.now();
    e.clipboardData.setData('text/plain', marker);
    post('copy', { id: sel.getAttribute(ID), marker: marker, cut: false });
  }, true);
  doc.addEventListener('cut', function (e) {
    if (editing || !sel) return;
    lastClipEvt = Date.now();
    e.preventDefault();
    var marker = 'ssw-element:' + sel.getAttribute(ID) + ':' + Date.now();
    e.clipboardData.setData('text/plain', marker);
    post('copy', { id: sel.getAttribute(ID), marker: marker, cut: true });
  }, true);

  var nudgeTimer = null;
  function nudge(dx, dy) {
    if (isMulti()) {
      var list = sels.filter(function (el) { return !isLocked(el); });
      list.forEach(function (el) { shiftFrom(startState(el), dx, dy); });
      drawSel();
      clearTimeout(nudgeTimer);
      nudgeTimer = setTimeout(function () { post('commit', { ops: groupMoveOps(list), label: 'Mover', merge: 'nudge-multi' }); refresh(); }, 350);
      return;
    }
    if (!sel || isLocked(sel)) return;
    if (isAbsPct(sel)) {
      var p = sel.offsetParent || doc.body;
      sel.style.left = round((sel.offsetLeft + dx) / (p.clientWidth || win.innerWidth) * 100, 3) + '%';
      sel.style.top = round((sel.offsetTop + dy) / (p.clientHeight || win.innerHeight) * 100, 3) + '%';
    } else {
      var t = getTranslate(sel);
      sel.style.translate = vw(t.x + dx) + ' ' + vh(t.y + dy);
    }
    drawSel();
    var target = sel;
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(function () { post('commit', { ops: moveOps(target), label: 'Mover', merge: 'nudge-' + target.getAttribute(ID) }); refresh(); }, 350);
  }
  doc.addEventListener('keydown', function (e) {
    var k = e.key, mod = e.ctrlKey || e.metaKey;
    if (editing) {
      if (k === 'Escape') { e.preventDefault(); endEdit(); select(sel); }
      else if (k === 'Enter' && !e.shiftKey) { e.preventDefault(); doc.execCommand('insertLineBreak'); }
      else if (k === 'Tab') { e.preventDefault(); }
      e.stopPropagation();
      return;
    }
    if (mod && !e.shiftKey && (k === 'a' || k === 'A')) { e.preventDefault(); e.stopPropagation(); selectAll(); return; }
    if (/^Arrow/.test(k) && sel && !mod && (isMulti() || !isLocked(sel))) {
      e.preventDefault(); e.stopPropagation();
      var step = (e.shiftKey ? 10 : 1);
      nudge(k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0);
      return;
    }
    if (k === 'Enter' && sel && !isMulti() && kindOf(sel) === 'text') { e.preventDefault(); startEdit(sel, null, null, true); return; }
    // reserva para copiar/colar quando o navegador não dispara os eventos nativos
    if (mod && !e.shiftKey && (k === 'c' || k === 'C' || k === 'x' || k === 'X') && sel) {
      var cutting = /x/i.test(k), selId = sel.getAttribute(ID);
      setTimeout(function () { if (Date.now() - lastClipEvt < 400) return; post('copy', { id: selId, marker: null, cut: cutting, fallback: true }); }, 0);
      return;
    }
    if (mod && !e.shiftKey && (k === 'v' || k === 'V')) {
      clearTimeout(pasteTimer);
      pasteTimer = setTimeout(function () { post('paste', { kind: 'text', text: '', fallback: true }); }, 180);
      return;
    }
    if (k === 'Escape') { e.preventDefault(); select(null); post('key', { key: 'Escape' }); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); if (sel) post('key', { key: 'Delete' }); return; }
    if (mod && /^[zyasdglbiu]$/i.test(k)) { e.preventDefault(); post('key', { key: k.toLowerCase(), shift: e.shiftKey, mod: true }); return; }
    if (k === 'PageDown' || k === 'PageUp' || (mod && (k === 'ArrowUp' || k === 'ArrowDown'))) { e.preventDefault(); post('key', { key: k, mod: mod }); return; }
    if ((mod && (k === '+' || k === '=' || k === '-' || k === '0'))) { e.preventDefault(); post('key', { key: k, mod: true }); return; }
    if (k === 'F5' || (mod && k === 'Enter')) { e.preventDefault(); post('key', { key: 'present' }); return; }
    e.stopPropagation();
  }, true);

  win.addEventListener('resize', function () { drawSel(); drawHover(); });

  /* ---------------- operações vindas do app ---------------- */
  function captureIcons(scope) {
    var list = (scope || doc).querySelectorAll ? (scope || doc).querySelectorAll('i[data-lucide][' + ID + ']') : [];
    Array.prototype.forEach.call(list, function (i) { iconSrc.set(i.getAttribute(ID), i.outerHTML); });
    if (scope && scope.matches && scope.matches('i[data-lucide][' + ID + ']')) iconSrc.set(scope.getAttribute(ID), scope.outerHTML);
  }
  function renderIcons() { try { if (win.lucide) win.lucide.createIcons(); } catch (e) { } }
  function frag(html) { var t = doc.createElement('template'); t.innerHTML = html; return Array.prototype.slice.call(t.content.childNodes); }
  function applyOps(ops) {
    var touched = false;
    (ops || []).forEach(function (op) {
      var el = op.id ? byId(op.id) : null;
      if (op.t === 'style' && el) {
        for (var p in op.css) { var v = op.css[p]; if (v === null || v === '') el.style.removeProperty(p); else el.style.setProperty(p, v); }
      } else if (op.t === 'attr' && el) {
        if (op.value === null) el.removeAttribute(op.name); else el.setAttribute(op.name, op.value);
      } else if (op.t === 'html' && el) {
        el.innerHTML = op.html; captureIcons(el); touched = true;
      } else if (op.t === 'remove' && el) {
        sels = sels.filter(function (x) { return x !== el; });
        if (el === sel) sel = sels.length ? sels[sels.length - 1] : null;
        if (el === hoverEl) hoverEl = null;
        el.remove();
      } else if (op.t === 'replace' && el) {
        var nodes = frag(op.html); var first = nodes[0];
        el.replaceWith.apply(el, nodes);
        nodes.forEach(function (n) { if (n.nodeType === 1) captureIcons(n); });
        if (el === sel) sel = first && first.nodeType === 1 ? first : null;
        touched = true;
      } else if (op.t === 'insert') {
        var parent = op.parentId === '__body__' ? doc.body : op.parentId ? byId(op.parentId) : slides()[op.slide == null ? current : op.slide];
        if (!parent) return;
        var before = op.beforeId ? byId(op.beforeId) : null;
        var ns = frag(op.html);
        ns.forEach(function (n) { parent.insertBefore(n, before && before.parentNode === parent ? before : null); if (n.nodeType === 1) captureIcons(n); });
        touched = true;
      } else if (op.t === 'insertAfter') {
        var ref = byId(op.refId); if (!ref) return;
        var ns2 = frag(op.html);
        var anchor = ref.nextSibling;
        ns2.forEach(function (n) { ref.parentNode.insertBefore(n, anchor); if (n.nodeType === 1) captureIcons(n); });
        touched = true;
      } else if (op.t === 'move' && el) {
        var mp = op.parentId === '__body__' ? doc.body : op.parentId ? byId(op.parentId) : el.parentNode;
        var mb = op.beforeId ? byId(op.beforeId) : null;
        if (mp) mp.insertBefore(el, mb && mb.parentNode === mp ? mb : null);
      } else if (op.t === 'headAppend') {
        frag(op.html).forEach(function (n) { doc.head.appendChild(n); });
      }
    });
    if (touched) renderIcons();
  }

  win.addEventListener('message', function (e) {
    if (e.source !== win.parent) return;
    var m = e.data; if (!m || !m.__ssw || m.token !== cfg.token) return;
    switch (m.type) {
      case 'showSlide': if (editing) endEdit(); showSlide(m.index); break;
      case 'select': {
        var el = byId(m.id);
        if (el) { var s = slideOf(el); var idx = slides().indexOf(s); if (idx >= 0 && idx !== current) showSlide(idx); select(el, { silent: !!m.silent }); }
        else select(null, { silent: !!m.silent });
        break;
      }
      case 'selectParent': {
        if (!sel || isMulti()) break;
        var pnode = sel.parentElement;
        while (pnode && !pnode.hasAttribute(ID)) pnode = pnode.parentElement;
        if (pnode && !isSlideOrDeck(pnode)) select(pnode);
        break;
      }
      case 'deselect': if (editing) endEdit(); select(null, { silent: !!m.silent }); break;
      case 'ops':
        applyOps(m.ops);
        if (m.selectMany) selectMany(m.selectMany.map(byId));
        else if (m.select !== undefined) { var ns = m.select ? byId(m.select) : null; select(ns); }
        else postSelection(true);
        drawSel();
        break;
      case 'selectMany': selectMany((m.ids || []).map(byId), { silent: !!m.silent }); break;
      case 'selectAll': selectAll(); break;
      case 'alignGroup': alignGroup(m); break;
      case 'exec': if (!execText(m.cmd, m.value)) post('execFailed', { cmd: m.cmd }); else if (sel) post('select', { info: describe(sel), quiet: true }); break;
      case 'startEdit': { var te = byId(m.id); if (te) { select(te, { silent: true }); startEdit(te, null, null, true); } break; }
      case 'endEdit': endEdit(); break;
      case 'nudge': nudge(m.dx || 0, m.dy || 0); break;
      case 'alignPage': {
        if (isMulti()) {
          var gl = sels.filter(function (x) { return !isLocked(x); });
          if (!gl.length) break;
          var GR = groupRect(gl), gdx = 0, gdy = 0, PW = win.innerWidth, PH = win.innerHeight;
          if (m.h === 'left') gdx = -GR.x; else if (m.h === 'center') gdx = (PW - GR.w) / 2 - GR.x; else if (m.h === 'right') gdx = PW - GR.w - GR.x;
          if (m.v === 'top') gdy = -GR.y; else if (m.v === 'middle') gdy = (PH - GR.h) / 2 - GR.y; else if (m.v === 'bottom') gdy = PH - GR.h - GR.y;
          gl.forEach(function (x) { shiftFrom(startState(x), gdx, gdy); });
          post('commit', { ops: groupMoveOps(gl), label: 'Alinhar à página' });
          refresh();
          break;
        }
        if (!sel || isLocked(sel)) break;
        var av = visualInfo(sel), W0 = win.innerWidth, H0 = win.innerHeight, adx = 0, ady = 0;
        if (m.h === 'left') adx = -av.x; else if (m.h === 'center') adx = (W0 - av.w) / 2 - av.x; else if (m.h === 'right') adx = W0 - av.w - av.x;
        if (m.v === 'top') ady = -av.y; else if (m.v === 'middle') ady = (H0 - av.h) / 2 - av.y; else if (m.v === 'bottom') ady = H0 - av.h - av.y;
        if (isAbsPct(sel)) {
          var ap = sel.offsetParent || doc.body;
          sel.style.left = round((sel.offsetLeft + adx) / (ap.clientWidth || W0) * 100, 3) + '%';
          sel.style.top = round((sel.offsetTop + ady) / (ap.clientHeight || H0) * 100, 3) + '%';
        } else {
          sel.style.translate = vw(av.tx + adx) + ' ' + vh(av.ty + ady);
        }
        post('commit', { ops: moveOps(sel), label: 'Alinhar à página' });
        refresh();
        break;
      }
      case 'zoom': setScale(m.scale); drawSel(); drawHover(); break;
      case 'getConfig': {
        var c = null; try { c = JSON.parse(JSON.stringify((win.tailwind && win.tailwind.config) || null)); } catch (x) { }
        post('config', { config: c, req: m.req });
        break;
      }
      case 'audit': {
        // verificação de qualidade: conteúdo fora da área do slide ou texto cortado por overflow
        var prev = current, all = slides(), issues = [];
        var W0 = win.innerWidth, H0 = win.innerHeight, TOL = 4;
        var which = m.slides && m.slides.length ? m.slides : all.map(function (_, k) { return k; });
        which.forEach(function (k) {
          var s = all[k]; if (!s) return;
          all.forEach(function (o, j) { if (j === k) { o.setAttribute('data-ssw-current', ''); o.classList.add('active'); } else { o.removeAttribute('data-ssw-current'); o.classList.remove('active'); } });
          var out = 0, clipped = 0;
          Array.prototype.forEach.call(s.querySelectorAll('[' + ID + ']'), function (el) {
            if (el.closest('[data-ssw-ctrl]') || (el.parentElement && el.parentElement.closest('svg'))) return;
            var st = cs(el); if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return;
            var r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
            var content = hasDirectText(el) || /^(IMG|SVG|svg)$/.test(el.tagName) || el.hasAttribute('data-lucide');
            if (content && (r.right > W0 + TOL || r.bottom > H0 + TOL || r.left < -TOL || r.top < -TOL) && !isSlideOrDeck(el)) out++;
            if (/(hidden|clip|auto|scroll)/.test(st.overflow + st.overflowY) && el.textContent.trim() && el.scrollHeight > el.clientHeight + TOL && el.clientHeight > 0) clipped++;
          });
          if (out || clipped) issues.push({ slide: k, out: out, clipped: clipped });
        });
        showSlide(prev);
        post('audit', { req: m.req, issues: issues, total: all.length });
        break;
      }
      case 'measure': {
        var me = byId(m.id); post('measure', { req: m.req, rect: me ? visualInfo(me) : null, vw: win.innerWidth, vh: win.innerHeight });
        break;
      }
    }
  });

  /* ---------------- inicialização ---------------- */
  captureIcons(doc);
  renderIcons();
  showSlide(cfg.current || 0);
  function ready() {
    // dois quadros garantem o slide pintado; o plano B cobre janela minimizada/sem quadros (o navegador pausa o rAF)
    var go = function () {
      var sent = false;
      var fire = function () { if (sent) return; sent = true; post('ready', { slides: slides().length, current: current }); };
      requestAnimationFrame(function () { requestAnimationFrame(fire); });
      setTimeout(fire, 250);
    };
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { setTimeout(go, 30); }); else setTimeout(go, 60);
  }
  if (doc.readyState === 'complete') ready(); else win.addEventListener('load', ready);
};
