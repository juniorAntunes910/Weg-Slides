/* ============================================================
   Slide Studio WEG — barra de contexto (estilo Canva), pílula da seleção e menus
============================================================ */
(function (global) {
  'use strict';
  const { esc, el, icons, popover, closePop, menu, colorPicker } = UI;
  const W = SSWDeck.W;
  const vw = px => (+px / W * 100).toFixed(3) + 'vw';
  const SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96, 120, 144, 180];
  const ALIGNS = ['left', 'center', 'right', 'justify'];
  const ALIGN_IC = { left: 'align-left', center: 'align-center', right: 'align-right', justify: 'align-justify', start: 'align-left', end: 'align-right' };
  const KIND_LABEL = { text: 'Texto', icon: 'Ícone', image: 'Imagem', shape: 'Forma', box: 'Grupo', svg: 'Gráfico', media: 'Mídia' };

  function create(ctx) {
    const editor = ctx.editor, bar = ctx.bar;
    let sel = null, pill = null;

    const b = (icon, title, onClick, o) => {
      o = o || {};
      const x = el('<button class="ctx-btn' + (o.on ? ' is-on' : '') + (o.danger ? ' danger' : '') + (o.cls ? ' ' + o.cls : '') + '" title="' + esc(title) + '" aria-label="' + esc(title) + '">' +
        (icon ? '<i data-lucide="' + icon + '"></i>' : '') + (o.text ? '<span>' + esc(o.text) + '</span>' : '') + '</button>');
      x.addEventListener('mousedown', e => e.preventDefault());
      x.addEventListener('click', e => onClick(x, e));
      return x;
    };
    const sep = () => el('<div class="ctx-sep"></div>');
    const spacer = () => el('<div class="ctx-spacer"></div>');
    const add = (...nodes) => nodes.forEach(n => n && bar.appendChild(n));
    const editingText = () => !!editor.editingId && sel && sel.kind === 'text';
    const textRange = () => editingText() && !editor.textCollapsed;

    /* ---------- render ---------- */
    function render(info) {
      sel = info || null;
      bar.innerHTML = '';
      closePop();
      if (!editor.deck) { add(el('<div class="ctx-empty"><i data-lucide="mouse-pointer-click"></i>Gere, importe ou abra uma apresentação para editar</div>')); icons(bar); return; }
      if (sel && sel.multi) renderMulti();
      else if (!sel || !sel.id) renderSlide();
      else {
        add(crumbs());
        if (sel.kind === 'text') renderText();
        else if (sel.kind === 'icon') renderIcon();
        else if (sel.kind === 'image') renderImage();
        else if (sel.kind === 'shape' || sel.kind === 'box') renderShape();
        add(spacer());
        renderCommon();
      }
      icons(bar);
      updatePill();
    }

    function crumbs() {
      const wrap = el('<div class="ctx-crumbs"></div>');
      const path = (sel.path || []).slice(-3);
      if ((sel.path || []).length > 1) {
        wrap.appendChild(b('corner-left-up', 'Selecionar elemento pai (agrupamento)', () => editor.selectParent()));
      }
      path.forEach((p, i) => {
        if (i) wrap.appendChild(el('<i data-lucide="chevron-right"></i>'));
        const x = el('<button' + (i === path.length - 1 ? ' style="color:var(--ink)"' : '') + '>' + esc(p.label) + '</button>');
        x.onclick = () => editor.select(p.id);
        wrap.appendChild(x);
      });
      wrap.appendChild(sep());
      return wrap;
    }

    function renderSlide() {
      const st = editor.slideStyle() || {};
      add(el('<span class="ctx-label">Slide ' + (editor.current + 1) + '</span>'));
      const bg = b(null, 'Cor de fundo do slide', x => colorPicker(x, {
        title: 'Fundo do slide', value: st.bg, docColors: ctx.docColors(), allowNone: true,
        onPick: c => editor.slideBackground(c === 'transparent' ? { 'background-color': null } : { 'background-color': c })
      }), { text: 'Fundo' });
      bg.prepend(el('<span class="ctx-swatch" style="background:' + (st.bg || '#FFFFFF') + '"></span>'));
      add(bg);
      add(b('image', 'Imagem de fundo', () => ctx.onSlideBgImage(), { text: 'Imagem de fundo' }));
      if (st.bgImage && st.bgImage !== 'none') add(b('image-off', 'Remover imagem de fundo', () => editor.slideBackground({ 'background-image': null, 'background-size': null, 'background-position': null })));
      add(sep());
      add(b('wand-sparkles', 'Reescrever este slide com IA', () => ctx.onAiEdit(editor.current), { text: 'Editar com IA', cls: 'ctx-ai' }));
      add(sep());
      add(b('layout-template', 'Adicionar slide com layout', () => ctx.openPanel('layouts'), { text: 'Layouts' }));
      add(b('copy-plus', 'Duplicar slide', () => editor.duplicateSlide(), { text: 'Duplicar' }));
      add(b('trash-2', 'Excluir slide', () => editor.deleteSlide(), { danger: true }));
      add(spacer());
      add(el('<div class="ctx-empty"><i data-lucide="mouse-pointer-2"></i><span><span class="kbd">Shift</span>+clique seleciona vários</span></div>'));
    }

    function fontButton() {
      const f = sel.style.fontFamily || 'Inter';
      const x = b(null, 'Fonte', x => {
        ctx.loadFontPreviews();
        const items = ctx.fonts().map(name => ({ node: fontItem(name, name === f) }));
        menu(x, items, { cls: 'fp' });
      }, { cls: 'ctx-font' });
      x.innerHTML = '<span>' + esc(f) + '</span><i data-lucide="chevron-down"></i>';
      return x;
    }
    function fontItem(name, on) {
      const it = el('<button class="mi" style="font-family:\'' + esc(name) + '\',sans-serif">' + esc(name) + (on ? '<span class="kb">✓</span>' : '') + '</button>');
      it.onclick = () => { closePop(); ctx.applyFont(name); };
      return it;
    }
    function sizeControl() {
      const cur = Math.round(sel.style.fontSize || 16);
      const wrap = el('<div class="ctx-size"><button title="Diminuir" aria-label="Diminuir fonte"><i data-lucide="minus"></i></button><input value="' + cur + '" aria-label="Tamanho da fonte"><button title="Aumentar" aria-label="Aumentar fonte"><i data-lucide="plus"></i></button></div>');
      const [minus, input, plus] = [wrap.children[0], wrap.children[1], wrap.children[2]];
      const apply = px => {
        px = Math.max(4, Math.min(400, Math.round(px)));
        input.value = px;
        if (textRange()) editor.execText('fontSizePx', px);
        else editor.setStyle({ 'font-size': vw(px) }, 'Tamanho da fonte', 'fs');
      };
      [minus, plus].forEach(x => x.addEventListener('mousedown', e => e.preventDefault()));
      minus.onclick = () => { const v = +input.value || cur; const n = SIZES.slice().reverse().find(s => s < v) || Math.max(4, v - 2); apply(n); };
      plus.onclick = () => { const v = +input.value || cur; const n = SIZES.find(s => s > v) || v + 8; apply(n); };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(+input.value || cur); } e.stopPropagation(); });
      input.addEventListener('change', () => apply(+input.value || cur));
      return wrap;
    }
    function colorButton(title, prop, value, opts) {
      opts = opts || {};
      const x = b(opts.icon || 'baseline', title, x => colorPicker(x, {
        title, value, docColors: ctx.docColors(), allowNone: !!opts.allowNone,
        onPick: (c, live) => {
          if (opts.text && textRange() && c !== 'transparent') { if (!live) editor.execText('foreColor', c); return; }
          const css = {}; css[prop] = c === 'transparent' ? (opts.noneValue || 'transparent') : c;
          editor.setStyle(css, title, prop);
        }
      }), { cls: 'ctx-color' });
      x.appendChild(el('<span class="bar" style="background:' + (value && value !== 'transparent' ? value : 'repeating-linear-gradient(45deg,#fff 0 3px,#E2E8F0 3px 6px)') + '"></span>'));
      return x;
    }
    function toggleStyle(icon, title, on, cmd, css) {
      return b(icon, title, () => {
        if (textRange()) editor.execText(cmd);
        else editor.setStyle(css(on), title);
      }, { on });
    }

    function renderText() {
      const s = sel.style;
      add(fontButton(), sizeControl(), colorButton('Cor do texto', 'color', s.color, { text: true }));
      add(sep());
      const bold = parseInt(s.fontWeight, 10) >= 600;
      add(toggleStyle('bold', 'Negrito (Ctrl+B)', bold, 'bold', on => ({ 'font-weight': on ? '400' : '700' })));
      add(toggleStyle('italic', 'Itálico (Ctrl+I)', s.fontStyle === 'italic', 'italic', on => ({ 'font-style': on ? 'normal' : 'italic' })));
      add(toggleStyle('underline', 'Sublinhado (Ctrl+U)', s.underline, 'underline', on => ({ 'text-decoration': on ? 'none' : 'underline' })));
      add(toggleStyle('strikethrough', 'Tachado', s.strike, 'strikeThrough', on => ({ 'text-decoration': on ? 'none' : 'line-through' })));
      add(b('case-upper', 'Caixa alta', () => editor.setStyle({ 'text-transform': s.upper ? 'none' : 'uppercase' }, 'Caixa alta'), { on: s.upper }));
      add(sep());
      const al = ALIGNS.includes(s.textAlign) ? s.textAlign : (s.textAlign === 'end' ? 'right' : 'left');
      add(b(ALIGN_IC[al] || 'align-left', 'Alinhamento', () => editor.setStyle({ 'text-align': ALIGNS[(ALIGNS.indexOf(al) + 1) % ALIGNS.length] }, 'Alinhamento')));
      add(b('baseline', 'Espaçamento', x => spacingPop(x), { text: 'Espaçamento' }));
      const hl = b('highlighter', 'Fundo do texto', x => colorPicker(x, {
        title: 'Fundo do texto', value: s.background, docColors: ctx.docColors(), allowNone: true,
        onPick: (c, live) => { if (textRange()) { if (!live) editor.execText('hiliteColor', c === 'transparent' ? 'transparent' : c); } else editor.setStyle({ 'background-color': c === 'transparent' ? null : c }, 'Fundo do texto', 'bgc'); }
      }));
      add(hl);
      if (!editingText()) add(b('text-cursor-input', 'Editar texto (Enter)', () => editor.startEdit(sel.id), { text: 'Editar' }));
    }
    function spacingPop(anchor) {
      const s = sel.style;
      const fs = s.fontSize || 16;
      const lsPx = s.letterSpacing || 0;
      const node = el('<div class="pop-pad" style="width:300px">' +
        '<div class="range-row"><label>Entre linhas</label><input type="range" min="0.8" max="2.6" step="0.05" value="' + (s.lineHeight || 1.2) + '"><output>' + (s.lineHeight || 1.2) + '</output></div>' +
        '<div class="range-row"><label>Entre letras</label><input type="range" min="-5" max="30" step="0.5" value="' + lsPx + '"><output>' + lsPx + '</output></div></div>');
      const [lh, ls] = node.querySelectorAll('input');
      const [olh, ols] = node.querySelectorAll('output');
      lh.oninput = () => { olh.textContent = lh.value; editor.setStyle({ 'line-height': lh.value }, 'Entre linhas', 'lh'); };
      ls.oninput = () => { ols.textContent = ls.value; editor.setStyle({ 'letter-spacing': (+ls.value / fs).toFixed(3) + 'em' }, 'Entre letras', 'ls'); };
      popover(anchor, node);
    }

    function renderIcon() {
      const s = sel.style;
      add(colorButton('Cor do ícone', 'color', s.color));
      add(sep());
      const px = Math.round(sel.rect ? sel.rect.w : 48);
      const wrap = el('<div class="ctx-size"><button aria-label="Diminuir"><i data-lucide="minus"></i></button><input value="' + px + '" aria-label="Tamanho do ícone"><button aria-label="Aumentar"><i data-lucide="plus"></i></button></div>');
      const [m, input, p] = wrap.children;
      const apply = v => { v = Math.max(8, Math.min(720, Math.round(v))); input.value = v; editor.setStyle({ width: vw(v), height: vw(v) }, 'Tamanho do ícone', 'isz'); };
      m.onclick = () => apply((+input.value || px) - 8); p.onclick = () => apply((+input.value || px) + 8);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') apply(+input.value || px); e.stopPropagation(); });
      add(el('<span class="ctx-label">Tamanho</span>'), wrap);
      add(b('pen-line', 'Espessura do traço', x => {
        const node = el('<div class="pop-pad" style="width:280px"><div class="range-row"><label>Traço</label><input type="range" min="0.5" max="4" step="0.25" value="' + (s.strokeWidth || 2) + '"><output>' + (s.strokeWidth || 2) + '</output></div></div>');
        const r = node.querySelector('input'), o = node.querySelector('output');
        r.oninput = () => { o.textContent = r.value; };
        r.onchange = () => editor.setAttr('stroke-width', r.value, 'Espessura do traço');
        popover(x, node);
      }, { text: 'Traço' }));
      add(sep());
      add(b('replace', 'Trocar ícone', () => ctx.onReplaceIcon(sel.id), { text: 'Trocar ícone' }));
    }

    function renderImage() {
      const s = sel.style;
      add(b('image-plus', 'Trocar imagem', () => ctx.onReplaceImage(sel.id), { text: 'Trocar imagem' }));
      add(sep());
      const cover = s.objectFit !== 'contain';
      add(b(cover ? 'crop' : 'maximize', cover ? 'Preenchendo a área (clique para ajustar inteira)' : 'Imagem inteira (clique para preencher)', () =>
        editor.setStyle({ 'object-fit': cover ? 'contain' : 'cover' }, 'Ajuste da imagem'), { text: cover ? 'Preencher' : 'Ajustar' }));
      add(radiusButton(s));
      add(b('flip-horizontal-2', 'Espelhar', () => editor.setStyle({ scale: s.flipX ? null : '-1 1' }, 'Espelhar'), { on: s.flipX }));
      add(shadowButton(s));
    }

    function radiusButton(s) {
      return b('square-round-corner', 'Cantos arredondados', x => {
        const node = el('<div class="pop-pad" style="width:280px"><div class="range-row"><label>Cantos</label><input type="range" min="0" max="200" step="1" value="' + (s.radius || 0) + '"><output>' + (s.radius || 0) + '</output></div>' +
          '<button class="mi" data-full><i data-lucide="circle"></i>Totalmente arredondado</button></div>');
        const r = node.querySelector('input'), o = node.querySelector('output');
        r.oninput = () => { o.textContent = r.value; editor.setStyle({ 'border-radius': +r.value ? vw(+r.value) : null }, 'Cantos', 'rad'); };
        node.querySelector('[data-full]').onclick = () => { closePop(); editor.setStyle({ 'border-radius': '9999px' }, 'Cantos'); };
        popover(x, node);
      }, { text: 'Cantos' });
    }
    function shadowButton(s) {
      return b('square-stack', s.shadow ? 'Remover sombra' : 'Adicionar sombra', () =>
        editor.setStyle({ 'box-shadow': s.shadow ? 'none' : '0 1.2vw 3vw rgba(15,23,42,.18)' }, 'Sombra'), { on: s.shadow, text: 'Sombra' });
    }

    function renderShape() {
      const s = sel.style;
      add(colorButton('Preenchimento', 'background-color', s.background, { icon: 'paint-bucket', allowNone: true }));
      add(b('square-dashed', 'Borda', x => {
        const node = el('<div class="pop-pad" style="width:300px">' +
          '<div class="range-row"><label>Espessura</label><input type="range" min="0" max="24" step="1" value="' + (s.borderWidth || 0) + '"><output>' + (s.borderWidth || 0) + '</output></div>' +
          '<div class="seg" style="margin:6px 0 10px"><button data-st="solid" class="' + (s.borderStyle !== 'dashed' && s.borderStyle !== 'dotted' ? 'is-on' : '') + '">Contínua</button><button data-st="dashed" class="' + (s.borderStyle === 'dashed' ? 'is-on' : '') + '">Tracejada</button><button data-st="dotted" class="' + (s.borderStyle === 'dotted' ? 'is-on' : '') + '">Pontilhada</button></div>' +
          '<button class="btn btn-outline btn-block" data-color><span class="ctx-swatch" style="width:18px;height:18px;background:' + (s.borderColor || '#0F172A') + '"></span>Cor da borda</button></div>');
        const r = node.querySelector('input'), o = node.querySelector('output');
        let style = s.borderStyle && s.borderStyle !== 'none' ? s.borderStyle : 'solid';
        const color = () => s.borderColor && s.borderColor !== 'transparent' ? s.borderColor : '#0F172A';
        r.oninput = () => { o.textContent = r.value; editor.setStyle(+r.value ? { 'border-width': vw(+r.value), 'border-style': style, 'border-color': color() } : { 'border-width': null, 'border-style': null, 'border-color': null, border: 'none' }, 'Borda', 'bw'); };
        node.querySelectorAll('[data-st]').forEach(x => x.onclick = () => { style = x.dataset.st; node.querySelectorAll('[data-st]').forEach(y => y.classList.toggle('is-on', y === x)); if (+r.value) editor.setStyle({ 'border-style': style }, 'Borda'); });
        node.querySelector('[data-color]').onclick = () => colorPicker(x, { title: 'Cor da borda', value: s.borderColor, docColors: ctx.docColors(), onPick: c => editor.setStyle({ 'border-color': c, 'border-style': style, 'border-width': vw(Math.max(1, +r.value || 2)) }, 'Cor da borda', 'bc') });
        popover(x, node);
      }, { text: 'Borda' }));
      add(radiusButton(s));
      add(shadowButton(s));
    }

    /* ---------- seleção múltipla ---------- */
    function renderMulti() {
      add(el('<span class="ctx-label"><i data-lucide="boxes"></i>' + sel.count + ' elementos</span>'));
      add(sep());
      add(b('align-horizontal-justify-center', 'Alinhar os elementos entre si', x => alignPop(x), { text: 'Alinhar' }));
      add(b('layers', 'Camadas e posição na página', x => positionPop(x), { text: 'Posição' }));
      add(opacityButton());
      add(spacer());
      add(b(sel.locked ? 'lock' : 'lock-open', sel.locked ? 'Desbloquear todos' : 'Bloquear todos', () => editor.toggleLock(), { on: sel.locked }));
      add(b('copy-plus', 'Duplicar (Ctrl+D)', () => editor.duplicateSelection()));
      add(b('trash-2', 'Excluir (Delete)', () => editor.deleteSelection(), { danger: true }));
    }
    function alignPop(anchor) {
      const n = sel.count || 0;
      const node = el('<div style="width:280px;padding:4px">' +
        '<div class="mi-head">Alinhar entre si</div><div class="align-grid">' +
        '<button class="mi" data-h="left"><i data-lucide="align-start-vertical"></i>Esquerda</button>' +
        '<button class="mi" data-h="center"><i data-lucide="align-center-vertical"></i>Centro</button>' +
        '<button class="mi" data-h="right"><i data-lucide="align-end-vertical"></i>Direita</button>' +
        '<button class="mi" data-v="top"><i data-lucide="align-start-horizontal"></i>Topo</button>' +
        '<button class="mi" data-v="middle"><i data-lucide="align-center-horizontal"></i>Meio</button>' +
        '<button class="mi" data-v="bottom"><i data-lucide="align-end-horizontal"></i>Base</button></div>' +
        '<div class="mi-sep"></div><div class="mi-head">Distribuir com espaços iguais</div>' +
        '<button class="mi" data-d="h"' + (n < 3 ? ' disabled' : '') + '><i data-lucide="align-horizontal-space-around"></i>Na horizontal</button>' +
        '<button class="mi" data-d="v"' + (n < 3 ? ' disabled' : '') + '><i data-lucide="align-vertical-space-around"></i>Na vertical</button>' +
        (n < 3 ? '<div class="hint" style="padding:2px 10px 6px">Selecione 3 ou mais para distribuir.</div>' : '') + '</div>');
      node.querySelectorAll('[data-h]').forEach(x => x.onclick = () => { closePop(); editor.alignGroup(x.dataset.h, null); });
      node.querySelectorAll('[data-v]').forEach(x => x.onclick = () => { closePop(); editor.alignGroup(null, x.dataset.v); });
      node.querySelectorAll('[data-d]').forEach(x => x.onclick = () => { closePop(); editor.distribute(x.dataset.d); });
      popover(anchor, node);
    }
    function opacityButton() {
      const s = sel.style || {};
      return b('blend', 'Transparência', x => {
        const v = Math.round((s.opacity == null ? 1 : s.opacity) * 100);
        const node = el('<div class="pop-pad" style="width:280px"><div class="range-row"><label>Opacidade</label><input type="range" min="0" max="100" value="' + v + '"><output>' + v + '</output></div></div>');
        const r = node.querySelector('input'), o = node.querySelector('output');
        r.oninput = () => { o.textContent = r.value; editor.setStyle({ opacity: +r.value >= 100 ? null : String(+r.value / 100) }, 'Transparência', 'op'); };
        popover(x, node, { align: 'right' });
      });
    }

    function renderCommon() {
      add(opacityButton());
      add(b('layers', 'Posição e alinhamento', x => positionPop(x), { text: 'Posição' }));
      add(b(sel.locked ? 'lock' : 'lock-open', sel.locked ? 'Desbloquear' : 'Bloquear', () => editor.toggleLock(), { on: sel.locked }));
      add(b('copy-plus', 'Duplicar (Ctrl+D)', () => editor.duplicateSelection()));
      add(b('trash-2', 'Excluir (Delete)', () => editor.deleteSelection(), { danger: true }));
    }
    function positionPop(anchor) {
      const node = el('<div style="width:280px;padding:4px">' +
        '<div class="mi-head">Camadas</div>' +
        '<button class="mi" data-l="front"><i data-lucide="bring-to-front"></i>Trazer para frente</button>' +
        '<button class="mi" data-l="back"><i data-lucide="send-to-back"></i>Enviar para trás</button>' +
        '<div class="mi-sep"></div><div class="mi-head">Alinhar à página</div><div class="align-grid">' +
        '<button class="mi" data-h="left"><i data-lucide="align-start-vertical"></i>Esquerda</button>' +
        '<button class="mi" data-h="center"><i data-lucide="align-center-vertical"></i>Centro</button>' +
        '<button class="mi" data-h="right"><i data-lucide="align-end-vertical"></i>Direita</button>' +
        '<button class="mi" data-v="top"><i data-lucide="align-start-horizontal"></i>Topo</button>' +
        '<button class="mi" data-v="middle"><i data-lucide="align-center-horizontal"></i>Meio</button>' +
        '<button class="mi" data-v="bottom"><i data-lucide="align-end-horizontal"></i>Base</button></div></div>');
      node.querySelectorAll('[data-l]').forEach(x => x.onclick = () => { closePop(); editor.layer(x.dataset.l); });
      node.querySelectorAll('[data-h]').forEach(x => x.onclick = () => { closePop(); editor.alignPage(x.dataset.h, null); });
      node.querySelectorAll('[data-v]').forEach(x => x.onclick = () => { closePop(); editor.alignPage(null, x.dataset.v); });
      popover(anchor, node, { align: 'right' });
    }

    /* ---------- pílula flutuante ---------- */
    function ensurePill() {
      if (pill) return pill;
      pill = el('<div class="sel-pill hidden"><span class="sp-label"></span>' +
        '<button data-a="edit" title="Editar texto"><i data-lucide="text-cursor-input"></i></button>' +
        '<button data-a="dup" title="Duplicar (Ctrl+D)"><i data-lucide="copy-plus"></i></button>' +
        '<button data-a="lock" title="Bloquear"><i data-lucide="lock-open"></i></button>' +
        '<button data-a="del" title="Excluir (Delete)"><i data-lucide="trash-2"></i></button>' +
        '<button data-a="more" title="Mais opções"><i data-lucide="more-horizontal"></i></button></div>');
      document.body.appendChild(pill); icons(pill);
      pill.addEventListener('mousedown', e => e.preventDefault());
      pill.querySelector('[data-a=edit]').onclick = () => editor.startEdit();
      pill.querySelector('[data-a=dup]').onclick = () => editor.duplicateSelection();
      pill.querySelector('[data-a=lock]').onclick = () => editor.toggleLock();
      pill.querySelector('[data-a=del]').onclick = () => editor.deleteSelection();
      pill.querySelector('[data-a=more]').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); contextMenu(r.left, r.bottom + 6, true); };
      return pill;
    }
    function updatePill() {
      const p = ensurePill();
      const r = editor.selScreenRect();
      const stage = ctx.stageRect();
      if (!sel || !(sel.id || sel.multi) || !r || editor.editingId || ctx.isHidden()) { p.classList.add('hidden'); return; }
      p.querySelector('.sp-label').textContent = sel.multi ? sel.count + ' elementos' : (KIND_LABEL[sel.kind] || 'Elemento');
      p.querySelector('[data-a=edit]').classList.toggle('hidden', sel.multi || sel.kind !== 'text' || sel.locked);
      const lk = p.querySelector('[data-a=lock]');
      lk.title = sel.locked ? 'Desbloquear' : 'Bloquear';
      lk.innerHTML = '<i data-lucide="' + (sel.locked ? 'lock' : 'lock-open') + '"></i>'; icons(lk);
      let x = r.left + r.width / 2, y = r.top - 14;
      if (y - 44 < stage.top) y = r.top + r.height + 52;
      x = Math.max(stage.left + 120, Math.min(stage.right - 120, x));
      if (y > stage.bottom - 4 || y < stage.top + 40 || r.left > stage.right || r.left + r.width < stage.left) { p.classList.add('hidden'); return; }
      p.style.left = Math.round(x) + 'px'; p.style.top = Math.round(y) + 'px';
      p.classList.remove('hidden');
    }
    function hidePill() { if (pill) pill.classList.add('hidden'); }

    /* ---------- menus de contexto ---------- */
    function contextMenu(x, y, hasSel) {
      const s = sel;
      if (hasSel && s && s.multi) {
        menu({ x, y }, [
          { head: s.count + ' elementos' },
          { label: 'Copiar', icon: 'copy', kb: 'Ctrl+C', onClick: () => editor.copySelection(false) },
          { label: 'Recortar', icon: 'scissors', kb: 'Ctrl+X', onClick: () => editor.copySelection(true) },
          { label: 'Duplicar', icon: 'copy-plus', kb: 'Ctrl+D', onClick: () => editor.duplicateSelection() },
          { label: 'Excluir', icon: 'trash-2', kb: 'Delete', danger: true, onClick: () => editor.deleteSelection() },
          { sep: true },
          { label: 'Alinhar à esquerda', icon: 'align-start-vertical', onClick: () => editor.alignGroup('left', null) },
          { label: 'Centralizar entre si', icon: 'align-center-vertical', onClick: () => editor.alignGroup('center', null) },
          { label: 'Alinhar ao topo', icon: 'align-start-horizontal', onClick: () => editor.alignGroup(null, 'top') },
          { label: 'Distribuir na horizontal', icon: 'align-horizontal-space-around', disabled: s.count < 3, onClick: () => editor.distribute('h') },
          { sep: true },
          { label: 'Trazer para frente', icon: 'bring-to-front', onClick: () => editor.layer('front') },
          { label: 'Enviar para trás', icon: 'send-to-back', onClick: () => editor.layer('back') },
          { label: s.locked ? 'Desbloquear todos' : 'Bloquear todos', icon: s.locked ? 'lock-open' : 'lock', onClick: () => editor.toggleLock() }
        ]);
        return;
      }
      const items = hasSel && s ? [
        { label: 'Copiar', icon: 'copy', kb: 'Ctrl+C', onClick: () => editor.copySelection(false) },
        { label: 'Recortar', icon: 'scissors', kb: 'Ctrl+X', onClick: () => editor.copySelection(true) },
        { label: 'Colar', icon: 'clipboard-paste', kb: 'Ctrl+V', disabled: !editor.clip, onClick: () => editor.pasteClip() },
        { label: 'Duplicar', icon: 'copy-plus', kb: 'Ctrl+D', onClick: () => editor.duplicateSelection() },
        { label: 'Excluir', icon: 'trash-2', kb: 'Delete', danger: true, onClick: () => editor.deleteSelection() },
        { sep: true },
        s.kind === 'text' ? { label: 'Editar texto', icon: 'text-cursor-input', kb: 'Enter', onClick: () => editor.startEdit(s.id) } : null,
        s.kind === 'image' ? { label: 'Trocar imagem', icon: 'image-plus', onClick: () => ctx.onReplaceImage(s.id) } : null,
        s.kind === 'icon' ? { label: 'Trocar ícone', icon: 'replace', onClick: () => ctx.onReplaceIcon(s.id) } : null,
        { label: 'Trazer para frente', icon: 'bring-to-front', onClick: () => editor.layer('front') },
        { label: 'Enviar para trás', icon: 'send-to-back', onClick: () => editor.layer('back') },
        { label: 'Centralizar na página', icon: 'align-center', onClick: () => { editor.alignPage('center', null); setTimeout(() => editor.alignPage(null, 'middle'), 120); } },
        { label: s.locked ? 'Desbloquear' : 'Bloquear', icon: s.locked ? 'lock-open' : 'lock', onClick: () => editor.toggleLock() },
        (s.path || []).length > 1 ? { label: 'Selecionar agrupamento', icon: 'corner-left-up', onClick: () => editor.selectParent() } : null
      ] : [
        { label: 'Colar', icon: 'clipboard-paste', kb: 'Ctrl+V', disabled: !editor.clip, onClick: () => editor.pasteClip() },
        { sep: true },
        { label: 'Editar slide com IA', icon: 'wand-sparkles', onClick: () => ctx.onAiEdit(editor.current) },
        { label: 'Adicionar texto', icon: 'type', onClick: () => ctx.insertText('heading') },
        { label: 'Cor de fundo do slide', icon: 'paint-bucket', onClick: () => colorPicker({ x, y }, { title: 'Fundo do slide', docColors: ctx.docColors(), allowNone: true, onPick: c => editor.slideBackground(c === 'transparent' ? { 'background-color': null } : { 'background-color': c }) }) },
        { label: 'Duplicar slide', icon: 'copy-plus', onClick: () => editor.duplicateSlide() },
        { label: 'Excluir slide', icon: 'trash-2', danger: true, onClick: () => editor.deleteSlide() }
      ];
      menu({ x, y }, items.filter(Boolean));
    }
    function slideMenu(i, x, y) {
      const n = editor.slideCount;
      menu({ x, y }, [
        { head: 'Slide ' + (i + 1) },
        { label: 'Editar com IA', icon: 'wand-sparkles', onClick: () => { editor.goTo(i); ctx.onAiEdit(i); } },
        { label: 'Adicionar slide depois', icon: 'file-plus-2', onClick: () => { editor.goTo(i); ctx.openPanel('layouts'); } },
        { label: 'Duplicar', icon: 'copy-plus', onClick: () => editor.duplicateSlide(i) },
        { label: 'Mover para a esquerda', icon: 'chevron-left', disabled: i === 0, onClick: () => editor.moveSlide(i, i - 1) },
        { label: 'Mover para a direita', icon: 'chevron-right', disabled: i >= n - 1, onClick: () => editor.moveSlide(i, i + 1) },
        { sep: true },
        { label: 'Excluir', icon: 'trash-2', danger: true, disabled: n <= 1, onClick: () => editor.deleteSlide(i) }
      ]);
    }

    return { render, updatePill, hidePill, contextMenu, slideMenu, get sel() { return sel; } };
  }

  global.SSWToolbar = { create };
})(window);
