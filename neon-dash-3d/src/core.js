// Neon Dash 3D — simulation core: deterministic physics, level builder and level data.
// No DOM access: the game and tools/verify.mjs (level solver) both run this same file.
(function (root) {
'use strict';

const DT = 1 / 240;
// Blocks per second for portal speeds 0.5x, 1x, 2x, 3x, 4x.
const SPEEDS = [8.4, 10.4, 12.96, 15.6, 19.2];
const PHYS = {
  cube: { g: 87, jump: 19.6, maxFall: 26 },
  ship: { up: 70, down: 58, maxUp: 10, maxDown: 12 },
  ball: { g: 72, flip: 4, maxFall: 22 },
  ufo: { g: 58, flap: 12.5, maxFall: 16 },
  wave: {},
};
const PAD_V = {
  yellow: { cube: 27.5, ship: 13, ball: 19, ufo: 17, wave: 0 },
  pink: { cube: 22, ship: 9, ball: 14, ufo: 13, wave: 0 },
};
const ORB_V = {
  yellow: { cube: 19.6, ship: 11, ball: 15, ufo: 12.5, wave: 0 },
  pink: { cube: 15.5, ship: 8, ball: 11, ufo: 9.5, wave: 0 },
};
// Half extents per mode: [outer box (lands on solids), inner box (dies inside solids), hazard box].
const SIZE = {
  cube: [0.5, 0.2, 0.4], ship: [0.5, 0.2, 0.36], ball: [0.5, 0.2, 0.4],
  ufo: [0.5, 0.2, 0.38], wave: [0.3, 0.12, 0.2],
};
const BAND_H = { ship: 10, ufo: 10, wave: 10, ball: 8 };
const ORB_R = 0.65, COIN_R = 0.6;

// ---------------------------------------------------------------- simulation
function newState(L) {
  return {
    x: 0, y: 0.5, vy: 0, mode: 'cube', gs: 1, spd: L.speed, band: null,
    grounded: true, hold: false, prevHold: false, buffer: false,
    dead: false, win: false, t: 0, jumps: 0, used: [], coins: [false, false, false], events: null,
  };
}

function clone(s) {
  const c = Object.assign({}, s);
  c.used = s.used.slice(); c.coins = s.coins.slice(); c.events = null;
  return c;
}

let STAMP = 1;
const near = [];
function gather(L, x) {
  near.length = 0;
  const st = ++STAMP, c0 = Math.floor(x - 1.5), c1 = Math.floor(x + 1.5);
  for (let c = c0; c <= c1; c++) {
    const cell = L.grid[c];
    if (!cell) continue;
    for (let i = 0; i < cell.length; i++) {
      const o = cell[i];
      if (o.st !== st) { o.st = st; near.push(o); }
    }
  }
  return near;
}

function emit(s, type, o) { if (s.events) s.events.push({ type, o, x: s.x, y: s.y }); }
function die(s) { s.dead = true; emit(s, 'die'); }
function isUsed(s, o) { return s.used.indexOf(o) !== -1; }
function use(s, o) {
  if (s.used.length > 6) s.used = s.used.filter(u => u.maxX > s.x - 2);
  s.used.push(o);
}
function boxCircle(px, py, h, cx, cy, r) {
  const dx = Math.max(Math.abs(px - cx) - h, 0), dy = Math.max(Math.abs(py - cy) - h, 0);
  return dx * dx + dy * dy < r * r;
}

function setMode(s, m, band) {
  // Mode portals reset gravity so each section starts the same way whatever the ball did before.
  if (s.gs < 0) { s.gs = 1; s.vy *= -0.5; }
  s.mode = m;
  s.band = m === 'cube' ? null : band;
  if (m === 'ship') {
    const P = PHYS.ship, v = s.vy * 0.5 * s.gs;
    s.vy = s.gs * Math.max(-P.maxDown, Math.min(P.maxUp, v));
  } else if (m === 'ufo' || m === 'ball') s.vy *= 0.5;
  else if (m === 'wave') s.vy = 0;
  if (s.band) {
    const h = SIZE[m][0];
    s.y = Math.max(s.band[0] + h, Math.min(s.band[1] - h, s.y));
  }
  s.grounded = false;
}

function step(s, L, hold) {
  if (s.dead || s.win) return;
  if (hold && !s.prevHold) s.buffer = true;
  if (!hold) s.buffer = false;
  s.prevHold = hold; s.hold = hold;
  const sp = SPEEDS[s.spd], gs = s.gs, wasGrounded = s.grounded;

  switch (s.mode) {
    case 'cube': {
      const P = PHYS.cube;
      if (s.grounded && hold) {
        s.vy = gs * P.jump; s.grounded = false; s.buffer = false; s.jumps++; emit(s, 'jump');
      } else {
        s.vy -= gs * P.g * DT;
        if (s.vy * gs < -P.maxFall) s.vy = -gs * P.maxFall;
      }
      break;
    }
    case 'ship': {
      const P = PHYS.ship;
      let v = s.vy * gs + (hold ? P.up : -P.down) * DT;
      v = Math.max(-P.maxDown, Math.min(P.maxUp, v));
      s.vy = v * gs;
      break;
    }
    case 'ball': {
      const P = PHYS.ball;
      if (s.grounded && s.buffer) {
        s.gs = -gs; s.vy = -s.gs * P.flip; s.buffer = false; s.grounded = false; s.jumps++; emit(s, 'flip');
      } else {
        s.vy -= gs * P.g * DT;
        if (s.vy * gs < -P.maxFall) s.vy = -gs * P.maxFall;
      }
      break;
    }
    case 'ufo': {
      const P = PHYS.ufo;
      if (s.buffer) {
        s.vy = gs * P.flap; s.buffer = false; s.grounded = false; s.jumps++; emit(s, 'flap');
      } else {
        s.vy -= gs * P.g * DT;
        if (s.vy * gs < -P.maxFall) s.vy = -gs * P.maxFall;
      }
      break;
    }
    case 'wave':
      s.vy = (hold ? 1 : -1) * gs * sp;
      break;
  }

  s.x += sp * DT;
  s.y += s.vy * DT;
  s.t += DT;

  const sz = SIZE[s.mode], ho = sz[0], hi = sz[1], hz = sz[2], snap = ho - hi + 0.02;
  s.grounded = false;
  const lo = s.band ? s.band[0] : 0;
  if (s.y - ho < lo) { s.y = lo + ho; if (s.vy < 0) s.vy = 0; if (s.gs > 0) s.grounded = true; }
  if (s.band) {
    const top = s.band[1];
    if (s.y + ho > top) { s.y = top - ho; if (s.vy > 0) s.vy = 0; if (s.gs < 0) s.grounded = true; }
  } else if (s.y > 40) { die(s); return; }

  const objs = gather(L, s.x);
  // Solids first: die if the small inner box is inside a block, otherwise snap onto the nearest face.
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    if (o.k !== 'S') continue;
    if (s.x + hi > o.x0 && s.x - hi < o.x1 && s.y + hi > o.y0 && s.y - hi < o.y1) { die(s); return; }
    if (s.x + ho > o.x0 && s.x - ho < o.x1 && s.y + ho > o.y0 && s.y - ho < o.y1) {
      const pt = o.y1 - (s.y - ho), pb = (s.y + ho) - o.y0;
      if (pt <= pb) {
        if (pt <= snap) { s.y = o.y1 + ho; if (s.vy < 0) s.vy = 0; if (s.gs > 0) s.grounded = true; }
      } else if (pb <= snap) { s.y = o.y0 - ho; if (s.vy > 0) s.vy = 0; if (s.gs < 0) s.grounded = true; }
    }
  }

  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    switch (o.k) {
      case 'H':
        if (Math.abs(s.x - o.cx) < hz + o.hw && Math.abs(s.y - o.cy) < hz + o.hh) { die(s); return; }
        break;
      case 'C':
        if (boxCircle(s.x, s.y, hz, o.x, o.y, o.hr)) { die(s); return; }
        break;
      case 'W': {
        const xa = Math.max(o.ax, s.x - hz), xb = Math.min(o.bx, s.x + hz);
        if (xa > xb) break;
        const k = (o.by - o.ay) / (o.bx - o.ax);
        const ya = o.ay + k * (xa - o.ax), yb = o.ay + k * (xb - o.ax);
        if (o.side > 0 ? s.y + hz > Math.min(ya, yb) : s.y - hz < Math.max(ya, yb)) { die(s); return; }
        break;
      }
      case 'P':
        if (!isUsed(s, o) && s.x + ho > o.x0 && s.x - ho < o.x1 && s.y + ho > o.y0 && s.y - ho < o.y1) {
          use(s, o);
          if (o.type === 'blue') { s.gs = -s.gs; s.vy = -s.gs * 11; } else s.vy = s.gs * PAD_V[o.type][s.mode];
          s.grounded = false; emit(s, 'pad', o);
        }
        break;
      case 'O':
        if (s.buffer && !isUsed(s, o) && boxCircle(s.x, s.y, ho, o.x, o.y, ORB_R)) {
          use(s, o); s.buffer = false;
          if (o.type === 'blue') { s.gs = -s.gs; s.vy = -s.gs * 7; } else s.vy = s.gs * ORB_V[o.type][s.mode];
          s.grounded = false; s.jumps++; emit(s, 'orb', o);
        }
        break;
      case 'G':
        if (isUsed(s, o)) break;
        if (o.kind === 'speed') {
          if (s.x >= o.x + 0.5) { use(s, o); s.spd = o.val; emit(s, 'speed', o); }
        } else if (s.x + ho > o.x + 0.2 && s.x - ho < o.x + 0.8 && s.y + ho > o.y && s.y - ho < o.y + o.h) {
          use(s, o);
          if (o.kind === 'mode') setMode(s, o.val, o.band);
          else if (s.gs !== o.val) { s.gs = o.val; s.vy *= 0.5; s.grounded = false; }
          emit(s, 'portal', o);
        }
        break;
      case 'K':
        if (!s.coins[o.idx] && boxCircle(s.x, s.y, ho, o.x, o.y, COIN_R)) { s.coins[o.idx] = true; emit(s, 'coin', o); }
        break;
    }
  }

  if (s.grounded && !wasGrounded) emit(s, 'land');
  if (s.x >= L.length) { s.win = true; emit(s, 'win'); }
}

