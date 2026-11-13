/* ==========================================================================
   Vorschau-Monitor: Wiedergabe, Synchronisation, Maus-Bearbeitung
   ========================================================================== */
const Preview = {
  r: null, cv: null, ov: null, els: new Map(), playing: false, t0: 0, w0: 0, raf: 0, pending: false, drag: null, guides: null,
  init() {
    this.cv = $('#cv'); this.ov = $('#ov'); this.r = new Renderer(this.cv);
    new ResizeObserver(() => this.resize()).observe($('#viewer'));
    this.ov.addEventListener('pointerdown', e => this.onDown(e));
    this.ov.addEventListener('dblclick', () => { const c = selectedClip(); if (c && c.kind === 'text') { const ta = $('#inspText'); if (ta) { ta.focus(); ta.select(); } } });
    this.ov.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    if (document.fonts) document.fonts.addEventListener('loadingdone', () => this.requestRender());
  },
  quality() { return Settings.get('previewQ', 'normal'); },
  resize() {
    if (!this.r) return;
    const vw = $('#viewer'), W = State.project.w, H = State.project.h;
    const aw = Math.max(50, vw.clientWidth - 24), ah = Math.max(50, vw.clientHeight - 24);
    const k = Math.min(aw / W, ah / H), dw = Math.floor(W * k), dh = Math.floor(H * k);
    const wrap = $('#canvasWrap'); wrap.style.width = dw + 'px'; wrap.style.height = dh + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const qf = { eco: .5, normal: .8, high: 1 }[this.quality()] || .8;
    const s = Math.min(1, (dw * dpr * qf) / W);
    this.r.resize(W, H, s);
    this.ov.width = Math.round(dw * dpr); this.ov.height = Math.round(dh * dpr);
    this.dispK = dw / W; this.dpr = dpr;
    this.requestRender();
  },
  requestRender() {
    if (this.pending || this.playing) return;
    this.pending = true;
    requestAnimationFrame(() => { this.pending = false; this.draw(); });
  },
  draw() {
    if (!this.r) return;
    try { this.r.render(State.time); } catch (e) { console.error(e); }
    this.drawOverlay();
    this.updateTime();
  },
  mediaEl(c, create = true) {
    let e = this.els.get(c.id);
    const m = mediaOf(c);
    if (!m) return null;
    if (e && e._mid !== m.id) { e.pause(); e.removeAttribute('src'); e.load(); this.els.delete(c.id); e = null; }
    if (!e && create) {
      e = document.createElement(m.type === 'video' ? 'video' : 'audio');
      e.preload = 'auto'; e.playsInline = true; e.src = m.url; e._mid = m.id;
      e.addEventListener('seeked', () => this.requestRender());
      e.addEventListener('loadeddata', () => this.requestRender());
      this.els.set(c.id, e);
    }
    return e || null;
  },
  cleanupEls() { for (const [id, e] of this.els) if (!clipById(id)) { e.pause(); e.removeAttribute('src'); e.load(); this.els.delete(id); } },
  volAt(c, local) {
    const tr = trackOf(c); if (!tr || tr.mute || c.mute) return 0;
    let v = c.volume ?? 1;
    if (c.fadeIn > 0 && local < c.fadeIn) v *= clamp(local / c.fadeIn, 0, 1);
    if (c.fadeOut > 0 && local > c.dur - c.fadeOut) v *= clamp((c.dur - local) / c.fadeOut, 0, 1);
    return clamp(v, 0, 1);
  },
  sync(playing) {
    const t = State.time;
    for (const c of State.clips) {
      if (c.kind !== 'video' && c.kind !== 'audio') continue;
      const local = t - c.start, near = local > -2.5 && local < c.dur + 1;
      let e = this.els.get(c.id);
      if (!near) { if (e && !e.paused) e.pause(); continue; }
      e = this.mediaEl(c); if (!e) continue;
      const active = local >= 0 && local < c.dur;
      const tr = trackOf(c);
      if (playing && active && !(tr && tr.hidden && c.kind === 'video')) {
        const want = (c.in || 0) + local * (c.speed || 1);
        if (e.playbackRate !== (c.speed || 1)) e.playbackRate = c.speed || 1;
        e.volume = this.volAt(c, local); e.muted = e.volume === 0;
        if (e.paused) { try { e.currentTime = want; } catch { } e.play().catch(() => { }); }
        else if (Math.abs(e.currentTime - want) > .3) e.currentTime = want;
      } else {
        if (!e.paused) e.pause();
        if (c.kind === 'video' && isVisibleAt(c, t)) {
          const want = srcTime(c, t);
          if (Math.abs(e.currentTime - want) > .02 && e.readyState >= 1) { try { e.currentTime = want; } catch { } }
        }
      }
    }
  },
  play() {
    if (this.playing) return;
    const d = projectDuration(); if (!d) return;
    if (State.time >= d - .02) State.time = 0;
    this.playing = true; this.t0 = State.time; this.w0 = performance.now();
    this.sync(true); this.updateBtn();
    const loop = () => {
      if (!this.playing) return;
      let t = this.t0 + (performance.now() - this.w0) / 1000;
      const d = projectDuration();
      if (t >= d) {
        if (State.loop && d > 0) { this.t0 = 0; this.w0 = performance.now(); t = 0; State.time = 0; this.sync(false); }
        else { State.time = d; this.pause(); return; }
      }
      State.time = t; this.sync(true);
      try { this.r.render(t); } catch (e) { console.error(e); }
      this.drawOverlay(); this.updateTime(); Timeline.updatePlayhead(true);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },
  pause() {
    this.playing = false; cancelAnimationFrame(this.raf);
    this.sync(false); this.updateBtn(); this.requestRender(); Timeline.updatePlayhead(); Inspector.live();
  },
  toggle() { this.playing ? this.pause() : this.play(); },
  seek(t) {
    State.time = clamp(t, 0, Math.max(projectDuration(), 0));
    if (this.playing) { this.t0 = State.time; this.w0 = performance.now(); this.sync(false); this.sync(true); }
    else { this.sync(false); this.requestRender(); }
    Timeline.updatePlayhead(); Inspector.live();
  },
  step(frames) { this.pause(); this.seek(Math.round(State.time * State.project.fps + frames) / State.project.fps); },
  updateBtn() { const b = $('#btnPlay'); if (b) { b.innerHTML = icon(this.playing ? 'pause' : 'play'); b.title = this.playing ? 'Pause (Leertaste)' : 'Abspielen (Leertaste)'; } },
  updateTime() {
    const tc = $('#tcNow'), td = $('#tcDur');
    if (tc) tc.textContent = fmtTC(State.time, State.project.fps);
    if (td) td.textContent = fmtTC(projectDuration(), State.project.fps);
  },
  /* ---------- Overlay: Auswahlrahmen, Hilfslinien, Sicherheitszone ---------- */
  drawOverlay() {
    const o = this.ov, x = o.getContext('2d'), k = this.dispK * this.dpr;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, o.width, o.height);
    const W = State.project.w, H = State.project.h;
    if (State.grid) {
      x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 1;
      for (let i = 1; i < 3; i++) { x.beginPath(); x.moveTo(o.width * i / 3, 0); x.lineTo(o.width * i / 3, o.height); x.moveTo(0, o.height * i / 3); x.lineTo(o.width, o.height * i / 3); x.stroke(); }
    }
    if (State.safeZone) {
      x.fillStyle = 'rgba(255,97,97,.16)'; x.strokeStyle = 'rgba(255,97,97,.6)'; x.setLineDash([6, 4]);
      const zones = W < H ? [[0, 0, W, H * .085], [W * .84, H * .36, W * .16, H * .46], [0, H * .8, W, H * .2]] : [[0, H * .86, W, H * .14], [W * .9, 0, W * .1, H * .2]];
      for (const [zx, zy, zw, zh] of zones) { x.fillRect(zx * k, zy * k, zw * k, zh * k); x.strokeRect(zx * k + .5, zy * k + .5, zw * k - 1, zh * k - 1); }
      x.setLineDash([]); x.fillStyle = 'rgba(255,255,255,.85)'; x.font = `${11 * this.dpr}px Inter, sans-serif`;
      x.fillText('App-Bedienelemente', 8 * this.dpr, (W < H ? H * .8 : H * .86) * k + 16 * this.dpr);
    }
    if (this.guides) {
      x.strokeStyle = '#ff5fd2'; x.lineWidth = 1 * this.dpr;
      if (this.guides.v) { x.beginPath(); x.moveTo(o.width / 2, 0); x.lineTo(o.width / 2, o.height); x.stroke(); }
      if (this.guides.h) { x.beginPath(); x.moveTo(0, o.height / 2); x.lineTo(o.width, o.height / 2); x.stroke(); }
    }
    const b = this.r.boxes.find(b => b.id === State.selected);
    if (b) {
      x.save(); x.translate(b.cx * k, b.cy * k); x.rotate(b.rot);
      const w = b.w * k, h = b.h * k;
      x.strokeStyle = '#ffb547'; x.lineWidth = 1.5 * this.dpr; x.strokeRect(-w / 2, -h / 2, w, h);
      x.fillStyle = '#fff'; const hs = 5 * this.dpr;
      for (const [hx, hy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { x.beginPath(); x.arc(hx * w / 2, hy * h / 2, hs, 0, Math.PI * 2); x.fill(); x.stroke(); }
      x.beginPath(); x.moveTo(0, -h / 2); x.lineTo(0, -h / 2 - 22 * this.dpr); x.stroke();
      x.beginPath(); x.arc(0, -h / 2 - 22 * this.dpr, hs, 0, Math.PI * 2); x.fillStyle = '#ffb547'; x.fill();
      x.restore();
    }
  },
  toProject(e) { const r = this.ov.getBoundingClientRect(); return { x: (e.clientX - r.left) / this.dispK, y: (e.clientY - r.top) / this.dispK }; },
  local(b, p) { const dx = p.x - b.cx, dy = p.y - b.cy, c = Math.cos(-b.rot), s = Math.sin(-b.rot); return { x: dx * c - dy * s, y: dx * s + dy * c }; },
  hitHandle(b, p) {
    const q = this.local(b, p), tol = 10 / this.dispK;
    if (Math.hypot(q.x, q.y + b.h / 2 + 22 / this.dispK) < tol * 1.3) return 'rot';
    for (const [hx, hy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (Math.hypot(q.x - hx * b.w / 2, q.y - hy * b.h / 2) < tol * 1.3) return 'scale';
    return null;
  },
  onDown(e) {
    if (e.button !== 0) return;
    const p = this.toProject(e);
    const sel = this.r.boxes.find(b => b.id === State.selected);
    let mode = sel ? this.hitHandle(sel, p) : null, target = mode ? sel : null;
    if (!target) {
      for (let i = this.r.boxes.length - 1; i >= 0; i--) {
        const b = this.r.boxes[i], q = this.local(b, p);
        const c = clipById(b.id), tr = c && trackOf(c);
        if (tr && tr.lock) continue;
        if (Math.abs(q.x) <= b.w / 2 && Math.abs(q.y) <= b.h / 2) { target = b; mode = 'move'; break; }
      }
    }
    if (!target) { if (State.selected) { State.selected = null; Inspector.render(); Timeline.render(); this.requestRender(); } return; }
    const c = clipById(target.id); if (!c) return;
    if (State.selected !== c.id) { State.selected = c.id; Inspector.render(); Timeline.render(); }
    const local = State.time - c.start;
    this.drag = { mode, c, p0: p, b: { ...target }, x: kfv(c, 'x', local), y: kfv(c, 'y', local), scale: kfv(c, 'scale', local), rot: kfv(c, 'rot', local), local };
    this.ov.setPointerCapture(e.pointerId);
    const move = (ev) => this.onMove(ev), up = () => { this.ov.removeEventListener('pointermove', move); this.ov.removeEventListener('pointerup', up); this.drag = null; this.guides = null; commit(); this.requestRender(); Inspector.render(); };
    this.ov.addEventListener('pointermove', move); this.ov.addEventListener('pointerup', up);
    this.requestRender();
  },
  onMove(e) {
    const d = this.drag; if (!d) return;
    const p = this.toProject(e), W = State.project.w, H = State.project.h, c = d.c;
    if (d.mode === 'move') {
      let nx = d.x + (p.x - d.p0.x) / W, ny = d.y + (p.y - d.p0.y) / H;
      this.guides = {};
      if (!e.altKey) { if (Math.abs(nx - .5) < .012) { nx = .5; this.guides.v = true; } if (Math.abs(ny - .5) < .008) { ny = .5; this.guides.h = true; } }
      setProp(c, 'x', +nx.toFixed(4), d.local); setProp(c, 'y', +ny.toFixed(4), d.local);
    } else if (d.mode === 'scale') {
      const r0 = Math.hypot(d.p0.x - d.b.cx, d.p0.y - d.b.cy), r1 = Math.hypot(p.x - d.b.cx, p.y - d.b.cy);
      setProp(c, 'scale', +clamp(d.scale * r1 / Math.max(1, r0), .05, 8).toFixed(3), d.local);
    } else if (d.mode === 'rot') {
      let a = Math.atan2(p.y - d.b.cy, p.x - d.b.cx) * 180 / Math.PI + 90;
      if (a > 180) a -= 360;
      if (!e.shiftKey) for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(a - s) < 4) a = s;
      setProp(c, 'rot', Math.round(a), d.local);
    }
    this.requestRender(); Inspector.live();
  },
  onWheel(e) {
    const c = selectedClip(); if (!c || !isVisualKind(c.kind)) return;
    e.preventDefault();
    const local = State.time - c.start, s = kfv(c, 'scale', local);
    setProp(c, 'scale', +clamp(s * (e.deltaY < 0 ? 1.05 : .95), .05, 8).toFixed(3), local);
    this.requestRender(); Inspector.live(); this._wc = this._wc || debounce(() => commit(), 400); this._wc();
  },
  snapshotPNG() {
    const W = State.project.w, H = State.project.h, cv = mkCanvas(), r = new Renderer(cv);
    r.resize(W, H, 1); r.render(State.time);
    cv.toBlob(b => { if (b) download(b, `${safeName(State.project.name)}-standbild.png`); }, 'image/png');
  },
};
