// ============================================================================
// NÚCLEO DE SIMULACIÓN (determinista, sin DOM, sin audio)
// Este bloque se ejecuta igual en el navegador, en un Web Worker (bot) y en Node.
// Secciones: constantes · tiles · parseo de niveles · física · jugador ·
//            entidades e IA · jefe · flujo de nivel · bot de pruebas
// ============================================================================
'use strict';

// ------------------------------------------------------------- CONSTANTES
const TILE = 16, VIEW_W = 320, VIEW_H = 224, ROWS = 14;
const PHYS = {
  WALK_MAX: 1.5, RUN_MAX: 2.6, ACC_WALK: 0.055, ACC_RUN: 0.075, FRICTION: 0.06,
  SKID_DEC: 0.16, AIR_ACC: 0.06,
  JUMP_BASE: 4.7, JUMP_SPEED_K: 0.2, G_HOLD: 0.18, G_RELEASE: 0.6, G_FALL: 0.34, MAX_FALL: 5.0,
  STOMP_BOUNCE: 3.6, STOMP_BOUNCE_HOLD: 5.0, COYOTE: 6, JUMP_BUFFER: 4,
  SWIM_G: 0.07, SWIM_MAXFALL: 1.6, SWIM_STROKE: 2.3, SWIM_EXIT: 4.8, SWIM_MAX: 1.3,
  SPRING: 6.2, SPRING_HOLD: 8.2,
};
const TIME_UNIT = 24;            // frames por unidad de tiempo
const SMALL_H = 14, BIG_H = 27, CROUCH_H = 15;

// ------------------------------------------------------------- TILES
const T = {
  E: 0, GROUND: 1, BRICK: 2, Q: 3, USED: 4, HARD: 5, PIPE_TL: 6, PIPE_TR: 7, PIPE_L: 8, PIPE_R: 9,
  SPIPE: 10, SPIPE_B: 11, SEMI: 12, WATER_TOP: 13, WATER: 14, LAVA_TOP: 15, LAVA: 16,
  SPIKE: 17, SPIKE_C: 18, DOOR: 19, DOORK: 20, GATE_OPEN: 21, GATE: 22, BOSSDOOR: 23,
  CHIP: 24, HIDDEN: 25, DECOPIPE: 26,
};
const SOLID = new Uint8Array(32);
[T.GROUND, T.BRICK, T.Q, T.USED, T.HARD, T.PIPE_TL, T.PIPE_TR, T.PIPE_L, T.PIPE_R, T.SPIPE, T.SPIPE_B,
  T.SPIKE, T.SPIKE_C, T.DOOR, T.DOORK, T.GATE, T.BOSSDOOR, T.DECOPIPE].forEach(t => SOLID[t] = 1);
const CHAR_TILE = {
  '#': T.GROUND, 'B': T.BRICK, '?': T.Q, 'M': T.Q, 'S': T.Q, '1': T.Q, 'H': T.HIDDEN, 'h': T.HIDDEN,
  'C': T.BRICK, 'V': T.BRICK, 'N': T.BRICK, 'X': T.HARD, '[': T.PIPE_TL, ']': T.PIPE_TR, '{': T.PIPE_L,
  '}': T.PIPE_R, '(': T.SPIPE, '-': T.SPIPE_B, 'P': T.DECOPIPE, '=': T.SEMI, '~': T.WATER_TOP, 'w': T.WATER,
  'L': T.LAVA_TOP, 'l': T.LAVA, '^': T.SPIKE, 'v': T.SPIKE_C, 'D': T.DOOR, 'd': T.DOORK, '7': T.GATE_OPEN,
  '8': T.BOSSDOOR, 'o': T.CHIP, 'z': T.LAVA_TOP, 'R': T.HARD, 'J': T.HARD, 'G': T.HARD,
};
const CHAR_CONTENT = { '?': 'chip', 'M': 'power', 'S': 'star', '1': 'life', 'H': 'life', 'h': 'chip',
  'C': 'multi', 'V': 'vine', 'N': 'power' };

// Tamaños de las cajas de colisión de las entidades
const ENT_SIZE = {
  bug: [14, 13], glitch: [14, 15], ping: [14, 12], pixel: [14, 13], firewall: [14, 15],
  chispa: [10, 10], item: [14, 15], cball: [8, 8], bball: [10, 10], wave: [12, 12],
};

