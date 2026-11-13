/* ==========================================================================
   Vorlagen: bauen fertige, frei bearbeitbare Timelines
   ========================================================================== */
async function makeGradient(c1, c2, { glow = '#ffffff', label = 'Hintergrund' } = {}) {
  const W = State.project.w, H = State.project.h, cv = mkCanvas(W, H), x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, W * .3, H); g.addColorStop(0, c1); g.addColorStop(1, c2); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const r = x.createRadialGradient(W * .7, H * .25, 0, W * .7, H * .25, Math.max(W, H) * .6); r.addColorStop(0, rgba(glow, .22)); r.addColorStop(1, rgba(glow, 0)); x.fillStyle = r; x.fillRect(0, 0, W, H);
  x.globalAlpha = .05; x.globalCompositeOperation = 'overlay'; x.drawImage(NOISE, 0, 0, W, H);
  const b = await new Promise(res => cv.toBlob(res, 'image/jpeg', .92));
  return addMediaBlob(b, label, { type: 'image', source: 'Clipwerk' });
}
const PALETTES = [['#1b1f3a', '#6b2d5c', '#ffb547'], ['#0f2027', '#2c5364', '#7cd4ff'], ['#2b1055', '#7597de', '#ffd1f5'], ['#3a1c71', '#d76d77', '#ffaf7b'], ['#0b3d2e', '#1f7a5c', '#c4ffdf'], ['#232526', '#414345', '#ffffff']];