// ---------------------------------------------------------------- builder
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const half = v => Math.round(v * 2) / 2;

class Builder {
  constructor(def) {
    this.r = mulberry32(def.seed);
    this.objs = []; this.walls = []; this.colors = []; this.nid = 1; this.coinN = 0;
    this.x = 0; this.spd = def.speed; this.mode = 'cube'; this.band = null; this.ly = null;
    this.gapS = def.gap || [0.5, 0.8];
  }
  get sp() { return SPEEDS[this.spd]; }
  get J() { return this.sp * 2 * PHYS.cube.jump / PHYS.cube.g; }
  rnd(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(this.rnd(a, b + 1 - 1e-9)); }
  pick(a) { return a[Math.floor(this.r() * a.length)]; }
  add(o) { o.id = this.nid++; o.st = 0; this.objs.push(o); return o; }

  block(x, y, w, h) { return this.add({ k: 'S', x0: x, y0: y, x1: x + w, y1: y + h, minX: x, maxX: x + w }); }
  spike(x, y, dir = 'u', small = false) {
    const off = small ? 0.19 : 0.35;
    return this.add({ k: 'H', x, y, dir, small, cx: x + 0.5, cy: dir === 'u' ? y + off : y + 1 - off,
      hw: 0.15, hh: small ? 0.14 : 0.25, minX: x, maxX: x + 1 });
  }
  spikes(x, y, n, dir = 'u', small = false) { for (let i = 0; i < n; i++) this.spike(x + i, y, dir, small); }
  saw(x, y, r) { return this.add({ k: 'C', x, y, r, hr: r * 0.82, minX: x - r, maxX: x + r }); }
  pad(x, y, type, dir = 1) {
    const y0 = dir > 0 ? y : y + 0.75;
    return this.add({ k: 'P', x, y, type, dir, x0: x + 0.1, x1: x + 0.9, y0, y1: y0 + 0.25, minX: x, maxX: x + 1 });
  }
  orb(x, y, type) { return this.add({ k: 'O', x, y, type, minX: x - 0.7, maxX: x + 0.7 }); }
  portal(x, y, kind, val, h = 3, band = null) {
    return this.add({ k: 'G', x, y, h, kind, val, band, minX: x, maxX: x + 1 });
  }
  coin(x, y) { return this.add({ k: 'K', x, y, idx: this.coinN++, minX: x - 0.7, maxX: x + 0.7 }); }
  // side 1: deadly region above the polyline (ceiling); -1: below it (floor). edge = band edge it fills to.
  wall(pts, side, edge) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      this.add({ k: 'W', ax, ay, bx, by, side, minX: ax, maxX: bx });
    }
    this.walls.push({ pts, side, edge });
  }
  color(pal) { this.colors.push(Object.assign({ x: this.x }, pal)); }
  gap(g) { const r = g || this.gapS; this.x += Math.max(2.5, this.rnd(r[0], r[1]) * this.sp); }
  lead(n) { this.x += n; }

  p(name, o = {}) { // place one pattern at the cursor and advance past it
    const fn = PAT[name];
    if (!fn) throw new Error('unknown pattern ' + name);
    this.x += fn(this, o);
  }
  run(pool, n, o = {}) {
    for (let i = 0; i < n; i++) { this.p(this.pick(pool), o); this.gap(o.gap); }
  }

  speed(k) { this.portal(this.x, 0, 'speed', k, 4); this.spd = k; this.x += 1; }
  grav(g) {
    const y0 = this.band ? this.band[0] : 0, h = this.band ? this.band[1] - this.band[0] : 4;
    this.portal(this.x, y0, 'grav', g, h); this.x += 2;
  }
  to(mode, o = {}) {
    const y0 = this.band ? this.band[0] : 0, h = this.band ? this.band[1] - this.band[0] : 4;
    const band = mode === 'cube' ? null : [o.lo || 0, (o.lo || 0) + (o.h || BAND_H[mode])];
    this.portal(this.x, y0, 'mode', mode, h, band);
    if (o.pal) this.color(o.pal);
    const fromBand = !!this.band;
    this.mode = mode; this.band = band; this.ly = band ? (band[0] + band[1]) / 2 : null;
    this.x += mode === 'cube' ? (fromBand ? 10 : 6) : 6;
  }
  end() { this.x += 16; }

  build(def) {
    const L = {
      id: def.id, name: def.name, speed: def.speed, length: Math.ceil(this.x), objs: this.objs,
      walls: this.walls, colors: this.colors, coinCount: this.coinN, grid: [],
    };
    for (const o of this.objs) {
      for (let c = Math.floor(o.minX); c <= Math.floor(o.maxX); c++) (L.grid[c] || (L.grid[c] = [])).push(o);
    }
    return L;
  }
}