// ------------------------------------------------------------- UTILIDADES
function rnd(s) { // mulberry32 con estado dentro de la simulación (clonable)
  let t = (s.rng = (s.rng + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function ev(s, type, data) { if (!s.headless) { const e = data || {}; e.type = type; s.events.push(e); } }

// ------------------------------------------------------------- PARSEO DE NIVELES
function mkEnt(s, type, x, y, extra) {
  const sz = ENT_SIZE[type] || [16, 16];
  return Object.assign({ id: s.nextId++, type, x, y, w: sz[0], h: sz[1], vx: 0, vy: 0, dir: -1,
    st: 0, t: 0, act: false, dead: false, onG: false }, extra || {});
}

function parseArea(s, name, def) {
  const rows = def.map, w = rows[0].length;
  const A = { name, theme: def.theme, w, tiles: new Uint8Array(w * ROWS), content: {}, ents: [],
    wind: def.wind || null, exit: def.exit || null, secret: !!def.secret, prog: def.prog || 0, visited: false };
  const ck = [];
  for (let y = 0; y < ROWS; y++) {
    const r = rows[y] || '';
    for (let x = 0; x < w; x++) {
      const c = r[x] || '.';
      const i = y * w + x;
      if (CHAR_TILE[c] !== undefined) A.tiles[i] = CHAR_TILE[c];
      if (CHAR_CONTENT[c]) A.content[i] = CHAR_CONTENT[c];
      const px = x * TILE, py = y * TILE, bot = (y + 1) * TILE;
      const put = (type, extra) => {
        const e = mkEnt(s, type, 0, 0, extra);
        e.x = px + (TILE - e.w) / 2; e.y = bot - e.h; A.ents.push(e); return e;
      };
      switch (c) {
        case 'b': put('bug'); break;
        case 'g': put('glitch'); break;
        case 'a': put('firewall', { helm: true }); break;
        case 'p': { const e = put('ping', { kind: 'h', baseY: py + 2, ph: x * 0.7 }); e.vx = -0.45; break; }
        case 'q': { put('ping', { kind: 'v', baseY: py + 2, ph: x * 0.7 }); break; }
        case 'x': { const e = put('pixel'); e.y = py; break; }
        case 'c': A.ents.push(mkEnt(s, 'cable', px + 16 - 6, bot, { w: 12, h: 0, cx: px + 16, baseY: bot, ext: 0 })); break;
        case 'z': A.ents.push(mkEnt(s, 'chispa', px + 3, py + 4, { baseY: py, wait: 70 + (x * 37) % 70 })); break;
        case 'T': A.ents.push(mkEnt(s, 'spring', px, py + 2, { w: 16, h: 14, comp: 0 })); break;
        case '!': ck.push(A.ents[A.ents.push(mkEnt(s, 'ck', px + 2, py - 16, { w: 12, h: 32, on: false })) - 1]); break;
        case '/': A.ents.push(mkEnt(s, 'lever', px + 2, py + 4, { w: 12, h: 12, on: false })); break;
        case 'k': A.ents.push(mkEnt(s, 'key', px + 3, py + 2, { w: 10, h: 12 })); break;
        case 'R': case 'J':
          A.ents.push(mkEnt(s, 'fbar', px, py, { cx: px + 8, cy: py + 8, n: 5, a: c === 'R' ? 0 : Math.PI, spd: c === 'R' ? 0.034 : -0.034, w: 16, h: 16 }));
          break;
        case 'G': A.ents.push(mkEnt(s, 'goal', px + 8, py - 8 * TILE, { w: 2, h: 8 * TILE, top: py - 8 * TILE, bottom: py, flagY: py - 8 * TILE + 4 })); break;
        case 'K': A.ents.push(mkEnt(s, 'castle', px, py - 5 * TILE + TILE, { w: 80, h: 80, door: px + 40, open: 0 })); break;
        case 'E': A.ents.push(mkEnt(s, 'core', px, py - 16, { w: 32, h: 32 })); break;
        case '_': case 'I': case 'f': {
          if (x > 0 && r[x - 1] === c) break;
          let n = 1; while (r[x + n] === c) n++;
          const kind = c === '_' ? 'h' : c === 'I' ? 'v' : 'f';
          A.ents.push(mkEnt(s, 'plat', px, py, { w: n * TILE, h: 8, kind, x0: px, y0: py,
            amp: kind === 'h' ? 36 : 34, per: kind === 'h' ? 200 : 180, ph: (x * 29) % 180, dx: 0, dy: 0, trig: false }));
          break;
        }
      }
    }
  }
  ck.sort((a, b) => a.x - b.x);
  return { A, ck };
}

// ------------------------------------------------------------- CREACIÓN DE LA SIMULACIÓN
function newSim(li, opts) {
  opts = opts || {};
  const lv = LEVELS[li];
  const s = {
    li, frame: 0, rng: 1234567 + li * 7919, nextId: 1, areas: {}, area: null, A: null,
    p: null, cam: { x: 0 }, camLock: null, time: lv.time, timeSub: 0,
    mode: 'play', modeT: 0, sub: 0, freeze: 0, freezeKind: '', result: null, goal: false,
    st: { lines: 0, chips: 0, lives: 3, enemies: 0, secrets: [] },
    checkpoint: opts.checkpoint == null ? -1 : opts.checkpoint, ckPos: [],
    bumps: [], multi: {}, hasKey: false, combo: 0, events: [], headless: !!opts.headless,
    prev: { l: 0, r: 0, u: 0, d: 0, j: 0, b: 0 }, inp: null, pr: {},
    bossActive: false, bossDone: false, assist: opts.assist || {}, pipeTop: 0, warp: null, deathCause: '', tallyWait: 0, bossDying: false,
  };
  if (opts.st) s.st = { lines: opts.st.lines, chips: opts.st.chips, lives: opts.st.lives, enemies: opts.st.enemies, secrets: opts.st.secrets.slice() };
  let mainCk = [];
  for (const name of Object.keys(lv.areas)) {
    const r = parseArea(s, name, lv.areas[name]);
    s.areas[name] = r.A;
    if (name === 'main') mainCk = r.ck;
  }
  mainCk.forEach((e, i) => { e.idx = i; s.ckPos.push({ area: 'main', x: e.x, y: e.y + e.h }); if (i <= s.checkpoint) e.on = true; });
  if (lv.boss) {
    const B = lv.boss, A = s.areas[B.area];
    A.ents.push(mkEnt(s, 'boss', B.spawn * TILE, 12 * TILE - 34, { w: 36, h: 34, hp: 24, phase: 1, st: 'wait', pi: 0,
      inv: 0, flash: 0, ax0: B.arenaX * TILE, ax1: (B.arenaX + B.arenaW) * TILE, act: true, balls: 0, dmgT: 0 }));
  }
  // jugador
  s.p = { x: 0, y: 0, w: 12, h: SMALL_H, vx: 0, vy: 0, dir: 1, power: 0, onG: false, coyote: 0, jbuf: 0,
    jumping: false, crouch: false, skid: false, wasSkid: false, inWater: false, climb: false, inv: 0, star: 0,
    ride: -1, fireCD: 0, oldB: 0, walkT: 0, landT: 99, hitT: 0, fireT: 0, airCap: 0, hidden: false,
    growT: 0, safeX: 0, safeY: 0, wasOnG: false, kickT: 0 };
  const pw = opts.power || 0;
  s.p.power = pw; s.p.h = pw > 0 ? BIG_H : SMALL_H;
  if (s.checkpoint >= 0 && s.ckPos[s.checkpoint]) {
    const c = s.ckPos[s.checkpoint];
    enterArea(s, c.area);
    s.p.x = c.x; s.p.y = c.y - s.p.h;
  } else {
    const st = lv.start;
    enterArea(s, st.area);
    placeAt(s, st);
  }
  s.cam.x = clamp(s.p.x + s.p.w / 2 - VIEW_W * 0.4, 0, Math.max(0, s.A.w * TILE - VIEW_W));
  s.p.safeX = s.p.x; s.p.safeY = s.p.y;
  return s;
}

function enterArea(s, name) {
  s.area = name; s.A = s.areas[name];
  if (!s.A.visited) {
    s.A.visited = true;
    if (s.A.secret) foundSecret(s, s.li + ':' + name, s.p ? s.p.x : 0, s.p ? s.p.y : 0);
  }
}

function placeAt(s, to) {
  const p = s.p;
  p.vx = 0; p.vy = 0; p.ride = -1; p.climb = false;
  if (to.mode === 'pipeUp') {
    p.x = to.x * TILE + 16 - p.w / 2; p.y = to.y * TILE + 2; s.pipeTop = to.y * TILE;
    s.mode = 'pipeOut'; s.modeT = 0;
  } else if (to.mode === 'drop') {
    p.x = to.x * TILE + 2; p.y = to.y * TILE; s.mode = 'play';
  } else {
    p.x = to.x * TILE + 2; p.y = (to.y + 1) * TILE - p.h; s.mode = 'play';
  }
}

function cloneSim(s) {
  const c = Object.assign({}, s);
  c.p = Object.assign({}, s.p);
  c.cam = { x: s.cam.x };
  c.st = Object.assign({}, s.st); c.st.secrets = s.st.secrets.slice();
  c.areas = {};
  for (const k in s.areas) {
    const a = s.areas[k];
    c.areas[k] = Object.assign({}, a, { tiles: a.tiles.slice(), content: Object.assign({}, a.content),
      ents: a.ents.map(e => Object.assign({}, e)) });
  }
  c.A = c.areas[c.area];
  c.bumps = s.bumps.map(b => Object.assign({}, b));
  c.multi = Object.assign({}, s.multi);
  c.events = [];
  c.prev = Object.assign({}, s.prev);
  c.pr = Object.assign({}, s.pr);
  return c;
}

// ------------------------------------------------------------- FÍSICA DE TILES
function tileAt(s, tx, ty) {
  const A = s.A;
  if (ty < 0 || ty >= ROWS) return T.E;
  if (tx < 0 || tx >= A.w) return T.HARD;
  return A.tiles[ty * A.w + tx];
}
function setTile(s, tx, ty, t) { s.A.tiles[ty * s.A.w + tx] = t; }
function tileAtPx(s, x, y) { return tileAt(s, Math.floor(x / TILE), Math.floor(y / TILE)); }

function moveX(s, e, dx) {
  if (dx === 0) return false;
  e.x += dx;
  const y0 = Math.floor(e.y / TILE), y1 = Math.floor((e.y + e.h - 0.01) / TILE);
  if (dx > 0) {
    const tx = Math.floor((e.x + e.w - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) if (SOLID[tileAt(s, tx, ty)]) { e.x = tx * TILE - e.w; s.hitTx = tx; s.hitTy = ty; return true; }
  } else {
    const tx = Math.floor(e.x / TILE);
    for (let ty = y0; ty <= y1; ty++) if (SOLID[tileAt(s, tx, ty)]) { e.x = (tx + 1) * TILE; s.hitTx = tx; s.hitTy = ty; return true; }
  }
  return false;
}

function moveY(s, e) {
  const oldB = e.y + e.h;
  e.y += e.vy; e.onG = false;
  const x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 0.01) / TILE);
  if (e.vy > 0) {
    const ty = Math.floor((e.y + e.h) / TILE);
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(s, tx, ty);
      if (SOLID[t] || (t === T.SEMI && oldB <= ty * TILE + 0.01)) { e.y = ty * TILE - e.h; e.vy = 0; e.onG = true; return 1; }
    }
  } else if (e.vy < 0) {
    const ty = Math.floor(e.y / TILE);
    for (let tx = x0; tx <= x1; tx++) if (SOLID[tileAt(s, tx, ty)]) { e.y = (ty + 1) * TILE; e.vy = 0; return -1; }
  }
  return 0;
}

function isWater(t) { return t === T.WATER || t === T.WATER_TOP; }

// ------------------------------------------------------------- PUNTUACIÓN (líneas de código)
function addLines(s, n, cat, x, y, extra) {
  s.st.lines += n;
  const d = { n, cat, x, y }; if (extra) Object.assign(d, extra);
  ev(s, 'score', d);
}
function addLife(s, x, y) { s.st.lives++; ev(s, 'oneup', { x, y }); }
function addChip(s, x, y, pop) {
  s.st.chips++; s.st.lines += 10;
  ev(s, 'chip', { x, y, pop: !!pop });
  if (s.st.chips >= 100) { s.st.chips -= 100; addLife(s, x, y); }
}
function foundSecret(s, id, x, y) {
  if (s.st.secrets.indexOf(id) >= 0) return;
  s.st.secrets.push(id);
  ev(s, 'secret', { x, y });
  addLines(s, 200, 'secret', x, y - 10);
}
const STOMP_SCORES = [10, 20, 40, 80, 160, 320, 640];
function comboScore(s, x, y) {
  const i = s.combo - 1;
  if (i >= STOMP_SCORES.length) addLife(s, x, y);
  else addLines(s, STOMP_SCORES[i], 'combo', x, y, { combo: i });
}

// ------------------------------------------------------------- ENTRADA
function mkInp(o) { return { l: o.l ? 1 : 0, r: o.r ? 1 : 0, u: o.u ? 1 : 0, d: o.d ? 1 : 0, j: o.j ? 1 : 0, b: o.b ? 1 : 0 }; }

// ------------------------------------------------------------- PASO PRINCIPAL
function stepSim(s, inp) {
  s.events.length = 0;
  s.inp = inp;
  const pv = s.prev;
  s.pr = { j: inp.j && !pv.j, b: inp.b && !pv.b, d: inp.d && !pv.d, u: inp.u && !pv.u };
  s.frame++;
  if (!s.result) {
    if (s.freeze > 0) { s.freeze--; s.p.growT++; }
    else {
      switch (s.mode) {
        case 'play': stepPlay(s); break;
        case 'death': stepDeath(s); break;
        case 'pipeIn': stepPipeIn(s); break;
        case 'pipeOut': stepPipeOut(s); break;
        case 'flag': stepFlag(s); break;
        case 'world': stepWorld(s); break;
      }
    }
  }
  s.prev = inp;
}

function stepPlay(s) {
  const ents = s.A.ents;
  // 1) plataformas
  for (let i = 0; i < ents.length; i++) { const e = ents[i]; if (e.type === 'plat' && !e.dead) updatePlat(s, e); }
  // 2) arrastre del jugador sobre la plataforma
  const p = s.p;
  if (p.ride >= 0) {
    const e = findEnt(s, p.ride);
    if (e && !e.dead) { moveX(s, p, e.dx); p.y += e.dy; }
    p.ride = -1;
  }
  // 3) jugador
  updatePlayer(s);
  if (s.mode !== 'play' || s.freeze > 0) { updateCamera(s); return; }
  // 4) resto de entidades
  const E = s.A.ents;
  for (let i = 0; i < E.length; i++) {
    const e = E[i];
    if (e.dead || e.type === 'plat') continue;
    if (!e.act) { if (e.x < s.cam.x + VIEW_W + 32) e.act = true; else continue; }
    updateEnt(s, e);
    if (s.mode !== 'play') break;
  }
  enemyCollisions(s);
  // purga
  const cx = s.cam.x;
  for (const e of s.A.ents) {
    if (e.dead) continue;
    if (KEEP[e.type]) continue;
    if (e.x + e.w < cx - 64 || e.y > ROWS * TILE + 48) e.dead = true;
  }
  if (s.frame % 30 === 0 || s.A.ents.some(e => e.dead && e.type !== 'plat')) s.A.ents = s.A.ents.filter(e => !e.dead);
  // bloques golpeados
  for (const b of s.bumps) b.t++;
  if (s.bumps.length && s.bumps[0].t > 12) s.bumps = s.bumps.filter(b => b.t <= 12);
  // multi-chip caducado
  updateCamera(s);
  updateTimer(s);
}
const KEEP = { plat: 1, fbar: 1, goal: 1, castle: 1, core: 1, ck: 1, lever: 1, spring: 1, boss: 1, vine: 1, key: 1 };

function findEnt(s, id) { const E = s.A.ents; for (let i = 0; i < E.length; i++) if (E[i].id === id) return E[i]; return null; }

function updateCamera(s) {
  const maxC = Math.max(0, s.A.w * TILE - VIEW_W);
  if (s.camLock !== null) {
    if (s.cam.x < s.camLock) s.cam.x = Math.min(s.camLock, s.cam.x + 3);
  } else {
    const p = s.p, pc = p.x + p.w / 2;
    const target = pc - VIEW_W * 0.42;
    if (target > s.cam.x) s.cam.x += (target - s.cam.x) * 0.2;
    if (pc - s.cam.x > VIEW_W * 0.56) s.cam.x = pc - VIEW_W * 0.56;
  }
  s.cam.x = clamp(s.cam.x, 0, maxC);
}

function updateTimer(s) {
  if (s.mode !== 'play') return;
  if (++s.timeSub >= TIME_UNIT) {
    s.timeSub = 0;
    if (s.time > 0) s.time--;
    if (s.time === 99) ev(s, 'hurry');
    if (s.time <= 0) { if (s.assist.inv) s.time = 1; else killPlayer(s, 'time'); }
  }
}

// ------------------------------------------------------------- JUGADOR
function setH(p, h) { const b = p.y + p.h; p.h = h; p.y = b - h; }

function boxFree(s, x, y, w, h) {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (SOLID[tileAt(s, tx, ty)]) return false;
  return true;
}

function updatePlayer(s) {
  const p = s.p, I = s.inp, P = PHYS;
  p.oldB = p.y + p.h;
  if (p.inv > 0) p.inv--;
  if (p.star > 0) { p.star--; if (p.star === 0) ev(s, 'starEnd'); }
  if (p.fireCD > 0) p.fireCD--;
  if (p.hitT > 0) p.hitT--;
  if (p.fireT > 0) p.fireT--;
  if (p.kickT > 0) p.kickT--;
  p.landT++;
  p.wasOnG = p.onG;

  if (p.climb) { climbUpdate(s); return; }

  // agua
  const wasWater = p.inWater;
  p.inWater = isWater(tileAtPx(s, p.x + p.w / 2, p.y + p.h * 0.6));
  if (p.inWater !== wasWater) ev(s, 'splash', { x: p.x + p.w / 2, y: p.y + p.h, out: !p.inWater });

  const run = !!I.b;
  // agacharse
  if (p.power > 0 && p.onG && I.d && !p.inWater) {
    if (!p.crouch) { p.crouch = true; setH(p, CROUCH_H); }
  } else if (p.crouch && !I.d && p.onG) {
    if (boxFree(s, p.x, p.y + p.h - BIG_H, p.w, BIG_H)) { p.crouch = false; setH(p, BIG_H); }
  }

  // movimiento horizontal con aceleración, fricción y derrape
  let ax = (I.r ? 1 : 0) - (I.l ? 1 : 0);
  if (p.crouch && p.onG) ax = 0;
  const maxV = p.inWater ? P.SWIM_MAX : (run ? P.RUN_MAX : P.WALK_MAX);
  p.skid = false;
  if (p.onG) {
    if (ax !== 0) {
      if (p.vx * ax < 0) {
        p.vx += ax * P.SKID_DEC;
        if (Math.abs(p.vx) > 0.6) { p.skid = true; if (!p.wasSkid) ev(s, 'skid', { x: p.x + p.w / 2, y: p.y + p.h }); }
        if (p.vx * ax > 0) p.vx = ax * 0.2;
      } else {
        const acc = run ? P.ACC_RUN : P.ACC_WALK;
        const sp = Math.abs(p.vx);
        if (sp < maxV) p.vx = ax * Math.min(maxV, sp + acc);
        else p.vx = ax * Math.max(maxV, sp - P.FRICTION);
      }
      p.dir = ax;
    } else {
      const f = p.crouch ? 0.04 : P.FRICTION;
      if (Math.abs(p.vx) <= f) p.vx = 0; else p.vx -= Math.sign(p.vx) * f;
    }
    p.airCap = Math.abs(p.vx);
  } else if (ax !== 0) {
    const cap = Math.max(maxV, p.airCap);
    p.vx += ax * (p.inWater ? 0.05 : P.AIR_ACC);
    if (Math.abs(p.vx) > cap) p.vx = Math.sign(p.vx) * cap;
    p.dir = ax;
  } else if (p.inWater) p.vx *= 0.97;
  p.wasSkid = p.skid;

  // salto: coyote time + jump buffering + altura variable
  if (s.pr.j) p.jbuf = P.JUMP_BUFFER;
  if (p.onG) p.coyote = P.COYOTE;
  if (p.inWater) {
    if (s.pr.j) {
      const headT = tileAtPx(s, p.x + p.w / 2, p.y - 2);
      if (!isWater(headT) && !SOLID[headT]) { p.vy = -P.SWIM_EXIT; p.jumping = true; ev(s, 'jump', { v: 4.8, big: p.power > 0 }); }
      else { p.vy = -P.SWIM_STROKE; ev(s, 'swim', { x: p.x + p.w / 2, y: p.y }); }
      p.jbuf = 0;
    }
  } else if (p.jbuf > 0 && (p.onG || p.coyote > 0)) {
    p.vy = -(P.JUMP_BASE + P.JUMP_SPEED_K * Math.abs(p.vx));
    p.jumping = true; p.onG = false; p.coyote = 0; p.jbuf = 0; p.airCap = Math.abs(p.vx);
    ev(s, 'jump', { v: -p.vy, big: p.power > 0 });
  }
  if (p.jbuf > 0) p.jbuf--;
  if (!I.j) p.jumping = false;
  if (p.inWater) p.vy = Math.min(p.vy + P.SWIM_G, P.SWIM_MAXFALL);
  else {
    const g = p.vy < 0 ? (p.jumping ? P.G_HOLD : P.G_RELEASE) : P.G_FALL;
    p.vy = Math.min(p.vy + g, P.MAX_FALL);
  }

  // viento ligero (1-3)
  let wind = 0;
  if (s.A.wind) for (const z of s.A.wind) {
    if (p.x > z.x0 * TILE && p.x < z.x1 * TILE) wind = -z.s * Math.max(0, Math.sin(s.frame * 0.013));
  }
  s.windNow = wind;

  // desplazamiento y colisiones
  const preX = p.x;
  if (moveX(s, p, p.vx + wind)) {
    const ht = tileAt(s, s.hitTx, s.hitTy);
    if (ht === T.DOORK && s.hasKey) openDoors(s, T.DOORK);
    const footTy = Math.floor((p.y + p.h - 1) / TILE);
    if (I.r && p.onG && tileAt(s, s.hitTx, footTy) === T.SPIPE) {
      const link = findLink(s, s.hitTx, footTy);
      if (link) { startPipe(s, 'right', link); return; }
    }
    if (Math.sign(p.vx) === Math.sign(p.x - preX) || p.x === preX) p.vx = 0;
  }
  if (p.x < s.cam.x) { p.x = s.cam.x; if (p.vx < 0) p.vx = 0; }
  const A = s.A;
  if (A.exit && p.x + p.w >= A.w * TILE - 1) { doWarp(s, A.exit); return; }
  if (p.x > A.w * TILE - p.w) { p.x = A.w * TILE - p.w; p.vx = 0; }

  p.onG = false;
  movePlayerY(s, p);
  if (s.mode !== 'play' || s.freeze > 0) return;
  landOnEnts(s, p);
  if (p.onG) {
    if (!p.wasOnG) { p.landT = 0; ev(s, 'land', { v: p.lastVy || 0, x: p.x + p.w / 2, y: p.y + p.h }); }
    s.combo = 0;
    p.walkT += Math.abs(p.vx);
    if (p.ride < 0 && tileAtPx(s, p.x + p.w / 2, p.y + p.h + 2) !== T.SEMI) { p.safeX = p.x; p.safeY = p.y; }
  }
  p.lastVy = p.vy;
  if (!p.onG && p.coyote > 0 && !p.wasOnG) p.coyote--;
  if (!p.onG && p.wasOnG && p.vy >= 0) p.coyote = P.COYOTE - 1;

  // tiles de interacción: chips, lava
  const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w - 0.01) / TILE);
  const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const t = tileAt(s, tx, ty);
    if (t === T.CHIP) { setTile(s, tx, ty, T.E); addChip(s, tx * TILE + 8, ty * TILE + 8, false); }
    else if ((t === T.LAVA_TOP && p.y + p.h > ty * TILE + 6) || t === T.LAVA) { hazardFall(s, 'lava'); return; }
  }
  // caída al vacío
  if (p.y > ROWS * TILE + 8) {
    if (A.exit) { doWarp(s, A.exit); return; }
    hazardFall(s, 'pit'); return;
  }
  // entrar en tubería vertical
  if (s.inp.d && p.onG) {
    const tx = Math.floor((p.x + p.w / 2) / TILE), ty = Math.floor((p.y + p.h + 2) / TILE);
    const t = tileAt(s, tx, ty);
    if (t === T.PIPE_TL || t === T.PIPE_TR) {
      const lx = t === T.PIPE_TL ? tx : tx - 1;
      const cx = lx * TILE + 16;
      if (Math.abs(p.x + p.w / 2 - cx) < 10) {
        const link = findLink(s, lx, ty);
        if (link) { p.x = cx - p.w / 2; startPipe(s, 'down', link); return; }
      }
    }
  }
  // disparo de bolas de código
  if (s.pr.b && p.power === 2 && !p.crouch) {
    let n = 0; for (const e of s.A.ents) if (e.type === 'cball' && !e.dead) n++;
    if (n < 2) {
      const e = mkEnt(s, 'cball', p.dir > 0 ? p.x + p.w : p.x - 8, p.y + 4, { vx: 3.3 * p.dir, vy: 1.2, act: true });
      s.A.ents.push(e); p.fireT = 10; ev(s, 'fire', { x: e.x, y: e.y });
    }
  }
}

