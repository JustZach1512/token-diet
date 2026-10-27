// ───────────────────────── jugador, dispositivo de portales y cámara ─────────────────────────
class Player {
  constructor() {
    this.kind = 'player';
    this.c = v3(); this.h = v3(PHYS.half, PHYS.halfY, PHYS.half); this.vel = v3();
    this.yaw = 0; this.pitch = 0; this.alive = true;
    this.canStep = true; this.canTeleport = true; this.onGround = false; this.onGroundPrev = false;
    this.ghost = new Set(); this.holding = null;
    this.jumpBuf = 0; this.coyote = 0; this.cooldown = 0;
    this.bobPhase = 0; this.bobAmt = 0; this.land = 0; this.stepAcc = 0; this.fov = 75; this.roll = 0;
    this.lastFired = 0; this.recoil = 0;
    this.onTeleport = (i) => {
      const R = G.R[i];
      const f = this.forward(v3()).applyMatrix3(R);
      const right = v3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).applyMatrix3(R);
      const upAfter = v3(0, 1, 0).applyMatrix3(R);
      this.pitch = clamp(Math.asin(clamp(f.y, -1, 1)), -1.53, 1.53);
      if (Math.hypot(f.x, f.z) > 0.25) this.yaw = Math.atan2(-f.x, -f.z);
      else if (Math.hypot(right.x, right.z) > 0.1) this.yaw = Math.atan2(-right.z, right.x);
      if (upAfter.y < 0.9) this.roll = (right.y >= 0 ? 1 : -1) * Math.min(0.6, Math.acos(clamp(upAfter.y, -1, 1)) * 0.35);
      if (this.holding) {
        const cb = this.holding;
        if (cb.link) {
          cb.link = cb.link.clone().multiply(G.T[1 - i]);
          if (nearIdentity(cb.link)) cb.link = null;
        } else {
          // el cubo no había cruzado: viaja con el jugador y aparece delante de él
          const eye = this.eye, f = this.forward(v3());
          const hit = castRay(eye, f, HOLD_DIST + 0.5, { ignore: cb });
          const dist = hit ? clamp(hit.t - 0.5, 0.4, HOLD_DIST) : HOLD_DIST;
          cb.c.copy(eye).addScaledVector(f, dist);
          cb.vel.copy(this.vel);
          cb.q.premultiply(new THREE.Quaternion().setFromRotationMatrix(G.T[i]));
          depenetrate(cb);
        }
      }
      G.stats.teleports++;
      G.flashPortal = { color: G.portals[1 - i].color, t: 1 };
      Sound.play('teleport');
    };
  }
  get eye() { return v3(this.c.x, this.c.y + PHYS.eye, this.c.z); }
  forward(out) { const cp = Math.cos(this.pitch); return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp); }
  holdTarget() { return this.eye.addScaledVector(this.forward(v3()), HOLD_DIST); }
  spawnAt(pos, yaw, pitch = 0) {
    this.c.set(pos.x, pos.y + this.h.y + 0.02, pos.z); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = pitch; this.alive = true; this.holding = null; this.roll = 0;
    this.onGround = false; this.land = 0; this.fov = 75;
  }
  update(dt) {
    if (!this.alive) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.ghost.clear();
    for (const cb of G.cubes) if (cb.alive && !cb.held && boxOverlap(this.c, this.h, cubeBox(cb), 0.01)) this.ghost.add(cb);
    let fx = 0, fz = 0;
    if (G.controlsEnabled) {
      if (Input.isDown('KeyW', 'ArrowUp')) fz += 1;
      if (Input.isDown('KeyS', 'ArrowDown')) fz -= 1;
      if (Input.isDown('KeyD', 'ArrowRight')) fx += 1;
      if (Input.isDown('KeyA', 'ArrowLeft')) fx -= 1;
      fx += Input.move.x; fz += Input.move.y;
    }
    const ml = Math.hypot(fx, fz); if (ml > 1) { fx /= ml; fz /= ml; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wx = -sy * fz + cy * fx, wz = -cy * fz - sy * fx;
    if (this.onGround) {
      let dx = wx * PHYS.walk - this.vel.x, dz = wz * PHYS.walk - this.vel.z;
      const dl = Math.hypot(dx, dz), md = PHYS.groundAccel * dt;
      if (dl > md) { dx *= md / dl; dz *= md / dl; }
      this.vel.x += dx; this.vel.z += dz;
    } else {
      const wl = Math.hypot(wx, wz);
      if (wl > 0.01) {
        const ux = wx / wl, uz = wz / wl;
        const proj = this.vel.x * ux + this.vel.z * uz;
        const add = clamp(PHYS.walk * wl - proj, 0, PHYS.airAccel * dt);
        this.vel.x += ux * add; this.vel.z += uz * add;
      }
    }
    this.funnel(dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.coyote = this.onGround ? 0.09 : Math.max(0, this.coyote - dt);
    if (this.jumpBuf > 0 && this.coyote > 0) { this.vel.y = PHYS.jump; this.jumpBuf = 0; this.coyote = 0; }
    this.vel.y = Math.max(this.vel.y - PHYS.gravity * G.gravityScale * dt, -PHYS.terminal);
    const was = this.onGround;
    moveBody(this, dt);
    if (this.onGround && !was && this.landSpeed > 4.5) {
      this.land = Math.min(1, this.landSpeed / 22);
      Sound.play('land', { v: clamp(this.landSpeed / 120, 0.03, 0.2) });
    }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 1) {
      this.stepAcc += hs * dt;
      if (this.stepAcc > 2.1) { this.stepAcc = 0; Sound.play('step'); }
    }
    this.hazards();
  }
  // al acercarse de frente a un portal, centra suavemente al jugador en la abertura
  funnel(dt) {
    if (!G.linked) return;
    for (const P of G.portals) {
      const l = P.local(this.c, _l);
      const vn = this.vel.dot(P.n);
      if (l.z < 0.05 || l.z > 1.4 || vn > -0.5) continue;
      if (Math.abs(l.x) > 0.95) continue;
      const eu = Math.abs(P.u.y) > 0.5 ? 0 : 1;
      if (eu === 0 && Math.abs(l.y) > PORTAL_H / 2) continue;
      const k = Math.min(1, dt * 7);
      this.c.addScaledVector(P.r, -l.x * k * 0.5);
      if (eu === 1 && Math.abs(l.y) < 1.3) this.c.addScaledVector(P.u, -l.y * k * 0.3);
    }
  }
  hazards() {
    const feet = this.c.y - this.h.y;
    for (const z of G.goos) {
      if (feet < z.max.y - 0.12 && this.c.x > z.min.x && this.c.x < z.max.x && this.c.z > z.min.z && this.c.z < z.max.z) { killPlayer('goo'); return; }
    }
    for (const f of G.fizzlers) {
      if (boxOverlap(this.c, this.h, f)) {
        if (this.holding) this.holding.fizzle();
        if (G.portals[0].placed || G.portals[1].placed) {
          clearPortals();
          if (!G.events.fizzMsg) { G.events.fizzMsg = true; G.onEvent('fizzler'); }
        }
      }
    }
    if (this.c.y < G.killY) killPlayer('fall');
  }
  use() {
    if (this.holding) { this.drop(); return; }
    const eye = this.eye, f = this.forward(v3());
    const hit = castRay(eye, f, 2.6, {});
    if (hit && hit.cube && !hit.cube.dissolving) { this.pick(hit.cube); return; }
    if (hit && hit.box && hit.box.owner instanceof Pedestal) { hit.box.owner.press(); return; }
    // coger a través de un portal
    const ph = rayPortals(eye, f, 2.6);
    if (ph) {
      const o = ph.point.clone().applyMatrix4(G.T[ph.i]), d = f.clone().applyMatrix3(G.R[ph.i]);
      const h2 = castRay(o.addScaledVector(d, 0.02), d, 2.6 - ph.t, {});
      if (h2 && h2.cube) { this.pick(h2.cube); h2.cube.link = G.T[ph.i].clone(); return; }
    }
    Sound.play('ui');
  }
  pick(cb) { this.holding = cb; cb.held = true; cb.link = null; Sound.play('pickup'); G.events.picked = true; }
  drop(silent) {
    const cb = this.holding; if (!cb) return;
    cb.held = false; cb.link = null; this.holding = null;
    if (cb.baseVel) cb.vel.copy(cb.baseVel);
    if (!silent) Sound.play('drop');
  }
  muzzle() {
    const f = this.forward(v3()), r = v3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const up = v3().crossVectors(r, f);
    return this.eye.addScaledVector(f, 0.55).addScaledVector(r, 0.2).addScaledVector(up, -0.17);
  }
  shoot(kind) {
    if (this.cooldown > 0 || !this.alive) return;
    this.cooldown = 0.25; this.lastFired = kind; this.recoil = 1;
    G.stats.shots++;
    const o = this.eye, d = this.forward(v3());
    const segs = [[this.muzzle(), null]];
    let ok = false, impact = null, hops = 0, remaining = 220;
    while (hops < 3) {
      const hit = castRay(o, d, remaining, { ignore: this.holding });
      const ph = rayPortals(o, d, hit ? hit.t : remaining);
      if (ph) {
        segs[segs.length - 1][1] = ph.point.clone();
        o.copy(ph.point).applyMatrix4(G.T[ph.i]); d.applyMatrix3(G.R[ph.i]).normalize();
        o.addScaledVector(d, 0.03); remaining -= ph.t; hops++;
        segs.push([o.clone(), null]);
        continue;
      }
      if (!hit) { segs[segs.length - 1][1] = o.clone().addScaledVector(d, 60); break; }
      impact = hit;
      segs[segs.length - 1][1] = hit.point.clone();
      if (hit.box && isPortalable(hit.box, hit.axis, hit.sign)) {
        const coord = hit.sign > 0 ? hit.box.max.getComponent(hit.axis) : hit.box.min.getComponent(hit.axis);
        const pt = hit.point.clone(); pt.setComponent(hit.axis, coord);
        ok = placePortalAt(kind, pt, hit.axis, hit.sign, d);
      }
      break;
    }
    const col = kind === 0 ? BLUE : ORANGE;
    for (const [a, b] of segs) if (a && b) spawnTracer(a, b, col);
    Sound.play('shoot', { kind });
    if (impact) {
      const n = v3(); n.setComponent(impact.axis, impact.sign);
      const at = impact.point.clone().addScaledVector(n, 0.05);
      if (ok) { setTimeout(() => Sound.play('open', { kind }), 60); spawnBurst(at, col, 30, 3.5); }
      else { setTimeout(() => Sound.play('fail'), 50); spawnBurst(at, col.clone().multiplyScalar(0.6), 14, 2); toast('Superficie no válida'); }
    }
    updateCrosshair();
  }
}

