'use strict';
/* ==========================================================================
   Clipwerk Studio – Kern: Hilfsfunktionen, Datenmodell, Verlauf, Speicher
   ========================================================================== */
const APP_VERSION = '1.3.0';
/* Desktop-Version: KI-Bibliotheken liegen lokal im Programm (kein Code aus dem Netz). Browser-Version: offizielle CDNs. */
const LOCAL_LIBS = !!(window.native && window.native.desktop && location.protocol === 'app:');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = (p = 'c') => p + '_' + Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const Ease = {
  linear: t => t,
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  bounce: t => { const n1 = 7.5625, d1 = 2.75; if (t < 1 / d1) return n1 * t * t; if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + .75; if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + .9375; return n1 * (t -= 2.625 / d1) * t + .984375; },
};
function seeded(n) { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const pad2 = n => String(n).padStart(2, '0');
function fmtTC(t, fps = 30) { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.min(fps - 1, Math.floor((t - Math.floor(t)) * fps + 1e-6)); return `${pad2(m)}:${pad2(s)}:${pad2(f)}`; }
function fmtSec(t) { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = t - m * 60; return m ? `${m}:${s.toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)} s`; }
function hexToRgb(h) { h = (h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function download(blob, name) {
  if (window.native) { blob.arrayBuffer().then(b => window.native.saveAs(name, b)).then(p => { if (p) toast(`Gespeichert: ${p}`, 'ok'); }).catch(e => toast('Speichern fehlgeschlagen: ' + e.message, 'error')); return; }
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function safeName(s) { return (s || 'video').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'video'; }

/* ---------- Icons (eigene, schlichte Strichzeichnungen) ---------- */
const ICONS = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  toStart: '<path d="M6 5v14"/><path d="M19 5L9 12l10 7z"/>',
  toEnd: '<path d="M18 5v14"/><path d="M5 5l10 7-10 7z"/>',
  stepBack: '<path d="M15 6l-6 6 6 6"/>', stepFwd: '<path d="M9 6l6 6-6 6"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  wand: '<path d="M5 19L14.5 9.5"/><path d="M13 8l3 3"/><path d="M18 3v3M16.5 4.5h3M20 10v2M19 11h2M9 3v2M8 4h2"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  cc: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6M17.5 10.2a2.2 2.2 0 1 0 0 3.6"/>',
  layout: '<rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  magnet: '<path d="M6 3v9a6 6 0 0 0 12 0V3h-4v9a2 2 0 0 1-4 0V3z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><path d="M3 3l18 18"/>',
  vol: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
  volX: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  save: '<path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12l5 5 9-10"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  loop: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  diamond: '<path d="M12 3l9 9-9 9-9-9z"/>',
  flipH: '<path d="M12 3v18"/><path d="M8 7L3 12l5 5z"/><path d="M16 7l5 5-5 5z"/>',
  flipV: '<path d="M3 12h18"/><path d="M7 8l5-5 5 5z"/><path d="M7 16l5 5 5-5z"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 4v5h-5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  wave: '<path d="M3 12h1M7 8v8M11 5v14M15 9v6M19 7v10M22 12h-1"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11h6M11 8v6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11h6"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>',
  split: '<path d="M12 3v18"/><path d="M5 8h4v8H5zM15 8h4v8h-4z"/>',
  menu: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  rec: '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
};
function icon(name, cls = '') { return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`; }
function iconEl(name, cls) { const s = document.createElement('span'); s.className = 'icw'; s.innerHTML = icon(name, cls); return s.firstChild; }

/* ---------- Toasts & Dialoge ---------- */
function toast(msg, kind = 'info', ms = 4200) {
  const box = $('#toasts'); if (!box) return console.log(msg);
  const t = el('div', { class: 'toast ' + kind, role: 'status' }, msg);
  box.append(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
}
function modal({ title, body, actions = [], wide = false, onClose }) {
  const root = $('#modalRoot');
  const bodyEl = typeof body === 'string' ? el('div', { html: body }) : body;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const btns = actions.map(a => el('button', { class: 'btn ' + (a.kind || 'ghost'), onclick: async () => { if (a.onClick) { const r = await a.onClick(close); if (r === false) return; } if (!a.keepOpen) close(); } }, a.label));
  const box = el('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
    el('div', { class: 'modal-head' }, el('h2', {}, title), el('button', { class: 'ib', title: 'Schließen', html: icon('close'), onclick: close })),
    el('div', { class: 'modal-body' }, bodyEl),
    btns.length ? el('div', { class: 'modal-foot' }, btns) : null);
  const wrap = el('div', { class: 'modal-wrap', onmousedown: (e) => { if (e.target === wrap) close(); } }, box);
  root.append(wrap); document.addEventListener('keydown', onKey);
  return { close, box, body: bodyEl };
}
function confirmBox(title, text, okLabel = 'OK', kind = 'primary') {
  return new Promise(res => {
    let done = false;
    modal({ title, body: el('p', { class: 'muted' }, text), onClose: () => { if (!done) res(false); },
      actions: [{ label: 'Abbrechen', onClick: () => { done = true; res(false); } }, { label: okLabel, kind, onClick: () => { done = true; res(true); } }] });
  });
}

/* ---------- Einstellungen (lokal im Browser) ---------- */
const Settings = {
  _c: null,
  _load() { if (this._c) return this._c; try { this._c = JSON.parse(localStorage.getItem('clipwerk.settings') || '{}'); } catch { this._c = {}; } return this._c; },
  get(k, d) { const c = this._load(); return c[k] ?? d; },
  set(k, v) { const c = this._load(); c[k] = v; try { localStorage.setItem('clipwerk.settings', JSON.stringify(c)); } catch { } },
};

/* ---------- Formate, Spuren, Vorgaben ---------- */
const FORMATS = {
  '9:16': { w: 1080, h: 1920, label: '9:16 – TikTok, Reels, Shorts' },
  '16:9': { w: 1920, h: 1080, label: '16:9 – YouTube' },
  '1:1': { w: 1080, h: 1080, label: '1:1 – Instagram-Post' },
  '4:5': { w: 1080, h: 1350, label: '4:5 – Instagram-Feed' },
  '21:9': { w: 2520, h: 1080, label: '21:9 – Kino' },
};
const TRACK_TYPES = {
  video: { label: 'Video', h: 62, accepts: ['video', 'image'], icon: 'film' },
  overlay: { label: 'Overlay', h: 48, accepts: ['video', 'image'], icon: 'layers' },
  text: { label: 'Text', h: 34, accepts: ['text'], icon: 'text' },
  fx: { label: 'Effekte', h: 30, accepts: ['fx'], icon: 'wand' },
  audio: { label: 'Audio', h: 44, accepts: ['audio'], icon: 'music' },
};
function defaultTracks() {
  return [
    { id: 't_cap', type: 'text', name: 'Untertitel' },
    { id: 't_text', type: 'text', name: 'Text' },
    { id: 't_fx', type: 'fx', name: 'Effekte' },
    { id: 't_ovl', type: 'overlay', name: 'Overlay' },
    { id: 't_main', type: 'video', name: 'Hauptspur', magnet: true },
    { id: 't_music', type: 'audio', name: 'Musik' },
    { id: 't_voice', type: 'audio', name: 'Stimme' },
    { id: 't_sfx', type: 'audio', name: 'Soundeffekte' },
  ];
}
const FILTER_DEF = () => ({ bright: 0, contrast: 0, sat: 0, hue: 0, temp: 0, fade: 0, vign: 0, grain: 0, blur: 0, sepia: 0 });
const LOOKS = {
  none: { label: 'Original', f: {} },
  kino: { label: 'Kino', f: { contrast: 18, sat: -12, temp: -8, vign: 35, fade: 8 } },
  warm: { label: 'Golden Hour', f: { temp: 38, sat: 14, bright: 4 } },
  kalt: { label: 'Eisblau', f: { temp: -38, sat: -6, contrast: 8 } },
  vintage: { label: 'Vintage', f: { sepia: 35, contrast: -8, grain: 35, vign: 40, fade: 18, sat: -15 } },
  sw: { label: 'Schwarz-Weiß', f: { sat: -100, contrast: 22 } },
  noir: { label: 'Noir', f: { sat: -100, contrast: 55, vign: 60, bright: -6 } },
  vivid: { label: 'Lebendig', f: { sat: 40, contrast: 12 } },
  dream: { label: 'Verträumt', f: { bright: 8, contrast: -14, sat: -8, fade: 22, temp: 10 } },
  neon: { label: 'Neon-Nacht', f: { sat: 55, hue: -18, contrast: 24, temp: -15 } },
  matt: { label: 'Matt', f: { contrast: -18, fade: 26, sat: -10 } },
  sunset: { label: 'Sonnenuntergang', f: { temp: 48, sat: 22, hue: -8, vign: 25 } },
  film: { label: 'Analogfilm', f: { grain: 45, fade: 12, contrast: 10, temp: 12, vign: 20 } },
  cyber: { label: 'Cyberpunk', f: { hue: 30, sat: 40, contrast: 20, temp: -25 } },
};
const ANIMS = { none: 'Keine', fade: 'Einblenden', slideL: 'Von links', slideR: 'Von rechts', slideU: 'Von unten', slideD: 'Von oben', zoomIn: 'Heranzoomen', zoomOut: 'Wegzoomen', pop: 'Pop', spin: 'Drehen', blur: 'Unschärfe', bounce: 'Hüpfen' };
const TRANSITIONS = { none: 'Kein Übergang', fade: 'Überblenden', black: 'Schwarzblende', white: 'Weißblitz', slideL: 'Schieben ←', slideR: 'Schieben →', slideU: 'Schieben ↑', zoomIn: 'Zoom rein', zoomOut: 'Zoom raus', wipe: 'Wischen', circle: 'Kreis', blur: 'Unschärfe', glitch: 'Glitch', spin: 'Wirbel' };
const KENBURNS = { none: 'Aus', zoomIn: 'Langsam ran', zoomOut: 'Langsam weg', panL: 'Schwenk ←', panR: 'Schwenk →', panU: 'Schwenk ↑', panD: 'Schwenk ↓' };
const CLIP_EFFECTS = { none: 'Kein Effekt', shake: 'Wackeln', glitch: 'Glitch', rgb: 'RGB-Versatz', vhs: 'VHS', pulse: 'Puls', glow: 'Leuchten', blink: 'Blinken' };
const FX_LIST = {
  shake: 'Kamerawackeln', zoompulse: 'Zoom-Puls', glitch: 'Glitch', rgb: 'RGB-Versatz', vhs: 'VHS-Band', flash: 'Blitz',
  bw: 'Schwarz-Weiß', blur: 'Weichzeichner', letterbox: 'Kinobalken', vignette: 'Vignette', grain: 'Filmkorn', lightleak: 'Lichtlecks',
  confetti: 'Konfetti', snow: 'Schnee', sparkle: 'Funkeln', hearts: 'Herzen', fadein: 'Aus Schwarz', fadeout: 'Nach Schwarz',
  mirror: 'Spiegelwelt', disco: 'Disco', zoomslow: 'Langsamer Zoom', progress: 'Fortschrittsbalken',
};
const TEXT_ANIMS = { none: 'Keine', typewriter: 'Schreibmaschine', wordpop: 'Wort für Wort', karaoke: 'Karaoke-Markierung', rise: 'Aufsteigen', wave: 'Welle', bounce: 'Hüpfende Wörter', flicker: 'Neon-Flackern' };
const BLENDS = { 'source-over': 'Normal', screen: 'Aufhellen (Screen)', multiply: 'Multiplizieren', overlay: 'Überlagern', lighten: 'Hellere Farbe', darken: 'Dunklere Farbe', 'color-dodge': 'Farbig abwedeln', difference: 'Differenz' };
const FONT_LIST = ['Montserrat', 'Poppins', 'Inter', 'Anton', 'Bebas Neue', 'Oswald', 'Archivo Black', 'Bangers', 'Bungee', 'Permanent Marker', 'Caveat', 'Pacifico', 'Lobster', 'Dancing Script', 'Playfair Display', 'Special Elite', 'Press Start 2P', 'Arial', 'Impact', 'Georgia'];
const TEXT_DEFAULT = {
  text: 'Dein Text', font: 'Montserrat', weight: 800, size: 80, italic: false, color: '#ffffff', stroke: '#000000', strokeW: 0,
  shadow: true, glow: false, bgOn: false, bgColor: '#000000', bgAlpha: .6, upper: false, align: 'center', boxW: .86, lineH: 1.15,
  tAnim: 'none', hl: '#FFD43B', spacing: 0,
};
const TEXT_PRESETS = {
  tiktok: { label: 'TikTok-Untertitel', p: { font: 'Montserrat', weight: 900, size: 70, color: '#ffffff', stroke: '#000000', strokeW: 10, shadow: true, upper: true, tAnim: 'karaoke', hl: '#FFD43B', y: .7 } },
  title: { label: 'Großer Titel', p: { font: 'Anton', weight: 400, size: 160, color: '#ffffff', shadow: true, upper: true, animIn: 'zoomOut', animOut: 'fade', y: .42, lineH: 1.02 } },
  box: { label: 'Untertitel-Box', p: { font: 'Inter', weight: 600, size: 54, color: '#ffffff', bgOn: true, bgColor: '#000000', bgAlpha: .68, shadow: false, y: .8 } },
  neon: { label: 'Neon', p: { font: 'Pacifico', weight: 400, size: 116, color: '#ff4fd8', glow: true, shadow: false, tAnim: 'flicker' } },
  lower: { label: 'Bauchbinde', p: { font: 'Oswald', weight: 700, size: 58, color: '#14110a', bgOn: true, bgColor: '#ffb547', bgAlpha: 1, align: 'left', x: .36, y: .83, boxW: .6, shadow: false, animIn: 'slideL', animOut: 'fade', upper: true } },
  comic: { label: 'Comic', p: { font: 'Bangers', weight: 400, size: 130, color: '#FFE14D', stroke: '#000000', strokeW: 11, rot: -4, tAnim: 'bounce', spacing: 2 } },
  typewriter: { label: 'Schreibmaschine', p: { font: 'Special Elite', weight: 400, size: 66, color: '#f3efe6', tAnim: 'typewriter', shadow: true } },
  elegant: { label: 'Elegant', p: { font: 'Playfair Display', weight: 700, italic: true, size: 100, color: '#ffffff', animIn: 'fade', animOut: 'fade', shadow: true } },
  retro: { label: '8-Bit', p: { font: 'Press Start 2P', weight: 400, size: 54, color: '#7CFF6B', stroke: '#000000', strokeW: 7, tAnim: 'typewriter', lineH: 1.5 } },
  marker: { label: 'Handschrift', p: { font: 'Permanent Marker', weight: 400, size: 96, color: '#ffffff', rot: -3, tAnim: 'wordpop' } },
  words: { label: 'Wort für Wort', p: { font: 'Poppins', weight: 900, size: 88, color: '#ffffff', shadow: true, tAnim: 'wordpop', upper: true } },
  wave: { label: 'Welle', p: { font: 'Bungee', weight: 400, size: 92, color: '#7cd4ff', stroke: '#0a2540', strokeW: 7, tAnim: 'wave' } },
  note: { label: 'Notizzettel', p: { font: 'Caveat', weight: 700, size: 92, color: '#1d1a12', bgOn: true, bgColor: '#fff3a1', bgAlpha: 1, rot: -2, shadow: false, animIn: 'pop' } },
  meme: { label: 'Meme', p: { font: 'Anton', weight: 400, size: 120, color: '#ffffff', stroke: '#000000', strokeW: 11, upper: true, shadow: false } },
  rise: { label: 'Aufsteigend', p: { font: 'Archivo Black', weight: 400, size: 96, color: '#ffffff', tAnim: 'rise', shadow: true } },
};

/* ---------- Zustand ---------- */
const State = {
  project: { name: 'Mein Video', format: '9:16', w: 1080, h: 1920, fps: 30, bg: '#000000' },
  tracks: defaultTracks(),
  clips: [],
  media: new Map(),
  selected: null,
  time: 0,
  zoom: 70,
  snap: true,
  loop: false,
  safeZone: false,
  grid: false,
};
function newClip(kind, extra = {}) {
  const c = { id: uid('c'), kind, track: null, start: 0, dur: 3, name: '' };
  if (kind === 'video' || kind === 'image' || kind === 'text') Object.assign(c, { x: .5, y: .5, scale: 1, rot: 0, opacity: 1, flipH: false, flipV: false, animIn: 'none', animOut: 'none', animDur: .5, effect: 'none', effAmt: .6, trans: { type: 'none', dur: .6 }, kf: {}, blend: 'source-over' });
  if (kind === 'video' || kind === 'image') Object.assign(c, { fit: 'cover', kb: 'none', f: FILTER_DEF(), look: 'none', bg: { mode: 'none', color: '#00ff00', tol: .3, soft: .12, invert: false } });
  if (kind === 'video' || kind === 'audio') Object.assign(c, { in: 0, speed: 1, volume: 1, mute: false, fadeIn: 0, fadeOut: 0 });
  if (kind === 'text') Object.assign(c, JSON.parse(JSON.stringify(TEXT_DEFAULT)));
  if (kind === 'fx') Object.assign(c, { fx: 'shake', amt: .6, dur: 2 });
  return Object.assign(c, extra);
}
const clipById = id => State.clips.find(c => c.id === id) || null;
const trackById = id => State.tracks.find(t => t.id === id) || null;
const trackOf = c => trackById(c.track);
const clipsOn = tid => State.clips.filter(c => c.track === tid).sort((a, b) => a.start - b.start);
const clipEnd = c => c.start + c.dur;
function projectDuration() { let d = 0; for (const c of State.clips) d = Math.max(d, clipEnd(c)); return d; }
function selectedClip() { return clipById(State.selected); }
function firstTrack(type) { return State.tracks.find(t => t.type === type) || null; }
function trackByName(type, name) { return State.tracks.find(t => t.type === type && t.name === name) || firstTrack(type); }
function isVisualKind(k) { return k === 'video' || k === 'image' || k === 'text'; }
function mediaOf(c) { return c && c.media ? State.media.get(c.media) : null; }

/* ---------- Keyframes ---------- */
const KF_PROPS = ['x', 'y', 'scale', 'rot', 'opacity'];
function kfv(c, p, t) {
  const k = c.kf && c.kf[p];
  if (!k || !k.length) return c[p];
  if (t <= k[0].t) return k[0].v;
  const last = k[k.length - 1]; if (t >= last.t) return last.v;
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i], b = k[i + 1];
    if (t >= a.t && t <= b.t) return lerp(a.v, b.v, Ease.inOut((t - a.t) / ((b.t - a.t) || 1)));
  }
  return c[p];
}
const hasKf = (c, p) => !!(c.kf && c.kf[p] && c.kf[p].length);
function kfIndexAt(c, p, local) { const k = c.kf && c.kf[p]; if (!k) return -1; const tol = .5 / State.project.fps; return k.findIndex(f => Math.abs(f.t - local) <= tol); }
function setProp(c, p, v, local) {
  if (KF_PROPS.includes(p) && hasKf(c, p)) {
    local = clamp(local, 0, c.dur);
    const i = kfIndexAt(c, p, local);
    if (i >= 0) c.kf[p][i].v = v; else { c.kf[p].push({ t: local, v }); c.kf[p].sort((a, b) => a.t - b.t); }
  } else c[p] = v;
}
function toggleKf(c, p, local) {
  c.kf = c.kf || {};
  local = clamp(local, 0, c.dur);
  if (!hasKf(c, p)) { c.kf[p] = [{ t: local, v: c[p] }]; return true; }
  const i = kfIndexAt(c, p, local);
  if (i >= 0) { c[p] = c.kf[p][i].v; c.kf[p].splice(i, 1); if (!c.kf[p].length) delete c.kf[p]; return false; }
  c.kf[p].push({ t: local, v: kfv(c, p, local) }); c.kf[p].sort((a, b) => a.t - b.t); return true;
}
function allKfTimes(c) { const s = new Set(); for (const p of KF_PROPS) for (const f of (c.kf && c.kf[p]) || []) s.add(Math.round(f.t * 1000) / 1000); return [...s]; }

/* ---------- Verlauf (Rückgängig / Wiederholen) ---------- */
const Hist = { stack: [], i: -1 };
function snapshot() { return JSON.stringify({ project: State.project, tracks: State.tracks, clips: State.clips }); }
function commit() {
  const s = snapshot();
  if (Hist.stack[Hist.i] === s) return;
  Hist.stack = Hist.stack.slice(0, Hist.i + 1); Hist.stack.push(s);
  if (Hist.stack.length > 100) Hist.stack.shift();
  Hist.i = Hist.stack.length - 1;
  updateUndoButtons(); Store.scheduleSave();
}
function restoreSnap(s) {
  const o = JSON.parse(s);
  State.project = o.project; State.tracks = o.tracks; State.clips = o.clips;
  if (!clipById(State.selected)) State.selected = null;
  refreshAll(); Store.scheduleSave();
}
function undo() { if (Hist.i <= 0) return; Hist.i--; restoreSnap(Hist.stack[Hist.i]); updateUndoButtons(); }
function redo() { if (Hist.i >= Hist.stack.length - 1) return; Hist.i++; restoreSnap(Hist.stack[Hist.i]); updateUndoButtons(); }
function resetHistory() { Hist.stack = [snapshot()]; Hist.i = 0; updateUndoButtons(); }
function updateUndoButtons() { const u = $('#btnUndo'), r = $('#btnRedo'); if (u) u.disabled = Hist.i <= 0; if (r) r.disabled = Hist.i >= Hist.stack.length - 1; }

/* ---------- Gemeinsame Aktualisierung ---------- */
let _tlTimer = 0;
function refreshAll() {
  applyFormat();
  Timeline.render(); Inspector.render(); Preview.requestRender();
  const pn = $('#projName'); if (pn && document.activeElement !== pn) pn.value = State.project.name;
  const fs = $('#selFormat'); if (fs) fs.value = State.project.format;
}
function changed(opts = {}) {
  Preview.requestRender();
  if (opts.timeline !== false) { cancelAnimationFrame(_tlTimer); _tlTimer = requestAnimationFrame(() => Timeline.render()); }
  if (opts.inspector) Inspector.render();
}
function applyFormat() {
  const f = FORMATS[State.project.format] || FORMATS['9:16'];
  State.project.w = f.w; State.project.h = f.h;
  Preview.resize();
}

/* ---------- IndexedDB: automatisches Speichern ---------- */
const Store = {
  db: null, timer: 0, ok: true,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res) => {
      try {
        const r = indexedDB.open('clipwerk', 1);
        r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('media'); d.createObjectStore('state'); };
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => { this.ok = false; res(null); };
      } catch { this.ok = false; res(null); }
    });
  },
  async tx(store, mode, fn) {
    const db = await this.open(); if (!db) return null;
    return new Promise((res) => {
      try {
        const t = db.transaction(store, mode); const s = t.objectStore(store); const r = fn(s);
        t.oncomplete = () => res(r && 'result' in r ? r.result : null); t.onerror = () => res(null); t.onabort = () => res(null);
      } catch { res(null); }
    });
  },
  putMedia(m) { const rec = { id: m.id, name: m.name, type: m.type, blob: m.blob, source: m.source || '', credit: m.credit || '' }; return this.tx('media', 'readwrite', s => s.put(rec, m.id)); },
  getMedia(id) { return this.tx('media', 'readonly', s => s.get(id)); },
  delMedia(id) { return this.tx('media', 'readwrite', s => s.delete(id)); },
  allMediaKeys() { return this.tx('media', 'readonly', s => s.getAllKeys()); },
  scheduleSave() { clearTimeout(this.timer); this.timer = setTimeout(() => this.saveState(), 1200); },
  async saveState() {
    const st = { project: State.project, tracks: State.tracks, clips: State.clips, media: [...State.media.keys()], saved: Date.now() };
    await this.tx('state', 'readwrite', s => s.put(st, 'current'));
    const ind = $('#saveState'); if (ind) { ind.textContent = 'Automatisch gespeichert'; ind.classList.add('on'); setTimeout(() => ind.classList.remove('on'), 1500); }
  },
  loadState() { return this.tx('state', 'readonly', s => s.get('current')); },
  async clearAll() { await this.tx('media', 'readwrite', s => s.clear()); await this.tx('state', 'readwrite', s => s.clear()); },
  async cleanupMedia() {
    const keys = (await this.allMediaKeys()) || [];
    for (const k of keys) if (!State.media.has(k)) await this.delMedia(k);
  },
};

/* ---------- Medien ---------- */
let _decodeCtx = null;
function decodeCtx() { if (!_decodeCtx) _decodeCtx = new OfflineAudioContext(2, 1, 48000); return _decodeCtx; }
function guessType(blob, name = '') {
  const t = blob.type || '';
  if (t.startsWith('video')) return 'video';
  if (t.startsWith('audio')) return 'audio';
  if (t.startsWith('image')) return 'image';
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) return 'audio';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(ext)) return 'image';
  return null;
}
function waitEvent(target, ev, ms = 15000, errEv = 'error') {
  return new Promise((res, rej) => {
    const to = setTimeout(() => { cleanup(); rej(new Error('Zeitüberschreitung')); }, ms);
    const ok = () => { cleanup(); res(); }, bad = () => { cleanup(); rej(new Error('Datei konnte nicht gelesen werden')); };
    const cleanup = () => { clearTimeout(to); target.removeEventListener(ev, ok); target.removeEventListener(errEv, bad); };
    target.addEventListener(ev, ok); target.addEventListener(errEv, bad);
  });
}
function thumbFrom(src, sw, sh, max = 220) {
  const s = Math.min(1, max / Math.max(sw, sh));
  const c = el('canvas', { width: Math.max(1, Math.round(sw * s)), height: Math.max(1, Math.round(sh * s)) });
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  try { return c.toDataURL('image/jpeg', .72); } catch { return ''; }
}
function computePeaks(buf, perSec = 60) {
  const n = Math.max(1, Math.ceil(buf.duration * perSec)); const out = new Float32Array(n);
  const ch0 = buf.getChannelData(0), ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
  const step = buf.length / n;
  for (let i = 0; i < n; i++) {
    let m = 0; const a = Math.floor(i * step), b = Math.min(buf.length, Math.floor((i + 1) * step));
    for (let j = a; j < b; j += 4) { const v = Math.abs(ch0[j]) + Math.abs(ch1[j]); if (v > m) m = v; }
    out[i] = Math.min(1, m / 2 * 1.4);
  }
  return out;
}
async function addMediaBlob(blob, name = 'Datei', opts = {}) {
  const type = opts.type || guessType(blob, name);
  if (!type) throw new Error(`„${name}“ ist kein unterstütztes Format.`);
  const m = { id: opts.id || uid('m'), name, type, blob, url: URL.createObjectURL(blob), duration: 0, w: 0, h: 0, thumb: '', peaks: null, source: opts.source || '', credit: opts.credit || '' };
  if (type === 'image') {
    const img = new Image(); img.src = m.url;
    try { await img.decode(); } catch { throw new Error(`Bild „${name}“ konnte nicht geladen werden.`); }
    m.img = img; m.w = img.naturalWidth; m.h = img.naturalHeight; m.duration = 0; m.thumb = thumbFrom(img, m.w, m.h);
  } else if (type === 'video') {
    const v = el('video', { preload: 'auto', muted: true, playsInline: true }); v.src = m.url;
    await waitEvent(v, 'loadedmetadata', 20000);
    m.duration = isFinite(v.duration) ? v.duration : 0; m.w = v.videoWidth; m.h = v.videoHeight;
    if (!m.duration || m.duration === Infinity) { v.currentTime = 1e9; await waitEvent(v, 'seeked', 8000).catch(() => { }); m.duration = v.duration || 5; }
    v.currentTime = Math.min(1, m.duration / 3);
    await waitEvent(v, 'seeked', 8000).catch(() => { });
    m.thumb = m.w ? thumbFrom(v, m.w, m.h) : '';
    v.removeAttribute('src'); v.load();
  } else if (type === 'audio') {
    try {
      m.buffer = await decodeCtx().decodeAudioData(await blob.arrayBuffer());
      m.duration = m.buffer.duration; m.peaks = computePeaks(m.buffer);
    } catch {
      const a = el('audio', { preload: 'metadata' }); a.src = m.url;
      await waitEvent(a, 'loadedmetadata', 15000); m.duration = a.duration || 1;
    }
  }
  State.media.set(m.id, m);
  if (!opts.noPersist) Store.putMedia(m);
  if (typeof Panels !== 'undefined') Panels.refreshMedia();
  return m;
}
async function getAudioBuffer(m) {
  if (!m) return null;
  if (m.buffer) return m.buffer;
  if (m.noAudio) return null;
  if (m.type === 'image') return null;
  try {
    m.buffer = await decodeCtx().decodeAudioData(await m.blob.arrayBuffer());
    if (!m.peaks) m.peaks = computePeaks(m.buffer);
    return m.buffer;
  } catch {
    try {
      const MB = window.Mediabunny;
      const input = new MB.Input({ source: new MB.BlobSource(m.blob), formats: MB.ALL_FORMATS });
      const at = await input.getPrimaryAudioTrack();
      if (!at || !(await at.canDecode())) throw 0;
      const sink = new MB.AudioBufferSink(at); const parts = [];
      for await (const w of sink.buffers()) parts.push(w.buffer);
      if (!parts.length) throw 0;
      const sr = parts[0].sampleRate, ch = parts[0].numberOfChannels, len = parts.reduce((s, b) => s + b.length, 0);
      const out = new AudioBuffer({ length: len, numberOfChannels: ch, sampleRate: sr }); let off = 0;
      for (const b of parts) { for (let c = 0; c < ch; c++) out.copyToChannel(b.getChannelData(c), c, off); off += b.length; }
      m.buffer = out; m.peaks = computePeaks(out); return out;
    } catch { m.noAudio = true; return null; }
  }
}
function removeMedia(id) {
  const used = State.clips.some(c => c.media === id);
  if (used) { toast('Diese Datei wird noch in der Timeline benutzt.', 'warn'); return false; }
  const m = State.media.get(id); if (m) URL.revokeObjectURL(m.url);
  State.media.delete(id); Store.delMedia(id); Panels.refreshMedia(); return true;
}

/* ---------- WAV-Kodierung (für erzeugte Musik, Stimme, Effekte) ---------- */
function encodeWAV(buf) {
  const ch = Math.min(2, buf.numberOfChannels), sr = buf.sampleRate, len = buf.length;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true);
  out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, len * ch * 2, true);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = clamp(chans[c][i], -1, 1); out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([out.buffer], { type: 'audio/wav' });
}
async function addAudioBuffer(buf, name, opts = {}) {
  const m = await addMediaBlob(encodeWAV(buf), name, { type: 'audio', ...opts });
  return m;
}

/* ---------- Clips platzieren ---------- */
function compatibleTrack(kind, type) { return (TRACK_TYPES[type] || {}).accepts?.includes(kind); }
function freeTrackFor(kind, start, dur, preferType, preferId) {
  const fits = t => !clipsOn(t.id).some(c => c.start < start + dur - 1e-3 && clipEnd(c) > start + 1e-3);
  if (preferId) { const t = trackById(preferId); if (t && compatibleTrack(kind, t.type) && fits(t)) return t; }
  const cands = State.tracks.filter(t => compatibleTrack(kind, t.type) && (!preferType || t.type === preferType));
  for (const t of cands) if (fits(t)) return t;
  const type = preferType || (kind === 'text' ? 'text' : kind === 'audio' ? 'audio' : kind === 'fx' ? 'fx' : 'overlay');
  return addTrack(type);
}
function addTrack(type, name) {
  const n = State.tracks.filter(t => t.type === type).length + 1;
  const t = { id: uid('t'), type, name: name || `${TRACK_TYPES[type].label} ${n}` };
  const idx = State.tracks.findIndex(x => x.type === type);
  if (idx >= 0) State.tracks.splice(idx, 0, t);
  else if (type === 'audio') State.tracks.push(t);
  else State.tracks.unshift(t);
  return t;
}
function packTrack(tid) {
  let t = 0;
  for (const c of clipsOn(tid)) { c.start = t; t += c.dur; }
}
function insertOnMain(clip, at = State.time) {
  const main = State.tracks.find(t => t.magnet) || firstTrack('video') || addTrack('video');
  const list = clipsOn(main.id);
  let idx = list.findIndex(c => at < c.start + c.dur / 2);
  if (idx < 0) idx = list.length;
  clip.track = main.id;
  State.clips.push(clip);
  const order = list.slice(); order.splice(idx, 0, clip);
  let t = 0; for (const c of order) { c.start = t; t += c.dur; }
  return clip;
}
function placeClip(clip, { start = State.time, trackType, trackId } = {}) {
  clip.start = Math.max(0, start);
  const t = freeTrackFor(clip.kind, clip.start, clip.dur, trackType, trackId);
  clip.track = t.id;
  State.clips.push(clip);
  return clip;
}
function clipFromMedia(m, extra = {}) {
  if (m.type === 'image') return newClip('image', { media: m.id, name: m.name, dur: 4, ...extra });
  if (m.type === 'video') return newClip('video', { media: m.id, name: m.name, dur: Math.max(.2, m.duration), ...extra });
  return newClip('audio', { media: m.id, name: m.name, dur: Math.max(.2, m.duration), ...extra });
}
function addMediaToTimeline(m, where = {}) {
  const c = clipFromMedia(m, where.extra);
  if (m.type === 'audio') placeClip(c, { start: where.start ?? State.time, trackId: where.trackId, trackType: 'audio' });
  else if (where.overlay) placeClip(c, { start: where.start ?? State.time, trackType: 'overlay', trackId: where.trackId });
  else if (where.trackId && trackById(where.trackId) && !trackById(where.trackId).magnet) placeClip(c, { start: where.start ?? State.time, trackId: where.trackId });
  else insertOnMain(c, where.start ?? State.time);
  State.selected = c.id;
  commit(); refreshAll();
  return c;
}