function movePlayerY(s, p) {
  const dy = p.vy, prevTop = p.y;
  p.y += dy;
  const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w - 0.01) / TILE);
  if (dy > 0) {
    const ty = Math.floor((p.y + p.h) / TILE);
    let landed = false, spike = false;
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(s, tx, ty);
      if (SOLID[t] || (t === T.SEMI && p.oldB <= ty * TILE + 0.01)) { landed = true; if (t === T.SPIKE) spike = true; }
    }
    if (landed) {
      p.y = ty * TILE - p.h; p.lastVy = p.vy; p.vy = 0; p.onG = true; p.jumping = false;
      if (spike) { hurtPlayer(s); if (s.mode === 'play') { p.vy = -4.2; p.onG = false; } }
    }
  } else if (dy < 0) {
    const ty = Math.floor(p.y / TILE);
    const hits = [];
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(s, tx, ty);
      if (SOLID[t] || (t === T.HIDDEN && prevTop >= (ty + 1) * TILE - 0.5)) hits.push(tx);
    }
    if (!hits.length) return;
    // corner correction: si sólo rozamos la esquina, desplazamos al jugador
    if (hits.length === 1 && x0 !== x1) {
      const tx = hits[0];
      if (tx === x0 && (tx + 1) * TILE - p.x <= 5) { p.x = (tx + 1) * TILE; return; }
      if (tx === x1 && p.x + p.w - tx * TILE <= 5) { p.x = tx * TILE - p.w; return; }
    }
    const pc = p.x + p.w / 2;
    let best = hits[0], bd = 1e9;
    for (const tx of hits) { const d = Math.abs(tx * TILE + 8 - pc); if (d < bd) { bd = d; best = tx; } }
    p.y = (ty + 1) * TILE; p.vy = 0.5; p.jumping = false;
    hitBlock(s, best, ty);
  }
}