// ---------------------------------------------------------------- patterns
// Cube patterns assume normal gravity, player on the ground (y=0) at the cursor, and leave it on the ground.
// Each returns the length it occupies, including room to land.
const PAT = {
  s1(b) { b.spike(b.x, 0); return 1; },
  s2(b) { b.spikes(b.x, 0, 2); return 2; },
  s3(b) { b.spikes(b.x, 0, 3); return 3; },
  sm3(b) { b.spikes(b.x, 0, 3, 'u', true); return 3; },
  sS(b) { b.spike(b.x, 0, 'u', true); b.spike(b.x + 1, 0); b.spike(b.x + 2, 0, 'u', true); return 3; },
  blk(b) { b.block(b.x, 0, 1, 1); return 2; },
  blkS(b) { b.block(b.x, 0, 2, 1); b.spike(b.x + 2, 0); return 3; },
  tower(b) { b.block(b.x, 0, 1, 1); b.block(b.x + 1, 0, 1, 2); b.spike(b.x + 2, 0); b.spike(b.x + 3, 0); return 6; },
  ledge(b) { b.block(b.x, 0, 6, 1); b.spike(b.x + 3, 1); return 8; },
  step(b) { b.block(b.x, 0, 3, 1); b.block(b.x + 3, 0, 3, 2); b.block(b.x + 6, 0, 3, 1); return 13; },
  stairs(b) {
    b.block(b.x, 0, 3, 1); b.block(b.x + 3, 0, 3, 2); b.block(b.x + 6, 0, 3, 3);
    b.spikes(b.x + 9, 0, 2, 'u', true);
    return 17;
  },
  pit(b, o) {
    const n = o.pit || b.pick([2, 2, 3]);
    b.block(b.x, 0, 3, 1); b.spikes(b.x + 3, 0, n); b.block(b.x + 3 + n, 0, 3, 1);
    return 8 + n;
  },
  pitHigh(b) {
    b.block(b.x, 0, 2, 1); b.block(b.x + 2, 0, 3, 2); b.spikes(b.x + 5, 0, 3);
    b.block(b.x + 8, 0, 3, 2); b.spike(b.x + 11, 0, 'u', true);
    return 16;
  },
  pillars(b) {
    const g = Math.max(2, Math.round(b.J - 2.6));
    let x = b.x;
    b.block(x, 0, 2, 1); x += 2; b.spikes(x, 0, g); x += g;
    b.block(x, 0, 2, 2); x += 2; b.spikes(x, 0, g); x += g;
    b.block(x, 0, 2, 1); x += 2;
    return x - b.x + 4;
  },
  orbPit(b) { b.spikes(b.x, 0, 6); b.orb(b.x + 2.5, 1.8, 'yellow'); return 9; },
  orbPit2(b) {
    b.spikes(b.x, 0, 11); b.orb(b.x + 2.5, 1.8, 'yellow'); b.orb(b.x + 7.5, 1.8, 'yellow');
    return 15;
  },
  pinkOrbs(b) {
    b.spikes(b.x, 0, 9); b.orb(b.x + 2, 1.6, 'pink'); b.orb(b.x + 5.5, 1.6, 'pink');
    return 13;
  },
  padUp(b) { b.pad(b.x, 0, 'yellow'); b.spikes(b.x + 2, 0, 8); b.block(b.x + 3, 2, 7, 1); return 15; },
  padWall(b) {
    const off = Math.max(2, Math.round(0.3 * b.sp));
    b.pad(b.x, 0, 'yellow'); b.block(b.x + off, 0, 1, 3);
    return off + 8;
  },
  pinkPad(b) { b.pad(b.x, 0, 'pink'); b.spikes(b.x + 1, 0, 3); return 8; },
  saw(b) { b.saw(b.x + 1, 0, 1.1); return 3; },
  saw2(b) { b.saw(b.x + 1, 0, 1.1); b.block(b.x + 4, 0, 3, 1); b.saw(b.x + 8.5, 1, 1); return 12; },
  gravUp(b) {
    const x = b.x;
    b.portal(x, 0, 'grav', -1, 4);
    b.block(x - 1, 4, 15, 1);
    b.spikes(x + 2, 0, 7);
    b.spike(x + 7, 3, 'd');
    b.portal(x + 12, 1, 'grav', 1, 3);
    return 18;
  },
  blueOrb(b) {
    const x = b.x;
    b.spikes(x + 1, 0, 9);
    b.orb(x + 2, 1.6, 'blue');
    b.block(x, 5, 12, 1);
    b.spike(x + 7, 4, 'd', true);
    b.portal(x + 10, 2, 'grav', 1, 3);
    return 16;
  },

  // ---- coins
  coinOrb(b) { // optional high orb: hit it on top of the jump to grab the coin
    b.spike(b.x + 1, 0); b.orb(b.x + 2, 3.4, 'yellow'); b.coin(b.x + 4.5, 5.6);
    return 14;
  },
  coinPit(b) { // land between two spike pairs where the coin sits
    b.spikes(b.x, 0, 2); b.coin(b.x + 3, 0.7); b.spikes(b.x + 4, 0, 2); return 7;
  },
  coinPad(b) { // optional pink pad off the main path: jump over it and you miss the coin
    b.pad(b.x, 0, 'pink'); b.coin(b.x + 3, 3.3); b.spike(b.x + 7, 0); return 10;
  },

  // ---- ship / ufo: pillar gates from floor and ceiling
  gates(b, o) {
    const [lo, hi] = b.band, x0 = b.x;
    let x = b.x, c = b.ly == null ? (lo + hi) / 2 : b.ly;
    const n = o.n || 6, space = Math.max(3, (o.space || 0.5) * b.sp);
    for (let i = 0; i < n; i++) {
      const gap = b.rnd(o.gap[0], o.gap[1]), w = b.pick(o.w || [1, 1, 2]);
      const lim = (o.slope || 0.4) * space, spk = o.spikes && b.r() < o.spikes;
      const m = spk ? 1.6 : 0.6;
      c = half(clamp(c + b.rnd(-lim, lim), lo + gap / 2 + m, hi - gap / 2 - m));
      let g0 = half(c - gap / 2), g1 = half(c + gap / 2);
      if (spk) {
        if (g0 - 1 > lo) { b.spikes(x, g0 - 1, w); g0 -= 1; }
        if (g1 + 1 < hi) { b.spikes(x, g1, w, 'd'); g1 += 1; }
      }
      if (g0 > lo) b.block(x, lo, w, g0 - lo);
      if (g1 < hi) b.block(x, g1, w, hi - g1);
      if (o.coinAt === i) b.coin(x + w + Math.min(1.5, space * 0.3), g0 + 0.55); // hug the bottom of the gap
      x += w + space;
    }
    b.ly = c;
    return x - x0;
  },
  saws(b, o) {
    const [lo, hi] = b.band, x0 = b.x;
    let x = b.x;
    for (let i = 0; i < (o.n || 4); i++) {
      const y = half(b.rnd(lo + 2.5, hi - 2.5)), r = b.pick([1, 1.2, 1.5]);
      b.saw(x + r, y, r);
      x += 2 * r + Math.max(3, (o.space || 0.5) * b.sp);
    }
    return x - x0;
  },
  // Smooth sloped tunnel with deadly walls (ship); 45-degree zigzag tunnel (wave).
  tunnel(b, o) {
    const [lo, hi] = b.band, h = o.h, x0 = b.x, wave = b.mode === 'wave';
    const mouth = wave ? 7 : 8;
    let y = clamp(b.ly == null ? (lo + hi) / 2 : b.ly, lo + h + 0.6, hi - h - 0.6);
    const top = [[x0, hi], [x0 + mouth, y + h]], bot = [[x0, lo], [x0 + mouth, y - h]];
    let x = x0 + mouth, dir = b.r() < 0.5 ? 1 : -1, guard = 0;
    while (x < x0 + o.len && guard++ < 200) {
      const seg = half(b.rnd(o.seg[0], o.seg[1]));
      const slope = wave ? 1 : b.rnd(0.15, o.slope || 0.45);
      let dy = dir * seg * slope;
      if (y + dy + h > hi - 0.6 || y + dy - h < lo + 0.6) { dir = -dir; dy = -dy; }
      dy = clamp(y + dy, lo + h + 0.6, hi - h - 0.6) - y;
      const dx = wave ? Math.abs(dy) : seg;
      if (dx < 0.75) { dir = -dir; continue; }
      x += dx; y += dy;
      top.push([x, y + h]); bot.push([x, y - h]);
      dir = wave ? -dir : (b.r() < 0.6 ? -dir : dir);
    }
    if (o.coin) b.coin(x - (wave ? 1 : 2), y);
    top.push([x + mouth, hi]); bot.push([x + mouth, lo]);
    b.wall(top, 1, hi); b.wall(bot, -1, lo);
    b.ly = y;
    return x + mouth - x0;
  },
  // ball: alternate obstacles on floor and ceiling
  ballSeq(b, o) {
    const [lo, hi] = b.band, x0 = b.x;
    let x = b.x, side = o.first || 1;
    for (let i = 0; i < (o.n || 6); i++) {
      const len = b.int(o.run[0], o.run[1]);
      if (o.pillars && b.r() < o.pillars) {
        const ph = b.pick([2, 3]);
        if (side > 0) { b.block(x, lo, len, ph); b.spikes(x, lo + ph, len); }
        else { b.block(x, hi - ph, len, ph); b.spikes(x, hi - ph - 1, len, 'd'); }
      } else if (side > 0) b.spikes(x, lo, len);
      else b.spikes(x, hi - 1, len, 'd');
      if (o.coinAt === i) b.coin(x + len + 1.5, side > 0 ? hi - 0.8 : lo + 0.8);
      x += len + Math.max(2, b.rnd(o.gap[0], o.gap[1]) * b.sp);
      side = -side;
    }
    return x - x0;
  },
  // ufo: long floor spike runs with blocks hanging from the ceiling to stay under
  ufoRun(b, o) {
    const [lo, hi] = b.band, x0 = b.x;
    let x = b.x;
    for (let i = 0; i < (o.n || 3); i++) {
      const len = b.int(o.run[0], o.run[1]);
      b.spikes(x, lo, len);
      const ch = b.pick(o.ceil || [3, 4, 5]);
      b.block(x + 1, hi - ch, len - 2, ch); b.spikes(x + 1, hi - ch - 1, len - 2, 'd', true);
      if (o.coinAt === i) b.coin(x + len / 2, hi - ch - 2.2);
      x += len + Math.max(3, (o.space || 0.6) * b.sp);
    }
    return x - x0;
  },
  // wave: spiky corridor (spikes on floor and ceiling of a narrowed band)
  waveSpikes(b, o) {
    const [lo, hi] = b.band, len = Math.round(o.len || 12);
    for (let i = 0; i < len; i++) { b.spike(b.x + i, lo, 'u', true); b.spike(b.x + i, hi - 1, 'd', true); }
    return len;
  },
};

