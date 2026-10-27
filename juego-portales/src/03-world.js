// ───────────────────────── mundo: cajas estáticas, geometría y colisiones ─────────────────────────
class Box {
  constructor(min, max, mat = 'metal', o = {}) {
    this.min = min; this.max = max; this.mat = mat;
    this.top = o.top; this.bottom = o.bottom; this.side = o.side;
    this.cast = o.cast !== undefined ? o.cast : true;
    this.solid = o.solid !== undefined ? o.solid : true;
    this.shot = o.shot !== undefined ? o.shot : true; // bloquea disparos
    this.render = o.render !== undefined ? o.render : true;
    this.owner = o.owner || null;
  }
  clone(min, max) {
    const b = new Box(min, max, this.mat, this);
    b.top = this.top; b.bottom = this.bottom; b.side = this.side; b.owner = this.owner;
    return b;
  }
}
function faceKey(b, axis, sign) {
  if (axis === 1 && sign > 0) return b.top || (b.mat === 'metal' ? 'floor' : b.mat);
  if (axis === 1 && sign < 0) return b.bottom || b.mat;
  return b.side || b.mat;
}
const isPortalable = (b, axis, sign) => faceKey(b, axis, sign) === 'white';

function boxOverlap(c, h, b, eps = 0) {
  return c.x + h.x > b.min.x + eps && c.x - h.x < b.max.x - eps &&
    c.y + h.y > b.min.y + eps && c.y - h.y < b.max.y - eps &&
    c.z + h.z > b.min.z + eps && c.z - h.z < b.max.z - eps;
}
function pointIn(p, b, eps = 0) {
  return p.x > b.min.x + eps && p.x < b.max.x - eps && p.y > b.min.y + eps && p.y < b.max.y - eps && p.z > b.min.z + eps && p.z < b.max.z - eps;
}
// resta una caja-agujero de una caja: devuelve los trozos que quedan
// (los trozos recuerdan su portal: rozar de lado el marco del hueco al atravesarlo no frena el impulso)
function subtractBox(b, h, portal) {
  if (!(b.min.x < h.max.x && b.max.x > h.min.x && b.min.y < h.max.y && b.max.y > h.min.y && b.min.z < h.max.z && b.max.z > h.min.z)) return [b];
  const out = [], lo = b.min.clone(), hi = b.max.clone();
  const piece = (mn, mx) => { const p = b.clone(mn, mx); p.holePortal = portal; out.push(p); };
  for (const k of AX) {
    if (lo[k] < h.min[k]) { const nh = hi.clone(); nh[k] = h.min[k]; piece(lo.clone(), nh); lo[k] = h.min[k]; }
    if (hi[k] > h.max[k]) { const nl = lo.clone(); nl[k] = h.max[k]; piece(nl, hi.clone()); hi[k] = h.max[k]; }
  }
  return out;
}
// rayo contra caja (método de las losas). Devuelve t de entrada y la normal de la cara.
function rayBox(o, d, b, tmax) {
  let t0 = 0, t1 = tmax, axis = -1, sign = 0;
  for (let i = 0; i < 3; i++) {
    const k = AX[i], ok = o[k], dk = d[k];
    if (Math.abs(dk) < 1e-9) { if (ok < b.min[k] || ok > b.max[k]) return null; continue; }
    let ta = (b.min[k] - ok) / dk, tb = (b.max[k] - ok) / dk;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) { t0 = ta; axis = i; sign = dk > 0 ? -1 : 1; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  if (axis < 0) return null;
  return { t: t0, axis, sign };
}

// ───── geometría estática combinada por material ─────
function buildStaticMeshes(boxes, group) {
  const buckets = new Map();
  const bucket = key => {
    let b = buckets.get(key);
    if (!b) { b = { pos: [], nor: [], uv: [], idx: [] }; buckets.set(key, b); }
    return b;
  };
  for (const b of boxes) {
    if (!b.render) continue;
    if (b.mat === 'glass') continue;
    for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
      const key = faceKey(b, axis, sign);
      if (key === 'none') continue;
      emitFace(bucket(key + (b.cast ? '|c' : '|n')), b, axis, sign);
    }
  }
  for (const [key, bk] of buckets) {
    const [mat, cast] = key.split('|');
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bk.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(bk.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(bk.uv, 2));
    geo.setIndex(bk.idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, MAT[mat] || MAT.metal);
    mesh.castShadow = cast === 'c';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // cristal: cajas individuales con aristas brillantes
  for (const b of boxes) {
    if (b.mat !== 'glass' || !b.render) continue;
    const size = b.max.clone().sub(b.min), ctr = b.max.clone().add(b.min).multiplyScalar(0.5);
    const g = new THREE.BoxGeometry(size.x, size.y, size.z);
    const m = new THREE.Mesh(g, MAT.glass); m.position.copy(ctr); m.renderOrder = 2; group.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), MAT.glassEdge); e.position.copy(ctr); group.add(e);
  }
}
function emitFace(bk, b, axis, sign) {
  const a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
  const k = AX[axis], k1 = AX[a1], k2 = AX[a2];
  const coord = sign > 0 ? b.max[k] : b.min[k];
  const lo1 = b.min[k1], hi1 = b.max[k1], lo2 = b.min[k2], hi2 = b.max[k2];
  if (hi1 - lo1 < 1e-5 || hi2 - lo2 < 1e-5) return;
  const base = bk.pos.length / 3;
  const p = [0, 0, 0];
  for (const [c1, c2] of [[lo1, lo2], [hi1, lo2], [hi1, hi2], [lo1, hi2]]) {
    p[axis] = coord; p[a1] = c1; p[a2] = c2;
    bk.pos.push(p[0], p[1], p[2]);
    bk.nor.push(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0);
    let u, v;
    if (axis === 1) { u = p[0]; v = p[2]; } else if (axis === 0) { u = p[2]; v = p[1]; } else { u = p[0]; v = p[1]; }
    bk.uv.push(u * 0.5, v * 0.5);
  }
  if (sign > 0) bk.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else bk.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

// ───── ayudas para construir niveles ─────
// losa con regiones blancas / huecos / cristal. axis = eje de la normal de la cara visible.
// rects en coordenadas del plano: axis x → [z0,z1,y0,y1]; axis z → [x0,x1,y0,y1]; axis y → [x0,x1,z0,z1]
function slab(L, min, max, axis, spec = {}) {
  const base = spec.base || 'metal';
  const [A, B] = axis === 'x' ? ['z', 'y'] : axis === 'z' ? ['x', 'y'] : ['x', 'z'];
  const white = spec.white || [], holes = spec.holes || [], glass = spec.glass || [];
  const cutsA = new Set([min[A], max[A]]), cutsB = new Set([min[B], max[B]]);
  for (const r of [...white, ...holes, ...glass]) {
    for (const v of [r[0], r[1]]) if (v > min[A] && v < max[A]) cutsA.add(v);
    for (const v of [r[2], r[3]]) if (v > min[B] && v < max[B]) cutsB.add(v);
  }
  const ca = [...cutsA].sort((a, b) => a - b), cb = [...cutsB].sort((a, b) => a - b);
  const inside = (r, a, b) => a > r[0] && a < r[1] && b > r[2] && b < r[3];
  for (let j = 0; j < cb.length - 1; j++) {
    let runStart = null, runMat = null;
    const flush = (endA) => {
      if (runMat && runMat !== 'hole') {
        const lo = min.clone(), hi = max.clone();
        lo[A] = runStart; hi[A] = endA; lo[B] = cb[j]; hi[B] = cb[j + 1];
        L.boxes.push(new Box(lo, hi, runMat, spec.opts || {}));
      }
    };
    for (let i = 0; i < ca.length - 1; i++) {
      const ma = (ca[i] + ca[i + 1]) / 2, mb = (cb[j] + cb[j + 1]) / 2;
      let m = base;
      if (white.some(r => inside(r, ma, mb))) m = 'white';
      if (glass.some(r => inside(r, ma, mb))) m = 'glass';
      if (holes.some(r => inside(r, ma, mb))) m = 'hole';
      if (m !== runMat) { if (runMat !== null) flush(ca[i]); runStart = ca[i]; runMat = m; }
    }
    flush(ca[ca.length - 1]);
  }
}
// sala: interior [x0,x1]×[y0,y1]×[z0,z1]; caras n (z0), s (z1), w (x0), e (x1), floor, ceil
function room(L, x0, y0, z0, x1, y1, z1, spec = {}) {
  const t = spec.t || 1, skip = spec.skip || [], noExt = spec.noExt || [];
  const xl = x0 - (noExt.includes('w') ? 0 : t), xh = x1 + (noExt.includes('e') ? 0 : t);
  const zl = z0 - (noExt.includes('n') ? 0 : t), zh = z1 + (noExt.includes('s') ? 0 : t);
  const S = k => spec[k] || {};
  if (!skip.includes('floor')) slab(L, v3(xl, y0 - t, zl), v3(xh, y0, zh), 'y', S('floor'));
  if (!skip.includes('ceil')) slab(L, v3(xl, y1, zl), v3(xh, y1 + t, zh), 'y', { ...S('ceil'), opts: { cast: false } });
  if (!skip.includes('n')) slab(L, v3(xl, y0, z0 - t), v3(xh, y1, z0), 'z', S('n'));
  if (!skip.includes('s')) slab(L, v3(xl, y0, z1), v3(xh, y1, z1 + t), 'z', S('s'));
  if (!skip.includes('w')) slab(L, v3(x0 - t, y0, z0), v3(x0, y1, z1), 'x', S('w'));
  if (!skip.includes('e')) slab(L, v3(x1, y0, z0), v3(x1 + t, y1, z1), 'x', S('e'));
}
function addBox(L, x0, y0, z0, x1, y1, z1, mat = 'metal', o = {}) {
  const b = new Box(v3(x0, y0, z0), v3(x1, y1, z1), mat, o);
  L.boxes.push(b);
  return b;
}