function landOnEnts(s, p) {
  if (p.vy < 0 || p.onG) return;
  for (const e of s.A.ents) {
    if (e.dead) continue;
    if (e.type !== 'plat' && e.type !== 'spring') continue;
    if (p.x + p.w <= e.x || p.x >= e.x + e.w) continue;
    const top = e.y;
    const tol = Math.abs(e.dy || 0) + 2;
    if (p.oldB <= top + tol && p.y + p.h >= top) {
      if (e.type === 'spring') {
        p.y = top - p.h; p.vy = -(s.inp.j ? PHYS.SPRING_HOLD : PHYS.SPRING); p.jumping = !!s.inp.j;
        p.onG = false; e.comp = 12; ev(s, 'spring', { x: e.x + 8, y: top }); s.combo = 0;
        return;
      }
      p.y = top - p.h; p.vy = 0; p.onG = true; p.jumping = false; p.ride = e.id;
      if (e.kind === 'f' && !e.trig) { e.trig = true; }
      return;
    }
  }
}

function climbUpdate(s) {
  const p = s.p, I = s.inp;
  const v = findEnt(s, p.climbId);
  if (!v) { p.climb = false; return; }
  p.vx = 0; p.vy = I.u ? -1.1 : I.d ? 1.1 : 0;
  p.y += p.vy;
  if (p.y < v.top) p.y = v.top;
  p.walkT += Math.abs(p.vy);
  if (p.y + p.h > v.bottom) { p.y = v.bottom - p.h; }
  if (s.pr.j || ((I.l || I.r) && !I.u)) {
    p.climb = false; p.vy = s.pr.j ? -3.5 : 0; p.vx = (I.r ? 1 : I.l ? -1 : p.dir) * 1.2; p.jumping = s.pr.j;
    p.dir = Math.sign(p.vx) || 1;
    return;
  }
  if (p.y + p.h < 4) {
    const link = linksOf(s).find(l => l.from === 'vine:' + s.area);
    if (link) doWarp(s, link.to);
  }
}

function hitBlock(s, tx, ty) {
  const A = s.A, i = ty * A.w + tx, t = A.tiles[i], p = s.p;
  p.hitT = 8;
  const bx = tx * TILE + 8, by = ty * TILE;
  if (t === T.HIDDEN) {
    A.tiles[i] = T.USED; const c = A.content[i]; delete A.content[i];
    bump(s, tx, ty); spawnContent(s, tx, ty, c);
    foundSecret(s, s.li + ':' + s.area + ':' + tx + ',' + ty, bx, by);
  } else if (t === T.Q) {
    const c = A.content[i]; delete A.content[i];
    A.tiles[i] = T.USED; bump(s, tx, ty); spawnContent(s, tx, ty, c);
    addLines(s, 50, 'block', bx, by - 8);
  } else if (t === T.BRICK) {
    const c = A.content[i];
    if (c === 'multi') {
      let m = s.multi[i];
      if (!m) m = s.multi[i] = { n: 0, f: s.frame };
      m.n++;
      bump(s, tx, ty); addChip(s, bx, by, true);
      if (m.n >= 10 || s.frame - m.f > 300) { A.tiles[i] = T.USED; delete A.content[i]; }
    } else if (c) {
      delete A.content[i]; A.tiles[i] = T.USED; bump(s, tx, ty); spawnContent(s, tx, ty, c);
      addLines(s, 50, 'block', bx, by - 8);
    } else if (p.power > 0) {
      A.tiles[i] = T.E; bumpEffects(s, tx, ty);
      ev(s, 'break', { tx, ty, theme: A.theme });
      addLines(s, 10, 'block', bx, by);
    } else { bump(s, tx, ty); ev(s, 'bumpBrick', { x: bx, y: by }); }
  } else {
    ev(s, 'thud', { x: bx, y: by });
  }
}

function bump(s, tx, ty) {
  s.bumps.push({ tx, ty, t: 0, area: s.area });
  ev(s, 'bump', { x: tx * TILE + 8, y: ty * TILE });
  bumpEffects(s, tx, ty);
}

function bumpEffects(s, tx, ty) {
  const x0 = tx * TILE, top = ty * TILE;
  for (const e of s.A.ents) {
    if (e.dead || !e.act) continue;
    if (e.x + e.w <= x0 || e.x >= x0 + TILE) continue;
    if (Math.abs(e.y + e.h - top) > 3) continue;
    if (ENEMY[e.type] && e.st !== 9) {
      if (e.type === 'firewall' && e.helm) { e.helm = false; e.st = 1; e.vy = -3; ev(s, 'helmOff', { x: e.x + 7, y: e.y }); addLines(s, 20, 'enemy', e.x + 7, e.y - 4); }
      else killEnemy(s, e, 'bump', Math.sign(e.x + e.w / 2 - (x0 + 8)) || 1);
    } else if (e.type === 'item' && !e.emerge) { e.vy = -3.5; e.dir = (e.x + e.w / 2 < x0 + 8) ? -1 : 1; }
  }
  if (tileAt(s, tx, ty - 1) === T.CHIP) { setTile(s, tx, ty - 1, T.E); addChip(s, x0 + 8, top - 8, true); }
}

function spawnContent(s, tx, ty, c) {
  const x = tx * TILE, y = ty * TILE;
  if (c === 'chip') { addChip(s, x + 8, y, true); return; }
  if (c === 'vine') {
    s.A.ents.push(mkEnt(s, 'vine', x + 8, y, { w: 4, h: 16, top: y, bottom: y, act: true }));
    ev(s, 'vine', { x: x + 8, y }); return;
  }
  let kind = c === 'power' ? (s.p.power === 0 ? 'mush' : 'flower') : c === 'star' ? 'star' : 'life';
  const e = mkEnt(s, 'item', x + 1, y, { kind, emerge: 16, dir: 1, act: true });
  e.y = y; s.A.ents.push(e);
  ev(s, 'powerAppear', { kind, x: x + 8, y });
}

function openDoors(s, type) {
  const A = s.A;
  for (let i = 0; i < A.tiles.length; i++) if (A.tiles[i] === type) {
    A.tiles[i] = T.E; ev(s, 'door', { tx: i % A.w, ty: Math.floor(i / A.w), kind: type });
  }
}

function findLink(s, tx, ty) {
  const key = s.area + ':' + tx + ',' + ty;
  for (const l of LEVELS[s.li].links) if (l.from === key) return l;
  return null;
}
function startPipe(s, dir, link) {
  s.mode = 'pipeIn'; s.modeT = 0; s.sub = dir === 'down' ? 0 : 1; s.warp = link.to;
  const p = s.p; p.vx = 0; p.vy = 0; p.crouch = false; if (p.power > 0) setH(p, BIG_H);
  ev(s, 'pipe', {});
}
function stepPipeIn(s) {
  const p = s.p; s.modeT++;
  if (s.sub === 0) p.y += 1; else { p.x += 1; p.walkT += 1; }
  if (s.modeT >= (s.sub === 0 ? p.h + 4 : 22)) doWarp(s, s.warp);
}
function stepPipeOut(s) {
  const p = s.p; s.modeT++;
  if (s.modeT === 1) ev(s, 'pipe', {});
  p.y -= 1;
  if (p.y + p.h <= s.pipeTop) { p.y = s.pipeTop - p.h; s.mode = 'play'; p.onG = true; }
  updateCamera(s);
}
function doWarp(s, to) {
  // guarda nada: las entidades de cada área quedan en su área
  enterArea(s, to.area);
  placeAt(s, to);
  s.cam.x = clamp(s.p.x + s.p.w / 2 - VIEW_W * 0.42, 0, Math.max(0, s.A.w * TILE - VIEW_W));
  for (const e of s.A.ents) if (e.type === 'cball') e.dead = true;
  ev(s, 'area', { area: to.area, theme: s.A.theme });
}

