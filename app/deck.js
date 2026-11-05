/* ============================================================
   Slide Studio WEG — modelo da apresentação (HTML de origem)
   - Deck: DOM parseado do presentation.html, com data-ssw-id em cada elemento
   - Builders: editor (sem scripts do deck + runtime), miniatura, impressão/PDF, apresentação
   - Modelos: apresentação em branco, layouts de slide e elementos (texto, formas, ícones, imagens)
============================================================ */
(function (global) {
  'use strict';

  const W = 1280, H = 720;
  const ID = 'data-ssw-id';
  const SLIDE = 'data-ssw-slide';
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META', 'TITLE', 'BASE']);
  // scripts externos permitidos no editor: host exato + caminho do pacote (sem "..", sem host parecido)
  const SAFE_SCRIPT = /^(?!.*\.\.)(?:https?:)?\/\/(?:cdn\.tailwindcss\.com(?:\/[\w.@-]+)?(?:\?[\w=&,.@-]*)?|unpkg\.com\/lucide(?:@[\w.-]+)?(?:\/[\w./-]*)?|cdn\.jsdelivr\.net\/npm\/lucide(?:@[\w.-]+)?(?:\/[\w./-]*)?)$/i;
  // versões fixas: "latest" muda sozinho e pode quebrar ícones e estilos
  const CDN = { tailwind: 'https://cdn.tailwindcss.com/3.4.16', lucide: 'https://unpkg.com/lucide@1.65.0/dist/umd/lucide.min.js' };
  // CSP dos documentos montados pelo app: slides não abrem conexões (fetch/XHR/WebSocket), nem formulários ou frames
  const CSP = "default-src 'none'; script-src 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net; " +
    "style-src 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src https://fonts.gstatic.com data:; " +
    "img-src data: blob: https:; media-src data: blob: https:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
  const VOID_ATTRS = ['contenteditable', 'spellcheck', 'data-ssw-current', 'data-ssw-ctrl', 'data-ssw-deck', 'data-ssw-last', 'data-ssw-editing'];

  /* ---------------- utilidades ---------------- */
  const px2vw = px => +(px / W * 100).toFixed(3) + 'vw';
  const pct = (v, total) => +(v / total * 100).toFixed(3) + '%';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function scriptSafe(js) { return String(js).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--'); }

  function findSlides(doc) {
    let list = Array.from(doc.querySelectorAll('#deck > .slide'));
    if (!list.length) list = Array.from(doc.querySelectorAll('#deck > section'));
    if (!list.length) list = Array.from(doc.querySelectorAll('.slide')).filter(el => !el.parentElement.closest('.slide'));
    if (!list.length) list = Array.from(doc.querySelectorAll('.reveal .slides > section'));
    if (!list.length) list = Array.from(doc.querySelectorAll('body > section, body > main > section'));
    return list;
  }

  function isControlLike(el) {
    if (el.classList.contains('no-print')) return true;
    if (/^(BUTTON|NAV|INPUT|SELECT|PROGRESS)$/.test(el.tagName)) return true;
    const sig = (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '');
    if (/(progress|navega|nav-|-nav|control|pagina|pager|counter|contador|toggle|toolbar|dots|indicator|theme-btn)/i.test(sig)) return true;
    return !!el.querySelector('button, input, select');
  }

  /* ---------------- Deck ---------------- */
  class Deck {
    constructor(html) {
      const m = /^\s*(<!doctype[^>]*>)/i.exec(html || '');
      this.doctype = m ? m[1] : '<!DOCTYPE html>';
      this.doc = new DOMParser().parseFromString(html || '', 'text/html');
      this.nextId = 1;
      this.normalize();
    }

    normalize() {
      const doc = this.doc;
      // ids remanescentes (snapshots do histórico) definem o próximo número
      doc.querySelectorAll('[' + ID + ']').forEach(el => {
        const n = parseInt(String(el.getAttribute(ID)).replace(/^\D+/, ''), 10);
        if (n >= this.nextId) this.nextId = n + 1;
      });
      let slides = Array.from(doc.querySelectorAll('[' + SLIDE + ']'));
      if (!slides.length) slides = findSlides(doc);
      if (!slides.length) {
        const main = doc.createElement('main'); main.id = 'deck';
        const sec = doc.createElement('section'); sec.className = 'slide active';
        Array.from(doc.body.childNodes).forEach(n => { if (!(n.nodeType === 1 && SKIP_TAGS.has(n.tagName))) sec.appendChild(n); });
        main.appendChild(sec); doc.body.insertBefore(main, doc.body.firstChild);
        slides = [sec];
      }
      slides.forEach(s => s.setAttribute(SLIDE, ''));
      this.pinCdns();
      this.assignIds(doc.body);
    }

    /** troca "latest"/sem versão pelas versões fixas */
    pinCdns() {
      this.doc.querySelectorAll('script[src]').forEach(sc => {
        const src = sc.getAttribute('src') || '';
        if (/^(https?:)?\/\/cdn\.tailwindcss\.com\/?(\?.*)?$/i.test(src)) sc.setAttribute('src', CDN.tailwind + (src.split('?')[1] ? '?' + src.split('?')[1] : ''));
        else if (/^(https?:)?\/\/unpkg\.com\/lucide(@latest)?\/?$/i.test(src)) sc.setAttribute('src', CDN.lucide);
      });
    }

    assignIds(root) {
      const visit = el => {
        if (SKIP_TAGS.has(el.tagName)) return;
        if (el !== this.doc.body && !el.hasAttribute(ID)) el.setAttribute(ID, 'e' + (this.nextId++));
        if (el.namespaceURI === 'http://www.w3.org/2000/svg' && el.tagName.toLowerCase() === 'svg') return; // não marca o interior de SVG
        for (const c of el.children) visit(c);
      };
      visit(root);
    }

    slides() { return Array.from(this.doc.querySelectorAll('[' + SLIDE + ']')); }
    slideAt(i) { return this.slides()[i] || null; }
    byId(id) { return id ? this.doc.querySelector('[' + ID + '="' + String(id).replace(/"/g, '') + '"]') : null; }
    indexOfSlide(el) { return this.slides().indexOf(el); }
    deckEl() { const s = this.slides()[0]; return s ? s.parentElement : this.doc.body; }
    slideOf(el) { return el && el.closest ? el.closest('[' + SLIDE + ']') : null; }

    title() {
      const t = this.doc.querySelector('title');
      if (t && t.textContent.trim()) return t.textContent.trim();
      const h = this.doc.querySelector('[' + SLIDE + '] h1, [' + SLIDE + '] h2');
      return h ? h.textContent.trim().replace(/\s+/g, ' ').slice(0, 120) : 'Apresentação';
    }
    setTitle(t) {
      let el = this.doc.querySelector('title');
      if (!el) { el = this.doc.createElement('title'); this.doc.head.appendChild(el); }
      el.textContent = t;
    }

    /** HTML com ids (para histórico) */
    rawHtml() { return this.doctype + '\n' + this.doc.documentElement.outerHTML; }

    /** HTML limpo (para salvar/baixar) */
    cleanHtml() {
      const clone = this.doc.documentElement.cloneNode(true);
      const slides = Array.from(clone.querySelectorAll('[' + SLIDE + ']'));
      if (slides.some(s => s.classList.contains('active'))) slides.forEach((s, i) => s.classList.toggle('active', i === 0));
      stripEditorAttrs(clone, true);
      return this.doctype + '\n' + clone.outerHTML;
    }

    /* ---------- fragmentos ---------- */
    fragment(html, fresh) {
      const tpl = this.doc.createElement('template');
      tpl.innerHTML = html;
      const nodes = Array.from(tpl.content.children);
      if (fresh) nodes.forEach(n => { n.removeAttribute(ID); n.querySelectorAll('[' + ID + ']').forEach(x => x.removeAttribute(ID)); });
      nodes.forEach(n => this.assignIds(n));
      return nodes;
    }
    /** clona um elemento do deck com ids novos */
    cloneWithNewIds(el) {
      const c = el.cloneNode(true);
      c.removeAttribute(ID); c.querySelectorAll('[' + ID + ']').forEach(x => x.removeAttribute(ID));
      this.assignIds(c);
      return c;
    }

    /* ---------- slides ---------- */
    slideTemplate() {
      const ss = this.slides();
      const ref = ss[1] || ss[0];
      if (!ref) return { tag: 'section', cls: 'slide' };
      return { tag: ref.tagName.toLowerCase(), cls: (ref.getAttribute('class') || '').split(/\s+/).filter(c => c && c !== 'active').join(' ') };
    }
    createSlide(innerHtml) {
      const t = this.slideTemplate();
      const sec = this.doc.createElement(t.tag);
      if (t.cls) sec.setAttribute('class', t.cls);
      sec.setAttribute(SLIDE, '');
      if (innerHtml) sec.innerHTML = innerHtml;
      this.assignIds(sec);
      return sec;
    }

    /* ---------- edição por IA ---------- */
    /** HTML limpo de um slide para enviar à IA; imagens embutidas viram "ssw-img:N" */
    slideSource(i) {
      const s = this.slideAt(i); if (!s) return null;
      const c = s.cloneNode(true);
      stripEditorAttrs(c, true);
      c.removeAttribute('data-ssw-lock'); c.querySelectorAll('[data-ssw-lock]').forEach(x => x.removeAttribute('data-ssw-lock'));
      const images = [];
      const html = c.outerHTML.replace(/data:[a-z]+\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*,[^"')\s]+/gi, m => { images.push(m); return 'ssw-img:' + images.length; });
      return { html, images };
    }
    /** reconstrói o slide a partir da resposta da IA (null se não houver <section>) */
    slideFromAi(text, images, orig) {
      const t = String(text || '').replace(/```[a-z]*\s*/gi, '');
      if (!/<section[\s>]/i.test(t)) return null;
      const tmp = new DOMParser().parseFromString('<!DOCTYPE html><html><body>' + t + '</body></html>', 'text/html');
      const found = tmp.querySelector('section.slide') || tmp.querySelector('section');
      if (!found) return null;
      const inner = found.innerHTML.replace(/ssw-img:(\d+)/g, (m, n) => images[n - 1] || PLACEHOLDER_IMG);
      const sec = this.doc.createElement(orig ? orig.tagName.toLowerCase() : 'section');
      for (const a of Array.from(found.attributes)) if (!/^on/i.test(a.name) && a.name !== ID && a.name !== SLIDE) sec.setAttribute(a.name, a.value.replace(/ssw-img:(\d+)/g, (m, n) => images[n - 1] || PLACEHOLDER_IMG));
      sec.innerHTML = inner;
      // segurança: sem scripts, objetos embutidos, estilos globais ou handlers
      sec.querySelectorAll('script, style, iframe, object, embed, link, meta, base').forEach(n => n.remove());
      [sec, ...sec.querySelectorAll('*')].forEach(el => {
        for (const a of Array.from(el.attributes)) {
          if (/^on/i.test(a.name) || ((a.name === 'href' || a.name === 'src' || a.name === 'action' || a.name === 'xlink:href') && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
          else if (a.name === ID || a.name === SLIDE) el.removeAttribute(a.name);
        }
      });
      if (orig) (orig.getAttribute('class') || '').split(/\s+/).filter(Boolean).forEach(c => sec.classList.add(c));
      if (!sec.textContent.trim() && !sec.querySelector('img,svg,i[data-lucide]')) return null;
      sec.setAttribute(SLIDE, '');
      this.assignIds(sec);
      return sec;
    }

    /* ---------- recursos ---------- */
    ensureLucide() {
      let changed = false;
      const has = Array.from(this.doc.querySelectorAll('script[src]')).some(s => /lucide/i.test(s.getAttribute('src')));
      if (!has) {
        const s = this.doc.createElement('script'); s.setAttribute('src', CDN.lucide);
        this.doc.head.appendChild(s); changed = true;
      }
      const calls = Array.from(this.doc.querySelectorAll('script:not([src])')).some(s => /createIcons/.test(s.textContent));
      if (!calls) {
        const s = this.doc.createElement('script'); s.textContent = 'window.lucide&&lucide.createIcons();';
        this.doc.body.appendChild(s); changed = true;
      }
      return changed;
    }
    ensureFont(font) {
      if (!font) return null;
      const fam = String(font).trim().replace(/ /g, '+');
      const links = Array.from(this.doc.querySelectorAll('link[href*="fonts.googleapis.com"]'));
      if (links.some(l => new RegExp('family=' + fam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(:|&|$)').test(l.getAttribute('href') || ''))) return null;
      const l = this.doc.createElement('link');
      l.setAttribute('rel', 'stylesheet');
      l.setAttribute('href', SSWPalette.fontUrl(font));
      this.doc.head.appendChild(l);
      return l.outerHTML;
    }
    tailwindConfigScript() {
      return Array.from(this.doc.querySelectorAll('script:not([src])')).find(s => /tailwind\.config\s*=/.test(s.textContent)) || null;
    }
    /** aplica paleta e fonte ao deck (config = objeto avaliado lido do iframe, se houver) */
    applyTheme({ colors, font, evaluatedConfig }) {
      const cfg = (evaluatedConfig && typeof evaluatedConfig === 'object') ? JSON.parse(JSON.stringify(evaluatedConfig)) : {};
      cfg.theme = cfg.theme || {};
      cfg.theme.extend = cfg.theme.extend || {};
      if (colors) cfg.theme.extend.colors = Object.assign({}, cfg.theme.extend.colors || {}, colors);
      if (font) {
        cfg.theme.extend.fontFamily = Object.assign({}, cfg.theme.extend.fontFamily || {}, { sans: [font, 'sans-serif'] });
        this.ensureFont(font);
        // remove font-family fixo do body/html, se existir
        [this.doc.documentElement, this.doc.body].forEach(el => { if (el.style && el.style.fontFamily) el.style.fontFamily = ''; });
      }
      const text = 'tailwind.config = ' + JSON.stringify(cfg, null, 2) + ';';
      let s = this.tailwindConfigScript();
      if (s) { s.textContent = text; }
      else {
        s = this.doc.createElement('script'); s.textContent = text;
        const cdn = Array.from(this.doc.querySelectorAll('script[src]')).find(x => /tailwindcss/.test(x.getAttribute('src')));
        if (cdn && cdn.parentNode) cdn.parentNode.insertBefore(s, cdn.nextSibling); else this.doc.head.appendChild(s);
      }
    }
  }

  function stripEditorAttrs(root, removeIds) {
    const all = [root, ...root.querySelectorAll('*')];
    for (const el of all) {
      if (removeIds) { el.removeAttribute(ID); el.removeAttribute(SLIDE); }
      for (const a of VOID_ATTRS) el.removeAttribute(a);
    }
    root.querySelectorAll('[data-ssw-ui]').forEach(e => e.remove());
  }

  /* ---------------- builders ---------------- */
  function sanitize(doc, { keepScripts } = {}) {
    if (!keepScripts) {
      doc.querySelectorAll('script').forEach(s => {
        const src = s.getAttribute('src');
        if (src && SAFE_SCRIPT.test(src)) return;
        if (!src && /^\s*tailwind\.config\s*=/.test(s.textContent)) return;
        s.remove();
      });
    }
    doc.querySelectorAll('meta[http-equiv], base').forEach(e => e.remove());
    if (!keepScripts) {
      doc.querySelectorAll('*').forEach(el => {
        for (const a of Array.from(el.attributes)) {
          if (/^on/i.test(a.name)) el.removeAttribute(a.name);
          else if ((a.name === 'href' || a.name === 'src' || a.name === 'action') && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
        }
      });
    }
  }

  function markControls(doc) {
    const slides = Array.from(doc.querySelectorAll('[' + SLIDE + ']'));
    if (!slides.length) return;
    const deckEl = slides[0].parentElement;
    deckEl.setAttribute('data-ssw-deck', '');
    let node = deckEl;
    const chain = new Set();
    while (node && node !== doc.documentElement) { chain.add(node); node = node.parentElement; }
    chain.forEach(a => {
      for (const c of a.children) {
        if (chain.has(c) || c.hasAttribute(SLIDE) || SKIP_TAGS.has(c.tagName)) continue;
        if (isControlLike(c)) c.setAttribute('data-ssw-ctrl', '');
      }
    });
    slides[slides.length - 1].setAttribute('data-ssw-last', '');
  }

  const STATIC_CSS = `
.no-print,[data-ssw-ctrl]{display:none!important}
*,*::before,*::after{animation-duration:.001ms!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:.001ms!important;transition-delay:0s!important;scroll-behavior:auto!important}
`;
  const SINGLE_CSS = STATIC_CSS + `
html,body{overflow:hidden!important}
[data-ssw-slide]:not([data-ssw-current]){display:none!important}
[data-ssw-slide][data-ssw-current]{opacity:1!important;visibility:visible!important;transform:none!important;pointer-events:auto!important;z-index:1!important}
[data-ssw-slide][data-ssw-current] [data-count]{visibility:visible!important}
`;

  function cspMeta(doc) {
    const m = doc.createElement('meta'); m.setAttribute('http-equiv', 'Content-Security-Policy'); m.setAttribute('content', CSP); m.setAttribute('data-ssw-ui', '');
    doc.head.insertBefore(m, doc.head.firstChild);
  }
  function headInject(doc, css, extraHead) {
    cspMeta(doc);
    const st = doc.createElement('style'); st.setAttribute('data-ssw-ui', ''); st.textContent = css;
    doc.head.appendChild(st);
    if (extraHead) doc.head.insertAdjacentHTML('afterbegin', extraHead);
  }
  function bodyScript(doc, js) {
    const s = doc.createElement('script'); s.setAttribute('data-ssw-ui', ''); s.textContent = js;
    doc.body.appendChild(s);
  }
  function out(deck, doc) { return deck.doctype + '\n' + doc.documentElement.outerHTML; }

  const ICON_INIT = 'try{window.lucide&&lucide.createIcons()}catch(e){}';

  function editorHtml(deck, { current, runtime, config }) {
    const doc = deck.doc.cloneNode(true);
    sanitize(doc);
    markControls(doc);
    const slides = Array.from(doc.querySelectorAll('[' + SLIDE + ']'));
    const cur = slides[Math.max(0, Math.min(current || 0, slides.length - 1))];
    if (cur) { cur.setAttribute('data-ssw-current', ''); cur.classList.add('active'); }
    headInject(doc, SINGLE_CSS);
    const fn = typeof runtime === 'function' ? runtime.toString() : String(runtime);
    const s = doc.createElement('script'); s.setAttribute('data-ssw-ui', '');
    s.innerHTML = scriptSafe('(' + fn + ')(' + JSON.stringify(config || {}) + ');');
    doc.body.appendChild(s);
    return out(deck, doc);
  }

  function thumbHtml(deck, index) {
    const doc = deck.doc.cloneNode(true);
    sanitize(doc);
    markControls(doc);
    const slides = Array.from(doc.querySelectorAll('[' + SLIDE + ']'));
    slides.forEach((s, i) => { if (i !== index) s.remove(); });
    const cur = slides[index];
    if (cur) { cur.setAttribute('data-ssw-current', ''); cur.classList.add('active'); }
    headInject(doc, SINGLE_CSS);
    bodyScript(doc, ICON_INIT);
    return out(deck, doc);
  }

  function printHtml(deck, { autoPrint } = {}) {
    const doc = deck.doc.cloneNode(true);
    sanitize(doc);
    markControls(doc);
    doc.querySelectorAll('[' + SLIDE + ']').forEach(s => s.classList.add('active'));
    const css = STATIC_CSS + `
@page{size:${W}px ${H}px;margin:0}
html,body{margin:0!important;padding:0!important;width:${W}px!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important}
[data-ssw-deck]{position:static!important;display:block!important;width:${W}px!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;transform:none!important}
[data-ssw-slide]{position:relative!important;inset:auto!important;left:auto!important;top:auto!important;right:auto!important;bottom:auto!important;width:${W}px!important;height:${H}px!important;min-height:0!important;max-height:${H}px!important;margin:0!important;opacity:1!important;visibility:visible!important;transform:none!important;overflow:hidden!important;break-after:page;page-break-after:always;break-inside:avoid}
[data-ssw-slide][data-ssw-last]{break-after:auto;page-break-after:auto}
[data-ssw-slide] [data-count]{visibility:visible!important}
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
`;
    headInject(doc, css);
    let js = ICON_INIT;
    if (autoPrint) js += 'window.addEventListener("load",function(){(document.fonts?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){window.print()},700)})});';
    bodyScript(doc, js);
    return out(deck, doc);
  }

  const STORAGE_SHIM = '<script data-ssw-ui>(function(){function mk(){var m={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}}}["localStorage","sessionStorage"].forEach(function(n){try{window[n].getItem("x")}catch(e){try{Object.defineProperty(window,n,{value:mk(),configurable:true})}catch(e2){}}})})();<\/script>';

  function presentHtml(deck) {
    const doc = new DOMParser().parseFromString(deck.cleanHtml(), 'text/html');
    doc.querySelectorAll('meta[http-equiv], base').forEach(e => e.remove());
    doc.head.insertAdjacentHTML('afterbegin', STORAGE_SHIM);
    cspMeta(doc);
    bodyScript(doc, 'setTimeout(function(){try{window.focus()}catch(e){}},50);');
    return out(deck, doc);
  }

  /* ---------------- modelos ---------------- */
  const PLAYER_JS = `
(function(){
  var i=0, deck=document.getElementById('deck');
  function slides(){return Array.prototype.slice.call(document.querySelectorAll('#deck > .slide'));}
  function animate(s){
    s.querySelectorAll('[data-count]').forEach(function(el){
      var end=parseFloat(el.getAttribute('data-count'));if(isNaN(end))return;
      var dec=(String(el.getAttribute('data-count')).split('.')[1]||'').length,t0=null,dur=1200;
      function step(t){if(!t0)t0=t;var p=Math.min(1,(t-t0)/dur);el.textContent=(end*(1-Math.pow(1-p,3))).toFixed(dec);if(p<1)requestAnimationFrame(step);}
      requestAnimationFrame(step);
    });
  }
  function show(n){
    var ss=slides();if(!ss.length)return;i=Math.max(0,Math.min(n,ss.length-1));
    ss.forEach(function(s,k){s.classList.toggle('active',k===i);});
    var bar=document.getElementById('progress');if(bar)bar.style.width=((i+1)/ss.length*100)+'%';
    var pg=document.getElementById('pageNum');if(pg)pg.textContent=(i+1)+' / '+ss.length;
    animate(ss[i]);
  }
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){e.preventDefault();show(i+1);}
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();show(i-1);}
    else if(e.key==='Home'){show(0);}else if(e.key==='End'){show(slides().length-1);}
  });
  var nx=document.getElementById('nextBtn'),pv=document.getElementById('prevBtn');
  if(nx)nx.addEventListener('click',function(){show(i+1);});
  if(pv)pv.addEventListener('click',function(){show(i-1);});
  var sx=null;
  document.addEventListener('touchstart',function(e){sx=e.touches[0].clientX;},{passive:true});
  document.addEventListener('touchend',function(e){if(sx===null)return;var dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>50)show(i+(dx<0?1:-1));sx=null;});
  window.addEventListener('beforeprint',function(){document.querySelectorAll('[data-count]').forEach(function(el){el.textContent=el.getAttribute('data-count');});});
  if(window.lucide)lucide.createIcons();
  show(0);
})();`;

  function blankDeckHtml({ title, colors, font, logoSvg, slidesHtml }) {
    font = font || 'Inter';
    const cfg = { theme: { extend: { colors: colors || {}, fontFamily: { sans: [font, 'sans-serif'] } } } };
    const first = slidesHtml && slidesHtml.length ? slidesHtml : [LAYOUTS.title.html({ logoSvg, title })];
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title || 'Apresentação')}</title>
<script src="${CDN.tailwind}"></script>
<script>
tailwind.config = ${JSON.stringify(cfg, null, 2)};
</script>
<script src="${CDN.lucide}"></script>
<link href="${SSWPalette.fontUrl(font)}" rel="stylesheet">
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#fff}
#deck{position:fixed;inset:0;overflow:hidden}
#deck>.slide{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .5s ease,visibility .5s;overflow:hidden;background:#fff}
#deck>.slide.active{opacity:1;visibility:visible}
@media print{
  @page{size:13.333in 7.5in;margin:0}
  html,body{height:auto;overflow:visible}
  #deck{position:static}
  #deck>.slide{position:relative;inset:auto;width:13.333in;height:7.5in;opacity:1;visibility:visible;break-after:page;page-break-after:always}
  .no-print{display:none!important}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body class="font-sans text-neutral-800 antialiased">
<div class="no-print fixed top-0 left-0 h-1 bg-primary-700 z-50 transition-all duration-300" id="progress" style="width:0"></div>
<main id="deck">
${first.map((h, k) => `<section class="slide${k === 0 ? ' active' : ''}">${h}</section>`).join('\n')}
</main>
<div class="no-print fixed bottom-4 right-6 z-50 flex items-center gap-3 text-sm text-neutral-500">
  <button id="prevBtn" class="w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-white"><i data-lucide="chevron-left" class="w-4 h-4"></i></button>
  <span id="pageNum" class="tabular-nums">1 / 1</span>
  <button id="nextBtn" class="w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-white"><i data-lucide="chevron-right" class="w-4 h-4"></i></button>
</div>
<script>${PLAYER_JS}</script>
</body>
</html>`;
  }

  /* posições em % do slide (1280x720) */
  function box(x, y, w, h) {
    let s = 'position:absolute;left:' + pct(x, W) + ';top:' + pct(y, H) + ';';
    if (w != null) s += 'width:' + pct(w, W) + ';';
    if (h != null) s += 'height:' + pct(h, H) + ';';
    return s;
  }
  function text(tag, x, y, w, sizePx, weight, cls, content, extra) {
    return `<${tag} data-ssw-el="text" class="${cls}" style="${box(x, y, w)}margin:0;font-size:${px2vw(sizePx)};font-weight:${weight};line-height:1.15;${extra || ''}">${content}</${tag}>`;
  }
  const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#E2E8F0"/><g fill="none" stroke="#94A3B8" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" transform="translate(310 210)"><rect x="0" y="0" width="180" height="150" rx="18"/><circle cx="55" cy="50" r="18"/><path d="M180 105 130 55 20 150"/></g><text x="400" y="430" font-family="Segoe UI, Arial" font-size="30" fill="#64748B" text-anchor="middle">Selecione e clique em Trocar imagem</text></svg>');

  const LAYOUTS = {
    blank: { label: 'Em branco', icon: 'square', html: () => '' },
    title: {
      label: 'Capa', icon: 'heading-1',
      html: ({ title, logoSvg } = {}) =>
        (logoSvg ? `<div data-ssw-el="logo" style="${box(96, 80, 120, 84)}">${logoSvg.replace('<svg', '<svg style="width:100%;height:100%"')}</div>` : '') +
        text('h1', 96, 250, 1000, 72, 800, 'text-primary-700', esc(title || 'Título da apresentação')) +
        text('p', 96, 420, 900, 28, 400, 'text-neutral-600', 'Subtítulo ou recado principal') +
        `<div data-ssw-el="shape" class="bg-secondary-500" style="${box(96, 520, 96, 8)}border-radius:999px"></div>` +
        text('p', 96, 560, 600, 20, 500, 'text-neutral-500', new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }))
    },
    titleText: {
      label: 'Título e texto', icon: 'align-left',
      html: () => text('h2', 96, 90, 1088, 52, 700, 'text-primary-700', 'Título do slide') +
        `<div data-ssw-el="shape" class="bg-secondary-500" style="${box(96, 180, 72, 6)}border-radius:999px"></div>` +
        text('p', 96, 230, 900, 26, 400, 'text-neutral-600', 'Escreva aqui a ideia central do slide. Uma ideia por slide, com frases curtas e dados em destaque.', 'line-height:1.5')
    },
    twoCols: {
      label: 'Duas colunas', icon: 'columns-2',
      html: () => text('h2', 96, 80, 1088, 48, 700, 'text-primary-700', 'Comparativo') +
        `<div data-ssw-el="shape" class="bg-negative-50" style="${box(96, 200, 520, 420)}border-radius:20px"></div>` +
        `<div data-ssw-el="shape" class="bg-positive-50" style="${box(664, 200, 520, 420)}border-radius:20px"></div>` +
        text('h3', 136, 240, 440, 30, 700, 'text-negative-700', 'Antes') +
        text('p', 136, 300, 440, 22, 400, 'text-neutral-700', 'Descreva a situação atual, o problema ou o custo.', 'line-height:1.5') +
        text('h3', 704, 240, 440, 30, 700, 'text-positive-700', 'Depois') +
        text('p', 704, 300, 440, 22, 400, 'text-neutral-700', 'Descreva o resultado, a solução ou o ganho.', 'line-height:1.5')
    },
    kpis: {
      label: 'Números', icon: 'bar-chart-3',
      html: () => text('h2', 96, 80, 1088, 48, 700, 'text-primary-700', 'Resultados em números') +
        [0, 1, 2].map(k => {
          const x = 96 + k * 368;
          return `<div data-ssw-el="shape" class="bg-primary-50" style="${box(x, 220, 336, 340)}border-radius:24px"></div>` +
            text('p', x + 32, 270, 272, 84, 800, 'text-primary-700', ['72%', '3x', '24h'][k]) +
            text('p', x + 32, 400, 272, 24, 600, 'text-neutral-800', ['Economia de energia', 'Mais produtividade', 'Suporte técnico'][k]) +
            text('p', x + 32, 445, 272, 18, 400, 'text-neutral-500', 'Descrição curta do indicador', 'line-height:1.45');
        }).join('')
    },
    quote: {
      label: 'Citação', icon: 'quote',
      html: () => `<i data-lucide="quote" data-ssw-el="icon" class="text-secondary-500" style="${box(96, 110, 96, 96)}width:${px2vw(96)};height:${px2vw(96)}"></i>` +
        text('p', 96, 240, 1000, 48, 600, 'text-primary-800', '“Uma frase marcante que resume a mensagem da apresentação.”', 'line-height:1.25') +
        text('p', 96, 500, 800, 24, 500, 'text-neutral-500', '— Nome do autor, cargo')
    },
    imageText: {
      label: 'Imagem e texto', icon: 'image',
      html: () => `<img data-ssw-el="image" src="${PLACEHOLDER_IMG}" alt="" style="${box(640, 0, 640, 720)}object-fit:cover">` +
        text('h2', 96, 200, 480, 48, 700, 'text-primary-700', 'Título ao lado da imagem') +
        text('p', 96, 340, 480, 24, 400, 'text-neutral-600', 'Texto de apoio curto, com o principal benefício ou dado.', 'line-height:1.5')
    },
    section: {
      label: 'Seção', icon: 'panel-top',
      html: () => `<div data-ssw-el="shape" class="bg-primary-700" style="${box(0, 0, 1280, 720)}"></div>` +
        text('p', 96, 250, 600, 28, 600, 'text-secondary-400', '02') +
        text('h2', 96, 300, 1000, 72, 800, 'text-white', 'Nome da seção')
    }
  };

  /* elementos avulsos (posição central por padrão) */
  const ELEMENTS = {
    heading: () => text('h2', 240, 300, 800, 56, 700, 'text-primary-700', 'Adicione um título', 'text-align:center'),
    subheading: () => text('h3', 290, 320, 700, 32, 600, 'text-neutral-700', 'Adicione um subtítulo', 'text-align:center'),
    body: () => text('p', 340, 330, 600, 20, 400, 'text-neutral-600', 'Adicione um pouco de texto ao corpo do slide', 'line-height:1.5;text-align:center'),
    number: () => text('p', 490, 280, 300, 96, 800, 'text-primary-700', '85%', 'text-align:center'),
    label: () => `<span data-ssw-el="text" class="bg-secondary-100 text-secondary-800" style="${box(560, 340, null)}font-size:${px2vw(16)};font-weight:600;padding:.4em 1em;border-radius:999px;white-space:nowrap">Destaque</span>`,
    rect: () => `<div data-ssw-el="shape" class="bg-primary-700" style="${box(490, 260, 300, 200)}"></div>`,
    rounded: () => `<div data-ssw-el="shape" class="bg-primary-100" style="${box(490, 260, 300, 200)}border-radius:24px"></div>`,
    circle: () => `<div data-ssw-el="shape" class="bg-secondary-500" style="${box(540, 260, 200, 200 * 1)}border-radius:50%;height:${pct(200, H)}"></div>`,
    pill: () => `<div data-ssw-el="shape" class="bg-primary-700" style="${box(440, 320, 400, 80)}border-radius:999px"></div>`,
    line: () => `<div data-ssw-el="shape" class="bg-neutral-800" style="${box(440, 358, 400, 4)}"></div>`,
    triangle: () => `<div data-ssw-el="shape" class="bg-tertiary-500" style="${box(540, 260, 200, 200)}clip-path:polygon(50% 0,100% 100%,0 100%)"></div>`,
    diamond: () => `<div data-ssw-el="shape" class="bg-positive-500" style="${box(540, 260, 200, 200)}clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)"></div>`,
    arrow: () => `<div data-ssw-el="shape" class="bg-secondary-500" style="${box(490, 300, 300, 120)}clip-path:polygon(0 30%,70% 30%,70% 0,100% 50%,70% 100%,70% 70%,0 70%)"></div>`,
    star: () => `<div data-ssw-el="shape" class="bg-warning-500" style="${box(540, 260, 200, 200)}clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)"></div>`,
    hexagon: () => `<div data-ssw-el="shape" class="bg-info-500" style="${box(540, 260, 200, 200)}clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)"></div>`,
    card: () => `<div data-ssw-el="shape" class="bg-white" style="${box(440, 210, 400, 300)}border-radius:20px;box-shadow:0 10px 30px rgba(15,23,42,.12);border:1px solid #E2E8F0"></div>`
  };
  function iconHtml(name, sizePx) {
    sizePx = sizePx || 96;
    const x = (W - sizePx) / 2, y = (H - sizePx) / 2;
    return `<i data-lucide="${esc(name)}" data-ssw-el="icon" class="text-primary-700" style="${box(x, y, null, null)}width:${px2vw(sizePx)};height:${px2vw(sizePx)}"></i>`;
  }
  function imageHtml(src, natW, natH) {
    let w = 560, h = natW && natH ? 560 * natH / natW : 400;
    if (h > 560) { w = w * 560 / h; h = 560; }
    return `<img data-ssw-el="image" src="${src}" alt="" style="${box((W - w) / 2, (H - h) / 2, w, h)}object-fit:cover">`;
  }
  function fullImageSlideInner(src) {
    return `<img data-ssw-el="image" src="${src}" alt="" style="${box(0, 0, W, H)}object-fit:contain;background:#fff">`;
  }

  global.SSWDeck = {
    Deck, W, H, ID, SLIDE, px2vw, pct, esc,
    editorHtml, thumbHtml, printHtml, presentHtml, blankDeckHtml,
    LAYOUTS, ELEMENTS, CDN, SAFE_SCRIPT, iconHtml, imageHtml, fullImageSlideInner, PLACEHOLDER_IMG
  };
})(window);
