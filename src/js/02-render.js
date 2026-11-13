/* ==========================================================================
   Render-Engine: zeichnet einen Zeitpunkt des Projekts auf ein Canvas
   ========================================================================== */
function mkCanvas(w = 2, h = 2) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const NOISE = (() => {
  const c = mkCanvas(256, 256), x = c.getContext('2d'), d = x.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); return c;
})();
const SCANLINES = (() => { const c = mkCanvas(4, 4), x = c.getContext('2d'); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 0, 4, 2); return c; })();

/* Farb-Matrix (Temperatur + verblasste Schwarztöne) als SVG-Filter, im Canvas per url(#id) nutzbar */
const ColorMatrix = {
  made: new Set(),
  id(temp, fade) {
    temp = Math.round(temp / 2) * 2; fade = Math.round(fade / 2) * 2;
    if (!temp && !fade) return '';
    const id = `cwcm_${temp}_${fade}`.replace(/-/g, 'm');
    if (!this.made.has(id)) {
      const k = temp / 100, f = fade / 100;
      const sc = 1 - .28 * f, off = .13 * f;
      const r = (1 + .14 * k) * sc, g = (1 + .03 * k) * sc, b = (1 - .16 * k) * sc;
      const vals = `${r} 0 0 0 ${off + .03 * k}  0 ${g} 0 0 ${off}  0 0 ${b} 0 ${off - .03 * k}  0 0 0 1 0`;
      const svg = $('#cwFilters');
      svg.insertAdjacentHTML('beforeend', `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${vals}"/></filter>`);
      this.made.add(id);
    }
    return `url(#${id})`;
  },
};
function filterString(f, extraBlur, s) {
  if (!f) return extraBlur ? `blur(${extraBlur * s}px)` : 'none';
  const parts = [];
  const cm = ColorMatrix.id(f.temp || 0, f.fade || 0); if (cm) parts.push(cm);
  if (f.bright) parts.push(`brightness(${1 + f.bright / 100})`);
  if (f.contrast) parts.push(`contrast(${1 + f.contrast / 100})`);
  if (f.sat) parts.push(`saturate(${Math.max(0, 1 + f.sat / 100)})`);
  if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.sepia) parts.push(`sepia(${f.sepia / 100})`);
  const bl = (f.blur || 0) * .3 + (extraBlur || 0);
  if (bl > 0.05) parts.push(`blur(${bl * s}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

/* Sichtbarkeit / Übergänge */
function transWindow(c) {
  if (!c.trans || c.trans.type === 'none') return null;
  const prev = State.clips.find(p => p.track === c.track && p !== c && Math.abs(clipEnd(p) - c.start) < .05);
  if (!prev) return null;
  const d = Math.min(c.trans.dur || .6, prev.dur, c.dur);
  return { a: prev, b: c, d, t0: c.start - d / 2, t1: c.start + d / 2 };
}
function findTransition(tid, t) {
  for (const c of State.clips) {
    if (c.track !== tid || !c.trans || c.trans.type === 'none') continue;
    const w = transWindow(c);
    if (w && t >= w.t0 && t < w.t1) return { ...w, p: (t - w.t0) / w.d, type: c.trans.type };
  }
  return null;
}
function isVisibleAt(c, t) {
  if (t >= c.start && t < clipEnd(c)) return true;
  const tr = findTransition(c.track, t);
  return !!(tr && (tr.a === c || tr.b === c));
}
function srcTime(c, t) { const local = clamp(t - c.start, 0, Math.max(0, c.dur - 1 / 120)); return (c.in || 0) + local * (c.speed || 1); }
function visualTracksBottomUp() { return State.tracks.filter(t => t.type !== 'audio').slice().reverse(); }

/* Zustand eines visuellen Clips (Keyframes + Animationen + Ken-Burns) */
function clipState(c, local, W, H) {
  let x = kfv(c, 'x', local) * W, y = kfv(c, 'y', local) * H, s = kfv(c, 'scale', local), rot = kfv(c, 'rot', local) * Math.PI / 180, a = kfv(c, 'opacity', local), blur = 0;
  const p = c.dur > 0 ? clamp(local / c.dur, 0, 1) : 0;
  if (c.kb && c.kb !== 'none') {
    const e = Ease.inOut(p);
    switch (c.kb) {
      case 'zoomIn': s *= 1 + .18 * e; break;
      case 'zoomOut': s *= 1.18 - .18 * e; break;
      case 'panL': s *= 1.16; x += (.06 - .12 * e) * W; break;
      case 'panR': s *= 1.16; x += (-.06 + .12 * e) * W; break;
      case 'panU': s *= 1.16; y += (.05 - .1 * e) * H; break;
      case 'panD': s *= 1.16; y += (-.05 + .1 * e) * H; break;
    }
  }
  const ad = Math.min(c.animDur || .5, c.dur / 2);
  const apply = (type, r, isIn) => {
    const q = isIn ? 1 - Ease.out(r) : Ease.in(r);
    switch (type) {
      case 'fade': a *= 1 - q; break;
      case 'slideL': x -= q * W * .75; a *= 1 - q * .4; break;
      case 'slideR': x += q * W * .75; a *= 1 - q * .4; break;
      case 'slideU': y += q * H * .35; a *= 1 - q; break;
      case 'slideD': y -= q * H * .35; a *= 1 - q; break;
      case 'zoomIn': s *= 1 - .65 * q; a *= 1 - q; break;
      case 'zoomOut': s *= 1 + .7 * q; a *= 1 - q; break;
      case 'pop': s *= isIn ? Math.max(.001, Ease.back(r)) : Math.max(.001, 1 - Ease.in(r)); if (!isIn) a *= 1 - r * .3; break;
      case 'spin': rot += q * Math.PI * (isIn ? -1 : 1); s *= 1 - .7 * q; a *= 1 - q; break;
      case 'blur': blur += q * 30; a *= 1 - q * .7; break;
      case 'bounce': if (isIn) { y -= (1 - Ease.bounce(r)) * H * .35; } else { y += Ease.in(r) * H * .4; a *= 1 - r; } break;
    }
  };
  if (c.animIn && c.animIn !== 'none' && local < ad) apply(c.animIn, clamp(local / ad, 0, 1), true);
  if (c.animOut && c.animOut !== 'none' && local > c.dur - ad) apply(c.animOut, clamp((local - (c.dur - ad)) / ad, 0, 1), false);
  return { x, y, s, rot, a: clamp(a, 0, 1), blur };
}

/* Text-Layout */
function textFont(c, size) { return `${c.italic ? 'italic ' : ''}${c.weight || 400} ${size}px "${c.font}", "Segoe UI", Arial, sans-serif`; }
function layoutText(ctx, c, size, maxW) {
  ctx.font = textFont(c, size);
  try { ctx.letterSpacing = (c.spacing || 0) * size / 100 + 'px'; } catch { }
  const raw = c.upper ? (c.text || '').toUpperCase() : (c.text || '');
  const space = Math.max(ctx.measureText(' ').width, size * .3);
  const lines = []; let wi = 0;
  for (const para of raw.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = { words: [], w: 0 };
    for (const w of words) {
      const ww = ctx.measureText(w).width;
      const nw = line.words.length ? line.w + space + ww : ww;
      if (line.words.length && nw > maxW) { lines.push(line); line = { words: [], w: 0 }; }
      line.words.push({ t: w, w: ww, i: wi++ }); line.w = line.words.length > 1 ? line.w + space + ww : ww;
    }
    lines.push(line);
  }
  return { lines, space, nWords: wi };
}

class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.L = [mkCanvas(), mkCanvas()]; this.T = [mkCanvas(), mkCanvas(), mkCanvas()];
    this.sources = null; this.boxes = []; this.exportMode = false; this.s = 1;
  }
  resize(W, H, s) {
    this.W = W; this.H = H; this.s = s;
    const pw = Math.max(2, Math.round(W * s)), ph = Math.max(2, Math.round(H * s));
    this.pw = pw; this.ph = ph;
    for (const c of [this.cv, ...this.L, ...this.T]) if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
  }
  source(c) {
    if (this.sources && this.sources.has(c.id)) return this.sources.get(c.id);
    const m = mediaOf(c); if (!m) return null;
    if (m.type === 'image') return m.img || null;
    if (m.type === 'video') { const v = Preview.mediaEl(c, false); return v && v.readyState >= 2 ? v : null; }
    return null;
  }
  render(t) {
    const { ctx, W, H, s } = this;
    this.t = t; this.fi = Math.floor(t * State.project.fps);
    this.boxes = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.fillStyle = State.project.bg || '#000'; ctx.fillRect(0, 0, this.pw, this.ph);
    for (const tr of visualTracksBottomUp()) {
      if (tr.hidden) continue;
      if (tr.type === 'fx') {
        for (const c of State.clips) if (c.track === tr.id && t >= c.start && t < clipEnd(c)) this.applyFx(c, t - c.start, t);
        continue;
      }
      const trn = findTransition(tr.id, t);
      const active = State.clips.filter(c => c.track === tr.id && t >= c.start && t < clipEnd(c) && !(trn && (c === trn.a || c === trn.b))).sort((a, b) => a.start - b.start);
      if (trn) {
        const okA = this.drawClip(this.L[0], trn.a, t - trn.a.start);
        const okB = this.drawClip(this.L[1], trn.b, t - trn.b.start);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.composeTransition(trn.type, trn.p, okA ? this.L[0] : null, okB ? this.L[1] : null);
      }
      for (const c of active) {
        if (this.drawClip(this.L[0], c, t - c.start)) this.blit(this.L[0], c, t - c.start);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
  }
  drawClip(L, c, local) {
    const x = L.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.filter = 'none';
    x.clearRect(0, 0, this.pw, this.ph);
    x.setTransform(this.s, 0, 0, this.s, 0, 0);
    if (c.kind === 'text') return this.drawText(x, c, local);
    return this.drawMedia(x, c, local);
  }
  drawMedia(x, c, local) {
    let src = this.source(c); if (!src) return false;
    let sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height;
    if (!sw || !sh) return false;
    if (c.bg && c.bg.mode !== 'none') {
      const p = BgRemoval.process(c, src, sw, sh, this.exportMode);
      if (p) { src = p; }
    }
    const { W, H } = this;
    const st = clipState(c, local, W, H);
    const fit = c.fit === 'contain' ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh);
    const dw = sw * fit, dh = sh * fit;
    x.globalAlpha = st.a;
    x.translate(st.x, st.y); x.rotate(st.rot); x.scale(st.s * (c.flipH ? -1 : 1), st.s * (c.flipV ? -1 : 1));
    x.filter = filterString(c.f, st.blur, this.s * st.s);
    x.drawImage(src, -dw / 2, -dh / 2, dw, dh);
    x.filter = 'none';
    const f = c.f || {};
    if (f.vign > 0) {
      x.globalCompositeOperation = 'source-atop';
      const g = x.createRadialGradient(0, 0, Math.min(dw, dh) * .22, 0, 0, Math.hypot(dw, dh) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${f.vign / 100 * .9})`);
      x.fillStyle = g; x.fillRect(-dw / 2, -dh / 2, dw, dh);
    }
    if (f.grain > 0) {
      x.globalCompositeOperation = 'source-atop'; x.globalAlpha = st.a * f.grain / 100 * .32;
      const pat = x.createPattern(NOISE, 'repeat'); const o = seeded(this.fi) * 256, k = 1 / Math.max(.05, this.s * st.s);
      try { pat.setTransform(new DOMMatrix().translate(o * k, o * k).scale(k, k)); } catch { }
      x.fillStyle = pat; x.fillRect(-dw / 2, -dh / 2, dw, dh);
    }
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    this.boxes.push({ id: c.id, cx: st.x, cy: st.y, w: dw * st.s, h: dh * st.s, rot: st.rot });
    return true;
  }
  drawText(x, c, local) {
    const { W, H } = this;
    const u = Math.min(W, H) / 1080, size = Math.max(4, c.size * u);
    const maxW = (c.boxW || .86) * W;
    const L = layoutText(x, c, size, maxW);
    const lh = size * (c.lineH || 1.15), blockH = L.lines.length * lh;
    const st = clipState(c, local, W, H);
    if (st.a <= 0.001) return false;
    const ta = c.tAnim || 'none';
    let alpha = st.a;
    if (ta === 'flicker') { const k = Math.floor(local * 14); if (local < 1.2 && seeded(k + c.start * 10) < .45) alpha *= .25; else if (seeded(k * 3.1) < .04) alpha *= .55; }
    x.globalAlpha = alpha;
    x.translate(st.x, st.y); x.rotate(st.rot); x.scale(st.s * (c.flipH ? -1 : 1), st.s * (c.flipV ? -1 : 1));
    if (st.blur > .05) x.filter = `blur(${st.blur * this.s}px)`;
    x.textBaseline = 'middle'; x.lineJoin = 'round'; x.miterLimit = 2;
    const total = L.nWords;
    const totalChars = L.lines.reduce((s, l) => s + l.words.reduce((a, w) => a + w.t.length + 1, 0), 0);
    let charsLeft = Infinity;
    if (ta === 'typewriter') { const d = Math.min(c.dur * .75, totalChars * .045 + .15); charsLeft = Math.floor(clamp(local / d, 0, 1) * totalChars); }
    const wordSpan = Math.min(c.dur * .85, total * .28);
    const kIdx = ta === 'karaoke' ? Math.min(total - 1, Math.floor(local / (c.dur / Math.max(1, total)))) : -1;
    const maxLineW = Math.max(...L.lines.map(l => l.w), 1);
    const padX = size * .28, padY = size * .14, rad = size * .18;
    if (c.bgOn) {
      x.save(); x.fillStyle = rgba(c.bgColor, c.bgAlpha ?? .6);
      L.lines.forEach((ln, li) => {
        if (!ln.words.length) return;
        const ly = -blockH / 2 + lh * (li + .5);
        const lx = c.align === 'left' ? -maxLineW / 2 : c.align === 'right' ? maxLineW / 2 - ln.w : -ln.w / 2;
        x.beginPath(); x.roundRect(lx - padX, ly - lh / 2 - padY * .2, ln.w + padX * 2, lh + padY * .4, rad); x.fill();
      });
      x.restore();
    }
    const sScale = this.s * st.s;
    L.lines.forEach((ln, li) => {
      const ly = -blockH / 2 + lh * (li + .5);
      let lx = c.align === 'left' ? -maxLineW / 2 : c.align === 'right' ? maxLineW / 2 - ln.w : -ln.w / 2;
      for (const w of ln.words) {
        let txt = w.t, wx = lx, wy = ly, ws = 1, wa = 1, color = c.color;
        if (ta === 'typewriter') { if (charsLeft <= 0) txt = ''; else if (charsLeft < txt.length) txt = txt.slice(0, charsLeft); charsLeft -= w.t.length + 1; }
        else if (ta === 'wordpop' || ta === 'rise' || ta === 'bounce') {
          const t0 = total > 1 ? (w.i / total) * wordSpan : 0, r = clamp((local - t0) / .28, 0, 1);
          if (r <= 0) { lx += w.w + L.space; continue; }
          if (ta === 'wordpop') ws = Math.max(.01, Ease.back(r));
          if (ta === 'rise') { wy += (1 - Ease.out(r)) * size * .8; wa = r; }
          if (ta === 'bounce') { wy -= (1 - Ease.bounce(r)) * size * 1.2; }
        } else if (ta === 'karaoke') { if (w.i === kIdx) { color = c.hl || '#FFD43B'; ws = 1.1; } }
        else if (ta === 'wave') { wy += Math.sin(local * 5 + w.i * .7) * size * .12; }
        if (txt) {
          x.save(); x.translate(wx + w.w / 2, wy); x.scale(ws, ws); x.globalAlpha = alpha * wa;
          const tw = x.measureText(txt).width; const dx = -w.w / 2 + (txt.length < w.t.length ? 0 : (w.w - tw) / 2);
          if (c.strokeW > 0) { x.strokeStyle = c.stroke; x.lineWidth = c.strokeW * u * 2; x.strokeText(txt, dx, 0); }
          if (c.glow) { x.shadowColor = color; x.shadowBlur = size * .45 * sScale; x.fillStyle = color; x.fillText(txt, dx, 0); x.fillText(txt, dx, 0); x.shadowBlur = size * .15 * sScale; }
          else if (c.shadow) { x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = size * .14 * sScale; x.shadowOffsetY = size * .05 * sScale; }
          x.fillStyle = color; x.fillText(txt, dx, 0);
          x.restore();
        }
        lx += w.w + L.space;
      }
    });
    x.filter = 'none';
    this.boxes.push({ id: c.id, cx: st.x, cy: st.y, w: (maxLineW + padX * 2) * st.s, h: (blockH + padY) * st.s, rot: st.rot });
    return true;
  }
  /* Ebene mit Clip-Effekt und Mischmodus auf das Hauptbild bringen */
  blit(L, c, local) {
    const ctx = this.ctx, w = this.pw, h = this.ph, amt = c.effAmt ?? .6, fi = this.fi;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = c.blend || 'source-over';
    switch (c.effect) {
      case 'shake': { const k = w * .03 * amt; ctx.drawImage(L, (seeded(fi * 1.7) - .5) * k, (seeded(fi * 2.3) - .5) * k); break; }
      case 'glitch': ctx.drawImage(L, 0, 0); if (seeded(fi * .9) < .25 + amt * .5) { this.glitchSlices(ctx, L, amt, fi); if (seeded(fi * 5.1) < .5) this.rgbSplit(ctx, L, w * .015 * amt); } break;
      case 'rgb': this.rgbSplit(ctx, L, w * (.006 + .012 * amt) * (1 + Math.sin(local * 7) * .4)); break;
      case 'vhs': { this.rgbSplit(ctx, L, w * .005 * (1 + amt)); const p = ctx.createPattern(SCANLINES, 'repeat'); ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = .5 * amt; ctx.fillStyle = p; ctx.fillRect(0, 0, w, h); break; }
      case 'pulse': { const k = 1 + .07 * amt * Math.exp(-((local * 2) % 1) * 5); ctx.translate(w / 2, h / 2); ctx.scale(k, k); ctx.drawImage(L, -w / 2, -h / 2); break; }
      case 'glow': ctx.drawImage(L, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .55 * amt; ctx.filter = `blur(${Math.max(2, w * .012 * amt)}px)`; ctx.drawImage(L, 0, 0); break;
      case 'blink': ctx.globalAlpha = Math.floor(local * (4 + amt * 8)) % 2 ? .15 : 1; ctx.drawImage(L, 0, 0); break;
      default: ctx.drawImage(L, 0, 0);
    }
    ctx.restore();
  }
  glitchSlices(ctx, src, amt, fi) {
    const w = this.pw, h = this.ph, n = 3 + Math.floor(seeded(fi + 1) * 6);
    for (let i = 0; i < n; i++) {
      const sy = seeded(fi * 7 + i) * h, sh = seeded(fi * 11 + i) * h * .07 + 2, dx = (seeded(fi * 13 + i) - .5) * w * .16 * amt;
      ctx.drawImage(src, 0, sy, w, sh, dx, sy, w, sh);
    }
  }
  rgbSplit(ctx, src, off) {
    const w = this.pw, h = this.ph;
    const tint = (C, color, dx) => {
      const a = C.getContext('2d'); a.setTransform(1, 0, 0, 1, 0, 0); a.globalAlpha = 1; a.filter = 'none';
      a.globalCompositeOperation = 'source-over'; a.clearRect(0, 0, w, h); a.drawImage(src, dx, 0);
      a.globalCompositeOperation = 'multiply'; a.fillStyle = color; a.fillRect(0, 0, w, h);
      a.globalCompositeOperation = 'destination-in'; a.drawImage(src, dx, 0); a.globalCompositeOperation = 'source-over';
    };
    tint(this.T[1], '#ff0000', off); tint(this.T[2], '#00ffff', -off);
    const op = ctx.globalCompositeOperation;
    ctx.drawImage(this.T[1], 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(this.T[2], 0, 0); ctx.globalCompositeOperation = op;
  }
  composeTransition(type, p, A, B) {
    const ctx = this.ctx, w = this.pw, h = this.ph, e = Ease.inOut(p);
    const draw = (L, o = {}) => {
      if (!L) return; ctx.save(); ctx.globalAlpha = o.a ?? 1; if (o.f) ctx.filter = o.f;
      ctx.translate(w / 2 + (o.dx || 0), h / 2 + (o.dy || 0)); ctx.rotate(o.r || 0); const s = o.s ?? 1; ctx.scale(s, s);
      ctx.drawImage(L, -w / 2, -h / 2); ctx.restore();
    };
    switch (type) {
      case 'fade': draw(A, { a: 1 - (B ? 0 : e) }); draw(B, { a: e }); break;
      case 'black': case 'white': { draw(p < .5 ? A : B); ctx.save(); ctx.globalAlpha = 1 - Math.abs(p - .5) * 2; ctx.fillStyle = type === 'black' ? '#000' : '#fff'; ctx.fillRect(0, 0, w, h); ctx.restore(); break; }
      case 'slideL': draw(A, { dx: -e * w }); draw(B, { dx: (1 - e) * w }); break;
      case 'slideR': draw(A, { dx: e * w }); draw(B, { dx: -(1 - e) * w }); break;
      case 'slideU': draw(A, { dy: -e * h }); draw(B, { dy: (1 - e) * h }); break;
      case 'zoomIn': draw(A, { s: 1 + e * .7, a: 1 - e }); draw(B, { s: .6 + .4 * e, a: e }); break;
      case 'zoomOut': draw(A, { s: 1 - e * .45, a: 1 - e }); draw(B, { s: 1.5 - .5 * e, a: e }); break;
      case 'wipe': draw(A); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w * e, h); ctx.clip(); draw(B); ctx.restore(); break;
      case 'circle': draw(A); ctx.save(); ctx.beginPath(); ctx.arc(w / 2, h / 2, e * Math.hypot(w, h) / 2, 0, Math.PI * 2); ctx.clip(); draw(B); ctx.restore(); break;
      case 'blur': draw(A, { f: `blur(${e * w * .03}px)` }); draw(B, { a: e, f: `blur(${(1 - e) * w * .03}px)` }); break;
      case 'glitch': { const L = p < .5 ? A : B; draw(L); const k = 1 - Math.abs(p - .5) * 2; if (L && k > .15) { this.glitchSlices(ctx, L, k, this.fi); this.rgbSplit(ctx, L, w * .02 * k); } break; }
      case 'spin': draw(A, { r: e * Math.PI, s: Math.max(.01, 1 - e), a: 1 - e * .5 }); draw(B, { r: (e - 1) * Math.PI, s: Math.max(.01, e), a: e }); break;
      default: draw(p < .5 ? A : B);
    }
  }
  /* Effekte auf der Effekt-Spur wirken auf alles darunter */
  applyFx(c, local, t) {
    const ctx = this.ctx, w = this.pw, h = this.ph, amt = c.amt ?? .6, fi = this.fi, d = c.dur || 1;
    const copy = () => { const T = this.T[0], x = T.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'copy'; x.filter = 'none'; x.drawImage(this.cv, 0, 0); x.globalCompositeOperation = 'source-over'; return T; };
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const scaled = (T, k, dx = 0, dy = 0) => { ctx.translate(w / 2 + dx, h / 2 + dy); ctx.scale(k, k); ctx.drawImage(T, -w / 2, -h / 2); };
    switch (c.fx) {
      case 'shake': { const T = copy(), k = w * .035 * amt; scaled(T, 1 + .05 * amt, (seeded(fi * 1.3) - .5) * k, (seeded(fi * 2.9) - .5) * k); break; }
      case 'zoompulse': { const T = copy(); scaled(T, 1 + .09 * amt * Math.exp(-((local * 2) % 1) * 6)); break; }
      case 'zoomslow': { const T = copy(); scaled(T, 1 + .25 * amt * Ease.inOut(clamp(local / d, 0, 1))); break; }
      case 'glitch': { const T = copy(); if (seeded(fi * 1.1) < .3 + amt * .5) { this.glitchSlices(ctx, T, amt, fi); if (seeded(fi * 3.3) < .6) this.rgbSplit(ctx, T, w * .018 * amt); } break; }
      case 'rgb': { const T = copy(); this.rgbSplit(ctx, T, w * (.006 + .014 * amt) * (1 + Math.sin(local * 6) * .5)); break; }
      case 'vhs': {
        const T = copy(); ctx.drawImage(T, 0, 0); this.rgbSplit(ctx, T, w * .006 * (1 + amt));
        ctx.globalAlpha = .45 * amt; ctx.fillStyle = ctx.createPattern(SCANLINES, 'repeat'); ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = .12 * amt; ctx.globalCompositeOperation = 'overlay'; ctx.drawImage(NOISE, seeded(fi) * -200, seeded(fi * 2) * -200, w + 400, h + 400);
        const ty = ((local * .35) % 1) * h; ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = .25 * amt; ctx.fillStyle = '#fff'; ctx.fillRect(0, ty, w, h * .006);
        break;
      }
      case 'flash': { const k = Math.pow(1 - clamp(local / Math.min(d, .6), 0, 1), 2) * amt; ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.fillRect(0, 0, w, h); break; }
      case 'bw': { const T = copy(); ctx.globalCompositeOperation = 'copy'; ctx.filter = `grayscale(${amt}) contrast(${1 + .15 * amt})`; ctx.drawImage(T, 0, 0); break; }
      case 'blur': { const T = copy(); ctx.filter = `blur(${amt * w * .02}px)`; scaled(T, 1.04); break; }
      case 'letterbox': { const r = Math.min(1, local / .4, (d - local) / .4); const bh = h * .12 * amt * Ease.out(clamp(r, 0, 1)); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, bh); ctx.fillRect(0, h - bh, w, bh); break; }
      case 'vignette': { const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .25, w / 2, h / 2, Math.hypot(w, h) / 2); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${.95 * amt})`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); break; }
      case 'grain': { ctx.globalAlpha = .28 * amt; ctx.globalCompositeOperation = 'overlay'; const o = seeded(fi) * 256; ctx.fillStyle = ctx.createPattern(NOISE, 'repeat'); ctx.translate(-o, -o); ctx.fillRect(0, 0, w + 256, h + 256); break; }
      case 'lightleak': {
        ctx.globalCompositeOperation = 'screen';
        const blobs = [['255,140,60', .2, .25], ['255,70,120', .8, .7], ['255,210,120', .5, .1]];
        blobs.forEach(([col, bx, by], i) => {
          const cx = (bx + Math.sin(local * .7 + i * 2) * .25) * w, cy = (by + Math.cos(local * .5 + i) * .2) * h, r = Math.max(w, h) * (.35 + .1 * Math.sin(local + i));
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${col},${.55 * amt})`); g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        }); break;
      }
      case 'confetti': case 'snow': case 'sparkle': case 'hearts': this.particles(ctx, c.fx, local, amt); break;
      case 'fadein': ctx.fillStyle = `rgba(0,0,0,${clamp(1 - local / d, 0, 1)})`; ctx.fillRect(0, 0, w, h); break;
      case 'fadeout': ctx.fillStyle = `rgba(0,0,0,${clamp(local / d, 0, 1)})`; ctx.fillRect(0, 0, w, h); break;
      case 'mirror': { const T = copy(); ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(T, 0, 0, w / 2, h, 0, 0, w / 2, h); break; }
      case 'disco': { const T = copy(); ctx.globalCompositeOperation = 'copy'; ctx.filter = `hue-rotate(${(local * 240 * amt) % 360}deg) saturate(${1 + .6 * amt})`; ctx.drawImage(T, 0, 0); break; }
      case 'progress': { const p = clamp(local / d, 0, 1), bh = Math.max(3, h * .008); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, h - bh, w, bh); ctx.fillStyle = '#ffb547'; ctx.fillRect(0, h - bh, w * p, bh); break; }
    }
    ctx.restore();
  }
  particles(ctx, kind, t, amt) {
    const w = this.pw, h = this.ph, n = Math.round((kind === 'sparkle' ? 40 : 90) * (.3 + amt));
    const pal = ['#ffb547', '#ff5f8f', '#5fd4ff', '#8e9bff', '#6bf2a4', '#fff36b'];
    for (let i = 0; i < n; i++) {
      const r1 = seeded(i + 1), r2 = seeded(i + 31), r3 = seeded(i + 77), r4 = seeded(i + 113), r5 = seeded(i + 151);
      ctx.save();
      if (kind === 'confetti') {
        const sp = (.18 + .3 * r2) * h, y = ((r3 * h * 1.3 + t * sp) % (h * 1.3)) - h * .15, x = r1 * w + Math.sin(t * (1 + r4 * 2) + i) * w * .03, sz = w * (.008 + .008 * r5);
        ctx.translate(x, y); ctx.rotate(t * (2 + r5 * 5) + i); ctx.scale(Math.cos(t * (3 + r4 * 4) + i), 1); ctx.fillStyle = pal[i % pal.length]; ctx.fillRect(-sz, -sz * .5, sz * 2, sz);
      } else if (kind === 'snow') {
        const sp = (.05 + .1 * r2) * h, y = ((r3 * h * 1.2 + t * sp) % (h * 1.2)) - h * .1, x = r1 * w + Math.sin(t * (.5 + r4) + i) * w * .04, sz = w * (.003 + .006 * r5);
        ctx.globalAlpha = .5 + .5 * r4; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.fill();
      } else if (kind === 'sparkle') {
        const a = Math.pow(Math.max(0, Math.sin(t * (2 + r2 * 3) + i * 1.7)), 6); if (a < .02) { ctx.restore(); continue; }
        const x = r1 * w, y = r3 * h, sz = w * (.012 + .02 * r5) * a;
        ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff6c2'; ctx.shadowBlur = sz * 2; ctx.translate(x, y); ctx.rotate(r4);
        ctx.beginPath(); for (let k = 0; k < 8; k++) { const rr = k % 2 ? sz * .22 : sz; ctx.lineTo(Math.cos(k * Math.PI / 4) * rr, Math.sin(k * Math.PI / 4) * rr); } ctx.closePath(); ctx.fill();
      } else if (kind === 'hearts') {
        const sp = (.1 + .15 * r2) * h, y = h * 1.1 - ((r3 * h * 1.3 + t * sp) % (h * 1.3)), x = r1 * w + Math.sin(t * (1 + r4) + i) * w * .03, sz = w * (.012 + .016 * r5);
        ctx.globalAlpha = clamp(y / h, 0, 1) * .9; ctx.fillStyle = i % 3 ? '#ff4f7b' : '#ff9ab3'; ctx.translate(x, y); ctx.scale(sz / 10, sz / 10);
        ctx.beginPath(); ctx.moveTo(0, 3); ctx.bezierCurveTo(0, 0, -5, -2, -5, 2); ctx.bezierCurveTo(-5, 6, 0, 8, 0, 11); ctx.bezierCurveTo(0, 8, 5, 6, 5, 2); ctx.bezierCurveTo(5, -2, 0, 0, 0, 3); ctx.fill();
      }
      ctx.restore();
    }
  }
}