// ------------------------------------------------------------- DAÑO Y MUERTE
function hurtPlayer(s) {
  const p = s.p;
  if (p.inv > 0 || p.star > 0 || s.mode !== 'play') return;
  if (s.assist.inv) { p.inv = 60; ev(s, 'shieldHit', {}); return; }
  if (p.power > 0) {
    p.power = 0; p.crouch = false; setH(p, SMALL_H);
    s.freeze = 36; s.freezeKind = 'shrink'; p.growT = 0; p.inv = 130;
    ev(s, 'hurt', {});
  } else killPlayer(s, 'enemy');
}
function hazardFall(s, cause) {
  const p = s.p;
  if (s.assist.inv) {
    p.x = p.safeX; p.y = p.safeY - 2; p.vx = 0; p.vy = 0; p.inv = 120;
    if (p.x < s.cam.x) p.x = s.cam.x;
    ev(s, 'rescue', {}); return;
  }
  killPlayer(s, cause);
}
function killPlayer(s, cause) {
  if (s.mode === 'death') return;
  const p = s.p;
  s.mode = 'death'; s.modeT = 0; s.deathCause = cause;
  p.vx = 0; p.vy = 0; p.star = 0; p.climb = false;
  ev(s, 'death', { cause });
}
function stepDeath(s) {
  const p = s.p; s.modeT++;
  if (s.deathCause !== 'pit') {
    if (s.modeT === 30) p.vy = -5.2;
    if (s.modeT > 30) { p.vy += 0.22; p.y += p.vy; }
  }
  if (s.modeT >= (s.deathCause === 'pit' ? 120 : 170)) s.result = 'dead';
}

// ------------------------------------------------------------- BANDERÍN Y FINAL
function grabFlag(s, g) {
  const p = s.p;
  s.mode = 'flag'; s.modeT = 0; s.sub = 0; s.goal = true;
  p.vx = 0; p.vy = 0; p.star = 0; p.x = g.x - p.w + 3; p.dir = 1; p.crouch = false;
  const f = clamp((g.bottom - (p.y + p.h)) / (g.bottom - g.top), 0, 1);
  const tier = f > 0.85 ? 4 : f > 0.6 ? 3 : f > 0.35 ? 2 : f > 0.15 ? 1 : 0;
  addLines(s, [10, 40, 100, 200, 500][tier], 'flag', g.x + 10, p.y, { tier });
  ev(s, 'flag', { tier });
  s.flagEnt = g.id;
}
function stepFlag(s) {
  const p = s.p, g = findEnt(s, s.flagEnt);
  s.modeT++;
  if (s.sub === 0) {
    let done = true;
    if (p.y + p.h < g.bottom) { p.y = Math.min(p.y + 2, g.bottom - p.h); done = false; }
    if (g.flagY < g.bottom - 18) { g.flagY += 2; done = false; }
    if (done) { s.sub = 1; s.modeT = 0; }
  } else if (s.sub === 1) {
    if (s.modeT === 14) { p.x = g.x + 1; p.dir = -1; }
    if (s.modeT === 30) { s.sub = 2; s.modeT = 0; p.vy = -2.5; ev(s, 'clearJingle', {}); }
  } else if (s.sub === 2) {
    p.dir = 1; p.vx = 1.2; p.vy = Math.min(p.vy + 0.3, 4);
    moveX(s, p, p.vx); moveY(s, p); p.walkT += 1.2;
    const c = s.A.ents.find(e => e.type === 'castle');
    if (c && p.x + p.w / 2 >= c.door) { s.sub = 3; s.modeT = 0; p.hidden = true; ev(s, 'castleDoor', {}); }
    if (!c && s.modeT > 60) { s.sub = 3; s.modeT = 0; }
    if (p.y > ROWS * TILE) { p.hidden = true; s.sub = 3; s.modeT = 0; }
  } else if (s.sub === 3) {
    if (s.modeT > 30) tally(s, 'clear');
  }
  updateCamera(s);
}
function tally(s, res) {
  if (s.time > 0) {
    const d = Math.min(s.time, 2);
    s.time -= d; s.st.lines += 5 * d;
    if (s.modeT % 2 === 0) ev(s, 'tick', {});
    s.tallyWait = 0;
  } else if (++s.tallyWait > 70) s.result = res;
}
function stepWorld(s) {
  const p = s.p; s.modeT++;
  if (s.sub === 0) {
    p.vx = 0; p.vy = Math.min(p.vy + 0.3, 4); moveY(s, p);
    if (s.modeT % 40 === 0 && p.onG) p.vy = -3;
    if (s.modeT > 200) { s.sub = 1; s.modeT = 0; }
  } else tally(s, 'world');
}

// ------------------------------------------------------------- ENTIDADES E IA
const ENEMY = { bug: 1, glitch: 1, ping: 1, pixel: 1, firewall: 1, cable: 1, chispa: 1 };

function walker(s, e, speed, ledge) {
  e.vy = Math.min(e.vy + 0.25, 4);
  if (moveX(s, e, e.dir * speed)) e.dir = -e.dir;
  moveY(s, e);
  if (ledge && e.onG) {
    const fx = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
    const t = tileAtPx(s, fx, e.y + e.h + 2);
    if (!SOLID[t] && t !== T.SEMI) e.dir = -e.dir;
  }
}

function stompBounce(s) {
  const p = s.p;
  p.vy = s.inp.j ? -PHYS.STOMP_BOUNCE_HOLD : -PHYS.STOMP_BOUNCE;
  p.jumping = !!s.inp.j; p.onG = false;
  s.combo++;
}

// devuelve 'stomp' si el jugador cae encima, 'hurt' si choca, 'star' si lo mata con la estrella
function contact(s, e) {
  const p = s.p;
  if (s.mode !== 'play' || !overlap(p, e)) return null;
  if (p.star > 0) return 'star';
  if (p.vy > 0 && p.oldB <= e.y + Math.max(7, p.vy + 3)) return 'stomp';
  return 'hurt';
}

function killEnemy(s, e, how, dir) {
  if (e.st === 9 || e.dead) return;
  e.st = 9; e.vy = -3.2; e.vx = (dir || 1) * 0.9; e.t = 0;
  s.st.enemies++;
  ev(s, 'kill', { x: e.x + e.w / 2, y: e.y, how, etype: e.type });
}
function chainScore(s, src, x, y) {
  src.chain = (src.chain || 0) + 1;
  const i = src.chain - 1;
  if (i >= 6) addLife(s, x, y); else addLines(s, [20, 40, 80, 160, 320, 640][i], 'enemy', x, y);
}

