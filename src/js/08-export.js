/* ==========================================================================
   Export (MP4/WebM bis 4K 60 fps), Audio-Mix, Projektdateien
   ========================================================================== */
async function mixAudio(sr = 48000, { clips = null, channels = 2 } = {}) {
  const list = (clips || State.clips).filter(c => c && (c.kind === 'audio' || c.kind === 'video'));
  const dur = clips ? Math.max(0, ...list.map(clipEnd)) : projectDuration();
  if (!dur) return null;
  const ctx = new OfflineAudioContext(channels, Math.max(1, Math.ceil(dur * sr)), sr);
  const bus = ctx.createDynamicsCompressor(); bus.threshold.value = -2; bus.ratio.value = 12; bus.attack.value = .002; bus.release.value = .1;
  bus.connect(ctx.destination);
  let any = false;
  for (const c of list) {
    const tr = trackOf(c); if (!tr || tr.mute || c.mute || (c.volume ?? 1) <= 0) continue;
    if (c.kind === 'video' && tr.hidden) continue;
    const buf = await getAudioBuffer(mediaOf(c)); if (!buf) continue;
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = c.speed || 1;
    const g = ctx.createGain(), v = c.volume ?? 1, t0 = c.start, t1 = clipEnd(c);
    g.gain.setValueAtTime(c.fadeIn > 0 ? 0 : v, t0);
    if (c.fadeIn > 0) g.gain.linearRampToValueAtTime(v, t0 + Math.min(c.fadeIn, c.dur / 2));
    if (c.fadeOut > 0) { g.gain.setValueAtTime(v, Math.max(t0, t1 - c.fadeOut)); g.gain.linearRampToValueAtTime(0, t1); }
    src.connect(g).connect(bus);
    src.start(t0, c.in || 0, c.dur * (c.speed || 1));
    any = true;
  }
  if (!any) return null;
  return ctx.startRendering();
}