// trazas del disparo
const TRACERS = [];
const _tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
function spawnTracer(a, b, color) {
  const len = a.distanceTo(b);
  if (len < 0.01) return;
  const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(_tracerGeo, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(v3(0, 1, 0), b.clone().sub(a).normalize());
  m.scale.set(0.022, len, 0.022);
  m.frustumCulled = false;
  G.fx.add(m);
  TRACERS.push({ m, t: 0 });
}
function updateTracers(dt) {
  for (let i = TRACERS.length - 1; i >= 0; i--) {
    const tr = TRACERS[i]; tr.t += dt;
    tr.m.material.opacity = Math.max(0, 1 - tr.t / 0.22);
    tr.m.scale.x = tr.m.scale.z = 0.022 * (1 - tr.t / 0.3);
    if (tr.t > 0.22) { G.fx.remove(tr.m); tr.m.material.dispose(); TRACERS.splice(i, 1); }
  }
}

// ───── modelo del dispositivo de portales (escena aparte, se dibuja encima) ─────
function buildGun() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.22, metalness: 0.05, envMapIntensity: 1.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.45, metalness: 0.6, envMapIntensity: 0.9 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x6d757e, roughness: 0.35, metalness: 0.7 });
  const coreMat = new THREE.MeshBasicMaterial({ color: BLUE.clone().multiplyScalar(3) });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, envMapIntensity: 2 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.095, 0.44, 28), white); body.rotation.x = Math.PI / 2; body.position.z = 0.05;
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.095, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), white); back.rotation.x = Math.PI / 2; back.position.z = 0.27;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.098, 0.035, 28), dark); band.rotation.x = Math.PI / 2; band.position.z = 0.14;
  const front = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.09, 24), dark); front.rotation.x = Math.PI / 2; front.position.z = -0.2;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.05, 20), grey); nozzle.rotation.x = Math.PI / 2; nozzle.position.z = -0.26;
  const tip = new THREE.Mesh(new THREE.CircleGeometry(0.036, 20), coreMat); tip.position.z = -0.287; tip.rotation.y = Math.PI;
  const prongs = new THREE.Group(); prongs.position.z = -0.22;
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3 + Math.PI / 2;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.026, 0.16), dark);
    p.position.set(Math.cos(a) * 0.075, Math.sin(a) * 0.075, -0.07);
    p.rotation.set(-Math.sin(a) * 0.35, Math.cos(a) * 0.35, 0);
    prongs.add(p);
  }
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 16), glassMat); tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.098, 0.02);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 10), coreMat); rod.rotation.x = Math.PI / 2; rod.position.copy(tube.position);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.08), dark); grip.position.set(0, -0.11, 0.12); grip.rotation.x = 0.25;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.5, 14), new THREE.MeshStandardMaterial({ color: 0xc8692a, roughness: 0.8 }));
  arm.position.set(0.05, -0.2, 0.42); arm.rotation.set(1.1, 0, -0.25);
  g.add(body, back, band, front, nozzle, tip, prongs, tube, rod, grip, arm);
  g.userData = { coreMat, prongs };
  return g;
}

// figura del sujeto, visible solo a través de los portales
function buildBodyModel() {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0xd9682b, roughness: 0.75 });
  const top = new THREE.MeshStandardMaterial({ color: 0xe8e9ea, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc99272, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.5, metalness: 0.5 });
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.62, 6, 12), suit); legs.position.y = 0.55; legs.scale.x = 1.25;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.36, 6, 14), top); torso.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), skin); head.position.y = 1.62;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x2c1e17, roughness: 0.9 })); hair.position.y = 1.64;
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.2, 0.26), dark); bootL.position.set(-0.11, 0.1, -0.03);
  const bootR = bootL.clone(); bootR.position.x = 0.11;
  const gun = buildGun(); gun.scale.setScalar(1.4); gun.position.set(0.22, 1.12, -0.32);
  g.add(legs, torso, head, hair, bootL, bootR, gun);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