function updateEnt(s, e) {
  if (e.st === 9 && ENEMY[e.type]) { // muerto girando
    e.t++; e.vy += 0.22; e.x += e.vx; e.y += e.vy;
    if (e.y > ROWS * TILE + 32) e.dead = true;
    return;
  }
  const p = s.p;
  switch (e.type) {
    case 'bug': {
      if (e.st === 0) {
        walker(s, e, 0.5, false); e.t++;
        const c = contact(s, e);
        if (c === 'stomp') { e.st = 1; e.t = 0; stompBounce(s); s.st.enemies++; comboScore(s, e.x + 7, e.y - 6); ev(s, 'stomp', { x: e.x + 7, y: e.y, combo: s.combo }); }
        else if (c === 'star') { killEnemy(s, e, 'star', p.dir); chainScore(s, p, e.x, e.y); }
        else if (c === 'hurt') hurtPlayer(s);
      } else if (e.st === 1) { if (++e.t > 30) e.dead = true; }
      break;
    }
    case 'glitch': updateGlitch(s, e); break;
    case 'firewall': {
      e.t++;
      if (e.st === 0) walker(s, e, 0.4, true);
      else if (e.st === 1) { e.dir = (e.x + 7 < p.x + 6) ? -1 : 1; walker(s, e, 0.9, false); }
      else if (e.st === 2) { if (++e.sq > 30) e.dead = true; break; }
      const c = contact(s, e);
      if (c === 'stomp') {
        if (e.helm) { hurtPlayer(s); if (s.mode === 'play' && p.power >= 0) { p.vy = -3; } }
        else { e.st = 2; e.sq = 0; stompBounce(s); s.st.enemies++; comboScore(s, e.x + 7, e.y - 6); ev(s, 'stomp', { x: e.x + 7, y: e.y, combo: s.combo }); }
      } else if (c === 'star') { killEnemy(s, e, 'star', p.dir); chainScore(s, p, e.x, e.y); }
      else if (c === 'hurt') hurtPlayer(s);
      break;
    }
    case 'ping': {
      e.t++;
      if (e.kind === 'h') { e.x += e.vx; e.y = e.baseY + Math.sin(e.t * 0.05 + e.ph) * 18; }
      else { e.y = e.baseY + Math.sin(e.t * 0.03 + e.ph) * 36; }
      e.dir = e.x + 7 < p.x ? 1 : -1;
      const c = contact(s, e);
      if (c === 'stomp') { killEnemy(s, e, 'stomp', p.dir); stompBounce(s); comboScore(s, e.x + 7, e.y - 6); ev(s, 'stomp', { x: e.x + 7, y: e.y, combo: s.combo }); }
      else if (c === 'star') { killEnemy(s, e, 'star', p.dir); chainScore(s, p, e.x, e.y); }
      else if (c === 'hurt') hurtPlayer(s);
      break;
    }
    case 'pixel': {
      e.t++;
      if (e.st === 0) {
        if (Math.abs(p.x + p.w / 2 - (e.x + e.w / 2)) < 34 && p.y > e.y) { e.st = 1; e.t = 0; ev(s, 'pixelShake', { x: e.x + 7, y: e.y }); }
      } else if (e.st === 1) { if (e.t > 18) { e.st = 2; e.t = 0; } }
      else if (e.st === 2) {
        e.vy = Math.min(e.vy + 0.3, 5); moveY(s, e);
        if (e.onG) { e.st = 3; e.dir = (p.x < e.x) ? -1 : 1; ev(s, 'pixelLand', { x: e.x + 7, y: e.y + e.h }); }
      } else if (e.st === 3) walker(s, e, 0.6, false);
      else if (e.st === 4) { if (++e.sq > 30) e.dead = true; break; }
      const c = contact(s, e);
      if (c === 'stomp') { e.st = 4; e.sq = 0; stompBounce(s); s.st.enemies++; comboScore(s, e.x + 7, e.y - 6); ev(s, 'stomp', { x: e.x + 7, y: e.y, combo: s.combo }); }
      else if (c === 'star') { killEnemy(s, e, 'star', p.dir); chainScore(s, p, e.x, e.y); }
      else if (c === 'hurt') hurtPlayer(s);
      break;
    }
    case 'cable': {
      const near = Math.abs(p.x + p.w / 2 - e.cx) < 30;
      e.t++;
      if (e.st === 0) { if (near) e.t = 0; else if (e.t > 90) { e.st = 1; e.t = 0; } }
      else if (e.st === 1) { e.ext = Math.min(24, e.t); if (e.t >= 24) { e.st = 2; e.t = 0; } }
      else if (e.st === 2) { if (e.t > 75) { e.st = 3; e.t = 0; } }
      else if (e.st === 3) { e.ext = Math.max(0, 24 - e.t); if (e.t >= 24) { e.st = 0; e.t = 0; } }
      e.y = e.baseY - e.ext; e.h = e.ext;
      if (e.ext > 3) { const c = contact(s, e); if (c === 'star') { killEnemy(s, e, 'star', p.dir); chainScore(s, p, e.x, e.y); } else if (c) hurtPlayer(s); }
      break;
    }
    case 'chispa': {
      e.t++;
      if (e.st === 0) { e.y = e.baseY + 8; if (e.t > e.wait) { e.st = 1; e.vy = -5.0; ev(s, 'chispa', { x: e.x + 5, y: e.baseY }); } }
      else { e.y += e.vy; e.vy += 0.15; if (e.vy > 0 && e.y > e.baseY + 4) { e.st = 0; e.t = 0; e.wait = 100; ev(s, 'lavaPlop', { x: e.x + 5, y: e.baseY }); } }
      if (e.st === 1) { const c = contact(s, e); if (c === 'hurt' || c === 'stomp') hurtPlayer(s); }
      break;
    }
    case 'item': updateItem(s, e); break;
    case 'cball': updateCball(s, e); break;
    case 'bball': {
      e.vy += 0.2; e.x += e.vx; e.y += e.vy; e.t++;
      if (e.vy > 0 && SOLID[tileAtPx(s, e.x + 5, e.y + e.h)]) { e.dead = true; ev(s, 'puff', { x: e.x + 5, y: e.y + 5, big: true }); }
      if (e.y > ROWS * TILE) e.dead = true;
      const c = contact(s, e); if (c === 'hurt' || c === 'stomp') hurtPlayer(s);
      break;
    }
    case 'wave': {
      e.t++;
      if (moveX(s, e, e.vx) || e.t > 240) { e.dead = true; ev(s, 'puff', { x: e.x + 6, y: e.y + 6 }); break; }
      const c = contact(s, e); if (c === 'hurt' || c === 'stomp') hurtPlayer(s);
      break;
    }
    case 'spring': if (e.comp > 0) e.comp--; break;
    case 'fbar': {
      e.a += e.spd;
      if (e.x > s.cam.x - 64 && e.x < s.cam.x + VIEW_W + 64 && s.mode === 'play' && p.star <= 0) {
        const ca = Math.cos(e.a), sa = Math.sin(e.a);
        for (let k = 1; k <= e.n; k++) {
          const ox = e.cx + ca * k * 8, oy = e.cy + sa * k * 8;
          if (ox + 3 > p.x + 1 && ox - 3 < p.x + p.w - 1 && oy + 3 > p.y + 2 && oy - 3 < p.y + p.h - 1) { hurtPlayer(s); break; }
        }
      }
      break;
    }
    case 'vine': {
      if (e.top > -24) e.top -= 1.2;
      e.y = e.top; e.h = e.bottom - e.top;
      if (!p.climb && s.inp.u && Math.abs(p.x + p.w / 2 - e.x) < 10 && p.y < e.bottom && p.y + p.h > e.top + 4) {
        p.climb = true; p.climbId = e.id; p.vx = 0; p.vy = 0; p.x = e.x - p.w / 2; p.crouch = false;
        if (p.power > 0) setH(p, BIG_H);
      }
      break;
    }
    case 'ck':
      if (!e.on && overlap(p, e)) {
        e.on = true; s.checkpoint = Math.max(s.checkpoint, e.idx);
        ev(s, 'checkpoint', { x: e.x + 6, y: e.y }); addLines(s, 20, 'save', e.x + 6, e.y - 6);
      }
      break;
    case 'lever':
      if (!e.on && overlap(p, e)) { e.on = true; ev(s, 'lever', { x: e.x + 6, y: e.y }); openDoors(s, T.DOOR); }
      break;
    case 'key':
      if (overlap(p, e)) { e.dead = true; s.hasKey = true; ev(s, 'key', { x: e.x + 5, y: e.y }); addLines(s, 100, 'item', e.x + 5, e.y - 6); }
      break;
    case 'goal':
      if (s.mode === 'play' && p.x + p.w >= e.x - 1 && p.x <= e.x + 1 && p.y + p.h > e.top - 4 && p.y < e.bottom) grabFlag(s, e);
      break;
    case 'core':
      if (s.mode === 'play' && overlap(p, e)) {
        s.mode = 'world'; s.modeT = 0; s.sub = 0; s.goal = true; p.vx = 0; p.star = 0;
        ev(s, 'worldJingle', {}); addLines(s, 1000, 'boss', e.x + 16, e.y - 8);
      }
      break;
    case 'boss': updateBoss(s, e); break;
  }
}

function updateGlitch(s, e) {
  const p = s.p;
  e.t++;
  if (e.st === 0) {
    walker(s, e, 0.5, true);
    const c = contact(s, e);
    if (c === 'stomp') { e.st = 1; e.t = 0; e.chain = 0; stompBounce(s); comboScore(s, e.x + 7, e.y - 6); ev(s, 'stomp', { x: e.x + 7, y: e.y, combo: s.combo }); }
    else if (c === 'star') { killEnemy(s, e, 'star', p.dir); chainScore(s, p, e.x, e.y); }
    else if (c === 'hurt') hurtPlayer(s);
  } else if (e.st === 1) { // caparazón quieto
    e.vy = Math.min(e.vy + 0.25, 4); moveY(s, e);
    if (e.t > 500) { e.st = 0; e.dir = p.x < e.x ? -1 : 1; ev(s, 'unshell', { x: e.x, y: e.y }); }
    if (p.kickT <= 0) {
      const c = contact(s, e);
      if (c === 'star') { killEnemy(s, e, 'star', p.dir); chainScore(s, p, e.x, e.y); }
      else if (c) {
        e.st = 2; e.t = 0; e.chain = 0;
        e.dir = (p.x + p.w / 2 < e.x + e.w / 2) ? 1 : -1;
        p.kickT = 14;
        if (c === 'stomp') { stompBounce(s); }
        ev(s, 'kick', { x: e.x + 7, y: e.y + 8 }); addLines(s, 10, 'enemy', e.x + 7, e.y - 6);
      }
    }
  } else if (e.st === 2) { // caparazón disparado
    e.vy = Math.min(e.vy + 0.25, 4);
    if (moveX(s, e, e.dir * 3.6)) {
      e.dir = -e.dir; ev(s, 'shellBounce', { x: e.x + 7, y: e.y + 8 });
      const ht = tileAt(s, s.hitTx, s.hitTy);
      if (ht === T.BRICK && !s.A.content[s.hitTy * s.A.w + s.hitTx] && Math.abs(e.x - s.cam.x) < VIEW_W) { /* rebota */ }
    }
    moveY(s, e);
    if (e.x > s.cam.x + VIEW_W + 80 || e.x + e.w < s.cam.x - 80) e.dead = true;
    if (p.kickT <= 0) {
      const c = contact(s, e);
      if (c === 'stomp') { e.st = 1; e.t = 0; stompBounce(s); p.kickT = 10; ev(s, 'stomp', { x: e.x + 7, y: e.y, combo: s.combo }); }
      else if (c === 'star') { killEnemy(s, e, 'star', p.dir); }
      else if (c === 'hurt') hurtPlayer(s);
    }
  }
}

function updateItem(s, e) {
  const p = s.p;
  if (e.emerge > 0) {
    e.y -= 0.5; e.emerge -= 0.5;
    if (e.emerge <= 0 && e.kind === 'star') e.vy = -3;
  } else if (e.kind === 'mush' || e.kind === 'life') {
    e.vy = Math.min(e.vy + 0.25, 4);
    if (moveX(s, e, e.dir * 1.0)) e.dir = -e.dir;
    moveY(s, e);
  } else if (e.kind === 'star') {
    e.vy = Math.min(e.vy + 0.2, 4);
    if (moveX(s, e, e.dir * 1.3)) e.dir = -e.dir;
    if (moveY(s, e) === 1) e.vy = -4.2;
  }
  e.t++;
  if (e.y > ROWS * TILE) { e.dead = true; return; }
  if (s.mode === 'play' && overlap(p, e)) {
    e.dead = true;
    const cx = e.x + 7, cy = e.y;
    if (e.kind === 'life') { addLife(s, cx, cy); addLines(s, 100, 'life', cx, cy - 8); return; }
    addLines(s, 100, 'item', cx, cy - 8);
    if (e.kind === 'star') { p.star = 600; ev(s, 'starStart', {}); ev(s, 'powerGet', { kind: 'star' }); return; }
    if (e.kind === 'mush') {
      if (p.power === 0) { p.power = 1; setH(p, BIG_H); s.freeze = 40; s.freezeKind = 'grow'; p.growT = 0; ev(s, 'grow', {}); }
      else ev(s, 'powerGet', { kind: 'mush' });
    } else if (e.kind === 'flower') {
      if (p.power === 0) { setH(p, BIG_H); s.freeze = 40; s.freezeKind = 'grow'; p.growT = 0; ev(s, 'grow', {}); }
      else ev(s, 'powerGet', { kind: 'flower' });
      p.power = 2;
    }
  }
}

