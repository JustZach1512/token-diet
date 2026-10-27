// ───────────────────────── física de cuerpos (cajas alineadas a los ejes) ─────────────────────────
const _l = v3();
const _cb = { min: v3(), max: v3() };
function cubeBox(cb) { _cb.min.copy(cb.c).sub(cb.h); _cb.max.copy(cb.c).add(cb.h); return _cb; }

function overlapsAnything(body) {
  for (const b of G.collide) if (b.solid && boxOverlap(body.c, body.h, b)) return true;
  for (const b of G.dynBlockers) if (boxOverlap(body.c, body.h, b)) return true;
  if (body.kind === 'player') for (const cb of G.cubes) if (cb.alive && !cb.held && !body.ghost.has(cb) && boxOverlap(body.c, body.h, cubeBox(cb))) return true;
  return false;
}

function handleHit(body, ax, d, b) {
  const k = AX[ax];
  if (ax !== 1 && body.canStep && body.onGroundPrev && !b.noStep) {
    const rise = b.max.y - (body.c.y - body.h.y);
    if (rise > 0 && rise <= PHYS.step) {
      const oy = body.c.y;
      body.c.y += rise + 0.002;
      if (!overlapsAnything(body)) { body.stepped = rise; return; }
      body.c.y = oy;
    }
  }
  body.c[k] = d > 0 ? b.min[k] - body.h[k] - 1e-4 : b.max[k] + body.h[k] + 1e-4;
  if (b.holePortal && slidingThrough(body, b.holePortal, ax, d)) return;
  if (body.kind === 'pellet') { body.vel[k] = -body.vel[k]; body.bounced = true; return; }
  if (ax === 1 && d < 0) {
    body.landSpeed = Math.max(body.landSpeed, -body.vel.y);
    body.onGround = true; body.groundOwner = b.owner || null;
  }
  body.vel[k] = 0;
}

// ¿el cuerpo está cruzando este portal y el choque es lateral (no un apoyo)?
function slidingThrough(body, P, ax, d) {
  if (ax === P.axis || (ax === 1 && d < 0)) return false;
  const l = P.local(body.c, _l2);
  return l.z < _ext(P.n, body.h) + 0.02 && Math.abs(l.x) <= PORTAL_W / 2 + 0.12 && Math.abs(l.y) <= PORTAL_H / 2 + 0.06;
}
const _l2 = v3();

function resolveAxis(body, ax, d) {
  const c = body.c, h = body.h;
  for (const b of G.collide) if (b.solid && boxOverlap(c, h, b)) handleHit(body, ax, d, b);
  for (const b of G.dynBlockers) if (boxOverlap(c, h, b)) handleHit(body, ax, d, b);
  if (body.kind === 'player') {
    for (const cb of G.cubes) {
      if (!cb.alive || cb.held || body.ghost.has(cb)) continue;
      const bb = cubeBox(cb);
      if (boxOverlap(c, h, bb)) handleHit(body, ax, d, { min: bb.min.clone(), max: bb.max.clone(), owner: cb, noStep: true });
    }
  } else {
    for (const cb of G.cubes) {
      if (cb === body || !cb.alive || cb.held || cb.dissolving) continue;
      const bb = cubeBox(cb);
      if (boxOverlap(c, h, bb)) handleHit(body, ax, d, { min: bb.min.clone(), max: bb.max.clone(), owner: cb });
    }
  }
}

function moveAxis(body, ax, d) {
  if (d === 0) return false;
  const k = AX[ax];
  const before = body.c[k];
  body.c[k] += d;
  if (G.linked && body.canTeleport) {
    for (let i = 0; i < 2; i++) {
      const P = G.portals[i];
      if (P.axis !== ax) continue;
      const plane = P.c[k];
      const d0 = (before - plane) * P.sign, d1 = (body.c[k] - plane) * P.sign;
      if (d0 >= 0 && d1 < 0) {
        const l = P.local(body.c, _l);
        if (Math.abs(l.x) <= PORTAL_W / 2 + 0.12 && Math.abs(l.y) <= PORTAL_H / 2 + 0.06) { teleportBody(body, i); return true; }
      }
    }
  }
  resolveAxis(body, ax, d);
  return false;
}

function moveBody(body, dt) {
  body.onGroundPrev = body.onGround;
  body.onGround = false; body.landSpeed = 0; body.stepped = 0;
  const v = body.vel;
  const maxd = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt;
  const n = Math.min(40, Math.max(1, Math.ceil(maxd / 0.1)));
  const sdt = dt / n;
  for (let i = 0; i < n; i++) {
    if (moveAxis(body, 1, v.y * sdt)) continue;
    if (moveAxis(body, 0, v.x * sdt)) continue;
    moveAxis(body, 2, v.z * sdt);
  }
}

const _ext = (vec, h) => Math.abs(vec.x) * h.x + Math.abs(vec.y) * h.y + Math.abs(vec.z) * h.z;
function teleportBody(body, i) {
  const Q = G.portals[1 - i];
  const c = body.c.clone().applyMatrix4(G.T[i]);
  body.vel.applyMatrix3(G.R[i]);
  const l = Q.local(c, v3());
  const mr = Math.max(0, PORTAL_W / 2 - _ext(Q.r, body.h) - 0.01);
  const mu = Math.max(0, PORTAL_H / 2 - _ext(Q.u, body.h) - 0.01);
  l.x = clamp(l.x, -mr, mr); l.y = clamp(l.y, -mu, mu);
  l.z = Math.max(l.z, _ext(Q.n, body.h) + 0.02);
  body.c.copy(Q.c).addScaledVector(Q.r, l.x).addScaledVector(Q.u, l.y).addScaledVector(Q.n, l.z);
  body.teleported = true;
  if (body.onTeleport) body.onTeleport(i);
}

function depenetrate(body, isPlayer) {
  if (!body || !body.c) return;
  for (let iter = 0; iter < 6; iter++) {
    let moved = false;
    const fix = (b) => {
      if (!boxOverlap(body.c, body.h, b, 0.0005)) return;
      let best = Infinity, bk = 'y', bs = 1;
      for (const k of AX) {
        const pp = b.max[k] - (body.c[k] - body.h[k]);
        const pn = (body.c[k] + body.h[k]) - b.min[k];
        if (pp < best) { best = pp; bk = k; bs = 1; }
        if (pn < best) { best = pn; bk = k; bs = -1; }
      }
      body.c[bk] += bs * (best + 0.002);
      moved = true;
    };
    for (const b of G.collide) if (b.solid) fix(b);
    for (const b of G.dynBlockers) fix(b);
    if (!moved) break;
  }
}

const _I = new THREE.Matrix4();
function nearIdentity(m) {
  const a = m.elements, b = _I.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 2e-3) return false;
  return true;
}