/* ==========================================================================
   Hintergrund entfernen: Person (KI, MediaPipe) oder Farbschlüssel (Greenscreen)
   ========================================================================== */
const MP_VER = '1.1.1';
const BgRemoval = {
  seg: null, loading: null, failed: null, cache: new Map(),
  work: mkCanvas(), mask: mkCanvas(), out: new Map(),
  load() {
    if (this.seg) return Promise.resolve(this.seg);
    if (this.loading) return this.loading;
    this.loading = (async () => {
      toast('KI-Freistellung wird geladen (einmalig, ca. 10 MB) …', 'info');
      const base = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
      const vision = await import(`${base}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
      const opts = (delegate) => ({ baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite', delegate }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false });
      try { this.seg = await vision.ImageSegmenter.createFromOptions(fileset, opts('GPU')); }
      catch { this.seg = await vision.ImageSegmenter.createFromOptions(fileset, opts('CPU')); }
      toast('KI-Freistellung bereit.', 'ok');
      Preview.requestRender();
      return this.seg;
    })().catch(e => { this.failed = e; this.loading = null; toast('Freistellung konnte nicht geladen werden. Bitte Internetverbindung prüfen.', 'error'); throw e; });
    return this.loading;
  },
  outCanvas(id) { let c = this.out.get(id); if (!c) { c = mkCanvas(); this.out.set(id, c); } return c; },
  process(c, src, sw, sh, exportMode) {
    const bg = c.bg; const cap = exportMode ? 1920 : 960;
    const k = Math.min(1, cap / Math.max(sw, sh)), ow = Math.round(sw * k), oh = Math.round(sh * k);
    const key = `${src.currentTime ?? 'i'}|${bg.mode}|${bg.color}|${bg.tol}|${bg.soft}|${bg.invert}|${ow}`;
    const cached = this.cache.get(c.id);
    if (!exportMode && cached && cached.key === key) return cached.canvas;
    const O = this.outCanvas(c.id); if (O.width !== ow || O.height !== oh) { O.width = ow; O.height = oh; }
    const o = O.getContext('2d', { willReadFrequently: bg.mode === 'chroma' });
    o.globalCompositeOperation = 'copy'; o.drawImage(src, 0, 0, ow, oh); o.globalCompositeOperation = 'source-over';
    if (bg.mode === 'chroma') this.chroma(o, ow, oh, bg);
    else if (bg.mode === 'person') {
      if (!this.seg) { if (!this.failed) this.load().catch(() => { }); return src; }
      const mk = Math.min(1, 320 / Math.max(ow, oh)), mw = Math.max(16, Math.round(ow * mk)), mh = Math.max(16, Math.round(oh * mk));
      const Wc = this.work; if (Wc.width !== mw || Wc.height !== mh) { Wc.width = mw; Wc.height = mh; }
      Wc.getContext('2d').drawImage(src, 0, 0, mw, mh);
      let ok = false;
      try {
        this.seg.segment(Wc, (res) => {
          const ms = res.confidenceMasks || []; if (!ms.length) return;
          const m = ms.length === 2 ? ms[1] : ms[0]; const inv = ms.length > 2;
          const data = m.getAsFloat32Array(), w = m.width, h = m.height;
          const M = this.mask; if (M.width !== w || M.height !== h) { M.width = w; M.height = h; }
          const mx = M.getContext('2d'), id = mx.createImageData(w, h);
          for (let i = 0; i < data.length; i++) { let a = inv ? 1 - data[i] : data[i]; if (bg.invert) a = 1 - a; a = clamp((a - .3) / .4, 0, 1); id.data[i * 4 + 3] = a * 255; }
          mx.putImageData(id, 0, 0); ok = true;
        });
      } catch (e) { console.warn(e); }
      if (ok) { o.globalCompositeOperation = 'destination-in'; o.filter = `blur(${Math.max(1, ow / 500)}px)`; o.drawImage(this.mask, 0, 0, ow, oh); o.filter = 'none'; o.globalCompositeOperation = 'source-over'; }
    }
    this.cache.set(c.id, { key, canvas: O });
    return O;
  },
  chroma(o, w, h, bg) {
    const img = o.getImageData(0, 0, w, h), d = img.data;
    const [kr, kg, kb] = hexToRgb(bg.color);
    const kcb = -.168736 * kr - .331264 * kg + .5 * kb, kcr = .5 * kr - .418688 * kg - .081312 * kb;
    const t0 = bg.tol * 120, t1 = t0 + Math.max(1, bg.soft * 120);
    const greenish = kg > kr && kg > kb, blueish = kb > kr && kb > kg;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const cb = -.168736 * r - .331264 * g + .5 * b, cr = .5 * r - .418688 * g - .081312 * b;
      const dist = Math.hypot(cb - kcb, cr - kcr);
      let a = dist <= t0 ? 0 : dist >= t1 ? 1 : (dist - t0) / (t1 - t0);
      if (bg.invert) a = 1 - a;
      d[i + 3] = d[i + 3] * a;
      if (a < 1 && a > 0) { if (greenish) d[i + 1] = Math.min(g, Math.max(r, b)); else if (blueish) d[i + 2] = Math.min(b, Math.max(r, g)); }
    }
    o.putImageData(img, 0, 0);
  },
};

/* Schriften laden, bevor exportiert oder gezeichnet wird */
async function ensureFonts(clips = State.clips) {
  if (!document.fonts) return;
  const set = new Set();
  for (const c of clips) if (c.kind === 'text') set.add(`${c.italic ? 'italic ' : ''}${c.weight || 400} 64px "${c.font}"`);
  await Promise.all([...set].map(f => document.fonts.load(f).catch(() => { })));
}