function updateCball(s, e) {
  e.t++;
  if (moveX(s, e, e.vx)) { e.dead = true; ev(s, 'puff', { x: e.x + 4, y: e.y + 4 }); return; }
  e.vy = Math.min(e.vy + 0.32, 4);
  const r = moveY(s, e);
  if (r === 1) { e.vy = -2.8; ev(s, 'fireBounce', {}); }
  else if (r === -1) { e.dead = true; ev(s, 'puff', { x: e.x + 4, y: e.y + 4 }); return; }
  if (isWater(tileAtPx(s, e.x + 4, e.y + 4))) { e.dead = true; ev(s, 'puff', { x: e.x + 4, y: e.y + 4 }); return; }
  if (e.x < s.cam.x - 16 || e.x > s.cam.x + VIEW_W + 16 || e.y > ROWS * TILE) { e.dead = true; return; }
  for (const o of s.A.ents) {
    if (o.dead || !o.act || o.st === 9) continue;
    if (ENEMY[o.type] && o.type !== 'chispa' && (o.type !== 'cable' || o.ext > 3) && overlap(e, o)) {
      killEnemy(s, o, 'fire', Math.sign(e.vx)); addLines(s, 20, 'enemy', o.x + 7, o.y - 6);
      e.dead = true; ev(s, 'puff', { x: e.x + 4, y: e.y + 4 }); return;
    }
    if (o.type === 'boss' && overlap(e, o) && bossVulnerable(o)) {
      bossHit(s, o, 1, false); e.dead = true; ev(s, 'puff', { x: e.x + 4, y: e.y + 4 }); return;
    }
  }
}

function enemyCollisions(s) {
  const E = s.A.ents;
  for (let i = 0; i < E.length; i++) {
    const a = E[i];
    if (a.dead || !a.act || a.st === 9) continue;
    const aShell = a.type === 'glitch' && a.st === 2;
    const aWalk = (a.type === 'bug' && a.st === 0) || (a.type === 'glitch' && a.st === 0) || (a.type === 'firewall' && a.st < 2) || (a.type === 'pixel' && a.st === 3);
    if (!aShell && !aWalk) continue;
    for (let j = 0; j < E.length; j++) {
      if (j === i) continue;
      const b = E[j];
      if (b.dead || !b.act || b.st === 9 || !ENEMY[b.type] || b.type === 'chispa') continue;
      if (b.type === 'cable' && b.ext <= 3) continue;
      if (!overlap(a, b)) continue;
      if (aShell) {
        if (b.type === 'glitch' && b.st === 2) { killEnemy(s, a, 'shell', -a.dir); killEnemy(s, b, 'shell', a.dir); }
        else { killEnemy(s, b, 'shell', a.dir); chainScore(s, a, b.x + 7, b.y - 6); }
      } else if (j > i) {
        const bWalk = (b.type === 'bug' && b.st === 0) || (b.type === 'glitch' && b.st === 0) || (b.type === 'firewall' && b.st < 2) || (b.type === 'pixel' && b.st === 3);
        if (bWalk) {
          if (a.x < b.x) { a.dir = -1; b.dir = 1; } else { a.dir = 1; b.dir = -1; }
        }
      }
    }
  }
}

function updatePlat(s, e) {
  const ox = e.x, oy = e.y;
  if (e.kind === 'h') e.x = e.x0 + Math.sin((s.frame + e.ph) * 2 * Math.PI / e.per) * e.amp;
  else if (e.kind === 'v') e.y = e.y0 + Math.sin((s.frame + e.ph) * 2 * Math.PI / e.per) * e.amp;
  else if (e.trig) {
    e.t++;
    if (e.t === 1) ev(s, 'fallplat', { x: e.x + e.w / 2, y: e.y });
    if (e.t > 26) { e.vy = Math.min(e.vy + 0.12, 4); e.y += e.vy; }
    if (e.y > ROWS * TILE + 40) e.dead = true;
  }
  e.dx = e.x - ox; e.dy = e.y - oy;
}

// ------------------------------------------------------------- JEFE: "EL GRAN BLOATWARE"
const BOSS_PLANS = {
  1: ['walk', 'throw3', 'pause'],
  2: ['hop', 'hop', 'crouch', 'jump', 'throw2', 'pause'],
  3: ['aim', 'charge', 'stun', 'crouch', 'jump', 'throw3f', 'pause'],
};
function bossVulnerable(b) { return b.inv <= 0 && ['wait', 'intro', 'dying', 'gone', 'roar'].indexOf(b.st) < 0; }

function bossEnter(s, b, st) {
  b.st = st; b.t = 0; b.balls = 0;
  const p = s.p;
  const face = (p.x + p.w / 2 < b.x + b.w / 2) ? -1 : 1;
  switch (st) {
    case 'walk': b.dir = face; break;
    case 'hop': b.dir = face; b.vy = -3.2; b.vx = 1.1 * face; b.onG = false; break;
    case 'crouch': b.dir = face; ev(s, 'bossCrouch', {}); break;
    case 'jump': {
      b.dir = face; b.vy = -6.4; b.onG = false;
      b.vx = clamp((p.x + p.w / 2 - (b.x + b.w / 2)) / 42, -2.6, 2.6);
      ev(s, 'bossJump', {}); break;
    }
    case 'aim': b.dir = face; ev(s, 'bossAim', {}); break;
    case 'charge': b.vx = 3.4 * b.dir; ev(s, 'bossCharge', {}); break;
  }
}
function bossNext(s, b) {
  const plan = BOSS_PLANS[b.phase];
  const st = plan[b.pi % plan.length]; b.pi++;
  bossEnter(s, b, st);
}
function bossThrow(s, b, k, offs) {
  const p = s.p;
  const mx = b.x + b.w / 2 + b.dir * 14, my = b.y + 10;
  const tx = p.x + p.w / 2 + offs[k % offs.length];
  const TT = 46, g = 0.2, floor = 12 * TILE - 6;
  const vx = clamp((tx - mx) / TT, -2.6, 2.6);
  const vy = (floor - my - 0.5 * g * TT * TT) / TT;
  s.A.ents.push(mkEnt(s, 'bball', mx - 5, my - 5, { vx, vy, act: true }));
  ev(s, 'bossThrow', { x: mx, y: my });
}
function bossHit(s, b, dmg, stomp) {
  b.hp -= dmg; b.flash = 12; b.inv = stomp ? 46 : 10;
  ev(s, 'bossHit', { x: b.x + b.w / 2, y: b.y, stomp, hp: b.hp });
  addLines(s, stomp ? 100 : 20, 'boss', b.x + b.w / 2, b.y - 8);
  if (b.hp <= 0) {
    b.hp = 0; b.st = 'dying'; b.t = 0; b.vx = 0; s.bossActive = false; s.bossDying = true;
    for (const e of s.A.ents) if (e.type === 'bball' || e.type === 'wave') { e.dead = true; }
    ev(s, 'bossDying', {});
    return;
  }
  let newPhase = b.phase;
  if (b.phase === 1 && b.hp <= 16) newPhase = 2;
  else if (b.phase === 2 && b.hp <= 8) newPhase = 3;
  if (stomp) {
    b.st = 'hurt'; b.t = 0; b.vx = (s.p.x + s.p.w / 2 < b.x + b.w / 2) ? 1.2 : -1.2;
  }
  if (newPhase !== b.phase) { b.phase = newPhase; b.pi = 0; b.pendingRoar = true; }
}

