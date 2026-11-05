/* ============================================================
   Slide Studio WEG — utilitários de interface
============================================================ */
(function (global) {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function icons(root) { try { global.lucide.createIcons({ root: root || document }); } catch (e) { /* sem ícones */ } }
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function debounce(fn, ms) { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), ms); }; }

  /* ---------------- toasts ---------------- */
  function toast(msg, opts) {
    opts = opts || {};
    const type = opts.type || 'info';
    const ic = { info: 'info', ok: 'check-circle-2', err: 'alert-circle', warn: 'alert-triangle', busy: 'loader-2' }[type] || 'info';
    const t = el('<div class="toast ' + type + '"><i data-lucide="' + ic + '"' + (type === 'busy' ? ' class="spin"' : '') + '></i><span></span></div>');
    t.querySelector('span').innerHTML = opts.html ? msg : esc(msg);
    if (opts.action) {
      const b = document.createElement('button'); b.textContent = opts.action.label;
      b.onclick = () => { opts.action.onClick(); close(); };
      t.appendChild(b);
    }
    $('#toasts').appendChild(t); icons(t);
    let timer = null;
    function close() { clearTimeout(timer); t.style.transition = 'opacity .2s, transform .2s'; t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; setTimeout(() => t.remove(), 220); }
    if (opts.duration !== 0) timer = setTimeout(close, opts.duration || (type === 'err' ? 7000 : 3200));
    return { close, set(text) { t.querySelector('span').textContent = text; } };
  }

  /* ---------------- modais ---------------- */
  function modal(o) {
    const ov = el('<div class="overlay"><div class="modal' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true"></div></div>');
    const m = ov.firstElementChild;
    m.innerHTML = '<div class="modal-head">' + (o.icon ? '<span class="mh-ic"><i data-lucide="' + o.icon + '"></i></span>' : '') +
      '<div><h3>' + esc(o.title || '') + '</h3>' + (o.sub ? '<p>' + esc(o.sub) + '</p>' : '') + '</div>' +
      '<button class="mx" aria-label="Fechar"><i data-lucide="x"></i></button></div><div class="modal-body"></div><div class="modal-foot"></div>';
    const body = m.querySelector('.modal-body');
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    const foot = m.querySelector('.modal-foot');
    (o.buttons || []).forEach(b => {
      const btn = el('<button class="btn ' + (b.cls || 'btn-outline') + '">' + (b.icon ? '<i data-lucide="' + b.icon + '"></i>' : '') + esc(b.label) + '</button>');
      btn.onclick = async () => { const r = b.onClick ? await b.onClick(api) : undefined; if (r !== false && b.close !== false) close(); };
      foot.appendChild(btn);
    });
    if (!o.buttons || !o.buttons.length) foot.remove();
    let closed = false;
    function close() { if (closed) return; closed = true; ov.remove(); document.removeEventListener('keydown', onKey, true); if (o.onClose) o.onClose(); }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    m.querySelector('.mx').onclick = close;
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov); icons(ov);
    const api = { el: m, body, close };
    const f = m.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 30);
    return api;
  }
  function confirmBox(msg, o) {
    o = o || {};
    return new Promise(resolve => {
      let answered = false;
      modal({
        title: o.title || 'Confirmar', icon: o.icon || (o.danger ? 'alert-triangle' : 'help-circle'), body: '<p style="margin:4px 0 8px;line-height:1.5">' + esc(msg) + '</p>',
        buttons: [
          { label: o.cancel || 'Cancelar', cls: 'btn-outline', onClick: () => { answered = true; resolve(false); } },
          { label: o.ok || 'Confirmar', cls: o.danger ? 'btn-danger' : 'btn-primary', onClick: () => { answered = true; resolve(true); } }
        ],
        onClose: () => { if (!answered) resolve(false); }
      });
    });
  }

  /* ---------------- popovers / menus ---------------- */
  let openPop = null;
  function closePop() { if (openPop) { const p = openPop; openPop = null; p.close(); } }
  function popover(anchor, content, o) {
    o = o || {};
    closePop();
    const p = document.createElement('div');
    p.className = 'pop ' + (o.cls || '');
    if (typeof content === 'string') p.innerHTML = content; else p.appendChild(content);
    document.body.appendChild(p); icons(p);
    place(p, anchor, o.align);
    const onDown = e => { if (!p.contains(e.target) && !(anchor && anchor.nodeType === 1 && anchor.contains(e.target))) closePop(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); } };
    setTimeout(() => { document.addEventListener('mousedown', onDown, true); document.addEventListener('keydown', onKey, true); }, 0);
    const api = {
      el: p,
      close() {
        document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey, true);
        p.remove(); if (o.onClose) o.onClose();
        if (openPop === api) openPop = null;
        document.dispatchEvent(new CustomEvent('ssw:popclose'));
      },
      reposition() { place(p, anchor, o.align); }
    };
    openPop = api;
    return api;
  }
  function place(p, anchor, align) {
    let x, y, ah = 0, aw = 0;
    if (anchor && anchor.nodeType === 1) { const r = anchor.getBoundingClientRect(); x = r.left; y = r.bottom + 6; ah = r.height; aw = r.width; if (align === 'right') x = r.right; if (align === 'center') x = r.left + r.width / 2; }
    else { x = anchor.x; y = anchor.y; }
    const pw = p.offsetWidth, ph = p.offsetHeight;
    if (align === 'right') x -= pw;
    if (align === 'center') x -= pw / 2;
    if (x + pw > innerWidth - 8) x = innerWidth - pw - 8;
    if (x < 8) x = 8;
    if (y + ph > innerHeight - 8) y = Math.max(8, (anchor && anchor.nodeType === 1 ? y - ah - 12 - ph : innerHeight - ph - 8));
    p.style.left = Math.round(x) + 'px'; p.style.top = Math.round(y) + 'px';
  }
  function menu(anchor, items, o) {
    const wrap = document.createElement('div');
    items.forEach(it => {
      if (!it) return;
      if (it.sep) { wrap.appendChild(el('<div class="mi-sep"></div>')); return; }
      if (it.head) { wrap.appendChild(el('<div class="mi-head">' + esc(it.head) + '</div>')); return; }
      if (it.node) { wrap.appendChild(it.node); return; }
      const b = el('<button class="mi' + (it.danger ? ' danger' : '') + '"' + (it.disabled ? ' disabled' : '') + '>' +
        (it.icon ? '<i data-lucide="' + it.icon + '"></i>' : '') + '<span>' + esc(it.label) + '</span>' + (it.kb ? '<span class="kb">' + esc(it.kb) + '</span>' : '') + '</button>');
      b.onclick = () => { closePop(); if (it.onClick) it.onClick(); };
      wrap.appendChild(b);
    });
    return popover(anchor, wrap, o);
  }

  /* ---------------- seletor de cores ---------------- */
  const DEFAULT_COLORS = ['#000000', '#1E293B', '#475569', '#94A3B8', '#E2E8F0', '#FFFFFF', '#0A2D6D', '#28B9DA',
    '#C80D0D', '#ED1515', '#EF8300', '#FFD600', '#13CE66', '#0B8A45', '#00A7DB', '#6C4A81'];
  function colorPicker(anchor, o) {
    const cur = String(o.value || '').toUpperCase();
    const doc = (o.docColors || []).map(c => String(c).toUpperCase());
    const sw = c => '<button class="cp-sw' + (c === cur ? ' is-on' : '') + '" data-c="' + c + '" title="' + c + '" style="background:' + c + '"></button>';
    const html = '<div class="cp">' +
      (o.title ? '<div class="cp-title" style="margin-bottom:10px;color:var(--ink-2);font-size:12px">' + esc(o.title) + '</div>' : '') +
      '<div class="cp-title">Cores da marca</div><div class="cp-grid">' + doc.slice(0, 16).map(sw).join('') + '</div>' +
      '<div class="cp-title">Cores padrão</div><div class="cp-grid">' + (o.allowNone ? '<button class="cp-sw none" data-c="transparent" title="Sem cor"></button>' : '') + DEFAULT_COLORS.slice(0, o.allowNone ? 15 : 16).map(sw).join('') + '</div>' +
      '<div class="cp-custom"><span class="cbtn"><i style="background:' + (cur && cur !== 'TRANSPARENT' ? cur : '#00579D') + '"></i><input type="color" value="' + (/^#[0-9A-F]{6}$/.test(cur) ? cur.toLowerCase() : '#00579d') + '"></span>' +
      '<input class="input" maxlength="7" value="' + (/^#/.test(cur) ? cur : '') + '" placeholder="#00579D"></div></div>';
    const p = popover(anchor, html, { align: o.align });
    const root = p.el;
    root.querySelectorAll('.cp-sw').forEach(b => b.onclick = () => { o.onPick(b.dataset.c === 'transparent' ? 'transparent' : b.dataset.c); closePop(); });
    const native = root.querySelector('input[type=color]'), hex = root.querySelector('.cp-custom .input'), prev = root.querySelector('.cbtn i');
    native.addEventListener('input', () => { hex.value = native.value.toUpperCase(); prev.style.background = native.value; o.onPick(native.value.toUpperCase(), true); });
    native.addEventListener('change', () => { o.onPick(native.value.toUpperCase()); });
    hex.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      let v = hex.value.trim(); if (!v.startsWith('#')) v = '#' + v;
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) { o.onPick(v.toUpperCase()); closePop(); }
    });
    return p;
  }

  /* ---------------- arquivos / clipboard ---------------- */
  function downloadBlob(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  }
  function downloadText(name, text, type) { downloadBlob(name, new Blob([text], { type: type || 'text/plain;charset=utf-8' })); }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove(); return ok;
    }
  }
  function fileSafe(s) { return String(s || 'apresentacao').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'apresentacao'; }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'agora';
    if (diff < 3600) return 'há ' + Math.floor(diff / 60) + ' min';
    if (diff < 86400) return 'há ' + Math.floor(diff / 3600) + ' h';
    if (diff < 86400 * 7) return 'há ' + Math.floor(diff / 86400) + ' d';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtClock(ms) { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function fmtSize(n) { return n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }

  global.UI = { $, $$, esc, el, icons, debounce, toast, modal, confirm: confirmBox, popover, closePop, hasPop: () => !!openPop, menu, colorPicker, downloadBlob, downloadText, copyText, fileSafe, fmtDate, fmtClock, fmtSize };
})(window);
