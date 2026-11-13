/* ==========================================================================
   Linke Werkzeugleiste: Medien, Vorlagen, KI, Text, Effekte, Audio, Untertitel
   ========================================================================== */
const IMG_STYLES = {
  none: ['Ohne Stil', ''], photo: ['Fotorealistisch', 'photorealistic, 35mm photo, natural light, highly detailed'],
  cinema: ['Kino', 'cinematic film still, dramatic lighting, anamorphic, color graded'], anime: ['Anime', 'anime style, vibrant colors, detailed background, studio quality'],
  render3d: ['3D-Render', '3d render, octane, soft studio lighting, pixar style'], oil: ['Ölgemälde', 'oil painting, visible brush strokes, rich colors'],
  cyber: ['Cyberpunk', 'cyberpunk, neon lights, rainy night, futuristic city'], fantasy: ['Fantasy', 'epic fantasy art, magical atmosphere, concept art'],
  comic: ['Comic', 'comic book style, bold ink lines, halftone shading'], water: ['Aquarell', 'watercolor painting, soft washes, paper texture'],
  minimal: ['Minimalistisch', 'minimalist, clean composition, pastel colors, flat design'], drone: ['Luftaufnahme', 'aerial drone shot, wide angle, epic landscape'],
};
const Panels = {
  tab: 'media', st: { mediaFilter: 'all', aiStyle: 'cinema', aiCount: 2, aiPrompt: '', aiResults: [], story: { topic: '', n: 6, sec: 3.5, style: 'cinema', voice: 'none', music: 'cine', caps: 'tiktok', scenes: [], title: '' }, stockQ: '', stockSrc: 'wm-video', ovSrc: 'music', stockRes: [], musicSeed: 1, ovQ: '', ovRes: [], ttsText: '', ttsEngine: 'online', ttsVoice: 'nova', recPlay: true, recCaps: true },
  tabs: [
    { id: 'media', label: 'Medien', icon: 'film' }, { id: 'templates', label: 'Vorlagen', icon: 'layout' }, { id: 'ai', label: 'KI-Studio', icon: 'sparkle' },
    { id: 'text', label: 'Text', icon: 'text' }, { id: 'effects', label: 'Effekte', icon: 'wand' }, { id: 'audio', label: 'Audio', icon: 'music' }, { id: 'captions', label: 'Untertitel', icon: 'cc' },
  ],
  init() {
    const rail = $('#rail');
    for (const t of this.tabs) rail.append(el('button', { class: 'rail-btn', 'data-tab': t.id, title: t.label, onclick: () => this.show(t.id), html: icon(t.icon) + `<span>${t.label}</span>` }));
    rail.append(el('div', { class: 'rail-spacer' }), el('button', { class: 'rail-btn', title: 'Einstellungen', onclick: () => openSettings(), html: icon('sliders') + '<span>Optionen</span>' }));
    this.show(this.tab);
  },
  show(id) { this.tab = id; $$('.rail-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === id)); this.render(); if (this._ready) document.body.classList.add('panel-open'); this._ready = true; },
  render() { const p = $('#panel'); const v = this['v_' + this.tab](); p.replaceChildren(...[].concat(v).filter(Boolean)); },
  refreshMedia() { if (this.tab === 'media') this.render(); },
  head(title, sub) { return el('div', { class: 'p-head' }, el('h2', {}, title), sub ? el('p', { class: 'muted small' }, sub) : null); },
  card(title, ...body) { return el('section', { class: 'p-card' }, title ? el('h3', { class: 'h3' }, title) : null, ...body); },
  drag(node, data) { node.draggable = true; node.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-clipwerk', JSON.stringify(data)); e.dataTransfer.effectAllowed = 'copy'; }); },

  /* ---------- Medien ---------- */
  v_media() {
    const st = this.st;
    const drop = el('button', { class: 'dropzone', onclick: () => $('#fileInput').click(), html: icon('upload') + '<strong>Dateien importieren</strong><span>Videos, Fotos, Musik – oder einfach ins Fenster ziehen</span>' });
    const filters = el('div', { class: 'chips' }, Object.entries({ all: 'Alle', video: 'Videos', image: 'Bilder', audio: 'Audio' }).map(([k, v]) => el('button', { class: 'chip' + (st.mediaFilter === k ? ' on' : ''), onclick: () => { st.mediaFilter = k; this.render(); } }, v)));
    const items = [...State.media.values()].filter(m => st.mediaFilter === 'all' || m.type === st.mediaFilter).reverse();
    const grid = el('div', { class: 'mgrid' });
    for (const m of items) {
      const used = State.clips.some(c => c.media === m.id);
      const card = el('div', { class: 'mcard t-' + m.type, title: m.name + (m.credit ? '\n' + m.credit : '') },
        el('div', { class: 'mthumb', style: m.thumb ? { backgroundImage: `url(${m.thumb})` } : {} }, m.type === 'audio' ? el('span', { class: 'micon', html: icon('music') }) : null,
          m.duration ? el('span', { class: 'mdur mono' }, fmtSec(m.duration)) : null, used ? el('span', { class: 'mused', title: 'In der Timeline benutzt' }) : null),
        el('div', { class: 'mname' }, m.name),
        el('div', { class: 'mact' },
          el('button', { class: 'ib xs', title: 'Zur Timeline hinzufügen', html: icon('plus'), onclick: (e) => { e.stopPropagation(); addMediaToTimeline(m); } }),
          el('button', { class: 'ib xs', title: 'Mehr', html: icon('menu'), onclick: (e) => { e.stopPropagation(); menu(e.clientX, e.clientY, [
            m.type !== 'audio' ? { label: 'Als Overlay einfügen', icon: 'layers', action: () => addMediaToTimeline(m, { overlay: true, extra: { scale: .55 } }) } : null,
            { label: 'Umbenennen', icon: 'text', action: () => promptText('Datei umbenennen', m.name, v => { if (v) { m.name = v; Store.putMedia(m); this.render(); } }) },
            { label: 'Aus Mediathek entfernen', icon: 'trash', danger: true, action: () => removeMedia(m.id) }].filter(Boolean)); } })));
      card.addEventListener('dblclick', () => addMediaToTimeline(m));
      this.drag(card, { type: 'media', id: m.id });
      grid.append(card);
    }
    const empty = !items.length ? el('p', { class: 'muted small center' }, st.mediaFilter === 'all' ? 'Noch keine Medien. Importiere Dateien, erzeuge KI-Bilder oder suche unten nach freien Fotos.' : 'Keine Dateien dieser Art.') : null;
    return [this.head('Medien', 'Doppelklick oder ＋ fügt an der Abspielposition ein. Du kannst Dateien auch direkt in die Timeline ziehen.'), drop, filters, grid, empty, this.stockCard()];
  },
  stockCard() {
    const st = this.st;
    const q = el('input', { class: 'inp', placeholder: 'z. B. Strand, Stadt bei Nacht, Kaffee …', value: st.stockQ });
    const src = el('select', { class: 'sel' }, el('option', { value: 'wm-video' }, 'Wikimedia – freie Videos'), el('option', { value: 'wm-image' }, 'Wikimedia – freie Fotos'), el('option', { value: 'openverse' }, 'Openverse – freie Fotos'), el('option', { value: 'pexels-photos' }, 'Pexels – Fotos'), el('option', { value: 'pexels-videos' }, 'Pexels – Videos'));
    src.value = st.stockSrc;
    const res = el('div', { class: 'sgrid' });
    const show = () => {
      res.replaceChildren(...st.stockRes.map(it => {
        const b = el('button', { class: 'sitem', title: it.title, style: { backgroundImage: `url(${it.thumb})` } }, it.video ? el('span', { class: 'mdur mono' }, fmtSec(it.dur)) : null);
        b.onclick = async () => { b.classList.add('loading'); await Stock.importUrl(it.urls, it.title, it.video ? 'video' : 'image', it.credit, it.landing); b.classList.remove('loading'); };
        return b;
      }));
    };
    const go = async () => {
      st.stockQ = q.value.trim(); st.stockSrc = src.value; if (!st.stockQ) return;
      res.replaceChildren(el('div', { class: 'spinner sm' }));
      try {
        if (st.stockSrc === 'wm-video' || st.stockSrc === 'wm-image') st.stockRes = (await Stock.wikimedia(st.stockSrc === 'wm-video' ? 'video' : 'image', st.stockQ)).map(r => ({ ...r, urls: [r.url], video: st.stockSrc === 'wm-video' }));
        else if (st.stockSrc === 'openverse') st.stockRes = (await Stock.openverse('images', st.stockQ)).map(r => ({ title: r.title || 'Foto', thumb: r.thumbnail, urls: [r.url, r.thumbnail + '?full_size=true'], credit: `„${r.title || 'Foto'}“ von ${r.creator || 'unbekannt'} (${(r.license || '').toUpperCase()} ${r.license_version || ''}) via Openverse`, landing: r.foreign_landing_url }));
        else if (st.stockSrc === 'pexels-photos') st.stockRes = (await Stock.pexels('photos', st.stockQ)).map(p => ({ title: p.alt || 'Pexels-Foto', thumb: p.src.medium, urls: [p.src.large2x, p.src.large], credit: `Foto von ${p.photographer} auf Pexels`, landing: p.url }));
        else st.stockRes = (await Stock.pexels('videos', st.stockQ)).map(v => { const f = (v.video_files || []).filter(f => f.width <= 1920).sort((a, b) => b.width - a.width); return { title: 'Pexels-Video', thumb: v.image, urls: f.slice(0, 2).map(x => x.link), video: true, dur: v.duration, credit: `Video von ${v.user?.name || 'Pexels'} auf Pexels`, landing: v.url }; });
        if (!st.stockRes.length) res.replaceChildren(el('p', { class: 'muted small' }, 'Nichts gefunden. Versuche ein anderes Wort (oft klappt Englisch besser).'));
        else show();
      } catch (e) { res.replaceChildren(el('p', { class: 'err small' }, e.message)); }
    };
    q.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    if (st.stockRes.length) show();
    return this.card('Freie Fotos & Videos', el('div', { class: 'row-inline' }, q, el('button', { class: 'btn primary sm', html: icon('search'), title: 'Suchen', onclick: go })), src, res,
      el('p', { class: 'muted xs' }, 'Openverse braucht keine Anmeldung. Für Pexels trägst du einmalig einen kostenlosen Schlüssel in den Optionen ein.'));
  },

  /* ---------- Vorlagen ---------- */
  v_templates() {
    const T = [
      ['story', 'KI-Video aus Idee', 'Thema eingeben – Skript, Bilder, Untertitel und Musik entstehen automatisch.', 'sparkle'],
      ['slideshow', 'Foto-Slideshow im Beat', 'Deine Fotos werden im Takt der Musik geschnitten, mit Übergängen.', 'image'],
      ['quote', 'Zitat-Video', 'Ein Zitat auf ruhigem Hintergrund mit Schreibmaschinen-Effekt.', 'text'],
      ['top5', 'Top-5-Countdown', 'Ranking-Video mit großen Nummern – ideal für Listen.', 'layers'],
      ['beforeafter', 'Vorher / Nachher', 'Zwei Bilder oder Clips mit Wisch-Übergang und Beschriftung.', 'split'],
      ['meme', 'Meme', 'Bild oder Video mit Text oben und unten.', 'person'],
      ['intro', 'Intro / Logo-Reveal', 'Kurzes, knalliges Intro mit Glitch, Blitz und Sound.', 'wand'],
      ['product', 'Produkt-Showcase', 'Produktfotos, Preis und Aufruf zum Kaufen.', 'camera'],
      ['podcast', 'Podcast- / Talk-Clip', 'Video mit Titelleiste, Fortschrittsbalken und Auto-Untertiteln.', 'mic'],
    ];
    const grid = el('div', { class: 'tgrid' }, T.map(([k, t, d, ic]) => el('button', { class: 'tcard', onclick: () => Templates.open(k), html: `<span class="tc-ic">${icon(ic)}</span><strong>${t}</strong><span>${d}</span>` })));
    return [this.head('Vorlagen', 'Fertige Abläufe für TikTok, Reels und Shorts. Alles bleibt danach frei bearbeitbar.'), grid];
  },

  /* ---------- KI-Studio ---------- */
  v_ai() {
    const st = this.st;
    const prompt = el('textarea', { class: 'inp', rows: 3, placeholder: 'Beschreibe dein Bild, z. B. „Ein Astronaut reitet auf einem Wal durch die Wolken bei Sonnenuntergang“' }, st.aiPrompt);
    prompt.oninput = () => st.aiPrompt = prompt.value;
    const styles = el('div', { class: 'chips' }, Object.entries(IMG_STYLES).map(([k, [l]]) => el('button', { class: 'chip' + (st.aiStyle === k ? ' on' : ''), onclick: (e) => { st.aiStyle = k; $$('.chip', e.target.parentNode).forEach(x => x.classList.remove('on')); e.target.classList.add('on'); } }, l)));
    const count = el('select', { class: 'sel' }, [1, 2, 3, 4].map(n => el('option', { value: n }, `${n} Bild${n > 1 ? 'er' : ''}`))); count.value = st.aiCount; count.onchange = () => st.aiCount = +count.value;
    const results = el('div', { class: 'aigrid' });
    const drawRes = () => results.replaceChildren(...st.aiResults.map(r => {
      if (r.loading) return el('div', { class: 'airesult loading' }, el('div', { class: 'spinner sm' }));
      if (r.error) return el('div', { class: 'airesult err' }, el('span', { class: 'small' }, r.error));
      const m = State.media.get(r.mid); if (!m) return null;
      return el('div', { class: 'airesult', style: { backgroundImage: `url(${m.thumb})` } }, el('button', { class: 'btn primary xs', html: icon('plus') + 'Timeline', onclick: () => addMediaToTimeline(m) }));
    }).filter(Boolean));
    drawRes();
    const gen = async (btn) => {
      const p = prompt.value.trim(); if (!p) { toast('Beschreibe zuerst, was auf dem Bild zu sehen sein soll.', 'warn'); prompt.focus(); return; }
      btn.disabled = true;
      const full = [p, IMG_STYLES[st.aiStyle][1]].filter(Boolean).join(', ');
      const jobs = Array.from({ length: st.aiCount }, () => ({ loading: true }));
      st.aiResults = [...jobs, ...st.aiResults].slice(0, 12); drawRes();
      for (const j of jobs) {
        try { const b = await AI.image(full); const m = await addMediaBlob(b, 'KI: ' + p.slice(0, 40), { type: 'image', source: 'Pollinations KI' }); j.loading = false; j.mid = m.id; }
        catch (e) { j.loading = false; j.error = e.message; }
        if (this.tab === 'ai') drawRes();
      }
      btn.disabled = false;
    };
    const genBtn = el('button', { class: 'btn primary', html: icon('sparkle') + 'Bild erzeugen' }); genBtn.onclick = () => gen(genBtn);
    const better = el('button', { class: 'btn ghost sm', html: icon('wand') + 'Beschreibung verbessern' });
    better.onclick = async () => {
      if (!prompt.value.trim()) return; better.disabled = true;
      try { prompt.value = (await AI.text(prompt.value, 'Verbessere die Bildbeschreibung für einen KI-Bildgenerator. Antworte NUR mit einer einzigen, detaillierten englischen Beschreibung (max. 60 Wörter), ohne Anführungszeichen.')).trim().replace(/^"|"$/g, ''); st.aiPrompt = prompt.value; }
      catch (e) { toast(e.message, 'error'); } better.disabled = false;
    };
    return [this.head('KI-Studio', 'Kostenlose KI über das Internet – dein PC muss dafür nichts rechnen.'),
      this.card('KI-Bild erzeugen', prompt, el('div', { class: 'row-inline' }, better), el('label', { class: 'fl' }, 'Stil'), styles,
        el('div', { class: 'row-inline' }, count, genBtn), el('p', { class: 'muted xs' }, `Format folgt deinem Projekt (${State.project.format}). Bilder landen automatisch in der Mediathek.`), results),
      this.storyCard(),
      this.card('Gut zu wissen', el('p', { class: 'muted small' }, 'Die KI-Funktionen nutzen den freien Dienst Pollinations.ai. Falls ein Limit greift, hilft ein kostenloser Schlüssel von enter.pollinations.ai – unter Optionen eintragen.'), el('button', { class: 'btn ghost sm', html: icon('key') + 'Optionen öffnen', onclick: () => openSettings() }))];
  },
  storyCard() {
    const S = this.st.story;
    const topic = el('input', { class: 'inp', placeholder: 'Thema, z. B. „5 Fakten über Oktopusse“', value: S.topic }); topic.oninput = () => S.topic = topic.value;
    const n = el('select', { class: 'sel' }, [3, 4, 5, 6, 7, 8, 10].map(x => el('option', { value: x }, `${x} Szenen`))); n.value = S.n; n.onchange = () => S.n = +n.value;
    const sec = el('select', { class: 'sel' }, [2, 2.5, 3, 3.5, 4, 5, 6].map(x => el('option', { value: x }, `${String(x).replace('.', ',')} s pro Szene`))); sec.value = S.sec; sec.onchange = () => S.sec = +sec.value;
    const style = el('select', { class: 'sel' }, Object.entries(IMG_STYLES).map(([k, [l]]) => el('option', { value: k }, 'Bildstil: ' + l))); style.value = S.style; style.onchange = () => S.style = style.value;
    const voice = el('select', { class: 'sel' }, el('option', { value: 'none' }, 'Ohne Sprecher'), el('option', { value: 'online' }, 'KI-Sprecher (online)'), el('option', { value: 'local' }, 'KI-Sprecher (auf dem PC)')); voice.value = S.voice; voice.onchange = () => S.voice = voice.value;
    const music = el('select', { class: 'sel' }, el('option', { value: 'none' }, 'Ohne Musik'), Object.entries(Music.STYLES).map(([k, v]) => el('option', { value: k }, 'Musik: ' + v.label))); music.value = S.music; music.onchange = () => S.music = music.value;
    const caps = el('select', { class: 'sel' }, Object.entries(TEXT_PRESETS).filter(([k]) => ['tiktok', 'box', 'words', 'marker', 'typewriter', 'elegant', 'comic'].includes(k)).map(([k, v]) => el('option', { value: k }, 'Untertitel: ' + v.label))); caps.value = S.caps; caps.onchange = () => S.caps = caps.value;
    const list = el('div', { class: 'scenes' });
    const drawScenes = () => {
      list.replaceChildren(...S.scenes.map((sc, i) => {
        const t = el('textarea', { class: 'inp sm', rows: 2, placeholder: 'Text im Video' }, sc.text); t.oninput = () => sc.text = t.value;
        const p = el('input', { class: 'inp sm', placeholder: 'Bildbeschreibung (Englisch klappt am besten)', value: sc.image }); p.oninput = () => sc.image = p.value;
        return el('div', { class: 'scene' }, el('div', { class: 'scene-n mono' }, String(i + 1).padStart(2, '0')), el('div', { class: 'scene-f' }, t, p),
          el('button', { class: 'ib xs', title: 'Szene entfernen', html: icon('close'), onclick: () => { S.scenes.splice(i, 1); drawScenes(); } }));
      }), el('button', { class: 'btn ghost sm', html: icon('plus') + 'Szene hinzufügen', onclick: () => { S.scenes.push({ text: '', image: '' }); drawScenes(); } }));
    };
    drawScenes();
    const write = el('button', { class: 'btn ghost', html: icon('text') + '1. Drehbuch schreiben' });
    write.onclick = async () => {
      if (!S.topic.trim()) { toast('Gib zuerst ein Thema ein.', 'warn'); topic.focus(); return; }
      write.disabled = true; write.innerHTML = icon('refresh', 'spin') + 'KI schreibt …';
      try {
        const raw = await AI.text(`Schreibe ein kurzes, packendes Social-Media-Video-Skript über: "${S.topic}". Genau ${S.n} Szenen, Sprache der Texte: Deutsch. Antworte ausschließlich mit JSON im Format {"title":"kurzer Titel (max 5 Wörter)","scenes":[{"text":"ein Satz, der im Video eingeblendet und gesprochen wird (max 14 Wörter)","image":"detailed English image prompt for this scene, no text or letters in the image"}]}`, 'Du bist ein kreativer Autor für virale Kurzvideos. Starte mit einem starken Hook. Antworte nur mit gültigem JSON.', { json: true });
        const j = AI.parseJSON(raw);
        S.title = j.title || S.topic; S.scenes = (j.scenes || []).slice(0, 12).map(s => ({ text: s.text || '', image: s.image || s.prompt || '' }));
        if (!S.scenes.length) throw new Error('Die KI hat keine Szenen geliefert. Bitte nochmal versuchen.');
        drawScenes();
      } catch (e) { toast(e.message + ' Du kannst die Szenen auch selbst eintragen.', 'error', 7000); if (!S.scenes.length) { S.scenes = Array.from({ length: S.n }, () => ({ text: '', image: '' })); drawScenes(); } }
      write.disabled = false; write.innerHTML = icon('text') + '1. Drehbuch schreiben';
    };
    const build = el('button', { class: 'btn primary', html: icon('film') + '2. Video erstellen', onclick: () => Templates.buildStory(S) });
    return this.card('KI-Video aus Idee', topic, el('div', { class: 'grid2' }, n, sec, style, music, voice, caps), write, list, build,
      el('p', { class: 'muted xs' }, 'Ablauf: Drehbuch schreiben lassen → Texte nach Wunsch anpassen → Video erstellen. Bilder, Sprecher, Untertitel und Musik werden automatisch angelegt.'));
  },

  /* ---------- Text ---------- */
  v_text() {
    const grid = el('div', { class: 'txgrid' }, Object.entries(TEXT_PRESETS).map(([k, v]) => {
      const p = v.p, st = { fontFamily: `"${p.font}", sans-serif`, fontWeight: p.weight, fontStyle: p.italic ? 'italic' : 'normal', color: p.color, textTransform: p.upper ? 'uppercase' : 'none', background: p.bgOn ? rgba(p.bgColor, p.bgAlpha) : 'transparent', WebkitTextStroke: p.strokeW ? `${Math.min(2, p.strokeW / 5)}px ${p.stroke}` : '', textShadow: p.glow ? `0 0 10px ${p.color}` : p.shadow ? '0 2px 6px rgba(0,0,0,.6)' : 'none' };
      const b = el('button', { class: 'txcard', title: v.label + ' – klicken oder in die Timeline ziehen', onclick: () => addTextClip(k) }, el('span', { class: 'tx-sample', style: st }, k === 'lower' ? 'Name' : k === 'tiktok' ? 'Wow das' : 'Aa'), el('span', { class: 'tx-label' }, v.label));
      this.drag(b, { type: 'text', preset: k });
      return b;
    }));
    return [this.head('Text', 'Klicke einen Stil an. Danach rechts den Text eintippen und im Bild an die gewünschte Stelle ziehen.'),
      el('button', { class: 'btn primary block', html: icon('plus') + 'Text hinzufügen', onclick: () => addTextClip('box') }), grid];
  },

  /* ---------- Effekte ---------- */
  v_effects() {
    const sel = selectedClip(), isMedia = sel && (sel.kind === 'video' || sel.kind === 'image');
    const fx = el('div', { class: 'fxgrid' }, Object.entries(FX_LIST).map(([k, v]) => { const b = el('button', { class: 'fxcard fx-' + k, onclick: () => addFxClip(k) }, el('span', { class: 'fx-sw' }), el('span', {}, v)); this.drag(b, { type: 'fx', fx: k }); return b; }));
    const applyAll = (fn) => { const main = State.tracks.find(t => t.magnet); const list = main ? clipsOn(main.id) : []; list.forEach(fn); commit(); changed({ inspector: true }); };
    const tr = el('div', { class: 'chips' }, Object.entries(TRANSITIONS).map(([k, v]) => el('button', { class: 'chip' + (sel && sel.trans && sel.trans.type === k ? ' on' : ''), onclick: () => {
      if (isMedia) { sel.trans = { type: k, dur: sel.trans?.dur || .6 }; commit(); changed({ inspector: true }); this.render(); }
      else applyAll((c, i) => { if (i > 0) c.trans = { type: k, dur: .6 }; });
    } }, v)));
    const looks = el('div', { class: 'chips' }, Object.entries(LOOKS).map(([k, v]) => el('button', { class: 'chip' + (sel && sel.look === k ? ' on' : ''), onclick: () => {
      if (isMedia) { sel.look = k; sel.f = { ...FILTER_DEF(), ...v.f }; commit(); changed({ inspector: true }); this.render(); }
      else applyAll(c => { if (c.f) { c.look = k; c.f = { ...FILTER_DEF(), ...v.f }; } });
    } }, v.label)));
    const ce = el('div', { class: 'chips' }, Object.entries(CLIP_EFFECTS).map(([k, v]) => el('button', { class: 'chip' + (sel && sel.effect === k ? ' on' : ''), disabled: !(sel && isVisualKind(sel.kind)), onclick: () => { sel.effect = k; commit(); changed({ inspector: true }); this.render(); } }, v)));
    const hint = isMedia ? `Gilt für den gewählten Clip „${sel.name || 'Clip'}“.` : 'Kein Clip gewählt: gilt für alle Clips der Hauptspur.';
    return [this.head('Effekte', 'Video-Effekte landen auf der Effekt-Spur und wirken auf alles darunter.'),
      this.card('Video-Effekte', fx),
      this.card('Übergänge', el('p', { class: 'muted xs' }, hint), tr),
      this.card('Filter-Looks', el('p', { class: 'muted xs' }, hint), looks),
      this.card('Clip-Effekte', el('p', { class: 'muted xs' }, sel && isVisualKind(sel.kind) ? `Für „${sel.name || 'Clip'}“` : 'Wähle zuerst einen Clip aus.'), ce)];
  },

  /* ---------- Audio ---------- */
  v_audio() {
    const st = this.st;
    const len = () => Math.max(8, Math.ceil(projectDuration() || 30));
    const music = el('div', { class: 'mus-list' }, Object.entries(Music.STYLES).map(([k, s]) => {
      const pv = el('button', { class: 'ib', title: 'Vorhören', html: icon('play') });
      pv.onclick = async () => { pv.disabled = true; try { playBuffer(await Music.generate(k, 12, st.musicSeed)); } finally { pv.disabled = false; } };
      const add = el('button', { class: 'btn primary xs', html: icon('plus') + 'Einfügen' });
      add.onclick = async () => {
        add.disabled = true; stopPreviewSound();
        const sec = len(); const buf = await Music.generate(k, sec, st.musicSeed);
        const m = await addAudioBuffer(buf, `${s.label} (${Math.round(sec)} s)`, { source: 'Clipwerk Musik-Generator' });
        const c = newClip('audio', { media: m.id, name: m.name, dur: buf.duration, volume: .7, fadeOut: 1.5 });
        placeClip(c, { start: 0, trackId: trackByName('audio', 'Musik')?.id, trackType: 'audio' }); State.selected = c.id; commit(); refreshAll();
        add.disabled = false; toast('Musik eingefügt – passend zur Länge deines Videos.', 'ok');
      };
      return el('div', { class: 'mus' }, pv, el('div', { class: 'mus-t' }, el('strong', {}, s.label), el('span', { class: 'muted xs' }, `${s.desc} · ${s.bpm} BPM`)), add);
    }));
    const dice = el('button', { class: 'btn ghost sm', html: icon('dice') + `Variation ${st.musicSeed}`, onclick: () => { st.musicSeed = (st.musicSeed % 99) + 1; this.render(); } });
    const sfx = el('div', { class: 'sfxgrid' }, Object.entries(SFX.list).map(([k, [l]]) => el('div', { class: 'sfx' },
      el('button', { class: 'sfx-play', title: 'Vorhören', onclick: () => SFX.preview(k), html: icon('play') + `<span>${l}</span>` }),
      el('button', { class: 'ib xs', title: 'Am Abspielkopf einfügen', html: icon('plus'), onclick: () => SFX.add(k) }))));
    // Online-Musik
    const oq = el('input', { class: 'inp', placeholder: 'z. B. piano, epic, happy …', value: st.ovQ });
    const ores = el('div', { class: 'ov-list' });
    const drawOv = () => ores.replaceChildren(...st.ovRes.map(r => {
      const au = el('audio', { src: r.url, preload: 'none', controls: true, class: 'ov-audio' });
      return el('div', { class: 'ov-item' }, el('div', { class: 'ov-t' }, el('strong', {}, r.title || 'Titel'), el('span', { class: 'muted xs' }, `${r.creator || 'unbekannt'} · ${(r.license || '').toUpperCase()} · ${fmtSec((r.duration || 0) / 1000)}`)), au,
        el('button', { class: 'btn ghost xs', html: icon('download') + 'Übernehmen', onclick: async (e) => { e.target.disabled = true; const m = await Stock.importUrl([r.url], r.title || 'Musik', 'audio', r._credit || `„${r.title}“ von ${r.creator} (${(r.license || '').toUpperCase()} ${r.license_version || ''}) via Openverse`, r.foreign_landing_url); e.target.disabled = false; if (m) { const fx = st.ovSrc !== 'music'; addMediaToTimeline(m, { start: fx ? State.time : 0, trackId: trackByName('audio', fx ? 'Soundeffekte' : 'Musik')?.id }); } } }));
    }));
    const osrc = el('select', { class: 'sel' }, el('option', { value: 'music' }, 'Musik (Openverse)'), el('option', { value: 'sound_effect' }, 'Soundeffekte (Openverse)'), el('option', { value: 'wm' }, 'Klänge & Geräusche (Wikimedia)'));
    osrc.value = st.ovSrc; osrc.onchange = () => st.ovSrc = osrc.value;
    const ogo = async () => { st.ovQ = oq.value.trim(); if (!st.ovQ) return; ores.replaceChildren(el('div', { class: 'spinner sm' })); try { st.ovRes = st.ovSrc === 'wm' ? (await Stock.wikimedia('audio', st.ovQ)).map(r => ({ title: r.title, url: r.url, creator: r.credit.replace(/^.*von /, '').replace(/ \(.*$/, ''), license: '', duration: 0, foreign_landing_url: r.landing, _credit: r.credit })) : await Stock.openverse('audio', st.ovQ, st.ovSrc); st.ovRes.length ? drawOv() : ores.replaceChildren(el('p', { class: 'muted small' }, 'Nichts gefunden.')); } catch (e) { ores.replaceChildren(el('p', { class: 'err small' }, e.message)); } };
    oq.addEventListener('keydown', e => { if (e.key === 'Enter') ogo(); });
    if (st.ovRes.length) drawOv();
    // Aufnahme
    const recBtn = el('button', { class: 'btn rec' + (Recorder.active ? ' on' : ''), html: icon(Recorder.active ? 'stop' : 'rec') + (Recorder.active ? 'Aufnahme beenden' : 'Aufnahme starten') });
    recBtn.onclick = async () => { if (Recorder.active) { await Recorder.stop(); } else { await Recorder.start({ playAlong: st.recPlay, liveCaptions: st.recCaps }); } this.render(); };
    const tg = (label, key) => { const b = el('button', { class: 'tgl' + (st[key] ? ' on' : ''), role: 'switch' }, el('span')); b.onclick = () => { st[key] = !st[key]; b.classList.toggle('on', st[key]); }; return el('div', { class: 'row' }, el('label', { class: 'row-l' }, label), el('div', { class: 'row-c' }, b)); };
    // KI-Stimme
    const tt = el('textarea', { class: 'inp', rows: 3, placeholder: 'Text, den die KI-Stimme sprechen soll …' }, st.ttsText); tt.oninput = () => st.ttsText = tt.value;
    const eng = el('select', { class: 'sel' }, el('option', { value: 'online' }, 'Online-Stimme (beste Qualität)'), el('option', { value: 'local' }, 'Offline-Stimme auf dem PC (Piper)')); eng.value = st.ttsEngine;
    const vo = el('select', { class: 'sel' });
    const fillVo = () => { vo.replaceChildren(...(eng.value === 'online' ? [['nova', 'Nova (weiblich, warm)'], ['shimmer', 'Shimmer (weiblich, hell)'], ['alloy', 'Alloy (neutral)'], ['echo', 'Echo (männlich)'], ['onyx', 'Onyx (männlich, tief)'], ['fable', 'Fable (erzählend)']] : [['de_DE-thorsten-medium', 'Thorsten (männlich)'], ['de_DE-kerstin-low', 'Kerstin (weiblich)'], ['de_DE-ramona-low', 'Ramona (weiblich)'], ['de_DE-eva_k-x_low', 'Eva (weiblich, klein)'], ['de_DE-thorsten_emotional-medium', 'Thorsten emotional']]).map(([v, l]) => el('option', { value: v }, l))); if ([...vo.options].some(o => o.value === st.ttsVoice)) vo.value = st.ttsVoice; };
    eng.onchange = () => { st.ttsEngine = eng.value; fillVo(); }; vo.onchange = () => st.ttsVoice = vo.value; fillVo();
    const ttsCaps = { on: true };
    const ttsBtn = el('button', { class: 'btn primary', html: icon('mic') + 'Sprechen lassen' });
    ttsBtn.onclick = async () => {
      const text = tt.value.trim(); if (!text) { toast('Gib zuerst einen Text ein.', 'warn'); return; }
      ttsBtn.disabled = true; ttsBtn.innerHTML = icon('refresh', 'spin') + 'Stimme wird erzeugt …';
      try {
        const m = await makeVoice(text, eng.value, vo.value);
        const c = newClip('audio', { media: m.id, name: 'Stimme: ' + text.slice(0, 30), dur: m.duration });
        placeClip(c, { start: State.time, trackId: trackByName('audio', 'Stimme')?.id, trackType: 'audio' });
        if (ttsCaps.on) Captions.fromScript(text, { start: State.time, dur: m.duration, wordsPer: +Settings.get('capWords', 3) });
        State.selected = c.id; commit(); refreshAll(); toast('Sprachaufnahme eingefügt.', 'ok');
      } catch (e) { toast(e.message, 'error', 8000); }
      ttsBtn.disabled = false; ttsBtn.innerHTML = icon('mic') + 'Sprechen lassen';
    };
    const capT = el('button', { class: 'tgl on', role: 'switch' }, el('span')); capT.onclick = () => { ttsCaps.on = !ttsCaps.on; capT.classList.toggle('on', ttsCaps.on); };
    const sel = selectedClip();
    return [this.head('Audio', 'Musik und Effekte werden lokal erzeugt – 100 % lizenzfrei, auch für Monetarisierung.'),
      this.card('Musik-Generator', el('div', { class: 'row-inline between' }, el('span', { class: 'muted xs' }, 'Jede Variation klingt anders.'), dice), music),
      this.card('KI-Stimme (Text zu Sprache)', tt, eng, vo, el('div', { class: 'row' }, el('label', { class: 'row-l' }, 'Untertitel dazu'), el('div', { class: 'row-c' }, capT)), ttsBtn,
        el('p', { class: 'muted xs' }, 'Online: Pollinations (kostenlos). Offline: Piper-Stimme läuft auf deinem PC, beim ersten Mal ca. 60 MB Download.')),
      this.card('Sprachaufnahme', tg('Video beim Aufnehmen abspielen', 'recPlay'), tg('Live-Untertitel (Chrome/Edge)', 'recCaps'), recBtn, el('p', { id: 'recLive', class: 'mono xs live' }, Recorder.active ? 'Höre zu …' : ''),
        el('p', { class: 'muted xs' }, 'Tipp: Kopfhörer benutzen, damit der Videoton nicht mit aufgenommen wird.')),
      this.card('Soundeffekte', sfx),
      this.card('Rauschen entfernen & Stimme isolieren', el('p', { class: 'muted small' }, sel && (sel.kind === 'audio' || sel.kind === 'video') ? `Gewählt: „${sel.name}“` : 'Wähle einen Video- oder Audio-Clip in der Timeline.'),
        el('button', { class: 'btn ghost', disabled: !(sel && (sel.kind === 'audio' || sel.kind === 'video')), html: icon('sparkle') + 'Rauschen entfernen (KI)', onclick: () => Denoise.run(sel) }),
        el('p', { class: 'muted xs' }, 'Entfernt Wind, Brummen, Lüfter und Hintergrundlärm und macht die Stimme klarer. Läuft lokal (RNNoise).')),
      this.card('Freie Musik & Sounds aus dem Netz', osrc, el('div', { class: 'row-inline' }, oq, el('button', { class: 'btn primary sm', html: icon('search'), onclick: ogo })), ores,
        el('p', { class: 'muted xs' }, 'Creative-Commons-Musik über Openverse (Jamendo, Freesound, Wikimedia). Bitte die Quellenangabe beim Export übernehmen.'))];
  },

  /* ---------- Untertitel ---------- */
  v_captions() {
    const sel = Captions.pre ? clipById(Captions.pre) : null;
    const o = { engine: Settings.get('capEngine', 'local'), model: Settings.get('capModel', 'onnx-community/whisper-base'), wordsPer: +Settings.get('capWords', 3), style: Settings.get('capStyle', 'tiktok'), replace: true };
    const eng = el('select', { class: 'sel' }, el('option', { value: 'local' }, 'Auf dem PC – kostenlos, ohne Konto'), el('option', { value: 'online' }, 'Online – schneller, Schlüssel nötig')); eng.value = o.engine; eng.onchange = () => Settings.set('capEngine', eng.value);
    const mdl = el('select', { class: 'sel' }, el('option', { value: 'onnx-community/whisper-base' }, 'Modell: Schnell (ca. 80 MB)'), el('option', { value: 'onnx-community/whisper-small' }, 'Modell: Genau (ca. 250 MB)')); mdl.value = o.model; mdl.onchange = () => Settings.set('capModel', mdl.value);
    const wp = el('select', { class: 'sel' }, [1, 2, 3, 4, 5, 6, 8].map(n => el('option', { value: n }, `${n} Wort${n > 1 ? 'e' : ''} pro Einblendung`))); wp.value = o.wordsPer; wp.onchange = () => Settings.set('capWords', wp.value);
    const sty = el('select', { class: 'sel' }, Object.entries(TEXT_PRESETS).map(([k, v]) => el('option', { value: k }, 'Stil: ' + v.label))); sty.value = o.style; sty.onchange = () => Settings.set('capStyle', sty.value);
    const src = el('select', { class: 'sel' }, el('option', { value: '' }, 'Quelle: gesamtes Projekt'), State.clips.filter(c => c.kind === 'audio' || c.kind === 'video').map(c => el('option', { value: c.id }, 'Quelle: ' + (c.name || KIND_LABEL[c.kind]))));
    src.value = sel ? sel.id : '';
    const go = el('button', { class: 'btn primary', html: icon('cc') + 'Untertitel automatisch erzeugen', onclick: () => Captions.transcribe({ clipId: src.value || null, engine: eng.value, model: mdl.value, wordsPer: +wp.value, style: sty.value, replace: true }) });
    const script = el('textarea', { class: 'inp', rows: 4, placeholder: 'Füge hier dein Skript ein. Es wird gleichmäßig über die Dauer verteilt.' });
    const over = el('select', { class: 'sel' }, el('option', { value: 'project' }, 'Über das ganze Video verteilen'), el('option', { value: 'sel' }, 'Über den gewählten Clip verteilen'));
    const goScript = el('button', { class: 'btn ghost', html: icon('text') + 'Untertitel aus Text', onclick: () => {
      const t = script.value.trim(); if (!t) return;
      let start = 0, dur = Math.max(3, projectDuration());
      const c = selectedClip(); if (over.value === 'sel' && c) { start = c.start; dur = c.dur; }
      const n = Captions.fromScript(t, { start, dur, wordsPer: +wp.value, style: sty.value, replace: true }); toast(`${n} Untertitel angelegt.`, 'ok');
    } });
    const restyle = el('button', { class: 'btn ghost sm', html: icon('refresh') + 'Stil auf alle Untertitel anwenden', onclick: () => {
      const tr = State.tracks.find(t => t.type === 'text' && t.name === 'Untertitel'); if (!tr) return;
      const P = TEXT_PRESETS[sty.value].p;
      for (const c of clipsOn(tr.id)) { const keep = { text: c.text, start: c.start, dur: c.dur, id: c.id, track: c.track, name: c.name }; Object.assign(c, JSON.parse(JSON.stringify(TEXT_DEFAULT)), JSON.parse(JSON.stringify(P)), keep); if (P.y == null) c.y = .72; }
      commit(); refreshAll(); toast('Stil übernommen.', 'ok');
    } });
    const srt = el('button', { class: 'btn ghost sm', html: icon('download') + 'Als .srt speichern', onclick: () => {
      const tr = State.tracks.find(t => t.type === 'text' && t.name === 'Untertitel'); const list = tr ? clipsOn(tr.id) : [];
      if (!list.length) { toast('Es gibt noch keine Untertitel.', 'warn'); return; }
      const ts = t => { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000); return `${pad2(h)}:${pad2(m)}:${pad2(s)},${String(ms).padStart(3, '0')}`; };
      download(new Blob([list.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(clipEnd(c))}\n${c.text}\n`).join('\n')], { type: 'text/plain' }), `${safeName(State.project.name)}.srt`);
    } });
    return [this.head('Untertitel', 'Automatische Untertitel aus gesprochener Sprache – auf Deutsch und vielen anderen Sprachen.'),
      this.card('Automatisch aus Sprache', src, eng, mdl, wp, sty, go, el('p', { class: 'muted xs' }, 'Vorhandene automatische Untertitel werden ersetzt. Jede Einblendung kannst du danach in der Timeline anklicken und korrigieren.')),
      this.card('Aus Text oder Skript', script, over, goScript),
      this.card('Alle Untertitel', el('div', { class: 'btn-row' }, restyle, srt))];
  },
};

async function makeVoice(text, engine, voice) {
  if (engine === 'local') {
    let b;
    try { b = await AI.localTTS(text, voice); }
    catch (e) { console.error(e); throw new Error('Die Offline-Stimme konnte nicht geladen werden. Prüfe die Internetverbindung (einmaliger Download) oder nimm die Online-Stimme.'); }
    return addMediaBlob(b, 'Stimme: ' + text.slice(0, 30), { type: 'audio', source: 'Piper TTS' });
  }
  const b = await AI.tts(text, voice);
  return addMediaBlob(b, 'Stimme: ' + text.slice(0, 30), { type: 'audio', source: 'Pollinations TTS' });
}
