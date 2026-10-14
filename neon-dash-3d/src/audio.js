// Neon Dash 3D — procedural music sequencer and sound effects (Web Audio, no samples).
(function (root) {
'use strict';

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11], major: [0, 2, 4, 5, 7, 9, 11],
};
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

const A = {
  ctx: null, musicVol: 0.7, sfxVol: 0.8, song: null, timer: 0,
  start: 0, step: 0, nextTime: 0, stepDur: 0.1, practice: false,
};

function rng(seed) {
  let a = seed * 9301 + 49297;
  return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
}

A.unlock = function () {
  if (!A.ctx) {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    const ctx = A.ctx = new AC();
    A.out = ctx.createDynamicsCompressor();
    A.out.threshold.value = -14; A.out.ratio.value = 4; A.out.attack.value = 0.004; A.out.release.value = 0.2;
    A.out.connect(ctx.destination);
    A.music = ctx.createGain(); A.music.gain.value = A.musicVol * 0.55;
    A.musicLP = ctx.createBiquadFilter(); A.musicLP.type = 'lowpass'; A.musicLP.frequency.value = 20000;
    A.music.connect(A.musicLP); A.musicLP.connect(A.out);
    A.sfx = ctx.createGain(); A.sfx.gain.value = A.sfxVol * 0.8; A.sfx.connect(A.out);
    // shared noise + reverb + delay
    const nb = A.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    A.verb = ctx.createConvolver(); A.verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = 0.35; A.verb.connect(vg); vg.connect(A.music);
    A.delay = ctx.createDelay(1); const fb = ctx.createGain(), dl = ctx.createBiquadFilter();
    fb.gain.value = 0.32; dl.type = 'lowpass'; dl.frequency.value = 2400;
    A.delay.connect(dl); dl.connect(fb); fb.connect(A.delay); dl.connect(A.music);
  }
  if (A.ctx.state === 'suspended') A.ctx.resume();
};

A.setVolumes = function (m, s) {
  A.musicVol = m; A.sfxVol = s;
  if (!A.ctx) return;
  A.music.gain.setTargetAtTime(m * 0.55, A.ctx.currentTime, 0.05);
  A.sfx.gain.setTargetAtTime(s * 0.8, A.ctx.currentTime, 0.05);
};

// ---------------------------------------------------------------- song generation
function makeSong(def) {
  const r = rng(def.seed + 7), scale = SCALES[def.scale] || SCALES.minor;
  const melody = [];
  for (let ph = 0; ph < 2; ph++) {
    const notes = [];
    let deg = 4 + Math.floor(r() * 3);
    for (let i = 0; i < 32; i++) {
      const strong = i % 4 === 0, p = strong ? 0.85 : (i % 2 === 0 ? 0.55 : 0.3);
      if (r() < p) {
        deg += Math.floor(r() * 5) - 2;
        if (deg < 0) deg = 2; if (deg > 11) deg = 9;
        notes.push({ deg, len: r() < 0.3 ? 2 : 1 });
      } else notes.push(null);
    }
    melody.push(notes);
  }
  const bassPat = [
    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
    [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  ][def.seed % 3];
  const arpDir = r() < 0.5 ? [0, 1, 2, 1] : [0, 2, 1, 2];
  return Object.assign({}, def, { scale, melody, bassPat, arpDir, menu: !!def.menu });
}

function note(song, deg, oct) {
  const s = song.scale, n = s.length;
  const o = Math.floor(deg / n), d = ((deg % n) + n) % n;
  return song.root + s[d] + 12 * (o + oct);
}

// ---------------------------------------------------------------- instruments
function env(g, t, a, peak, dec, sus = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + dec);
}
function osc(type, f, t, dur, dest) {
  const o = A.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o;
}
function gainTo(dest, v = 1) { const g = A.ctx.createGain(); g.gain.value = v; g.connect(dest); return g; }
function noise(t, dur, dest) {
  const s = A.ctx.createBufferSource(); s.buffer = A.noise; s.connect(dest);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); return s;
}
function filt(type, f, q, dest) {
  const b = A.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 0.7;
  b.connect(dest); return b;
}

