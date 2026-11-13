/* ==========================================================================
   Start, Bedienleiste, Tastenkürzel, Drag & Drop, Einstellungen, Beispiel
   ========================================================================== */
function openSettings() {
  const f = (id, label, val, ph, help, type = 'text') => [el('label', { class: 'fl', for: id }, label), el('input', { id, class: 'inp', type, value: val || '', placeholder: ph, autocomplete: 'off' }), help ? el('p', { class: 'muted xs' }, help) : null];
  const body = el('div', { class: 'tform' },
    el('h3', { class: 'h3' }, 'KI-Dienste (optional)'),
    el('p', { class: 'muted small' }, 'Clipwerk funktioniert ohne Anmeldung. Wenn ein kostenloses Limit greift oder ein Dienst einen Schlüssel verlangt, trägst du ihn hier ein. Schlüssel werden nur auf diesem PC gespeichert.'),
    ...f('setPoll', 'Pollinations-Schlüssel', Settings.get('pollKey'), 'sk_… oder pk_…', 'Kostenlos auf enter.pollinations.ai – für KI-Bilder, Texte, Stimme und Online-Untertitel.', 'password'),
    ...f('setPexels', 'Pexels-Schlüssel', Settings.get('pexelsKey'), 'Pexels API Key', 'Kostenlos auf pexels.com/api – für Stock-Fotos und -Videos.', 'password'),
    el('details', { class: 'adv' }, el('summary', {}, 'Erweitert'),
      ...f('setImgModel', 'Bildmodell (leer = Standard)', Settings.get('imgModel'), 'z. B. black-forest-labs/flux.1-schnell'),
      ...f('setTextModel', 'Textmodell', Settings.get('textModel', 'openai/gpt-5.4-nano'), 'openai/gpt-5.4-nano'),
      ...f('setStt', 'Spracherkennungs-Modell (online)', Settings.get('sttModel', 'whisper-1'), 'whisper-1'),
      ...f('setLang', 'Sprache für Live-Untertitel', Settings.get('lang', 'de-DE'), 'de-DE')),
    el('h3', { class: 'h3' }, 'Speicher'),
    el('p', { class: 'muted small' }, 'Dein aktuelles Projekt wird automatisch im Browser gespeichert. Über „Speichern“ erhältst du zusätzlich eine .clipwerk-Datei mit allen Medien als Sicherung.'),
    el('p', { class: 'muted xs mono' }, `Clipwerk Studio ${APP_VERSION}`));
  modal({ title: 'Optionen', body, actions: [{ label: 'Abbrechen' }, { label: 'Speichern', kind: 'primary', onClick: () => {
    Settings.set('pollKey', $('#setPoll').value.trim()); Settings.set('pexelsKey', $('#setPexels').value.trim());
    Settings.set('imgModel', $('#setImgModel').value.trim()); Settings.set('textModel', $('#setTextModel').value.trim() || 'openai/gpt-5.4-nano');
    Settings.set('sttModel', $('#setStt').value.trim() || 'whisper-1'); Settings.set('lang', $('#setLang').value.trim() || 'de-DE');
    toast('Optionen gespeichert.', 'ok');
  } }] });
}

async function importFiles(files, { toTimeline = false } = {}) {
  const added = [];
  for (const f of files) {
    try { added.push(await addMediaBlob(f, f.name)); }
    catch (e) { toast(e.message || `„${f.name}“ konnte nicht importiert werden.`, 'error'); }
  }
  if (!added.length) return;
  if (toTimeline) { for (const m of added) { const c = clipFromMedia(m); if (m.type === 'audio') placeClip(c, { start: State.time, trackType: 'audio', trackId: trackByName('audio', 'Musik')?.id }); else insertOnMain(c, projectDuration() + 1); } commit(); refreshAll(); Timeline.fit(); }
  toast(added.length === 1 ? `„${added[0].name}“ importiert.` : `${added.length} Dateien importiert.`, 'ok');
  Panels.show('media');
}