const RES = { 720: '720p (HD)', 1080: '1080p (Full HD)', 1440: '1440p (2K)', 2160: '2160p (4K)' };
const Exporter = {
  busy: false, cancel: false,
  dims(res) {
    const W = State.project.w, H = State.project.h, short = Math.min(W, H), k = res / short;
    const ev = n => Math.max(2, Math.round(n * k / 2) * 2);
    return [ev(W), ev(H)];
  },
  open() {
    if (!State.clips.length) { toast('Die Timeline ist leer. Füge zuerst Medien hinzu.', 'warn'); return; }
    Preview.pause();
    const P = State.project, d = projectDuration();
    const f = { res: Settings.get('expRes', 1080), fps: P.fps, q: Settings.get('expQ', 'high'), fmt: Settings.get('expFmt', 'mp4') };
    const info = el('p', { class: 'muted small' });
    const upd = () => { const [w, h] = this.dims(f.res); const mb = this.bitrate(w, h, f.fps, f.q) * d / 8 / 1e6; info.textContent = `${w}×${h} · ${f.fps} fps · ${fmtSec(d)} · ca. ${mb < 1 ? mb.toFixed(1) : Math.round(mb)} MB`; };
    const chips = (opts, key, cb) => el('div', { class: 'chips' }, Object.entries(opts).map(([k, v]) => { const b = el('button', { class: 'chip' + (String(f[key]) === String(k) ? ' on' : '') }, v); b.onclick = () => { f[key] = isNaN(+k) ? k : +k; $$('.chip', b.parentNode).forEach(x => x.classList.remove('on')); b.classList.add('on'); cb && cb(); upd(); }; return b; }));
    const nameIn = el('input', { class: 'inp', value: safeName(P.name) });
    const body = el('div', { class: 'export-form' },
      el('label', { class: 'fl' }, 'Dateiname'), nameIn,
      el('label', { class: 'fl' }, 'Auflösung'), chips(RES, 'res'),
      el('label', { class: 'fl' }, 'Bildrate'), chips({ 24: '24', 25: '25', 30: '30', 50: '50', 60: '60 fps' }, 'fps'),
      el('label', { class: 'fl' }, 'Qualität'), chips({ std: 'Standard', high: 'Hoch', max: 'Maximal' }, 'q'),
      el('label', { class: 'fl' }, 'Format'), chips({ mp4: 'MP4 (überall abspielbar)', webm: 'WebM' }, 'fmt'),
      info);
    upd();
    modal({ title: 'Video exportieren', body, actions: [{ label: 'Abbrechen' }, { label: 'Exportieren', kind: 'primary', onClick: () => { Settings.set('expRes', f.res); Settings.set('expQ', f.q); Settings.set('expFmt', f.fmt); this.run({ ...f, name: nameIn.value || 'video' }); } }] });
  },
  quick() {
    if (!State.clips.length) { toast('Es gibt noch nichts zu speichern.', 'warn'); return; }
    Preview.pause();
    this.run({ res: 1080, fps: State.project.fps || 30, q: 'high', fmt: 'mp4', name: State.project.name || 'mein-video', auto: true });
  },
  bitrate(w, h, fps, q) { const bpp = { std: .07, high: .11, max: .18 }[q] || .11; return Math.round(Math.min(80e6, Math.max(1.5e6, w * h * fps * bpp))); },
  async run({ res, fps, q, fmt, name, auto }) {
    const MB = window.Mediabunny;
    if (!MB || typeof VideoEncoder === 'undefined') { toast('Dein Browser kann keine Videos kodieren. Nutze bitte Chrome oder Edge (aktuelle Version).', 'error', 8000); return; }
    if (this.busy) return; this.busy = true; this.cancel = false;
    const [W, H] = this.dims(res), dur = projectDuration(), total = Math.max(1, Math.ceil(dur * fps));
    const bar = el('div', { class: 'prog big' }, el('div', { class: 'prog-fill' })), stat = el('p', { class: 'mono small' }, 'Vorbereitung …');
    const prevBox = el('div', { class: 'exp-prev' });
    const m = modal({ title: 'Export läuft', body: el('div', {}, el('p', { class: 'muted' }, `${W}×${H}, ${fps} fps. Lass dieses Fenster offen – du kannst währenddessen nichts bearbeiten.`), bar, stat, prevBox), actions: [{ label: 'Abbrechen', kind: 'ghost', keepOpen: true, onClick: () => { this.cancel = true; } }], onClose: () => { this.cancel = true; } });
    const setP = (p, t) => { bar.firstChild.style.width = (p * 100).toFixed(1) + '%'; if (t) stat.textContent = t; };
    const iters = new Map();
    try {
      await ensureFonts();
      setP(0, 'Ton wird gemischt …');
      const audio = await mixAudio(48000);
      const container = fmt === 'webm' ? 'webm' : 'mp4';
      const format = container === 'webm' ? new MB.WebMOutputFormat() : new MB.Mp4OutputFormat({ fastStart: 'in-memory' });
      const output = new MB.Output({ format, target: new MB.BufferTarget() });
      const bitrate = this.bitrate(W, H, fps, q);
      const vCandidates = container === 'webm' ? ['vp9', 'av1', 'vp8'] : ['avc', 'hevc', 'vp9', 'av1'];
      const vcodec = await MB.getFirstEncodableVideoCodec(vCandidates.filter(c => format.getSupportedVideoCodecs().includes(c)), { width: W, height: H, bitrate });
      if (!vcodec) throw new Error(`Dein PC kann ${W}×${H} in diesem Format nicht kodieren. Wähle eine kleinere Auflösung oder das andere Format.`);
      const cv = mkCanvas(W, H), r = new Renderer(cv); r.resize(State.project.w, State.project.h, W / State.project.w); r.exportMode = true; r.sources = new Map();
      const vsrc = new MB.CanvasSource(cv, { codec: vcodec, bitrate, keyFrameInterval: 2, latencyMode: 'quality' });
      output.addVideoTrack(vsrc, { frameRate: fps });
      let asrc = null;
      if (audio) {
        const acodec = await MB.getFirstEncodableAudioCodec((container === 'webm' ? ['opus', 'vorbis'] : ['aac', 'opus']).filter(c => format.getSupportedAudioCodecs().includes(c)), { numberOfChannels: 2, sampleRate: 48000 });
        if (acodec) { asrc = new MB.AudioBufferSource({ codec: acodec, bitrate: 192000 }); output.addAudioTrack(asrc); }
        else toast('Ton kann in diesem Format nicht kodiert werden – das Video wird ohne Ton exportiert.', 'warn');
      }
      await output.start();
      // Video-Quellen vorbereiten (schnelles, bildgenaues Dekodieren)
      setP(0, 'Videos werden vorbereitet …');
      for (const c of State.clips) {
        if (c.kind !== 'video' || trackOf(c)?.hidden) continue;
        const frames = [], times = [];
        for (let i = 0; i < total; i++) { const t = i / fps; if (isVisibleAt(c, t)) { frames.push(i); times.push(srcTime(c, t)); } }
        if (!frames.length) continue;
        try {
          const input = new MB.Input({ source: new MB.BlobSource(mediaOf(c).blob), formats: MB.ALL_FORMATS });
          const vt = await input.getPrimaryVideoTrack(); if (!vt || !(await vt.canDecode())) throw new Error('decode');
          const first = await vt.getFirstTimestamp().catch(() => 0);
          const sink = new MB.CanvasSink(vt, { poolSize: 3 });
          const it = sink.canvasesAtTimestamps(times.map(t => t + Math.max(0, first)))[Symbol.asyncIterator]();
          iters.set(c.id, { frames, idx: 0, it, input });
        } catch (e) { console.warn('Fallback auf Video-Element für', c.name, e); iters.set(c.id, { fallback: true }); }
      }
      // Audio in Häppchen parallel zum Video einspeisen
      let audioDone = 0; const CH = 48000 * 2;
      const feedAudio = async (until) => {
        if (!asrc || !audio) return;
        const lim = Math.min(audio.length, Math.ceil(until * 48000));
        while (audioDone < lim) {
          const n = Math.min(CH, audio.length - audioDone), part = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: 48000 });
          for (let ch = 0; ch < 2; ch++) part.copyToChannel(audio.getChannelData(Math.min(ch, audio.numberOfChannels - 1)).subarray(audioDone, audioDone + n), ch);
          await asrc.add(part); audioDone += n;
        }
      };
      const t0 = performance.now();
      for (let i = 0; i < total; i++) {
        if (this.cancel) throw new Error('abgebrochen');
        const t = i / fps;
        for (const c of State.clips) {
          if (c.kind !== 'video') continue;
          const s = iters.get(c.id); if (!s) continue;
          if (s.fallback) {
            if (isVisibleAt(c, t)) { const v = Preview.mediaEl(c); const want = srcTime(c, t); if (v.readyState < 2) await waitEvent(v, 'loadeddata', 10000).catch(() => { }); if (Math.abs(v.currentTime - want) > .001) { v.currentTime = want; await waitEvent(v, 'seeked', 8000).catch(() => { }); } r.sources.set(c.id, v); }
            else r.sources.delete(c.id);
            continue;
          }
          if (s.frames[s.idx] === i) { const res = await s.it.next(); s.idx++; if (res.value) r.sources.set(c.id, res.value.canvas); }
          else if (s.idx >= s.frames.length || s.frames[s.idx] > i) { if (!isVisibleAt(c, t)) r.sources.delete(c.id); }
        }
        r.render(t);
        await vsrc.add(t, 1 / fps);
        await feedAudio(t + 1);
        if (i % 6 === 0 || i === total - 1) {
          const el_ = (performance.now() - t0) / 1000, rate = (i + 1) / el_, eta = (total - i - 1) / Math.max(.01, rate);
          setP((i + 1) / total, `Bild ${i + 1} von ${total} · ${rate.toFixed(1)} Bilder/s · noch ca. ${fmtSec(eta)}`);
          await sleep(0);
        }
      }
      await feedAudio(dur + 1);
      setP(1, 'Datei wird fertiggestellt …');
      vsrc.close(); if (asrc) asrc.close();
      await output.finalize();
      const blob = new Blob([output.target.buffer], { type: container === 'webm' ? 'video/webm' : 'video/mp4' });
      const file = `${safeName(name)}.${container}`;
      m.close();
      let savedPath = null;
      if (auto) { if (window.native) { try { savedPath = await window.native.saveAuto(file, await blob.arrayBuffer()); } catch (e) { toast('Speichern fehlgeschlagen: ' + e.message, 'error'); } } else download(blob, file); }
      this.done(blob, file, ((performance.now() - t0) / 1000), auto, savedPath);
    } catch (e) {
      console.error(e);
      m.close();
      if (e.message !== 'abgebrochen') toast('Export fehlgeschlagen: ' + (e.message || e), 'error', 9000); else toast('Export abgebrochen.', 'info');
    } finally {
      for (const s of iters.values()) { try { s.it && s.it.return && s.it.return(); s.input && s.input.dispose && s.input.dispose(); } catch { } }
      this.busy = false; Preview.requestRender();
    }
  },
  done(blob, file, secs, auto, savedPath) {
    const url = URL.createObjectURL(blob);
    const vid = el('video', { src: url, controls: true, playsInline: true, class: 'exp-video' });
    const fileObj = new File([blob], file, { type: blob.type });
    const canShare = navigator.canShare && navigator.canShare({ files: [fileObj] });
    const desc = el('textarea', { class: 'inp', rows: 4, placeholder: 'Beschreibung & Hashtags – lass dir einen Vorschlag von der KI machen.' });
    const body = el('div', { class: 'exp-done' }, vid,
      savedPath ? el('div', { class: 'ok-box' }, el('p', { class: 'ok-note' }, `✓ Gespeichert: ${savedPath}`), el('button', { class: 'btn primary', html: icon('folder') + 'Im Ordner zeigen', onclick: () => window.native.show(savedPath) })) : auto ? el('p', { class: 'ok-note' }, `✓ Gespeichert als „${file}“ in deinem Download-Ordner.`) : null,
      el('p', { class: 'muted small' }, `${file} · ${(blob.size / 1e6).toFixed(1)} MB · in ${fmtSec(secs)} erstellt`),
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn primary', html: icon('download') + 'Video speichern', onclick: () => download(blob, file) }),
        canShare ? el('button', { class: 'btn ghost', html: icon('share') + 'Teilen …', onclick: () => navigator.share({ files: [fileObj], title: State.project.name }).catch(() => { }) }) : null),
      el('h3', { class: 'h3' }, 'Direkt hochladen'),
      el('div', { class: 'btn-row' },
        el('a', { class: 'btn ghost sm', href: 'https://www.tiktok.com/upload', target: '_blank', rel: 'noopener' }, 'TikTok'),
        el('a', { class: 'btn ghost sm', href: 'https://www.youtube.com/upload', target: '_blank', rel: 'noopener' }, 'YouTube'),
        el('a', { class: 'btn ghost sm', href: 'https://www.instagram.com/', target: '_blank', rel: 'noopener' }, 'Instagram'),
        el('a', { class: 'btn ghost sm', href: 'https://www.facebook.com/', target: '_blank', rel: 'noopener' }, 'Facebook')),
      el('p', { class: 'muted small' }, 'Speichere das Video zuerst, öffne dann die Plattform und wähle die Datei aus.'),
      el('h3', { class: 'h3' }, 'Beschreibung'), desc,
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn ghost sm', html: icon('sparkle') + 'KI-Vorschlag', onclick: async (e) => { e.target.disabled = true; try { desc.value = await suggestCaption(); } catch (er) { toast(er.message, 'error'); } e.target.disabled = false; } }),
        el('button', { class: 'btn ghost sm', html: icon('copy') + 'Kopieren', onclick: () => { navigator.clipboard.writeText(desc.value).then(() => toast('Kopiert.', 'ok')).catch(() => { desc.select(); }); } }),
        el('button', { class: 'btn ghost sm', html: icon('info') + 'Quellenangaben', onclick: () => { desc.value = (desc.value ? desc.value + '\n\n' : '') + creditsText(); } })));
    modal({ title: 'Fertig!', body, wide: true, onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000) });
  },
};
function creditsText() {
  const used = new Set(State.clips.map(c => c.media).filter(Boolean));
  const lines = [...used].map(id => State.media.get(id)).filter(m => m && m.credit).map(m => `• ${m.credit}`);
  return lines.length ? 'Quellen:\n' + lines.join('\n') : 'Keine Quellenangaben nötig – alle Medien sind eigene oder mit Clipwerk erzeugt.';
}
async function suggestCaption() {
  const texts = State.clips.filter(c => c.kind === 'text').map(c => c.text).join(' | ').slice(0, 600);
  const out = await AI.text(`Projekt: "${State.project.name}". Texte im Video: ${texts || '(keine)'}. Schreibe eine kurze, packende Beschreibung (max. 2 Sätze, mit 1-2 passenden Emojis) für TikTok/Instagram auf Deutsch, gefolgt von 8 passenden Hashtags in einer Zeile.`, 'Du bist ein erfahrener Social-Media-Manager. Antworte nur mit dem fertigen Beschreibungstext.');
  return out.trim();
}

