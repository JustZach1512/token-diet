// ───────────────────────── núcleo: constantes, utilidades, entrada y sonido ─────────────────────────
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const V3 = THREE.Vector3;
const v3 = (x = 0, y = 0, z = 0) => new V3(x, y, z);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const AX = ['x', 'y', 'z'];

const PHYS = {
  gravity: 18, walk: 5.6, groundAccel: 60, airAccel: 9, jump: 6.7, terminal: 45,
  half: 0.34, halfY: 0.89, eye: 0.72, step: 0.42, cubeHalf: 0.32,
};
const PORTAL_W = 1.3, PORTAL_H = 2.2;
const SNAP_DIST = 2.0;
const HOLD_DIST = 1.7;
const MAX_SUBSTEP = 1 / 120;

const BLUE = new THREE.Color(0.16, 0.55, 1.0);
const ORANGE = new THREE.Color(1.0, 0.42, 0.06);
const SIGNAL_OFF = new THREE.Color(0.1, 0.45, 1.0);
const SIGNAL_ON = new THREE.Color(1.0, 0.5, 0.08);

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ───── entrada ─────
const Input = {
  down: new Set(), hit: new Set(), dx: 0, dy: 0,
  move: { x: 0, y: 0 }, // joystick táctil
  isDown(...c) { return c.some(k => this.down.has(k)); },
  wasHit(...c) { return c.some(k => this.hit.has(k)); },
  press(code) { if (!this.down.has(code)) this.hit.add(code); this.down.add(code); },
  release(code) { this.down.delete(code); },
  endFrame() { this.hit.clear(); this.dx = 0; this.dy = 0; },
  reset() { this.down.clear(); this.hit.clear(); this.dx = this.dy = 0; this.move.x = this.move.y = 0; },
};

