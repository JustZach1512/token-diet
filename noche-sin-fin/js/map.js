// Mapa: generación procedural, visión (línea de vista) y rutas A*.
(function () {
  'use strict';
  const NSF = window.NSF, C = NSF.CONST, U = NSF.U;
  const T = (NSF.T = { FLOOR: 0, WALL: 1, WINDOW: 2, TREE: 3, GEN: 4, PALLET: 5, PALLET_DOWN: 6, GATE: 7, ROCK: 8, DEBRIS: 9 });

  // Estructuras de 6×6 que se colocan (rotadas o reflejadas) en cada bloque de 8×8.
  // '#' muro · 'W' ventana · 'P' palé · 'T' árbol · 'r' roca · '.' suelo
  const PREFABS = [
    { w: 2, rows: ['#####.', '#...#.', '#...W.', 'P...#.', '#...#.', '##.##.'] },   // caseta
    { w: 3, rows: ['......', '.####.', '.#....', '.W..T.', '.#....', '.##P#.'] },   // gimnasio
    { w: 2, rows: ['......', '##P##.', '......', '..T...', '......', '.##W##'] },   // muros paralelos
    { w: 1.5, rows: ['..T...', '.TT..T', '......', 'T..TT.', '...T..', '.T....'] }, // arboleda
    { w: 1.5, rows: ['##W###', '#....#', 'W....P', '#....#', '#....#', '###.##'] }, // granero
    { w: 2, rows: ['......', '..T...', '..P...', '..T...', '.....T', 'T.....'] },   // palé entre árboles
    { w: 2, rows: ['#####.', '....#.', '....W.', 'T...#.', 'P...#.', 'T.....'] },   // muro en L
    { w: 1.5, rows: ['......', '......', '..r...', '......', '...T..', '......'] }, // claro
    { w: 2, rows: ['..#...', '..W...', '###P##', '..#...', '..#...', '......'] },   // cruce
    { w: 1, rows: ['T..T..', '..T..T', '.T....', '....T.', 'T.T...', '...T.T'] },   // bosque muerto
    { w: 1.2, rows: ['rr....', 'r.....', '...P..', '..rrr.', '......', '....r.'] }, // pedregal (el palé suele anularse)
  ];

  function rotate(rows) {
    const n = rows.length, out = [];
    for (let y = 0; y < n; y++) {
      let s = '';
      for (let x = 0; x < n; x++) s += rows[n - 1 - x][y];
      out.push(s);
    }
    return out;
  }

  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DY = [0, 0, 1, -1, 1, -1, 1, -1];

  class GameMap {
    constructor() {
      this.W = C.W; this.H = C.H;
      const N = this.W * this.H;
      this.t = new Uint8Array(N);
      this.axis = new Uint8Array(N);   // 1: se cruza en horizontal · 2: en vertical
      this.open = new Uint8Array(N);   // puertas de salida abiertas
      this.v = new Uint8Array(N);      // variación visual
      this._g = new Float32Array(N);
      this._from = new Int32Array(N);
      this._stamp = new Uint32Array(N);
      this._closed = new Uint32Array(N);
      this._sid = 0;
      this._heap = new NSF.MinHeap();
      this.gens = []; this.hooks = []; this.gates = []; this.loops = [];
      for (let i = 0; i < 40; i++) if (this._try()) return;
      throw new Error('No se pudo generar el mapa');
    }

    idx(x, y) { return y * this.W + x; }
    get(x, y) {
      if (x < 0 || y < 0 || x >= this.W || y >= this.H) return T.WALL;
      return this.t[y * this.W + x];
    }
    set(x, y, v) { this.t[y * this.W + x] = v; }
    plain(t) { return t === T.FLOOR || t === T.DEBRIS; }
    special(t) { return t === T.WINDOW || t === T.PALLET || t === T.PALLET_DOWN; }

    solidS(x, y) {
      const t = this.get(x, y);
      if (t === T.GATE) return !this.open[y * this.W + x];
      return t === T.WALL || t === T.WINDOW || t === T.TREE || t === T.GEN || t === T.PALLET_DOWN || t === T.ROCK;
    }
    solidK(x, y) {
      const t = this.get(x, y);
      return t === T.WALL || t === T.WINDOW || t === T.TREE || t === T.GEN || t === T.PALLET_DOWN || t === T.ROCK || t === T.GATE;
    }
    blocksSight(x, y) {
      const t = this.get(x, y);
      if (t === T.GATE) return !this.open[y * this.W + x];
      return t === T.WALL || t === T.TREE || t === T.ROCK;
    }
    blocksAxe(x, y) {
      const t = this.get(x, y);
      return t === T.WALL || t === T.TREE || t === T.ROCK || t === T.GEN || (t === T.GATE && !this.open[y * this.W + x]);
    }
    _solidBase(x, y) {
      const t = this.get(x, y);
      return t === T.WALL || t === T.TREE || t === T.ROCK || t === T.WINDOW;
    }

    // ---------------------------------------------------------------- generación
    _try() {
      const W = this.W, H = this.H;
      this.t.fill(T.FLOOR); this.axis.fill(0); this.open.fill(0);
      for (let i = 0; i < this.v.length; i++) this.v[i] = (Math.random() * 256) | 0;
      for (let x = 0; x < W; x++) { this.set(x, 0, T.WALL); this.set(x, H - 1, T.WALL); }
      for (let y = 0; y < H; y++) { this.set(0, y, T.WALL); this.set(W - 1, y, T.WALL); }

      const total = PREFABS.reduce((a, p) => a + p.w, 0);
      const cw = (W - 2) / C.CHUNK, ch = (H - 2) / C.CHUNK;
      for (let cy = 0; cy < ch; cy++) {
        for (let cx = 0; cx < cw; cx++) {
          let r = Math.random() * total, pf = PREFABS[0];
          for (const p of PREFABS) { r -= p.w; if (r <= 0) { pf = p; break; } }
          let rows = pf.rows.slice();
          const rot = U.randi(0, 3);
          for (let i = 0; i < rot; i++) rows = rotate(rows);
          if (U.chance(0.5)) rows = rows.map((s) => s.split('').reverse().join(''));
          const ox = 1 + cx * C.CHUNK + 1, oy = 1 + cy * C.CHUNK + 1;
          for (let y = 0; y < 6; y++) {
            for (let x = 0; x < 6; x++) {
              const c = rows[y][x];
              let tt = T.FLOOR;
              if (c === '#') tt = T.WALL;
              else if (c === 'W') tt = T.WINDOW;
              else if (c === 'P') tt = T.PALLET;
              else if (c === 'T') tt = T.TREE;
              else if (c === 'r') tt = T.ROCK;
              this.set(ox + x, oy + y, tt);
            }
          }
        }
      }
      // Árboles sueltos en los pasillos para romper líneas de visión.
      for (let i = 0; i < 26; i++) {
        const x = U.randi(2, W - 3), y = U.randi(2, H - 3);
        let free = true;
        for (let dy = -1; dy <= 1 && free; dy++) for (let dx = -1; dx <= 1; dx++) if (this.get(x + dx, y + dy) !== T.FLOOR) { free = false; break; }
        if (free) this.set(x, y, U.chance(0.7) ? T.TREE : T.ROCK);
      }

      // Puertas de salida en los laterales.
      this.gates = [];
      for (const side of ['L', 'R']) {
        const gy = U.randi(6, H - 8);
        const gx = side === 'L' ? 0 : W - 1;
        const dir = side === 'L' ? 1 : -1;
        const ix = gx + dir;
        for (let yy = gy - 2; yy <= gy + 3; yy++) for (let k = 0; k < 4; k++) this.set(ix + dir * k, yy, T.FLOOR);
        this.set(gx, gy, T.GATE); this.set(gx, gy + 1, T.GATE);
        this.gates.push({ side, x: gx, y: gy, dir, cx: gx + 0.5, cy: gy + 1, lever: { x: ix + dir + 0.5, y: gy - 1 + 0.5 }, progress: 0, open: false });
      }

      // Ventanas y palés solo valen entre dos bloques sólidos opuestos.
      for (let pass = 0; pass < 2; pass++) {
        for (let y = 1; y < H - 1; y++) {
          for (let x = 1; x < W - 1; x++) {
            const t = this.get(x, y);
            if (t !== T.WINDOW && t !== T.PALLET) continue;
            const sL = this._solidBase(x - 1, y), sR = this._solidBase(x + 1, y);
            const sU = this._solidBase(x, y - 1), sD = this._solidBase(x, y + 1);
            const fL = this.get(x - 1, y) === T.FLOOR, fR = this.get(x + 1, y) === T.FLOOR;
            const fU = this.get(x, y - 1) === T.FLOOR, fD = this.get(x, y + 1) === T.FLOOR;
            let ax = 0;
            if (sL && sR && fU && fD) ax = 2;
            else if (sU && sD && fL && fR) ax = 1;
            if (!ax) { this.set(x, y, t === T.WINDOW ? T.WALL : T.FLOOR); this.axis[this.idx(x, y)] = 0; continue; }
            this.axis[this.idx(x, y)] = ax;
          }
        }
      }

      // Conectividad: lo que no se alcance desde el centro se rellena.
      const start = this._findFloorNear(W >> 1, H >> 1);
      if (!start) return false;
      const seen = new Uint8Array(W * H);
      const q = [start.y * W + start.x];
      seen[q[0]] = 1;
      let count = 0;
      while (q.length) {
        const c = q.pop(); count++;
        const cx = c % W, cy = (c / W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = cx + DX[d], ny = cy + DY[d];
          const t = this.get(nx, ny);
          if (!(t === T.FLOOR || t === T.PALLET || t === T.WINDOW)) continue;
          const n = ny * W + nx;
          if (seen[n]) continue;
          seen[n] = 1; q.push(n);
        }
      }
      let interior = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = this.idx(x, y), t = this.t[i];
          if (t === T.FLOOR || t === T.PALLET || t === T.WINDOW) {
            interior++;
            if (!seen[i]) { this.t[i] = t === T.FLOOR ? T.TREE : T.WALL; this.axis[i] = 0; }
          }
        }
      }
      if (count < interior * 0.85) return false;

      const free8 = (x, y) => {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.get(x + dx, y + dy) !== T.FLOOR) return false;
        return true;
      };
      const pickSpaced = (n, spacing, avoid, avoidDist) => {
        const cand = [];
        for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) if (free8(x, y)) cand.push([x, y]);
        U.shuffle(cand);
        for (let sp = spacing; sp >= 4; sp -= 2) {
          const out = [];
          for (const c of cand) {
            if (out.some((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) < sp)) continue;
            if (avoid.some((o) => Math.hypot(o.x - c[0], o.y - c[1]) < avoidDist)) continue;
            if (this.gates.some((g) => Math.hypot(g.x - c[0], g.y - c[1]) < 6)) continue;
            out.push(c);
            if (out.length >= n) return out;
          }
        }
        return null;
      };

      const gens = pickSpaced(C.GENS_TOTAL, 13, [], 0);
      if (!gens) return false;
      this.gens = gens.map(([x, y]) => {
        this.set(x, y, T.GEN);
        return { x, y, cx: x + 0.5, cy: y + 0.5, progress: 0, done: false, regress: false, blocked: false, workers: 0, flash: 0, spark: 0 };
      });
      const hooks = pickSpaced(C.HOOKS, 9, this.gens, 3);
      if (!hooks || hooks.length < 8) return false;
      this.hooks = hooks.map(([x, y]) => ({ x, y, cx: x + 0.5, cy: y + 0.5, s: null }));

      // Limita el número de palés.
      const pallets = [];
      for (let i = 0; i < this.t.length; i++) if (this.t[i] === T.PALLET) pallets.push(i);
      U.shuffle(pallets);
      pallets.slice(C.PALLETS_MAX).forEach((i) => { this.t[i] = T.FLOOR; this.axis[i] = 0; });

      this.loops = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const t = this.get(x, y);
          if (t === T.PALLET || t === T.WINDOW) this.loops.push({ x, y, cx: x + 0.5, cy: y + 0.5, ax: this.axis[this.idx(x, y)] });
        }
      }

      // Salidas: el asesino cerca del centro, los supervivientes lejos.
      const ks = this._findFloorNear((W >> 1) + U.randi(-6, 6), (H >> 1) + U.randi(-4, 4));
      if (!ks) return false;
      let ss = null;
      for (let i = 0; i < 200 && !ss; i++) {
        const x = U.randi(3, W - 4), y = U.randi(3, H - 4);
        if (this.get(x, y) === T.FLOOR && Math.hypot(x - ks.x, y - ks.y) > 22 && seen[this.idx(x, y)]) ss = { x, y };
      }
      if (!ss) return false;
      this.spawnK = { x: ks.x + 0.5, y: ks.y + 0.5 };
      this.spawnS = this._cluster(ss.x, ss.y, 4);
      return this.spawnS.length === 4;
    }

    _findFloorNear(x, y) {
      for (let r = 0; r < 12; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (this.get(x + dx, y + dy) === T.FLOOR) return { x: x + dx, y: y + dy };
          }
        }
      }
      return null;
    }

    _cluster(x, y, n) {
      const out = [], seen = new Set([y * this.W + x]), q = [[x, y]];
      while (q.length && out.length < n) {
        const [cx, cy] = q.shift();
        if (this.get(cx, cy) === T.FLOOR) out.push({ x: cx + 0.5, y: cy + 0.5 });
        for (let d = 0; d < 4; d++) {
          const nx = cx + DX[d], ny = cy + DY[d];
          const k = ny * this.W + nx;
          if (seen.has(k) || this.get(nx, ny) !== T.FLOOR) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      return out;
    }

    // ---------------------------------------------------------------- visión
    los(x0, y0, x1, y1) {
      let tx = Math.floor(x0), ty = Math.floor(y0);
      const dx = x1 - x0, dy = y1 - y0;
      const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
      const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
      const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
      let tmx = dx !== 0 ? (dx > 0 ? tx + 1 - x0 : x0 - tx) * tdx : Infinity;
      let tmy = dy !== 0 ? (dy > 0 ? ty + 1 - y0 : y0 - ty) * tdy : Infinity;
      for (let n = 0; n < 400; n++) {
        if (tmx < tmy) { if (tmx > 1) return true; tmx += tdx; tx += sx; }
        else { if (tmy > 1) return true; tmy += tdy; ty += sy; }
        if (this.blocksSight(tx, ty)) return false;
      }
      return true;
    }

    // Distancia hasta el primer bloque opaco en una dirección.
    ray(x0, y0, ang, maxD) {
      const cx = Math.cos(ang), cy = Math.sin(ang);
      let tx = Math.floor(x0), ty = Math.floor(y0);
      const sx = cx > 0 ? 1 : -1, sy = cy > 0 ? 1 : -1;
      const tdx = cx !== 0 ? Math.abs(1 / cx) : Infinity;
      const tdy = cy !== 0 ? Math.abs(1 / cy) : Infinity;
      let tmx = cx !== 0 ? (cx > 0 ? tx + 1 - x0 : x0 - tx) * tdx : Infinity;
      let tmy = cy !== 0 ? (cy > 0 ? ty + 1 - y0 : y0 - ty) * tdy : Infinity;
      let t = 0;
      while (t < maxD) {
        if (tmx < tmy) { t = tmx; tmx += tdx; tx += sx; }
        else { t = tmy; tmy += tdy; ty += sy; }
        if (t >= maxD) return maxD;
        if (this.blocksSight(tx, ty)) return t;
      }
      return maxD;
    }

    // ¿Se puede caminar en línea recta sin tocar obstáculos ni casillas especiales?
    walkLine(ax, ay, bx, by, r = 0.34) {
      const d = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.ceil(d / 0.25));
      for (let i = 1; i <= n; i++) {
        const k = i / n;
        const x = ax + (bx - ax) * k, y = ay + (by - ay) * k;
        if (!this.plain(this.get(x | 0, y | 0))) return false;
        if (!this.plain(this.get((x - r) | 0, (y - r) | 0)) || !this.plain(this.get((x + r) | 0, (y - r) | 0)) ||
            !this.plain(this.get((x - r) | 0, (y + r) | 0)) || !this.plain(this.get((x + r) | 0, (y + r) | 0))) return false;
      }
      return true;
    }

    // Ventana o palé junto a una posición (para saltar, tirar o romper).
    nearSpecial(x, y, types, aMin = 0.45, aMax = 1.35, lMax = 0.5) {
      let best = null, bd = 99;
      const tx = x | 0, ty = y | 0;
      for (let yy = ty - 2; yy <= ty + 2; yy++) {
        for (let xx = tx - 2; xx <= tx + 2; xx++) {
          const t = this.get(xx, yy);
          if (types.indexOf(t) < 0) continue;
          const ax = this.axis[this.idx(xx, yy)];
          const cx = xx + 0.5, cy = yy + 0.5;
          const along = ax === 1 ? x - cx : y - cy;
          const lat = ax === 1 ? y - cy : x - cx;
          const da = Math.abs(along);
          if (da < aMin || da > aMax || Math.abs(lat) > lMax) continue;
          if (da < bd) { bd = da; best = { x: xx, y: yy, t, ax, cx, cy, side: Math.sign(along) || 1 }; }
        }
      }
      return best;
    }

    // ---------------------------------------------------------------- rutas
    passCost(x, y, nx, ny, dx, dy, who) {
      const t1 = this.get(nx, ny), t0 = this.get(x, y);
      if (dx !== 0 && dy !== 0) {
        if (!this.plain(t1) || !this.plain(t0)) return -1;
        if (!this.plain(this.get(x + dx, y)) || !this.plain(this.get(x, y + dy))) return -1;
        return 1.414;
      }
      if (this.special(t0)) {
        const ax = this.axis[this.idx(x, y)];
        if ((ax === 1 && dy !== 0) || (ax === 2 && dx !== 0)) return -1;
      }
      switch (t1) {
        case T.FLOOR: case T.DEBRIS: return 1;
        case T.PALLET: case T.WINDOW: case T.PALLET_DOWN: {
          const ax = this.axis[this.idx(nx, ny)];
          if ((ax === 1 && dy !== 0) || (ax === 2 && dx !== 0)) return -1;
          if (t1 === T.PALLET) return who === 'k' ? 1.3 : 1;
          if (t1 === T.WINDOW) return who === 'k' ? 6 : 2.2;
          return who === 'k' ? 8 : 2.2;
        }
        case T.GATE: return who === 's' && this.open[this.idx(nx, ny)] ? 1 : -1;
      }
      return -1;
    }

    walkable(x, y, who) {
      const t = this.get(x, y);
      if (t === T.GATE) return who === 's' && !!this.open[this.idx(x, y)];
      return this.plain(t) || t === T.PALLET;
    }

    nearestWalkable(x, y, who) {
      if (this.walkable(x, y, who)) return { x, y };
      for (let r = 1; r <= 4; r++) {
        let best = null, bd = 99;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (!this.walkable(x + dx, y + dy, who)) continue;
            const d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = { x: x + dx, y: y + dy }; }
          }
        }
        if (best) return best;
      }
      return null;
    }

    path(sx, sy, gx, gy, who, maxIter = 5000) {
      const W = this.W;
      sx |= 0; sy |= 0; gx |= 0; gy |= 0;
      if (sx === gx && sy === gy) return [];
      const sid = ++this._sid;
      const g = this._g, from = this._from, st = this._stamp, cl = this._closed, heap = this._heap;
      heap.clear();
      const h = (x, y) => {
        const ax = Math.abs(x - gx), ay = Math.abs(y - gy);
        return ax + ay - 0.586 * Math.min(ax, ay);
      };
      const s = sy * W + sx, goal = gy * W + gx;
      g[s] = 0; st[s] = sid; from[s] = -1;
      heap.push(h(sx, sy), s);
      let found = false;
      for (let it = 0; heap.size && it < maxIter; it++) {
        const cur = heap.pop();
        if (cl[cur] === sid) continue;
        cl[cur] = sid;
        if (cur === goal) { found = true; break; }
        const cx = cur % W, cy = (cur / W) | 0;
        for (let d = 0; d < 8; d++) {
          const dx = DX[d], dy = DY[d], nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= this.H) continue;
          const n = ny * W + nx;
          if (cl[n] === sid) continue;
          const c = this.passCost(cx, cy, nx, ny, dx, dy, who);
          if (c < 0) continue;
          const ng = g[cur] + c;
          if (st[n] !== sid || ng < g[n]) {
            st[n] = sid; g[n] = ng; from[n] = cur;
            heap.push(ng + h(nx, ny), n);
          }
        }
      }
      if (!found) return null;
      const out = [];
      for (let c = goal; c !== s; c = from[c]) out.push({ tx: c % W, ty: (c / W) | 0 });
      out.reverse();
      return out;
    }

    // Convierte la ruta en puntos de paso y recorta los tramos rectos.
    waypoints(sx, sy, tiles) {
      const nodes = tiles.map((p) => {
        const t = this.get(p.tx, p.ty);
        return { x: p.tx + 0.5, y: p.ty + 0.5, tx: p.tx, ty: p.ty, sp: this.special(t) ? t : 0 };
      });
      const out = [];
      let cx = sx, cy = sy, i = 0;
      while (i < nodes.length) {
        const n = nodes[i];
        if (n.sp) {
          out.push(n);
          if (i + 1 < nodes.length) { out.push(nodes[i + 1]); cx = nodes[i + 1].x; cy = nodes[i + 1].y; i += 2; }
          else i++;
          continue;
        }
        let j = i;
        while (j + 1 < nodes.length && !nodes[j + 1].sp && this.walkLine(cx, cy, nodes[j + 1].x, nodes[j + 1].y)) j++;
        out.push(nodes[j]);
        cx = nodes[j].x; cy = nodes[j].y; i = j + 1;
      }
      return out;
    }
  }

  NSF.GameMap = GameMap;
})();