function bindUI() {
  $('#btnUndo').innerHTML = icon('undo'); $('#btnRedo').innerHTML = icon('redo');
  $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
  $('#btnNew').onclick = () => Projects.newProject();
  $('#btnOpen').onclick = () => $('#projInput').click();
  $('#btnSave').onclick = () => ProjectFile.save();
  $('#btnExport').onclick = () => document.body.classList.contains('simple') ? Exporter.quick() : Exporter.open();
  $('#btnHome').innerHTML = icon('layout') + '<span>Start</span>'; $('#btnHome').onclick = () => Easy.home();
  $('#btnMode').onclick = () => Easy.setSimple(!document.body.classList.contains('simple'));
  $('#projInput').onchange = (e) => { const f = e.target.files[0]; if (f) ProjectFile.load(f); e.target.value = ''; };
  $('#fileInput').onchange = (e) => { importFiles([...e.target.files], { toTimeline: !State.clips.length }); e.target.value = ''; };
  const pn = $('#projName'); pn.onchange = () => { State.project.name = pn.value.trim() || 'Mein Video'; commit(); };
  const fs = $('#selFormat'); fs.replaceChildren(...Object.entries(FORMATS).map(([k, v]) => el('option', { value: k }, v.label)));
  fs.onchange = () => { State.project.format = fs.value; applyFormat(); commit(); refreshAll(); };
  // Transport
  const T = { btnStart: ['toStart', () => { Preview.pause(); Preview.seek(0); }], btnBack: ['stepBack', () => Preview.step(-1)], btnPlay: ['play', () => Preview.toggle()], btnFwd: ['stepFwd', () => Preview.step(1)], btnEnd: ['toEnd', () => { Preview.pause(); Preview.seek(projectDuration()); }] };
  for (const [id, [ic, fn]] of Object.entries(T)) { $('#' + id).innerHTML = icon(ic); $('#' + id).onclick = fn; }
  $('#btnLoop').innerHTML = icon('loop'); $('#btnLoop').onclick = () => { State.loop = !State.loop; $('#btnLoop').classList.toggle('on', State.loop); };
  $('#btnSafe').innerHTML = icon('shield'); $('#btnSafe').onclick = () => { State.safeZone = !State.safeZone; $('#btnSafe').classList.toggle('on', State.safeZone); Preview.requestRender(); };
  $('#btnSnap').innerHTML = icon('camera'); $('#btnSnap').onclick = () => Preview.snapshotPNG();
  $('#btnFull').innerHTML = icon('full'); $('#btnFull').onclick = () => { const v = $('#viewer'); (document.fullscreenElement ? document.exitFullscreen() : v.requestFullscreen()).catch(() => { }); };
  for (const [id, ic] of [['tlSplit', 'scissors'], ['tlDelete', 'trash'], ['tlDup', 'copy'], ['tlSnap', 'magnet'], ['tlZoomIn', 'zoomIn'], ['tlZoomOut', 'zoomOut'], ['tlFit', 'full'], ['tlAddTrack', 'plus']]) $('#' + id).insertAdjacentHTML('afterbegin', icon(ic));
  $('#btnPanel').innerHTML = icon('layout'); $('#btnPanel').onclick = () => document.body.classList.toggle('panel-open');
  $('#btnInsp').innerHTML = icon('sliders'); $('#btnInsp').onclick = () => document.body.classList.toggle('insp-open');
  // Teiler zwischen Monitor und Timeline
  const split = $('#hsplit');
  split.addEventListener('pointerdown', e => {
    const app = $('#app'), y0 = e.clientY, h0 = $('#tl').getBoundingClientRect().height;
    const mv = ev => { const h = clamp(h0 - (ev.clientY - y0), 150, innerHeight - 260); app.style.setProperty('--tl-h', h + 'px'); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); Preview.resize(); Settings.set('tlH', app.style.getPropertyValue('--tl-h')); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  const th = Settings.get('tlH'); if (th) $('#app').style.setProperty('--tl-h', th);
  // Dateien ins Fenster ziehen
  let dragDepth = 0;
  window.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { dragDepth++; document.body.classList.add('dropping'); } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dropping'); });
  window.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', e => {
    dragDepth = 0; document.body.classList.remove('dropping');
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    const proj = files.find(f => f.name.endsWith('.clipwerk')); if (proj) { ProjectFile.load(proj); return; }
    const lane = e.target.closest && e.target.closest('.tl-lane');
    importFiles(files, { toTimeline: !!lane || !State.clips.length });
  });
  // Tastenkürzel
  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if ($('.modal-wrap')) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (k === ' ') { e.preventDefault(); Preview.toggle(); }
    else if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (mod && k === 'd') { e.preventDefault(); duplicateSelected(); }
    else if (mod && k === 's') { e.preventDefault(); ProjectFile.save(); }
    else if (mod && k === 'e') { e.preventDefault(); Exporter.open(); }
    else if (k === 's' && !mod) splitAtPlayhead();
    else if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSelected(); }
    else if (k === 'arrowleft') { e.preventDefault(); Preview.step(e.shiftKey ? -State.project.fps : -1); }
    else if (k === 'arrowright') { e.preventDefault(); Preview.step(e.shiftKey ? State.project.fps : 1); }
    else if (k === 'home') Preview.seek(0);
    else if (k === 'end') Preview.seek(projectDuration());
    else if (k === 'escape') { State.selected = null; Inspector.render(); Timeline.render(); Preview.requestRender(); }
    else if (k === '+' || k === '=') Timeline.setZoom(State.zoom * 1.25);
    else if (k === '-') Timeline.setZoom(State.zoom / 1.25);
  });
  window.addEventListener('resize', () => Preview.resize());
}