function kick(t, v = 1) {
  const g = gainTo(A.music); env(g, t, 0.002, 0.9 * v, 0.32);
  const o = osc('sine', 150, t, 0.35, g); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
}
function snare(t, v = 1) {
  const g = gainTo(A.music); env(g, t, 0.002, 0.42 * v, 0.17);
  noise(t, 0.2, filt('bandpass', 1900, 0.8, g));
  const g2 = gainTo(A.music); env(g2, t, 0.002, 0.25 * v, 0.08);
  osc('triangle', 200, t, 0.1, g2);
  const s = gainTo(A.verb); env(s, t, 0.002, 0.2 * v, 0.1); noise(t, 0.12, s);
}
function hat(t, open, v = 1) {
  const g = gainTo(A.music); env(g, t, 0.001, (open ? 0.12 : 0.09) * v, open ? 0.2 : 0.04);
  noise(t, open ? 0.25 : 0.06, filt('highpass', 7500, 0.7, g));
}
function bass(t, m, dur) {
  const g = gainTo(A.music); env(g, t, 0.005, 0.3, dur * 0.9, 0.05);
  const f = filt('lowpass', 300, 6, g);
  f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(1300, t + 0.02);
  f.frequency.exponentialRampToValueAtTime(260, t + dur);
  osc('sawtooth', mtof(m), t, dur, f); osc('square', mtof(m - 12), t, dur, gainTo(f, 0.5));
}
function lead(t, m, dur, v = 1, soft = false) {
  const g = gainTo(A.music); env(g, t, 0.004, 0.13 * v, dur * 0.85, 0.02);
  const f = filt('lowpass', soft ? 1800 : 3600, 1, g);
  osc(soft ? 'triangle' : 'square', mtof(m), t, dur, f);
  const o2 = osc('sawtooth', mtof(m), t, dur, gainTo(f, 0.6)); o2.detune.value = 9;
  const s = gainTo(A.delay, 0.45); g.connect(s);
}
function arp(t, m, v = 1) {
  const g = gainTo(A.music); env(g, t, 0.002, 0.07 * v, 0.11);
  osc('square', mtof(m), t, 0.13, filt('lowpass', 4200, 1, g));
}
function pad(t, notes, dur) {
  const g = gainTo(A.music, 1); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.25); g.gain.setValueAtTime(0.05, t + dur - 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const f = filt('lowpass', 1400, 0.5, g); g.connect(A.verb);
  for (const m of notes) {
    const a = osc('sawtooth', mtof(m), t, dur, f); a.detune.value = -7;
    const b = osc('sawtooth', mtof(m), t, dur, f); b.detune.value = 7;
  }
}

function scheduleStep(song, i, t) {
  const bar = Math.floor(i / 16), s = i % 16, sd = A.stepDur;
  const chordDeg = song.prog[bar % song.prog.length];
  const intro = bar < 2, section = Math.floor((bar - 2) / 8) % 2, fill = (bar % 8 === 7) && s >= 12;
  if (song.menu) {
    if (s === 0) pad(t, [note(song, chordDeg, 0), note(song, chordDeg + 2, 0), note(song, chordDeg + 4, 0)], sd * 16);
    if (s % 2 === 0) arp(t, note(song, chordDeg + song.arpDir[(s / 2) % 4] * 2, 1), 0.6);
    if (s % 8 === 0) bass(t, note(song, chordDeg, -1), sd * 6);
    if (s % 4 === 2) hat(t, false, 0.4);
    return;
  }
  // drums
  if (s % 4 === 0 && !(fill && s > 12)) kick(t, s === 0 ? 1 : 0.85);
  if (!intro) {
    if (s === 4 || s === 12) snare(t);
    if (fill && s % 1 === 0) snare(t, 0.35 + (s - 12) * 0.12);
    if (s % 2 === 0) hat(t, s % 4 === 2 && section === 1);
    else if (song.bpm >= 150) hat(t, false, 0.45);
  } else if (s % 4 === 2) hat(t, false, 0.5);
  // harmony
  if (s === 0) pad(t, [note(song, chordDeg, 0), note(song, chordDeg + 2, 0), note(song, chordDeg + 4, 0)], sd * 16);
  if (!intro && song.bassPat[s]) bass(t, note(song, chordDeg, -1) + (s % 8 === 6 ? 12 : 0), sd * 1.8);
  // lead: arpeggio in intro/section A, melody in section B
  if (intro || section === 0) {
    const k = song.arpDir[s % 4];
    arp(t, note(song, chordDeg + k * 2, 1) + (s >= 8 && !intro ? 12 : 0), intro ? 0.6 : 1);
  }
  if (!intro) {
    const mel = song.melody[section][(bar % 2) * 16 + s];
    if (mel) lead(t, note(song, chordDeg + mel.deg, 0) + 12, sd * mel.len * 1.6, section ? 1 : 0.6, !section);
  }
}

