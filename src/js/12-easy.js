/* ==========================================================================
   Einfach-Modus: Startbildschirm, Auto-Schnitt in einem Klick, Ein-Klick-Export
   ========================================================================== */
const VIBES = {
  hype: { label: 'Hype', desc: 'Schnelle Schnitte, harte Beats', music: 'trap', beats: 2, trans: ['zoomIn', 'glitch', 'slideL', 'white', 'spin'], look: 'vivid', fx: [['zoompulse', .4]], text: 'comic', color: '#ff5f5f' },
  happy: { label: 'Fröhlich', desc: 'Bunt und gute Laune', music: 'pop', beats: 4, trans: ['slideL', 'slideU', 'circle', 'zoomIn'], look: 'warm', fx: [['sparkle', .5, 'end']], text: 'words', color: '#ffb547' },
  chill: { label: 'Chill', desc: 'Entspannt mit Lo-Fi', music: 'lofi', beats: 4, trans: ['fade', 'blur'], look: 'film', fx: [['grain', .3], ['lightleak', .35]], text: 'elegant', color: '#7cd4ff' },
  cinema: { label: 'Kino', desc: 'Episch wie ein Trailer', music: 'cine', beats: 4, trans: ['black', 'fade', 'blur'], look: 'kino', fx: [['letterbox', .7]], text: 'title', color: '#c4a7ff' },
  retro: { label: 'Retro', desc: '80er, Neon und VHS', music: 'synthwave', beats: 4, trans: ['glitch', 'wipe', 'slideR'], look: 'cyber', fx: [['vhs', .35]], text: 'retro', color: '#ff4fd8' },
  emotional: { label: 'Gefühlvoll', desc: 'Ruhig und berührend', music: 'ambient', beats: 4, trans: ['fade', 'white'], look: 'dream', fx: [['vignette', .4]], text: 'elegant', color: '#9ae6b4' },
};
const EASY_FORMATS = { '9:16': ['TikTok / Reels / Shorts', 'Hochkant'], '16:9': ['YouTube', 'Querformat'], '1:1': ['Instagram', 'Quadrat'] };

