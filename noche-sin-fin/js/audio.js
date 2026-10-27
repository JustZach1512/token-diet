// Audio sintetizado con WebAudio: sin archivos externos.
(function () {
  'use strict';
  const NSF = window.NSF;

  const A = {
    ctx: null, master: null, noiseBuf: null, enabled: true,
    amb: null, chase: null, beatT: 0,

    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.enabled ? 0.8 : 0;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(c.destination);
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startAmbient();
    },

    setEnabled(on) {
      this.enabled = on;
      if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
    },

    startAmbient() {
      const c = this.ctx;
      const g = c.createGain(); g.gain.value = 0.0;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 6;
      const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator();
      o1.type = 'sawtooth'; o1.frequency.value = 43.65;
      o2.type = 'sawtooth'; o2.frequency.value = 43.9;
      o3.type = 'triangle'; o3.frequency.value = 65.4;
      const lfo = c.createOscillator(), lfoG = c.createGain();
      lfo.frequency.value = 0.07; lfoG.gain.value = 90;
      lfo.connect(lfoG); lfoG.connect(lp.frequency);
      [o1, o2, o3].forEach((o) => { o.connect(lp); o.start(); });
      lfo.start();
      // viento
      const wn = c.createBufferSource(); wn.buffer = this.noiseBuf; wn.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.8;
      const wg = c.createGain(); wg.gain.value = 0.05;
      const wl = c.createOscillator(), wlg = c.createGain();
      wl.frequency.value = 0.11; wlg.gain.value = 260;
      wl.connect(wlg); wlg.connect(bp.frequency);
      wn.connect(bp); bp.connect(wg); wg.connect(g);
      wn.start(); wl.start();
      lp.connect(g); g.connect(this.master);
      g.gain.setTargetAtTime(0.16, c.currentTime, 2);
      this.amb = g;
      // capa de persecución
      const cg = c.createGain(); cg.gain.value = 0;
      const co = c.createOscillator(); co.type = 'sawtooth'; co.frequency.value = 110;
      const co2 = c.createOscillator(); co2.type = 'square'; co2.frequency.value = 116.5;
      const cf = c.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 600;
      const trem = c.createOscillator(), tg = c.createGain();
      trem.frequency.value = 7; tg.gain.value = 0.5;
      const tremBias = c.createGain(); tremBias.gain.value = 0.5;
      trem.connect(tg); tg.connect(tremBias.gain);
      co.connect(cf); co2.connect(cf); cf.connect(tremBias); tremBias.connect(cg); cg.connect(this.master);
      co.start(); co2.start(); trem.start();
      this.chase = cg;
    },

    setChase(level) {
      if (!this.chase) return;
      this.chase.gain.setTargetAtTime(level * 0.07, this.ctx.currentTime, 0.4);
    },
    setAmbient(level) {
      if (!this.amb) return;
      this.amb.gain.setTargetAtTime(0.16 * level, this.ctx.currentTime, 0.8);
    },

    tone(f, dur, opts = {}) {
      const c = this.ctx;
      if (!c) return;
      const t = c.currentTime + (opts.delay || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = opts.type || 'sine';
      o.frequency.setValueAtTime(f, t);
      if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
      const v = (opts.vol || 0.3) * (opts.gain || 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + (opts.attack || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (opts.lp) { const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = opts.lp; o.connect(f2); node = f2; }
      node.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, opts = {}) {
      const c = this.ctx;
      if (!c) return;
      const t = c.currentTime + (opts.delay || 0);
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      s.playbackRate.value = opts.rate || 1;
      const f = c.createBiquadFilter(); f.type = opts.filter || 'bandpass';
      f.frequency.setValueAtTime(opts.freq || 1000, t);
      if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
      f.Q.value = opts.q || 1;
      const g = c.createGain();
      const v = (opts.vol || 0.3) * (opts.gain || 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + (opts.attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t, Math.random()); s.stop(t + dur + 0.05);
    },

    heartbeat(intensity) {
      if (!this.ctx) return;
      const v = 0.25 + intensity * 0.55;
      this.tone(58, 0.16, { vol: v, lp: 200 });
      this.tone(52, 0.2, { vol: v * 0.8, lp: 180, delay: 0.17 });
    },

    play(name, gain = 1) {
      if (!this.ctx || !this.enabled) return;
      const o = { gain };
      switch (name) {
        case 'click': this.tone(660, 0.06, { ...o, vol: 0.12, type: 'triangle' }); break;
        case 'scream':
          this.noise(0.55, { ...o, vol: 0.35, freq: 1800, to: 900, q: 4 });
          this.tone(820, 0.5, { ...o, vol: 0.12, type: 'sawtooth', to: 540, lp: 2200 });
          break;
        case 'hit':
          this.noise(0.18, { ...o, vol: 0.5, freq: 400, filter: 'lowpass' });
          this.tone(90, 0.25, { ...o, vol: 0.4, to: 40 });
          break;
        case 'swing': this.noise(0.22, { ...o, vol: 0.18, freq: 2200, to: 600, q: 1.5 }); break;
        case 'hook':
          this.tone(1240, 0.9, { ...o, vol: 0.12, type: 'square', lp: 3000 });
          this.tone(1660, 0.7, { ...o, vol: 0.07, type: 'square', lp: 3000, delay: 0.02 });
          this.noise(0.6, { ...o, vol: 0.3, freq: 300, filter: 'lowpass' });
          break;
        case 'gen':
          [523, 659, 784].forEach((f, i) => this.tone(f, 1.4, { ...o, vol: 0.12, type: 'triangle', delay: i * 0.08 }));
          this.noise(0.7, { ...o, vol: 0.15, freq: 120, filter: 'lowpass' });
          break;
        case 'skillWarn': this.tone(1400, 0.08, { ...o, vol: 0.18, type: 'square', lp: 4000 }); break;
        case 'skillGood': this.tone(880, 0.12, { ...o, vol: 0.14, type: 'triangle' }); break;
        case 'skillGreat':
          this.tone(988, 0.12, { ...o, vol: 0.14, type: 'triangle' });
          this.tone(1318, 0.2, { ...o, vol: 0.12, type: 'triangle', delay: 0.07 });
          break;
        case 'skillFail':
          this.noise(0.5, { ...o, vol: 0.5, freq: 900, filter: 'lowpass', to: 200 });
          this.tone(70, 0.4, { ...o, vol: 0.4, to: 35, type: 'sawtooth', lp: 300 });
          break;
        case 'pallet':
          this.noise(0.3, { ...o, vol: 0.45, freq: 500, filter: 'lowpass' });
          this.tone(120, 0.2, { ...o, vol: 0.3, to: 60 });
          break;
        case 'stun': this.tone(300, 0.4, { ...o, vol: 0.18, type: 'square', to: 120, lp: 1500 }); break;
        case 'vault': this.noise(0.16, { ...o, vol: 0.18, freq: 700 }); break;
        case 'break':
          this.noise(0.5, { ...o, vol: 0.45, freq: 1200, q: 0.7 });
          this.tone(80, 0.3, { ...o, vol: 0.3, to: 45 });
          break;
        case 'breaking': this.noise(0.25, { ...o, vol: 0.15, freq: 600, q: 2, delay: 0.5 }); break;
        case 'kick':
          this.tone(180, 0.15, { ...o, vol: 0.3, type: 'square', lp: 900 });
          this.noise(0.3, { ...o, vol: 0.3, freq: 2400, q: 3 });
          break;
        case 'gate':
          this.tone(98, 1.6, { ...o, vol: 0.2, type: 'sawtooth', lp: 400 });
          this.noise(1.6, { ...o, vol: 0.2, freq: 200, filter: 'lowpass' });
          break;
        case 'siren':
          this.tone(440, 1.5, { ...o, vol: 0.12, type: 'sawtooth', to: 660, lp: 1800 });
          this.tone(660, 1.5, { ...o, vol: 0.1, type: 'sawtooth', to: 440, lp: 1800, delay: 1.5 });
          break;
        case 'escape': [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.9, { ...o, vol: 0.1, type: 'triangle', delay: i * 0.12 })); break;
        case 'dead':
          this.tone(110, 2, { ...o, vol: 0.25, type: 'sawtooth', to: 55, lp: 500 });
          this.noise(1.6, { ...o, vol: 0.2, freq: 300, to: 80 });
          break;
        case 'ability': this.tone(520, 0.2, { ...o, vol: 0.14, type: 'triangle', to: 780 }); break;
        case 'flash':
          this.noise(0.12, { ...o, vol: 0.35, freq: 5000, filter: 'highpass' });
          this.tone(2400, 0.3, { ...o, vol: 0.06, type: 'sine', to: 3200 });
          break;
        case 'charge': this.tone(70, 0.6, { ...o, vol: 0.3, type: 'sawtooth', to: 140, lp: 700 }); break;
        case 'crash':
          this.noise(0.4, { ...o, vol: 0.55, freq: 300, filter: 'lowpass' });
          this.tone(60, 0.4, { ...o, vol: 0.4, to: 30 });
          break;
        case 'bell':
          this.tone(784, 1.6, { ...o, vol: 0.12, type: 'sine' });
          this.tone(1176, 1.2, { ...o, vol: 0.06, type: 'sine' });
          break;
        case 'axe': this.noise(0.3, { ...o, vol: 0.22, freq: 1500, to: 3000, q: 2 }); break;
        case 'thud': this.tone(140, 0.12, { ...o, vol: 0.25, to: 70 }); break;
        case 'trapSet': this.tone(196, 0.5, { ...o, vol: 0.12, type: 'triangle', to: 98 }); break;
        case 'trap':
          this.noise(0.6, { ...o, vol: 0.3, freq: 600, q: 6 });
          this.tone(233, 0.8, { ...o, vol: 0.14, type: 'sawtooth', lp: 900, to: 110 });
          break;
        case 'teleport': this.tone(300, 0.5, { ...o, vol: 0.14, type: 'sine', to: 1200 }); break;
        case 'pickup': this.noise(0.25, { ...o, vol: 0.2, freq: 400 }); break;
        case 'rescue': this.tone(660, 0.3, { ...o, vol: 0.12, type: 'triangle', to: 880 }); break;
        case 'hatch': this.noise(2, { ...o, vol: 0.15, freq: 300, q: 3, to: 900 }); break;
        case 'whisper': this.noise(1.2, { ...o, vol: 0.06, freq: 2600, q: 8, to: 1800 }); break;
      }
    },
  };

  NSF.Audio = A;
})();