function updateBoss(s, b) {
  const p = s.p;
  const floor = 12 * TILE;
  if (b.flash > 0) b.flash--;
  if (b.inv > 0) b.inv--;
  b.t++;
  if (b.st === 'wait') {
    if (p.x > b.ax0 + 2 * TILE) {
      s.bossActive = true; s.camLock = b.ax0;
      openGate(s); b.st = 'intro'; b.t = 0; b.y = -50; b.vy = 0;
      ev(s, 'bossStart', {});
    }
    return;
  }
  if (b.st === 'gone') return;
  if (b.st === 'intro') {
    if (b.y + b.h < floor) { b.vy = Math.min(b.vy + 0.3, 7); b.y += b.vy; if (b.y + b.h >= floor) { b.y = floor - b.h; ev(s, 'bossLand', { big: true }); } }
    if (b.t === 70) ev(s, 'bossRoar', {});
    if (b.t > 120) bossNext(s, b);
    return;
  }
  if (b.st === 'dying') {
    if (b.t % 8 === 0) ev(s, 'bossExplode', { x: b.x + ((b.t * 13) % b.w), y: b.y + ((b.t * 7) % b.h) });
    if (b.t > 150) {
      b.vy += 0.2; b.y += b.vy;
      if (b.t === 151) { ev(s, 'bossDead', { x: b.x + b.w / 2, y: b.y + b.h / 2 }); addLines(s, 1000, 'boss', b.x + b.w / 2, b.y); }
      if (b.y > ROWS * TILE + 20) {
        b.st = 'gone'; s.bossDone = true; s.bossActive = false; s.camLock = null;
        openDoors(s, T.BOSSDOOR);
      }
    }
    return;
  }

  // física básica
  const grounded = b.y + b.h >= floor - 0.01 && b.vy >= 0;
  b.vy = Math.min(b.vy + 0.3, 7);
  b.y += b.vy;
  let landed = false;
  if (b.y + b.h >= floor) { if (!grounded && b.vy > 1) landed = true; b.y = floor - b.h; b.vy = 0; b.onG = true; }
  b.x += b.vx;
  let wall = false;
  if (b.x < b.ax0) { b.x = b.ax0; wall = true; }
  if (b.x + b.w > b.ax1) { b.x = b.ax1 - b.w; wall = true; }

  switch (b.st) {
    case 'walk':
      if (b.t % 24 === 0) b.dir = (p.x + p.w / 2 < b.x + b.w / 2) ? -1 : 1;
      b.vx = 0.6 * b.dir;
      if (b.t > 80) { b.vx = 0; bossNext(s, b); }
      break;
    case 'throw3': b.vx = 0; if (b.t === 12 || b.t === 34 || b.t === 56) bossThrow(s, b, b.balls++, [-22, 0, 22]); if (b.t > 72) bossNext(s, b); break;
    case 'throw2': b.vx = 0; if (b.t === 10 || b.t === 34) bossThrow(s, b, b.balls++, [-10, 16]); if (b.t > 52) bossNext(s, b); break;
    case 'throw3f': b.vx = 0; if (b.t === 8 || b.t === 22 || b.t === 36) bossThrow(s, b, b.balls++, [24, -24, 0]); if (b.t > 54) bossNext(s, b); break;
    case 'pause': b.vx = 0; if (b.t > (b.phase === 1 ? 55 : b.phase === 2 ? 45 : 34)) bossNext(s, b); break;
    case 'hop': if (landed || (b.t > 8 && b.onG && b.vy === 0)) { b.vx = 0; ev(s, 'bossStep', {}); bossNext(s, b); } break;
    case 'crouch': b.vx = 0; if (b.t > (b.phase === 3 ? 20 : 30)) bossNext(s, b); break;
    case 'jump':
      if (landed || (b.t > 10 && b.onG && b.vy === 0)) {
        b.vx = 0; ev(s, 'bossLand', { big: true });
        const cx = b.x + b.w / 2;
        s.A.ents.push(mkEnt(s, 'wave', cx - 18, floor - 12, { vx: -2.2, act: true }));
        s.A.ents.push(mkEnt(s, 'wave', cx + 6, floor - 12, { vx: 2.2, act: true }));
        bossNext(s, b);
      }
      break;
    case 'aim': b.vx = 0; if (b.t % 10 === 0) b.dir = (p.x + p.w / 2 < b.x + b.w / 2) ? -1 : 1; if (b.t > 40) bossNext(s, b); break;
    case 'charge': b.vx = 3.4 * b.dir; if (wall) { b.vx = 0; ev(s, 'bossLand', { big: true }); bossNext(s, b); } break;
    case 'stun': b.vx = 0; if (b.t > 85) bossNext(s, b); break;
    case 'hurt':
      b.vx *= 0.9;
      if (b.t > 40) {
        b.vx = 0;
        if (b.pendingRoar) { b.pendingRoar = false; b.st = 'roar'; b.t = 0; b.inv = 80; ev(s, 'bossRoar', {}); }
        else bossNext(s, b);
      }
      break;
    case 'roar': b.vx = 0; if (b.t > 70) bossNext(s, b); break;
  }

  // contacto con el jugador
  if (s.mode === 'play' && overlap(p, b)) {
    const fromTop = p.vy > 0 && p.oldB <= b.y + 12;
    if (fromTop) {
      if (bossVulnerable(b)) bossHit(s, b, 4, true);
      p.vy = s.inp.j ? -6 : -5; p.jumping = !!s.inp.j; p.onG = false;
      p.vx = (p.x + p.w / 2 < b.x + b.w / 2) ? -1.8 : 1.8;
      ev(s, 'stomp', { x: p.x + 6, y: b.y, combo: 1 });
    } else if (p.star > 0) {
      if (bossVulnerable(b)) bossHit(s, b, 2, false);
    } else if (b.st !== 'hurt') hurtPlayer(s);
  }
}

function openGate(s) {
  const A = s.A;
  for (let i = 0; i < A.tiles.length; i++) if (A.tiles[i] === T.GATE_OPEN) A.tiles[i] = T.GATE;
  ev(s, 'gateClose', {});
}

// enlaces por enredadera
function linksOf(s) { return LEVELS[s.li].links; }

// ------------------------------------------------------------- BOT DE PRUEBAS
// Búsqueda en haz (beam search) sobre la simulación EXACTA del juego.
// Cada acción se mantiene `chunk` frames (>= 5): no hay entradas de precisión de 1-2 frames.
// Acciones: combinaciones normales de correr/saltar; sin técnicas avanzadas.
const BOT_ACTIONS = [
  { r: 1 }, { r: 1, b: 1 }, { r: 1, j: 1 }, { r: 1, b: 1, j: 1 }, {}, { j: 1 }, { l: 1 }, { l: 1, j: 1 }, { l: 1, b: 1 },
];
const BOT_INPUTS = BOT_ACTIONS.map(mkInp);

function botScore(s) {
  const p = s.p;
  let sc = (s.A.prog || 0) + p.x;
  const b = s.A.ents.find(e => e.type === 'boss');
  if (b) {
    sc += (24 - b.hp) * 3000;
    if (s.bossActive) sc -= Math.abs(p.x + p.w / 2 - (b.x + b.w / 2)) * 0.6 + (p.y < b.y ? -20 : 0);
  }
  if (s.bossDone) sc += 100000;
  sc += p.power * 60 - (p.inv > 0 && p.power === 0 ? 30 : 0);
  return sc;
}
function botKey(s) {
  const p = s.p;
  const b = s.bossActive ? s.A.ents.find(e => e.type === 'boss') : null;
  return s.area + '|' + Math.floor(p.x / 3) + '|' + Math.floor(p.y / 3) + '|' + p.power + '|' + Math.round(p.vx * 2) + '|' +
    Math.round(p.vy) + '|' + (b ? b.hp + ':' + Math.floor(b.x / 8) + b.st : '');
}

function botSolve(li, opt) {
  opt = Object.assign({ chunk: 6, beam: 40, power: 0, onProgress: null }, opt || {});
  const lv = LEVELS[li];
  const root = newSim(li, { headless: true, power: opt.power });
  const maxSteps = Math.ceil(lv.time * TIME_UNIT / opt.chunk) + 20;
  let beam = [{ s: root, par: null, a: -1, sc: 0 }];
  let bestX = 0, expanded = 0, died = 0;
  for (let step = 0; step < maxSteps; step++) {
    const seen = new Map();
    for (const node of beam) {
      for (let ai = 0; ai < BOT_INPUTS.length; ai++) {
        const s2 = cloneSim(node.s);
        let fail = false;
        for (let f = 0; f < opt.chunk; f++) {
          stepSim(s2, BOT_INPUTS[ai]);
          if (s2.mode === 'death' || s2.result === 'dead') { fail = true; break; }
          if (s2.goal) break;
        }
        expanded++;
        if (fail) { died++; continue; }
        const nn = { s: s2, par: node, a: ai, sc: botScore(s2) };
        if (s2.goal) { const r = botFinish(li, nn, opt, expanded); r.deathRate = +(died / expanded).toFixed(3); return r; }
        const k = botKey(s2);
        const ex = seen.get(k);
        if (!ex || ex.sc < nn.sc) seen.set(k, nn);
      }
      node.s = null; // libera memoria: sólo se guarda la cadena de acciones
    }
    if (!seen.size) return { ok: false, level: lv.id, reason: 'sin caminos vivos', bestX: Math.round(bestX / TILE), expanded };
    beam = Array.from(seen.values()).sort((a, b) => b.sc - a.sc).slice(0, opt.beam);
    const bx = beam[0].s.p.x + (beam[0].s.A.prog > 0 ? beam[0].s.A.prog : 0);
    if (bx > bestX) bestX = bx;
    if (opt.onProgress && step % 25 === 0) opt.onProgress({ level: lv.id, step, x: Math.round(beam[0].s.p.x / TILE), area: beam[0].s.area });
  }
  return { ok: false, level: lv.id, reason: 'tiempo agotado', bestX: Math.round(bestX / TILE), expanded };
}

function botFinish(li, node, opt, expanded) {
  const acts = [];
  for (let n = node; n && n.a >= 0; n = n.par) acts.push(n.a);
  acts.reverse();
  // Repetición independiente desde cero: confirma que la secuencia funciona en el juego real
  const s = newSim(li, { headless: true, power: opt.power });
  let frames = 0, jumps = 0, prevJ = 0, minHold = 1e9, run = 0, last = -1;
  for (const a of acts) {
    for (let f = 0; f < opt.chunk; f++) {
      if (s.goal) break;
      stepSim(s, BOT_INPUTS[a]); frames++;
      if (BOT_INPUTS[a].j && !prevJ) jumps++;
      prevJ = BOT_INPUTS[a].j;
    }
    if (a === last) run += opt.chunk; else { if (last >= 0) minHold = Math.min(minHold, run); run = opt.chunk; last = a; }
  }
  // segunda pasada: llegar al resultado final (banderín/núcleo) sin entradas
  let guard = 0;
  while (!s.result && guard++ < 4000) stepSim(s, BOT_INPUTS[4]);
  const ok = s.goal && (s.result === 'clear' || s.result === 'world');
  return { ok, level: LEVELS[li].id, frames, seconds: +(frames / 60).toFixed(1), jumps, actions: acts.length,
    minHoldFrames: Math.min(minHold, run), chunk: opt.chunk, lines: s.st.lines, expanded, inputs: acts };
}

// API pública del núcleo
const ClawdCore = { LEVELS, newSim, stepSim, cloneSim, mkInp, botSolve, T, TILE, VIEW_W, VIEW_H, ROWS, SOLID, PHYS };