A.play = function (def, offset = 0) {
  A.unlock();
  if (!A.ctx) return;
  A.stop();
  const song = A.song = makeSong(def);
  A.stepDur = 60 / song.bpm / 4;
  const now = A.ctx.currentTime + 0.06;
  A.step = Math.max(0, Math.floor(offset / A.stepDur));
  A.start = now - offset;
  A.nextTime = A.start + A.step * A.stepDur;
  if (A.nextTime < now) { A.step++; A.nextTime += A.stepDur; }
  A.music.gain.cancelScheduledValues(A.ctx.currentTime);
  A.music.gain.setValueAtTime(A.musicVol * 0.55, A.ctx.currentTime);
  const tick = () => {
    if (!A.song) return;
    while (A.nextTime < A.ctx.currentTime + 0.14) {
      scheduleStep(A.song, A.step, A.nextTime);
      A.step++; A.nextTime += A.stepDur;
    }
  };
  tick();
  A.timer = setInterval(tick, 25);
};

A.stop = function (fade = 0) {
  clearInterval(A.timer); A.timer = 0;
  if (A.ctx && A.song && fade > 0) {
    const t = A.ctx.currentTime;
    A.music.gain.cancelScheduledValues(t);
    A.music.gain.setValueAtTime(A.music.gain.value, t);
    A.music.gain.linearRampToValueAtTime(0, t + fade);
  }
  A.song = null;
};

A.setPractice = function (on) {
  A.practice = on;
  if (A.ctx) A.musicLP.frequency.setTargetAtTime(on ? 900 : 20000, A.ctx.currentTime, 0.1);
};

// beat position for visuals (float, beats since song start)
A.beat = function () {
  if (!A.ctx || !A.song) return performance.now() / 500;
  return (A.ctx.currentTime - A.start) / (A.stepDur * 4);
};

// ---------------------------------------------------------------- sound effects
A.fx = function (name) {
  if (!A.ctx || A.sfxVol <= 0) return;
  const t = A.ctx.currentTime + 0.005, out = A.sfx;
  switch (name) {
    case 'die': {
      const g = gainTo(out); env(g, t, 0.003, 0.9, 0.55);
      const f = filt('lowpass', 3000, 1, g); f.frequency.exponentialRampToValueAtTime(120, t + 0.5);
      noise(t, 0.6, f);
      const g2 = gainTo(out); env(g2, t, 0.002, 0.7, 0.3);
      const o = osc('sine', 120, t, 0.35, g2); o.frequency.exponentialRampToValueAtTime(30, t + 0.3);
      break;
    }
    case 'coin': {
      [1318.5, 1975.5].forEach((f, i) => {
        const g = gainTo(out); env(g, t + i * 0.07, 0.002, 0.25, 0.3);
        osc('square', f, t + i * 0.07, 0.35, filt('lowpass', 5000, 1, g));
      });
      break;
    }
    case 'orb': case 'pad': {
      const g = gainTo(out); env(g, t, 0.003, name === 'pad' ? 0.22 : 0.16, 0.18);
      const o = osc('triangle', name === 'pad' ? 300 : 520, t, 0.2, g);
      o.frequency.exponentialRampToValueAtTime(name === 'pad' ? 900 : 1100, t + 0.15);
      break;
    }
    case 'portal': {
      const g = gainTo(out); env(g, t, 0.01, 0.12, 0.4);
      const f = filt('bandpass', 600, 4, g); f.frequency.exponentialRampToValueAtTime(4000, t + 0.35);
      noise(t, 0.45, f);
      break;
    }
    case 'click': {
      const g = gainTo(out); env(g, t, 0.001, 0.2, 0.06);
      osc('square', 880, t, 0.07, filt('lowpass', 3000, 1, g));
      break;
    }
    case 'checkpoint': {
      const g = gainTo(out); env(g, t, 0.002, 0.18, 0.25);
      osc('sine', 1046.5, t, 0.3, g);
      break;
    }
    case 'win': {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        const g = gainTo(out); env(g, t + i * 0.09, 0.003, 0.2, 0.5);
        osc('square', f, t + i * 0.09, 0.6, filt('lowpass', 4000, 1, g));
      });
      break;
    }
  }
};

root.NeonAudio = A;
})(typeof window !== 'undefined' ? window : globalThis);
