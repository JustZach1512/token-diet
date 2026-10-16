'use strict';
// Web Audio synth engine: every sound in the game is generated here, no samples.
(function () {
  const NF = globalThis.NF;
  const U = NF.util;
  const A = (NF.audio = { ctx: null, ready: false });

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  A.mtof = mtof;

  function distCurve(amount) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    return c;
  }
  function crushCurve(steps) {
    const n = 4096, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = Math.round(x * steps) / steps;
    }
    return c;
  }

  A.init = function () {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') A.ctx.resume();
      return true;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    let ctx;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      ctx = new AC();
    }
    A.ctx = ctx;

    // master -> glue compressor -> limiter -> soft clipper (never lets a peak past 0 dBFS)
    A.master = ctx.createGain();
    A.master.gain.value = 0.8;
    A.comp = ctx.createDynamicsCompressor();
    A.comp.threshold.value = -16;
    A.comp.knee.value = 10;
    A.comp.ratio.value = 4;
    A.comp.attack.value = 0.003;
    A.comp.release.value = 0.18;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.1;
    const pre = ctx.createGain();
    pre.gain.value = 0.5;
    const clip = ctx.createWaveShaper();
    const n = 4096, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = ((i * 2) / n - 1) * 2; // shaper input is pre-scaled by 0.5: covers +-2
      const ax = Math.abs(x);
      curve[i] = Math.sign(x) * (ax < 0.85 ? ax : 0.85 + 0.13 * Math.tanh((ax - 0.85) / 0.13));
    }
    clip.curve = curve;
    A.master.connect(A.comp);
    A.comp.connect(lim);
    lim.connect(pre);
    pre.connect(clip);
    clip.connect(ctx.destination);
    A.analyser = ctx.createAnalyser();
    A.analyser.fftSize = 2048;
    clip.connect(A.analyser);

    A.musicBus = ctx.createGain();
    A.voiceBus = ctx.createGain();
    A.sfxBus = ctx.createGain();
    A.musicBus.connect(A.master);
    A.voiceBus.connect(A.master);
    A.sfxBus.connect(A.master);

    // One shared room reverb; music and voice sends scale with their volume sliders.
    const len = Math.floor(ctx.sampleRate * 1.9);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
    A.convolver = ctx.createConvolver();
    A.convolver.buffer = ir;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    A.convolver.connect(revOut);
    revOut.connect(A.master);
    A.musicRevIn = ctx.createGain();
    A.voiceRevIn = ctx.createGain();
    A.sfxRevIn = ctx.createGain();
    A.musicRevIn.connect(A.convolver);
    A.voiceRevIn.connect(A.convolver);
    A.sfxRevIn.connect(A.convolver);

    const nlen = ctx.sampleRate * 2;
    A.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = A.noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;

    A.waves = {};
    const pulse = (duty) => {
      const N = 48, real = new Float32Array(N), imag = new Float32Array(N);
      for (let n = 1; n < N; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
      return ctx.createPeriodicWave(real, imag);
    };
    A.waves.pulse25 = pulse(0.25);
    A.waves.pulse12 = pulse(0.125);
    A.curves = { dist: distCurve(18), soft: distCurve(4), crush: crushCurve(6), heavy: distCurve(60) };

    A.applyVolumes();
    A.ready = true;
    return true;
  };

  A.applyVolumes = function () {
    if (!A.ctx) return;
    const o = NF.save.opt;
    const t = A.ctx.currentTime;
    A.musicBus.gain.setTargetAtTime(o.musicVol, t, 0.02);
    A.musicRevIn.gain.setTargetAtTime(o.musicVol, t, 0.02);
    A.voiceBus.gain.setTargetAtTime(o.voiceVol, t, 0.02);
    A.voiceRevIn.gain.setTargetAtTime(o.voiceVol, t, 0.02);
    A.sfxBus.gain.setTargetAtTime(o.sfxVol, t, 0.02);
    A.sfxRevIn.gain.setTargetAtTime(o.sfxVol, t, 0.02);
  };

  A.now = () => (A.ctx ? A.ctx.currentTime : 0);

  // currentTime advances in render quanta; interpolate with performance.now() for smooth visuals.
  let lastCtxT = -1, lastPerf = 0;
  A.time = function () {
    const ctx = A.ctx;
    if (!ctx) return 0;
    const c = ctx.currentTime, p = performance.now();
    if (c !== lastCtxT) {
      lastCtxT = c;
      lastPerf = p;
    }
    if (ctx.state !== 'running') return c;
    return c + Math.min(0.04, (p - lastPerf) / 1000);
  };
  A.latency = function () {
    const ctx = A.ctx;
    if (!ctx) return 0;
    return (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
  };

  // ---------- small node helpers ----------
  function gainEnv(t, peak, attack, decay, sustain, end, release) {
    const g = A.ctx.createGain();
    const p = g.gain;
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    if (decay > 0) p.setTargetAtTime(Math.max(0.0001, peak * sustain), t + attack, decay / 3);
    p.setTargetAtTime(0.0001, Math.max(end, t + attack), release / 3);
    return g;
  }
  function osc(type, freq, t, end) {
    const o = A.ctx.createOscillator();
    if (A.waves[type]) o.setPeriodicWave(A.waves[type]);
    else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(end);
    return o;
  }
  function noiseSrc(t, end) {
    const s = A.ctx.createBufferSource();
    s.buffer = A.noise;
    s.start(t, Math.random() * 1.5);
    s.stop(end);
    return s;
  }
  function filter(type, freq, q) {
    const f = A.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    return f;
  }
  function send(node, dst, amt) {
    if (!dst.rev || !amt) return;
    const s = A.ctx.createGain();
    s.gain.value = amt;
    node.connect(s);
    s.connect(dst.rev);
  }

  // ---------- drums ----------
  const D = (A.drums = {});
  D.kick = function (t, v, dst, kind) {
    const ctx = A.ctx;
    const k = kind || 'punch';
    const f0 = k === '808' ? 110 : k === 'hard' ? 190 : k === 'soft' ? 120 : 155;
    const f1 = k === '808' ? 40 : 46;
    const dur = k === '808' ? 0.65 : k === 'soft' ? 0.25 : 0.33;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + (k === '808' ? 0.12 : 0.085));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    if (k === 'hard') {
      const ws = ctx.createWaveShaper();
      ws.curve = A.curves.soft;
      g.connect(ws);
      ws.connect(dst.out);
    } else g.connect(dst.out);
    o.start(t);
    o.stop(t + dur + 0.02);
    if (k !== 'soft') {
      const n = noiseSrc(t, t + 0.02);
      const hp = filter('highpass', 2500);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.22 * v, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
      n.connect(hp);
      hp.connect(ng);
      ng.connect(dst.out);
    }
  };
  D.snare = function (t, v, dst, kind) {
    const ctx = A.ctx;
    const k = kind || 'tight';
    if (k === 'clap') return D.clap(t, v, dst);
    const n = noiseSrc(t, t + 0.3);
    const bp = filter(k === 'rim' ? 'bandpass' : 'highpass', k === 'rim' ? 3000 : 1300, k === 'rim' ? 2 : 0.7);
    const ng = ctx.createGain();
    const dec = k === 'big' ? 0.28 : k === 'rim' ? 0.06 : 0.17;
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.55 * v, t + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.001, t + dec);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(dst.out);
    send(ng, dst, 0.18);
    const o = osc('triangle', k === 'rim' ? 420 : 200, t, t + 0.15);
    o.frequency.exponentialRampToValueAtTime(k === 'rim' ? 380 : 150, t + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.002);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(og);
    og.connect(dst.out);
  };
  D.clap = function (t, v, dst) {
    const ctx = A.ctx;
    const n = noiseSrc(t, t + 0.3);
    const bp = filter('bandpass', 1200, 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 3; i++) {
      const s = t + i * 0.011;
      g.gain.setValueAtTime(0.6 * v, s);
      g.gain.exponentialRampToValueAtTime(0.08 * v, s + 0.009);
    }
    g.gain.setValueAtTime(0.5 * v, t + 0.034);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    n.connect(bp);
    bp.connect(g);
    g.connect(dst.out);
    send(g, dst, 0.25);
  };
  D.hat = function (t, v, dst, open) {
    const ctx = A.ctx;
    const dur = open ? 0.28 : 0.045;
    const n = noiseSrc(t, t + dur + 0.02);
    const hp = filter('highpass', 7200);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(hp);
    hp.connect(g);
    g.connect(dst.out);
  };
  D.crash = function (t, v, dst) {
    const ctx = A.ctx;
    const n = noiseSrc(t, t + 1.4);
    const hp = filter('highpass', 4200);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    n.connect(hp);
    hp.connect(g);
    g.connect(dst.out);
    send(g, dst, 0.2);
  };
  D.ride = function (t, v, dst) {
    const ctx = A.ctx;
    const n = noiseSrc(t, t + 0.4);
    const bp = filter('bandpass', 8500, 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    n.connect(bp);
    bp.connect(g);
    g.connect(dst.out);
    const o = osc('square', 3400, t, t + 0.3);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.012 * v, t);
    og.gain.exponentialRampToValueAtTime(0.0005, t + 0.28);
    o.connect(og);
    og.connect(dst.out);
  };
  D.tom = function (t, v, dst, pitch) {
    const ctx = A.ctx;
    const f = pitch || 160;
    const o = osc('sine', f * 1.6, t, t + 0.35);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7 * v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g);
    g.connect(dst.out);
    send(g, dst, 0.15);
  };
  D.perc = function (t, v, dst, kind) {
    const ctx = A.ctx;
    if (kind === 'clave' || kind === 'wood') {
      const f = kind === 'clave' ? 2500 : 900;
      const o = osc('sine', f, t, t + 0.12);
      if (kind === 'wood') o.frequency.exponentialRampToValueAtTime(680, t + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35 * v, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'clave' ? 0.06 : 0.09));
      o.connect(g);
      g.connect(dst.out);
      send(g, dst, 0.2);
    } else if (kind === 'shaker' || kind === 'guiro') {
      const dur = kind === 'guiro' ? 0.09 : 0.05;
      const n = noiseSrc(t, t + dur + 0.02);
      const bp = filter('bandpass', kind === 'guiro' ? 4200 : 6500, 1.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28 * v, t + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      n.connect(bp);
      bp.connect(g);
      g.connect(dst.out);
    } else if (kind === 'cowbell') {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12 * v, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      const bp = filter('bandpass', 1000, 2);
      osc('square', 540, t, t + 0.32).connect(bp);
      osc('square', 800, t, t + 0.32).connect(bp);
      bp.connect(g);
      g.connect(dst.out);
    } else if (kind === 'scratch') {
      const n = noiseSrc(t, t + 0.25);
      const bp = filter('bandpass', 700, 4);
      bp.frequency.setValueAtTime(600, t);
      bp.frequency.exponentialRampToValueAtTime(3200, t + 0.08);
      bp.frequency.exponentialRampToValueAtTime(500, t + 0.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      n.connect(bp);
      bp.connect(g);
      g.connect(dst.out);
    } else if (kind === 'glitch') {
      const o = osc('square', 200 + Math.random() * 1800, t, t + 0.08);
      o.frequency.setValueAtTime(100 + Math.random() * 3000, t + 0.03);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.09 * v, t);
      g.gain.setValueAtTime(0.0001, t + 0.07);
      o.connect(g);
      g.connect(dst.crush || dst.out);
    }
  };

  // ---------- tonal instruments ----------
  A.bass = function (t, m, dur, v, dst, preset) {
    const ctx = A.ctx;
    const f = mtof(m);
    const end = t + Math.max(0.05, dur);
    const p = preset || 'sub';
    let out = dst.out;
    if (p === 'dist' && dst.dist) out = dst.dist;
    if (p === 'chip' && dst.crush) out = dst.crush;
    const g = gainEnv(t, 0.55 * v, 0.006, p === 'pluck' || p === 'funk' ? 0.25 : 0.4, p === 'sub' || p === 'reese' ? 0.9 : 0.55, end, 0.06);
    g.connect(out);
    if (p === 'sub') {
      const lp = filter('lowpass', 700, 0.5);
      osc('sine', f, t, end + 0.1).connect(lp);
      const o2 = osc('triangle', f, t, end + 0.1);
      const g2 = ctx.createGain();
      g2.gain.value = 0.5;
      o2.connect(g2);
      g2.connect(lp);
      lp.connect(g);
    } else if (p === 'reese') {
      const lp = filter('lowpass', 520, 2);
      lp.frequency.setValueAtTime(380, t);
      lp.frequency.linearRampToValueAtTime(900, t + Math.min(dur, 1.2));
      const o1 = osc('sawtooth', f, t, end + 0.1);
      const o2 = osc('sawtooth', f, t, end + 0.1);
      o1.detune.value = -16;
      o2.detune.value = 16;
      o1.connect(lp);
      o2.connect(lp);
      osc('sine', f / 2, t, end + 0.1).connect(lp);
      lp.connect(g);
    } else if (p === 'chip') {
      osc('pulse25', f, t, end + 0.1).connect(g);
    } else {
      // pluck / funk / saw / dist / octave
      const q = p === 'funk' ? 9 : p === 'pluck' ? 4 : 1.5;
      const lp = filter('lowpass', 2400, q);
      const top = p === 'funk' ? 3200 : p === 'dist' ? 2600 : 2200;
      const bottom = p === 'funk' ? 320 : p === 'dist' ? 900 : 420;
      lp.frequency.setValueAtTime(top, t);
      lp.frequency.setTargetAtTime(bottom, t + 0.005, p === 'funk' ? 0.04 : 0.09);
      osc(p === 'funk' ? 'square' : 'sawtooth', f, t, end + 0.1).connect(lp);
      if (p !== 'funk') {
        const sub = osc('sine', f, t, end + 0.1);
        const sg = ctx.createGain();
        sg.gain.value = 0.7;
        sub.connect(sg);
        sg.connect(g);
      }
      lp.connect(g);
    }
  };

  const PAD = {
    warm: { types: ['sawtooth', 'sawtooth'], det: 8, lp: 1500, a: 0.12, s: 0.8, rel: 0.35, rev: 0.35, gain: 0.07 },
    keys: { types: ['triangle', 'sine'], det: 0, lp: 3200, a: 0.006, s: 0.35, dec: 0.7, rel: 0.25, rev: 0.25, gain: 0.11, mult2: 2 },
    organ: { types: ['sine', 'sine', 'sine'], det: 0, lp: 4000, a: 0.03, s: 0.9, rel: 0.12, rev: 0.4, gain: 0.07, mults: [1, 2, 3] },
    strings: { types: ['sawtooth', 'sawtooth'], det: 11, lp: 2400, a: 0.32, s: 0.9, rel: 0.5, rev: 0.45, gain: 0.055 },
    dark: { types: ['sawtooth', 'sawtooth'], det: 18, lp: 650, a: 0.25, s: 0.9, rel: 0.6, rev: 0.5, gain: 0.08 },
    glass: { types: ['triangle', 'sine'], det: 4, lp: 6000, a: 0.04, s: 0.6, dec: 1.2, rel: 0.6, rev: 0.5, gain: 0.07, mult2: 4 },
    stab: { types: ['sawtooth', 'square'], det: 6, lp: 2600, a: 0.004, s: 0.15, dec: 0.18, rel: 0.08, rev: 0.25, gain: 0.07 },
    chip: { types: ['pulse12', 'pulse25'], det: 5, lp: 7000, a: 0.004, s: 0.6, dec: 0.2, rel: 0.05, rev: 0.12, gain: 0.04 },
    power: { types: ['sawtooth', 'sawtooth'], det: 7, lp: 3500, a: 0.004, s: 0.8, dec: 0.3, rel: 0.06, rev: 0.1, gain: 0.07, dist: true },
    choir: { types: ['sawtooth', 'triangle'], det: 10, lp: 1100, a: 0.4, s: 0.9, rel: 0.7, rev: 0.6, gain: 0.06, formant: true },
  };
  A.pad = function (t, ms, dur, v, dst, preset) {
    const ctx = A.ctx;
    const P = PAD[preset] || PAD.warm;
    const end = t + Math.max(0.05, dur);
    const g = gainEnv(t, P.gain * v, P.a, P.dec || 0.3, P.s, end, P.rel);
    const lp = filter('lowpass', P.lp, P.formant ? 3 : 0.7);
    lp.connect(g);
    g.connect(P.dist && dst.dist ? dst.dist : dst.out);
    send(g, dst, P.rev);
    for (const m of ms) {
      const f = mtof(m);
      P.types.forEach((type, i) => {
        const mult = P.mults ? P.mults[i] : i === 1 && P.mult2 ? P.mult2 : 1;
        const o = osc(type, f * mult, t, end + P.rel + 0.05);
        o.detune.value = (i % 2 ? 1 : -1) * P.det;
        if (mult !== 1) {
          const h = ctx.createGain();
          h.gain.value = 0.35 / mult;
          o.connect(h);
          h.connect(lp);
        } else o.connect(lp);
      });
    }
  };

  A.lead = function (t, m, dur, v, dst, preset) {
    const ctx = A.ctx;
    const f = mtof(m);
    const p = preset || 'pluck';
    const end = t + Math.max(0.04, dur);
    if (p === 'bell') {
      const g = gainEnv(t, 0.16 * v, 0.003, 1.1, 0.0001, end + 0.6, 0.4);
      const car = osc('sine', f, t, end + 1.2);
      const mod = osc('sine', f * 3.5, t, end + 1.2);
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 2.2, t);
      mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.9);
      mod.connect(mg);
      mg.connect(car.frequency);
      car.connect(g);
      g.connect(dst.out);
      send(g, dst, 0.45);
      return;
    }
    if (p === 'marimba') {
      const g = gainEnv(t, 0.22 * v, 0.002, 0.35, 0.0001, end + 0.2, 0.15);
      osc('sine', f, t, end + 0.5).connect(g);
      const o2 = osc('sine', f * 4, t, t + 0.12);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.12 * v, t);
      g2.gain.exponentialRampToValueAtTime(0.0005, t + 0.08);
      o2.connect(g2);
      g2.connect(dst.out);
      g.connect(dst.out);
      send(g, dst, 0.35);
      return;
    }
    const cfg = {
      pluck: { type: 'sawtooth', lp0: 5000, lp1: 900, q: 3, a: 0.003, dec: 0.25, s: 0.25, gain: 0.12, rev: 0.3 },
      chip: { type: 'pulse25', lp0: 9000, lp1: 9000, q: 0.5, a: 0.002, dec: 0.15, s: 0.7, gain: 0.07, rev: 0.12, crush: true },
      brass: { type: 'sawtooth', lp0: 400, lp1: 2600, q: 2, a: 0.03, dec: 0.3, s: 0.8, gain: 0.1, rev: 0.3, swell: true },
      square: { type: 'square', lp0: 3200, lp1: 1800, q: 1, a: 0.005, dec: 0.2, s: 0.6, gain: 0.07, rev: 0.25 },
      theremin: { type: 'sine', lp0: 4000, lp1: 4000, q: 0.5, a: 0.06, dec: 0.3, s: 0.9, gain: 0.16, rev: 0.5, vib: 0.02 },
      guitar: { type: 'sawtooth', lp0: 3000, lp1: 2200, q: 1, a: 0.004, dec: 0.4, s: 0.7, gain: 0.08, rev: 0.15, dist: true },
      glitch: { type: 'square', lp0: 6000, lp1: 1200, q: 6, a: 0.002, dec: 0.12, s: 0.4, gain: 0.07, rev: 0.3, crush: true },
    }[p] || { type: 'sawtooth', lp0: 4000, lp1: 900, q: 3, a: 0.003, dec: 0.25, s: 0.3, gain: 0.12, rev: 0.3 };
    const g = gainEnv(t, cfg.gain * v, cfg.a, cfg.dec, cfg.s, end, 0.08);
    const lp = filter('lowpass', cfg.lp0, cfg.q);
    if (cfg.swell) {
      lp.frequency.setValueAtTime(cfg.lp0, t);
      lp.frequency.linearRampToValueAtTime(cfg.lp1, t + 0.09);
    } else {
      lp.frequency.setValueAtTime(cfg.lp0, t);
      lp.frequency.setTargetAtTime(cfg.lp1, t + 0.01, 0.08);
    }
    const o = osc(cfg.type, f, t, end + 0.15);
    if (cfg.vib) {
      const l = osc('sine', 5.5, t, end + 0.15);
      const lg = ctx.createGain();
      lg.gain.value = f * cfg.vib;
      l.connect(lg);
      lg.connect(o.frequency);
    }
    if (p === 'glitch') {
      o.frequency.setValueAtTime(f * 2, t + dur * 0.5);
      o.frequency.setValueAtTime(f, t + dur * 0.75);
    }
    o.connect(lp);
    lp.connect(g);
    let out = dst.out;
    if (cfg.dist && dst.dist) out = dst.dist;
    else if (cfg.crush && dst.crush) out = dst.crush;
    g.connect(out);
    send(g, dst, cfg.rev);
  };

  // ---------- singing voices ----------
  // Formants (Hz) for a, e, i, o, u.
  const VOWELS = [
    [730, 1090, 2440],
    [530, 1840, 2480],
    [320, 2200, 2900],
    [570, 840, 2410],
    [360, 900, 2250],
  ];
  class VoiceChannel {
    constructor(graph, preset, pan) {
      const ctx = A.ctx;
      this.p = Object.assign({ wave: 'sawtooth', formant: 1, vib: 0.35, vibRate: 5.6, gain: 1, oct: 0, cons: 'b' }, preset);
      this.in = ctx.createGain();
      let node = this.in;
      if (this.p.drive) {
        const ws = ctx.createWaveShaper();
        ws.curve = this.p.drive > 30 ? A.curves.heavy : A.curves.dist;
        node.connect(ws);
        node = ws;
      }
      if (this.p.ring) {
        const rg = ctx.createGain();
        rg.gain.value = 0;
        const ro = ctx.createOscillator();
        ro.frequency.value = this.p.ring;
        ro.connect(rg.gain);
        ro.start();
        this.ringOsc = ro;
        const mix = ctx.createGain();
        node.connect(rg);
        rg.connect(mix);
        const dryRing = ctx.createGain();
        dryRing.gain.value = 0.45;
        node.connect(dryRing);
        dryRing.connect(mix);
        node = mix;
      }
      this.out = ctx.createGain();
      this.out.gain.value = 0.9 * this.p.gain;
      this.f = [];
      const qs = [6, 9, 11], fg = [1, 0.7, 0.35];
      for (let i = 0; i < 3; i++) {
        const bp = filter('bandpass', VOWELS[0][i] * this.p.formant, qs[i]);
        const g = ctx.createGain();
        g.gain.value = fg[i] * 1.35;
        node.connect(bp);
        bp.connect(g);
        g.connect(this.out);
        this.f.push(bp);
      }
      const dry = filter('lowpass', 1800 * this.p.formant, 0.7);
      const dg = ctx.createGain();
      dg.gain.value = 0.2;
      node.connect(dry);
      dry.connect(dg);
      dg.connect(this.out);
      let tail = this.out;
      if (ctx.createStereoPanner) {
        const pn = ctx.createStereoPanner();
        pn.pan.value = pan || 0;
        this.out.connect(pn);
        tail = pn;
      }
      tail.connect(graph.vOut);
      const rs = ctx.createGain();
      rs.gain.value = this.p.rev != null ? this.p.rev : 0.22;
      tail.connect(rs);
      rs.connect(graph.vRev);
      this.active = new Set();
    }
    setVowel(v, t) {
      const fm = VOWELS[U.mod(v, VOWELS.length)];
      for (let i = 0; i < 3; i++) this.f[i].frequency.setTargetAtTime(fm[i] * this.p.formant, t, 0.012);
    }
    note(t, m, dur, vel, vowel, cons) {
      const ctx = A.ctx;
      const p = this.p;
      t = Math.max(t, ctx.currentTime);
      const f = mtof(m + 12 * p.oct);
      const end = t + Math.max(0.07, dur);
      this.setVowel(p.vowels ? p.vowels[U.mod(vowel || 0, p.vowels.length)] : vowel || 0, t);
      const g = ctx.createGain();
      const peak = 0.42 * (vel == null ? 1 : vel);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.014);
      g.gain.setTargetAtTime(peak * 0.72, t + 0.03, 0.1);
      g.gain.setTargetAtTime(0.0001, end, 0.03);
      const stopAt = end + 0.25;
      const o = osc(p.wave, f * 0.93, t, stopAt);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      o.connect(g);
      let o2 = null;
      if (p.wave2) {
        o2 = osc(p.wave2, f * 0.93, t, stopAt);
        o2.frequency.exponentialRampToValueAtTime(f, t + 0.05);
        o2.detune.value = p.detune || 9;
        const g2 = ctx.createGain();
        g2.gain.value = p.mix2 != null ? p.mix2 : 0.6;
        o2.connect(g2);
        g2.connect(g);
      }
      if (p.sub) {
        const s = osc('sine', f / 2, t, stopAt);
        const sg = ctx.createGain();
        sg.gain.value = p.sub;
        s.connect(sg);
        sg.connect(g);
      }
      if (p.vib > 0 && dur > 0.16) {
        const lfo = osc('sine', p.vibRate, t, stopAt);
        const lg = ctx.createGain();
        lg.gain.setValueAtTime(0, t);
        lg.gain.linearRampToValueAtTime(f * p.vib * 0.03, t + Math.min(0.28, dur * 0.7));
        lfo.connect(lg);
        lg.connect(o.frequency);
        if (o2) lg.connect(o2.frequency);
      }
      g.connect(this.in);
      const c = cons == null ? 1 : cons;
      if (c && p.cons) {
        const kind = p.cons;
        const len = kind === 's' ? 0.05 : kind === 'r' ? 0.04 : 0.016;
        const n = noiseSrc(t, t + len + 0.02);
        const nf = filter(kind === 's' || kind === 't' ? 'highpass' : 'bandpass', kind === 'b' ? 600 : kind === 'd' ? 1600 : kind === 'r' ? 300 : kind === 's' ? 5000 : 3200, 1.2);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.32 * peak, t + 0.003);
        ng.gain.exponentialRampToValueAtTime(0.0005, t + len);
        n.connect(nf);
        nf.connect(ng);
        ng.connect(this.out);
      }
      const h = {
        g,
        end,
        stop: (at) => {
          at = Math.max(at || 0, ctx.currentTime);
          if (at >= h.end) return;
          h.end = at;
          try {
            if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(at);
            else {
              g.gain.cancelScheduledValues(at);
              g.gain.setValueAtTime(g.gain.value, at);
            }
            g.gain.setTargetAtTime(0.0001, at, 0.02);
          } catch {
            /* node already finished */
          }
        },
      };
      this.active.add(h);
      setTimeout(() => this.active.delete(h), (stopAt - ctx.currentTime) * 1000 + 50);
      return h;
    }
    stopAll(at) {
      for (const h of this.active) h.stop(at);
    }
  }
  A.VoiceChannel = VoiceChannel;

  // A song graph: everything a song plays goes through here so it can be killed at once.
  A.createGraph = function (voicePresets) {
    const ctx = A.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.85;
    out.connect(A.musicBus);
    const rev = ctx.createGain();
    rev.connect(A.musicRevIn);
    const dist = ctx.createWaveShaper();
    dist.curve = A.curves.dist;
    dist.oversample = '2x';
    const distLp = filter('lowpass', 4200, 0.7);
    const distG = ctx.createGain();
    distG.gain.value = 0.4;
    dist.connect(distLp);
    distLp.connect(distG);
    distG.connect(out);
    const crush = ctx.createWaveShaper();
    crush.curve = A.curves.crush;
    const crushG = ctx.createGain();
    crushG.gain.value = 0.9;
    crush.connect(crushG);
    crushG.connect(out);
    const vOut = ctx.createGain();
    vOut.connect(A.voiceBus);
    const vRev = ctx.createGain();
    vRev.connect(A.voiceRevIn);
    const g = { out, rev, dist, crush, vOut, vRev, voices: {}, alive: true };
    g.dst = { out, rev, dist, crush };
    const pans = { opp: -0.25, bf: 0.25, gf: 0 };
    for (const k in voicePresets) if (voicePresets[k]) g.voices[k] = new VoiceChannel(g, voicePresets[k], pans[k] || 0);
    g.kill = (fade) => {
      if (!g.alive) return;
      g.alive = false;
      const t = ctx.currentTime;
      const tc = Math.max(0.005, (fade || 0.03) / 3);
      out.gain.setTargetAtTime(0, t, tc);
      vOut.gain.setTargetAtTime(0, t, tc);
      rev.gain.setTargetAtTime(0, t, tc);
      vRev.gain.setTargetAtTime(0, t, tc);
      setTimeout(() => {
        for (const n of [out, rev, vOut, vRev, distG, crushG]) n.disconnect();
        for (const k in g.voices) if (g.voices[k].ringOsc) g.voices[k].ringOsc.stop();
      }, (fade || 0.03) * 1000 + 400);
    };
    return g;
  };

  A.fx = function (t, name, dst) {
    const ctx = A.ctx;
    if (name === 'riser') {
      const n = noiseSrc(t, t + 2.1);
      const bp = filter('bandpass', 400, 2);
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(6000, t + 2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 1.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.05);
      n.connect(bp);
      bp.connect(g);
      g.connect(dst.out);
    } else if (name === 'boom') {
      const o = osc('sine', 90, t, t + 1.6);
      o.frequency.exponentialRampToValueAtTime(30, t + 1.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.8, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      o.connect(g);
      g.connect(dst.out);
      send(g, dst, 0.4);
    } else if (name === 'static') {
      const n = noiseSrc(t, t + 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      n.connect(g);
      g.connect(dst.crush || dst.out);
    } else if (name === 'tapestop') {
      const o = osc('sawtooth', 220, t, t + 0.5);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.45);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
      const lp = filter('lowpass', 1200, 1);
      o.connect(lp);
      lp.connect(g);
      g.connect(dst.out);
    } else if (name === 'hey') {
      // A shouted "¡hey!" as a quick formant sweep.
      const o = osc('sawtooth', 330, t, t + 0.3);
      o.frequency.exponentialRampToValueAtTime(420, t + 0.12);
      const f1 = filter('bandpass', 600, 5), f2 = filter('bandpass', 1900, 8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      o.connect(f1);
      o.connect(f2);
      f1.connect(g);
      f2.connect(g);
      g.connect(dst.out);
      send(g, dst, 0.3);
    }
  };

  // Dispatch one sequencer event at ctx time `when`.
  function playEvent(e, when, graph) {
    const dst = graph.dst;
    switch (e.k) {
      case 'kick': return D.kick(when, e.v, dst, e.p);
      case 'snare': return D.snare(when, e.v, dst, e.p);
      case 'clap': return D.clap(when, e.v, dst);
      case 'hat': return D.hat(when, e.v, dst, false);
      case 'ohat': return D.hat(when, e.v, dst, true);
      case 'crash': return D.crash(when, e.v, dst);
      case 'ride': return D.ride(when, e.v, dst);
      case 'tom': return D.tom(when, e.v, dst, e.f);
      case 'perc': return D.perc(when, e.v, dst, e.p);
      case 'bass': return A.bass(when, e.m, e.d, e.v, dst, e.p);
      case 'pad': return A.pad(when, e.ms, e.d, e.v, dst, e.p);
      case 'lead': return A.lead(when, e.m, e.d, e.v, dst, e.p);
      case 'fx': return A.fx(when, e.n, dst);
      case 'voice': {
        const ch = graph.voices[e.ch];
        if (ch) ch.note(when, e.m, e.d, e.v, e.vw, e.c);
        return;
      }
    }
  }

  function lowerBound(ev, t) {
    let lo = 0, hi = ev.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ev[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // Lookahead scheduler ("a tale of two clocks"): events are sorted, times in seconds.
  class Sequencer {
    constructor(events, graph, loop) {
      this.ev = events;
      this.g = graph;
      this.loop = loop || null; // {from, to}
      this.i = 0;
      this.base = 0;
      this.running = false;
    }
    play(ctxStart, fromSec) {
      const from = fromSec || 0;
      this.base = ctxStart - from;
      this.i = lowerBound(this.ev, from);
      this.running = true;
      A.seqs.add(this);
      this.tick();
    }
    // Song time (seconds) for a ctx time.
    pos(ctxT) {
      return ctxT - this.base;
    }
    tick() {
      if (!this.running || !this.g.alive) return;
      const now = A.ctx.currentTime, until = now + 0.22;
      let guard = 0;
      while (guard++ < 4000) {
        if (this.loop && (this.i >= this.ev.length || this.ev[this.i].t >= this.loop.to)) {
          this.base += this.loop.to - this.loop.from;
          this.i = lowerBound(this.ev, this.loop.from);
          if (this.base + this.loop.from > until) break;
          continue;
        }
        if (this.i >= this.ev.length) {
          this.running = false;
          break;
        }
        const e = this.ev[this.i];
        const when = this.base + e.t;
        if (when > until) break;
        // Skip anything we're badly late for (tab hiccup) except long sounds.
        if (when >= now - 0.06 || (e.d && e.d > 0.5)) playEvent(e, Math.max(when, now), this.g);
        this.i++;
      }
    }
    stop() {
      this.running = false;
      A.seqs.delete(this);
    }
  }
  A.Sequencer = Sequencer;
  A.seqs = new Set();
  // Called from the frame loop and a timer, so music keeps flowing even when frames stall.
  A.tick = function () {
    if (!A.ready) return;
    for (const s of A.seqs) {
      if (!s.running || !s.g.alive) A.seqs.delete(s);
      else s.tick();
    }
  };

  // ---------- looping background music (menus, pause, game over, dialogue) ----------
  A.loops = {};
  A.playLoop = function (name, theme, vol, fadeIn) {
    if (!A.ready) return null;
    const cur = A.loops[name];
    if (cur && cur.theme === theme && cur.graph.alive) return cur;
    A.stopLoop(name);
    const g = A.createGraph(theme.voices || {});
    const target = vol == null ? 1 : vol;
    if (fadeIn) {
      g.out.gain.setValueAtTime(0.0001, A.ctx.currentTime);
      g.out.gain.setTargetAtTime(target, A.ctx.currentTime, fadeIn / 3);
    } else g.out.gain.value = target;
    const seq = new Sequencer(theme.events, g, { from: theme.loopFrom || 0, to: theme.loopTo });
    const start = A.ctx.currentTime + 0.08;
    seq.play(start, theme.loopFrom || 0);
    const L = { name, theme, graph: g, seq, start, bpm: theme.bpm };
    A.loops[name] = L;
    return L;
  };
  A.stopLoop = function (name, fade) {
    const L = A.loops[name];
    if (!L) return;
    L.seq.stop();
    L.graph.kill(fade || 0.05);
    delete A.loops[name];
  };
  A.stopAllLoops = function (fade) {
    for (const k of Object.keys(A.loops)) A.stopLoop(k, fade);
  };
  // Beat position of a running loop (used by menus to dance in time).
  A.loopBeat = function (name) {
    const L = A.loops[name];
    if (!L || !A.ctx) return null;
    const t = A.time() - A.latency() - L.start;
    return (t * L.bpm) / 60;
  };

  // ---------- UI / gameplay sound effects ----------
  function sfxOut() {
    return { out: A.sfxBus, rev: A.sfxRevIn };
  }
  function blip(t, f, dur, type, vol, dst, slideTo) {
    const ctx = A.ctx;
    const o = osc(type || 'square', f, t, t + dur + 0.05);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g);
    g.connect(dst.out);
    return g;
  }
  A.sfx = function (name, opt, when) {
    if (!A.ready) return;
    const ctx = A.ctx;
    const t = Math.max(ctx.currentTime + 0.005, when || 0);
    const dst = sfxOut();
    switch (name) {
      case 'scroll':
        blip(t, 1046, 0.05, 'square', 0.09, dst, 1318);
        break;
      case 'select':
        blip(t, 784, 0.06, 'triangle', 0.2, dst, 1046);
        break;
      case 'confirm': {
        [72, 76, 79, 84, 88].forEach((m, i) => {
          const g = blip(t + i * 0.035, mtof(m), 0.32, 'square', 0.07, dst);
          send(g, dst, 0.4);
          blip(t + i * 0.035, mtof(m + 12), 0.25, 'triangle', 0.06, dst);
        });
        const n = noiseSrc(t, t + 0.5);
        const hp = filter('highpass', 6000);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.1, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        n.connect(hp);
        hp.connect(ng);
        ng.connect(dst.out);
        break;
      }
      case 'cancel':
        blip(t, 520, 0.07, 'square', 0.08, dst, 380);
        blip(t + 0.07, 380, 0.09, 'square', 0.07, dst, 260);
        break;
      case 'miss': {
        const v = Math.floor(Math.random() * 3);
        const f = [150, 132, 118][v];
        blip(t, f, 0.16, 'square', 0.1, dst, f * 0.55);
        const n = noiseSrc(t, t + 0.12);
        const lp = filter('lowpass', 900, 2);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.18, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        n.connect(lp);
        lp.connect(ng);
        ng.connect(dst.out);
        break;
      }
      case 'hit':
        blip(t, 1760, 0.03, 'triangle', 0.16, dst, 1400);
        break;
      case 'hurt': {
        const n = noiseSrc(t, t + 0.4);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        const ws = ctx.createWaveShaper();
        ws.curve = A.curves.crush;
        n.connect(ws);
        ws.connect(g);
        g.connect(dst.out);
        blip(t, 90, 0.3, 'sawtooth', 0.2, dst, 40);
        break;
      }
      case 'count': {
        const i = opt || 0; // 0..2
        const g = blip(t, mtof([67, 71, 74][i] || 67), 0.18, 'square', 0.1, dst);
        send(g, dst, 0.3);
        blip(t, mtof(([67, 71, 74][i] || 67) - 12), 0.14, 'triangle', 0.12, dst);
        break;
      }
      case 'go': {
        [67, 71, 74, 79].forEach((m) => {
          const g = blip(t, mtof(m), 0.5, 'square', 0.06, dst);
          send(g, dst, 0.4);
        });
        const n = noiseSrc(t, t + 0.4);
        const bp = filter('bandpass', 2000, 1);
        bp.frequency.exponentialRampToValueAtTime(8000, t + 0.3);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.12, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        n.connect(bp);
        bp.connect(ng);
        ng.connect(dst.out);
        break;
      }
      case 'death': {
        const g = blip(t, 330, 1.1, 'sawtooth', 0.16, dst, 45);
        send(g, dst, 0.5);
        D.kick(t, 1, { out: A.sfxBus }, '808');
        const n = noiseSrc(t, t + 1);
        const lp = filter('lowpass', 2000, 1);
        lp.frequency.exponentialRampToValueAtTime(100, t + 0.9);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.25, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        n.connect(lp);
        lp.connect(ng);
        ng.connect(dst.out);
        break;
      }
      case 'retry': {
        [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => {
          const g = blip(t + i * 0.06, mtof(m), 0.6, 'square', 0.05, dst);
          send(g, dst, 0.5);
        });
        A.pad(t + 0.3, [60, 64, 67, 72], 1.4, 1.6, dst, 'warm');
        break;
      }
      case 'unlock': {
        [72, 76, 79, 84].forEach((m, i) => {
          const g = blip(t + i * 0.11, mtof(m), 0.4, 'square', 0.07, dst);
          send(g, dst, 0.4);
        });
        A.lead(t + 0.44, 88, 0.8, 1.2, dst, 'bell');
        break;
      }
      case 'blip': {
        const f = (opt && opt.f) || 600;
        blip(t, f * (0.94 + Math.random() * 0.12), 0.045, (opt && opt.wave) || 'square', 0.05, dst);
        break;
      }
      case 'pause':
        blip(t, 660, 0.08, 'triangle', 0.15, dst, 440);
        break;
      case 'scratch':
        D.perc(t, 1, dst, 'scratch');
        break;
    }
  };
})();
