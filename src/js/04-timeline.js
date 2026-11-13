/* ==========================================================================
   Timeline: Spuren, Clips, Trimmen, Ziehen, Einrasten
   ========================================================================== */
const HEAD_W = 150;
const KIND_LABEL = { video: 'Video', image: 'Bild', text: 'Text', audio: 'Audio', fx: 'Effekt' };
const Timeline = {
  scroll: null, inner: null, ruler: null, ph: null, rafR: 0,
  init() {
    this.scroll = $('#tlScroll'); this.inner = $('#tlInner');
    this.scroll.addEventListener('scroll', () => { this.drawRuler(); this.updatePlayhead(); });
    this.scroll.addEventListener('wheel', e => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const r = this.scroll.getBoundingClientRect(), mx = e.clientX - r.left - HEAD_W, t = (mx + this.scroll.scrollLeft) / State.zoom;
        this.setZoom(State.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
        this.scroll.scrollLeft = t * State.zoom - mx;
      } else if (e.shiftKey === false && Math.abs(e.deltaX) < Math.abs(e.deltaY) && e.target.closest('.tl-rrow')) {
        e.preventDefault(); this.scroll.scrollLeft += e.deltaY;
      }
    }, { passive: false });
    new ResizeObserver(() => { this.render(); }).observe(this.scroll);
    $('#tlZoom').addEventListener('input', e => this.setZoom(+e.target.value));
    $('#tlZoomIn').onclick = () => this.setZoom(State.zoom * 1.3);
    $('#tlZoomOut').onclick = () => this.setZoom(State.zoom / 1.3);
    $('#tlFit').onclick = () => this.fit();
    $('#tlSplit').onclick = () => splitAtPlayhead();
    $('#tlDelete').onclick = () => deleteSelected();
    $('#tlDup').onclick = () => duplicateSelected();
    $('#tlSnap').onclick = () => { State.snap = !State.snap; $('#tlSnap').classList.toggle('on', State.snap); };
    $('#tlAddTrack').onclick = (e) => menu(e.clientX, e.clientY, Object.entries(TRACK_TYPES).map(([k, v]) => ({ label: `${v.label}-Spur hinzufügen`, icon: v.icon, action: () => { addTrack(k); commit(); this.render(); } })));
  },
  setZoom(z) { State.zoom = clamp(z, 8, 600); $('#tlZoom').value = State.zoom; this.render(); },
  fit() { const d = Math.max(5, projectDuration()); this.setZoom((this.scroll.clientWidth - HEAD_W - 40) / d); this.scroll.scrollLeft = 0; },
  laneW() { return Math.max(projectDuration() + 30, (this.scroll.clientWidth - HEAD_W) / State.zoom + 2) * State.zoom; },
  renderSoon() { cancelAnimationFrame(this.rafR); this.rafR = requestAnimationFrame(() => this.render()); },
  render() {
    if (!this.inner) return;
    const z = State.zoom, lw = this.laneW();
    this.inner.style.width = (HEAD_W + lw) + 'px';
    const frag = document.createDocumentFragment();
    const rrow = el('div', { class: 'tl-rrow' },
      el('div', { class: 'tl-corner' }, el('span', { class: 'mono' }, fmtTC(State.time, State.project.fps))),
      this.ruler = el('canvas', { class: 'tl-ruler' }));
    rrow.addEventListener('pointerdown', e => this.scrub(e));
    frag.append(rrow);
    for (const tr of State.tracks) frag.append(this.renderTrack(tr, lw));
    this.ph = el('div', { class: 'tl-playhead' }, el('div', { class: 'tl-ph-head' }));
    frag.append(this.ph);
    this.inner.replaceChildren(frag);
    this.drawRuler(); this.updatePlayhead(); this.drawWaves();
    const sel = selectedClip();
    $('#tlSplit').disabled = !sel; $('#tlDelete').disabled = !sel; $('#tlDup').disabled = !sel;
    $('#tlSnap').classList.toggle('on', State.snap);
  },
  renderTrack(tr, lw) {
    const tt = TRACK_TYPES[tr.type];
    const head = el('div', { class: 'tl-head', title: tr.name },
      el('span', { class: 'tl-ticon', html: icon(tt.icon) }),
      el('span', { class: 'tl-tname' }, tr.name, tr.magnet ? el('span', { class: 'tl-mag', title: 'Magnetische Hauptspur: Clips rücken automatisch zusammen', html: icon('magnet') }) : null),
      el('span', { class: 'tl-tbtns' },
        tr.type !== 'audio' ? el('button', { class: 'ib xs' + (tr.hidden ? ' off' : ''), title: tr.hidden ? 'Spur einblenden' : 'Spur ausblenden', html: icon(tr.hidden ? 'eyeOff' : 'eye'), onclick: () => { tr.hidden = !tr.hidden; commit(); this.render(); Preview.requestRender(); } }) : null,
        (tr.type === 'audio' || tr.type === 'video' || tr.type === 'overlay') ? el('button', { class: 'ib xs' + (tr.mute ? ' off' : ''), title: tr.mute ? 'Ton an' : 'Stumm', html: icon(tr.mute ? 'volX' : 'vol'), onclick: () => { tr.mute = !tr.mute; commit(); this.render(); Preview.sync(Preview.playing); } }) : null,
        el('button', { class: 'ib xs' + (tr.lock ? ' off' : ''), title: tr.lock ? 'Entsperren' : 'Sperren', html: icon(tr.lock ? 'lock' : 'unlock'), onclick: () => { tr.lock = !tr.lock; commit(); this.render(); } })));
    head.addEventListener('contextmenu', e => { e.preventDefault(); this.trackMenu(e, tr); });
    const lane = el('div', { class: 'tl-lane' + (tr.lock ? ' locked' : ''), style: { width: lw + 'px' } });
    lane.addEventListener('pointerdown', e => { if (e.target === lane) { State.selected = null; Inspector.render(); this.scrub(e); } });
    lane.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-clipwerk')) { e.preventDefault(); lane.classList.add('drop'); } });
    lane.addEventListener('dragleave', () => lane.classList.remove('drop'));
    lane.addEventListener('drop', e => { lane.classList.remove('drop'); this.onDrop(e, tr, lane); });
    for (const c of clipsOn(tr.id)) lane.append(this.renderClip(c, tr));
    return el('div', { class: `tl-row t-${tr.type}${tr.hidden ? ' hidden' : ''}`, 'data-track': tr.id, style: { height: tt.h + 'px' } }, head, lane);
  },
  renderClip(c, tr) {
    const z = State.zoom, m = mediaOf(c), w = Math.max(4, c.dur * z);
    const kind = c.kind === 'video' || c.kind === 'image' ? c.kind : c.kind;
    const e = el('div', { class: `clip k-${kind}${State.selected === c.id ? ' sel' : ''}${c.mute ? ' muted' : ''}`, 'data-id': c.id, style: { left: c.start * z + 'px', width: w + 'px' } });
    if ((c.kind === 'video' || c.kind === 'image') && m && m.thumb) e.append(el('div', { class: 'clip-thumbs', style: { backgroundImage: `url(${m.thumb})` } }));
    if (c.kind === 'audio' || (c.kind === 'video' && m && m.peaks)) e.append(el('canvas', { class: 'clip-wave', 'data-wave': c.id }));
    let label = c.name || KIND_LABEL[c.kind];
    if (c.kind === 'text') label = (c.text || '').replace(/\n/g, ' ');
    if (c.kind === 'fx') label = FX_LIST[c.fx] || 'Effekt';
    const badges = [];
    if ((c.speed || 1) !== 1) badges.push(`${+c.speed.toFixed(2)}×`);
    if (c.bg && c.bg.mode !== 'none') badges.push('freigestellt');
    if (c.effect && c.effect !== 'none') badges.push(CLIP_EFFECTS[c.effect]);
    e.append(el('div', { class: 'clip-label' }, el('span', { class: 'clip-ic', html: icon(c.kind === 'video' ? 'film' : c.kind === 'image' ? 'image' : c.kind === 'text' ? 'text' : c.kind === 'fx' ? 'wand' : 'music') }), el('span', { class: 'clip-name' }, label), badges.map(b => el('em', {}, b))));
    for (const t of allKfTimes(c)) if (t >= 0 && t <= c.dur) e.append(el('div', { class: 'kf-dot', style: { left: t * z + 'px' }, title: 'Keyframe' }));
    if (c.fadeIn > 0) e.append(el('div', { class: 'fade-in', style: { width: c.fadeIn * z + 'px' } }));
    if (c.fadeOut > 0) e.append(el('div', { class: 'fade-out', style: { width: c.fadeOut * z + 'px' } }));
    const hl = el('div', { class: 'h h-l', title: 'Anfang trimmen' }), hr = el('div', { class: 'h h-r', title: 'Ende trimmen' });
    e.append(hl, hr);
    if (!tr.lock) {
      e.addEventListener('pointerdown', ev => { if (ev.button === 0) this.startDrag(ev, c, ev.target === hl ? 'l' : ev.target === hr ? 'r' : 'move'); });
    } else e.addEventListener('pointerdown', ev => { State.selected = c.id; Inspector.render(); this.render(); ev.stopPropagation(); });
    e.addEventListener('contextmenu', ev => { ev.preventDefault(); State.selected = c.id; Inspector.render(); this.render(); this.clipMenu(ev, c); });
    e.addEventListener('dblclick', () => { Preview.seek(c.start); });
    if (isVisualKind(c.kind) && c.kind !== 'text') {
      const prev = State.clips.find(p => p.track === c.track && p !== c && Math.abs(clipEnd(p) - c.start) < .05);
      if (prev) {
        const has = c.trans && c.trans.type !== 'none';
        const b = el('button', { class: 'tr-btn' + (has ? ' on' : ''), title: has ? `Übergang: ${TRANSITIONS[c.trans.type]}` : 'Übergang hinzufügen', html: icon('split') });
        b.addEventListener('pointerdown', ev => ev.stopPropagation());
        b.onclick = (ev) => { ev.stopPropagation(); State.selected = c.id; this.transMenu(ev, c); };
        e.append(b);
      }
    }
    return e;
  },
  drawWaves() {
    for (const cv of $$('canvas[data-wave]', this.inner)) {
      const c = clipById(cv.dataset.wave), m = mediaOf(c);
      if (!m) continue;
      if (!m.peaks) { if (m.type === 'audio' && !m._peaksLoading) { m._peaksLoading = true; getAudioBuffer(m).then(() => this.renderSoon()); } continue; }
      const w = Math.min(4000, Math.max(2, Math.round(c.dur * State.zoom))), h = cv.parentElement.clientHeight;
      cv.width = w; cv.height = h; cv.style.width = w + 'px';
      const x = cv.getContext('2d'); x.fillStyle = c.kind === 'video' ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.55)';
      const per = 60, s0 = (c.in || 0) * per, span = c.dur * (c.speed || 1) * per, mid = c.kind === 'video' ? h - 8 : h / 2 + 4, amp = c.kind === 'video' ? 7 : h / 2 - 8;
      for (let px = 0; px < w; px++) {
        const i = Math.floor(s0 + (px / w) * span), v = m.peaks[i] || 0, a = Math.max(.5, v * amp * (c.volume ?? 1));
        if (c.kind === 'video') x.fillRect(px, mid - a, 1, a); else x.fillRect(px, mid - a, 1, a * 2);
      }
    }
  },
  drawRuler() {
    const cv = this.ruler; if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), vw = Math.max(10, this.scroll.clientWidth - HEAD_W), h = 26;
    cv.width = vw * dpr; cv.height = h * dpr; cv.style.width = vw + 'px'; cv.style.height = h + 'px';
    const x = cv.getContext('2d'); x.scale(dpr, dpr);
    const z = State.zoom, sl = this.scroll.scrollLeft;
    const steps = [.1, .2, .5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const major = steps.find(s => s * z >= 70) || 300, minor = major / (major === .2 || major === 2 || major === 20 ? 4 : 5);
    x.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--fg-3') || '#777';
    x.strokeStyle = 'rgba(160,170,190,.35)'; x.font = '10px "JetBrains Mono", monospace'; x.textBaseline = 'top';
    const t0 = sl / z, t1 = (sl + vw) / z;
    for (let i = Math.floor(t0 / minor); i * minor <= t1 + minor; i++) {
      const t = i * minor, px = Math.round(t * z - sl) + .5, isMaj = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      x.beginPath(); x.moveTo(px, isMaj ? 12 : 19); x.lineTo(px, h); x.stroke();
      if (isMaj) x.fillText(major < 1 ? t.toFixed(1) + 's' : `${Math.floor(t / 60)}:${pad2(Math.round(t % 60))}`, px + 3, 2);
    }
  },
  updatePlayhead(follow) {
    if (!this.ph) return;
    const x = HEAD_W + State.time * State.zoom;
    this.ph.style.transform = `translateX(${x}px)`;
    this.ph.style.visibility = x < this.scroll.scrollLeft + HEAD_W - 1 ? 'hidden' : 'visible';
    const tc = $('.tl-corner .mono', this.inner); if (tc) tc.textContent = fmtTC(State.time, State.project.fps);
    if (follow) {
      const vw = this.scroll.clientWidth, sl = this.scroll.scrollLeft;
      if (x > sl + vw - 60) this.scroll.scrollLeft = x - HEAD_W - 60;
      else if (x < sl + HEAD_W) this.scroll.scrollLeft = Math.max(0, x - HEAD_W - 20);
    }
  },
  timeAt(clientX) { const r = this.scroll.getBoundingClientRect(); return Math.max(0, (clientX - r.left - HEAD_W + this.scroll.scrollLeft) / State.zoom); },
  scrub(e) {
    if (e.button !== 0) return;
    const was = Preview.playing; if (was) Preview.pause();
    const go = ev => Preview.seek(this.timeAt(ev.clientX));
    go(e);
    const move = ev => go(ev), up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); Timeline.render(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  },
  startDrag(e, c, mode) {
    e.preventDefault(); e.stopPropagation();
    if (State.selected !== c.id) { State.selected = c.id; Inspector.render(); }
    const m = mediaOf(c), z = State.zoom, x0 = e.clientX;
    const orig = { start: c.start, dur: c.dur, in: c.in || 0, track: c.track, kf: JSON.parse(JSON.stringify(c.kf || {})) };
    const pts = State.snap ? [0, State.time, ...State.clips.filter(o => o !== c).flatMap(o => [o.start, clipEnd(o)])] : [];
    const snap = v => { let best = v, bd = 9 / z; for (const p of pts) { const d = Math.abs(p - v); if (d < bd) { bd = d; best = p; } } return best; };
    let moved = false;
    const onMove = ev => {
      const dx = (ev.clientX - x0) / z;
      if (!moved && Math.abs(ev.clientX - x0) < 3 && mode === 'move') { /* vertikales Ziehen prüfen */ }
      moved = true;
      if (mode === 'move') {
        let ns = Math.max(0, orig.start + dx);
        const a = snap(ns), b = snap(ns + c.dur) - c.dur; ns = Math.abs(a - ns) <= Math.abs(b - ns) ? a : b;
        c.start = Math.max(0, ns);
        const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tl-row');
        if (row) { const t = trackById(row.dataset.track); if (t && t.id !== c.track && compatibleTrack(c.kind, t.type) && !t.lock) c.track = t.id; }
      } else if (mode === 'l') {
        const sp = c.speed || 1, maxBack = (c.kind === 'video' || c.kind === 'audio') ? Math.min(orig.in / sp, orig.start) : orig.start;
        let ns = clamp(snap(orig.start + dx), orig.start - maxBack, orig.start + orig.dur - .1);
        const delta = ns - orig.start;
        c.start = ns; c.dur = orig.dur - delta;
        if (c.kind === 'video' || c.kind === 'audio') c.in = Math.max(0, orig.in + delta * sp);
        if (c.kf) for (const p of Object.keys(orig.kf)) c.kf[p] = orig.kf[p].map(f => ({ t: f.t - delta, v: f.v }));
      } else if (mode === 'r') {
        let nd = Math.max(.1, snap(orig.start + orig.dur + dx) - orig.start);
        if ((c.kind === 'video' || c.kind === 'audio') && m && m.duration) nd = Math.min(nd, (m.duration - (c.in || 0)) / (c.speed || 1));
        c.dur = nd;
      }
      this.renderSoon(); Preview.requestRender();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      if (moved) {
        const tr = trackById(c.track);
        if (tr && tr.magnet) { const list = clipsOn(tr.id).sort((a, b) => (a.start + a.dur / 2) - (b.start + b.dur / 2)); let t = 0; for (const x of list) { x.start = t; t += x.dur; } }
        const ot = trackById(orig.track); if (ot && ot.magnet && ot.id !== c.track) packTrack(ot.id);
        commit();
      }
      this.render(); Inspector.render(); Preview.sync(false); Preview.requestRender();
    };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    this.render(); Preview.requestRender();
  },
  onDrop(e, tr, lane) {
    e.preventDefault();
    let data; try { data = JSON.parse(e.dataTransfer.getData('application/x-clipwerk')); } catch { return; }
    const t = this.timeAt(e.clientX);
    if (data.type === 'media') {
      const m = State.media.get(data.id); if (!m) return;
      if (!compatibleTrack(m.type === 'audio' ? 'audio' : m.type, tr.type)) { addMediaToTimeline(m, { start: t }); return; }
      if (tr.magnet) addMediaToTimeline(m, { start: t }); else addMediaToTimeline(m, { start: t, trackId: tr.id, overlay: tr.type === 'overlay' });
    } else if (data.type === 'text') addTextClip(data.preset, { start: t, trackId: tr.type === 'text' ? tr.id : null });
    else if (data.type === 'fx') addFxClip(data.fx, { start: t, trackId: tr.type === 'fx' ? tr.id : null });
  },
  trackMenu(e, tr) {
    menu(e.clientX, e.clientY, [
      { label: 'Spur umbenennen', icon: 'text', action: () => promptText('Spur umbenennen', tr.name, v => { tr.name = v || tr.name; commit(); this.render(); }) },
      { label: 'Spur nach oben', icon: 'stepBack', action: () => { const i = State.tracks.indexOf(tr); if (i > 0) { State.tracks.splice(i, 1); State.tracks.splice(i - 1, 0, tr); commit(); refreshAll(); } } },
      { label: 'Spur nach unten', icon: 'stepFwd', action: () => { const i = State.tracks.indexOf(tr); if (i < State.tracks.length - 1) { State.tracks.splice(i, 1); State.tracks.splice(i + 1, 0, tr); commit(); refreshAll(); } } },
      { sep: true },
      { label: 'Spur löschen', icon: 'trash', danger: true, disabled: tr.magnet, action: async () => {
        const n = clipsOn(tr.id).length;
        if (n && !(await confirmBox('Spur löschen?', `Die Spur „${tr.name}“ enthält ${n} Clip(s). Sie werden mit gelöscht.`, 'Löschen', 'danger'))) return;
        State.clips = State.clips.filter(c => c.track !== tr.id); State.tracks = State.tracks.filter(t => t !== tr); commit(); refreshAll();
      } },
    ]);
  },
  clipMenu(e, c) {
    const items = [
      { label: 'Am Abspielkopf teilen', icon: 'scissors', hint: 'S', action: () => splitAtPlayhead() },
      { label: 'Duplizieren', icon: 'copy', hint: 'Strg+D', action: () => duplicateSelected() },
    ];
    if (c.kind === 'video') items.push({ label: 'Audio abtrennen', icon: 'wave', action: () => detachAudio(c) }, { label: 'Standbild einfügen', icon: 'camera', action: () => freezeFrame(c) });
    if (c.kind === 'video' || c.kind === 'audio') items.push({ label: 'Rauschen entfernen (KI)', icon: 'sparkle', action: () => Denoise.run(c) });
    if (c.kind === 'video' || c.kind === 'image') items.push({ label: 'Hintergrund entfernen (KI)', icon: 'person', action: () => { c.bg.mode = 'person'; commit(); changed({ inspector: true }); BgRemoval.load().catch(() => { }); } });
    if (c.kind === 'video' || c.kind === 'image') {
      const tr = trackOf(c);
      if (tr && tr.type === 'video') items.push({ label: 'Auf Overlay-Spur legen', icon: 'layers', action: () => { const ot = freeTrackFor(c.kind, c.start, c.dur, 'overlay'); const old = c.track; c.track = ot.id; c.scale = c.scale === 1 ? .6 : c.scale; packTrack(old); commit(); refreshAll(); } });
      else items.push({ label: 'Auf Hauptspur legen', icon: 'film', action: () => { const old = c.track; State.clips = State.clips.filter(x => x !== c); insertOnMain(c, c.start); if (trackById(old)?.magnet) packTrack(old); commit(); refreshAll(); } });
    }
    items.push({ sep: true }, { label: 'Löschen', icon: 'trash', hint: 'Entf', danger: true, action: () => deleteSelected() });
    menu(e.clientX, e.clientY, items);
  },
  transMenu(e, c) {
    menu(e.clientX, e.clientY, Object.entries(TRANSITIONS).map(([k, v]) => ({ label: v, check: c.trans.type === k, action: () => { c.trans = { type: k, dur: c.trans.dur || .6 }; commit(); changed({ inspector: true }); } })));
  },
};

