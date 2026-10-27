// 2D collision world on the XZ plane: oriented boxes and circles in a spatial
// hash, line-of-sight raycasts, and a grid navmesh with A* + string pulling.
import { clamp } from './util.js';

const HASH = 6;

export class Physics {
  constructor(half) {
    this.half = half;
    this.obs = [];
    this.hash = new Map();
    this.stamp = 1;
  }

  _key(ix, iz) { return (ix + 1024) * 4096 + (iz + 1024); }

  _insert(o) {
    const x0 = Math.floor(o.minX / HASH), x1 = Math.floor(o.maxX / HASH);
    const z0 = Math.floor(o.minZ / HASH), z1 = Math.floor(o.maxZ / HASH);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this._key(ix, iz);
        let cell = this.hash.get(k);
        if (!cell) this.hash.set(k, (cell = []));
        cell.push(o);
      }
    }
  }

  addBox(x, z, hw, hd, rot = 0, h = 3, tag = null) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const ex = Math.abs(c) * hw + Math.abs(s) * hd;
    const ez = Math.abs(s) * hw + Math.abs(c) * hd;
    const o = { kind: 'box', x, z, hw, hd, rot, c, s, h, tag, active: true, _s: 0,
      minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez };
    this.obs.push(o);
    this._insert(o);
    if (this.grid) this._mark(o, 1);
    return o;
  }

  addCircle(x, z, r, h = 3, tag = null) {
    const o = { kind: 'circle', x, z, r, h, tag, active: true, _s: 0,
      minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r };
    this.obs.push(o);
    this._insert(o);
    if (this.grid) this._mark(o, 1);
    return o;
  }

  remove(o) {
    if (!o || !o.active) return;
    o.active = false;
    if (this.grid) this._mark(o, -1);
  }

  query(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const st = ++this.stamp;
    const x0 = Math.floor(minX / HASH), x1 = Math.floor(maxX / HASH);
    const z0 = Math.floor(minZ / HASH), z1 = Math.floor(maxZ / HASH);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const cell = this.hash.get(this._key(ix, iz));
        if (!cell) continue;
        for (const o of cell) {
          if (o._s === st || !o.active) continue;
          o._s = st;
          if (o.maxX < minX || o.minX > maxX || o.maxZ < minZ || o.minZ > maxZ) continue;
          out.push(o);
        }
      }
    }
    return out;
  }

  // Signed-ish distance from point to obstacle surface (negative inside box).
  distTo(o, x, z) {
    if (o.kind === 'circle') return Math.hypot(x - o.x, z - o.z) - o.r;
    const dx = x - o.x, dz = z - o.z;
    const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
    const qx = Math.abs(lx) - o.hw, qz = Math.abs(lz) - o.hd;
    const ox = Math.max(qx, 0), oz = Math.max(qz, 0);
    return Math.hypot(ox, oz) + Math.min(Math.max(qx, qz), 0);
  }

  // Pushes p ({x,z}) out of every obstacle. Returns true if anything was hit.
  collide(p, r, skip) {
    let hit = false;
    const list = this._tmp || (this._tmp = []);
    for (let iter = 0; iter < 3; iter++) {
      this.query(p.x - r, p.z - r, p.x + r, p.z + r, list);
      let moved = false;
      for (const o of list) {
        if (skip && skip(o)) continue;
        if (o.kind === 'circle') {
          const dx = p.x - o.x, dz = p.z - o.z;
          const d = Math.hypot(dx, dz), m = o.r + r;
          if (d < m) {
            if (d < 1e-5) p.x += m;
            else { p.x = o.x + (dx / d) * m; p.z = o.z + (dz / d) * m; }
            hit = moved = true;
          }
        } else {
          const dx = p.x - o.x, dz = p.z - o.z;
          const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
          const cx = clamp(lx, -o.hw, o.hw), cz = clamp(lz, -o.hd, o.hd);
          const ox = lx - cx, oz = lz - cz;
          const d2 = ox * ox + oz * oz;
          if (d2 < r * r) {
            let nx, nz;
            if (d2 > 1e-10) {
              const d = Math.sqrt(d2), push = r - d;
              nx = (ox / d) * push; nz = (oz / d) * push;
            } else {
              const px = o.hw - Math.abs(lx), pz = o.hd - Math.abs(lz);
              if (px < pz) { nx = (Math.sign(lx) || 1) * (px + r); nz = 0; }
              else { nz = (Math.sign(lz) || 1) * (pz + r); nx = 0; }
            }
            p.x += nx * o.c + nz * o.s;
            p.z += -nx * o.s + nz * o.c;
            hit = moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return hit;
  }

  _segBox(o, x0, z0, x1, z1) {
    const ax = (x0 - o.x) * o.c - (z0 - o.z) * o.s, az = (x0 - o.x) * o.s + (z0 - o.z) * o.c;
    const bx = (x1 - o.x) * o.c - (z1 - o.z) * o.s, bz = (x1 - o.x) * o.s + (z1 - o.z) * o.c;
    const dx = bx - ax, dz = bz - az;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (ax < -o.hw || ax > o.hw) return 2; }
    else {
      let ta = (-o.hw - ax) / dx, tb = (o.hw - ax) / dx;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return 2;
    }
    if (Math.abs(dz) < 1e-9) { if (az < -o.hd || az > o.hd) return 2; }
    else {
      let ta = (-o.hd - az) / dz, tb = (o.hd - az) / dz;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return 2;
    }
    return t0;
  }

  _segCircle(o, x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const fx = x0 - o.x, fz = z0 - o.z;
    const a = dx * dx + dz * dz;
    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - o.r * o.r;
    if (c <= 0) return 0;
    const disc = b * b - 4 * a * c;
    if (disc < 0 || a < 1e-12) return 2;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : 2;
  }

  // Smallest hit fraction along the segment against obstacles at least minH tall (2 = clear).
  raycast(x0, z0, x1, z1, minH = 1.6, skip = null) {
    const list = this._rayTmp || (this._rayTmp = []);
    this.query(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), list);
    let best = 2;
    for (const o of list) {
      if (o.h < minH || (skip && skip(o))) continue;
      const t = o.kind === 'circle' ? this._segCircle(o, x0, z0, x1, z1) : this._segBox(o, x0, z0, x1, z1);
      if (t < best) best = t;
    }
    return best;
  }

  los(x0, z0, x1, z1, minH = 1.6, skip = null) {
    return this.raycast(x0, z0, x1, z1, minH, skip) > 1;
  }

  // ---------------- navigation grid ----------------
  buildGrid(cell = 1, inflate = 0.55) {
    this.gc = cell;
    this.inflate = inflate;
    this.gn = Math.ceil((this.half * 2) / cell);
    const N = this.gn * this.gn;
    this.grid = new Int16Array(N);
    this.extra = new Uint8Array(N);
    this.gScore = new Float32Array(N);
    this.came = new Int32Array(N);
    this.seen = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.heap = new Int32Array(N);
    this.heapF = new Float32Array(N);
    this.searchId = 0;
    for (const o of this.obs) if (o.active) this._mark(o, 1);
  }

  _mark(o, delta) {
    const inf = this.inflate, gc = this.gc, half = this.half, gn = this.gn;
    const x0 = Math.max(0, Math.floor((o.minX - inf + half) / gc));
    const x1 = Math.min(gn - 1, Math.floor((o.maxX + inf + half) / gc));
    const z0 = Math.max(0, Math.floor((o.minZ - inf + half) / gc));
    const z1 = Math.min(gn - 1, Math.floor((o.maxZ + inf + half) / gc));
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        const cx = -half + (ix + 0.5) * gc, cz = -half + (iz + 0.5) * gc;
        if (this.distTo(o, cx, cz) < inf) this.grid[iz * gn + ix] += delta;
      }
    }
  }

  // Extra blocking used for known traps (survivor planning only).
  setExtra(x, z, r, on) {
    const gc = this.gc, half = this.half, gn = this.gn;
    const x0 = Math.max(0, Math.floor((x - r + half) / gc)), x1 = Math.min(gn - 1, Math.floor((x + r + half) / gc));
    const z0 = Math.max(0, Math.floor((z - r + half) / gc)), z1 = Math.min(gn - 1, Math.floor((z + r + half) / gc));
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) this.extra[iz * gn + ix] = on ? 1 : 0;
  }

  cellOf(x, z) {
    const ix = clamp(Math.floor((x + this.half) / this.gc), 0, this.gn - 1);
    const iz = clamp(Math.floor((z + this.half) / this.gc), 0, this.gn - 1);
    return iz * this.gn + ix;
  }

  _blocked(i, useExtra) { return this.grid[i] > 0 || (useExtra && this.extra[i] > 0); }

  walkable(x, z, useExtra = false) {
    if (Math.abs(x) > this.half - 0.5 || Math.abs(z) > this.half - 0.5) return false;
    return !this._blocked(this.cellOf(x, z), useExtra);
  }

  nearestWalkable(x, z, useExtra = false) {
    const gn = this.gn, gc = this.gc, half = this.half;
    const ci = this.cellOf(x, z);
    if (!this._blocked(ci, useExtra)) return { x, z };
    const cx = ci % gn, cz = Math.floor(ci / gn);
    for (let r = 1; r < 10; r++) {
      let best = null, bd = 1e9;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const ix = cx + dx, iz = cz + dz;
          if (ix < 0 || iz < 0 || ix >= gn || iz >= gn) continue;
          if (this._blocked(iz * gn + ix, useExtra)) continue;
          const wx = -half + (ix + 0.5) * gc, wz = -half + (iz + 0.5) * gc;
          const d = (wx - x) ** 2 + (wz - z) ** 2;
          if (d < bd) { bd = d; best = { x: wx, z: wz }; }
        }
      }
      if (best) return best;
    }
    return { x, z };
  }

  lineWalkable(x0, z0, x1, z1, useExtra = false) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(d / (this.gc * 0.35));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (this._blocked(this.cellOf(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t), useExtra)) return false;
    }
    return true;
  }

  findPath(sx, sz, tx, tz, useExtra = false, maxIter = 9000) {
    const gn = this.gn, gc = this.gc, half = this.half;
    const s = this.nearestWalkable(sx, sz, useExtra);
    const g = this.nearestWalkable(tx, tz, useExtra);
    const start = this.cellOf(s.x, s.z), goal = this.cellOf(g.x, g.z);
    if (start === goal) return [{ x: g.x, z: g.z }];
    const id = ++this.searchId;
    const gs = this.gScore, came = this.came, seen = this.seen, closed = this.closed;
    const heap = this.heap, hf = this.heapF;
    let hn = 0;
    const gx = goal % gn, gz = Math.floor(goal / gn);
    const hfun = (i) => {
      const dx = Math.abs((i % gn) - gx), dz = Math.abs(Math.floor(i / gn) - gz);
      return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz);
    };
    const push = (i, f) => {
      let k = hn++;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (hf[p] <= f) break;
        heap[k] = heap[p]; hf[k] = hf[p]; k = p;
      }
      heap[k] = i; hf[k] = f;
    };
    const pop = () => {
      const top = heap[0];
      const li = heap[--hn], lf = hf[hn];
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= hn) break;
        if (c + 1 < hn && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lf) break;
        heap[k] = heap[c]; hf[k] = hf[c]; k = c;
      }
      heap[k] = li; hf[k] = lf;
      return top;
    };
    seen[start] = id; gs[start] = 0; came[start] = -1;
    push(start, hfun(start));
    let found = false, iter = 0, bestI = start, bestH = hfun(start);
    while (hn > 0 && iter++ < maxIter) {
      const cur = pop();
      if (closed[cur] === id) continue;
      closed[cur] = id;
      if (cur === goal) { found = true; break; }
      const hc = hfun(cur);
      if (hc < bestH) { bestH = hc; bestI = cur; }
      const cx = cur % gn, cz = Math.floor(cur / gn);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= gn || nz >= gn) continue;
          const ni = nz * gn + nx;
          if (this._blocked(ni, useExtra) || closed[ni] === id) continue;
          if (dx && dz && (this._blocked(cz * gn + nx, useExtra) || this._blocked(nz * gn + cx, useExtra))) continue;
          const ng = gs[cur] + (dx && dz ? 1.4142 : 1);
          if (seen[ni] !== id || ng < gs[ni]) {
            seen[ni] = id; gs[ni] = ng; came[ni] = cur;
            push(ni, ng + hfun(ni));
          }
        }
      }
    }
    let end = found ? goal : bestI;
    const cells = [];
    for (let c = end; c !== -1 && cells.length < 4000; c = came[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => ({ x: -half + ((c % gn) + 0.5) * gc, z: -half + (Math.floor(c / gn) + 0.5) * gc }));
    if (found) pts[pts.length - 1] = { x: g.x, z: g.z };
    // string pulling
    const out = [];
    let ax = sx, az = sz, i = 0;
    while (i < pts.length) {
      let j = i;
      while (j + 1 < pts.length && this.lineWalkable(ax, az, pts[j + 1].x, pts[j + 1].z, useExtra)) j++;
      out.push(pts[j]);
      ax = pts[j].x; az = pts[j].z;
      i = j + 1;
    }
    return out;
  }
}
