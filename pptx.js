/* ============================================================
   Slide Studio WEG — exportação para PowerPoint (.pptx), sem dependências
   - Cada slide: imagem de fundo (render do slide sem os textos) + caixas de texto editáveis por cima
   - EXTRACT_JS roda dentro da página (Edge headless): mede os textos e os esconde para a captura
   - buildPptx monta o pacote Office Open XML (ZIP com deflate)
============================================================ */
'use strict';

const zlib = require('zlib');

const W = 1280, H = 720;
const EMU = 9525;            // 1 px (slide 1280 px = 13,333 pol) em EMU
const PT = 0.75;             // 1 px = 0,75 pt

/* ---------------- ZIP ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    // imagens já são comprimidas: guardadas sem compressão
    const store = /\.(png|jpe?g)$/i.test(f.name);
    const body = store ? data : zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(store ? 0 : 8, 8); local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, name, body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(store ? 0 : 8, 10); cen.writeUInt16LE(dosTime, 12); cen.writeUInt16LE(dosDate, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += 30 + name.length + body.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cenBuf, end]);
}

/* ---------------- XML ---------------- */
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
function x(s) {
  return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const emu = px => Math.round(px * EMU);
const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

function rels(list) {
  return HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    list.map(r => '<Relationship Id="' + r.id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + r.type + '" Target="' + x(r.target) + '"/>').join('') + '</Relationships>';
}

function runProps(r, lang) {
  let a = ' lang="' + lang + '" sz="' + Math.max(100, Math.min(400000, Math.round(r.size * PT * 100))) + '"';
  a += ' b="' + (r.bold ? 1 : 0) + '" i="' + (r.italic ? 1 : 0) + '"';
  if (r.underline) a += ' u="sng"';
  if (r.strike) a += ' strike="sngStrike"';
  if (r.caps) a += ' cap="all"';
  if (r.spacing) a += ' spc="' + Math.round(r.spacing * PT * 100) + '"';
  a += ' dirty="0"';
  const alpha = r.alpha != null && r.alpha < 0.999 ? '<a:alpha val="' + Math.round(r.alpha * 100000) + '"/>' : '';
  const font = r.font ? '<a:latin typeface="' + x(r.font) + '"/><a:cs typeface="' + x(r.font) + '"/>' : '';
  return a + '><a:solidFill><a:srgbClr val="' + (r.color || '000000') + '">' + alpha + '</a:srgbClr></a:solidFill>' + font;
}

function textShape(t, id, lang) {
  const algn = { left: 'l', start: 'l', center: 'ctr', right: 'r', end: 'r', justify: 'just' }[t.align] || 'l';
  const first = t.runs.find(r => r.text) || t.runs[0] || { size: 16 };
  const lnSpc = t.lineHeight ? '<a:lnSpc><a:spcPts val="' + Math.round(t.lineHeight * PT * 100) + '"/></a:lnSpc>' : '';
  let body = '';
  for (const r of t.runs) {
    if (r.br) body += '<a:br><a:rPr' + runProps(first, lang) + '</a:rPr></a:br>';
    else if (r.text) body += '<a:r><a:rPr' + runProps(r, lang) + '</a:rPr><a:t>' + x(r.text) + '</a:t></a:r>';
  }
  return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Texto ' + (id - 1) + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
    '<p:spPr><a:xfrm><a:off x="' + emu(t.x) + '" y="' + emu(t.y) + '"/><a:ext cx="' + emu(Math.max(4, t.w)) + '" cy="' + emu(Math.max(4, t.h)) + '"/></a:xfrm>' +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
    '<p:txBody><a:bodyPr wrap="' + (t.wrap ? 'square' : 'none') + '" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>' +
    '<a:p><a:pPr algn="' + algn + '">' + lnSpc + '</a:pPr>' + body + '<a:endParaRPr' + runProps(first, lang) + '</a:endParaRPr></a:p></p:txBody></p:sp>';
}

function slideXml(s, lang) {
  let id = 2;
  const shapes = (s.texts || []).map(t => textShape(t, id++, lang)).join('');
  return HEAD + '<p:sld ' + NS + '><p:cSld>' +
    '<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="rId2"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>' +
    '<p:spTree>' + GRP + shapes + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
}
function notesXml(text, n) {
  const paras = String(text || '').split(/\r?\n/).map(l => '<a:p><a:r><a:rPr lang="pt-BR" dirty="0"/><a:t>' + x(l) + '</a:t></a:r></a:p>').join('') || '<a:p/>';
  return HEAD + '<p:notes ' + NS + '><p:cSld><p:spTree>' + GRP +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Imagem do slide ' + n + '"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>' +
    '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Anotações ' + n + '"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>' + paras + '</p:txBody></p:sp>' +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>';
}

const THEME = HEAD + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="WEG"><a:themeElements>' +
  '<a:clrScheme name="WEG"><a:dk1><a:srgbClr val="0F172A"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="0A2D6D"/></a:dk2><a:lt2><a:srgbClr val="F1F5F9"/></a:lt2>' +
  '<a:accent1><a:srgbClr val="00579D"/></a:accent1><a:accent2><a:srgbClr val="FCA304"/></a:accent2><a:accent3><a:srgbClr val="28B9DA"/></a:accent3><a:accent4><a:srgbClr val="9F7BBA"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="16A34A"/></a:accent5><a:accent6><a:srgbClr val="DC2626"/></a:accent6><a:hlink><a:srgbClr val="00579D"/></a:hlink><a:folHlink><a:srgbClr val="0A2D6D"/></a:folHlink></a:clrScheme>' +
  '<a:fontScheme name="WEG"><a:majorFont><a:latin typeface="Inter"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Inter"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
  '<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
  '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
  '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
  '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>' +
  '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';

const MASTER = HEAD + '<p:sldMaster ' + NS + '><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>' + GRP + '</p:spTree></p:cSld>' +
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>';
const LAYOUT = HEAD + '<p:sldLayout ' + NS + ' type="blank" preserve="1"><p:cSld name="Em branco"><p:spTree>' + GRP + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
const NOTES_MASTER = HEAD + '<p:notesMaster ' + NS + '><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>' + GRP + '</p:spTree></p:cSld>' +
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:notesMaster>';

/**
 * slides: [{ image: Buffer(PNG), texts: [{x,y,w,h,align,lineHeight,wrap,runs:[{text|br,size,bold,italic,underline,strike,caps,spacing,color,alpha,font}]}], notes }]
 */
function buildPptx({ slides, title, lang }) {
  lang = lang || 'pt-BR';
  const n = slides.length;
  const hasNotes = slides.some(s => s.notes && s.notes.trim());
  const files = [];
  const ct = ['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>', '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="png" ContentType="image/png"/>', '<Default Extension="jpeg" ContentType="image/jpeg"/>',
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
    '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>',
    '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>',
    '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'];
  if (hasNotes) ct.push('<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>',
    '<Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>');

  const presRels = [{ id: 'rId1', type: 'slideMaster', target: 'slideMasters/slideMaster1.xml' }, { id: 'rId2', type: 'theme', target: 'theme/theme1.xml' },
    { id: 'rId3', type: 'presProps', target: 'presProps.xml' }, { id: 'rId4', type: 'viewProps', target: 'viewProps.xml' }, { id: 'rId5', type: 'tableStyles', target: 'tableStyles.xml' }];
  if (hasNotes) presRels.push({ id: 'rId6', type: 'notesMaster', target: 'notesMasters/notesMaster1.xml' });
  const sldIds = [];
  slides.forEach((s, i) => {
    const k = i + 1, rid = 'rId' + (10 + k);
    presRels.push({ id: rid, type: 'slide', target: 'slides/slide' + k + '.xml' });
    sldIds.push('<p:sldId id="' + (255 + k) + '" r:id="' + rid + '"/>');
    ct.push('<Override PartName="/ppt/slides/slide' + k + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>');
    files.push({ name: 'ppt/slides/slide' + k + '.xml', data: slideXml(s, lang) });
    files.push({ name: 'ppt/media/slide' + k + '.png', data: s.image });
    const sr = [{ id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }, { id: 'rId2', type: 'image', target: '../media/slide' + k + '.png' }];
    if (s.notes && s.notes.trim()) {
      sr.push({ id: 'rId3', type: 'notesSlide', target: '../notesSlides/notesSlide' + k + '.xml' });
      ct.push('<Override PartName="/ppt/notesSlides/notesSlide' + k + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>');
      files.push({ name: 'ppt/notesSlides/notesSlide' + k + '.xml', data: notesXml(s.notes, k) });
      files.push({ name: 'ppt/notesSlides/_rels/notesSlide' + k + '.xml.rels', data: rels([{ id: 'rId1', type: 'notesMaster', target: '../notesMasters/notesMaster1.xml' }, { id: 'rId2', type: 'slide', target: '../slides/slide' + k + '.xml' }]) });
    }
    files.push({ name: 'ppt/slides/_rels/slide' + k + '.xml.rels', data: rels(sr) });
  });

  const presentation = HEAD + '<p:presentation ' + NS + ' saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    (hasNotes ? '<p:notesMasterIdLst><p:notesMasterId r:id="rId6"/></p:notesMasterIdLst>' : '') +
    '<p:sldIdLst>' + sldIds.join('') + '</p:sldIdLst><p:sldSz cx="' + emu(W) + '" cy="' + emu(H) + '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
  const iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  files.unshift(
    { name: '[Content_Types].xml', data: HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' + ct.join('') + '</Types>' },
    { name: '_rels/.rels', data: rels([{ id: 'rId1', type: 'officeDocument', target: 'ppt/presentation.xml' }]).replace('</Relationships>',
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>') },
    { name: 'docProps/core.xml', data: HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + x(title || 'Apresentação') + '</dc:title><dc:creator>Slide Studio WEG</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:modified></cp:coreProperties>' },
    { name: 'docProps/app.xml', data: HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Slide Studio WEG</Application><Slides>' + n + '</Slides><PresentationFormat>Widescreen</PresentationFormat></Properties>' },
    { name: 'ppt/presentation.xml', data: presentation },
    { name: 'ppt/_rels/presentation.xml.rels', data: rels(presRels) },
    { name: 'ppt/presProps.xml', data: HEAD + '<p:presentationPr ' + NS + '/>' },
    { name: 'ppt/viewProps.xml', data: HEAD + '<p:viewPr ' + NS + '><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>' },
    { name: 'ppt/tableStyles.xml', data: HEAD + '<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>' },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: MASTER },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([{ id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }, { id: 'rId2', type: 'theme', target: '../theme/theme1.xml' }]) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: LAYOUT },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([{ id: 'rId1', type: 'slideMaster', target: '../slideMasters/slideMaster1.xml' }]) },
    { name: 'ppt/theme/theme1.xml', data: THEME }
  );
  if (hasNotes) files.push(
    { name: 'ppt/notesMasters/notesMaster1.xml', data: NOTES_MASTER },
    { name: 'ppt/notesMasters/_rels/notesMaster1.xml.rels', data: rels([{ id: 'rId1', type: 'theme', target: '../theme/theme2.xml' }]) },
    { name: 'ppt/theme/theme2.xml', data: THEME });
  return zip(files);
}

/* ---------------- extração dos textos (roda na página) ----------------
   Retorna { slides: [{ top, texts }] } e deixa os textos medidos invisíveis para a captura do fundo. */
const EXTRACT_JS = `(function () {
  var W = ${W}, H = ${H};
  var INLINE = /^(SPAN|B|STRONG|EM|I|U|S|SMALL|SUP|SUB|MARK|A|CODE|ABBR|TIME|Q|LABEL|BR|FONT|DEL|INS)$/;
  function cs(el) { return getComputedStyle(el); }
  function isSvg(el) { return el.namespaceURI === 'http://www.w3.org/2000/svg'; }
  function isIcon(el) { return isSvg(el) || el.hasAttribute('data-lucide'); }
  function directText(el) { for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && c.nodeValue.trim()) return true; return false; }
  function inline(el) { return !isIcon(el) && INLINE.test(el.tagName) && cs(el).display === 'inline'; }
  function textBlock(el) {
    if (isSvg(el) || /^(IMG|VIDEO|CANVAS|IFRAME|INPUT|SELECT|TEXTAREA|SCRIPT|STYLE)$/.test(el.tagName)) return false;
    if (!el.textContent.trim()) return false;
    if (directText(el)) {
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (!isIcon(c) && c.tagName !== 'BR' && !inline(c)) return false;
      return true;
    }
    for (var d = el.firstElementChild; d; d = d.nextElementSibling) { if (isIcon(d) || d.tagName === 'BR') continue; if (!inline(d)) return false; }
    return true;
  }
  function hex(c) {
    var m = /rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s/]+([\\d.]+%?))?/.exec(c || '');
    if (!m) return null;
    var a = m[4] === undefined ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return { hex: [m[1], m[2], m[3]].map(function (v) { return Math.round(+v).toString(16).padStart(2, '0'); }).join('').toUpperCase(), a: a };
  }
  function blocked(el, slide) {
    // rotação/inclinação ou texto com degradê ficam na imagem de fundo
    for (var n = el; n && n !== slide.parentElement; n = n.parentElement) {
      var s = cs(n);
      if (s.rotate && s.rotate !== 'none' && parseFloat(s.rotate)) return true;
      if (s.transform && s.transform !== 'none') { var m = /matrix\\(([^)]+)\\)/.exec(s.transform); if (!m) return true; var v = m[1].split(',').map(parseFloat); if (Math.abs(v[1]) > 1e-3 || Math.abs(v[2]) > 1e-3 || Math.abs(v[0] - 1) > 1e-3 || Math.abs(v[3] - 1) > 1e-3) return true; }
      if (s.visibility === 'hidden' || s.display === 'none') return true;
    }
    var st = cs(el);
    if ((st.webkitBackgroundClip || st.backgroundClip) === 'text') return true;
    if (st.webkitTextFillColor && hex(st.webkitTextFillColor) && hex(st.webkitTextFillColor).a === 0) return true;
    return false;
  }
  function opacityOf(el, slide) { var o = 1; for (var n = el; n && n !== slide.parentElement; n = n.parentElement) o *= parseFloat(cs(n).opacity); return o; }
  function fontName(f) { return (f || '').split(',')[0].replace(/["']/g, '').trim(); }
  function runsOf(el, op) {
    var out = [];
    var bullet = cs(el).display === 'list-item' && cs(el).listStyleType !== 'none';
    (function walk(node) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          var p = c.parentElement, s = cs(p);
          if (!c.nodeValue) continue;
          var col = hex(s.color) || { hex: '000000', a: 1 };
          var fs = parseFloat(s.fontSize) || 16;
          out.push({ text: c.nodeValue.replace(/[\\s\\u00a0]+/g, ' '), size: fs, bold: parseInt(s.fontWeight, 10) >= 600, italic: s.fontStyle === 'italic',
            underline: /underline/.test(s.textDecorationLine), strike: /line-through/.test(s.textDecorationLine), caps: s.textTransform === 'uppercase',
            spacing: s.letterSpacing === 'normal' ? 0 : parseFloat(s.letterSpacing) || 0, color: col.hex, alpha: col.a * op, font: fontName(s.fontFamily) });
        } else if (c.nodeType === 1) {
          if (c.tagName === 'BR') out.push({ br: true });
          else if (!isIcon(c)) walk(c);
        }
      }
    })(el);
    // espaços: colapsa como no navegador (início, fim, após quebra e duplicados)
    var prevSpace = true;
    out.forEach(function (r) {
      if (r.br) { prevSpace = true; return; }
      if (prevSpace) r.text = r.text.replace(/^ /, '');
      prevSpace = / $/.test(r.text);
    });
    for (var i = out.length - 1; i >= 0; i--) { if (out[i].br) continue; out[i].text = out[i].text.replace(/ $/, ''); if (out[i].text) break; }
    out = out.filter(function (r) { return r.br || r.text; });
    if (bullet && out.length && !out[0].br) out[0].text = '• ' + out[0].text;
    return out;
  }
  function hide(el) {
    var all = [el].concat(Array.prototype.slice.call(el.querySelectorAll('*')));
    all.forEach(function (n) {
      if (isSvg(n) && n.tagName.toLowerCase() !== 'svg') return;
      if (isIcon(n)) { n.style.setProperty('color', cs(n).color, 'important'); return; }
      if (n.closest('svg')) return;
      n.style.setProperty('color', 'transparent', 'important');
      n.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
      n.style.setProperty('text-shadow', 'none', 'important');
      n.style.setProperty('text-decoration-color', 'transparent', 'important');
    });
  }
  var slides = Array.prototype.slice.call(document.querySelectorAll('[data-ssw-slide]'));
  var result = [], toHide = [];
  slides.forEach(function (slide) {
    var sr = slide.getBoundingClientRect();
    var texts = [];
    (function visit(el) {
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
        if (isSvg(c) || c.hasAttribute('data-ssw-ctrl') || (c.tagName === 'ASIDE' && c.classList.contains('notes'))) continue;
        if (textBlock(c)) {
          if (blocked(c, slide)) continue;
          var range = document.createRange(); range.selectNodeContents(c);
          var r = range.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) continue;
          var x0 = r.left - sr.left, y0 = r.top - sr.top;
          if (x0 > W || y0 > H || x0 + r.width < 0 || y0 + r.height < 0) continue;
          var s = cs(c), op = opacityOf(c, slide);
          if (op < 0.05) continue;
          var runs = runsOf(c, op);
          if (!runs.some(function (q) { return q.text; })) continue;
          var fs = parseFloat(s.fontSize) || 16;
          var lh = s.lineHeight === 'normal' ? fs * 1.2 : parseFloat(s.lineHeight);
          var lines = Math.round(r.height / lh);
          // folga para diferenças de métrica entre o navegador e o PowerPoint
          var al = s.textAlign, x = x0, w;
          if (lines > 1) {
            // várias linhas: a caixa tem a largura de conteúdo do bloco, onde o navegador quebrou as linhas
            var er = c.getBoundingClientRect();
            var pl = parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth), pr = parseFloat(s.paddingRight) + parseFloat(s.borderRightWidth);
            x = er.left - sr.left + pl; w = Math.max(r.width, er.width - pl - pr);
          } else {
            var slack = Math.max(6, r.width * 0.06);
            w = r.width + slack;
            if (al === 'center') x = x0 - slack / 2; else if (al === 'right' || al === 'end') x = x0 - slack;
          }
          texts.push({ x: x, y: y0, w: w, h: r.height, align: al, lineHeight: lh, wrap: lines > 1, runs: runs });
          toHide.push(c);
        } else visit(c);
      }
    })(slide);
    var nEl = slide.querySelector('aside.notes');
    result.push({ top: sr.top + window.scrollY, left: sr.left + window.scrollX, texts: texts, notes: slide.getAttribute('data-notes') || (nEl ? nEl.textContent.trim() : '') });
  });
  toHide.forEach(hide);
  return { slides: result };
})()`;

module.exports = { buildPptx, EXTRACT_JS, zip, W, H };