// ---------------------------------------------------------------- levels
const PAL = {
  blue: { sky: '#1d33ff', ground: '#1a2bd8', neon: '#7fe9ff', accent: '#ffe14d' },
  navy: { sky: '#2a1580', ground: '#1f1066', neon: '#ff7ce6', accent: '#7fe9ff' },
  magenta: { sky: '#d214e6', ground: '#9d10b0', neon: '#ffa8ff', accent: '#7dff6a' },
  violet: { sky: '#6a1bd6', ground: '#4c13a0', neon: '#9dffef', accent: '#ffe14d' },
  pink: { sky: '#e6006e', ground: '#b30056', neon: '#ffb0d8', accent: '#7fe9ff' },
  red: { sky: '#d80d0d', ground: '#9e0808', neon: '#ffb86b', accent: '#ffe14d' },
  orange: { sky: '#f06d00', ground: '#b84f00', neon: '#ffe27a', accent: '#7fe9ff' },
  yellow: { sky: '#c9c200', ground: '#8f8a00', neon: '#7af6ff', accent: '#ff5ec4' },
  green: { sky: '#12b81a', ground: '#0c8a12', neon: '#fff27a', accent: '#ffe14d' },
  teal: { sky: '#00a8b8', ground: '#007a87', neon: '#ffe27a', accent: '#ff7ce6' },
  purple: { sky: '#5b16b8', ground: '#3d0d80', neon: '#7dfcff', accent: '#ff5ec4' },
  black: { sky: '#1a1030', ground: '#120a22', neon: '#ff3b5c', accent: '#ffb02e' },
  crimson: { sky: '#5a0718', ground: '#3a0410', neon: '#ffdf6e', accent: '#7fe9ff' },
};

