/* ============================================================
   Slide Studio WEG — importação de arquivos
   - Documentos -> texto para a IA: PDF, DOCX, PPTX, XLSX, ODT, ODP, ODS, RTF, HTML, TXT, MD, CSV, JSON, XML...
   - PDF -> imagens das páginas (importar como slides)
   - Imagens -> data URL reduzida (para inserir nos slides)
   Sem dependências além do pdf.js (vendor/pdfjs). ZIP lido com DecompressionStream nativo.
============================================================ */
(function (global) {
  'use strict';

  const MAX_CHARS = 100000;
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  const PDFJS_LOCAL = new URL('vendor/pdfjs/pdf.min.mjs', SCRIPT_SRC).href;
  const PDFJS_LOCAL_WORKER = new URL('vendor/pdfjs/pdf.worker.min.mjs', SCRIPT_SRC).href;
  const PDFJS_CDN = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.min.mjs';
  const PDFJS_CDN_WORKER = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

  const EXT = {
    image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'],
    html: ['html', 'htm'],
    pdf: ['pdf'],
    doc: ['docx', 'docm', 'pptx', 'pptm', 'xlsx', 'xlsm', 'odt', 'odp', 'ods', 'rtf', 'txt', 'md', 'markdown', 'csv', 'tsv',
      'json', 'xml', 'log', 'yaml', 'yml', 'ini'],
    legacy: ['doc', 'ppt', 'xls', 'pps', 'pages', 'key', 'numbers']
  };
  const ACCEPT_DOCS = '.pdf,.docx,.docm,.pptx,.pptm,.xlsx,.xlsm,.odt,.odp,.ods,.rtf,.txt,.md,.markdown,.csv,.tsv,.json,.xml,.log,.yaml,.yml,.html,.htm';
  const ACCEPT_IMAGES = '.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.avif';

  function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }

  function classify(file) {
    const ext = extOf(file.name);
    for (const kind of Object.keys(EXT)) if (EXT[kind].includes(ext)) return kind;
    if (/^image\//.test(file.type)) return 'image';
    if (/^text\//.test(file.type)) return 'doc';
    return 'unsupported';
  }

  /* ---------------- Texto: decodificação ---------------- */
  function decodeText(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); }
    catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }

  function tidy(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t\u00A0]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function truncate(text) {
    if (text.length <= MAX_CHARS) return { text, truncated: false };
    return { text: text.slice(0, MAX_CHARS) + '\n\n[... conteúdo truncado em 100 mil caracteres ...]', truncated: true };
  }

  /* ---------------- ZIP (leitura) ---------------- */
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Seu navegador não suporta descompactação (use Edge ou Chrome atualizado).');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function openZip(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const len = bytes.length;
    let eocd = -1;
    for (let i = len - 22; i >= Math.max(0, len - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Arquivo compactado inválido ou corrompido.');
    let count = view.getUint16(eocd + 10, true);
    let cdOffset = view.getUint32(eocd + 16, true);
    if ((count === 0xFFFF || cdOffset === 0xFFFFFFFF) && eocd >= 20 && view.getUint32(eocd - 20, true) === 0x07064b50) {
      const z64 = Number(view.getBigUint64(eocd - 12, true));
      if (view.getUint32(z64, true) === 0x06064b50) {
        count = Number(view.getBigUint64(z64 + 32, true));
        cdOffset = Number(view.getBigUint64(z64 + 48, true));
      }
    }
    const utf8 = new TextDecoder('utf-8');
    const entries = new Map();
    let p = cdOffset;
    for (let n = 0; n < count && p + 46 <= len; n++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      const flags = view.getUint16(p + 8, true);
      const method = view.getUint16(p + 10, true);
      let compSize = view.getUint32(p + 20, true);
      let size = view.getUint32(p + 24, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      let localOffset = view.getUint32(p + 42, true);
      const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      // ZIP64: campos estendidos
      let e = p + 46 + nameLen; const eEnd = e + extraLen;
      while (e + 4 <= eEnd) {
        const id = view.getUint16(e, true), sz = view.getUint16(e + 2, true);
        if (id === 0x0001) {
          let q = e + 4;
          if (size === 0xFFFFFFFF) { size = Number(view.getBigUint64(q, true)); q += 8; }
          if (compSize === 0xFFFFFFFF) { compSize = Number(view.getBigUint64(q, true)); q += 8; }
          if (localOffset === 0xFFFFFFFF) { localOffset = Number(view.getBigUint64(q, true)); }
        }
        e += 4 + sz;
      }
      entries.set(name, { name, method, compSize, size, localOffset, encrypted: !!(flags & 1) });
      p += 46 + nameLen + extraLen + commentLen;
    }
    const cache = new Map();
    async function getBytes(name) {
      const ent = entries.get(name);
      if (!ent) return null;
      if (cache.has(name)) return cache.get(name);
      if (ent.encrypted) throw new Error('O arquivo está protegido por senha.');
      const lo = ent.localOffset;
      if (view.getUint32(lo, true) !== 0x04034b50) throw new Error('Estrutura interna inválida (' + name + ').');
      const start = lo + 30 + view.getUint16(lo + 26, true) + view.getUint16(lo + 28, true);
      const raw = bytes.subarray(start, start + ent.compSize);
      let out;
      if (ent.method === 0) out = raw;
      else if (ent.method === 8) out = await inflateRaw(raw);
      else throw new Error('Método de compressão não suportado (' + ent.method + ').');
      cache.set(name, out);
      return out;
    }
    return {
      names: () => Array.from(entries.keys()),
      has: name => entries.has(name),
      bytes: getBytes,
      text: async name => { const b = await getBytes(name); return b ? utf8.decode(b) : null; }
    };
  }

  /* ---------------- XML utilitários ---------------- */
  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML inválido no documento.');
    return doc;
  }
  function kids(node, local) { return Array.from(node.children || []).filter(c => !local || c.localName === local); }
  function kid(node, local) { return kids(node, local)[0] || null; }
  function descendants(node, local) {
    const out = [];
    (function walk(n) { for (const c of n.children || []) { if (c.localName === local) out.push(c); walk(c); } })(node);
    return out;
  }
  function attrLocal(el, local) {
    if (!el) return null;
    for (const a of el.attributes) if (a.localName === local) return a.value;
    return null;
  }
  function resolvePath(base, target) {
    if (target.startsWith('/')) return target.slice(1);
    const parts = base.split('/'); parts.pop();
    for (const seg of target.split('/')) {
      if (seg === '..') parts.pop();
      else if (seg && seg !== '.') parts.push(seg);
    }
    return parts.join('/');
  }
  async function readRels(zip, relsPath, basePath) {
    const map = {};
    const xml = await zip.text(relsPath);
    if (!xml) return map;
    for (const r of parseXml(xml).getElementsByTagName('Relationship')) {
      const target = r.getAttribute('Target') || '';
      map[r.getAttribute('Id')] = {
        type: r.getAttribute('Type') || '',
        target: r.getAttribute('TargetMode') === 'External' ? target : resolvePath(basePath, target),
        external: r.getAttribute('TargetMode') === 'External'
      };
    }
    return map;
  }

  /* ---------------- DOCX ---------------- */
  function docxRunText(node) {
    let s = '';
    (function walk(n) {
      for (const c of n.childNodes) {
        if (c.nodeType !== 1) continue;
        const ln = c.localName;
        if (ln === 't') s += c.textContent;
        else if (ln === 'tab' || ln === 'ptab') s += '\t';
        else if (ln === 'br' || ln === 'cr') s += '\n';
        else if (ln === 'noBreakHyphen') s += '-';
        else if (ln === 'sym') s += '';
        else if (ln === 'del' || ln === 'delText' || ln === 'instrText' || ln === 'fldData' || ln === 'rPr' || ln === 'pPr') continue;
        else if (ln === 'AlternateContent') { const fb = kid(c, 'Choice') || kid(c, 'Fallback'); if (fb) walk(fb); }
        else walk(c);
      }
    })(node);
    return s;
  }
  function docxParagraph(p) {
    const pPr = kid(p, 'pPr');
    let prefix = '';
    if (pPr) {
      const style = attrLocal(kid(pPr, 'pStyle'), 'val') || '';
      const h = /^(?:heading|t[ií]?tulo|cabe[cç]alho)\s*(\d)$/i.exec(style);
      if (h) prefix = '#'.repeat(Math.min(6, +h[1])) + ' ';
      else if (/^(title|t[ií]?tulo)$/i.test(style)) prefix = '# ';
      else if (/^(subtitle|subt[ií]?tulo)$/i.test(style)) prefix = '## ';
      else if (kid(pPr, 'numPr') || /list|lista|bullet|marcador/i.test(style)) {
        const lvl = +(attrLocal(kid(kid(pPr, 'numPr') || pPr, 'ilvl'), 'val') || 0);
        prefix = '  '.repeat(lvl) + '- ';
      }
    }
    const text = docxRunText(p).replace(/[ \t]+$/g, '');
    return text.trim() ? prefix + text : '';
  }
  function docxTable(tbl) {
    const rows = [];
    for (const tr of kids(tbl, 'tr')) {
      const cells = kids(tr, 'tc').map(tc => kids(tc, 'p').map(docxParagraph).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim());
      if (cells.some(Boolean)) rows.push('| ' + cells.join(' | ') + ' |');
    }
    return rows.join('\n');
  }
  function docxBlocks(node, out) {
    for (const c of kids(node)) {
      const ln = c.localName;
      if (ln === 'p') { const t = docxParagraph(c); if (t) out.push(t); }
      else if (ln === 'tbl') { const t = docxTable(c); if (t) out.push(t); }
      else if (ln === 'sdt') { const content = kid(c, 'sdtContent'); if (content) docxBlocks(content, out); }
      else if (ln === 'customXml' || ln === 'ins' || ln === 'smartTag') docxBlocks(c, out);
    }
  }
  async function docxToText(zip) {
    const xml = await zip.text('word/document.xml');
    if (!xml) throw new Error('Documento Word sem conteúdo (word/document.xml ausente).');
    const doc = parseXml(xml);
    const body = descendants(doc.documentElement, 'body')[0] || doc.documentElement;
    const out = [];
    docxBlocks(body, out);
    for (const extra of ['word/footnotes.xml', 'word/endnotes.xml']) {
      const x = await zip.text(extra);
      if (!x) continue;
      const notes = descendants(parseXml(x).documentElement, 'p').map(docxParagraph).filter(t => t.trim());
      if (notes.length) out.push('\nNotas:\n' + notes.join('\n'));
    }
    return out.join('\n\n');
  }

  /* ---------------- PPTX ---------------- */
  function pptxParagraphs(txBody) {
    const lines = [];
    for (const p of kids(txBody, 'p')) {
      let s = '';
      (function walk(n) {
        for (const c of n.children) {
          const ln = c.localName;
          if (ln === 't') s += c.textContent;
          else if (ln === 'br') s += '\n';
          else if (ln === 'r' || ln === 'fld') walk(c);
        }
      })(p);
      const lvl = +(attrLocal(kid(p, 'pPr'), 'lvl') || 0);
      if (s.trim()) lines.push({ text: s.trim(), lvl });
    }
    return lines;
  }
  function pptxShapeKind(sp) {
    const nv = kid(sp, 'nvSpPr') || kid(sp, 'nvGraphicFramePr');
    const ph = nv && descendants(nv, 'ph')[0];
    return ph ? (ph.getAttribute('type') || 'body') : 'shape';
  }
  function pptxCollect(node, out) {
    for (const c of kids(node)) {
      const ln = c.localName;
      if (ln === 'sp') {
        const kind = pptxShapeKind(c);
        if (kind === 'sldNum' || kind === 'dt' || kind === 'ftr' || kind === 'sldImg') continue;
        const tx = kid(c, 'txBody');
        if (!tx) continue;
        const paras = pptxParagraphs(tx);
        if (!paras.length) continue;
        if (kind === 'title' || kind === 'ctrTitle') out.push('## ' + paras.map(p => p.text).join(' '));
        else if (kind === 'subTitle') out.push('### ' + paras.map(p => p.text).join(' '));
        else paras.forEach(p => out.push('  '.repeat(p.lvl) + '- ' + p.text));
      } else if (ln === 'graphicFrame') {
        for (const tbl of descendants(c, 'tbl')) {
          for (const tr of kids(tbl, 'tr')) {
            const cells = kids(tr, 'tc').map(tc => { const tx = kid(tc, 'txBody'); return tx ? pptxParagraphs(tx).map(p => p.text).join(' ') : ''; });
            if (cells.some(Boolean)) out.push('| ' + cells.join(' | ') + ' |');
          }
        }
      } else if (ln === 'grpSp') {
        pptxCollect(c, out);
      }
    }
  }
  async function pptxToText(zip) {
    const rels = await readRels(zip, 'ppt/_rels/presentation.xml.rels', 'ppt/presentation.xml');
    let slidePaths = [];
    const presXml = await zip.text('ppt/presentation.xml');
    if (presXml) {
      const pres = parseXml(presXml);
      for (const s of descendants(pres.documentElement, 'sldId')) {
        const rid = attrLocal(s, 'id') && Array.from(s.attributes).find(a => a.localName === 'id' && a.prefix === 'r');
        const r = rid && rels[rid.value];
        if (r && zip.has(r.target)) slidePaths.push(r.target);
      }
    }
    if (!slidePaths.length) {
      slidePaths = zip.names().filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => +a.match(/(\d+)\.xml$/)[1] - +b.match(/(\d+)\.xml$/)[1]);
    }
    const out = [];
    for (let i = 0; i < slidePaths.length; i++) {
      const path = slidePaths[i];
      const doc = parseXml(await zip.text(path));
      const tree = descendants(doc.documentElement, 'spTree')[0];
      const lines = [];
      if (tree) pptxCollect(tree, lines);
      const sRels = await readRels(zip, path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'), path);
      const notesRel = Object.values(sRels).find(r => /\/notesSlide$/.test(r.type));
      if (notesRel && zip.has(notesRel.target)) {
        const nd = parseXml(await zip.text(notesRel.target));
        const nt = descendants(nd.documentElement, 'spTree')[0];
        const notes = [];
        if (nt) for (const sp of descendants(nt, 'sp')) {
          const kind = pptxShapeKind(sp);
          if (kind === 'sldImg' || kind === 'sldNum') continue;
          const tx = kid(sp, 'txBody'); if (tx) pptxParagraphs(tx).forEach(p => notes.push(p.text));
        }
        if (notes.length) lines.push('Notas do apresentador: ' + notes.join(' '));
      }
      out.push('--- Slide ' + (i + 1) + ' ---\n' + (lines.join('\n') || '(sem texto)'));
    }
    return out.join('\n\n');
  }

  /* ---------------- XLSX ---------------- */
  function colIndex(ref) {
    const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1;
    let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  function excelDate(serial) {
    const ms = Math.round((serial - 25569) * 86400000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return String(serial);
    const iso = d.toISOString();
    return serial % 1 === 0 ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ');
  }
  async function xlsxToText(zip) {
    const shared = [];
    const ssXml = await zip.text('xl/sharedStrings.xml');
    if (ssXml) {
      for (const si of kids(parseXml(ssXml).documentElement, 'si')) {
        let s = '';
        (function walk(n) { for (const c of n.children) { if (c.localName === 't') s += c.textContent; else if (c.localName === 'r') walk(c); } })(si);
        shared.push(s);
      }
    }
    // estilos de data
    const dateStyles = new Set();
    const stXml = await zip.text('xl/styles.xml');
    if (stXml) {
      const st = parseXml(stXml);
      const custom = {};
      for (const f of descendants(st.documentElement, 'numFmt')) custom[f.getAttribute('numFmtId')] = f.getAttribute('formatCode') || '';
      const xfsEl = descendants(st.documentElement, 'cellXfs')[0];
      if (xfsEl) kids(xfsEl, 'xf').forEach((xf, idx) => {
        const id = +(xf.getAttribute('numFmtId') || 0);
        const code = custom[id] || '';
        if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (code && /[dmy]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"/g, '')) && !/^[#0.,%]+$/.test(code))) dateStyles.add(idx);
      });
    }
    const wbRels = await readRels(zip, 'xl/_rels/workbook.xml.rels', 'xl/workbook.xml');
    const wb = parseXml(await zip.text('xl/workbook.xml'));
    const sheets = descendants(wb.documentElement, 'sheet').map(s => {
      const rid = Array.from(s.attributes).find(a => a.localName === 'id' && a.prefix === 'r');
      return { name: s.getAttribute('name'), path: rid && wbRels[rid.value] ? wbRels[rid.value].target : null };
    }).filter(s => s.path && zip.has(s.path));
    const out = [];
    for (const sh of sheets) {
      const doc = parseXml(await zip.text(sh.path));
      const rows = [];
      let rowCount = 0;
      for (const row of descendants(doc.documentElement, 'row')) {
        if (++rowCount > 1000) { rows.push('[... planilha truncada em 1000 linhas ...]'); break; }
        const cells = [];
        for (const c of kids(row, 'c')) {
          const idx = colIndex(c.getAttribute('r'));
          if (idx > 60) continue;
          const t = c.getAttribute('t');
          const vEl = kid(c, 'v');
          let v = vEl ? vEl.textContent : '';
          if (t === 's') v = shared[+v] || '';
          else if (t === 'inlineStr') v = descendants(c, 't').map(x => x.textContent).join('');
          else if (t === 'b') v = v === '1' ? 'VERDADEIRO' : 'FALSO';
          else if (!t && v && dateStyles.has(+(c.getAttribute('s') || -1))) v = excelDate(parseFloat(v));
          cells[idx >= 0 ? idx : cells.length] = String(v).replace(/\s+/g, ' ').trim();
        }
        while (cells.length && !cells[cells.length - 1]) cells.pop();
        if (cells.length) rows.push('| ' + Array.from(cells, x => x || '').join(' | ') + ' |');
      }
      out.push('--- Planilha: ' + sh.name + ' ---\n' + (rows.join('\n') || '(vazia)'));
    }
    return out.join('\n\n');
  }

  /* ---------------- ODF (ODT/ODP/ODS) ---------------- */
  function odfInline(node) {
    let s = '';
    for (const c of node.childNodes) {
      if (c.nodeType === 3) s += c.nodeValue;
      else if (c.nodeType === 1) {
        const ln = c.localName;
        if (ln === 's') s += ' '.repeat(Math.min(50, +(attrLocal(c, 'c') || 1)));
        else if (ln === 'tab') s += '\t';
        else if (ln === 'line-break') s += '\n';
        else if (ln === 'note' || ln === 'annotation') continue;
        else s += odfInline(c);
      }
    }
    return s;
  }
  function odfWalk(node, out, ctx) {
    for (const c of kids(node)) {
      const ln = c.localName;
      if (ln === 'h') { const t = odfInline(c).trim(); if (t) out.push('#'.repeat(Math.min(6, +(attrLocal(c, 'outline-level') || 1))) + ' ' + t); }
      else if (ln === 'p') { const t = odfInline(c).trim(); if (t) out.push((ctx.list ? '  '.repeat(ctx.list - 1) + '- ' : '') + t); }
      else if (ln === 'list') odfWalk(c, out, { ...ctx, list: (ctx.list || 0) + 1 });
      else if (ln === 'page') { out.push('--- Slide ' + (++ctx.page.n) + ' ---'); odfWalk(c, out, ctx); }
      else if (ln === 'table') {
        out.push('--- Tabela: ' + (attrLocal(c, 'name') || '') + ' ---');
        let rowsOut = 0;
        for (const row of descendants(c, 'table-row')) {
          if (++rowsOut > 1000) { out.push('[... truncado em 1000 linhas ...]'); break; }
          const cells = [];
          for (const cell of kids(row).filter(x => x.localName === 'table-cell' || x.localName === 'covered-table-cell')) {
            const rep = Math.min(60, +(attrLocal(cell, 'number-columns-repeated') || 1));
            const txt = kids(cell, 'p').map(odfInline).join(' ').replace(/\s+/g, ' ').trim();
            for (let k = 0; k < rep && cells.length < 60; k++) cells.push(txt);
          }
          while (cells.length && !cells[cells.length - 1]) cells.pop();
          if (cells.length) out.push('| ' + cells.join(' | ') + ' |');
        }
      }
      else odfWalk(c, out, ctx);
    }
  }
  async function odfToText(zip) {
    const xml = await zip.text('content.xml');
    if (!xml) throw new Error('Documento OpenDocument sem content.xml.');
    const doc = parseXml(xml);
    const body = descendants(doc.documentElement, 'body')[0] || doc.documentElement;
    const out = [];
    odfWalk(body, out, { list: 0, page: { n: 0 } });
    return out.join('\n');
  }

  /* ---------------- RTF ---------------- */
  let CP1252 = null;
  function cp1252(byte) {
    if (!CP1252) { const all = new Uint8Array(256); for (let i = 0; i < 256; i++) all[i] = i; CP1252 = new TextDecoder('windows-1252').decode(all); }
    return CP1252[byte] || '';
  }
  const RTF_SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'headerf',
    'footerl', 'footerr', 'footerf', 'ftnsep', 'ftnsepc', 'ftncn', 'annotation', 'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl',
    'generator', 'datastore', 'themedata', 'colorschememapping', 'latentstyles', 'mmathPr', 'pgdsctbl', 'fldinst', 'filetbl', 'revtbl', 'bkmkstart', 'bkmkend', 'nonshppict', 'shppict']);
  const RTF_CHARS = { par: '\n', line: '\n', sect: '\n\n', page: '\n\n', tab: '\t', cell: ' | ', row: '\n', emdash: '—', endash: '–',
    bullet: '•', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', emspace: ' ', enspace: ' ', qmspace: ' ' };
  function rtfToText(rtf) {
    let out = '', i = 0, skip = false, uc = 1, pending = 0;
    const stack = [];
    const n = rtf.length;
    while (i < n) {
      const ch = rtf[i];
      if (ch === '{') { stack.push({ skip, uc }); i++; continue; }
      if (ch === '}') { const s = stack.pop() || { skip: false, uc: 1 }; skip = s.skip; uc = s.uc; pending = 0; i++; continue; }
      if (ch === '\\') {
        const nx = rtf[i + 1];
        if (nx === '\\' || nx === '{' || nx === '}') { if (!skip) { if (pending > 0) pending--; else out += nx; } i += 2; continue; }
        if (nx === '*') { skip = true; i += 2; continue; }
        if (nx === "'") {
          if (!skip) { if (pending > 0) pending--; else out += cp1252(parseInt(rtf.substr(i + 2, 2), 16)); }
          i += 4; continue;
        }
        if (nx === '~') { if (!skip) out += '\u00A0'; i += 2; continue; }
        if (nx === '\n' || nx === '\r') { if (!skip) out += '\n'; i += 2; continue; }
        const m = /^([a-zA-Z]{1,32})(-?\d{1,10})? ?/.exec(rtf.slice(i + 1, i + 48));
        if (!m) { i += 2; continue; }
        i += 1 + m[0].length;
        const word = m[1]; const param = m[2] !== undefined ? parseInt(m[2], 10) : null;
        if (word === 'bin' && param > 0) { i += param; continue; }
        if (RTF_SKIP.has(word)) { skip = true; continue; }
        if (skip) continue;
        if (word === 'uc') { uc = param == null ? 1 : param; continue; }
        if (word === 'u' && param != null) { out += String.fromCharCode(param < 0 ? param + 65536 : param); pending = uc; continue; }
        if (RTF_CHARS[word]) { out += RTF_CHARS[word]; pending = 0; }
        continue;
      }
      if (ch === '\r' || ch === '\n') { i++; continue; }
      if (!skip) { if (pending > 0) pending--; else out += ch; }
      i++;
    }
    return out;
  }

  /* ---------------- HTML -> texto ---------------- */
  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,noscript,template,svg,canvas,iframe,head').forEach(e => e.remove());
    const BLOCK = /^(P|DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE|NAV|UL|OL|TABLE|TR|BLOCKQUOTE|PRE|FIGURE|FIGCAPTION|DL|DT|DD|FORM|FIELDSET|ADDRESS|HR)$/;
    let out = '';
    (function walk(n) {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { out += c.nodeValue.replace(/\s+/g, ' '); continue; }
        if (c.nodeType !== 1) continue;
        const tag = c.tagName;
        if (/^H[1-6]$/.test(tag)) { out += '\n\n' + '#'.repeat(+tag[1]) + ' '; walk(c); out += '\n'; }
        else if (tag === 'LI') { out += '\n- '; walk(c); }
        else if (tag === 'BR') out += '\n';
        else if (tag === 'TD' || tag === 'TH') { out += ' | '; walk(c); }
        else if (tag === 'IMG' && c.getAttribute('alt')) out += ' [imagem: ' + c.getAttribute('alt') + '] ';
        else if (BLOCK.test(tag)) { out += '\n'; walk(c); out += '\n'; }
        else walk(c);
      }
    })(doc.body || doc.documentElement);
    return out.split('\n').map(l => l.trim()).join('\n');
  }

  /* ---------------- PDF (pdf.js) ---------------- */
  let pdfjsPromise = null;
  function loadPdfJs() {
    if (!pdfjsPromise) {
      pdfjsPromise = (async () => {
        try {
          const m = await import(PDFJS_LOCAL);
          m.GlobalWorkerOptions.workerSrc = PDFJS_LOCAL_WORKER;
          return m;
        } catch (e) {
          const m = await import(PDFJS_CDN);
          m.GlobalWorkerOptions.workerSrc = PDFJS_CDN_WORKER;
          return m;
        }
      })().catch(e => { pdfjsPromise = null; throw new Error('Não foi possível carregar o leitor de PDF: ' + e.message); });
    }
    return pdfjsPromise;
  }
  async function openPdf(arrayBuffer, forRender) {
    const pdfjs = await loadPdfJs();
    const task = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), isEvalSupported: false, disableFontFace: !forRender, useSystemFonts: true });
    try { return await task.promise; }
    catch (e) {
      if (e && e.name === 'PasswordException') throw new Error('O PDF está protegido por senha.');
      throw new Error('PDF inválido ou corrompido (' + (e && e.message || e) + ').');
    }
  }
  async function pdfToText(arrayBuffer, onProgress) {
    const pdf = await openPdf(arrayBuffer, false);
    const out = [];
    let chars = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      let s = '', lastY = null;
      for (const it of tc.items) {
        if (typeof it.str !== 'string') continue;
        const y = it.transform ? it.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !s.endsWith('\n')) s += '\n';
        s += it.str;
        if (it.hasEOL) s += '\n';
        lastY = y;
      }
      s = s.replace(/[ \t]+/g, ' ').replace(/\n /g, '\n').trim();
      out.push('--- Página ' + i + ' ---\n' + (s || '(sem texto)'));
      chars += s.length;
      page.cleanup();
      if (onProgress) onProgress(i, pdf.numPages);
      if (chars > MAX_CHARS * 1.2) { out.push('[... leitura interrompida: limite de texto atingido na página ' + i + ' de ' + pdf.numPages + ' ...]'); break; }
    }
    const pages = pdf.numPages;
    await pdf.destroy();
    return { text: out.join('\n\n'), pages, chars };
  }
  async function pdfToImages(file, opts) {
    opts = opts || {};
    const maxPages = opts.maxPages || 60;
    const targetW = opts.width || 1600;
    const pdf = await openPdf(await file.arrayBuffer(), true);
    const images = [];
    const total = Math.min(pdf.numPages, maxPages);
    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(4, targetW / base.width);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
      images.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.86), width: canvas.width, height: canvas.height });
      page.cleanup();
      canvas.width = canvas.height = 0;
      if (opts.onProgress) opts.onProgress(i, total);
    }
    const pages = pdf.numPages;
    await pdf.destroy();
    return { images, pages, truncated: pages > total };
  }

  /* ---------------- Imagens ---------------- */
  function readAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('Falha ao ler o arquivo'));
      r.readAsDataURL(blob);
    });
  }
  async function imageToDataUrl(file, maxSide) {
    maxSide = maxSide || 1920;
    const ext = extOf(file.name);
    if (ext === 'svg' || file.type === 'image/svg+xml') {
      if (file.size > 2 * 1024 * 1024) throw new Error('SVG acima de 2 MB.');
      const url = await readAsDataUrl(new Blob([await file.arrayBuffer()], { type: 'image/svg+xml' }));
      return { dataUrl: url, width: 0, height: 0 };
    }
    if ((ext === 'gif' || file.type === 'image/gif') && file.size <= 3 * 1024 * 1024) {
      const bmp = await createImageBitmap(file).catch(() => null);
      return { dataUrl: await readAsDataUrl(file), width: bmp ? bmp.width : 0, height: bmp ? bmp.height : 0 };
    }
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch (e) { throw new Error('Não foi possível abrir a imagem "' + file.name + '".'); }
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= 600 * 1024 && /^(png|jpe?g|webp)$/.test(ext)) {
      const r = { dataUrl: await readAsDataUrl(file), width: bmp.width, height: bmp.height };
      bmp.close(); return r;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    let dataUrl = canvas.toDataURL('image/webp', 0.86);
    if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL(ext === 'png' ? 'image/png' : 'image/jpeg', 0.86);
    return { dataUrl, width: canvas.width, height: canvas.height };
  }

  /* ---------------- Documento -> texto (despachante) ---------------- */
  async function extractText(file, onProgress) {
    const ext = extOf(file.name);
    const kind = classify(file);
    if (kind === 'legacy') throw new Error('Formato antigo (.' + ext + '). Salve como ' + ({ doc: '.docx', ppt: '.pptx', pps: '.pptx', xls: '.xlsx' }[ext] || 'PDF') + ' ou PDF e importe novamente.');
    if (kind === 'image') throw new Error('Imagens não têm texto para a IA. Use Uploads para inserir a imagem nos slides.');
    if (kind === 'unsupported') throw new Error('Formato não suportado: .' + (ext || '?'));
    if (file.size > 80 * 1024 * 1024) throw new Error('Arquivo acima de 80 MB.');
    let text = '', info = '';
    const buf = await file.arrayBuffer();
    if (ext === 'pdf') {
      const r = await pdfToText(buf, onProgress);
      text = r.text; info = r.pages + (r.pages === 1 ? ' página' : ' páginas');
      if (r.chars < 20) throw new Error('Este PDF não tem texto selecionável (parece escaneado). Use "Importar páginas como slides" ou um PDF com texto.');
    } else if (/^(docx|docm)$/.test(ext)) {
      text = await docxToText(await openZip(buf)); info = 'Word';
    } else if (/^(pptx|pptm)$/.test(ext)) {
      text = await pptxToText(await openZip(buf)); info = 'PowerPoint · ' + (text.match(/^--- Slide /gm) || []).length + ' slides';
    } else if (/^(xlsx|xlsm)$/.test(ext)) {
      text = await xlsxToText(await openZip(buf)); info = 'Excel · ' + (text.match(/^--- Planilha/gm) || []).length + ' planilha(s)';
    } else if (/^(odt|odp|ods)$/.test(ext)) {
      text = await odfToText(await openZip(buf)); info = 'OpenDocument';
    } else if (ext === 'rtf') {
      text = rtfToText(decodeText(buf)); info = 'RTF';
    } else if (ext === 'html' || ext === 'htm') {
      text = htmlToText(decodeText(buf)); info = 'HTML';
    } else {
      text = decodeText(buf); info = ext.toUpperCase() || 'Texto';
    }
    text = tidy(text);
    if (!text) throw new Error('Não encontrei texto em "' + file.name + '".');
    const t = truncate(text);
    return { name: file.name, content: t.text, chars: text.length, truncated: t.truncated, info };
  }

  function isPresentationHtml(text) {
    return /<section\b[^>]*class\s*=\s*["'][^"']*\bslide\b/i.test(text) || /id\s*=\s*["']deck["']/i.test(text);
  }

  global.SSWImport = {
    classify, extractText, pdfToImages, imageToDataUrl, isPresentationHtml, decodeText, extOf, loadPdfJs,
    ACCEPT_DOCS, ACCEPT_IMAGES, MAX_CHARS,
    _internals: { openZip, docxToText, pptxToText, xlsxToText, odfToText, rtfToText, htmlToText }
  };
})(window);
