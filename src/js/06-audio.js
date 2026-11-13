/* ==========================================================================
   Audio: Musik-Generator, Soundeffekte, Aufnahme, Rauschunterdrückung
   Alles wird lokal erzeugt – lizenzfrei, ohne Internet.
   ========================================================================== */
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const midiF = m => 440 * Math.pow(2, (m - 69) / 12);
function noiseBuf(ctx, sec = 1) { const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
function impulse(ctx, sec = 2.2, decay = 3) {
  const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return b;
}
class Synth {
  constructor(ctx) { this.ctx = ctx; this.noise = noiseBuf(ctx, 2); }
  env(g, t, vol, a, d, s, dur, r) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setTargetAtTime(vol * s, t + a, Math.max(.001, d / 3)); g.gain.setTargetAtTime(0, t + Math.max(a, dur), Math.max(.001, r / 3)); }
  voice(out, t, midi, dur, o) {
    const ctx = this.ctx, f = midiF(midi), g = ctx.createGain();
    this.env(g, t, o.vol, o.a, o.d, o.s, dur, o.r);
    let dest = g;
    if (o.lp) {
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = o.q || .7;
      if (o.lpEnv) { fl.frequency.setValueAtTime(o.lpEnv, t); fl.frequency.exponentialRampToValueAtTime(o.lp, t + (o.lpT || .25)); } else fl.frequency.value = o.lp;
      fl.connect(g); dest = fl;
    }
    g.connect(out);
    const stop = t + Math.max(o.a, dur) + o.r * 2 + .05;
    for (const w of o.waves) {
      const osc = ctx.createOscillator(), og = ctx.createGain(); osc.type = w.type; osc.frequency.value = f * (w.m || 1); osc.detune.value = w.det || 0; og.gain.value = w.g ?? 1;
      osc.connect(og).connect(dest); osc.start(t); osc.stop(stop);
    }
  }
  noiseHit(out, t, { type = 'highpass', freq = 7000, q = .7, vol = .3, decay = .05, attack = .001 } = {}) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noise;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0005, t + attack + decay);
    src.connect(fl).connect(g).connect(out); src.start(t, Math.random()); src.stop(t + attack + decay + .05);
  }
  kick(out, t, { vol = 1, f0 = 150, f1 = 45, decay = .45 } = {}) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + .12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + decay);
    o.connect(g).connect(out); o.start(t); o.stop(t + decay + .05);
    this.noiseHit(out, t, { type: 'highpass', freq: 3000, vol: vol * .08, decay: .015 });
  }
  b808(out, t, midi, dur, vol = .6) {
    const ctx = this.ctx, f = midiF(midi), o = ctx.createOscillator(), g = ctx.createGain(), sh = ctx.createWaveShaper();
    const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2); } sh.curve = curve;
    o.type = 'sine'; o.frequency.setValueAtTime(f * 2.2, t); o.frequency.exponentialRampToValueAtTime(f, t + .06);
    g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(vol * .6, t + .05, .2); g.gain.setTargetAtTime(0, t + dur, .08);
    o.connect(sh).connect(g).connect(out); o.start(t); o.stop(t + dur + .5);
  }
  snare(out, t, vol = .5) {
    this.noiseHit(out, t, { type: 'bandpass', freq: 1900, q: .6, vol, decay: .18 });
    this.noiseHit(out, t, { type: 'highpass', freq: 5000, vol: vol * .5, decay: .1 });
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(140, t + .08);
    g.gain.setValueAtTime(vol * .6, t); g.gain.exponentialRampToValueAtTime(.001, t + .12); o.connect(g).connect(out); o.start(t); o.stop(t + .15);
  }
  clap(out, t, vol = .5) { for (let i = 0; i < 3; i++) this.noiseHit(out, t + i * .011, { type: 'bandpass', freq: 1300, q: .9, vol: vol * (i === 2 ? 1 : .6), decay: i === 2 ? .2 : .012 }); }
  hat(out, t, vol = .15, open = false) { this.noiseHit(out, t, { type: 'highpass', freq: 7600, vol, decay: open ? .26 : .04 }); }
  tom(out, t, f = 110, vol = .6) { this.kick(out, t, { vol, f0: f * 1.6, f1: f, decay: .5 }); }
}
const INSTR = {
  rhodes: { waves: [{ type: 'sine', m: 1 }, { type: 'sine', m: 2, g: .22 }, { type: 'triangle', m: 1, g: .15 }], a: .01, d: 1.2, s: .35, r: .5, lp: 3000, vol: .1 },
  strings: { waves: [{ type: 'sawtooth', m: 1, det: -8 }, { type: 'sawtooth', m: 1, det: 8 }, { type: 'sawtooth', m: .5, g: .4 }], a: .7, d: 1, s: .85, r: 1.2, lp: 1500, vol: .035 },
  pluck: { waves: [{ type: 'square', m: 1, g: .6 }, { type: 'sawtooth', m: 2, g: .25 }], a: .004, d: .22, s: .05, r: .2, lp: 800, lpEnv: 5200, lpT: .2, vol: .07 },
  stab: { waves: [{ type: 'sawtooth', m: 1, det: -6 }, { type: 'sawtooth', m: 1, det: 6 }], a: .004, d: .16, s: .1, r: .12, lp: 2200, vol: .05 },
  shimmer: { waves: [{ type: 'sine', m: 1 }, { type: 'triangle', m: 2, g: .3 }, { type: 'sine', m: 4, g: .07 }], a: 1.6, d: 2, s: .75, r: 2.4, vol: .045 },
  bell: { waves: [{ type: 'sine', m: 1 }, { type: 'sine', m: 2.76, g: .3 }, { type: 'sine', m: 5.4, g: .1 }], a: .002, d: .7, s: 0, r: .6, vol: .075 },
  lead: { waves: [{ type: 'sawtooth', m: 1, det: -9 }, { type: 'sawtooth', m: 1, det: 9 }], a: .01, d: .3, s: .55, r: .3, lp: 2600, vol: .045 },
  darkpad: { waves: [{ type: 'triangle', m: 1 }, { type: 'sine', m: .5, g: .6 }], a: .4, d: 1, s: .8, r: .8, lp: 1200, vol: .06 },
  sub: { waves: [{ type: 'sine', m: 1 }, { type: 'triangle', m: 1, g: .35 }], a: .01, d: .3, s: .85, r: .08, lp: 700, vol: .26 },
  sawbass: { waves: [{ type: 'sawtooth', m: 1 }, { type: 'square', m: .5, g: .3 }], a: .005, d: .2, s: .55, r: .06, lp: 650, vol: .11 },
};
const Music = {
  STYLES: {
    lofi: { label: 'Lo-Fi Chill', desc: 'Entspannt, zum Lernen & Vlogs', bpm: 82, swing: .14, pad: 'rhodes', bass: 'sub', drums: 'lofi', crackle: true, rev: .22,
      progs: [[[65, 69, 72, 76], [64, 67, 71, 74], [62, 65, 69, 72], [60, 64, 67, 71]], [[62, 65, 69, 72], [67, 71, 74, 77], [60, 64, 67, 71], [57, 60, 64, 67]]] },
    trap: { label: 'Trap / Hype', desc: 'Harte 808s für Action & Sport', bpm: 140, pad: 'darkpad', bass: '808', drums: 'trap', melody: 'bell', rev: .2,
      progs: [[[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 48, 52]]] },
    pop: { label: 'Upbeat Pop', desc: 'Fröhlich, für Produkte & Reisen', bpm: 118, pad: 'pluck', bass: 'sawbass', drums: 'pop', arp: true, rev: .18,
      progs: [[[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], [[53, 57, 60], [60, 64, 67], [55, 59, 62], [57, 60, 64]]] },
    house: { label: 'Deep House', desc: 'Clubbig & stylisch', bpm: 122, pad: 'stab', bass: 'sub', drums: 'house', rev: .25,
      progs: [[[57, 60, 64, 67], [50, 57, 60, 65], [52, 55, 59, 62], [53, 57, 60, 64]]] },
    cine: { label: 'Cinematic Epic', desc: 'Groß, emotional, für Trailer', bpm: 72, pad: 'strings', bass: 'sub', drums: 'epic', rev: .45, revLen: 3.5,
      progs: [[[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]]] },
    ambient: { label: 'Ambient Traum', desc: 'Ruhig, für Natur & Zitate', bpm: 60, pad: 'shimmer', drums: 'none', rev: .5, revLen: 4, melody: 'bell',
      progs: [[[60, 64, 67, 74], [57, 60, 64, 71], [53, 57, 60, 67], [55, 59, 62, 69]]] },
    synthwave: { label: 'Retro Synthwave', desc: '80er-Vibes, Neon & Autos', bpm: 100, pad: 'lead', bass: 'sawbass8', drums: 'synthwave', arp: true, rev: .35,
      progs: [[[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]] },
    corporate: { label: 'Vlog / Corporate', desc: 'Positiv & motivierend', bpm: 110, pad: 'pluck', bass: 'sub', drums: 'corp', arp: true, rev: .2,
      progs: [[[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]] },
  },
  async generate(key, seconds, seed = 1) {
    const S = this.STYLES[key] || this.STYLES.lofi, sr = 44100;
    seconds = clamp(seconds, 2, 600);
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr), sy = new Synth(ctx), rnd = mulberry(seed * 7919 + key.length * 31);
    const beat = 60 / S.bpm, bar = beat * 4, step = beat / 4, bars = Math.ceil(seconds / bar);
    const master = ctx.createGain(); const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = .004; comp.release.value = .2;
    master.connect(comp).connect(ctx.destination);
    master.gain.setValueAtTime(0, 0); master.gain.linearRampToValueAtTime(.9, .25);
    master.gain.setValueAtTime(.9, Math.max(.3, seconds - 2.2)); master.gain.linearRampToValueAtTime(0, seconds);
    const rev = ctx.createConvolver(); rev.buffer = impulse(ctx, S.revLen || 2.2); const revG = ctx.createGain(); revG.gain.value = S.rev ?? .25; rev.connect(revG).connect(master);
    const mus = ctx.createGain(); mus.connect(master); mus.connect(rev);
    const drums = ctx.createGain(); drums.gain.value = .9; drums.connect(master);
    const drumRev = ctx.createGain(); drumRev.gain.value = S.drums === 'synthwave' || S.drums === 'epic' ? .5 : .08; drums.connect(drumRev).connect(rev);
    const prog = S.progs[Math.floor(rnd() * S.progs.length)];
    const sw = (i) => (i % 2 ? (S.swing || 0) * step : 0);
    const arpPat = [[0, 1, 2, 1], [0, 2, 1, 3], [0, 1, 2, 3], [2, 1, 0, 1]][Math.floor(rnd() * 4)];
    for (let b = 0; b < bars; b++) {
      const t0 = b * bar; if (t0 >= seconds) break;
      const ch = prog[b % prog.length], root = ch[0];
      const intro = b < 1 && bars > 4, outro = b >= bars - 1 && bars > 4;
      const fill = (b % 8 === 7);
      // Akkorde
      const P = INSTR[S.pad];
      if (S.pad === 'pluck' || S.pad === 'stab') {
        const hits = S.pad === 'stab' ? [2, 6, 10, 14] : [0, 3, 6, 10, 12];
        for (const h of hits) for (const n of ch) sy.voice(mus, t0 + h * step, n + 12, step * 1.5, P);
      } else if (S.pad === 'lead') {
        for (const n of ch) sy.voice(mus, t0, n, bar * .95, { ...INSTR.strings, vol: .03 });
      } else for (const n of ch) sy.voice(mus, t0 + (S.pad === 'rhodes' ? sw(0) : 0), n, bar * .98, P);
      // Bass
      if (S.bass === '808') { for (const s of [0, 7, 10]) if (!intro) sy.b808(drums, t0 + s * step, root - 24, s === 0 ? step * 6 : step * 3); }
      else if (S.bass === 'sub') { const pat = S.drums === 'house' ? [2, 6, 10, 14] : [0, 6, 8]; for (const s of pat) if (!intro || S.drums === 'epic') sy.voice(mus, t0 + s * step, root - 24, step * (S.drums === 'house' ? 1.5 : 3.5), INSTR.sub); }
      else if (S.bass === 'sawbass') { for (let s = 0; s < 16; s += 2) if (!intro) sy.voice(mus, t0 + s * step, root - 24 + (s === 14 ? 7 : 0), step * 1.6, INSTR.sawbass); }
      else if (S.bass === 'sawbass8') { for (let s = 0; s < 16; s++) if (!intro) sy.voice(mus, t0 + s * step, root - 24 + (s % 4 === 2 ? 12 : 0), step * .9, { ...INSTR.sawbass, vol: .08 }); }
      // Arpeggio / Melodie
      if (S.arp && b >= 1 && !outro) { for (let s = 0; s < 16; s += 2) { const n = ch[arpPat[(s / 2) % 4] % ch.length] + 24; sy.voice(mus, t0 + s * step, n, step * 1.8, { ...INSTR.pluck, vol: .045 }); } }
      if (S.melody && b >= 2 && !outro) {
        const sc = [0, 3, 5, 7, 10, 12, 15];
        for (let s = 0; s < 16; s += 2) if (rnd() < (S.drums === 'none' ? .25 : .45)) sy.voice(mus, t0 + s * step, root + 24 + sc[Math.floor(rnd() * sc.length)], step * 3, INSTR.bell);
      }
      // Schlagzeug
      if (intro && S.drums !== 'epic') continue;
      const D = S.drums;
      for (let s = 0; s < 16; s++) {
        const t = t0 + s * step + sw(s);
        if (D === 'lofi') {
          if (s === 0 || s === 7 || s === 10) sy.kick(drums, t, { vol: .7, decay: .35 });
          if (s === 4 || s === 12) sy.snare(drums, t, .28);
          if (s % 2 === 0) sy.hat(drums, t, .05 + rnd() * .04);
        } else if (D === 'trap') {
          if (s === 0 || (s === 10 && rnd() < .7) || (s === 11 && rnd() < .3)) sy.kick(drums, t, { vol: .8, decay: .3 });
          if (s === 8) { sy.clap(drums, t, .45); sy.snare(drums, t, .2); }
          if (rnd() < .18 && s % 4 === 3) { for (let k = 0; k < 3; k++) sy.hat(drums, t + k * step / 3, .07); } else sy.hat(drums, t, s % 2 ? .05 : .08);
        } else if (D === 'pop') {
          if (s % 4 === 0) sy.kick(drums, t, { vol: .85 });
          if (s === 4 || s === 12) sy.clap(drums, t, .4);
          if (s % 4 === 2) sy.hat(drums, t, .09, true); else sy.hat(drums, t, .035);
        } else if (D === 'house') {
          if (s % 4 === 0) sy.kick(drums, t, { vol: .95, f1: 50 });
          if (s === 4 || s === 12) sy.clap(drums, t, .35);
          if (s % 4 === 2) sy.hat(drums, t, .1, true); else sy.hat(drums, t, .03);
        } else if (D === 'epic') {
          if (s === 0 || s === 8) sy.kick(drums, t, { vol: 1, f0: 110, f1: 38, decay: 1.2 });
          if (b % 4 === 3 && s >= 8 && s % 2 === 0) sy.tom(drums, t, 90 + (s - 8) * 8, .5);
          if (s === 4 || s === 12) if (b % 2) sy.snare(drums, t, .25);
        } else if (D === 'synthwave') {
          if (s === 0 || s === 8 || s === 10) sy.kick(drums, t, { vol: .9 });
          if (s === 4 || s === 12) { sy.snare(drums, t, .45); sy.clap(drums, t, .25); }
          if (s % 2 === 0) sy.hat(drums, t, .06);
        } else if (D === 'corp') {
          if (s === 0 || s === 8 || s === 10) sy.kick(drums, t, { vol: .8 });
          if (s === 4 || s === 12) sy.clap(drums, t, .35);
          if (s % 2 === 0) sy.hat(drums, t, .05 + (s % 4 === 2 ? .03 : 0));
        }
        if (fill && s >= 12 && D !== 'none' && D !== 'epic') sy.snare(drums, t + step / 2, .18);
      }
    }
    if (S.crackle) {
      const len = Math.ceil(seconds * sr), vb = ctx.createBuffer(1, len, sr), d = vb.getChannelData(0);
      for (let i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * .004; if (Math.random() < .00025) d[i] += (Math.random() * 2 - 1) * .35; }
      const vs = ctx.createBufferSource(); vs.buffer = vb; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000; vs.connect(lp).connect(master); vs.start(0);
    }
    return ctx.startRendering();
  },
};

/* ---------- Soundeffekte ---------- */
const SFX = {
  list: {
    whoosh: ['Whoosh', .9], swoosh: ['Swoosh kurz', .45], boom: ['Boom / Impact', 2.2], riser: ['Riser', 2.6], downer: ['Downlifter', 2],
    pop: ['Pop', .2], click: ['Klick', .08], ding: ['Ding', 1.6], success: ['Erfolg', 1.2], glitch: ['Glitch', .6], typing: ['Tippen', 1.6],
    shutter: ['Kamera-Auslöser', .35], heartbeat: ['Herzschlag', 1.3], laser: ['Laser', .45], coin: ['Münze', .5], fail: ['Fail / Wah-wah', 1.6],
    applause: ['Applaus', 3], drumroll: ['Trommelwirbel', 2.5],
  },
  async make(key) {
    const sr = 44100, [, len] = this.list[key]; const ctx = new OfflineAudioContext(2, Math.ceil(len * sr), sr), sy = new Synth(ctx);
    const out = ctx.createGain(); out.connect(ctx.destination);
    const rev = ctx.createConvolver(); rev.buffer = impulse(ctx, 1.6); const rg = ctx.createGain(); rg.gain.value = .25; out.connect(rev).connect(rg).connect(ctx.destination);
    const sweepNoise = (t, d, f0, f1, vol, type = 'bandpass', q = 1.2) => {
      const src = ctx.createBufferSource(); src.buffer = sy.noise; const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
      fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + d);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + d * .45); g.gain.linearRampToValueAtTime(0, t + d);
      const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-.8, t); p.pan.linearRampToValueAtTime(.8, t + d);
      src.connect(fl).connect(g).connect(p).connect(out); src.start(t); src.stop(t + d + .05);
    };
    const tone = (t, d, f0, f1, type, vol) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g).connect(out); o.start(t); o.stop(t + d + .02); };
    switch (key) {
      case 'whoosh': sweepNoise(0, .85, 300, 3200, .9); break;
      case 'swoosh': sweepNoise(0, .4, 800, 4500, .8); break;
      case 'boom': sy.kick(out, 0, { vol: 1.2, f0: 120, f1: 32, decay: 2 }); sy.noiseHit(out, 0, { type: 'lowpass', freq: 900, vol: .7, decay: .9 }); break;
      case 'riser': sweepNoise(0, 2.5, 400, 9000, .7, 'highpass', .8); tone(0, 2.5, 200, 1600, 'sawtooth', .0); { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(880, 2.5); g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(.12, 2.4); g.gain.linearRampToValueAtTime(0, 2.55); o.connect(g).connect(out); o.start(0); o.stop(2.6); } break;
      case 'downer': sweepNoise(0, 1.9, 8000, 200, .7, 'lowpass', .9); tone(0, 1.9, 600, 60, 'sine', .3); break;
      case 'pop': tone(0, .12, 900, 180, 'sine', .8); break;
      case 'click': sy.noiseHit(out, 0, { type: 'highpass', freq: 3000, vol: .6, decay: .02 }); tone(0, .03, 2000, 1200, 'square', .15); break;
      case 'ding': sy.voice(out, 0, 88, .1, { ...INSTR.bell, vol: .35, d: 1.4, r: 1 }); break;
      case 'success': [72, 76, 79, 84].forEach((n, i) => sy.voice(out, i * .09, n, .15, { ...INSTR.bell, vol: .28 })); break;
      case 'glitch': for (let i = 0; i < 10; i++) tone(i * .05, .04, 200 + Math.random() * 2000, 100 + Math.random() * 800, 'square', .18); break;
      case 'typing': { let t = 0; while (t < 1.5) { sy.noiseHit(out, t, { type: 'bandpass', freq: 2500 + Math.random() * 2000, q: 2, vol: .35, decay: .025 }); t += .06 + Math.random() * .12; } break; }
      case 'shutter': sy.noiseHit(out, 0, { type: 'highpass', freq: 1500, vol: .7, decay: .04 }); sy.noiseHit(out, .1, { type: 'highpass', freq: 2500, vol: .5, decay: .06 }); break;
      case 'heartbeat': sy.kick(out, 0, { vol: .9, f0: 70, f1: 40, decay: .25 }); sy.kick(out, .22, { vol: .7, f0: 65, f1: 38, decay: .3 }); break;
      case 'laser': tone(0, .4, 1800, 180, 'square', .25); break;
      case 'coin': sy.voice(out, 0, 83, .08, { waves: [{ type: 'square', m: 1 }], a: .001, d: .1, s: .5, r: .05, vol: .12 }); sy.voice(out, .08, 88, .3, { waves: [{ type: 'square', m: 1 }], a: .001, d: .3, s: .4, r: .1, vol: .12 }); break;
      case 'fail': [67, 66, 65, 64].forEach((n, i) => sy.voice(out, i * .32, n - 12, i === 3 ? .7 : .28, { waves: [{ type: 'sawtooth', m: 1 }], a: .02, d: .2, s: .7, r: .15, lp: 1200, vol: .12 })); break;
      case 'applause': for (let i = 0; i < 260; i++) { const t = Math.random() * 2.6; sy.noiseHit(out, t, { type: 'bandpass', freq: 1000 + Math.random() * 1500, q: 1, vol: .12 * Math.min(1, (2.9 - t)), decay: .03 }); } break;
      case 'drumroll': { for (let t = 0; t < 2.2; t += .045) sy.snare(out, t, .08 + t * .1); sy.noiseHit(out, 2.25, { type: 'highpass', freq: 4000, vol: .6, decay: .25 }); sy.kick(out, 2.25, { vol: .9 }); break; }
    }
    return ctx.startRendering();
  },
  async add(key) {
    const buf = await this.make(key);
    const m = await addAudioBuffer(buf, this.list[key][0], { source: 'Clipwerk Soundeffekte' });
    const c = newClip('audio', { media: m.id, name: m.name, dur: buf.duration });
    placeClip(c, { start: State.time, trackId: trackByName('audio', 'Soundeffekte')?.id, trackType: 'audio' });
    State.selected = c.id; commit(); refreshAll();
  },
  async preview(key) { const buf = await this.make(key); playBuffer(buf); },
};
let _prevSrc = null, _actx = null;
function playBuffer(buf) {
  try {
    _actx = _actx || new AudioContext();
    if (_prevSrc) try { _prevSrc.stop(); } catch { }
    const s = _actx.createBufferSource(); s.buffer = buf; s.connect(_actx.destination); s.start(); _prevSrc = s;
  } catch (e) { console.warn(e); }
}
function stopPreviewSound() { if (_prevSrc) try { _prevSrc.stop(); } catch { } _prevSrc = null; }

