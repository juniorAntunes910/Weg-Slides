/* ============================================================
   Slide Studio WEG — controlador do editor visual (lado do app)
   - Mantém o Deck (fonte da verdade) e espelha cada operação no iframe do editor
   - Iframes sandbox (origem opaca), renderização com buffer duplo (sem piscar)
   - Histórico (desfazer/refazer), miniaturas, zoom, copiar/colar, camadas, slides
============================================================ */
(function (global) {
  'use strict';
  const { Deck, W, H, ID, SLIDE } = SSWDeck;
  const ORIGIN = (location.origin && location.origin !== 'null') ? location.origin : '*';
  const BLANK = '<!DOCTYPE html><html><body style="margin:0;background:#fff"></body></html>';

  const newToken = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* imagens grandes ficam fora dos snapshots do histórico */
  const assetKey = new Map(), assetVal = new Map();
  function intern(html) {
    return html.replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{1500,}/gi, m => {
      let k = assetKey.get(m);
      if (!k) { k = 'ssw-asset:' + (assetKey.size + 1) + ':'; assetKey.set(m, k); assetVal.set(k, m); }
      return k;
    });
  }
  function unintern(html) { return html.replace(/ssw-asset:\d+:/g, k => assetVal.get(k) || k); }

  class Editor {
    constructor(o) {
      this.o = o;
      this.deck = null;
      this.current = 0;
      this.sel = null;
      this.editingId = null;
      this.textCollapsed = true;
      this.zoom = 1; this.zoomMode = 'fit';
      this.history = []; this.hIndex = -1;
      this.version = 0;
      this.clip = null;
      this.front = null; this.pending = null;
      this.thumbs = []; this.thumbQueue = new Set(); this.thumbTimer = null; this.thumbBusy = false;
      this.reqs = new Map(); this.reqN = 0;

      // palco
      this.page = document.createElement('div'); this.page.className = 'cv-page is-loading';
      this.frameWrap = document.createElement('div'); this.frameWrap.className = 'cv-frame';
      this.frameWrap.style.width = W + 'px'; this.frameWrap.style.height = H + 'px';
      this.frames = [this.mkFrame(), this.mkFrame()];
      this.drop = document.createElement('div'); this.drop.className = 'cv-drop';
      this.drop.innerHTML = '<div class="cv-drop-msg"><span>Solte aqui para inserir no slide</span></div>';
      this.page.appendChild(this.frameWrap); this.page.appendChild(this.drop);
      o.pageHost.appendChild(this.page);
      this.bindDrop();

      window.addEventListener('message', e => this.onMessage(e));
      const ro = new ResizeObserver(() => { if (this.zoomMode === 'fit') this.fit(); });
      ro.observe(o.scroller);
    }

    mkFrame() {
      const f = document.createElement('iframe');
      f.className = 'cv-iframe';
      f.setAttribute('sandbox', 'allow-scripts');
      f.setAttribute('title', 'Slide em edição');
      f.setAttribute('scrolling', 'no');
      f.style.width = W + 'px'; f.style.height = H + 'px';
      f.srcdoc = BLANK;
      this.frameWrap.appendChild(f);
      return f;
    }

    /* ---------------- carregar / renderizar ---------------- */
    load(html, opts) {
      opts = opts || {};
      this.deck = new Deck(html);
      this.current = clamp(opts.current || 0, 0, Math.max(0, this.deck.slides().length - 1));
      this.history = [{ html: intern(this.deck.rawHtml()), label: 'Abrir', time: Date.now(), current: this.current }];
      this.hIndex = 0;
      this.sel = null; this.editingId = null; this.version++;
      this.front = null; this.pending = null;
      this.frames.forEach(f => { f.classList.remove('is-front'); });
      this.page.classList.add('is-loading');
      this.thumbs.forEach(t => t.el.remove()); this.thumbs = [];
      this.fit();
      this.renderEditor();
      this.syncFilmstrip();
      this.emit('onSelect', null);
      this.emit('onHistory');
    }
    unload() {
      this.deck = null; this.sel = null; this.front = null; this.pending = null;
      this.frames.forEach(f => { f.classList.remove('is-front'); f.srcdoc = BLANK; });
      this.thumbs.forEach(t => t.el.remove()); this.thumbs = [];
    }

    renderEditor() {
      if (!this.deck) return;
      const tok = newToken();
      const back = this.frames.find(f => !this.front || f !== this.front.frame);
      const cfg = { token: tok, origin: ORIGIN, current: this.current, scale: this.zoom };
      const html = SSWDeck.editorHtml(this.deck, { current: this.current, runtime: SSWRuntime, config: cfg });
      this.pending = { frame: back, token: tok, version: this.version, reselect: this.sel && this.sel.id };
      back.srcdoc = html;
      clearTimeout(this.pendingTimer);
      this.pendingTimer = setTimeout(() => { if (this.pending && this.pending.token === tok) this.swap(); }, 9000);
    }
    swap() {
      const p = this.pending; if (!p) return;
      this.pending = null; clearTimeout(this.pendingTimer);
      const old = this.front;
      this.front = { frame: p.frame, token: p.token };
      p.frame.classList.add('is-front');
      this.page.classList.remove('is-loading');
      if (old && old.frame !== p.frame) {
        old.frame.classList.remove('is-front');
        setTimeout(() => { if (!this.front || this.front.frame !== old.frame) { if (!this.pending || this.pending.frame !== old.frame) old.frame.srcdoc = BLANK; } }, 400);
      }
      this.post({ type: 'zoom', scale: this.zoom });
      if (p.reselect && this.deck.byId(p.reselect)) this.post({ type: 'select', id: p.reselect });
      else this.setSel(null);
      if (p.version !== this.version) this.renderEditor();
      this.emit('onReady');
    }
    post(msg) {
      if (!this.front) return;
      msg.__ssw = true; msg.token = this.front.token;
      try { this.front.frame.contentWindow.postMessage(msg, '*'); } catch (e) { /* frame descarregado */ }
    }
    request(type, data) {
      return new Promise(resolve => {
        const req = ++this.reqN;
        this.reqs.set(req, resolve);
        this.post(Object.assign({ type, req }, data || {}));
        setTimeout(() => { if (this.reqs.has(req)) { this.reqs.delete(req); resolve(null); } }, 2500);
      });
    }
    emit(name, ...args) { const fn = this.o[name]; if (typeof fn === 'function') { try { return fn(...args); } catch (e) { console.error(e); } } }

    /* ---------------- mensagens do iframe ---------------- */
    onMessage(e) {
      const m = e.data;
      if (!m || !m.__ssw) return;
      if (this.pending && e.source === this.pending.frame.contentWindow && m.token === this.pending.token) {
        if (m.type === 'ready') this.swap();
        return;
      }
      if (!this.front || e.source !== this.front.frame.contentWindow || m.token !== this.front.token) return;
      switch (m.type) {
        case 'select': this.setSel(m.info, m.quiet); break;
        case 'rect': if (this.sel && (m.multi ? this.sel.multi : this.sel.id === m.id)) { this.sel.rect = m.rect; this.emit('onRect', this.sel); } break;
        case 'editing':
          this.editingId = m.on ? m.id : null; this.textCollapsed = true;
          this.emit('onEditing', this.editingId);
          break;
        case 'textsel': this.textCollapsed = !!m.collapsed; this.emit('onTextSel', this.textCollapsed); break;
        case 'live': { const r = this.applyToDeck(m.ops); this.afterChange(r, true); break; }
        case 'commit': { const r = this.applyToDeck(m.ops); this.commit(m.label || 'Editar', m.merge); this.afterChange(r); break; }
        case 'action': this.emit('onAction', m.action, m.id); break;
        case 'contextmenu': { const p = this.toScreen(m.x, m.y); this.emit('onContext', p.x, p.y, !!m.hasSel); break; }
        case 'key': this.emit('onKey', m); break;
        case 'wheel': this.onWheel(m); break;
        case 'paste': this.emit('onPaste', m); break;
        case 'copy': this.copySelection(m.cut, m.marker); break;
        case 'focus': this.emit('onFrameFocus'); break;
        case 'dragenter': this.showDrop(true); break;
        case 'config': case 'measure': case 'audit': { const r = this.reqs.get(m.req); if (r) { this.reqs.delete(m.req); r(m); } break; }
      }
    }
    setSel(info, quiet) {
      this.sel = info || null;
      if (!this.sel) this.editingId = null;
      this.emit('onSelect', this.sel, quiet);
    }
    toScreen(x, y) {
      const fr = this.frameWrap.getBoundingClientRect();
      return { x: fr.left + x * this.zoom, y: fr.top + y * this.zoom };
    }
    selScreenRect() {
      if (!this.sel || !this.sel.rect) return null;
      const r = this.sel.rect, p = this.toScreen(r.x, r.y);
      return { left: p.x, top: p.y, width: r.w * this.zoom, height: r.h * this.zoom };
    }
    onWheel(m) {
      const s = this.o.scroller;
      if (m.ctrl) { this.setZoom(this.zoom * (m.dy > 0 ? 0.9 : 1.1)); return; }
      if (s.scrollHeight > s.clientHeight + 2 || s.scrollWidth > s.clientWidth + 2) s.scrollBy(m.dx, m.dy);
    }

    /* ---------------- operações ---------------- */
    tpl(html) { const t = this.deck.doc.createElement('template'); t.innerHTML = html; return Array.from(t.content.childNodes); }
    applyToDeck(ops) {
      const d = this.deck; if (!d) return { structural: false, dirty: new Set() };
      let structural = false, all = false;
      const dirtyEls = new Set();
      const mark = el => { const s = el && d.slideOf(el); if (s) dirtyEls.add(s); else all = true; };
      for (const op of ops || []) {
        const el = op.id ? d.byId(op.id) : null;
        switch (op.t) {
          case 'style':
            if (!el) break;
            for (const p of Object.keys(op.css)) { const v = op.css[p]; if (v == null || v === '') el.style.removeProperty(p); else el.style.setProperty(p, v); }
            if (!el.getAttribute('style')) el.removeAttribute('style');
            mark(el); break;
          case 'attr':
            if (!el) break;
            if (op.value == null) el.removeAttribute(op.name); else el.setAttribute(op.name, op.value);
            mark(el); break;
          case 'html':
            if (!el) break; el.innerHTML = op.html; mark(el); break;
          case 'remove':
            if (!el) break; mark(el); if (el.hasAttribute(SLIDE)) structural = true; el.remove(); break;
          case 'replace':
            if (!el) break; mark(el); el.replaceWith(...this.tpl(op.html)); break;
          case 'insert': {
            const parent = op.parentId === '__body__' ? d.doc.body : op.parentId ? d.byId(op.parentId) : d.slideAt(op.slide == null ? this.current : op.slide);
            if (!parent) break;
            const before = op.beforeId ? d.byId(op.beforeId) : null;
            this.tpl(op.html).forEach(n => parent.insertBefore(n, before && before.parentNode === parent ? before : null));
            if (/data-ssw-slide/.test(op.html)) structural = true; else mark(parent);
            break;
          }
          case 'insertAfter': {
            const ref = d.byId(op.refId); if (!ref) break;
            const anchor = ref.nextSibling;
            this.tpl(op.html).forEach(n => ref.parentNode.insertBefore(n, anchor));
            if (/data-ssw-slide/.test(op.html)) structural = true; else mark(ref);
            break;
          }
          case 'move': {
            if (!el) break;
            const parent = op.parentId === '__body__' ? d.doc.body : op.parentId ? d.byId(op.parentId) : el.parentNode;
            const before = op.beforeId ? d.byId(op.beforeId) : null;
            if (parent) parent.insertBefore(el, before && before.parentNode === parent ? before : null);
            if (el.hasAttribute(SLIDE)) structural = true; else mark(el);
            break;
          }
          case 'headAppend': d.doc.head.insertAdjacentHTML('beforeend', op.html); all = true; break;
        }
      }
      this.version++;
      const slides = d.slides();
      const dirty = new Set();
      if (all) slides.forEach((_, i) => dirty.add(i));
      else dirtyEls.forEach(s => { const i = slides.indexOf(s); if (i >= 0) dirty.add(i); });
      return { structural, dirty };
    }
    afterChange(r, live) {
      if (r.structural) this.syncFilmstrip(); else this.queueThumbs(r.dirty);
      this.emit('onChange', !!live);
    }
    /** aplica ops no deck + iframe e registra no histórico */
    apply(ops, opt) {
      opt = opt || {};
      if (!this.deck || !ops || !ops.length) return;
      const r = this.applyToDeck(ops);
      this.post({ type: 'ops', ops, select: opt.select });
      if (opt.record !== false) this.commit(opt.label || 'Editar', opt.merge);
      this.afterChange(r);
    }
    commit(label, merge) {
      const snap = { html: intern(this.deck.rawHtml()), label, merge, time: Date.now(), current: this.current };
      this.history.splice(this.hIndex + 1);
      const top = this.history[this.hIndex];
      if (merge && top && top.merge === merge && snap.time - top.time < 2500) this.history[this.hIndex] = snap;
      else {
        this.history.push(snap);
        if (this.history.length > 80) this.history.shift();
        this.hIndex = this.history.length - 1;
      }
      this.emit('onHistory');
    }
    get canUndo() { return this.hIndex > 0; }
    get canRedo() { return this.hIndex < this.history.length - 1; }
    undo() {
      if (this.editingId) { this.post({ type: 'endEdit' }); setTimeout(() => this.undo(), 80); this.editingId = null; return; }
      if (!this.canUndo) return;
      const undone = this.history[this.hIndex];
      this.hIndex--;
      this.restore(this.history[this.hIndex], undone.current);
    }
    redo() {
      if (!this.canRedo) return;
      this.hIndex++;
      const snap = this.history[this.hIndex];
      this.restore(snap, snap.current);
    }
    restore(snap, goto) {
      const keep = this.sel && this.sel.id;
      this.deck = new Deck(unintern(snap.html));
      const n = this.deck.slides().length;
      this.current = clamp(goto == null ? this.current : goto, 0, Math.max(0, n - 1));
      this.version++;
      this.sel = keep && this.deck.byId(keep) ? { id: keep } : null;
      this.renderEditor();
      this.syncFilmstrip();
      this.emit('onSelect', null);
      this.emit('onChange', false);
      this.emit('onHistory');
    }

    /* ---------------- slides ---------------- */
    get slideCount() { return this.deck ? this.deck.slides().length : 0; }
    goTo(i) {
      if (!this.deck) return;
      i = clamp(i, 0, this.slideCount - 1);
      if (this.editingId) this.post({ type: 'endEdit' });
      this.current = i;
      this.post({ type: 'showSlide', index: i });
      this.setSel(null);
      this.highlightThumb();
      this.emit('onSlides');
    }
    parentRef(el) { const p = el.parentElement; return p === this.deck.doc.body ? '__body__' : p.getAttribute(ID); }
    nextIdSibling(el) { let n = el.nextElementSibling; while (n && !n.hasAttribute(ID)) n = n.nextElementSibling; return n ? n.getAttribute(ID) : null; }
    addSlide(layout, opts) {
      const d = this.deck; if (!d) return;
      const L = SSWDeck.LAYOUTS[layout] || SSWDeck.LAYOUTS.blank;
      const sec = d.createSlide(L.html(opts || {}));
      const ss = d.slides();
      const after = ss[this.current];
      const needIcons = /data-lucide/.test(sec.innerHTML) && d.ensureLucide();
      const op = after
        ? { t: 'insert', parentId: this.parentRef(after), beforeId: this.nextIdSibling(after), html: sec.outerHTML }
        : { t: 'insert', parentId: d.deckEl() === d.doc.body ? '__body__' : d.deckEl().getAttribute(ID), html: sec.outerHTML };
      this.apply([op], { label: 'Adicionar slide' });
      const idx = d.slides().findIndex(s => s.getAttribute(ID) === sec.getAttribute(ID));
      if (needIcons) { this.current = idx; this.renderEditor(); this.highlightThumb(); this.emit('onSlides'); }
      else this.goTo(idx);
    }
    addSlidesHtml(innerList, label) {
      const d = this.deck; if (!d) return;
      let after = d.slides()[this.current];
      const ops = [];
      let lastId = null;
      innerList.forEach(inner => {
        const sec = d.createSlide(inner);
        const op = { t: 'insert', parentId: after ? this.parentRef(after) : (d.deckEl() === d.doc.body ? '__body__' : d.deckEl().getAttribute(ID)), beforeId: after ? this.nextIdSibling(after) : null, html: sec.outerHTML };
        this.applyToDeck([op]);
        ops.push(op);
        after = d.byId(sec.getAttribute(ID));
        lastId = sec.getAttribute(ID);
      });
      this.post({ type: 'ops', ops });
      this.commit(label || 'Adicionar slides');
      this.syncFilmstrip();
      this.emit('onChange', false);
      this.goTo(d.slides().findIndex(s => s.getAttribute(ID) === lastId));
    }
    duplicateSlide(i) {
      const d = this.deck; const s = d.slideAt(i == null ? this.current : i); if (!s) return;
      const c = d.cloneWithNewIds(s); c.classList.remove('active'); if (!c.getAttribute('class')) c.removeAttribute('class');
      this.apply([{ t: 'insertAfter', refId: s.getAttribute(ID), html: c.outerHTML }], { label: 'Duplicar slide' });
      this.goTo(d.slides().indexOf(d.byId(c.getAttribute(ID))));
    }
    deleteSlide(i) {
      const d = this.deck; if (this.slideCount <= 1) { this.emit('onToast', 'A apresentação precisa ter pelo menos 1 slide.'); return; }
      i = i == null ? this.current : i;
      const s = d.slideAt(i); if (!s) return;
      this.apply([{ t: 'remove', id: s.getAttribute(ID) }], { label: 'Excluir slide' });
      const n = this.slideCount;
      this.current = clamp(i >= n ? n - 1 : i, 0, n - 1);
      this.post({ type: 'showSlide', index: this.current });
      this.setSel(null); this.highlightThumb(); this.emit('onSlides');
    }
    moveSlide(from, to) {
      const d = this.deck; const ss = d.slides();
      if (from === to || !ss[from] || to < 0 || to >= ss.length) return;
      const el = ss[from];
      const beforeEl = to > from ? ss[to].nextElementSibling : ss[to];
      let before = beforeEl; while (before && !before.hasAttribute(ID)) before = before.nextElementSibling;
      this.apply([{ t: 'move', id: el.getAttribute(ID), parentId: this.parentRef(ss[to]), beforeId: before ? before.getAttribute(ID) : null }], { label: 'Reordenar slides' });
      this.current = d.slides().indexOf(el);
      this.post({ type: 'showSlide', index: this.current });
      this.setSel(null); this.highlightThumb(); this.emit('onSlides');
    }
    /** troca um slide inteiro por outro elemento (ex.: resultado da IA); desfazível */
    replaceSlide(index, sec, label) {
      const d = this.deck; const old = d && d.slideAt(index); if (!old || !sec) return false;
      const needIcons = /data-lucide/.test(sec.outerHTML) && d.ensureLucide();
      this.apply([{ t: 'replace', id: old.getAttribute(ID), html: sec.outerHTML }], { label: label || 'Substituir slide', select: null });
      this.current = clamp(index, 0, this.slideCount - 1);
      this.syncFilmstrip();
      if (needIcons) this.renderEditor(); else this.post({ type: 'showSlide', index: this.current });
      this.setSel(null); this.highlightThumb(); this.emit('onSlides');
      return true;
    }
    slideBackground(css) {
      const s = this.deck && this.deck.slideAt(this.current); if (!s) return;
      this.apply([{ t: 'style', id: s.getAttribute(ID), css }], { label: 'Fundo do slide', merge: 'bg-' + s.getAttribute(ID) });
    }
    slideStyle() {
      const s = this.deck && this.deck.slideAt(this.current);
      return s ? { id: s.getAttribute(ID), bg: s.style.backgroundColor || '', bgImage: s.style.backgroundImage || '' } : null;
    }

    /* ---------------- elementos ---------------- */
    selEl() { return this.sel && this.deck && !this.sel.multi ? this.deck.byId(this.sel.id) : null; }
    get isMulti() { return !!(this.sel && this.sel.multi); }
    /** elementos selecionados, na ordem do documento (1 ou vários) */
    selEls() {
      if (!this.sel || !this.deck) return [];
      const ids = this.sel.multi ? this.sel.ids : [this.sel.id];
      const els = ids.map(id => this.deck.byId(id)).filter(Boolean);
      return els.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
    }
    selectMany(ids) { this.post({ type: 'selectMany', ids }); }
    /** espera o slide estar pronto no editor e verifica conteúdo fora da área / texto cortado */
    async audit(slides) {
      for (let i = 0; i < 60 && (!this.front || this.pending); i++) await new Promise(r => setTimeout(r, 200));
      const r = await this.request('audit', { slides: slides || null });
      return r ? r.issues : null;
    }
    selectAll() { if (this.editingId) this.post({ type: 'endEdit' }); this.post({ type: 'selectAll' }); }
    alignGroup(h, v) { this.post({ type: 'alignGroup', h, v }); }
    distribute(axis) { this.post({ type: 'alignGroup', distribute: axis }); }
    /** posição em % do slide a partir de um retângulo medido (px do slide) */
    absFromRect(node, r, off) {
      node.style.position = 'absolute'; node.style.margin = '0';
      node.style.left = (r.x / W * 100 + off).toFixed(3) + '%';
      node.style.top = (r.y / H * 100 + off * 1.75).toFixed(3) + '%';
      node.style.width = (r.w / W * 100).toFixed(3) + '%';
      node.style.removeProperty('translate');
    }
    insertElement(html, opt) {
      opt = opt || {};
      const d = this.deck; const slide = d && d.slideAt(this.current); if (!slide) return null;
      const nodes = d.fragment(html, true);
      if (opt.at) nodes.forEach(n => positionAt(n, opt.at.x, opt.at.y));
      const out = nodes.map(n => n.outerHTML).join('');
      const needIcons = /data-lucide/.test(out) && d.ensureLucide();
      const first = nodes[0] && nodes[0].getAttribute(ID);
      this.apply([{ t: 'insert', parentId: slide.getAttribute(ID), html: out }], { label: opt.label || 'Inserir elemento', select: first });
      if (needIcons) { this.sel = first ? { id: first } : null; this.renderEditor(); }
      return first;
    }
    deleteSelection() {
      const els = this.selEls(); if (!els.length) return;
      const free = els.filter(el => !el.closest('[data-ssw-lock]'));
      if (!free.length) { this.emit('onToast', els.length > 1 ? 'Elementos bloqueados. Desbloqueie para excluir.' : 'Elemento bloqueado. Desbloqueie para excluir.'); return; }
      this.apply(free.map(el => ({ t: 'remove', id: el.getAttribute(ID) })), { label: 'Excluir', select: null });
      if (free.length < els.length) this.emit('onToast', 'Os elementos bloqueados foram mantidos.');
      this.setSel(null);
    }
    duplicateSelection() {
      const els = this.selEls(); if (!els.length) return;
      const ops = [], ids = [];
      els.forEach(el => {
        const c = this.deck.cloneWithNewIds(el);
        if (el.style.position === 'absolute' && /%$/.test(el.style.left)) {
          c.style.left = (parseFloat(el.style.left) + 2).toFixed(3) + '%';
          c.style.top = (parseFloat(el.style.top) + 3.5).toFixed(3) + '%';
        }
        c.removeAttribute('data-ssw-lock');
        ops.push({ t: 'insertAfter', refId: el.getAttribute(ID), html: c.outerHTML });
        ids.push(c.getAttribute(ID));
      });
      if (ids.length === 1) this.apply(ops, { label: 'Duplicar', select: ids[0] });
      else { this.apply(ops, { label: 'Duplicar' }); this.selectMany(ids); }
    }
    copySelection(cut, marker) {
      const els = this.selEls(); if (!els.length) return false;
      const items = els.map(el => ({ id: el.getAttribute(ID), html: el.outerHTML, abs: el.style.position === 'absolute' && /%$/.test(el.style.left), rect: null }));
      if (items.length === 1 && this.sel.rect) items[0].rect = this.sel.rect;
      this.clip = { items, slide: this.current, marker: marker || null, n: 0 };
      // elementos no fluxo do layout precisam da posição medida para virarem livres ao colar
      items.filter(it => !it.abs && !it.rect).forEach(it => this.request('measure', { id: it.id }).then(m => { if (m && m.rect) it.rect = m.rect; }));
      if (cut) this.deleteSelection();
      const what = items.length > 1 ? items.length + ' elementos ' : 'Elemento ';
      this.emit('onToast', what + (cut ? (items.length > 1 ? 'recortados' : 'recortado') : (items.length > 1 ? 'copiados' : 'copiado')));
      return true;
    }
    pasteClip() {
      if (!this.clip || !this.deck) return false;
      const d = this.deck; const slide = d.slideAt(this.current); if (!slide) return false;
      this.clip.n++;
      const off = this.clip.slide === this.current ? 2 * this.clip.n : 0;
      const nodes = [];
      this.clip.items.forEach(it => {
        const node = d.fragment(it.html, true)[0]; if (!node) return;
        if (it.abs) {
          node.style.left = (parseFloat(node.style.left) + off).toFixed(3) + '%';
          node.style.top = (parseFloat(node.style.top) + off * 1.75).toFixed(3) + '%';
        } else if (it.rect) this.absFromRect(node, it.rect, off);
        node.removeAttribute('data-ssw-lock');
        nodes.push(node);
      });
      if (!nodes.length) return false;
      const html = nodes.map(n => n.outerHTML).join('');
      const ids = nodes.map(n => n.getAttribute(ID));
      const needIcons = /data-lucide/.test(html) && d.ensureLucide();
      if (ids.length === 1) this.apply([{ t: 'insert', parentId: slide.getAttribute(ID), html }], { label: 'Colar', select: ids[0] });
      else { this.apply([{ t: 'insert', parentId: slide.getAttribute(ID), html }], { label: 'Colar' }); this.selectMany(ids); }
      if (needIcons) { if (ids.length === 1) this.sel = { id: ids[0] }; this.renderEditor(); }
      return true;
    }
    setStyle(css, label, merge) {
      if (!this.sel) return;
      const ids = this.sel.multi ? this.sel.ids : [this.sel.id];
      this.apply(ids.map(id => ({ t: 'style', id, css })), { label: label || 'Estilo', merge: merge ? merge + '-' + ids.join(',') : null });
    }
    setAttr(name, value, label) {
      if (!this.sel || this.sel.multi) return;
      this.apply([{ t: 'attr', id: this.sel.id, name, value }], { label: label || 'Editar' });
    }
    setImageSrc(id, src) {
      this.apply([{ t: 'attr', id, name: 'src', value: src }], { label: 'Trocar imagem', select: id });
    }
    setIcon(id, name) {
      const el = this.deck.byId(id); if (!el) return;
      el.setAttribute('data-lucide', name);
      this.apply([{ t: 'replace', id, html: el.outerHTML }], { label: 'Trocar ícone', select: id });
    }
    toggleLock() {
      const els = this.selEls(); if (!els.length) return;
      const locked = els.every(el => el.hasAttribute('data-ssw-lock'));
      const ops = els.map(el => ({ t: 'attr', id: el.getAttribute(ID), name: 'data-ssw-lock', value: locked ? null : '' }));
      const label = locked ? 'Desbloquear' : 'Bloquear';
      if (this.sel.multi) { const ids = this.sel.ids.slice(); this.apply(ops, { label }); this.selectMany(ids); }
      else this.apply(ops, { label, select: this.sel.id });
    }
    layer(dir) {
      if (this.isMulti) {
        // move o grupo inteiro mantendo a ordem relativa entre eles
        const els = this.selEls().filter(el => el.style.position === 'absolute');
        if (!els.length) return;
        const ids = this.sel.ids.slice();
        const parentGroups = new Map();
        els.forEach(el => { const p = el.parentElement; if (!parentGroups.has(p)) parentGroups.set(p, []); parentGroups.get(p).push(el); });
        const ops = [];
        parentGroups.forEach((list, parent) => {
          if (dir === 'front') list.forEach(el => ops.push({ t: 'move', id: el.getAttribute(ID), parentId: this.parentRef(el), beforeId: null }));
          else {
            let f = parent.firstElementChild; while (f && (list.includes(f) || !f.hasAttribute(ID))) f = f.nextElementSibling;
            if (f) list.forEach(el => ops.push({ t: 'move', id: el.getAttribute(ID), parentId: this.parentRef(el), beforeId: f.getAttribute(ID) }));
          }
        });
        if (!ops.length) return;
        this.apply(ops, { label: dir === 'front' ? 'Trazer para frente' : 'Enviar para trás' });
        this.selectMany(ids);
        return;
      }
      const el = this.selEl(); if (!el) return;
      const isAbs = el.style.position === 'absolute' || (this.sel.style && this.sel.style.position === 'absolute');
      if (isAbs) {
        const parent = el.parentElement;
        let beforeId = null;
        if (dir === 'back') { let f = parent.firstElementChild; while (f && (f === el || !f.hasAttribute(ID))) f = f.nextElementSibling; beforeId = f ? f.getAttribute(ID) : null; if (!beforeId) return; }
        this.apply([{ t: 'move', id: this.sel.id, parentId: this.parentRef(el), beforeId }, { t: 'style', id: this.sel.id, css: { 'z-index': dir === 'front' ? null : null } }],
          { label: dir === 'front' ? 'Trazer para frente' : 'Enviar para trás', select: this.sel.id });
      } else {
        const css = { 'z-index': dir === 'front' ? '20' : null };
        if (dir === 'front' && this.sel.style && this.sel.style.position === 'static') css.position = 'relative';
        this.apply([{ t: 'style', id: this.sel.id, css }], { label: dir === 'front' ? 'Trazer para frente' : 'Enviar para trás', select: this.sel.id });
      }
    }
    select(id) { this.post({ type: 'select', id }); }
    selectParent() { this.post({ type: 'selectParent' }); }
    deselect() { if (this.editingId) this.post({ type: 'endEdit' }); this.post({ type: 'deselect' }); }
    startEdit(id) { this.post({ type: 'startEdit', id: id || (this.sel && this.sel.id) }); }
    endEdit() { if (this.editingId) this.post({ type: 'endEdit' }); }
    nudge(dx, dy) { this.post({ type: 'nudge', dx, dy }); }
    alignPage(h, v) { this.post({ type: 'alignPage', h, v }); }
    execText(cmd, value) { this.post({ type: 'exec', cmd, value }); }
    addHead(html) { this.apply([{ t: 'headAppend', html }], { record: false }); }

    async applyTheme(theme) {
      if (!this.deck) return;
      const res = await this.request('getConfig');
      this.deck.applyTheme({ colors: theme.colors, font: theme.font, evaluatedConfig: res && res.config });
      this.version++;
      this.commit('Aplicar estilo');
      this.renderEditor();
      this.syncFilmstrip(true);
      this.emit('onChange', false);
    }

    /* ---------------- zoom ---------------- */
    fit() {
      const s = this.o.scroller; const pad = this.o.fitPadding || { x: 96, y: 120 };
      const z = Math.max(0.08, Math.min((s.clientWidth - pad.x) / W, (s.clientHeight - pad.y) / H));
      this.zoomMode = 'fit';
      this.applyZoom(z);
    }
    setZoom(z) { this.zoomMode = 'manual'; this.applyZoom(clamp(z, 0.1, 3)); }
    applyZoom(z) {
      if (!isFinite(z) || z <= 0) return;
      this.zoom = z;
      this.page.style.width = Math.round(W * z) + 'px';
      this.page.style.height = Math.round(H * z) + 'px';
      this.frameWrap.style.transform = 'scale(' + z + ')';
      this.post({ type: 'zoom', scale: z });
      this.emit('onZoom', z, this.zoomMode);
    }

    /* ---------------- arrastar e soltar sobre o slide ---------------- */
    showDrop(on) { this.page.classList.toggle('is-dropping', !!on); }
    bindDrop() {
      const d = this.drop;
      d.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
      d.addEventListener('dragleave', e => { if (e.target === d) this.showDrop(false); });
      d.addEventListener('drop', e => {
        e.preventDefault(); this.showDrop(false);
        const fr = this.frameWrap.getBoundingClientRect();
        const x = clamp((e.clientX - fr.left) / this.zoom, 0, W), y = clamp((e.clientY - fr.top) / this.zoom, 0, H);
        this.emit('onDrop', e.dataTransfer, x, y);
      });
      this.page.addEventListener('dragenter', e => { e.preventDefault(); this.showDrop(true); });
      window.addEventListener('dragend', () => this.showDrop(false));
    }

    /* ---------------- miniaturas ---------------- */
    syncFilmstrip(forceAll) {
      const host = this.o.filmstrip; if (!host || !this.deck) return;
      const n = this.slideCount;
      while (this.thumbs.length < n) this.thumbs.push(this.mkThumb());
      while (this.thumbs.length > n) this.thumbs.pop().el.remove();
      this.thumbs.forEach((t, i) => { t.num.textContent = i + 1; t.el.dataset.index = i; if (forceAll) t.html = null; });
      this.queueThumbs('*', true);
      this.highlightThumb();
      this.emit('onSlides');
    }
    mkThumb() {
      const el = document.createElement('div');
      el.className = 'fs-item';
      el.innerHTML = '<div class="fs-card"><div class="fs-host"></div><div class="fs-shield"></div></div><div class="fs-num"></div>' +
        '<button class="fs-more" title="Opções do slide" aria-label="Opções do slide"><i data-lucide="more-horizontal"></i></button>';
      const t = { el, num: el.querySelector('.fs-num'), host: el.querySelector('.fs-host'), html: null, frame: null };
      const more = el.querySelector('.fs-more');
      more.addEventListener('click', e => { e.stopPropagation(); const r = more.getBoundingClientRect(); this.emit('onSlideMenu', +el.dataset.index, r.left, r.bottom + 4); });
      el.addEventListener('contextmenu', e => { e.preventDefault(); this.goTo(+el.dataset.index); this.emit('onSlideMenu', +el.dataset.index, e.clientX, e.clientY); });
      this.bindThumbDrag(el);
      const addBtn = this.o.filmstripAdd;
      if (addBtn && addBtn.parentNode === this.o.filmstrip) this.o.filmstrip.insertBefore(el, addBtn); else this.o.filmstrip.appendChild(el);
      if (global.lucide) global.lucide.createIcons({ root: el });
      return t;
    }
    bindThumbDrag(el) {
      let start = null, ghost = null, marker = null, from = -1, target = -1;
      el.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('.fs-more')) return;
        e.preventDefault();
        const s = window.getSelection && window.getSelection(); if (s && s.rangeCount) s.removeAllRanges();
        start = { x: e.clientX, y: e.clientY }; from = +el.dataset.index; target = from;
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', e => {
        if (!start) return;
        if (!ghost && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < 6) return;
        if (!ghost) {
          // sem iframe no fantasma: iframes isolados sob o cursor atrasam o roteamento de eventos
          ghost = document.createElement('div'); ghost.className = 'fs-ghost';
          ghost.innerHTML = '<span>Slide ' + (from + 1) + '</span>';
          document.body.appendChild(ghost);
          marker = document.createElement('div'); marker.className = 'fs-marker'; this.o.filmstrip.appendChild(marker);
          el.classList.add('is-dragging');
        }
        ghost.style.left = (e.clientX - 60) + 'px'; ghost.style.top = (e.clientY - 34) + 'px';
        const items = this.thumbs.map(t => t.el);
        let idx = items.length - 1;
        for (let i = 0; i < items.length; i++) { const r = items[i].getBoundingClientRect(); if (e.clientX < r.left + r.width / 2) { idx = i; break; } }
        const lastR = items[items.length - 1].getBoundingClientRect();
        const after = e.clientX > lastR.left + lastR.width / 2;
        const ref = after ? lastR : items[idx].getBoundingClientRect();
        const hostR = this.o.filmstrip.getBoundingClientRect();
        marker.style.left = ((after ? ref.right + 6 : ref.left - 6) - hostR.left + this.o.filmstrip.scrollLeft) + 'px';
        target = after ? items.length - 1 : (idx > from ? idx - 1 : idx);
      });
      const end = () => {
        if (!start) return;
        const wasDrag = !!ghost;
        start = null;
        if (ghost) { ghost.remove(); ghost = null; marker.remove(); marker = null; el.classList.remove('is-dragging'); }
        if (wasDrag) { if (target !== from && target >= 0) this.moveSlide(from, target); }
        else this.goTo(from);
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', () => { start = null; if (ghost) { ghost.remove(); ghost = null; marker.remove(); marker = null; el.classList.remove('is-dragging'); } });
    }
    highlightThumb() {
      this.thumbs.forEach((t, i) => t.el.classList.toggle('is-active', i === this.current));
      const t = this.thumbs[this.current];
      if (t) t.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    queueThumbs(which, now) {
      if (which === '*') this.thumbs.forEach((_, i) => this.thumbQueue.add(i));
      else which.forEach(i => this.thumbQueue.add(i));
      clearTimeout(this.thumbTimer);
      this.thumbTimer = setTimeout(() => this.processThumbs(), now ? 30 : 600);
    }
    async processThumbs() {
      if (this.thumbBusy) { this.thumbTimer = setTimeout(() => this.processThumbs(), 300); return; }
      this.thumbBusy = true;
      try {
        while (this.thumbQueue.size && this.deck) {
          const order = Array.from(this.thumbQueue).sort((a, b) => Math.abs(a - this.current) - Math.abs(b - this.current));
          const i = order[0]; this.thumbQueue.delete(i);
          const t = this.thumbs[i]; if (!t) continue;
          const html = SSWDeck.thumbHtml(this.deck, i);
          if (t.html === html) continue;
          t.html = html;
          await loadThumbFrame(t.host, html);
        }
      } finally { this.thumbBusy = false; }
    }

    /* ---------------- exportação ---------------- */
    cleanHtml() { return this.deck ? this.deck.cleanHtml() : ''; }
    printHtml(autoPrint) { return SSWDeck.printHtml(this.deck, { autoPrint }); }
    presentHtml() { return SSWDeck.presentHtml(this.deck); }
  }

  function positionAt(node, x, y) {
    const st = node.style;
    if (st.position !== 'absolute') return;
    const w = /%$/.test(st.width) ? parseFloat(st.width) / 100 * W : 300;
    const h = /%$/.test(st.height) ? parseFloat(st.height) / 100 * H : (/vw$/.test(st.height) ? parseFloat(st.height) / 100 * W : 60);
    st.left = (clamp(x - w / 2, -w / 2, W - w / 2) / W * 100).toFixed(3) + '%';
    st.top = (clamp(y - h / 2, -h / 2, H - h / 2) / H * 100).toFixed(3) + '%';
  }

  /** carrega um documento estático em um host de miniatura (troca sem piscar) */
  function loadThumbFrame(host, html) {
    return new Promise(resolve => {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts');
      f.setAttribute('tabindex', '-1');
      f.setAttribute('aria-hidden', 'true');
      f.setAttribute('scrolling', 'no');
      f.className = 'th-frame is-new';
      f.style.width = W + 'px'; f.style.height = H + 'px';
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        setTimeout(() => {
          Array.from(host.querySelectorAll('iframe')).forEach(o => { if (o !== f) o.remove(); });
          f.classList.remove('is-new');
          resolve();
        }, 260);
      };
      f.addEventListener('load', finish);
      setTimeout(finish, 5000);
      f.srcdoc = html;
      host.appendChild(f);
    });
  }

  global.SSWEditor = Editor;
  global.SSWThumb = { loadThumbFrame };
})(window);
