/* ============================================================
   Slide Studio WEG — paleta (escala 50–900), presets e logo
============================================================ */
(function (global) {
  'use strict';

  function hexToHsl(hex) {
    hex = String(hex || '#000000').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substr(0, 2), 16) / 255, g = parseInt(hex.substr(2, 2), 16) / 255, b = parseInt(hex.substr(4, 2), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to = x => Math.round(255 * x).toString(16).padStart(2, '0').toUpperCase();
    return '#' + to(f(0)) + to(f(8)) + to(f(4));
  }

  const STOPS = { 50: [96, 0.5], 100: [93, 0.62], 200: [85, 0.78], 300: [74, 0.9], 400: [62, 1], 500: [52, 1], 600: [44, 1], 800: [30, 1], 900: [24, 1] };

  function genScale(hex) {
    const { h, s } = hexToHsl(hex);
    const scale = { 700: String(hex).toUpperCase() };
    for (const stop of Object.keys(STOPS)) {
      const [L, sf] = STOPS[stop];
      scale[stop] = hslToHex(h, Math.min(100, Math.max(6, s * sf)), L);
    }
    const ordered = {};
    ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'].forEach(k => { ordered[k] = scale[k]; });
    return ordered;
  }

  const WEG_SEMANTIC = {
    positive: { 50: '#EFFEF5', 100: '#D9FFE9', 200: '#7DF8B2', 300: '#7DF8B2', 400: '#3DEB89', 500: '#13CE66', 600: '#09B054', 700: '#0B8A45', 800: '#0F6C39', 900: '#0E5932' },
    negative: { 50: '#FFF1F1', 100: '#FFDFDF', 200: '#FFC5C5', 300: '#FF9D9D', 400: '#FF6464', 500: '#FF4949', 600: '#ED1515', 700: '#C80D0D', 800: '#A50F0F', 900: '#881414' },
    warning: { 50: '#FFFFE7', 100: '#FEFFC1', 200: '#FFFD86', 300: '#FFF441', 400: '#FFE50D', 500: '#FFD600', 600: '#D19D00', 700: '#A67102', 800: '#89570A', 900: '#74470F' },
    info: { 50: '#EBFDFF', 100: '#CDF6FF', 200: '#8AE8FF', 300: '#62DDFE', 400: '#1BC4F5', 500: '#00A7DB', 600: '#0284B8', 700: '#0A6A94', 800: '#125778', 900: '#134766' },
    neutral: { 50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0', 300: '#CBD5E1', 400: '#94A3B8', 500: '#64748B', 600: '#475569', 700: '#334155', 800: '#1E293B', 900: '#0F172A' }
  };

  function colorsObject(c) {
    return {
      primary: genScale(c.primary), secondary: genScale(c.secondary), tertiary: genScale(c.tertiary),
      positive: WEG_SEMANTIC.positive, negative: WEG_SEMANTIC.negative,
      warning: WEG_SEMANTIC.warning, info: WEG_SEMANTIC.info, neutral: WEG_SEMANTIC.neutral
    };
  }

  const PRESETS = {
    weg: { label: 'WEG Padrão', primary: '#00579D', secondary: '#FCA304', tertiary: '#9F7BBA' },
    energia: { label: 'Âmbar Energia', primary: '#B95404', secondary: '#00579D', tertiary: '#64748B' },
    sustent: { label: 'Verde', primary: '#0B8A45', secondary: '#FCA304', tertiary: '#00579D' },
    grafite: { label: 'Grafite', primary: '#334155', secondary: '#0A92ED', tertiary: '#8862A2' },
    oceano: { label: 'Oceano', primary: '#0A6A94', secondary: '#13CE66', tertiary: '#FCA304' },
    vinho: { label: 'Vinho', primary: '#881414', secondary: '#FCA304', tertiary: '#334155' }
  };

  const FONTS = ['Inter', 'Roboto', 'Montserrat', 'Open Sans', 'Poppins', 'IBM Plex Sans', 'Lato', 'Nunito', 'Raleway',
    'Work Sans', 'DM Sans', 'Source Sans 3', 'Barlow', 'Oswald', 'Bebas Neue', 'Playfair Display', 'Merriweather', 'Lora', 'Roboto Slab', 'Fira Code'];

  function fontUrl(font) {
    return 'https://fonts.googleapis.com/css2?family=' + String(font).trim().replace(/ /g, '+') + ':wght@300;400;500;600;700;800&display=swap';
  }

  const WEG_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5991 4192"><g fill="#0064A6"><polygon points="461,466 461,2795 922,2795 922,932 1383,932 1383,2795 1844,2795 1844,932 2304,932 2304,3261 0,3261 0,0 5991,0 5991,466 "/><path d="M4148 2329l0 -1397 -1383 0 0 2329 1383 0 0 -466 -922 0 0 -466 922 0zm-461 -466l-461 0 0 -466 461 0 0 466z"/><path d="M5991 932l-1382 0 0 2329 922 0 0 466 -5531 0 0 465 5991 0 0 -3260zm-461 1863l-461 0 0 -1398 461 0 0 1398z"/></g></svg>';

  global.SSWPalette = { hexToHsl, hslToHex, genScale, colorsObject, WEG_SEMANTIC, PRESETS, FONTS, fontUrl, WEG_LOGO_SVG };
})(typeof window !== 'undefined' ? window : globalThis);