/* ---------- Kontextmenü ---------- */
function menu(x, y, items) {
  $$('.menu').forEach(m => m.remove());
  const m = el('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (it.sep) { m.append(el('div', { class: 'menu-sep' })); continue; }
    m.append(el('button', { class: 'menu-it' + (it.danger ? ' danger' : '') + (it.check ? ' checked' : ''), role: 'menuitem', disabled: !!it.disabled, onclick: () => { m.remove(); it.action && it.action(); } },
      el('span', { class: 'menu-ic', html: it.check ? icon('check') : it.icon ? icon(it.icon) : '' }), el('span', {}, it.label), it.hint ? el('kbd', {}, it.hint) : null));
  }
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  const close = (ev) => { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', close, true); } };
  setTimeout(() => document.addEventListener('pointerdown', close, true));
  const esc = ev => { if (ev.key === 'Escape') { m.remove(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
}
function promptText(title, value, cb, multiline) {
  const inp = multiline ? el('textarea', { class: 'inp', rows: 5 }, value) : el('input', { class: 'inp', value });
  modal({ title, body: el('div', {}, inp), actions: [{ label: 'Abbrechen' }, { label: 'Übernehmen', kind: 'primary', onClick: () => cb(inp.value.trim()) }] });
  setTimeout(() => { inp.focus(); inp.select && inp.select(); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !multiline) { cb(inp.value.trim()); $('.modal-wrap:last-child')?.remove(); } });
}

/* ---------- Clip-Operationen ---------- */
function splitAtPlayhead() {
  const t = State.time;
  let c = selectedClip();
  if (!c || !(t > c.start + .03 && t < clipEnd(c) - .03)) {
    c = State.clips.filter(x => t > x.start + .03 && t < clipEnd(x) - .03 && !trackOf(x)?.lock).sort((a, b) => State.tracks.indexOf(trackOf(b)) - State.tracks.indexOf(trackOf(a)))[0];
    if (!c) { toast('Setze den Abspielkopf auf einen Clip, um ihn zu teilen.', 'warn'); return; }
  }
  const local = t - c.start;
  const b = JSON.parse(JSON.stringify(c)); b.id = uid('c');
  c.dur = local; b.start = t; b.dur = b.dur - local;
  if (b.kind === 'video' || b.kind === 'audio') b.in = (c.in || 0) + local * (c.speed || 1);
  if (b.trans) b.trans = { type: 'none', dur: .6 };
  c.fadeOut = 0; if ('fadeIn' in b) b.fadeIn = 0;
  if (c.animOut) { b.animIn = 'none'; c.animOut = 'none'; }
  if (c.kf) for (const p of Object.keys(c.kf)) {
    const all = c.kf[p], vAt = kfv({ ...c, kf: { [p]: all } }, p, local);
    c.kf[p] = all.filter(f => f.t <= local); if (!c.kf[p].length) delete c.kf[p];
    b.kf[p] = all.filter(f => f.t >= local).map(f => ({ t: f.t - local, v: f.v })); if (b.kf[p].length && b.kf[p][0].t > 0) b.kf[p].unshift({ t: 0, v: vAt });
    if (!b.kf[p].length) delete b.kf[p];
  }
  State.clips.push(b); State.selected = b.id;
  commit(); refreshAll();
}
function deleteSelected() {
  const c = selectedClip(); if (!c) return;
  const tr = trackOf(c);
  State.clips = State.clips.filter(x => x !== c);
  if (tr && tr.magnet) packTrack(tr.id);
  State.selected = null; Preview.cleanupEls(); commit(); refreshAll();
}
function duplicateSelected() {
  const c = selectedClip(); if (!c) return;
  const d = JSON.parse(JSON.stringify(c)); d.id = uid('c');
  const tr = trackOf(c);
  if (tr && tr.magnet) { d.start = clipEnd(c) - .001; State.clips.push(d); const list = clipsOn(tr.id).sort((a, b) => a.start - b.start); let t = 0; for (const x of list) { x.start = t; t += x.dur; } }
  else { d.start = clipEnd(c); const t = freeTrackFor(d.kind, d.start, d.dur, null, c.track); d.track = t.id; State.clips.push(d); }
  State.selected = d.id; commit(); refreshAll();
}
function detachAudio(c) {
  const m = mediaOf(c); if (!m) return;
  const a = newClip('audio', { media: m.id, name: m.name + ' (Ton)', start: c.start, dur: c.dur, in: c.in, speed: c.speed, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut });
  placeClip(a, { start: c.start, trackId: trackByName('audio', 'Stimme')?.id, trackType: 'audio' });
  c.mute = true; commit(); refreshAll(); toast('Ton als eigener Clip auf der Audiospur.', 'ok');
}
async function freezeFrame(c) {
  const v = Preview.mediaEl(c); const m = mediaOf(c); if (!v || !m) return;
  const t = State.time; if (!(t >= c.start && t < clipEnd(c))) { toast('Setze den Abspielkopf in den Clip.', 'warn'); return; }
  v.currentTime = srcTime(c, t); await waitEvent(v, 'seeked', 5000).catch(() => { });
  const cv = mkCanvas(v.videoWidth, v.videoHeight); cv.getContext('2d').drawImage(v, 0, 0);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const im = await addMediaBlob(blob, m.name + ' – Standbild', { type: 'image' });
  splitAtPlayhead();
  const fr = clipFromMedia(im, { dur: 2, f: { ...c.f }, look: c.look, fit: c.fit, x: c.x, y: c.y, scale: c.scale, rot: c.rot });
  const tr = trackOf(c);
  if (tr && tr.magnet) insertOnMain(fr, t); else placeClip(fr, { start: t, trackType: 'overlay' });
  State.selected = fr.id; commit(); refreshAll();
}
function addTextClip(presetKey = 'tiktok', opts = {}) {
  const p = TEXT_PRESETS[presetKey] || { p: {} };
  const c = newClip('text', { dur: opts.dur || 3, ...JSON.parse(JSON.stringify(p.p)), ...(opts.extra || {}) });
  if (opts.text) c.text = opts.text; else if (!opts.extra?.text) c.text = presetKey === 'title' ? 'Dein Titel' : presetKey === 'lower' ? 'Name · Thema' : 'Dein Text hier';
  c.name = p.label || 'Text';
  placeClip(c, { start: opts.start ?? State.time, trackId: opts.trackId || trackByName('text', 'Text')?.id, trackType: 'text' });
  if (!opts.silent) { State.selected = c.id; commit(); refreshAll(); }
  return c;
}
function addFxClip(fx, opts = {}) {
  const c = newClip('fx', { fx, dur: opts.dur || (fx === 'flash' ? .6 : 2.5), amt: opts.amt ?? .6, name: FX_LIST[fx] });
  placeClip(c, { start: opts.start ?? State.time, trackId: opts.trackId, trackType: 'fx' });
  if (!opts.silent) { State.selected = c.id; commit(); refreshAll(); }
  return c;
}