/* ---------- Projektdatei (.clipwerk) – enthält alle Medien ---------- */
const ProjectFile = {
  async save() {
    const used = [...State.media.values()];
    const manifest = { app: 'clipwerk', version: APP_VERSION, project: State.project, tracks: State.tracks, clips: State.clips, media: used.map(m => ({ id: m.id, name: m.name, type: m.type, size: m.blob.size, mime: m.blob.type, credit: m.credit, source: m.source })) };
    const head = new TextEncoder().encode(JSON.stringify(manifest)), len = new Uint8Array(8);
    new DataView(len.buffer).setUint32(0, 0x43575031); new DataView(len.buffer).setUint32(4, head.length);
    const blob = new Blob([len, head, ...used.map(m => m.blob)], { type: 'application/octet-stream' });
    download(blob, `${safeName(State.project.name)}.clipwerk`);
    toast('Projekt gespeichert (inklusive aller Medien).', 'ok');
  },
  async load(file) {
    const busy = Busy.show('Projekt wird geöffnet …');
    try {
      const hdr = new DataView(await file.slice(0, 8).arrayBuffer());
      if (hdr.getUint32(0) !== 0x43575031) throw new Error('Das ist keine Clipwerk-Projektdatei.');
      const hl = hdr.getUint32(4), man = JSON.parse(new TextDecoder().decode(await file.slice(8, 8 + hl).arrayBuffer()));
      await Projects.clear(true);
      let off = 8 + hl;
      for (const [i, mm] of man.media.entries()) {
        const b = file.slice(off, off + mm.size, mm.mime); off += mm.size;
        busy.set(i / man.media.length, `Medien: ${mm.name}`);
        await addMediaBlob(b, mm.name, { id: mm.id, type: mm.type, credit: mm.credit, source: mm.source });
      }
      State.project = man.project; State.tracks = man.tracks; State.clips = man.clips; State.selected = null; State.time = 0;
      resetHistory(); refreshAll(); Timeline.fit(); Store.saveState();
      toast(`„${State.project.name}“ geöffnet.`, 'ok');
    } catch (e) { toast(e.message || 'Projekt konnte nicht geöffnet werden.', 'error'); }
    finally { busy.close(); }
  },
};
const Projects = {
  async clear(silent) {
    Preview.pause();
    for (const e of Preview.els.values()) { e.pause(); e.removeAttribute('src'); e.load(); }
    Preview.els.clear();
    for (const m of State.media.values()) URL.revokeObjectURL(m.url);
    State.media.clear(); State.clips = []; State.tracks = defaultTracks(); State.selected = null; State.time = 0;
    State.project = { name: 'Mein Video', format: State.project.format || '9:16', w: 1080, h: 1920, fps: 30, bg: '#000000' };
    await Store.clearAll();
    if (!silent) { resetHistory(); refreshAll(); Panels.refreshMedia(); }
  },
  async newProject() {
    if (State.clips.length && !(await confirmBox('Neues Projekt?', 'Das aktuelle Projekt wird geschlossen. Speichere es vorher über „Speichern“, wenn du es behalten willst.', 'Neues Projekt'))) return;
    await this.clear(); Panels.show('media'); toast('Neues, leeres Projekt.', 'ok');
  },
};