const CUBE_EASY = ['s1', 's1', 's2', 's2', 'blk', 'blkS', 'step', 'ledge', 'pit', 'sm3'];
const CUBE_MID = ['s2', 's3', 'blkS', 'tower', 'ledge', 'stairs', 'pit', 'pillars', 'sS', 'saw'];
const CUBE_ORB = ['orbPit', 'padUp', 'padWall', 'pinkPad', 'pinkOrbs'];
const CUBE_HARD = ['s3', 'tower', 'pitHigh', 'pillars', 'stairs', 'saw2', 'orbPit2', 'pinkOrbs', 'sS'];

const LEVELS = [
  {
    id: 1, name: 'Primer Pulso', diff: 'easy', stars: 1, speed: 1, seed: 101, pal: 'blue',
    music: { bpm: 128, root: 50, scale: 'minor', prog: [0, 5, 3, 4], seed: 1 },
    build(b) {
      b.lead(16);
      b.p('s1'); b.gap([0.9, 1.1]); b.p('s1'); b.gap([0.9, 1.1]); b.p('s2'); b.gap();
      b.run(['s1', 's2', 'blk'], 3);
      b.p('coinPit'); b.gap();
      b.run(CUBE_EASY, 7);
      b.to('ship', { pal: PAL.navy }); b.p('gates', { n: 7, gap: [4.5, 5], space: 0.7, slope: 0.3, coinAt: 4 });
      b.to('cube', { pal: PAL.blue }); b.run(CUBE_EASY, 6);
      b.p('coinOrb'); b.run(CUBE_EASY, 7);
      b.end();
    },
  },
  {
    id: 2, name: 'Ritmo de Vuelta', diff: 'easy', stars: 2, speed: 1, seed: 202, pal: 'magenta',
    music: { bpm: 134, root: 52, scale: 'minor', prog: [0, 3, 4, 2], seed: 2 },
    build(b) {
      b.lead(16);
      b.run(['s1', 's2', 'blk'], 3);
      b.p('padUp'); b.gap(); b.run(CUBE_EASY, 4);
      b.p('orbPit'); b.gap(); b.p('coinPad'); b.gap();
      b.run(CUBE_EASY.concat(['padWall', 'orbPit', 'padUp']), 8);
      b.p('coinPit'); b.gap();
      b.to('ship', { pal: PAL.violet }); b.p('gates', { n: 7, gap: [4.2, 4.8], space: 0.65, slope: 0.35 });
      b.to('cube', { pal: PAL.magenta }); b.run(CUBE_EASY.concat(CUBE_ORB), 9);
      b.p('coinOrb'); b.run(CUBE_EASY.concat(CUBE_ORB), 6);
      b.end();
    },
  },
  {
    id: 3, name: 'Espectro Polar', diff: 'normal', stars: 3, speed: 1, seed: 303, pal: 'pink',
    gap: [0.45, 0.7],
    music: { bpm: 140, root: 49, scale: 'minor', prog: [0, 4, 5, 3], seed: 3 },
    build(b) {
      b.lead(16);
      b.run(['s2', 's3', 'blkS'], 3);
      b.run(CUBE_MID.concat(CUBE_ORB), 8);
      b.p('coinPit'); b.gap();
      b.to('ship', { pal: PAL.violet });
      b.p('gates', { n: 9, gap: [3.6, 4.2], space: 0.55, slope: 0.45, spikes: 0.3, coinAt: 6 });
      b.to('cube', { pal: PAL.pink }); b.run(CUBE_MID, 5);
      b.p('gravUp'); b.gap(); b.run(CUBE_MID.concat(CUBE_ORB), 6);
      b.p('coinOrb'); b.run(CUBE_MID.concat(CUBE_ORB), 6);
      b.end();
    },
  },
  {
    id: 4, name: 'Tierra Seca', diff: 'normal', stars: 4, speed: 1, seed: 404, pal: 'red',
    gap: [0.45, 0.65],
    music: { bpm: 145, root: 45, scale: 'phrygian', prog: [0, 1, 0, 6], seed: 4 },
    build(b) {
      b.lead(16);
      b.run(CUBE_MID, 4); b.p('gravUp'); b.gap();
      b.run(CUBE_MID.concat(['gravUp', 'orbPit', 'padUp']), 6);
      b.p('coinOrb');
      b.to('ship', { pal: PAL.crimson });
      b.p('gates', { n: 6, gap: [3.4, 4], space: 0.5, slope: 0.45, spikes: 0.4 });
      b.p('saws', { n: 4, space: 0.6 });
      b.p('gates', { n: 5, gap: [3.4, 4], space: 0.5, slope: 0.5, coinAt: 3 });
      b.to('cube', { pal: PAL.red });
      b.speed(2); b.run(CUBE_MID, 7);
      b.p('blueOrb'); b.gap(); b.p('coinPit'); b.gap();
      b.run(CUBE_MID.concat(CUBE_ORB), 7);
      b.end();
    },
  },
  {
    id: 5, name: 'Base Naranja', diff: 'hard', stars: 5, speed: 1, seed: 505, pal: 'orange',
    gap: [0.4, 0.6],
    music: { bpm: 150, root: 47, scale: 'dorian', prog: [0, 3, 6, 4], seed: 5 },
    build(b) {
      b.lead(16);
      b.run(CUBE_MID.concat(CUBE_ORB), 7);
      b.to('ball', { pal: PAL.red });
      b.p('ballSeq', { n: 8, run: [2, 4], gap: [0.75, 1], coinAt: 5 });
      b.to('cube', { pal: PAL.orange });
      b.speed(2); b.run(CUBE_MID.concat(['gravUp', 'blueOrb']), 7);
      b.p('coinOrb');
      b.to('ship', { pal: PAL.crimson });
      b.p('gates', { n: 10, gap: [3.2, 3.8], space: 0.45, slope: 0.5, spikes: 0.4 });
      b.to('ball', { pal: PAL.red });
      b.p('ballSeq', { n: 8, run: [2, 4], gap: [0.65, 0.9], pillars: 0.4 });
      b.to('cube', { pal: PAL.orange }); b.run(CUBE_MID, 4); b.p('coinPit'); b.gap();
      b.run(CUBE_HARD, 5);
      b.end();
    },
  },
  {
    id: 6, name: 'No Me Sueltes', diff: 'hard', stars: 6, speed: 2, seed: 606, pal: 'yellow',
    gap: [0.38, 0.55],
    music: { bpm: 156, root: 48, scale: 'minor', prog: [0, 5, 6, 4], seed: 6 },
    build(b) {
      b.lead(18);
      b.run(CUBE_MID.concat(CUBE_ORB), 8);
      b.to('ship', { pal: PAL.orange });
      b.p('gates', { n: 8, gap: [3, 3.6], space: 0.42, slope: 0.55, spikes: 0.5, coinAt: 5 });
      b.p('tunnel', { len: 34, h: 1.9, seg: [3, 6], slope: 0.4 });
      b.to('ball', { pal: PAL.red });
      b.p('ballSeq', { n: 10, run: [2, 5], gap: [0.6, 0.85], pillars: 0.4 });
      b.grav(-1);
      b.p('ballSeq', { n: 4, run: [2, 4], gap: [0.6, 0.85], first: -1 });
      b.grav(1);
      b.to('cube', { pal: PAL.yellow }); b.p('coinOrb');
      b.run(CUBE_HARD, 8);
      b.p('coinPit'); b.gap();
      b.run(CUBE_HARD.concat(CUBE_ORB), 6);
      b.end();
    },
  },
  {
    id: 7, name: 'Saltarín', diff: 'harder', stars: 7, speed: 2, seed: 707, pal: 'green',
    gap: [0.36, 0.52],
    music: { bpm: 160, root: 50, scale: 'dorian', prog: [0, 4, 3, 5], seed: 7 },
    build(b) {
      b.lead(18);
      b.run(CUBE_HARD, 6);
      b.to('ufo', { pal: PAL.teal });
      b.p('ufoRun', { n: 3, run: [7, 11], space: 0.6, coinAt: 1 });
      b.p('gates', { n: 7, gap: [3.6, 4.2], space: 0.55, slope: 0.4 });
      b.to('cube', { pal: PAL.green }); b.run(CUBE_HARD.concat(CUBE_ORB), 7);
      b.to('ball', { pal: PAL.teal });
      b.p('ballSeq', { n: 10, run: [2, 4], gap: [0.55, 0.8], pillars: 0.5 });
      b.to('ufo', { pal: PAL.navy });
      b.p('gates', { n: 8, gap: [3.4, 4], space: 0.5, slope: 0.5, spikes: 0.4, coinAt: 5 });
      b.to('cube', { pal: PAL.green }); b.p('coinPit'); b.gap();
      b.run(CUBE_HARD, 9);
      b.end();
    },
  },
  {
    id: 8, name: 'Reloj de Arena', diff: 'harder', stars: 8, speed: 2, seed: 808, pal: 'teal',
    gap: [0.34, 0.5],
    music: { bpm: 165, root: 46, scale: 'harmonic', prog: [0, 5, 3, 4], seed: 8 },
    build(b) {
      b.lead(18);
      b.run(CUBE_HARD, 6); b.p('coinOrb');
      b.to('ship', { pal: PAL.navy });
      b.p('tunnel', { len: 40, h: 1.7, seg: [3, 5], slope: 0.45 });
      b.p('gates', { n: 6, gap: [2.8, 3.3], space: 0.4, slope: 0.55, spikes: 0.5 });
      b.to('ball', { pal: PAL.teal }); b.speed(3);
      b.p('ballSeq', { n: 10, run: [2, 4], gap: [0.5, 0.75], pillars: 0.4, coinAt: 7 });
      b.to('ufo', { pal: PAL.purple });
      b.p('ufoRun', { n: 3, run: [8, 12], space: 0.55 });
      b.to('cube', { pal: PAL.teal });
      b.run(CUBE_HARD.concat(['gravUp', 'blueOrb']), 8);
      b.to('ship', { pal: PAL.navy });
      b.p('gates', { n: 8, gap: [2.8, 3.2], space: 0.4, slope: 0.6, spikes: 0.5, coinAt: 4 });
      b.to('cube', { pal: PAL.teal }); b.run(CUBE_HARD, 6);
      b.end();
    },
  },
  {
    id: 9, name: 'Onda Cero', diff: 'insane', stars: 9, speed: 2, seed: 909, pal: 'purple',
    gap: [0.34, 0.48],
    music: { bpm: 170, root: 45, scale: 'minor', prog: [0, 6, 5, 4], seed: 9 },
    build(b) {
      b.lead(18);
      b.run(CUBE_HARD, 6);
      b.to('wave', { pal: PAL.violet });
      b.p('tunnel', { len: 40, h: 1.6, seg: [2, 4], coin: true });
      b.to('cube', { pal: PAL.purple }); b.run(CUBE_HARD.concat(CUBE_ORB), 6);
      b.to('ship', { pal: PAL.navy });
      b.p('gates', { n: 8, gap: [2.7, 3.2], space: 0.4, slope: 0.6, spikes: 0.5, coinAt: 3 });
      b.to('wave', { pal: PAL.violet }); b.speed(3);
      b.p('tunnel', { len: 46, h: 1.5, seg: [1.5, 3.5] });
      b.to('ball', { pal: PAL.purple });
      b.p('ballSeq', { n: 10, run: [2, 4], gap: [0.5, 0.7], pillars: 0.5 });
      b.to('ufo', { pal: PAL.navy });
      b.p('gates', { n: 7, gap: [3.2, 3.8], space: 0.5, slope: 0.5, spikes: 0.5 });
      b.to('cube', { pal: PAL.purple }); b.speed(2); b.p('coinPit'); b.gap();
      b.run(CUBE_HARD, 8);
      b.end();
    },
  },
  {
    id: 10, name: 'Núcleo Demonio', diff: 'demon', stars: 10, speed: 2, seed: 1010, pal: 'black',
    gap: [0.32, 0.45],
    music: { bpm: 175, root: 44, scale: 'phrygian', prog: [0, 1, 5, 4], seed: 10 },
    build(b) {
      b.lead(18);
      b.run(CUBE_HARD, 7);
      b.to('ship', { pal: PAL.crimson }); b.speed(3);
      b.p('tunnel', { len: 46, h: 1.5, seg: [3, 5], slope: 0.5 });
      b.p('gates', { n: 6, gap: [2.6, 3], space: 0.4, slope: 0.6, spikes: 0.6, coinAt: 4 });
      b.to('wave', { pal: PAL.black });
      b.p('tunnel', { len: 50, h: 1.3, seg: [1.5, 3] });
      b.to('ball', { pal: PAL.crimson });
      b.p('ballSeq', { n: 12, run: [2, 4], gap: [0.48, 0.65], pillars: 0.5, coinAt: 8 });
      b.to('ufo', { pal: PAL.black });
      b.p('ufoRun', { n: 2, run: [9, 12], space: 0.5 });
      b.p('gates', { n: 6, gap: [3.2, 3.6], space: 0.45, slope: 0.55, spikes: 0.6 });
      b.to('cube', { pal: PAL.crimson }); b.speed(2);
      b.run(CUBE_HARD.concat(['gravUp', 'blueOrb']), 8);
      b.to('wave', { pal: PAL.black }); b.speed(3);
      b.p('tunnel', { len: 40, h: 1.25, seg: [1.5, 2.5] });
      b.to('cube', { pal: PAL.crimson }); b.speed(2); b.p('coinOrb'); b.run(CUBE_HARD, 6);
      b.end();
    },
  },
];