/* ---------- Sprachaufnahme (mit optionalen Live-Untertiteln) ---------- */
const Recorder = {
  active: false,
  async start({ playAlong = true, liveCaptions = false } = {}) {
    if (this.active) return;
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { toast('Kein Mikrofonzugriff. Erlaube das Mikrofon in der Adressleiste des Browsers.', 'error'); return false; }
    this.chunks = []; this.segments = []; this.t0 = State.time; this.wall = performance.now();
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start(250); this.active = true;
    if (playAlong && projectDuration() > State.time) Preview.play();
    if (liveCaptions) this.startRecognition();
    return true;
  },
  startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Live-Untertitel werden nur in Chrome und Edge unterstützt.', 'warn'); return; }
    const r = new SR(); r.lang = Settings.get('lang', 'de-DE'); r.continuous = true; r.interimResults = true;
    const starts = {};
    r.onresult = (e) => {
      const now = (performance.now() - this.wall) / 1000;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i], key = this._rk + ':' + i;
        if (starts[key] == null) starts[key] = Math.max(0, now - .6);
        if (res.isFinal) { const text = res[0].transcript.trim(); if (text) this.segments.push({ text, t0: starts[key], t1: now }); }
      }
      const live = $('#recLive'); if (live) live.textContent = Array.from(e.results).map(x => x[0].transcript).join(' ').slice(-140);
    };
    r.onend = () => { if (this.active) { this._rk = (this._rk || 0) + 1; try { r.start(); } catch { } } };
    r.onerror = (e) => { if (e.error === 'not-allowed') toast('Spracherkennung wurde blockiert.', 'warn'); };
    this._rk = 0; this.recog = r; try { r.start(); } catch { }
  },
  async stop() {
    if (!this.active) return;
    this.active = false;
    const done = new Promise(r => this.rec.onstop = r);
    this.rec.stop(); await done;
    this.stream.getTracks().forEach(t => t.stop());
    if (this.recog) try { this.recog.stop(); } catch { }
    if (Preview.playing) Preview.pause();
    const blob = new Blob(this.chunks, { type: this.rec.mimeType || 'audio/webm' });
    if (blob.size < 1000) { toast('Die Aufnahme war leer.', 'warn'); return; }
    const m = await addMediaBlob(blob, 'Sprachaufnahme ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), { type: 'audio' });
    const c = newClip('audio', { media: m.id, name: m.name, dur: m.duration || (performance.now() - this.wall) / 1000 });
    placeClip(c, { start: this.t0, trackId: trackByName('audio', 'Stimme')?.id, trackType: 'audio' });
    if (this.segments.length) Captions.fromSegments(this.segments.map(s => ({ ...s, t0: s.t0 + this.t0, t1: s.t1 + this.t0 })), { silent: true });
    State.selected = c.id; commit(); refreshAll();
    toast(this.segments.length ? 'Aufnahme und Untertitel hinzugefügt.' : 'Aufnahme hinzugefügt.', 'ok');
  },
};

