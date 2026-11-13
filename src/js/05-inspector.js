/* ==========================================================================
   Inspektor: Eigenschaften des gewählten Clips bzw. des Projekts
   ========================================================================== */
const Inspector = {
  root: null, rows: [], open: new Set(['Text', 'Position', 'Zeit', 'Projekt', 'Effekt-Einstellungen', 'Audio']),
  init() { this.root = $('#insp'); this.render(); },
  render() {
    if (!this.root) return;
    this.rows = [];
    const c = selectedClip();
    const frag = document.createDocumentFragment();
    if (!c) frag.append(...this.projectView()); else frag.append(...this.clipView(c));
    this.root.replaceChildren(frag);
  },
  live() {
    for (const r of this.rows) { try { r(); } catch { } }
  },
  section(title, body, extra) {
    const d = el('details', { class: 'sec', open: this.open.has(title) },
      el('summary', {}, el('span', {}, title), extra || null), el('div', { class: 'sec-body' }, body));
    d.addEventListener('toggle', () => { d.open ? this.open.add(title) : this.open.delete(title); });
    return d;
  },
  row(label, ...ctl) { return el('div', { class: 'row' }, el('label', { class: 'row-l' }, label), el('div', { class: 'row-c' }, ...ctl)); },
  slider({ label, get, set, min, max, step = 1, unit = '', k = 1, kf, c, onDone }) {
    const rng = el('input', { type: 'range', min, max, step, class: 'rng' });
    const num = el('input', { type: 'number', min, max, step, class: 'num' });
    const show = () => { if (document.activeElement === num || rng._drag) return; const v = +(get() * k).toFixed(3); rng.value = v; num.value = +v.toFixed(step < 1 ? 2 : 0); updKf(); };
    const apply = (v, final) => { v = +v; if (isNaN(v)) return; set(v / k); changed({ timeline: !!kf }); if (final) { commit(); onDone && onDone(); } updKf(); };
    rng.addEventListener('pointerdown', () => rng._drag = true); rng.addEventListener('pointerup', () => rng._drag = false);
    rng.addEventListener('input', () => { num.value = rng.value; apply(rng.value); });
    rng.addEventListener('change', () => { rng._drag = false; apply(rng.value, true); });
    num.addEventListener('change', () => { rng.value = num.value; apply(num.value, true); });
    let kb = null;
    const updKf = () => { if (!kb) return; const local = State.time - c.start, on = hasKf(c, kf); kb.classList.toggle('has', on); kb.classList.toggle('at', on && kfIndexAt(c, kf, local) >= 0); };
    if (kf) {
      kb = el('button', { class: 'kf-btn', title: 'Keyframe setzen/entfernen am Abspielkopf', html: icon('diamond') });
      kb.onclick = () => {
        const local = State.time - c.start;
        if (local < 0 || local > c.dur) { toast('Setze den Abspielkopf in den Clip, um Keyframes zu setzen.', 'warn'); return; }
        toggleKf(c, kf, local); commit(); changed(); show();
      };
    }
    show(); this.rows.push(show);
    const r = el('div', { class: 'row slider' }, el('label', { class: 'row-l' }, label), el('div', { class: 'row-c' }, rng, num, unit ? el('span', { class: 'unit' }, unit) : null, kb));
    return r;
  },
  select(label, options, get, set, opts = {}) {
    const s = el('select', { class: 'sel' }, Object.entries(options).map(([k, v]) => el('option', { value: k }, v)));
    s.value = get(); s.onchange = () => { set(s.value); commit(); changed({ inspector: !!opts.rerender }); };
    return label ? this.row(label, s) : s;
  },
  color(label, get, set) {
    const i = el('input', { type: 'color', class: 'col', value: get() });
    i.oninput = () => { set(i.value); changed({ timeline: false }); }; i.onchange = () => commit();
    return label ? this.row(label, i) : i;
  },
  toggle(label, get, set, rer) {
    const b = el('button', { class: 'tgl' + (get() ? ' on' : ''), role: 'switch', 'aria-checked': String(!!get()) }, el('span'));
    b.onclick = () => { set(!get()); b.classList.toggle('on', !!get()); b.setAttribute('aria-checked', String(!!get())); commit(); changed({ inspector: !!rer }); };
    return this.row(label, b);
  },
  seg(options, get, set, rer) {
    const w = el('div', { class: 'seg' });
    for (const [k, v] of Object.entries(options)) {
      const b = el('button', { class: get() === k ? 'on' : '', html: v.icon ? icon(v.icon) + `<span>${v.label}</span>` : `<span>${v}</span>` });
      b.onclick = () => { set(k); commit(); changed({ inspector: rer !== false }); };
      w.append(b);
    }
    return w;
  },
  /* ---------- Projekt ---------- */
  projectView() {
    const P = State.project;
    const out = [];
    out.push(el('div', { class: 'insp-head' }, el('div', { class: 'insp-title' }, el('span', { class: 'badge' }, 'Projekt'), el('strong', {}, 'Kein Clip gewählt')), el('p', { class: 'muted small' }, 'Klicke einen Clip in der Timeline oder im Vorschaubild an, um ihn zu bearbeiten.')));
    out.push(this.section('Projekt', [
      this.select('Format', Object.fromEntries(Object.entries(FORMATS).map(([k, v]) => [k, v.label])), () => P.format, v => { P.format = v; applyFormat(); refreshAll(); }),
      this.select('Bildrate', { 24: '24 fps (Kino)', 25: '25 fps (PAL)', 30: '30 fps (Social Media)', 50: '50 fps', 60: '60 fps (flüssig)' }, () => String(P.fps), v => { P.fps = +v; }),
      this.color('Hintergrund', () => P.bg, v => P.bg = v),
      el('div', { class: 'stat-grid' },
        el('div', {}, el('span', {}, 'Länge'), el('strong', { class: 'mono' }, fmtTC(projectDuration(), P.fps))),
        el('div', {}, el('span', {}, 'Clips'), el('strong', { class: 'mono' }, String(State.clips.length))),
        el('div', {}, el('span', {}, 'Auflösung'), el('strong', { class: 'mono' }, `${P.w}×${P.h}`))),
    ]));
    out.push(this.section('Ansicht', [
      this.toggle('Sicherheitszone (TikTok/Reels)', () => State.safeZone, v => { State.safeZone = v; Preview.requestRender(); }),
      this.toggle('Drittel-Raster', () => State.grid, v => { State.grid = v; Preview.requestRender(); }),
      this.select('Vorschauqualität', { eco: 'Sparsam (schwache PCs)', normal: 'Normal', high: 'Hoch' }, () => Preview.quality(), v => { Settings.set('previewQ', v); Preview.resize(); }),
    ]));
    out.push(this.section('Tastenkürzel', el('dl', { class: 'keys' },
      ...[['Leertaste', 'Abspielen / Pause'], ['S', 'Am Abspielkopf teilen'], ['Entf', 'Clip löschen'], ['Strg + D', 'Duplizieren'], ['Strg + Z / Y', 'Rückgängig / Wiederholen'], ['← / →', 'Ein Bild zurück / vor'], ['Pos1 / Ende', 'Anfang / Ende'], ['Strg + Mausrad', 'Timeline zoomen'], ['Mausrad im Bild', 'Clip skalieren'], ['Alt beim Ziehen', 'Einrasten aus']].map(([k, v]) => [el('dt', {}, el('kbd', {}, k)), el('dd', {}, v)]))));
    return out;
  },
  /* ---------- Clip ---------- */
  clipView(c) {
    const out = [], m = mediaOf(c), local = () => State.time - c.start;
    const nameIn = el('input', { class: 'inp name', value: c.kind === 'text' ? (c.name || 'Text') : (c.name || KIND_LABEL[c.kind]) });
    nameIn.onchange = () => { c.name = nameIn.value; commit(); Timeline.render(); };
    out.push(el('div', { class: 'insp-head' },
      el('div', { class: 'insp-title' }, el('span', { class: 'badge k-' + c.kind }, KIND_LABEL[c.kind]), nameIn),
      el('div', { class: 'insp-actions' },
        el('button', { class: 'ib', title: 'Duplizieren (Strg+D)', html: icon('copy'), onclick: () => duplicateSelected() }),
        el('button', { class: 'ib', title: 'Am Abspielkopf teilen (S)', html: icon('scissors'), onclick: () => splitAtPlayhead() }),
        el('button', { class: 'ib danger', title: 'Löschen (Entf)', html: icon('trash'), onclick: () => deleteSelected() }))));

    if (c.kind === 'text') out.push(this.textSection(c));
    if (c.kind === 'fx') {
      out.push(this.section('Effekt-Einstellungen', [
        this.select('Effekt', FX_LIST, () => c.fx, v => { c.fx = v; c.name = FX_LIST[v]; }),
        this.slider({ label: 'Stärke', get: () => c.amt, set: v => c.amt = v, min: 0, max: 100, k: 100, unit: '%' }),
        el('p', { class: 'muted small' }, 'Effekte auf der Effekt-Spur wirken auf alle Bild- und Videospuren darunter.'),
      ]));
    }
    // Zeit
    const timeRows = [
      this.slider({ label: 'Start', get: () => c.start, set: v => { c.start = Math.max(0, v); }, min: 0, max: Math.max(60, Math.ceil(projectDuration() + 10)), step: .01, unit: 's', onDone: () => { if (trackOf(c)?.magnet) { packTrack(c.track); refreshAll(); } } }),
      this.slider({ label: 'Dauer', get: () => c.dur, set: v => { let d = Math.max(.1, v); if ((c.kind === 'video' || c.kind === 'audio') && m) d = Math.min(d, (m.duration - (c.in || 0)) / (c.speed || 1)); c.dur = d; if (trackOf(c)?.magnet) packTrack(c.track); }, min: .1, max: Math.max(30, Math.ceil(c.dur * 2)), step: .01, unit: 's' }),
    ];
    if (c.kind === 'video' || c.kind === 'audio') {
      timeRows.push(this.select('Geschwindigkeit', { '0.25': '0,25× Zeitlupe', '0.5': '0,5×', '0.75': '0,75×', '1': '1× Normal', '1.25': '1,25×', '1.5': '1,5×', '2': '2× Zeitraffer', '3': '3×', '4': '4×' }, () => String(c.speed || 1), v => {
        const ns = +v, os = c.speed || 1; c.dur = c.dur * os / ns; if (m) c.dur = Math.min(c.dur, (m.duration - (c.in || 0)) / ns); c.speed = ns; if (trackOf(c)?.magnet) packTrack(c.track); Timeline.render();
      }, { rerender: true }));
    }
    out.push(this.section('Zeit', timeRows));

    if (isVisualKind(c.kind)) {
      const pos = [];
      if (c.kind !== 'text') pos.push(this.row('Anpassung', this.seg({ cover: 'Füllen', contain: 'Einpassen' }, () => c.fit, v => c.fit = v)));
      pos.push(
        this.slider({ label: 'Position X', get: () => kfv(c, 'x', local()), set: v => setProp(c, 'x', v, local()), min: -50, max: 150, k: 100, unit: '%', kf: 'x', c }),
        this.slider({ label: 'Position Y', get: () => kfv(c, 'y', local()), set: v => setProp(c, 'y', v, local()), min: -50, max: 150, k: 100, unit: '%', kf: 'y', c }),
        this.slider({ label: 'Größe', get: () => kfv(c, 'scale', local()), set: v => setProp(c, 'scale', v, local()), min: 5, max: 400, k: 100, unit: '%', kf: 'scale', c }),
        this.slider({ label: 'Drehung', get: () => kfv(c, 'rot', local()), set: v => setProp(c, 'rot', v, local()), min: -180, max: 180, unit: '°', kf: 'rot', c }),
        this.slider({ label: 'Deckkraft', get: () => kfv(c, 'opacity', local()), set: v => setProp(c, 'opacity', v, local()), min: 0, max: 100, k: 100, unit: '%', kf: 'opacity', c }),
        el('div', { class: 'btn-row' },
          el('button', { class: 'btn ghost sm' + (c.flipH ? ' on' : ''), html: icon('flipH') + 'Spiegeln', onclick: () => { c.flipH = !c.flipH; commit(); changed({ inspector: true }); } }),
          el('button', { class: 'btn ghost sm' + (c.flipV ? ' on' : ''), html: icon('flipV') + 'Kippen', onclick: () => { c.flipV = !c.flipV; commit(); changed({ inspector: true }); } }),
          el('button', { class: 'btn ghost sm', html: icon('rotate') + '90°', onclick: () => { setProp(c, 'rot', ((Math.round(kfv(c, 'rot', local()) / 90) * 90 + 90 + 180) % 360) - 180, local()); commit(); changed({ inspector: true }); } }),
          el('button', { class: 'btn ghost sm', html: icon('refresh') + 'Zurücksetzen', onclick: () => { Object.assign(c, { x: .5, y: .5, scale: 1, rot: 0, opacity: 1, flipH: false, flipV: false, kf: {} }); commit(); changed({ inspector: true }); } })),
      );
      if (allKfTimes(c).length) pos.push(el('p', { class: 'muted small' }, `◆ ${allKfTimes(c).length} Keyframe-Zeitpunkt(e). Werte ändern am Abspielkopf setzt Keyframes automatisch.`));
      const tr = trackOf(c);
      if (tr && tr.type === 'overlay') pos.push(this.select('Mischmodus', BLENDS, () => c.blend || 'source-over', v => c.blend = v));
      out.push(this.section('Position', pos, el('span', { class: 'sec-hint', title: 'Keyframes: Raute neben einem Regler anklicken' }, '◆ Keyframes')));

      const anim = [this.select('Animation rein', ANIMS, () => c.animIn, v => c.animIn = v), this.select('Animation raus', ANIMS, () => c.animOut, v => c.animOut = v),
        this.slider({ label: 'Animationsdauer', get: () => c.animDur, set: v => c.animDur = v, min: .1, max: 3, step: .05, unit: 's' })];
      if (c.kind !== 'text') anim.push(this.select('Ken-Burns-Fahrt', KENBURNS, () => c.kb || 'none', v => c.kb = v));
      out.push(this.section('Animation', anim));

      if (c.kind !== 'text') {
        const prev = State.clips.find(p => p.track === c.track && p !== c && Math.abs(clipEnd(p) - c.start) < .05);
        out.push(this.section('Übergang', prev ? [
          this.select('Übergang davor', TRANSITIONS, () => c.trans.type, v => { c.trans.type = v; Timeline.render(); }),
          this.slider({ label: 'Dauer', get: () => c.trans.dur, set: v => c.trans.dur = v, min: .2, max: 2, step: .05, unit: 's' }),
          el('button', { class: 'btn ghost sm', html: icon('copy') + 'Auf alle Clips der Spur anwenden', onclick: () => { for (const x of clipsOn(c.track)) if (x !== clipsOn(c.track)[0]) x.trans = { ...c.trans }; commit(); changed(); toast('Übergang auf alle Schnitte angewendet.', 'ok'); } }),
        ] : [el('p', { class: 'muted small' }, 'Übergänge entstehen zwischen zwei direkt aneinanderliegenden Clips auf derselben Spur. Lege einen Clip davor, dann erscheint hier die Auswahl.')]));
        out.push(this.filterSection(c));
        out.push(this.bgSection(c));
      }
      out.push(this.section('Effekt', [this.select('Clip-Effekt', CLIP_EFFECTS, () => c.effect || 'none', v => c.effect = v), this.slider({ label: 'Stärke', get: () => c.effAmt ?? .6, set: v => c.effAmt = v, min: 0, max: 100, k: 100, unit: '%' })]));
    }
    if (c.kind === 'video' || c.kind === 'audio') {
      out.push(this.section('Audio', [
        this.slider({ label: 'Lautstärke', get: () => c.volume ?? 1, set: v => c.volume = v, min: 0, max: 200, k: 100, unit: '%' }),
        c.kind === 'video' ? this.toggle('Ton aus', () => c.mute, v => c.mute = v) : null,
        this.slider({ label: 'Einblenden', get: () => c.fadeIn || 0, set: v => c.fadeIn = v, min: 0, max: Math.min(10, c.dur / 2), step: .1, unit: 's' }),
        this.slider({ label: 'Ausblenden', get: () => c.fadeOut || 0, set: v => c.fadeOut = v, min: 0, max: Math.min(10, c.dur / 2), step: .1, unit: 's' }),
        el('div', { class: 'btn-row' },
          el('button', { class: 'btn ghost sm', html: icon('sparkle') + 'Rauschen entfernen', onclick: () => Denoise.run(c) }),
          el('button', { class: 'btn ghost sm', html: icon('cc') + 'Untertitel erzeugen', onclick: () => { Panels.show('captions'); Captions.preselect(c); } }),
          c.kind === 'video' ? el('button', { class: 'btn ghost sm', html: icon('wave') + 'Audio abtrennen', onclick: () => detachAudio(c) }) : null),
      ]));
    }
    return out;
  },
  textSection(c) {
    const ta = el('textarea', { id: 'inspText', class: 'inp', rows: 3 }, c.text);
    ta.oninput = () => { c.text = ta.value; changed(); };
    ta.onchange = () => commit();
    const fontSel = el('select', { class: 'sel' }, FONT_LIST.map(f => el('option', { value: f, style: { fontFamily: `"${f}"` } }, f)));
    fontSel.value = c.font; fontSel.onchange = () => { c.font = fontSel.value; commit(); changed(); document.fonts && document.fonts.load(`${c.weight} 40px "${c.font}"`).then(() => Preview.requestRender()); };
    const styleSel = el('select', { class: 'sel' }, el('option', { value: '' }, 'Stil-Vorlage anwenden …'), Object.entries(TEXT_PRESETS).map(([k, v]) => el('option', { value: k }, v.label)));
    styleSel.onchange = () => { const p = TEXT_PRESETS[styleSel.value]; if (!p) return; const keep = { text: c.text, x: c.x, y: c.y }; Object.assign(c, JSON.parse(JSON.stringify(TEXT_DEFAULT)), JSON.parse(JSON.stringify(p.p)), keep); commit(); changed({ inspector: true }); };
    return this.section('Text', [
      ta, styleSel,
      this.row('Schrift', fontSel),
      this.select('Stärke', { 400: 'Normal', 600: 'Halbfett', 700: 'Fett', 800: 'Extra fett', 900: 'Schwarz' }, () => String(c.weight), v => c.weight = +v),
      this.slider({ label: 'Größe', get: () => c.size, set: v => c.size = v, min: 16, max: 320, unit: 'px' }),
      this.row('Ausrichtung', this.seg({ left: 'Links', center: 'Mitte', right: 'Rechts' }, () => c.align, v => c.align = v)),
      this.color('Farbe', () => c.color, v => c.color = v),
      this.toggle('Großbuchstaben', () => c.upper, v => c.upper = v),
      this.toggle('Kursiv', () => c.italic, v => c.italic = v),
      this.slider({ label: 'Konturbreite', get: () => c.strokeW, set: v => c.strokeW = v, min: 0, max: 24 }),
      this.color('Konturfarbe', () => c.stroke, v => c.stroke = v),
      this.toggle('Schatten', () => c.shadow, v => c.shadow = v),
      this.toggle('Leuchten (Neon)', () => c.glow, v => c.glow = v),
      this.toggle('Hintergrund-Box', () => c.bgOn, v => c.bgOn = v, true),
      c.bgOn ? this.color('Box-Farbe', () => c.bgColor, v => c.bgColor = v) : null,
      c.bgOn ? this.slider({ label: 'Box-Deckkraft', get: () => c.bgAlpha, set: v => c.bgAlpha = v, min: 0, max: 100, k: 100, unit: '%' }) : null,
      this.slider({ label: 'Zeilenabstand', get: () => c.lineH, set: v => c.lineH = v, min: .8, max: 2.2, step: .05 }),
      this.slider({ label: 'Buchstabenabstand', get: () => c.spacing || 0, set: v => c.spacing = v, min: -10, max: 40 }),
      this.slider({ label: 'Textbreite', get: () => c.boxW, set: v => c.boxW = v, min: 20, max: 100, k: 100, unit: '%' }),
      this.select('Text-Animation', TEXT_ANIMS, () => c.tAnim || 'none', v => c.tAnim = v, { rerender: true }),
      c.tAnim === 'karaoke' ? this.color('Markierung', () => c.hl, v => c.hl = v) : null,
    ]);
  },
  filterSection(c) {
    const looks = el('div', { class: 'chips' }, Object.entries(LOOKS).map(([k, v]) => el('button', { class: 'chip' + (c.look === k ? ' on' : ''), onclick: () => { c.look = k; c.f = { ...FILTER_DEF(), ...v.f }; commit(); changed({ inspector: true }); } }, v.label)));
    const f = c.f;
    const s = (label, key, min, max) => this.slider({ label, get: () => f[key] || 0, set: v => { f[key] = v; c.look = 'custom'; }, min, max });
    return this.section('Filter & Look', [looks,
      s('Helligkeit', 'bright', -100, 100), s('Kontrast', 'contrast', -100, 100), s('Sättigung', 'sat', -100, 100), s('Farbton', 'hue', -180, 180),
      s('Wärme', 'temp', -100, 100), s('Verblassen', 'fade', 0, 100), s('Vignette', 'vign', 0, 100), s('Filmkorn', 'grain', 0, 100), s('Weichzeichner', 'blur', 0, 100), s('Sepia', 'sepia', 0, 100),
      el('button', { class: 'btn ghost sm', html: icon('refresh') + 'Filter zurücksetzen', onclick: () => { c.f = FILTER_DEF(); c.look = 'none'; commit(); changed({ inspector: true }); } })]);
  },
  bgSection(c) {
    const b = c.bg;
    const rows = [this.seg({ none: { label: 'Aus', icon: 'close' }, person: { label: 'Person (KI)', icon: 'person' }, chroma: { label: 'Greenscreen', icon: 'grid' } }, () => b.mode, v => { b.mode = v; BgRemoval.cache.delete(c.id); if (v === 'person') BgRemoval.load().catch(() => { }); })];
    if (b.mode === 'person') rows.push(el('p', { class: 'muted small' }, 'Die KI erkennt Personen und entfernt den Hintergrund – läuft lokal auf deinem PC, ohne Upload. Lege den Clip auf die Overlay-Spur, um einen neuen Hintergrund darunter zu setzen.'), this.toggle('Maske umkehren', () => b.invert, v => { b.invert = v; }));
    if (b.mode === 'chroma') rows.push(
      el('div', { class: 'btn-row' }, el('button', { class: 'btn ghost sm', onclick: () => { b.color = '#00ff00'; commit(); changed({ inspector: true }); } }, 'Grün'), el('button', { class: 'btn ghost sm', onclick: () => { b.color = '#0047ff'; commit(); changed({ inspector: true }); } }, 'Blau')),
      this.color('Schlüsselfarbe', () => b.color, v => b.color = v),
      this.slider({ label: 'Toleranz', get: () => b.tol, set: v => b.tol = v, min: 0, max: 100, k: 100 }),
      this.slider({ label: 'Weiche Kante', get: () => b.soft, set: v => b.soft = v, min: 0, max: 100, k: 100 }),
      this.toggle('Umkehren', () => b.invert, v => b.invert = v));
    return this.section('Hintergrund entfernen', rows);
  },
};
