// Level solver: proves every level (and every coin) can be completed with the game's own physics.
// Usage: node tools/verify.mjs [levelNumber...] [--k=8] [--phases=2] [--coins]
// Input is re-decided every K physics steps (K=4 ≈ 60 Hz). Passing at several phase offsets of a
// coarse K means no section needs a timing window much shorter than K steps.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
vm.runInThisContext(fs.readFileSync(path.join(here, '../src/core.js'), 'utf8'));
const Core = globalThis.NeonCore;

const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find(s => s.startsWith(`--${n}=`)); return a ? Number(a.split('=')[1]) : d; };
const K = opt('k', 8), PHASES = opt('phases', 2), CAP = opt('cap', 1500);
// --paths=file.json writes one winning input string per level (1 char per K steps) for replay tests
const PATHS = (args.find(s => s.startsWith('--paths=')) || '').slice(8), paths = {};
const levels = args.filter(a => /^\d+$/.test(a)).map(Number);
const list = levels.length ? levels : Core.LEVELS.map(l => l.id);

function key(s, coin) {
  let u = '';
  for (const o of s.used) if (o.maxX > s.x - 2) u += o.id + '.';
  return `${Math.round(s.y * 40)},${Math.round(s.vy * 4)},${s.gs},${s.mode},${s.spd},${+s.buffer}${+s.prevHold}${+s.grounded},${u}${coin >= 0 ? +s.coins[coin] : ''}`;
}

function solve(L, k, phase, coin) {
  const coinObj = coin >= 0 ? L.objs.find(o => o.k === 'K' && o.idx === coin) : null;
  let s0 = Core.newState(L);
  for (let i = 0; i < phase; i++) Core.step(s0, L, false);
  let frontier = [s0], x = 0, peak = 0, prev = [];
  while (frontier.length) {
    prev = frontier;
    const next = new Map();
    for (const s of frontier) {
      for (const h of [false, true]) {
        const c = Core.clone(s);
        if (PATHS) { c.par = s; c.inp = h; }
        for (let i = 0; i < k && !c.dead && !c.win; i++) Core.step(c, L, h);
        if (c.dead) continue;
        if (coinObj && !c.coins[coin] && c.x > coinObj.x + 1.5) continue;
        if (c.win) {
          const inputs = [];
          for (let n = c; n && n.par; n = n.par) inputs.push(n.inp ? 1 : 0);
          return { ok: true, peak, inputs: inputs.reverse().join('') };
        }
        const kk = key(c, coin);
        if (!next.has(kk)) next.set(kk, c);
      }
    }
    frontier = [...next.values()];
    if (frontier.length) x = frontier[0].x;
    peak = Math.max(peak, frontier.length);
    if (frontier.length > CAP) { // keep an even spread over height
      frontier.sort((a, b) => a.y - b.y || a.vy - b.vy);
      const step = frontier.length / CAP, kept = [];
      for (let i = 0; i < CAP; i++) kept.push(frontier[Math.floor(i * step)]);
      frontier = kept;
    }
  }
  if (args.includes('--debug')) {
    console.log('last frontier:');
    for (const s of prev.slice(0, 12)) console.log(`  x=${s.x.toFixed(2)} y=${s.y.toFixed(2)} vy=${s.vy.toFixed(1)} ${s.mode} gs=${s.gs} g=${s.grounded}`);
    const near = L.objs.filter(o => o.maxX > x - 3 && o.minX < x + 4);
    for (const o of near) console.log('  obj', o.k, o.kind || o.type || o.dir || '', JSON.stringify([o.x ?? o.x0 ?? o.ax, o.y ?? o.y0 ?? o.ay, o.x1 ?? o.bx, o.y1 ?? o.by].map(v => v == null ? v : +v.toFixed(2))));
  }
  return { ok: false, x, peak };
}

let fail = 0;
for (const id of list) {
  const L = Core.buildLevel(id - 1), def = Core.LEVELS[id - 1];
  const secs = estimateSeconds(L);
  const t0 = Date.now();
  const res = [];
  for (let p = 0; p < PHASES; p++) {
    const phase = Math.floor(p * K / PHASES);
    const r = solve(L, K, phase, -1);
    if (PATHS && p === 0 && r.ok) paths[id] = { k: K, inputs: r.inputs };
    res.push(r.ok ? 'ok' : `FAIL@x=${r.x.toFixed(1)}`);
    if (!r.ok) fail++;
  }
  let coinRes = '';
  if (args.includes('--coins')) {
    for (let c = 0; c < L.coinCount; c++) {
      const r = solve(L, 4, 0, c);
      coinRes += ` coin${c + 1}:${r.ok ? 'ok' : `FAIL@${r.x.toFixed(1)}`}`;
      if (!r.ok) fail++;
    }
  }
  console.log(`L${id} ${def.name.padEnd(16)} len=${L.length} ~${secs}s coins=${L.coinCount} K=${K}: ${res.join(' ')}${coinRes} (${Date.now() - t0}ms)`);
}
if (PATHS) fs.writeFileSync(PATHS, JSON.stringify(paths));
process.exit(fail ? 1 : 0);

function estimateSeconds(L) {
  // walk speed portals in x order
  const ports = L.objs.filter(o => o.k === 'G' && o.kind === 'speed').sort((a, b) => a.x - b.x);
  let x = 0, spd = L.speed, t = 0;
  for (const p of ports) { t += (p.x - x) / Core.SPEEDS[spd]; x = p.x; spd = p.val; }
  t += (L.length - x) / Core.SPEEDS[spd];
  return t.toFixed(0);
}