/* ---------- KI-Rauschunterdrückung (RNNoise, lokal) ---------- */
const Denoise = {
  rn: null,
  async load() {
    if (this.rn) return this.rn;
    const mod = await import('https://cdn.jsdelivr.net/npm/@shiguredo/rnnoise-wasm@2025.1.5/dist/rnnoise.js');
    this.rn = await mod.Rnnoise.load(); return this.rn;
  },
  async process(buf, enhance = true) {
    const rn = await this.load(), sr = 48000;
    const len = Math.ceil(buf.duration * sr), ch = Math.min(2, buf.numberOfChannels);
    const rs = new OfflineAudioContext(ch, len, sr); const s = rs.createBufferSource(); s.buffer = buf; s.connect(rs.destination); s.start();
    const res = await rs.startRendering();
    const out = new AudioBuffer({ length: len, numberOfChannels: ch, sampleRate: sr });
    const N = rn.frameSize || 480, frame = new Float32Array(N);
    for (let c = 0; c < ch; c++) {
      const inp = res.getChannelData(c), o = out.getChannelData(c), st = rn.createDenoiseState();
      for (let i = 0; i + N <= len; i += N) {
        for (let j = 0; j < N; j++) frame[j] = inp[i + j] * 32768;
        st.processFrame(frame);
        for (let j = 0; j < N; j++) o[i + j] = frame[j] / 32768;
        if (i % (N * 400) === 0) await sleep(0);
      }
      st.destroy();
    }
    if (!enhance) return out;
    const ec = new OfflineAudioContext(ch, len, sr), src = ec.createBufferSource(); src.buffer = out;
    const hp = ec.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85;
    const pres = ec.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3200; pres.gain.value = 3; pres.Q.value = .9;
    const comp = ec.createDynamicsCompressor(); comp.threshold.value = -22; comp.ratio.value = 3.5; comp.attack.value = .005; comp.release.value = .15;
    const g = ec.createGain(); g.gain.value = 1.35;
    src.connect(hp).connect(pres).connect(comp).connect(g).connect(ec.destination); src.start();
    return ec.startRendering();
  },
  async run(c) {
    const m = mediaOf(c); if (!m) return;
    const busy = Busy.show('Rauschen wird entfernt …', 'Die KI filtert Wind, Rauschen und Hintergrundgeräusche aus der Stimme. Läuft lokal auf deinem PC.');
    try {
      const buf = await getAudioBuffer(m);
      if (!buf) throw new Error('Dieser Clip hat keine Tonspur.');
      const out = await this.process(buf, true);
      const nm = await addAudioBuffer(out, m.name.replace(/\.[^.]+$/, '') + ' (entrauscht)', { source: 'RNNoise' });
      if (c.kind === 'audio') c.media = nm.id;
      else { c.mute = true; const a = newClip('audio', { media: nm.id, name: nm.name, start: c.start, dur: c.dur, in: c.in, speed: c.speed, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut }); placeClip(a, { start: c.start, trackId: trackByName('audio', 'Stimme')?.id, trackType: 'audio' }); }
      commit(); refreshAll(); toast('Rauschen entfernt – die saubere Stimme liegt in der Timeline.', 'ok');
    } catch (e) { console.error(e); toast(e.message && !/import|fetch|Failed/i.test(e.message) ? e.message : 'Rauschunterdrückung konnte nicht geladen werden. Bitte Internetverbindung prüfen (einmaliger Download).', 'error', 6000); }
    finally { busy.close(); }
  },
};

/* ---------- Fortschrittsanzeige ---------- */
const Busy = {
  show(title, text = '') {
    const bar = el('div', { class: 'prog' }, el('div', { class: 'prog-fill' }));
    const info = el('p', { class: 'muted small' }, text);
    const m = modal({ title, body: el('div', { class: 'busy' }, el('div', { class: 'spinner' }), info, bar) });
    return { close: m.close, set: (p, t) => { bar.firstChild.style.width = clamp(p, 0, 1) * 100 + '%'; if (t) info.textContent = t; } };
  },
};
