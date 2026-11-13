/* ==========================================================================
   KI-Dienste: kostenlose Online-KI (Pollinations) + lokale KI im Browser
   ========================================================================== */
const AI = {
  key() { return (Settings.get('pollKey', '') || '').trim(); },
  size(format = State.project.format) { return { '9:16': [864, 1536], '16:9': [1536, 864], '1:1': [1024, 1024], '4:5': [1024, 1280], '21:9': [1680, 720] }[format] || [1024, 1024]; },
  async fetchT(url, opts = {}, ms = 120000) {
    if (window.native && /^https:/.test(url) && (opts.body == null || typeof opts.body === 'string')) {
      let r;
      try { r = await window.native.fetch(url, { method: opts.method, headers: opts.headers, body: opts.body, timeout: ms }); }
      catch (e) { console.warn('Netzwerk:', e); throw new TypeError('Netzwerkfehler'); }
      return new Response(r.status === 204 ? null : r.data, { status: r.status, headers: { 'content-type': r.type || 'application/octet-stream' } });
    }
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), ms);
    try { return await fetch(url, { ...opts, signal: ac.signal }); }
    finally { clearTimeout(to); }
  },
  httpError(status) {
    if (status === 401 || status === 403) return new Error('Der KI-Dienst verlangt einen Schlüssel. Hol dir kostenlos einen auf enter.pollinations.ai und trage ihn unter Einstellungen ein.');
    if (status === 402) return new Error('Das kostenlose Kontingent ist für heute aufgebraucht. Versuche es später erneut.');
    if (status === 429) return new Error('Zu viele Anfragen in kurzer Zeit. Warte ein paar Sekunden und versuche es nochmal.');
    return new Error(`Der KI-Dienst antwortet mit Fehler ${status}. Versuche es gleich nochmal.`);
  },
  netError(e) { return e && e.name === 'AbortError' ? new Error('Der KI-Dienst hat zu lange gebraucht. Versuche es nochmal.') : new Error('Keine Verbindung zum KI-Dienst. Prüfe deine Internetverbindung.'); },
  async tryUrls(list, accept, name = 'x') {
    let err = null, needKey = false;
    const pref = Settings.get('aiPref_' + name, 0);
    const order = list.map((u, i) => i).sort((a, b) => (a === pref ? -1 : b === pref ? 1 : a - b));
    for (const i of order) {
      const { url, opts } = typeof list[i] === 'string' ? { url: list[i] } : list[i];
      try {
        let r = await this.fetchT(url, opts);
        if (r.status === 429) { await sleep(5000); r = await this.fetchT(url, opts); }
        if (!r.ok) { if ([401, 402, 403].includes(r.status)) needKey = true; err = this.httpError(r.status); continue; }
        const out = await accept(r);
        Settings.set('aiPref_' + name, i);
        return out;
      } catch (e) { err = e instanceof TypeError || e.name === 'AbortError' ? this.netError(e) : e; }
    }
    if (needKey && typeof KeyWizard !== 'undefined') KeyWizard.maybe();
    throw err || new Error('KI-Dienst nicht erreichbar.');
  },
  async image(prompt, { w, h, seed = Math.floor(Math.random() * 1e9), model } = {}) {
    if (!w) [w, h] = this.size();
    const k = this.key(), p = encodeURIComponent(prompt.slice(0, 1500));
    const m = model || Settings.get('imgModel', '');
    return this.tryUrls([
      `https://gen.pollinations.ai/image/${p}?width=${w}&height=${h}&seed=${seed}&nologo=true${m ? '&model=' + encodeURIComponent(m) : ''}${k ? '&key=' + encodeURIComponent(k) : ''}`,
      `https://image.pollinations.ai/prompt/${p}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux`,
    ], async r => { const b = await r.blob(); if (!b.type.startsWith('image')) throw new Error('Der KI-Dienst hat kein Bild geliefert.'); return b; }, 'img');
  },
  async text(prompt, system = '', { json = false } = {}) {
    const k = this.key(), seed = Math.floor(Math.random() * 1e6);
    const list = [];
    if (k) list.push({ url: 'https://gen.pollinations.ai/v1/chat/completions', opts: { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k }, body: JSON.stringify({ model: Settings.get('textModel', 'openai/gpt-5.4-nano'), messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], ...(json ? { response_format: { type: 'json_object' } } : {}) }) } });
    const q = `system=${encodeURIComponent(system)}${json ? '&json=true' : ''}&seed=${seed}`;
    list.push(`https://gen.pollinations.ai/text/${encodeURIComponent(prompt)}?${q}${k ? '&key=' + encodeURIComponent(k) : ''}`);
    list.push(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?${q}&model=openai`);
    return this.tryUrls(list, async r => {
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('json')) { const j = await r.json(); if (j.choices) return j.choices[0].message.content; return typeof j === 'string' ? j : JSON.stringify(j); }
      return r.text();
    }, 'txt');
  },
  parseJSON(s) {
    if (typeof s !== 'string') return s;
    const m = s.match(/\{[\s\S]*\}/); if (!m) throw new Error('Die KI-Antwort war unvollständig. Bitte nochmal versuchen.');
    return JSON.parse(m[0]);
  },
  async tts(text, voice = 'nova') {
    const k = this.key(), t = encodeURIComponent(text.slice(0, 2000));
    return this.tryUrls([
      `https://gen.pollinations.ai/audio/${t}?voice=${voice}&response_format=mp3${k ? '&key=' + encodeURIComponent(k) : ''}`,
      `https://text.pollinations.ai/${encodeURIComponent('Lies exakt und ohne Kommentar diesen Text vor: ' + text.slice(0, 1500))}?model=openai-audio&voice=${voice}`,
    ], async r => { const b = await r.blob(); if (!/audio|mpeg|octet/.test(b.type) || b.size < 500) throw new Error('Der KI-Dienst hat keine Sprachausgabe geliefert.'); return new Blob([b], { type: 'audio/mpeg' }); }, 'tts');
  },
  /* Lokale Stimme (Piper, läuft offline im Browser nach einmaligem Download) */
  _piper: null,
  async localTTS(text, voiceId = 'de_DE-thorsten-medium', onProgress) {
    if (!this._piper) this._piper = await import('https://esm.sh/@diffusionstudio/vits-web@1.0.3');
    const wav = await this._piper.predict({ text, voiceId }, p => onProgress && p.total && onProgress(p.loaded / p.total));
    return wav;
  },
  /* Transkription online (Whisper über Pollinations, Schlüssel nötig) */
  async transcribeOnline(buf, lang = 'de') {
    const k = this.key();
    if (!k) throw new Error('Für die Online-Erkennung brauchst du einen kostenlosen Pollinations-Schlüssel (Einstellungen). Alternativ „Auf dem PC“ wählen.');
    const fd = new FormData();
    fd.append('file', encodeWAV(buf), 'audio.wav'); fd.append('model', Settings.get('sttModel', 'whisper-1'));
    fd.append('response_format', 'verbose_json'); fd.append('language', lang); fd.append('timestamp_granularities[]', 'segment');
    let r;
    try { r = await this.fetchT('https://gen.pollinations.ai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + k }, body: fd }, 300000); }
    catch (e) { throw this.netError(e); }
    if (!r.ok) throw this.httpError(r.status);
    const j = await r.json();
    if (j.segments && j.segments.length) return j.segments.map(s => ({ text: String(s.text || '').trim(), t0: s.start, t1: s.end })).filter(s => s.text);
    if (j.text) return [{ text: j.text.trim(), t0: 0, t1: buf.duration }];
    throw new Error('Keine Sprache erkannt.');
  },
  /* Transkription lokal (Whisper im Browser, einmaliger Modell-Download) */
  _asr: {},
  async transcribeLocal(buf, lang = 'german', model = 'onnx-community/whisper-base', onProgress) {
    if (!this._T) this._T = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0');
    const T = this._T; T.env.allowLocalModels = false;
    if (!this._asr[model]) {
      const files = {};
      this._asr[model] = await T.pipeline('automatic-speech-recognition', model, {
        device: 'wasm', dtype: 'q8',
        progress_callback: p => { if (p.status === 'progress' && p.total) { files[p.file] = [p.loaded, p.total]; const v = Object.values(files); onProgress && onProgress(v.reduce((s, x) => s + x[0], 0) / v.reduce((s, x) => s + x[1], 0), 'Modell wird geladen …'); } },
      });
    }
    onProgress && onProgress(1, 'Sprache wird erkannt …');
    const out = await this._asr[model](buf.getChannelData(0), { language: lang, task: 'transcribe', return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
    const chunks = out.chunks || [{ text: out.text, timestamp: [0, buf.duration] }];
    return chunks.map(c => ({ text: String(c.text || '').trim(), t0: c.timestamp[0] ?? 0, t1: c.timestamp[1] ?? (c.timestamp[0] + 3) })).filter(s => s.text);
  },
};

/* ---------- Freie Medien aus dem Netz ---------- */
const Stock = {
  async wikimedia(kind, q) {
    const ft = { video: 'filetype:video', image: 'filetype:bitmap', audio: 'filetype:audio' }[kind];
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=30&gsrsearch=${encodeURIComponent(q + ' ' + ft)}&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=360`;
    let r; try { r = await AI.fetchT(url, {}, 30000); } catch { throw new Error('Wikimedia ist gerade nicht erreichbar. Prüfe deine Internetverbindung.'); }
    if (!r.ok) throw new Error(`Wikimedia antwortet mit Fehler ${r.status}.`);
    const pages = Object.values((await r.json()).query?.pages || {});
    const okMime = kind === 'video' ? /video\/webm/ : kind === 'audio' ? /audio\/(mpeg|ogg|wav|x-wav|webm|flac)|application\/ogg/ : /image\/(jpeg|png|webp)/;
    const strip = s => String(s || '').replace(/<[^>]+>/g, '').trim();
    return pages.map(p => ({ p, ii: (p.imageinfo || [])[0] })).filter(x => x.ii && okMime.test(x.ii.mime) && (x.ii.size || 0) < 150e6).map(({ p, ii }) => {
      const md = ii.extmetadata || {}, title = p.title.replace(/^File:|^Datei:/, '').replace(/\.[^.]+$/, '');
      return { title, url: ii.url, thumb: ii.thumburl || '', dur: ii.duration || 0, credit: `„${title}“ von ${strip(md.Artist?.value) || 'unbekannt'} (${strip(md.LicenseShortName?.value) || 'freie Lizenz'}) via Wikimedia Commons`, landing: ii.descriptionurl };
    });
  },
  async openverse(kind, q, category) {
    let r;
    try { r = await AI.fetchT(`https://api.openverse.org/v1/${kind}/?q=${encodeURIComponent(q)}&page_size=24&license_type=commercial&mature=false${category ? '&category=' + category : ''}`, {}, 30000); }
    catch (e) { throw new Error('Openverse ist gerade nicht erreichbar. Prüfe deine Internetverbindung.'); }
    if (!r.ok) throw new Error(`Openverse antwortet mit Fehler ${r.status}. Versuche es gleich nochmal.`);
    return (await r.json()).results || [];
  },
  async pexels(kind, q) {
    const key = (Settings.get('pexelsKey', '') || '').trim();
    if (!key) throw new Error('Für Pexels-Videos brauchst du einen kostenlosen Schlüssel von pexels.com/api (Einstellungen).');
    const o = State.project.w < State.project.h ? 'portrait' : State.project.w > State.project.h ? 'landscape' : 'square';
    const url = kind === 'videos' ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=20&orientation=${o}` : `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=24&orientation=${o}`;
    let r; try { r = await AI.fetchT(url, { headers: { Authorization: key } }, 30000); } catch { throw new Error('Pexels ist gerade nicht erreichbar.'); }
    if (r.status === 401 || r.status === 403) throw new Error('Der Pexels-Schlüssel ist ungültig. Prüfe ihn in den Einstellungen.');
    if (!r.ok) throw new Error(`Pexels antwortet mit Fehler ${r.status}.`);
    const j = await r.json(); return kind === 'videos' ? j.videos || [] : j.photos || [];
  },
  async importUrl(urls, name, type, credit, landing) {
    for (const u of [].concat(urls).filter(Boolean)) {
      try {
        const r = await AI.fetchT(u, {}, 120000); if (!r.ok) continue;
        const b = await r.blob(); if (b.size < 200) continue;
        const m = await addMediaBlob(b, name, { type, credit, source: landing || u });
        toast(`„${name}“ zur Mediathek hinzugefügt.`, 'ok'); return m;
      } catch { }
    }
    if (window.native) { toast('Download fehlgeschlagen. Versuche eine andere Datei.', 'warn'); return null; }
    toast('Dieser Anbieter erlaubt keinen direkten Download. Öffne die Quelle, speichere die Datei und ziehe sie in Clipwerk.', 'warn', 7000);
    if (landing) window.open(landing, '_blank', 'noopener');
    return null;
  },
};

/* ---------- Untertitel ---------- */
const Captions = {
  pre: null,
  preselect(c) { this.pre = c ? c.id : null; Panels.render(); },
  track(replace) {
    let t = State.tracks.find(t => t.type === 'text' && t.name === 'Untertitel');
    if (!t) t = addTrack('text', 'Untertitel');
    if (replace) State.clips = State.clips.filter(c => c.track !== t.id);
    return t;
  },
  fromSegments(segs, { style = Settings.get('capStyle', 'tiktok'), wordsPer = +Settings.get('capWords', 3), replace = false, silent = false } = {}) {
    const tr = this.track(replace), P = (TEXT_PRESETS[style] || TEXT_PRESETS.tiktok).p;
    let n = 0;
    for (const s of segs) {
      const words = s.text.split(/\s+/).filter(Boolean); if (!words.length) continue;
      const groups = Math.ceil(words.length / wordsPer), dur = Math.max(.3, s.t1 - s.t0), per = dur / groups;
      for (let i = 0; i < groups; i++) {
        const c = newClip('text', { ...JSON.parse(JSON.stringify(P)), text: words.slice(i * wordsPer, (i + 1) * wordsPer).join(' '), start: s.t0 + i * per, dur: Math.max(.25, per - .02), name: 'Untertitel' });
        if (style !== 'tiktok' && c.tAnim === 'none') c.tAnim = 'none';
        if (P.y == null) c.y = .72;
        c.track = tr.id; State.clips.push(c); n++;
      }
    }
    if (!silent) { commit(); refreshAll(); }
    return n;
  },
  fromScript(text, { start = 0, dur = 10, wordsPer = 3, style, replace } = {}) {
    const words = text.split(/\s+/).filter(Boolean); if (!words.length) return 0;
    return this.fromSegments([{ text: words.join(' '), t0: start, t1: start + dur }], { wordsPer, style, replace });
  },
  async transcribe({ clipId, engine = 'local', model, replace = true, wordsPer, style }) {
    const busy = Busy.show('Untertitel werden erstellt …', engine === 'local' ? 'Die Spracherkennung läuft auf deinem PC. Beim ersten Mal wird das Sprachmodell heruntergeladen.' : 'Die Tonspur wird an die kostenlose Online-Spracherkennung gesendet.');
    try {
      const only = clipId ? [clipById(clipId)].filter(Boolean) : null;
      const mix = await mixAudio(16000, { clips: only, channels: 1 });
      if (!mix) throw new Error('Im Projekt gibt es keinen Ton, aus dem Untertitel entstehen könnten.');
      let segs;
      if (engine === 'online') segs = await AI.transcribeOnline(mix, Settings.get('lang', 'de-DE').slice(0, 2));
      else segs = await AI.transcribeLocal(mix, 'german', model || 'onnx-community/whisper-base', (p, t) => busy.set(p, t));
      const n = this.fromSegments(segs, { replace, wordsPer, style });
      toast(`${n} Untertitel erstellt.`, 'ok');
    } catch (e) {
      console.error(e);
      toast(/import|dynamically|module|fetch/i.test(e.message || '') ? 'Die Spracherkennung konnte nicht geladen werden. Prüfe die Internetverbindung (einmaliger Download).' : e.message, 'error', 8000);
    } finally { busy.close(); }
  },
};