const Easy = {
  st: { media: [], vibe: 'hype', len: 30, format: '9:16', title: '', seed: 1, keepAudio: false, music: true, kind: 'clips' },
  ov: null,
  /* ---------- Startbildschirm ---------- */
  home() {
    Preview.pause();
    this.close();
    const hasProject = State.clips.length > 0 && State.project.name !== 'Beispielprojekt';
    const file = el('input', { type: 'file', multiple: true, accept: 'video/*,image/*', hidden: true });
    file.onchange = () => { this.addFiles([...file.files]); file.value = ''; };
    const drop = el('button', { class: 'home-drop big', onclick: () => file.click(), html: `<span class="hd-ic">${icon('upload')}</span><strong>Fotos und Videos hier reinziehen</strong><span>oder klicken zum Auswählen – das Video entsteht automatisch</span>` });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); document.body.classList.remove('dropping'); this.addFiles([...e.dataTransfer.files]); });
    const idea = el('input', { class: 'inp big', placeholder: 'Thema, z. B. „5 verrückte Fakten über Katzen“' });
    const ideaGo = el('button', { class: 'btn primary', html: icon('sparkle') + 'Video erstellen', onclick: () => this.fromIdea(idea.value) });
    idea.addEventListener('keydown', e => { if (e.key === 'Enter') ideaGo.click(); });
    const ideaBox = el('details', { class: 'home-idea' }, el('summary', { html: `${icon('sparkle')}<span>Keine eigenen Clips? <strong>Video aus einer Idee erstellen (KI)</strong></span>` }), el('div', { class: 'row-inline' }, idea, ideaGo));
    const net = el('button', { class: 'btn ghost', html: icon('search') + 'Kostenlose Clips aus dem Internet holen', onclick: () => { const picked = []; StockPicker.open(m => picked.push(m.id), () => { if (picked.length) { this.st.media = picked; this.build(); } }); } });
    const box = el('div', { class: 'home simple-home' },
      el('div', { class: 'home-brand', html: `<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#ffb547"/><path d="M9 11h14v12H9z" fill="#1c1306"/><path d="M8 7l16-2 .6 4-16 2z" fill="#1c1306"/><path d="M14 14v6l5-3z" fill="#ffb547"/></svg><span>Clipwerk</span>` }),
      el('h1', {}, 'Dein Video in einem Klick'),
      drop, file,
      el('div', { class: 'home-row' }, net, hasProject ? el('button', { class: 'btn ghost', html: icon('film') + 'Letztes Video weiter bearbeiten', onclick: () => { this.close(); this.setSimple(true); } }) : null),
      ideaBox,
      el('div', { class: 'home-foot' },
        el('button', { class: 'linkbtn', onclick: () => { this.close(); $('#projInput').click(); } }, 'Projektdatei öffnen'),
        el('span', {}, '·'),
        el('button', { class: 'linkbtn', onclick: () => { this.close(); this.setSimple(false); } }, 'Profi-Editor (für Fortgeschrittene)')));
    this.ov = el('div', { class: 'home-wrap' }, box);
    document.body.append(this.ov);
  },
  close() { if (this.ov) { this.ov.remove(); this.ov = null; } },
  async addFiles(files, append = false) {
    const ok = files.filter(f => guessType(f, f.name) === 'video' || guessType(f, f.name) === 'image');
    if (!ok.length) { toast('Bitte Fotos oder Videos auswählen.', 'warn'); return; }
    const busy = Busy.show('Dateien werden geladen …');
    const ids = [];
    for (const [i, f] of ok.entries()) { busy.set(i / ok.length, f.name); try { ids.push((await addMediaBlob(f, f.name)).id); } catch (e) { toast(e.message, 'error'); } }
    busy.close();
    if (!ids.length) return;
    this.st.media = append ? [...this.st.media.filter(id => State.media.has(id)), ...ids] : ids;
    this.st.seed = 1;
    this.build();
  },
  /* ---------- Beste Stellen in Videos finden ---------- */
  async analyze(m, onP) {
    if (m.scores) return m.scores;
    const v = el('video', { muted: true, preload: 'auto', playsInline: true }); v.src = m.url;
    try { await waitEvent(v, 'loadeddata', 15000); } catch { m.scores = []; return m.scores; }
    const N = clamp(Math.round(m.duration * 1.5), 4, 50), cv = mkCanvas(48, 27), x = cv.getContext('2d', { willReadFrequently: true });
    let prev = null; const out = [];
    for (let i = 0; i < N; i++) {
      const t = (i + .5) / N * m.duration;
      v.currentTime = t; await waitEvent(v, 'seeked', 5000).catch(() => { });
      x.drawImage(v, 0, 0, 48, 27);
      const d = x.getImageData(0, 0, 48, 27).data;
      let lum = 0, sat = 0, diff = 0;
      for (let p = 0; p < d.length; p += 4) {
        const r = d[p], g = d[p + 1], b = d[p + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        lum += (r + g + b) / 765; sat += mx ? (mx - mn) / mx : 0;
        if (prev) diff += Math.abs(r - prev[p]) + Math.abs(g - prev[p + 1]) + Math.abs(b - prev[p + 2]);
      }
      const n = d.length / 4; lum /= n; sat /= n; diff = prev ? diff / n / 765 : 0;
      out.push({ t, s: diff * 4 + sat * .8 + (lum < .1 ? -1 : lum > .93 ? -.5 : .25) });
      prev = d; onP && onP((i + 1) / N);
    }
    v.removeAttribute('src'); v.load();
    m.scores = out; return out;
  },
  segments(m, L, rnd) {
    if (m.duration <= L * 1.3) return [0];
    const max = Math.max(1, Math.floor(m.duration / L)), chosen = [];
    const cands = (m.scores || []).map(c => ({ t: c.t, s: c.s + rnd() * .15 })).sort((a, b) => b.s - a.s);
    if (!cands.length) for (let i = 0; i < max; i++) cands.push({ t: (i + .5) * m.duration / max });
    for (const c of cands) {
      const st = clamp(c.t - L / 2, 0, m.duration - L);
      if (chosen.every(s => Math.abs(s - st) >= L)) chosen.push(st);
      if (chosen.length >= max) break;
    }
    return chosen.sort((a, b) => a - b);
  },
  /* ---------- Auto-Schnitt ---------- */
  async build() {
    const E = this.st, V = VIBES[E.vibe];
    const media = E.media.map(id => State.media.get(id)).filter(m => m && m.type !== 'audio');
    if (!media.length) { this.home(); return; }
    E.kind = 'clips'; this.close();
    const busy = Busy.show('Dein Video wird geschnitten …', 'Die besten Stellen werden gesucht.');
    try {
      Preview.pause();
      State.project.format = E.format; applyFormat();
      State.clips = []; State.tracks = defaultTracks(); State.selected = null; Preview.cleanupEls();
      const vids = media.filter(m => m.type === 'video');
      for (const [i, m] of vids.entries()) await this.analyze(m, p => busy.set((i + p) / vids.length * .6, `Video ${i + 1} von ${vids.length} wird analysiert …`));
      const rnd = mulberry(E.seed * 131 + 7), bpm = Music.STYLES[V.music].bpm, L = Math.max(.8, V.beats * 60 / bpm);
      const order = E.seed > 1 ? media.slice().sort(() => rnd() - .5) : media;
      const pools = new Map(order.map(m => [m.id, m.type === 'video' ? this.segments(m, L, rnd) : []]));
      const n = Math.max(order.length > 1 ? 2 : 1, Math.round(E.len / L));
      const main = State.tracks.find(t => t.magnet), kbs = ['zoomIn', 'panL', 'zoomOut', 'panR', 'panU'];
      let t = 0;
      for (let i = 0; i < n; i++) {
        const m = order[i % order.length];
        const f = { ...FILTER_DEF(), ...LOOKS[V.look].f };
        const base = { start: t, look: V.look, f, trans: { type: i ? V.trans[i % V.trans.length] : 'none', dur: Math.min(.45, L / 3) } };
        let c;
        if (m.type === 'image') c = newClip('image', { ...base, media: m.id, name: m.name, dur: L, kb: kbs[Math.floor(rnd() * kbs.length)] });
        else {
          let pool = pools.get(m.id); if (!pool.length) { pool = this.segments(m, L, rnd).sort(() => rnd() - .5); pools.set(m.id, pool); }
          const s = pool.shift(), d = Math.min(L, m.duration - s);
          c = newClip('video', { ...base, media: m.id, name: m.name, in: s, dur: Math.max(.3, d), mute: !E.keepAudio, volume: .8 });
        }
        c.track = main.id; State.clips.push(c); t += c.dur;
        if (t >= E.len + .01) break;
      }
      if (E.title.trim()) Templates.text(V.text, E.title.trim(), 0, Math.min(2.6, t), { y: .4, size: Math.max(TEXT_PRESETS[V.text].p.size, V.text === 'retro' ? 84 : 120), boxW: .9 });
      for (const [k, amt, where] of V.fx) where === 'end' ? Templates.fx(k, t * .7, t * .3, amt) : Templates.fx(k, 0, t, amt);
      Templates.fx('fadeout', Math.max(0, t - .6), .6, 1);
      busy.set(.85, 'Musik wird komponiert …');
      if (E.music) await Templates.music(V.music, 0, t, E.keepAudio ? .45 : .85, E.seed);
      State.project.name = E.title.trim() || 'Mein Clip';
      commit(); this.setSimple(true); refreshAll(); Timeline.fit(); Preview.seek(0);
      busy.close(); Preview.play();
    } catch (e) { console.error(e); busy.close(); toast('Das hat nicht geklappt: ' + e.message, 'error'); }
  },
  /* ---------- Video aus Idee ---------- */
  async fromIdea(topic) {
    topic = (topic || '').trim();
    if (!topic) { toast('Schreib zuerst ein Thema, z. B. „Tipps für besseren Schlaf“.', 'warn'); return; }
    this.close(); this.st.kind = 'idea';
    const S = { topic, n: 6, sec: 3.5, style: 'cinema', voice: 'online', music: 'cine', caps: 'tiktok', scenes: [], title: '' };
    const busy = Busy.show('Die KI schreibt dein Drehbuch …', 'Das dauert meist 5–15 Sekunden.');
    try {
      const raw = await AI.text(`Schreibe ein kurzes, packendes Social-Media-Video-Skript über: "${topic}". Genau 6 Szenen, Sprache: Deutsch. Antworte ausschließlich mit JSON im Format {"title":"kurzer Titel (max 5 Wörter)","scenes":[{"text":"ein Satz, der im Video eingeblendet und gesprochen wird (max 14 Wörter)","image":"detailed English image prompt for this scene, no text or letters"}]}`, 'Du bist ein kreativer Autor für virale Kurzvideos. Starte mit einem starken Hook. Antworte nur mit gültigem JSON.', { json: true });
      const j = AI.parseJSON(raw);
      S.title = j.title || topic; S.scenes = (j.scenes || []).map(s => ({ text: s.text || '', image: s.image || '' })).filter(s => s.text || s.image);
    } catch (e) {
      console.warn(e);
      S.title = topic;
      S.scenes = [{ text: topic, image: `${topic}, establishing shot` }, { text: '', image: `${topic}, close-up detail` }, { text: '', image: `${topic}, dramatic wide angle` }, { text: '', image: `${topic}, colorful scene` }];
      toast('Die Text-KI ist gerade nicht erreichbar – das Video wird nur aus Bildern gebaut.', 'warn', 6000);
    }
    busy.close();
    if (!S.scenes.length) return;
    State.project.format = this.st.format; applyFormat();
    await Templates.buildStory(S, 'replace');
    this.setSimple(true);
    Preview.seek(0); Preview.play();
  },
  /* ---------- Einfache Ansicht ---------- */
  setSimple(on) {
    document.body.classList.toggle('simple', on);
    Settings.set('simple', on);
    const b = $('#btnMode'); if (b) b.innerHTML = icon('wand') + '<span>Zur einfachen Ansicht</span>';
    this.renderBar();
    requestAnimationFrame(() => { Preview.resize(); Timeline.render(); });
  },
  renderBar() {
    const bar = $('#easyBar'); if (!bar) return;
    const E = this.st;
    const clipsMode = E.kind === 'clips' && E.media.length > 0;
    const chips = (opts, key, lbl) => el('div', { class: 'chips big' }, Object.entries(opts).map(([k, v]) => el('button', { class: 'chip' + (String(E[key]) === String(k) ? ' on' : ''), onclick: () => { E[key] = (key === 'len') ? +k : k; this.build(); } }, key === 'vibe' ? el('span', { class: 'vb-dot', style: { background: v.color } }) : null, lbl(v, k))));
    const titleClip = () => State.clips.find(c => c.kind === 'text' && c.start === 0 && c.track === trackByName('text', 'Text')?.id);
    const title = el('input', { class: 'inp', placeholder: 'Titel im Video (optional) …', value: titleClip()?.text || E.title });
    title.onchange = () => {
      E.title = title.value.trim(); const tc = titleClip();
      if (tc) { if (E.title) tc.text = E.title; else State.clips = State.clips.filter(c => c !== tc); }
      else if (E.title) { const V = VIBES[E.vibe] || VIBES.hype; Templates.text(V.text, E.title, 0, Math.min(2.6, projectDuration()), { y: .4, size: Math.max(TEXT_PRESETS[V.text].p.size, 120), boxW: .9 }); }
      if (E.title) State.project.name = E.title; commit(); refreshAll();
    };
    const more = el('input', { type: 'file', multiple: true, accept: 'video/*,image/*', hidden: true });
    more.onchange = () => { this.addFiles([...more.files], true); more.value = ''; };
    bar.replaceChildren(
      clipsMode ? el('div', { class: 'eb-row' }, el('span', { class: 'eb-l' }, 'Stimmung'), chips(VIBES, 'vibe', v => v.label)) : null,
      clipsMode ? el('div', { class: 'eb-row' }, el('span', { class: 'eb-l' }, 'Für'), chips(EASY_FORMATS, 'format', v => v[0]), el('span', { class: 'eb-l right' }, 'Länge'), chips({ 15: '15 s', 30: '30 s', 60: '60 s' }, 'len', v => v)) : null,
      el('div', { class: 'eb-row main' },
        clipsMode ? el('button', { class: 'btn ghost', title: 'Gleiche Clips, neuer Schnitt', html: icon('dice') + 'Neu mischen', onclick: () => { E.seed++; this.build(); } }) : null,
        clipsMode ? el('button', { class: 'btn ghost', html: icon('plus') + 'Clips dazu', onclick: () => more.click() }) : null, more,
        title,
        el('button', { class: 'btn primary huge-bar', html: icon('download') + 'Video speichern', onclick: () => Exporter.quick() })));
  },
};