const Templates = {
  askMode() {
    if (!State.clips.length) return Promise.resolve('replace');
    return new Promise(res => {
      let done = false;
      modal({ title: 'Vorlage einfügen', body: el('p', { class: 'muted' }, 'Deine Timeline enthält schon Clips. Soll die Vorlage sie ersetzen oder hinten angehängt werden?'), onClose: () => { if (!done) res(null); },
        actions: [{ label: 'Abbrechen', onClick: () => { done = true; res(null); } }, { label: 'Hinten anhängen', onClick: () => { done = true; res('append'); } }, { label: 'Timeline ersetzen', kind: 'primary', onClick: () => { done = true; res('replace'); } }] });
    });
  },
  begin(mode) {
    if (mode === 'replace') { State.clips = []; State.tracks = defaultTracks(); State.selected = null; Preview.cleanupEls(); return 0; }
    return projectDuration();
  },
  main() { return State.tracks.find(t => t.magnet) || firstTrack('video'); },
  put(c, trackType, name) { const t = (name && trackByName(trackType, name)) || firstTrack(trackType) || addTrack(trackType); c.track = t.id; State.clips.push(c); return c; },
  img(m, start, dur, extra = {}) { return this.put(newClip('image', { media: m.id, name: m.name, start, dur, ...extra }), 'video'); },
  text(preset, text, start, dur, extra = {}, track = 'Text') { const P = TEXT_PRESETS[preset].p; return this.put(newClip('text', { ...JSON.parse(JSON.stringify(P)), text, start, dur, name: TEXT_PRESETS[preset].label, ...extra }), 'text', track); },
  fx(fx, start, dur, amt = .6) { return this.put(newClip('fx', { fx, start, dur, amt, name: FX_LIST[fx] }), 'fx'); },
  async music(style, start, dur, vol = .7, seed = 1) {
    if (!style || style === 'none') return;
    const buf = await Music.generate(style, dur, seed);
    const m = await addAudioBuffer(buf, `${Music.STYLES[style].label} (${Math.round(dur)} s)`, { source: 'Clipwerk Musik-Generator' });
    this.put(newClip('audio', { media: m.id, name: m.name, start, dur: buf.duration, volume: vol, fadeOut: Math.min(1.5, dur / 4) }), 'audio', 'Musik');
  },
  async sfx(key, start, vol = .8) {
    const buf = await SFX.make(key); const m = await addAudioBuffer(buf, SFX.list[key][0], { source: 'Clipwerk Soundeffekte' });
    this.put(newClip('audio', { media: m.id, name: m.name, start, dur: buf.duration, volume: vol }), 'audio', 'Soundeffekte');
  },
  finish(name, offset) {
    if (name && offset === 0) State.project.name = name;
    commit(); refreshAll(); Timeline.fit(); Preview.seek(offset); Panels.refreshMedia();
  },
  picker(types, multiple = true) {
    const sel = new Set();
    const box = el('div', { class: 'picker' });
    const input = el('input', { type: 'file', multiple, accept: types.map(t => t + '/*').join(','), hidden: true });
    input.onchange = async () => { for (const f of input.files) { try { const m = await addMediaBlob(f, f.name); if (types.includes(m.type)) { if (!multiple) sel.clear(); sel.add(m.id); } } catch (e) { toast(e.message, 'error'); } } input.value = ''; draw(); };
    const draw = () => {
      const list = [...State.media.values()].filter(m => types.includes(m.type)).reverse();
      box.replaceChildren(el('button', { class: 'pick add', html: icon('upload') + '<span>Dateien wählen</span>', onclick: () => input.click() }),
        ...list.map(m => { const b = el('button', { class: 'pick' + (sel.has(m.id) ? ' on' : ''), title: m.name, style: m.thumb ? { backgroundImage: `url(${m.thumb})` } : {} }, el('span', { class: 'pick-n mono' }, sel.has(m.id) ? String([...sel].indexOf(m.id) + 1) : ''));
          b.onclick = () => { if (sel.has(m.id)) sel.delete(m.id); else { if (!multiple) sel.clear(); sel.add(m.id); } draw(); }; return b; }));
    };
    draw();
    return { el: el('div', {}, box, input), get: () => [...sel].map(id => State.media.get(id)).filter(Boolean) };
  },
  form(title, fields, onOk) {
    const body = el('div', { class: 'tform' }, fields.map(f => f.label ? [el('label', { class: 'fl' }, f.label), f.el] : f.el));
    modal({ title, body, wide: true, actions: [{ label: 'Abbrechen' }, { label: 'Erstellen', kind: 'primary', onClick: async () => { const r = await onOk(); return r; } }] });
  },
  styleSelect(def) { const s = el('select', { class: 'sel' }, el('option', { value: 'none' }, 'Ohne Musik'), Object.entries(Music.STYLES).map(([k, v]) => el('option', { value: k }, v.label))); s.value = def; return s; },
  open(key) {
    const inp = (ph, v = '') => el('input', { class: 'inp', placeholder: ph, value: v });
    if (key === 'story') { Panels.show('ai'); setTimeout(() => $('.p-card:nth-of-type(2)')?.scrollIntoView({ behavior: 'smooth' }), 50); return; }
    if (key === 'slideshow') {
      const pk = this.picker(['image']), title = inp('Titel (optional)', 'Unsere Reise'), mus = this.styleSelect('pop');
      const beats = el('select', { class: 'sel' }, el('option', { value: 2 }, 'Schnell (2 Schläge pro Foto)'), el('option', { value: 4 }, 'Mittel (4 Schläge)'), el('option', { value: 8 }, 'Ruhig (8 Schläge)')); beats.value = 4;
      this.form('Foto-Slideshow im Beat', [{ label: 'Fotos (Reihenfolge = Auswahlreihenfolge)', el: pk.el }, { label: 'Titel', el: title }, { label: 'Musik', el: mus }, { label: 'Tempo', el: beats }], async () => {
        const imgs = pk.get(); if (imgs.length < 2) { toast('Wähle mindestens zwei Fotos aus.', 'warn'); return false; }
        const mode = await this.askMode(); if (!mode) return false;
        const off = this.begin(mode), style = mus.value === 'none' ? 'pop' : mus.value, per = Math.max(.8, +beats.value * 60 / Music.STYLES[style].bpm);
        const trs = ['fade', 'slideL', 'zoomIn', 'circle', 'wipe', 'blur', 'spin', 'slideU'], kbs = ['zoomIn', 'panL', 'zoomOut', 'panR'];
        let t = off; imgs.forEach((m, i) => { this.img(m, t, per, { kb: kbs[i % 4], trans: { type: i ? trs[i % trs.length] : 'none', dur: Math.min(.5, per / 3) } }); t += per; });
        if (title.value.trim()) this.text('title', title.value.trim(), off, Math.min(3, t - off));
        this.fx('flash', off, .6, .8);
        await this.music(mus.value, off, t - off);
        this.finish(title.value.trim() || 'Slideshow', off);
      });
    }
    if (key === 'quote') {
      const q = el('textarea', { class: 'inp', rows: 3 }, 'Der beste Zeitpunkt, einen Baum zu pflanzen, war vor zwanzig Jahren. Der zweitbeste ist jetzt.');
      const a = inp('Autor', 'Chinesisches Sprichwort');
      const bg = el('select', { class: 'sel' }, el('option', { value: 'gradient' }, 'Farbverlauf (offline)'), el('option', { value: 'ai' }, 'KI-Bild passend zum Zitat (online)'));
      this.form('Zitat-Video', [{ label: 'Zitat', el: q }, { label: 'Autor', el: a }, { label: 'Hintergrund', el: bg }], async () => {
        const text = q.value.trim(); if (!text) return false;
        const mode = await this.askMode(); if (!mode) return false;
        const busy = Busy.show('Zitat-Video wird erstellt …');
        try {
          const off = this.begin(mode), dur = Math.max(6, text.split(/\s+/).length * .42 + 3.5);
          let m;
          if (bg.value === 'ai') { try { m = await addMediaBlob(await AI.image(`calm atmospheric background that fits the quote "${text}", soft light, no text, ${IMG_STYLES.cinema[1]}`), 'KI: Zitat-Hintergrund', { type: 'image' }); } catch (e) { toast(e.message, 'warn'); } }
          if (!m) { const p = PALETTES[Math.floor(Math.random() * PALETTES.length)]; m = await makeGradient(p[0], p[1], { glow: p[2], label: 'Verlauf' }); }
          this.img(m, off, dur, { kb: 'zoomIn', look: 'dream', f: { ...FILTER_DEF(), ...LOOKS.dream.f, vign: 40 } });
          this.text('typewriter', `„${text}“`, off + .4, dur - .6, { size: 70, boxW: .8, y: .45 });
          if (a.value.trim()) this.text('elegant', '— ' + a.value.trim(), off + dur * .55, dur * .45 - .2, { size: 50, y: .66 });
          this.fx('grain', off, dur, .35); this.fx('fadeout', off + dur - .8, .8);
          await this.music('ambient', off, dur, .6);
          this.finish('Zitat', off);
        } finally { busy.close(); }
      });
    }
    if (key === 'top5') {
      const title = inp('Titel', 'Top 5 Reiseziele in Europa');
      const items = ['Lissabon', 'Prag', 'Dubrovnik', 'Amsterdam', 'Santorini'].map((v, i) => inp(`Platz ${5 - i}`, v));
      const ai = el('select', { class: 'sel' }, el('option', { value: 'ai' }, 'KI-Bild pro Platz (online)'), el('option', { value: 'gradient' }, 'Farbverläufe (offline)'));
      this.form('Top-5-Countdown', [{ label: 'Titel', el: title }, { label: 'Plätze 5 bis 1', el: el('div', { class: 'grid2' }, items) }, { label: 'Bilder', el: ai }], async () => {
        const mode = await this.askMode(); if (!mode) return false;
        const busy = Busy.show('Countdown wird erstellt …');
        try {
          const off = this.begin(mode), seg = 3; let t = off;
          const p0 = PALETTES[0]; const tm = await makeGradient(p0[0], p0[1], { glow: p0[2], label: 'Titel-Hintergrund' });
          this.img(tm, t, 2.5, { kb: 'zoomIn' }); this.text('title', title.value || 'Top 5', t, 2.5); t += 2.5;
          for (let i = 0; i < 5; i++) {
            busy.set(i / 5, `Platz ${5 - i} …`);
            const name = items[i].value || `Platz ${5 - i}`;
            let m = null;
            if (ai.value === 'ai') { try { m = await addMediaBlob(await AI.image(`${name}, ${title.value}, ${IMG_STYLES.photo[1]}`), 'KI: ' + name, { type: 'image' }); } catch (e) { if (i === 0) toast(e.message, 'warn'); } }
            if (!m) { const p = PALETTES[(i + 1) % PALETTES.length]; m = await makeGradient(p[0], p[1], { glow: p[2], label: name }); }
            this.img(m, t, seg, { kb: i % 2 ? 'zoomOut' : 'zoomIn', trans: { type: 'zoomIn', dur: .4 }, look: 'vivid', f: { ...FILTER_DEF(), ...LOOKS.vivid.f } });
            this.text('meme', `#${5 - i}`, t + .1, seg - .2, { size: 260, y: .28, animIn: 'pop', strokeW: 14 });
            this.text('box', name, t + .35, seg - .45, { size: 66, y: .62, animIn: 'slideU', upper: true });
            this.fx('flash', t, .5, .5); await this.sfx('whoosh', Math.max(0, t - .3), .6);
            t += seg;
          }
          this.fx('confetti', t - seg, seg, .7);
          await this.music('trap', off, t - off, .55);
          this.finish(title.value || 'Top 5', off);
        } finally { busy.close(); }
      });
    }
    if (key === 'beforeafter') {
      const pa = this.picker(['image', 'video'], false), pb = this.picker(['image', 'video'], false);
      this.form('Vorher / Nachher', [{ label: 'Vorher', el: pa.el }, { label: 'Nachher', el: pb.el }], async () => {
        const [a] = pa.get(), [b] = pb.get(); if (!a || !b) { toast('Wähle je ein Bild oder Video für Vorher und Nachher.', 'warn'); return false; }
        const mode = await this.askMode(); if (!mode) return false;
        const off = this.begin(mode), d1 = a.type === 'video' ? Math.min(a.duration, 4) : 3, d2 = b.type === 'video' ? Math.min(b.duration, 4) : 3.5;
        this.put(clipFromMedia(a, { start: off, dur: d1 }), 'video');
        this.put(clipFromMedia(b, { start: off + d1, dur: d2, trans: { type: 'wipe', dur: 1.2 } }), 'video');
        this.text('lower', 'Vorher', off + .2, d1 - .8, { x: .3, y: .1, boxW: .5 });
        this.text('lower', 'Nachher', off + d1 + .5, d2 - .6, { x: .3, y: .1, boxW: .5, bgColor: '#3ddc97' });
        await this.sfx('swoosh', off + d1 - .4, .7);
        this.finish('Vorher / Nachher', off);
      });
    }
    if (key === 'meme') {
      const pk = this.picker(['image', 'video'], false), top = inp('Text oben', 'Wenn der Export endlich fertig ist'), bot = inp('Text unten', 'und es kostet nichts');
      this.form('Meme', [{ label: 'Bild oder Video', el: pk.el }, { label: 'Oben', el: top }, { label: 'Unten', el: bot }], async () => {
        const [m] = pk.get(); if (!m) { toast('Wähle ein Bild oder Video.', 'warn'); return false; }
        const mode = await this.askMode(); if (!mode) return false;
        const off = this.begin(mode), d = m.type === 'video' ? m.duration : 5;
        this.put(clipFromMedia(m, { start: off, dur: d, fit: 'contain' }), 'video');
        if (top.value) this.text('meme', top.value, off, d, { y: .13, size: 92 });
        if (bot.value) this.text('meme', bot.value, off, d, { y: .87, size: 92 });
        this.finish('Meme', off);
      });
    }
    if (key === 'intro') {
      const name = inp('Name / Kanal', 'CLIPWERK'), sub = inp('Untertitel', 'Kreativ. Kostenlos. Deins.');
      this.form('Intro / Logo-Reveal', [{ label: 'Name', el: name }, { label: 'Zusatzzeile', el: sub }], async () => {
        const mode = await this.askMode(); if (!mode) return false;
        const off = this.begin(mode), d = 5.5;
        const bg = await makeGradient('#07080c', '#1b1f3a', { glow: '#ffb547', label: 'Intro-Hintergrund' });
        this.img(bg, off, d, { kb: 'zoomIn' });
        await this.sfx('riser', off, .7); await this.sfx('boom', off + 2.3, 1);
        this.text('title', name.value || 'INTRO', off + 2.3, d - 2.3, { effect: 'glitch', effAmt: .45, animIn: 'zoomOut', animDur: .4, size: 190, spacing: 6 });
        if (sub.value) this.text('elegant', sub.value, off + 3.2, d - 3.2, { size: 52, y: .55, animIn: 'fade' });
        this.fx('flash', off + 2.3, .6, 1); this.fx('lightleak', off + 2.3, d - 2.3, .5); this.fx('letterbox', off, d, .6); this.fx('shake', off + 2.3, .35, .8);
        this.finish('Intro', off);
      });
    }
    if (key === 'product') {
      const pk = this.picker(['image', 'video']), nm = inp('Produktname', 'Aurora Kopfhörer'), pr = inp('Preis', '79,99 €'), cta = inp('Aufruf', 'Jetzt im Shop – Link in Bio');
      this.form('Produkt-Showcase', [{ label: 'Produktfotos', el: pk.el }, { label: 'Name', el: nm }, { label: 'Preis', el: pr }, { label: 'Aufruf zum Kaufen', el: cta }], async () => {
        const ms = pk.get(); if (!ms.length) { toast('Wähle mindestens ein Produktfoto.', 'warn'); return false; }
        const mode = await this.askMode(); if (!mode) return false;
        const off = this.begin(mode); let t = off; const per = 2.03;
        ms.forEach((m, i) => { this.put(clipFromMedia(m, { start: t, dur: m.type === 'video' ? Math.min(m.duration, per * 2) : per, kb: i % 2 ? 'zoomOut' : 'zoomIn', trans: { type: i ? 'slideL' : 'none', dur: .35 } }), 'video'); t = clipEnd(State.clips[State.clips.length - 1]); });
        if (t - off < 6) { const last = State.clips[State.clips.length - 1]; last.dur += 6 - (t - off); t = off + 6; }
        this.text('title', nm.value, off + .2, 2.4, { size: 120 });
        this.text('comic', pr.value, off + (t - off) * .45, (t - off) * .55, { y: .62, size: 140, animIn: 'pop', tAnim: 'none' });
        this.text('lower', cta.value, off + (t - off) * .6, (t - off) * .4, { y: .84 });
        this.fx('zoompulse', off, t - off, .35); this.fx('sparkle', off + (t - off) * .45, (t - off) * .55, .5);
        await this.music('pop', off, t - off, .7);
        this.finish(nm.value || 'Produkt', off);
      });
    }
    if (key === 'podcast') {
      const pk = this.picker(['video'], false), ttl = inp('Titel', 'Folge 12: Kreativ mit wenig Budget'), caps = el('select', { class: 'sel' }, el('option', { value: 'yes' }, 'Ja, automatisch erzeugen'), el('option', { value: 'no' }, 'Nein'));
      this.form('Podcast- / Talk-Clip', [{ label: 'Video', el: pk.el }, { label: 'Titel', el: ttl }, { label: 'Auto-Untertitel', el: caps }], async () => {
        const [m] = pk.get(); if (!m) { toast('Wähle ein Video.', 'warn'); return false; }
        const mode = await this.askMode(); if (!mode) return false;
        const off = this.begin(mode), c = this.put(clipFromMedia(m, { start: off, look: 'kino', f: { ...FILTER_DEF(), ...LOOKS.kino.f } }), 'video');
        this.text('lower', ttl.value, off, c.dur, { y: .1, x: .5, align: 'center', boxW: .8, size: 48, animIn: 'slideD' });
        this.fx('progress', off, c.dur, 1);
        this.finish('Podcast-Clip', off);
        if (caps.value === 'yes') Captions.transcribe({ clipId: c.id, engine: Settings.get('capEngine', 'local'), model: Settings.get('capModel'), wordsPer: 3, style: 'tiktok' });
      });
    }
  },
  async buildStory(S, force) {
    const scenes = S.scenes.filter(s => (s.text || s.image || '').trim());
    if (!scenes.length) { toast('Schreib zuerst das Drehbuch (Schritt 1) oder trage Szenen ein.', 'warn'); return; }
    const mode = force || await this.askMode(); if (!mode) return;
    const busy = Busy.show('KI-Video wird erstellt …', 'Bilder werden gemalt. Das dauert pro Szene ein paar Sekunden.');
    try {
      const off = this.begin(mode), [w, h] = AI.size(), style = IMG_STYLES[S.style] ? IMG_STYLES[S.style][1] : '';
      const kbs = ['zoomIn', 'panL', 'zoomOut', 'panR', 'panU'], trs = ['fade', 'zoomIn', 'slideL', 'blur', 'circle', 'wipe'];
      let t = off, voiceOk = S.voice !== 'none', imgFails = 0;
      const seed = Math.floor(Math.random() * 1e6);
      for (const [i, sc] of scenes.entries()) {
        busy.set(i / scenes.length, `Szene ${i + 1} von ${scenes.length}: Bild wird gemalt …`);
        let m = null;
        try { m = await addMediaBlob(await AI.image([sc.image || `${S.topic}, ${sc.text}`, style].filter(Boolean).join(', '), { w, h, seed: seed + i }), `KI-Szene ${i + 1}`, { type: 'image', source: 'Pollinations KI' }); }
        catch (e) { imgFails++; if (imgFails === 1) toast(e.message + ' Es wird ein Farbverlauf eingesetzt.', 'warn', 7000); const p = PALETTES[i % PALETTES.length]; m = await makeGradient(p[0], p[1], { glow: p[2], label: `Szene ${i + 1}` }); }
        let vd = 0;
        if (voiceOk && sc.text.trim()) {
          busy.set((i + .6) / scenes.length, `Szene ${i + 1}: Sprecher …`);
          try { const vm = await makeVoice(sc.text, S.voice === 'local' ? 'local' : 'online', S.voice === 'local' ? 'de_DE-thorsten-medium' : 'nova'); vd = vm.duration; this.put(newClip('audio', { media: vm.id, name: 'Sprecher ' + (i + 1), start: t + .15, dur: vd }), 'audio', 'Stimme'); }
          catch (e) { voiceOk = false; toast('Sprecher nicht verfügbar: ' + e.message, 'warn', 7000); }
        }
        const dur = Math.max(S.sec, vd + .45);
        this.img(m, t, dur, { kb: kbs[i % kbs.length], trans: { type: i ? trs[i % trs.length] : 'none', dur: .5 } });
        if (sc.text.trim()) Captions.fromSegments([{ text: sc.text.trim(), t0: t + .15, t1: t + (vd ? vd + .15 : dur - .1) }], { style: S.caps, silent: true });
        t += dur;
      }
      if (S.title) this.text('title', S.title, off, Math.min(2.4, t - off), { y: .38, size: 130 });
      this.fx('fadeout', t - .7, .7);
      busy.set(1, 'Musik wird komponiert …');
      await this.music(S.music, off, t - off, voiceOk ? .22 : .7, seed % 97 + 1);
      this.finish(S.title || S.topic || 'KI-Video', off);
      toast('Dein KI-Video ist fertig! Drücke Leertaste zum Abspielen.', 'ok', 6000);
    } catch (e) { console.error(e); toast('Erstellen fehlgeschlagen: ' + e.message, 'error'); }
    finally { busy.close(); }
  },
};
