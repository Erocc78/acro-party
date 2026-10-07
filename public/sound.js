// Music, sound effects and the timer ticker, all synthesized live with the Web Audio API.
// No audio files: every sound below is built from oscillators and noise, so it's original and free to use.
// The band: synth brass, drawbar organ, electric piano, vibraphone, strings, upright bass,
// a jazz drum kit and timpani, played through a small studio reverb.
(function () {
  const KEY = 'acro-sound';
  const settings = Object.assign({ music: 0.5, sfx: 0.8, ticker: true, muted: false }, Acro.store.get(KEY) || {});
  const save = () => Acro.store.set(KEY, settings);

  const LEVEL = 1.7; // overall loudness
  let ctx = null;
  let master, musicBus, leadBus, bassBus, sfxBus, tickBus, duckGain, noiseBuf, reverb;

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    // Limiter so loud moments never distort
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    const out = ctx.createGain();
    out.gain.value = 0.85;
    comp.connect(limiter).connect(out).connect(ctx.destination);
    master = gain(settings.muted ? 0 : LEVEL, comp);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Studio reverb: a short decaying noise impulse.
    reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    reverb.buffer = ir;
    const wet = gain(0.32, master);
    reverb.connect(wet);

    duckGain = gain(1, master);
    musicBus = gain(settings.music * 0.55, duckGain);
    musicBus.connect(gain(0.35, reverb));
    leadBus = gain(1.6, musicBus); // melodies sit on top of the band
    bassBus = gain(0.45, musicBus); // keep the bass from booming
    sfxBus = gain(settings.sfx, master);
    sfxBus.connect(gain(0.2, reverb));
    tickBus = gain(settings.ticker ? settings.sfx : 0, master);
    return ctx;
  }
  function gain(v, dest) {
    const g = ctx.createGain();
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }
  function ready() {
    return init() && ctx.state === 'running';
  }
  // Browsers start audio only after a click or tap on the page.
  const unlock = () => {
    if (init() && ctx.state !== 'running') ctx.resume();
    if (ctx && document.getElementById('app') && location.pathname.startsWith('/host')) preloadFiles();
  };
  ['pointerdown', 'keydown', 'touchend'].forEach((e) => window.addEventListener(e, unlock, { capture: true }));

  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  // ---------- building blocks ----------
  // Percussive envelope: quick attack, exponential decay.
  function envPerc(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  // Held envelope: attack, hold for the note length, then release.
  function envHold(g, t, a, peak, dur, rel, sustainRatio = 0.8) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(peak * sustainRatio, t + Math.max(a + 0.01, Math.min(dur, a + 0.2)));
    g.gain.setValueAtTime(peak * sustainRatio, t + Math.max(dur, a + 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.02) + rel);
  }
  function mkOsc(type, freq, t, end, detune = 0) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    o.start(t);
    o.stop(end + 0.05);
    return o;
  }
  function mkFilter(type, freq, q = 0.7) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }
  function noise(t, dur, peak, dest, { type = 'highpass', freq = 6000, to = null, q = 0.7, attack = 0.002 } = {}) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = mkFilter(type, freq, q);
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    envPerc(g, t, attack, peak, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }
  function lfo(t, end, rate, depth, target) {
    const l = mkOsc('sine', rate, t, end);
    const g = ctx.createGain();
    g.gain.value = depth;
    l.connect(g).connect(target);
  }

  // ---------- instruments ----------
  // Synth brass: three detuned saws, a filter that opens on each note, gentle vibrato.
  function brass(t, midi, dur, v, dest) {
    const f = hz(midi);
    const end = t + dur + 0.15;
    const filt = mkFilter('lowpass', 400, 1.2);
    filt.frequency.setValueAtTime(350, t);
    filt.frequency.exponentialRampToValueAtTime(Math.min(5200, f * 9), t + 0.05);
    filt.frequency.exponentialRampToValueAtTime(Math.min(3200, f * 5), t + 0.35);
    const g = ctx.createGain();
    envHold(g, t, 0.03, v, dur, 0.12, 0.75);
    filt.connect(g).connect(dest);
    [-9, 0, 8].forEach((dt) => {
      const o = mkOsc('sawtooth', f, t, end, dt);
      if (dur > 0.25) lfo(t + 0.18, end, 5.5, 5, o.detune);
      o.connect(filt);
    });
  }
  const brassChord = (t, midis, dur, v, dest) => midis.forEach((m) => brass(t, m, dur, v / Math.sqrt(midis.length), dest));

  // Drawbar organ with a touch of rotary-speaker tremolo.
  function organ(t, midis, dur, v, dest) {
    const end = t + dur + 0.08;
    const g = ctx.createGain();
    envHold(g, t, 0.01, v, dur, 0.06, 0.95);
    const trem = ctx.createGain();
    trem.gain.value = 0.85;
    lfo(t, end, 6.2, 0.15, trem.gain);
    g.connect(trem).connect(dest);
    midis.forEach((m) => {
      [[0.5, 0.18], [1, 1], [2, 0.6], [3, 0.3], [4, 0.22]].forEach(([r, a]) => {
        const o = mkOsc('sine', hz(m) * r, t, end);
        const og = ctx.createGain();
        og.gain.value = a / midis.length / 2.2;
        o.connect(og).connect(g);
      });
    });
  }

  // Electric piano (FM "tine" sound).
  function epiano(t, midi, dur, v, dest) {
    const f = hz(midi);
    const end = t + dur + 0.6;
    const car = mkOsc('sine', f, t, end);
    const mod = mkOsc('sine', f, t, end);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 1.4, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.5);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    envHold(g, t, 0.004, v, dur, 0.5, 0.45);
    car.connect(g).connect(dest);
  }
  const epChord = (t, midis, dur, v, dest) => midis.forEach((m) => epiano(t, m, dur, v / Math.sqrt(midis.length), dest));

  // Vibraphone: soft mallet with motor tremolo.
  function vibes(t, midi, dur, v, dest) {
    const f = hz(midi);
    const ring = Math.max(0.8, dur + 0.6);
    const end = t + ring;
    const g = ctx.createGain();
    envPerc(g, t, 0.003, v, ring);
    const trem = ctx.createGain();
    trem.gain.value = 0.8;
    lfo(t, end, 5.2, 0.2, trem.gain);
    g.connect(trem).connect(dest);
    mkOsc('sine', f, t, end).connect(g);
    const hi = mkOsc('sine', f * 4, t, t + 0.3);
    const hg = ctx.createGain();
    envPerc(hg, t, 0.002, 0.25, 0.25);
    hi.connect(hg).connect(g);
  }

  // Glockenspiel sparkle
  function glock(t, midi, v, dest) {
    const f = hz(midi);
    const g = ctx.createGain();
    envPerc(g, t, 0.002, v, 1.1);
    g.connect(dest);
    mkOsc('sine', f, t, t + 1.2).connect(g);
    const o2 = mkOsc('sine', f * 2.76, t, t + 0.5);
    const g2 = ctx.createGain();
    envPerc(g2, t, 0.002, 0.3, 0.4);
    o2.connect(g2).connect(g);
  }

  // String section pad
  function strings(t, midis, dur, v, dest) {
    const end = t + dur + 0.5;
    const filt = mkFilter('lowpass', 2400, 0.5);
    const g = ctx.createGain();
    envHold(g, t, 0.18, v, dur, 0.45, 0.9);
    filt.connect(g).connect(dest);
    midis.forEach((m) => [-11, 11].forEach((dt) => {
      const o = mkOsc('sawtooth', hz(m), t, end, dt);
      lfo(t, end, 4.8, 4, o.detune);
      const og = ctx.createGain();
      og.gain.value = 1 / midis.length / 2;
      o.connect(og).connect(filt);
    }));
  }
  // Short bowed note for ostinatos
  function stringStab(t, midi, dur, v, dest) {
    const end = t + dur + 0.1;
    const filt = mkFilter('lowpass', 2000, 0.6);
    const g = ctx.createGain();
    envHold(g, t, 0.015, v, dur, 0.08, 0.7);
    filt.connect(g).connect(dest);
    [-8, 8].forEach((dt) => mkOsc('sawtooth', hz(midi), t, end, dt).connect(filt));
  }

  // Upright bass
  function bass(t, midi, dur, v, dest) {
    if (dest === musicBus) dest = bassBus;
    const f = hz(midi);
    const end = t + dur + 0.12;
    const filt = mkFilter('lowpass', 900, 0.8);
    filt.frequency.setValueAtTime(1100, t);
    filt.frequency.exponentialRampToValueAtTime(420, t + 0.25);
    const g = ctx.createGain();
    envHold(g, t, 0.008, v, dur, 0.08, 0.55);
    filt.connect(g).connect(dest);
    mkOsc('triangle', f, t, end).connect(filt);
    const sub = mkOsc('sine', f, t, end);
    const sg = ctx.createGain();
    sg.gain.value = 0.6;
    sub.connect(sg).connect(filt);
  }

  // Drum kit
  function kick(t, v, dest) {
    const o = mkOsc('sine', 120, t, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
    const g = ctx.createGain();
    envPerc(g, t, 0.003, v, 0.28);
    o.connect(g).connect(dest);
  }
  function snare(t, v, dest) {
    noise(t, 0.17, v * 0.6, dest, { type: 'bandpass', freq: 2400, q: 0.6 });
    const o = mkOsc('triangle', 210, t, t + 0.08);
    const g = ctx.createGain();
    envPerc(g, t, 0.002, v * 0.35, 0.07);
    o.connect(g).connect(dest);
  }
  const rim = (t, v, dest) => noise(t, 0.04, v * 0.5, dest, { type: 'bandpass', freq: 1700, q: 4 });
  const brush = (t, v, dest) => noise(t, 0.22, v * 0.25, dest, { type: 'bandpass', freq: 3800, q: 0.4, attack: 0.04 });
  const hat = (t, v, dest, open = false) => noise(t, open ? 0.22 : 0.04, v * 0.3, dest, { type: 'highpass', freq: 8000 });
  function ride(t, v, dest) {
    noise(t, 0.4, v * 0.16, dest, { type: 'bandpass', freq: 9000, q: 0.8 });
    noise(t, 0.05, v * 0.12, dest, { type: 'highpass', freq: 6000 });
  }
  const crash = (t, v, dest) => noise(t, 1.8, v * 0.4, dest, { type: 'highpass', freq: 4500 });
  function timpani(t, midi, v, dest) {
    const f = hz(midi);
    const o = mkOsc('sine', f * 1.03, t, t + 1.4);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.15);
    const g = ctx.createGain();
    envPerc(g, t, 0.004, v, 1.2);
    o.connect(g).connect(dest);
    const o2 = mkOsc('sine', f * 1.5, t, t + 0.6);
    const g2 = ctx.createGain();
    envPerc(g2, t, 0.004, v * 0.3, 0.5);
    o2.connect(g2).connect(dest);
    noise(t, 0.12, v * 0.5, dest, { type: 'lowpass', freq: 500 });
  }

  // ---------- harmony ----------
  const CHORDS = {
    C: [48, 52, 55, 60], C6: [48, 52, 55, 57], Cmaj7: [48, 52, 55, 59], C7: [48, 52, 55, 58],
    Dm7: [50, 53, 57, 60], Em7: [52, 55, 59, 62], E7: [52, 56, 59, 62], F: [53, 57, 60, 65], Fmaj7: [53, 57, 60, 64],
    G: [55, 59, 62, 67], G7: [55, 59, 62, 65], Am: [57, 60, 64, 69], Am7: [57, 60, 64, 67], Bb: [58, 62, 65, 70], Dm: [50, 53, 57, 62],
  };
  const up = (notes, n) => notes.map((x) => x + n);

  // ---------- the tracks ----------
  // Each track: tempo, swing (how late the off-beats land), a chord per bar, and an arrangement
  // function that plays one 16th-note step. Melodies are [step, midi note, length in steps].
  const TRACKS = {
    // "Acro Party Theme": swinging big-band brass over walking bass, organ comping and ride cymbal.
    lobby: {
      bpm: 118, swing: 0.55,
      chords: ['C6', 'Am7', 'Dm7', 'G7', 'C6', 'Am7', 'Fmaj7', 'G7'],
      melody: [
        [[0, 67, 2], [2, 72, 2], [4, 76, 4], [8, 79, 6]],
        [[0, 81, 2], [2, 79, 2], [4, 76, 2], [6, 72, 6]],
        [[0, 74, 2], [2, 77, 2], [4, 81, 4], [8, 84, 4], [12, 81, 2], [14, 77, 2]],
        [[0, 79, 8], [10, 74, 2], [12, 77, 2], [14, 79, 2]],
        [[0, 67, 2], [2, 72, 2], [4, 76, 4], [8, 79, 6]],
        [[0, 81, 2], [2, 84, 2], [4, 81, 2], [6, 79, 6]],
        [[0, 77, 2], [2, 76, 2], [4, 74, 2], [6, 72, 2], [8, 74, 4], [12, 76, 4]],
        [[0, 74, 6], [8, 67, 2], [10, 71, 2], [12, 74, 4]],
      ],
      play(i, bar, ch, next, t, s16, bus) {
        if ([0, 4, 6, 8, 12, 14].includes(i)) ride(t, 0.5, bus);
        if (i === 0 || i === 8) kick(t, 0.25, bus);
        if (i === 4 || i === 12) { rim(t, 0.25, bus); hat(t, 0.4, bus); }
        if (i % 4 === 0) {
          const walk = [ch[0], ch[1], ch[2], next[0] - 1];
          bass(t, walk[i / 4] - 12, s16 * 3.2, 0.32, bus);
        }
        if (i === 0) organ(t, up(ch, 12), s16 * 2.5, 0.07, bus);
        if (i === 6) organ(t, up(ch, 12), s16 * 1.5, 0.06, bus);
      },
      lead: (t, m, d, bus) => { brass(t, m, d, 0.075, bus); brass(t, m - 12, d, 0.035, bus); },
    },

    // Thinking music: soft vibraphone tune, electric piano chords, brushes and bass in two.
    think: {
      bpm: 92, swing: 0.5,
      chords: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'],
      melody: [
        [[0, 76, 4], [4, 77, 4], [8, 81, 8]],
        [[0, 79, 4], [4, 76, 4], [8, 74, 8]],
        [[0, 77, 4], [4, 76, 4], [8, 74, 4], [12, 72, 4]],
        [[0, 71, 6], [6, 72, 10]],
      ],
      play(i, bar, ch, next, t, s16, bus) {
        if (i % 4 === 0) brush(t, 0.6, bus);
        if (i === 4 || i === 12) rim(t, 0.12, bus);
        if (i === 0) bass(t, ch[0] - 12, s16 * 7, 0.28, bus);
        if (i === 8) bass(t, ch[2] - 12, s16 * 7, 0.24, bus);
        if (i === 0) epChord(t, up(ch, 12), s16 * 14, 0.06, bus);
      },
      lead: (t, m, d, bus) => vibes(t, m, d, 0.09, bus),
    },

    // Voting: bouncy funk with organ, electric piano stabs and horn hits.
    vote: {
      bpm: 112, swing: 0.15,
      chords: ['Dm7', 'G7', 'Cmaj7', 'Am7'],
      melody: [[], [[14, 79, 2]], [], [[12, 76, 2], [14, 79, 2]]],
      play(i, bar, ch, next, t, s16, bus) {
        if ([0, 7, 10].includes(i)) kick(t, 0.24, bus);
        if (i === 4 || i === 12) snare(t, 0.3, bus);
        if (i % 2 === 0) hat(t, i === 14 ? 0.45 : 0.3, bus, i === 14);
        const bl = { 0: ch[0], 3: ch[0] + 12, 6: ch[0], 10: ch[2], 14: next[0] - 1 };
        if (bl[i] != null) bass(t, bl[i] - 12, s16 * 1.6, 0.2, bus);
        if ([2, 6, 11].includes(i)) epChord(t, up(ch, 12), s16 * 0.9, 0.07, bus);
        if (i === 0) organ(t, up(ch, 12), s16 * 15, 0.035, bus);
      },
      lead: (t, m, d, bus) => brassChord(t, [m - 7, m - 3, m], d, 0.09, bus),
    },

    // Results: bright, upbeat brass tune.
    results: {
      bpm: 124, swing: 0.3,
      chords: ['F', 'G', 'Em7', 'Am7', 'Dm7', 'G7', 'C', 'C'],
      melody: [
        [[0, 72, 2], [2, 74, 2], [4, 77, 4], [8, 81, 4], [12, 79, 4]],
        [[0, 79, 2], [2, 77, 2], [4, 74, 4], [8, 71, 8]],
        [[0, 76, 2], [2, 79, 2], [4, 83, 4], [8, 81, 8]],
        [[0, 81, 4], [4, 76, 4], [8, 72, 8]],
        [[0, 77, 2], [2, 81, 2], [4, 84, 4], [8, 81, 4], [12, 77, 4]],
        [[0, 79, 8], [8, 77, 2], [10, 76, 2], [12, 74, 4]],
        [[0, 72, 4], [4, 76, 4], [8, 79, 4], [12, 84, 4]],
        [[0, 84, 12]],
      ],
      play(i, bar, ch, next, t, s16, bus, s) {
        if (i === 0 && bar === 0) crash(t, 0.4, bus);
        if (i === 0 || i === 8 || i === 10) kick(t, 0.38, bus);
        if (i === 4 || i === 12) snare(t, 0.3, bus);
        if (i % 2 === 0) hat(t, 0.28, bus);
        if (i % 4 === 0) bass(t, (i === 12 ? next[0] - 1 : i === 8 ? ch[2] : ch[0]) - 12, s16 * 3, 0.3, bus);
        if (i === 2 || i === 10) organ(t, up(ch, 12), s16 * 1.5, 0.06, bus);
      },
      lead: (t, m, d, bus) => { brass(t, m, d, 0.07, bus); brass(t, m - 12, d, 0.03, bus); },
    },

    // Lightning round: driving strings, timpani and brass hits in A minor.
    lightning: {
      bpm: 146, swing: 0,
      chords: ['Am', 'F', 'G', 'E7'],
      melody: [[[0, 76, 3], [6, 76, 2]], [[0, 77, 3], [6, 77, 2]], [[0, 79, 3], [6, 79, 2]], [[0, 80, 3], [6, 80, 2], [12, 83, 4]]],
      play(i, bar, ch, next, t, s16, bus) {
        if (i % 4 === 0) kick(t, 0.26, bus);
        if (i === 4 || i === 12) snare(t, 0.32, bus);
        if (bar === 3 && i >= 12) snare(t, 0.18, bus);
        hat(t, i % 2 ? 0.14 : 0.24, bus);
        if (i === 0 || i === 8) timpani(t, ch[0] - 12, 0.26, bus);
        if (i % 2 === 0) stringStab(t, (i % 4 === 0 ? ch[0] : ch[2]) + 12, s16 * 1.2, 0.05, bus);
        if (i % 2 === 0) bass(t, ch[0] - 12, s16 * 1.4, 0.26, bus);
        if (i === 0) strings(t, up(ch, 24).slice(0, 3), s16 * 15, 0.025, bus);
      },
      lead: (t, m, d, bus) => brassChord(t, [m - 12, m - 5, m], d, 0.1, bus),
    },

    // Victory theme: big brass fanfare tune with crashes and organ.
    victory: {
      bpm: 128, swing: 0.2,
      chords: ['C', 'F', 'G7', 'C'],
      melody: [
        [[0, 72, 2], [2, 76, 2], [4, 79, 2], [6, 84, 10]],
        [[0, 81, 4], [4, 84, 4], [8, 81, 4], [12, 77, 4]],
        [[0, 79, 4], [4, 77, 2], [6, 76, 2], [8, 74, 8]],
        [[0, 72, 12]],
      ],
      play(i, bar, ch, next, t, s16, bus) {
        if (i === 0 && (bar === 0 || bar === 3)) crash(t, 0.45, bus);
        if (i % 4 === 0) kick(t, 0.4, bus);
        if (i === 4 || i === 12) snare(t, 0.34, bus);
        if (i % 2 === 0) ride(t, 0.4, bus);
        if (i % 4 === 0) bass(t, (i === 4 ? ch[1] : i === 8 ? ch[2] : i === 12 ? next[0] - 1 : ch[0]) - 12, s16 * 3, 0.3, bus);
        if (i === 0) organ(t, up(ch, 12), s16 * 15, 0.045, bus);
        if (i === 0 && bar === 3) glock(t, 96, 0.08, bus);
      },
      lead: (t, m, d, bus) => { brass(t, m, d, 0.08, bus); brass(t, m - 4, d, 0.035, bus); brass(t, m - 12, d, 0.035, bus); },
    },
  };

  // ---------- sequencer ----------
  let mood = null;
  let pendingMood = null;
  let step = 0;
  let nextTime = 0;
  let seqTimer = null;
  let musicPaused = false;

  function scheduleStep(name, s, t) {
    const m = TRACKS[name];
    const bars = m.chords.length;
    const bar = Math.floor(s / 16) % bars;
    const i = s % 16;
    const s16 = 60 / m.bpm / 4;
    const tt = t + (i % 4 === 2 ? m.swing * s16 : 0); // swing the off-beats
    const ch = CHORDS[m.chords[bar]];
    const next = CHORDS[m.chords[(bar + 1) % bars]];
    m.play(i, bar, ch, next, tt, s16, musicBus, s);
    const mel = m.melody[bar % m.melody.length] || [];
    for (const [st, midi, len] of mel) if (st === i) m.lead(tt, midi, len * s16 * 0.95, leadBus);
  }

  function tickSequencer() {
    if (!ready()) return;
    while (nextTime < ctx.currentTime + 0.15) {
      if (step % 16 === 0 && pendingMood) {
        mood = pendingMood === 'none' ? null : pendingMood;
        pendingMood = null;
        step = 0;
        if (!mood) {
          stopSequencer();
          return;
        }
      }
      if (mood && !musicPaused) scheduleStep(mood, step, nextTime);
      const bpm = mood ? TRACKS[mood].bpm : 100;
      nextTime += 60 / bpm / 4;
      step++;
    }
  }
  function stopSequencer() {
    clearInterval(seqTimer);
    seqTimer = null;
    mood = null;
  }

  // Switch tracks at the next bar line so the change sounds musical.
  // ---------- your recorded music (public/music) ----------
  // Moods that use a music file instead of the synthesizer. Each file loops seamlessly between
  // loopStart and loopEnd (seconds). The theme plays its intro once, then loops the main section.
  const FILES = {
    lobby: { url: '/music/theme.mp3', start: 0, loopStart: 9.604, loopEnd: 24.964, gain: 0.95 },
    think: { url: '/music/rounds.mp3', start: 0.5, loopStart: 0.5, loopEnd: 8.18, gain: 0.95 },
    lightning: { url: '/music/lightning.mp3', start: 0.5, loopStart: 0.5, loopEnd: 13.741, gain: 0.95 },
  };
  const buffers = {}; // url -> AudioBuffer | Promise | 'failed'
  function loadFile(url) {
    if (buffers[url]) return buffers[url];
    buffers[url] = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((data) => new Promise((res, rej) => ctx.decodeAudioData(data, res, rej)))
      .then((buf) => (buffers[url] = buf))
      .catch((e) => {
        console.warn('Music file failed to load, using synthesized music instead:', url, e && e.message);
        buffers[url] = 'failed';
      });
    return buffers[url];
  }
  function preloadFiles() {
    if (!init()) return;
    Object.values(FILES).forEach((f) => loadFile(f.url));
  }

  let track = null; // { name, src, g }
  let wanted = null; // the mood the game currently asks for
  function stopTrack(fade = 0.6) {
    if (!track) return;
    const { src, g } = track;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0.0001, t + fade);
    try { src.stop(t + fade + 0.05); } catch {}
    track = null;
  }
  function startTrack(name) {
    const f = FILES[name];
    const buf = buffers[f.url];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = f.loopStart;
    src.loopEnd = Math.min(f.loopEnd, buf.duration);
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(musicPaused ? 0.0001 : f.gain, t + (f.start === 0 ? 0.05 : 0.4));
    src.connect(g).connect(musicBus);
    src.start(t + 0.02, f.start);
    track = { name, src, g, gain: f.gain };
  }

  // Switch music. Recorded tracks are used where available; otherwise the synthesizer plays.
  function music(name) {
    if (!init()) return;
    wanted = name;
    const f = FILES[name];
    if (f) {
      const buf = buffers[f.url];
      if (buf && buf !== 'failed' && !(buf instanceof Promise)) {
        if (track && track.name === name) return;
        stopTrack();
        if (seqTimer) stopSequencer(); // cut the synthesizer right away
        pendingMood = null;
        startTrack(name);
        return;
      }
      if (buf !== 'failed') {
        // Not loaded yet: play the synthesizer for now, switch to the file once it arrives.
        Promise.resolve(loadFile(f.url)).then(() => {
          if (wanted === name && buffers[f.url] !== 'failed' && !(track && track.name === name)) music(name);
        });
      }
    }
    stopTrack();
    synthMusic(name);
  }

  function synthMusic(name) {
    if (name === mood && !pendingMood) return;
    if (!seqTimer) {
      if (name === 'none' || !TRACKS[name]) return;
      mood = name;
      pendingMood = null;
      step = 0;
      nextTime = ctx.currentTime + 0.05;
      seqTimer = setInterval(tickSequencer, 25);
      return;
    }
    pendingMood = name;
    // Don't wait more than a beat for the change.
    const toBar = 16 - (step % 16);
    if (toBar > 4) step += toBar % 4;
  }
  function pauseMusic(p) {
    if (p === musicPaused) return;
    musicPaused = p;
    if (track && ctx) {
      const t = ctx.currentTime;
      track.g.gain.cancelScheduledValues(t);
      track.g.gain.setValueAtTime(track.g.gain.value, t);
      track.g.gain.linearRampToValueAtTime(p ? 0.0001 : track.gain, t + 0.3);
    }
  }
  function duck(on) {
    if (!ctx) return;
    duckGain.gain.setTargetAtTime(on ? 0.35 : 1, ctx.currentTime, 0.12);
  }

  // ---------- sound effects ----------
  const now = () => ctx.currentTime + 0.01;
  const SFX = {
    // Marimba-like pop for each letter tile, rising in pitch
    pop(i = 0) {
      const t = now();
      const m = [72, 74, 76, 79, 81, 84, 86][i % 7];
      vibes(t, m, 0.2, 0.22, sfxBus);
      noise(t, 0.02, 0.06, sfxBus, { type: 'bandpass', freq: 3000, q: 2 });
    },
    letters(n) {
      // One pop per tile, matching the drop animation (0.25 s apart).
      for (let i = 0; i < n; i++) setTimeout(() => ready() && SFX.pop(i), i * 250 + 120);
    },
    whoosh() {
      noise(now(), 0.45, 0.22, sfxBus, { type: 'bandpass', freq: 300, to: 3500, q: 1.2, attack: 0.12 });
    },
    // Doorbell "ding-dong" when a player joins
    join() {
      const t = now();
      vibes(t, 76, 0.25, 0.2, sfxBus);
      vibes(t + 0.18, 72, 0.5, 0.2, sfxBus);
    },
    ding() {
      glock(now(), 88, 0.16, sfxBus);
    },
    // Wood-block tap for a vote
    blip() {
      const t = now();
      const o = mkOsc('sine', 1250, t, t + 0.08);
      const g = ctx.createGain();
      envPerc(g, t, 0.001, 0.2, 0.06);
      o.connect(g).connect(sfxBus);
    },
    allIn() {
      const t = now();
      [72, 76, 79, 84].forEach((m, i) => vibes(t + i * 0.07, m, 0.3, 0.16, sfxBus));
    },
    // Classic game-show "time's up" buzzer
    buzzer() {
      const t = now();
      const filt = mkFilter('lowpass', 1500, 1);
      const g = ctx.createGain();
      envHold(g, t, 0.01, 0.22, 0.7, 0.06, 1);
      filt.connect(g).connect(sfxBus);
      [98, 104, 196].forEach((f) => mkOsc('sawtooth', f, t, t + 0.8).connect(filt));
    },
    // Brass "ta-da!" for the round winner
    fanfare() {
      const t = now();
      brass(t, 67, 0.1, 0.12, sfxBus);
      brass(t + 0.13, 67, 0.1, 0.12, sfxBus);
      brassChord(t + 0.28, [60, 64, 67, 72], 0.9, 0.2, sfxBus);
      crash(t + 0.28, 0.3, sfxBus);
      timpani(t + 0.28, 36, 0.35, sfxBus);
    },
    drumroll(sec = 1.6) {
      const t = now();
      const n = Math.floor(sec / 0.045);
      for (let i = 0; i < n; i++) snare(t + i * 0.045, 0.05 + (0.22 * i) / n, sfxBus);
      crash(t + sec, 0.4, sfxBus);
      timpani(t + sec, 36, 0.45, sfxBus);
    },
    // Lightning round sting: rising whoosh into a minor brass hit
    zap() {
      const t = now();
      noise(t, 0.5, 0.2, sfxBus, { type: 'bandpass', freq: 400, to: 5000, q: 1.5, attack: 0.3 });
      brassChord(t + 0.5, [57, 60, 64, 69], 0.5, 0.2, sfxBus);
      timpani(t + 0.5, 33, 0.45, sfxBus);
      crash(t + 0.5, 0.3, sfxBus);
    },
    champion() {
      const t = now();
      SFX.drumroll(1.2);
      const mel = [[0, 67], [0.14, 72], [0.28, 76], [0.42, 79], [0.62, 76], [0.76, 79], [0.9, 84]];
      mel.forEach(([d, m], i) => brass(t + 1.25 + d, m, i === mel.length - 1 ? 1.4 : 0.12, 0.12, sfxBus));
      brassChord(t + 2.15, [60, 64, 67, 72], 1.4, 0.16, sfxBus);
      strings(t + 2.15, [72, 76, 79], 1.6, 0.05, sfxBus);
      crash(t + 2.15, 0.35, sfxBus);
      glock(t + 2.15, 96, 0.1, sfxBus);
    },
    scratch() {
      noise(now(), 0.25, 0.25, sfxBus, { type: 'bandpass', freq: 2500, to: 400, q: 3 });
    },
    // Soft woodblock tick. "urgent" makes it brighter for the last seconds.
    tick(urgent) {
      const t = now();
      const o = mkOsc('sine', urgent ? 1400 : 1050, t, t + 0.06);
      const g = ctx.createGain();
      envPerc(g, t, 0.001, urgent ? 0.4 : 0.22, 0.05);
      o.connect(g).connect(tickBus);
    },
  };

  function play(name, ...args) {
    if (!ready() || settings.muted) return;
    try {
      SFX[name](...args);
    } catch {}
  }

  // ---------- settings ----------
  function apply() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(settings.muted ? 0 : LEVEL, t, 0.05);
    musicBus.gain.setTargetAtTime(settings.music * 0.55, t, 0.05);
    sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.05);
    tickBus.gain.setTargetAtTime(settings.ticker ? settings.sfx : 0, t, 0.05);
  }
  function set(patch) {
    Object.assign(settings, patch);
    save();
    init();
    apply();
  }

  window.Sound = { music, pauseMusic, duck, play, set, settings, isRunning: () => !!ctx && ctx.state === 'running', unlock, preloadFiles,
    nowPlaying: () => (track ? 'file:' + track.name : mood ? 'synth:' + mood : 'none') };
})();
