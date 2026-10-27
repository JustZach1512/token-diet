// Fully synthesized sound: ambience, heartbeat, chase music and SFX.
// Everything is generated with WebAudio nodes; there are no audio files.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lx = 0; this.lz = 0; this.lyaw = 0;
    this.chaseLevel = 0;
    this.nextBeat = 0;
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.55; this.amb.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.0; this.music.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this.dist = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 4); }
    this.dist.curve = curve;
    this._chaseTimer = setInterval(() => this._scheduleChase(), 90);
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.now, 0.05);
  }

  suspend() { this.ctx?.suspend?.(); }
  resume() { this.ctx?.resume?.(); }

  setListener(x, z, yaw) { this.lx = x; this.lz = z; this.lyaw = yaw; }

  // Volume and stereo pan for a world position relative to the listener.
  _spatial(x, z, range = 40) {
    if (x === undefined) return { g: 1, pan: 0 };
    const dx = x - this.lx, dz = z - this.lz;
    const d = Math.hypot(dx, dz);
    const g = Math.max(0, 1 - d / range) ** 1.6;
    // right vector for yaw: (-cos, sin)
    const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * -Math.cos(this.lyaw) + dz * Math.sin(this.lyaw)) / d)) : 0;
    return { g, pan: pan * 0.8 };
  }

  _out(x, z, range, vol, bus) {
    const ctx = this.ctx;
    const { g, pan } = this._spatial(x, z, range);
    if (g * vol < 0.004) return null;
    const gain = ctx.createGain();
    gain.gain.value = g * vol;
    let node = gain;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      gain.connect(p);
      p.connect(bus || this.sfx);
    } else gain.connect(bus || this.sfx);
    return node;
  }

  _noiseSrc(brown = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this.brown : this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  }

  _env(param, t, peak, attack, decay, sustain = 0, release = 0) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + attack);
    if (release > 0) {
      param.setTargetAtTime(sustain, t + attack, decay / 3);
      param.setTargetAtTime(0.0001, t + attack + decay, release / 4);
    } else {
      param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }
  }

  _tone(dest, t, type, f0, f1, dur, vol, attack = 0.005) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    this._env(g.gain, t, vol, attack, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  _burst(dest, t, dur, type, freq, q, vol, attack = 0.002, sweepTo = null, brown = false) {
    const s = this._noiseSrc(brown);
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain();
    this._env(g.gain, t, vol, attack, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random());
    s.stop(t + attack + dur + 0.05);
  }

  // ---------- ambience ----------
  startAmbient(nightmare = false) {
    if (!this.ctx) return;
    this.stopAmbient();
    const ctx = this.ctx, t = ctx.currentTime;
    const nodes = [];
    const wind = this._noiseSrc(true);
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoG = ctx.createGain(); lfoG.gain.value = 220;
    lfo.connect(lfoG).connect(wf.frequency);
    const wg = ctx.createGain(); wg.gain.value = 0;
    wg.gain.linearRampToValueAtTime(0.5, t + 3);
    wind.connect(wf).connect(wg).connect(this.amb);
    wind.start(); lfo.start();
    nodes.push(wind, lfo);

    const droneG = ctx.createGain(); droneG.gain.value = 0;
    droneG.gain.linearRampToValueAtTime(nightmare ? 0.16 : 0.1, t + 4);
    const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = nightmare ? 260 : 170;
    df.connect(droneG).connect(this.amb);
    const base = nightmare ? 49 : 55;
    for (const f of [base, base * 1.007, base * 1.5 * (nightmare ? 1.06 : 1)]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = 0.33;
      o.connect(og).connect(df); o.start(); nodes.push(o);
    }
    this._amb = { nodes, nightmare };
    this._ambEvents = setInterval(() => this._ambientEvent(), 4200);
  }

  stopAmbient() {
    if (this._amb) {
      for (const n of this._amb.nodes) { try { n.stop(); } catch (e) { /* already stopped */ } }
      this._amb = null;
    }
    clearInterval(this._ambEvents);
  }

  _ambientEvent() {
    if (!this.ctx || Math.random() < 0.45) return;
    const t = this.ctx.currentTime;
    const ang = Math.random() * Math.PI * 2;
    const x = this.lx + Math.sin(ang) * 25, z = this.lz + Math.cos(ang) * 25;
    const out = this._out(x, z, 60, 0.35, this.amb);
    if (!out) return;
    const r = Math.random();
    if (r < 0.4) {
      // crow
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
        const tt = t + i * 0.32;
        const o = this.ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(820, tt); o.frequency.exponentialRampToValueAtTime(430, tt + 0.22);
        const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 3;
        const g = this.ctx.createGain(); this._env(g.gain, tt, 0.5, 0.01, 0.22);
        o.connect(f).connect(g).connect(out); o.start(tt); o.stop(tt + 0.3);
      }
    } else if (r < 0.7) {
      // wood creak
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(110, t + 0.9);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 8;
      const g = this.ctx.createGain(); this._env(g.gain, t, 0.35, 0.2, 0.9);
      o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 1.3);
    } else if (this._amb?.nightmare || r > 0.9) {
      // distant bell
      for (const [f, v] of [[196, 0.4], [392 * 1.01, 0.18], [588, 0.1], [930, 0.06]]) this._tone(out, t, 'sine', f, f, 3.5, v, 0.01);
    } else {
      // whisper
      this._burst(out, t, 1.4, 'bandpass', 2400, 6, 0.18, 0.4, 3400);
    }
  }

  // ---------- heartbeat / chase ----------
  heartbeat(intensity, dt) {
    if (!this.ctx || intensity <= 0.01) { this.nextBeat = 0; return; }
    this.nextBeat -= dt;
    if (this.nextBeat > 0) return;
    const interval = 1.15 - intensity * 0.72;
    this.nextBeat = interval;
    const t = this.ctx.currentTime;
    const v = 0.25 + intensity * 0.75;
    this._tone(this.sfx, t, 'sine', 62, 36, 0.16, v * 0.9);
    this._tone(this.sfx, t + interval * 0.28, 'sine', 56, 34, 0.14, v * 0.6);
  }

  setChase(level) { this.chaseLevel = level; }

  _scheduleChase() {
    if (!this.ctx) return;
    const target = this.chaseLevel;
    this.music.gain.setTargetAtTime(target * 0.55, this.ctx.currentTime, 0.6);
    if (target < 0.02) { this._beatT = 0; return; }
    const ctx = this.ctx;
    if (!this._beatT || this._beatT < ctx.currentTime) this._beatT = ctx.currentTime + 0.05;
    const step = 0.2;
    while (this._beatT < ctx.currentTime + 0.25) {
      const t = this._beatT;
      this._step = ((this._step || 0) + 1) % 16;
      const s = this._step;
      const notes = [73.4, 73.4, 77.8, 73.4, 73.4, 69.3, 73.4, 82.4];
      const f = notes[s % 8];
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(150, t + 0.18);
      const g = ctx.createGain(); this._env(g.gain, t, 0.5, 0.005, 0.19);
      o.connect(lp).connect(g).connect(this.music); o.start(t); o.stop(t + 0.25);
      if (s % 4 === 0) this._tone(this.music, t, 'sine', 90, 40, 0.25, 0.9);
      if (s % 8 === 4) this._burst(this.music, t, 0.12, 'highpass', 3000, 1, 0.25);
      if (s === 0) {
        for (const ff of [587, 622, 880]) {
          const so = ctx.createOscillator(); so.type = 'sawtooth'; so.frequency.value = ff;
          const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 2200;
          const sg = ctx.createGain(); this._env(sg.gain, t, 0.05, 0.6, 2.6);
          so.connect(sf).connect(sg).connect(this.music); so.start(t); so.stop(t + 3.4);
        }
      }
      this._beatT += step;
    }
  }

  // ---------- SFX ----------
  play(name, x, z, vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const range = { step: 14, kstep: 24, gen: 80, gate: 120, scream: 70, explode: 90 }[name] || 50;
    const out = this._out(x, z, range, vol);
    if (!out) return;
    switch (name) {
      case 'step':
        this._burst(out, t, 0.06, 'bandpass', 700 + Math.random() * 500, 1.2, 0.25);
        break;
      case 'kstep':
        this._tone(out, t, 'sine', 70, 40, 0.12, 0.6);
        this._burst(out, t, 0.08, 'lowpass', 500, 1, 0.4);
        break;
      case 'hit':
        this._burst(out, t, 0.25, 'bandpass', 1400, 0.8, 1.0, 0.001, 300);
        this._tone(out, t, 'sine', 120, 45, 0.25, 1.0);
        break;
      case 'swing':
        this._burst(out, t, 0.22, 'bandpass', 600, 2, 0.6, 0.02, 2500);
        break;
      case 'scream':
      case 'screamF': {
        const base = name === 'screamF' ? 620 : 430;
        const o = this.ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(base, t);
        o.frequency.linearRampToValueAtTime(base * 1.5, t + 0.12);
        o.frequency.linearRampToValueAtTime(base * 1.15, t + 0.9);
        const vib = this.ctx.createOscillator(); vib.frequency.value = 7;
        const vg = this.ctx.createGain(); vg.gain.value = base * 0.04;
        vib.connect(vg).connect(o.frequency);
        const g = this.ctx.createGain(); this._env(g.gain, t, 0.5, 0.03, 0.9, 0.3, 0.5);
        const f1 = this.ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 950; f1.Q.value = 4;
        const f2 = this.ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2500; f2.Q.value = 6;
        o.connect(f1).connect(g); o.connect(f2).connect(g);
        g.connect(out);
        o.start(t); vib.start(t); o.stop(t + 1.5); vib.stop(t + 1.5);
        this._burst(out, t, 0.9, 'bandpass', 1800, 1.5, 0.15, 0.02);
        break;
      }
      case 'groan':
        this._tone(out, t, 'triangle', 180, 140, 0.5, 0.3, 0.08);
        break;
      case 'pallet':
        this._tone(out, t, 'sine', 90, 40, 0.3, 1.0);
        this._burst(out, t, 0.18, 'lowpass', 700, 1, 1.0);
        this._burst(out, t + 0.02, 0.07, 'bandpass', 2400, 2, 0.6);
        break;
      case 'break':
        for (let i = 0; i < 4; i++) this._burst(out, t + i * 0.07, 0.09, 'bandpass', 1200 + Math.random() * 1500, 2, 0.8);
        this._tone(out, t, 'sine', 80, 40, 0.3, 0.8);
        break;
      case 'stun':
        this._tone(out, t, 'square', 220, 110, 0.4, 0.25);
        this._burst(out, t, 0.3, 'lowpass', 900, 1, 0.6);
        break;
      case 'skillWarn':
        this._tone(out, t, 'sine', 1500, 1500, 0.09, 0.4);
        break;
      case 'great':
        this._tone(out, t, 'sine', 1800, 1800, 0.25, 0.4);
        this._tone(out, t, 'sine', 2700, 2700, 0.35, 0.25);
        break;
      case 'good':
        this._tone(out, t, 'sine', 1200, 1200, 0.12, 0.3);
        break;
      case 'explode':
        this._burst(out, t, 0.7, 'lowpass', 4000, 0.7, 1.2, 0.001, 150);
        this._tone(out, t, 'sine', 70, 30, 0.6, 1.0);
        for (let i = 0; i < 6; i++) this._burst(out, t + 0.05 + Math.random() * 0.4, 0.03, 'highpass', 3000, 1, 0.4);
        break;
      case 'genDone':
        for (const [f, v] of [[110, 0.6], [164.8, 0.4], [220, 0.35], [329.6, 0.2]]) this._tone(out, t, 'sine', f, f, 3.2, v, 0.02);
        for (const [f, v] of [[523, 0.3], [1307, 0.15], [2213, 0.08]]) this._tone(out, t, 'sine', f, f * 0.98, 1.6, v, 0.001);
        this._burst(out, t, 0.4, 'highpass', 2000, 1, 0.2);
        break;
      case 'gen':
        this._tone(out, t, 'sawtooth', 48 + Math.random() * 4, 50, 0.35, 0.18, 0.05);
        this._burst(out, t, 0.25, 'bandpass', 300, 3, 0.15, 0.03);
        break;
      case 'siren': {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth';
        for (let i = 0; i < 4; i++) {
          o.frequency.setValueAtTime(420, t + i * 1.2);
          o.frequency.linearRampToValueAtTime(680, t + i * 1.2 + 0.6);
          o.frequency.linearRampToValueAtTime(420, t + i * 1.2 + 1.2);
        }
        const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.5;
        const g = this.ctx.createGain(); this._env(g.gain, t, 0.35, 0.2, 4.6, 0.3, 0.6);
        o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 5.2);
        break;
      }
      case 'hook':
        for (const [f, v] of [[310, 0.5], [737, 0.35], [1290, 0.2], [2070, 0.12]]) this._tone(out, t, 'sine', f, f * 0.99, 1.3, v, 0.001);
        this._burst(out, t, 0.2, 'bandpass', 3000, 3, 0.5);
        break;
      case 'sacrifice':
        this._tone(out, t, 'sawtooth', 55, 30, 2.5, 0.6, 0.3);
        this._burst(out, t, 2.2, 'lowpass', 300, 1, 0.9, 0.4, 2000, true);
        for (let i = 0; i < 5; i++) this._tone(out, t + i * 0.15, 'triangle', 900 - i * 120, 300, 0.4, 0.15);
        break;
      case 'unhook':
        this._tone(out, t, 'sine', 600, 400, 0.3, 0.3);
        this._burst(out, t, 0.2, 'bandpass', 2000, 3, 0.3);
        break;
      case 'whoosh':
        this._burst(out, t, 0.5, 'bandpass', 400, 2, 0.7, 0.05, 3000);
        break;
      case 'cloak':
        this._burst(out, t, 0.8, 'bandpass', 3000, 6, 0.5, 0.1, 400);
        this._tone(out, t, 'sine', 900, 200, 0.8, 0.15, 0.05);
        break;
      case 'roar': {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(70, t + 0.9);
        const g = this.ctx.createGain(); this._env(g.gain, t, 0.6, 0.05, 0.9);
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
        o.connect(this.dist).connect(f).connect(g).connect(out); o.start(t); o.stop(t + 1.1);
        this._burst(out, t, 0.9, 'lowpass', 700, 1, 0.6, 0.05);
        break;
      }
      case 'flare':
        this._burst(out, t, 0.12, 'highpass', 2000, 1, 1.0);
        this._burst(out, t, 1.6, 'bandpass', 4000, 1, 0.35, 0.02, 1500);
        this._tone(out, t, 'sine', 2600, 1800, 0.6, 0.15);
        break;
      case 'trap':
        for (const [f, v] of [[1100, 0.5], [2600, 0.3], [3900, 0.15]]) this._tone(out, t, 'square', f, f * 0.8, 0.25, v * 0.5, 0.001);
        this._burst(out, t, 0.12, 'highpass', 2500, 1, 0.8);
        break;
      case 'trapSet':
        this._tone(out, t, 'square', 600, 300, 0.12, 0.15);
        this._burst(out, t, 0.08, 'bandpass', 2000, 4, 0.3);
        break;
      case 'kick':
        this._tone(out, t, 'sine', 100, 50, 0.25, 0.9);
        this._burst(out, t, 0.4, 'bandpass', 1800, 1, 0.6, 0.001, 600);
        break;
      case 'gate':
        this._tone(out, t, 'sawtooth', 60, 55, 2.4, 0.2, 0.2);
        this._burst(out, t, 2.4, 'bandpass', 500, 2, 0.4, 0.2);
        break;
      case 'escape':
        for (const [f, v] of [[392, 0.3], [523, 0.25], [659, 0.2]]) this._tone(out, t, 'sine', f, f, 1.8, v, 0.05);
        break;
      case 'ui':
        this._tone(out, t, 'sine', 880, 880, 0.06, 0.15);
        break;
      case 'sense':
        this._tone(out, t, 'sine', 220, 110, 1.5, 0.45, 0.2);
        this._burst(out, t, 1.2, 'bandpass', 1200, 8, 0.4, 0.3, 300);
        break;
      default:
        break;
    }
  }
}