/* ---------- KI kostenlos freischalten (falls der Dienst einen Schlüssel will) ---------- */
const KeyWizard = {
  shown: false,
  maybe() { if (this.shown || AI.key()) return; this.shown = true; this.open(); },
  open() {
    const inp = el('input', { class: 'inp big', type: 'password', placeholder: 'Schlüssel hier einfügen', value: AI.key() });
    modal({ title: 'KI kostenlos freischalten', body: el('div', { class: 'kw' },
      el('p', { class: 'muted' }, 'Der kostenlose KI-Dienst ist gerade ausgelastet oder möchte, dass du dich einmal kurz anmeldest. Das ist gratis und dauert etwa 1 Minute:'),
      el('ol', { class: 'kw-steps' },
        el('li', {}, el('strong', {}, 'Kostenlos anmelden: '), el('a', { href: 'https://enter.pollinations.ai', target: '_blank', rel: 'noopener', class: 'btn primary sm' }, 'enter.pollinations.ai öffnen')),
        el('li', {}, el('strong', {}, 'Schlüssel kopieren: '), 'Dort „API Key“ bzw. „Create key“ wählen und den Schlüssel kopieren.'),
        el('li', {}, el('strong', {}, 'Hier einfügen: '), inp)),
      el('p', { class: 'muted xs' }, 'Der Schlüssel bleibt nur auf deinem PC gespeichert. Ohne Schlüssel funktionieren Schnitt, Musik, Effekte und Export trotzdem vollständig.')),
      actions: [{ label: 'Später' }, { label: 'Speichern', kind: 'primary', onClick: () => { Settings.set('pollKey', inp.value.trim()); toast(inp.value.trim() ? 'KI freigeschaltet. Versuch es jetzt nochmal!' : 'Kein Schlüssel eingetragen.', inp.value.trim() ? 'ok' : 'warn'); } }] });
  },
};