const cache = {};
function buildLevel(i) {
  if (cache[i]) return cache[i];
  const def = LEVELS[i], b = new Builder(def);
  b.color(PAL[def.pal]);
  def.build(b);
  return (cache[i] = b.build(def));
}

// Menu background: endless-looking run of spike groups with a scripted pilot that jumps each one centred.
function buildDemo() {
  if (cache.demo) return cache.demo;
  const def = { id: 0, name: 'demo', speed: 1, seed: 4242 }, b = new Builder(def), groups = [];
  b.color(PAL.blue);
  b.lead(24);
  while (b.x < 3000) {
    const r = b.r(), n = r < 0.2 ? 1 : r < 0.55 ? 1 : r < 0.85 ? 2 : 3;
    if (r < 0.2) b.block(b.x, 0, 1, 1); else b.spikes(b.x, 0, n);
    groups.push({ x: b.x, n });
    b.x += n + 6 + Math.floor(b.r() * 7);
  }
  b.end();
  const L = b.build(def);
  L.groups = groups; L.gi = 0;
  return (cache.demo = L);
}
function demoInput(s, L) {
  const g = L.groups, J = SPEEDS[s.spd] * 2 * PHYS.cube.jump / PHYS.cube.g;
  let i = L.gi;
  if (i > 0 && g[i - 1].x > s.x) i = 0;
  while (i < g.length && g[i].x + g[i].n < s.x - 0.5) i++;
  L.gi = i;
  if (i >= g.length) return false;
  const take = g[i].x + g[i].n / 2 - J / 2;
  return s.grounded && s.x >= take - 0.02 && s.x < take + 0.5;
}

root.NeonCore = {
  DT, SPEEDS, PHYS, SIZE, ORB_R, COIN_R, PAL, LEVELS, PAT,
  newState, clone, step, buildLevel, buildDemo, demoInput, Builder, mulberry32,
};
})(typeof window !== 'undefined' ? window : globalThis);