// ───── sonido sintetizado (WebAudio) ─────
const Sound = {
  ctx: null, master: null, vol: 0.7, muted: false, noise: null, amb: null,
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { this.ctx = new AC(); } catch (e) { return false; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this.vol;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.startAmbience();
    return true;
  },
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.vol; },
  startAmbience() {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 260; g.gain.value = 0.03;
    [55, 82.4, 110.3].forEach((f, i) => {
      const o = c.createOscillator(); o.type = i === 1 ? 'triangle' : 'sine'; o.frequency.value = f;
      const og = c.createGain(); og.gain.value = i === 2 ? 0.25 : 0.6; o.connect(og); og.connect(lp); o.start();
    });
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 0.012; lfo.connect(lg); lg.connect(g.gain); lfo.start();
    lp.connect(g); g.connect(this.master);
    this.amb = g;
  },
  osc({ type = 'sine', f = 440, f2 = 0, t = 0.2, v = 0.1, a = 0.006, delay = 0, detune = 0 }) {
    const c = this.ctx, now = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f, now);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), now + t);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(v, now + a);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t);
    o.connect(g); g.connect(this.master);
    o.start(now); o.stop(now + t + 0.05);
  },
  burst({ t = 0.2, v = 0.1, f = 1000, f2 = 0, q = 1, type = 'bandpass', a = 0.004, delay = 0 }) {
    const c = this.ctx, now = c.currentTime + delay;
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, now);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, now + t);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(v, now + a);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t);
    s.connect(fl); fl.connect(g); g.connect(this.master);
    s.start(now, Math.random() * 1.5); s.stop(now + t + 0.05);
  },
  play(name, p = {}) {
    if (!this.ctx || this.muted) return;
    const O = o => this.osc(o), B = o => this.burst(o);
    switch (name) {
      case 'shoot': {
        const hi = p.kind === 0;
        O({ type: 'sawtooth', f: hi ? 1100 : 800, f2: hi ? 320 : 220, t: 0.2, v: 0.05 });
        O({ type: 'sine', f: hi ? 1800 : 1300, f2: hi ? 600 : 420, t: 0.16, v: 0.05 });
        B({ f: 3500, f2: 700, t: 0.16, v: 0.08, q: 0.7 });
        break;
      }
      case 'open':
        O({ type: 'sine', f: p.kind === 0 ? 420 : 330, f2: p.kind === 0 ? 880 : 690, t: 0.45, v: 0.06 });
        O({ type: 'triangle', f: p.kind === 0 ? 630 : 495, f2: p.kind === 0 ? 1320 : 1040, t: 0.4, v: 0.03, detune: 9 });
        B({ type: 'highpass', f: 5000, t: 0.35, v: 0.03 });
        break;
      case 'fail':
        O({ type: 'square', f: 130, f2: 70, t: 0.2, v: 0.05 });
        B({ type: 'lowpass', f: 900, f2: 200, t: 0.16, v: 0.08 });
        break;
      case 'teleport':
        B({ f: 300, f2: 2600, t: 0.32, v: 0.09, q: 0.9 });
        O({ type: 'sine', f: 180, f2: 760, t: 0.26, v: 0.04 });
        break;
      case 'pickup':
        O({ type: 'sine', f: 190, f2: 420, t: 0.14, v: 0.08 });
        O({ type: 'triangle', f: 640, t: 0.1, v: 0.03, delay: 0.03 });
        break;
      case 'drop': O({ type: 'sine', f: 360, f2: 150, t: 0.14, v: 0.07 }); break;
      case 'land': B({ type: 'lowpass', f: 380, t: 0.12, v: clamp(p.v || 0.08, 0.02, 0.22) }); break;
      case 'step': B({ type: 'lowpass', f: 260 + Math.random() * 120, t: 0.06, v: 0.035 }); break;
      case 'thud': B({ type: 'lowpass', f: 300, t: 0.1, v: clamp(p.v || 0.08, 0.02, 0.16) }); O({ type: 'sine', f: 90, f2: 50, t: 0.12, v: 0.06 }); break;
      case 'buttonOn':
        O({ type: 'square', f: 180, t: 0.05, v: 0.03 });
        O({ type: 'sine', f: 520, f2: 880, t: 0.3, v: 0.05, delay: 0.03 });
        break;
      case 'buttonOff': O({ type: 'sine', f: 760, f2: 380, t: 0.25, v: 0.04 }); break;
      case 'door':
        B({ type: 'lowpass', f: 1400, f2: 260, t: 0.55, v: 0.08 });
        O({ type: 'sine', f: 95, f2: 70, t: 0.4, v: 0.06 });
        break;
      case 'death':
        O({ type: 'sawtooth', f: 320, f2: 38, t: 1.0, v: 0.08 });
        B({ type: 'lowpass', f: 1800, f2: 120, t: 0.8, v: 0.12 });
        break;
      case 'complete':
        [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => O({ type: 'sine', f, t: 0.7, v: 0.06, delay: i * 0.085 }));
        [261.6, 392].forEach((f, i) => O({ type: 'triangle', f, t: 1.2, v: 0.04, delay: 0.1 + i * 0.1 }));
        break;
      case 'fizzle':
        B({ type: 'highpass', f: 1800, f2: 7000, t: 0.55, v: 0.08, q: 2 });
        O({ type: 'square', f: 1400, f2: 180, t: 0.35, v: 0.025 });
        break;
      case 'pellet': O({ type: 'sawtooth', f: 500, f2: 1300, t: 0.3, v: 0.035 }); B({ f: 2000, t: 0.2, v: 0.04 }); break;
      case 'bounce': O({ type: 'sine', f: 1500, f2: 900, t: 0.14, v: 0.04 }); break;
      case 'capture':
        O({ type: 'sine', f: 200, f2: 1300, t: 0.9, v: 0.08 });
        O({ type: 'triangle', f: 300, f2: 1900, t: 0.9, v: 0.04, delay: 0.05 });
        break;
      case 'explode': B({ type: 'lowpass', f: 1600, f2: 90, t: 0.7, v: 0.16 }); O({ type: 'sine', f: 120, f2: 40, t: 0.5, v: 0.08 }); break;
      case 'tick': O({ type: 'square', f: p.hi ? 1500 : 1100, t: 0.035, v: 0.025 }); break;
      case 'msg': O({ type: 'sine', f: 1180, t: 0.07, v: 0.025 }); O({ type: 'sine', f: 1580, t: 0.07, v: 0.025, delay: 0.08 }); break;
      case 'ui': O({ type: 'sine', f: 900, f2: 1200, t: 0.05, v: 0.025 }); break;
      case 'drip': O({ type: 'sine', f: 420, f2: 900, t: 0.08, v: 0.03 }); break;
    }
  },
};