/* ---------- Beispielprojekt: zeigt beim ersten Start, was möglich ist ---------- */
async function paintScene(kind, W, H) {
  const cv = mkCanvas(W, H), x = cv.getContext('2d'), R = mulberry(kind.length * 97);
  if (kind === 'sunset') {
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a1650'); g.addColorStop(.45, '#c4466a'); g.addColorStop(.62, '#ffb547'); g.addColorStop(1, '#3a1a2c'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    const sg = x.createRadialGradient(W * .5, H * .58, 0, W * .5, H * .58, W * .45); sg.addColorStop(0, 'rgba(255,240,200,1)'); sg.addColorStop(.25, 'rgba(255,200,120,.9)'); sg.addColorStop(1, 'rgba(255,180,90,0)'); x.fillStyle = sg; x.fillRect(0, 0, W, H);
    [['#5a2346', .6, .07], ['#3d1838', .68, .1], ['#22102a', .78, .13]].forEach(([c, base, amp], k) => { x.fillStyle = c; x.beginPath(); x.moveTo(0, H); for (let i = 0; i <= 40; i++) { const px = i / 40 * W; x.lineTo(px, H * base - Math.abs(Math.sin(i * .5 + k * 2) + Math.sin(i * .23 + k)) * H * amp * .5 - R() * H * .015); } x.lineTo(W, H); x.fill(); });
  } else if (kind === 'city') {
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#05060f'); g.addColorStop(.6, '#1b1f4a'); g.addColorStop(1, '#3b1c5a'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(255,255,255,${R() * .7})`; x.fillRect(R() * W, R() * H * .45, 2, 2); }
    let px = -20; while (px < W) { const bw = W * (.08 + R() * .1), bh = H * (.2 + R() * .35); x.fillStyle = `hsl(${235 + R() * 30},40%,${8 + R() * 8}%)`; x.fillRect(px, H - bh, bw, bh);
      for (let wy = H - bh + 20; wy < H - 20; wy += 34) for (let wx = px + 12; wx < px + bw - 14; wx += 26) if (R() < .45) { x.fillStyle = R() < .5 ? '#ffd37a' : '#7cd4ff'; x.globalAlpha = .55 + R() * .45; x.fillRect(wx, wy, 12, 18); x.globalAlpha = 1; }
      px += bw + 6; }
    const ng = x.createLinearGradient(0, H * .7, 0, H); ng.addColorStop(0, 'rgba(255,79,216,0)'); ng.addColorStop(1, 'rgba(255,79,216,.35)'); x.fillStyle = ng; x.fillRect(0, H * .7, W, H * .3);
  } else {
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#a8e4ff'); g.addColorStop(.4, '#3aa6d0'); g.addColorStop(.42, '#0f6f99'); g.addColorStop(1, '#062a44'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 3;
    for (let r = 0; r < 26; r++) { const y0 = H * .44 + r * r * 2.6; x.beginPath(); for (let i = 0; i <= 60; i++) { const px = i / 60 * W; x.lineTo(px, y0 + Math.sin(i * .5 + r) * (4 + r * .8)); } x.globalAlpha = .25 + R() * .4; x.stroke(); }
    x.globalAlpha = 1; const sg = x.createRadialGradient(W * .75, H * .12, 0, W * .75, H * .12, W * .3); sg.addColorStop(0, 'rgba(255,255,255,.95)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = sg; x.fillRect(0, 0, W, H);
  }
  return new Promise(r => cv.toBlob(r, 'image/jpeg', .9));
}
async function buildDemo() {
  const W = State.project.w, H = State.project.h;
  const names = { sunset: 'Beispiel – Sonnenuntergang', city: 'Beispiel – Stadt bei Nacht', ocean: 'Beispiel – Meer' };
  const ms = {};
  for (const k of Object.keys(names)) ms[k] = await addMediaBlob(await paintScene(k, W, H), names[k], { type: 'image', source: 'Clipwerk' });
  const main = State.tracks.find(t => t.magnet).id;
  const add = (c, tid) => { c.track = tid; State.clips.push(c); return c; };
  add(newClip('image', { media: ms.sunset.id, name: names.sunset, start: 0, dur: 4, kb: 'zoomIn', look: 'warm', f: { ...FILTER_DEF(), ...LOOKS.warm.f } }), main);
  add(newClip('image', { media: ms.city.id, name: names.city, start: 4, dur: 4, kb: 'panL', trans: { type: 'slideL', dur: .6 }, look: 'neon', f: { ...FILTER_DEF(), ...LOOKS.neon.f } }), main);
  add(newClip('image', { media: ms.ocean.id, name: names.ocean, start: 8, dur: 4, kb: 'zoomOut', trans: { type: 'circle', dur: .8 } }), main);
  const txt = (preset, text, start, dur, extra, tn = 'Text') => add(newClip('text', { ...JSON.parse(JSON.stringify(TEXT_PRESETS[preset].p)), text, start, dur, name: TEXT_PRESETS[preset].label, ...extra }), trackByName('text', tn).id);
  const title = txt('title', 'Clipwerk Studio', .3, 3.2, { size: 150, y: .4 });
  title.kf = { scale: [{ t: 0, v: .9 }, { t: 3.2, v: 1.08 }] };
  txt('tiktok', 'Schneiden. Animieren. Exportieren.', 4.3, 3.4, {}, 'Untertitel');
  txt('tiktok', 'Alles kostenlos auf deinem PC', 8.3, 3.4, { hl: '#7cd4ff' }, 'Untertitel');
  txt('lower', 'Beispielprojekt · frei bearbeitbar', 1.2, 2.6, { y: .86, x: .4, size: 44 });
  const fx = (k, s, d, a) => add(newClip('fx', { fx: k, start: s, dur: d, amt: a, name: FX_LIST[k] }), trackByName('fx', 'Effekte').id);
  fx('lightleak', 0, 4, .45); fx('flash', 4, .5, .5); fx('sparkle', 8.5, 3.5, .6); fx('fadeout', 11.3, .7, 1);
  const buf = await Music.generate('lofi', 12, 3);
  const mm = await addAudioBuffer(buf, 'Lo-Fi Chill (12 s)', { source: 'Clipwerk Musik-Generator' });
  add(newClip('audio', { media: mm.id, name: mm.name, start: 0, dur: buf.duration, volume: .8, fadeOut: 1.5 }), trackByName('audio', 'Musik').id);
  State.project.name = 'Beispielprojekt';
}

function welcome() {
  if (Settings.get('welcomed')) return;
  Settings.set('welcomed', true);
  modal({ title: 'Willkommen bei Clipwerk Studio', wide: false, body: el('div', { class: 'welcome' },
    el('p', {}, 'Dein kostenloser Video-Editor für TikTok, Reels, Shorts und YouTube. Ein Beispielprojekt ist schon geladen – drück die Leertaste zum Abspielen.'),
    el('ul', { class: 'wl' },
      el('li', { html: `${icon('film')}<span><strong>Schneiden wie ein Profi:</strong> Mehrere Spuren, Keyframes, Übergänge, Filter und Effekte.</span>` }),
      el('li', { html: `${icon('sparkle')}<span><strong>KI kostenlos:</strong> Bilder, ganze Videos aus einer Idee, Stimmen und Untertitel.</span>` }),
      el('li', { html: `${icon('music')}<span><strong>Lizenzfreie Musik:</strong> Der Musik-Generator komponiert passend zur Videolänge.</span>` }),
      el('li', { html: `${icon('download')}<span><strong>Export bis 4K/60 fps</strong> als MP4 – mit der Hardware deines PCs.</span>` }))),
    actions: [{ label: 'Los geht’s', kind: 'primary' }] });
}

async function boot() {
  Preview.init(); Timeline.init(); Inspector.init(); Panels.init(); bindUI();
  let restored = false;
  try {
    const st = await Store.loadState();
    if (st && st.clips) {
      const ids = st.media || [];
      for (const id of ids) {
        const rec = await Store.getMedia(id);
        if (rec && rec.blob) { try { await addMediaBlob(rec.blob, rec.name, { id: rec.id, type: rec.type, noPersist: true, credit: rec.credit, source: rec.source }); } catch (e) { console.warn(e); } }
      }
      State.project = st.project; State.tracks = st.tracks; State.clips = st.clips.filter(c => !c.media || State.media.has(c.media));
      restored = true;
    }
  } catch (e) { console.warn('Wiederherstellung fehlgeschlagen', e); }
  if (!restored) {
    try { await buildDemo(); } catch (e) { console.error('Beispiel konnte nicht erstellt werden', e); }
  }
  resetHistory(); refreshAll(); Panels.refreshMedia();
  requestAnimationFrame(() => { Timeline.fit(); Preview.resize(); });
  if (!restored) Store.saveState();
  Store.cleanupMedia();
  $('#boot')?.remove();
  Easy.setSimple(false);
  Easy.home();
}
window.addEventListener('error', e => { console.error(e.error || e.message); });
window.addEventListener('unhandledrejection', e => { console.error(e.reason); });
document.addEventListener('DOMContentLoaded', boot);
