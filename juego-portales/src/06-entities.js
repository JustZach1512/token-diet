// ───────────────────────── elementos de las pruebas ─────────────────────────
const SHARED = {};
function sharedGeo() {
  if (SHARED.ready) return SHARED;
  const s = PHYS.cubeHalf * 2;
  SHARED.cubeCore = new THREE.BoxGeometry(s * 0.94, s * 0.94, s * 0.94);
  SHARED.cubeCorner = new THREE.BoxGeometry(s * 0.3, s * 0.3, s * 0.3);
  SHARED.sphere = new THREE.SphereGeometry(1, 20, 14);
  SHARED.ready = true;
  return SHARED;
}

// ───── cubos ─────
class Cube {
  constructor(pos, o = {}) {
    sharedGeo();
    this.kind = 'cube';
    this.c = pos.clone(); this.h = v3(PHYS.cubeHalf, PHYS.cubeHalf, PHYS.cubeHalf);
    this.vel = v3(); this.spawn = pos.clone();
    this.dropper = o.dropper || null; this.companion = !!o.companion;
    this.alive = true; this.held = false; this.link = null; this.dissolving = 0;
    this.canTeleport = true; this.canStep = false; this.onGround = false; this.ghost = new Set();
    this.q = new THREE.Quaternion(); this.qTarget = new THREE.Quaternion();
    this.glow = 0; this.onButton = false;
    const t = this.companion ? TEX.companion : TEX.cube;
    this.mat = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissiveMap, emissive: new THREE.Color(0.2, 0.55, 1.0), emissiveIntensity: 0.8, roughness: 0.45, metalness: 0.25, envMapIntensity: 0.8, transparent: false });
    this.mesh = this.build(); this.ghostMesh = this.build(); this.ghostMesh.visible = false;
    G.dyn.add(this.mesh, this.ghostMesh);
    this.onTeleport = (i) => {
      const T = G.T[i];
      if (this.held) {
        this.link = this.link ? T.clone().multiply(this.link) : T.clone();
        if (nearIdentity(this.link)) this.link = null;
      }
      const qr = new THREE.Quaternion().setFromRotationMatrix(T);
      this.q.premultiply(qr); this.qTarget.premultiply(qr);
      Sound.play('teleport');
    };
  }
  build() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(SHARED.cubeCore, this.mat); core.castShadow = true; core.receiveShadow = true; g.add(core);
    const s = PHYS.cubeHalf * 0.86;
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const m = new THREE.Mesh(SHARED.cubeCorner, MAT.trim); m.position.set(x * s, y * s, z * s); m.castShadow = true; g.add(m);
    }
    return g;
  }
  get bottom() { return this.c.y - this.h.y; }
  fizzle() {
    if (!this.alive || this.dissolving) return;
    if (this.held) G.player.drop(true);
    this.dissolving = 0.001; this.vel.set(0, 0.3, 0);
    Sound.play('fizzle');
    spawnBurst(this.c, new THREE.Color(0.5, 0.8, 1.0), 40, 2.5);
    G.events.cubeFizzled = (G.events.cubeFizzled || 0) + 1;
  }
  destroy() {
    if (this.held) G.player.drop(true);
    this.alive = false; this.mesh.visible = false; this.ghostMesh.visible = false;
    this.dissolving = 0;
    G.cubes = G.cubes.filter(c => c !== this);
    G.dyn.remove(this.mesh, this.ghostMesh);
    if (this.noRespawn) return;
    if (this.dropper) this.dropper.schedule(1.0);
    else if (this.spawn) { const sp = this.spawn, comp = this.companion; after(0.9, () => spawnCube(sp, { companion: comp })); }
  }
  update(dt) {
    if (!this.alive) return;
    if (this.dissolving) {
      this.dissolving += dt;
      this.c.addScaledVector(this.vel, dt);
      const k = clamp(this.dissolving / 0.7, 0, 1);
      this.mat.emissive.setRGB(0.6 + k * 3, 0.8 + k * 3, 1.5 + k * 3);
      this.mesh.scale.setScalar(1 - k * 0.6);
      if (this.dissolving > 0.7) this.destroy();
      return;
    }
    if (this.held) this.followHold(dt);
    else {
      this.vel.y = Math.max(this.vel.y - PHYS.gravity * G.gravityScale * dt, -PHYS.terminal);
      if (this.onGround) {
        const sp = Math.hypot(this.vel.x, this.vel.z), dec = 16 * dt;
        const k = sp > dec ? (sp - dec) / sp : 0;
        this.vel.x *= k; this.vel.z *= k;
      }
    }
    const wasGround = this.onGround, vy = this.vel.y;
    moveBody(this, dt);
    if (this.onGround && !wasGround && vy < -3) Sound.play('thud', { v: clamp(-vy / 60, 0.02, 0.15) });
    if (!this.held) this.qTarget.copy(snapQuat(this.q));
    this.q.slerp(this.qTarget, 1 - Math.exp(-14 * dt));
    for (const z of G.goos) if (this.c.y < z.max.y - 0.1 && this.c.x > z.min.x && this.c.x < z.max.x && this.c.z > z.min.z && this.c.z < z.max.z) { spawnBurst(this.c, new THREE.Color(0.5, 1, 0.2), 20, 2); this.destroy(); return; }
    for (const f of G.fizzlers) if (boxOverlap(this.c, this.h, f)) { this.fizzle(); return; }
    if (this.c.y < G.killY) { this.destroy(); return; }
    this.glow = damp(this.glow, this.onButton ? 1 : 0, 6, dt);
    this.mat.emissive.copy(SIGNAL_OFF).lerp(SIGNAL_ON, this.glow);
    this.mat.emissiveIntensity = 0.7 + this.glow * 1.6;
    if (this.companion) { this.mat.emissive.setRGB(1, 0.35, 0.6); }
  }
  followHold(dt) {
    const p = G.player;
    const target = p.holdTarget();
    const pv = p.vel.clone();
    if (this.link) { target.applyMatrix4(this.link); pv.applyMatrix3(new THREE.Matrix3().setFromMatrix4(this.link)); }
    const err = target.sub(this.c);
    const dist = err.length();
    // se suelta solo si queda bloqueado lejos del punto de agarre durante un rato
    this.farT = dist > 2.6 ? (this.farT || 0) + dt : 0;
    if (this.farT > 0.35 || dist > 8) { this.farT = 0; p.drop(); return; }
    const corr = err.multiplyScalar(16);
    if (corr.length() > 22) corr.setLength(22);
    this.vel.copy(pv).add(corr);
    this.baseVel = pv;
    if (!this.link) this.qTarget.setFromAxisAngle(v3(0, 1, 0), p.yaw);
  }
  syncMesh() {
    if (!this.alive) return;
    this.mesh.position.copy(this.c); this.mesh.quaternion.copy(this.q);
    // copia "fantasma" al otro lado cuando el cubo atraviesa un portal
    let ghost = false;
    if (G.linked && !this.dissolving) {
      for (let i = 0; i < 2; i++) {
        const P = G.portals[i], l = P.local(this.c, _l);
        if (Math.abs(l.z) < this.h.x * 1.75 && Math.abs(l.x) < PORTAL_W / 2 && Math.abs(l.y) < PORTAL_H / 2) {
          const m = new THREE.Matrix4().compose(this.c, this.q, v3(1, 1, 1)).premultiply(G.T[i]);
          m.decompose(this.ghostMesh.position, this.ghostMesh.quaternion, this.ghostMesh.scale);
          ghost = true; break;
        }
      }
    }
    this.ghostMesh.visible = ghost;
  }
}
function snapQuat(q) {
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q), e = m.elements;
  const cols = [v3(e[0], e[1], e[2]), v3(e[4], e[5], e[6])];
  const snap = (v) => { const a = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)]; const i = a.indexOf(Math.max(...a)); const o = v3(); o.setComponent(i, Math.sign(v.getComponent(i))); return o; };
  const x = snap(cols[0]), y = snap(cols[1]);
  if (Math.abs(x.dot(y)) > 0.5) return q.clone();
  const z = v3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
function spawnCube(pos, o = {}) {
  const c = new Cube(pos, o);
  c.token = G.levelToken;
  G.cubes.push(c);
  return c;
}

// ───── dispensador de cubos ─────
class Dropper {
  constructor(spec) {
    this.pos = v3(...spec.pos); this.companion = !!spec.companion; this.timer = spec.initial === false ? -1 : 0.4; this.cube = null;
    const g = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.6, 24, 1, true), MAT.trim); tube.position.y = 0.8;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 3.0, 4.5) })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.02;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 1.4, 24, 1, true), MAT.glass); glass.position.y = -0.6;
    g.add(tube, ring, glass); g.position.copy(this.pos); G.dyn.add(g);
    this.mesh = g;
  }
  schedule(t) { this.timer = t; }
  update(dt) {
    if (this.timer < 0) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = -1;
      this.cube = spawnCube(this.pos.clone().add(v3(0, -0.7, 0)), { dropper: this, companion: this.companion });
      this.cube.vel.y = -1;
      Sound.play('drop');
    }
  }
  redispense() {
    if (this.cube && this.cube.alive) { this.cube.noRespawn = true; this.cube.fizzle(); }
    this.timer = 0.6;
  }
}

// ───── botones de suelo ─────
class FloorButton {
  constructor(L, spec) {
    this.id = spec.id; this.pos = v3(...spec.pos); this.pressed = false; this.anim = 0;
    addBox(L, this.pos.x - 0.92, this.pos.y, this.pos.z - 0.92, this.pos.x + 0.92, this.pos.y + 0.12, this.pos.z + 0.92, 'metal', { render: false, shot: true, top: 'none' });
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 1.04, 0.12, 40), MAT.trim); base.position.y = 0.06; base.receiveShadow = true;
    this.ringMat = new THREE.MeshBasicMaterial({ color: SIGNAL_OFF.clone().multiplyScalar(2.5) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.035, 8, 48), this.ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.125;
    this.plateMat = new THREE.MeshStandardMaterial({ color: 0xd7342a, roughness: 0.35, metalness: 0.2, emissive: new THREE.Color(0.6, 0.06, 0.03), emissiveIntensity: 0.6 });
    this.plate = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.76, 0.14, 40), this.plateMat); this.plate.castShadow = true; this.plate.receiveShadow = true;
    g.add(base, ring, this.plate); g.position.copy(this.pos); G.dyn.add(g);
  }
  update(dt) {
    const p = G.player, ps = this.pos;
    let on = false;
    for (const cb of G.cubes) {
      cb.onButton = cb.onButton && cb.alive;
      if (!cb.alive || cb.held || cb.dissolving) continue;
      if (Math.abs(cb.c.x - ps.x) < 0.78 && Math.abs(cb.c.z - ps.z) < 0.78 && cb.bottom < ps.y + 0.5 && cb.bottom > ps.y - 0.2) { on = true; cb.onButton = true; }
    }
    const feet = p.c.y - p.h.y;
    if (p.alive && Math.abs(p.c.x - ps.x) < 0.85 && Math.abs(p.c.z - ps.z) < 0.85 && feet < ps.y + 0.45 && feet > ps.y - 0.2) on = true;
    if (on !== this.pressed) { this.pressed = on; Sound.play(on ? 'buttonOn' : 'buttonOff'); }
    this.anim = damp(this.anim, on ? 1 : 0, 14, dt);
    this.plate.position.y = 0.12 + 0.07 + 0.11 * (1 - this.anim) - 0.06 * this.anim;
    this.ringMat.color.copy(SIGNAL_OFF).lerp(SIGNAL_ON, this.anim).multiplyScalar(2.6);
  }
  get on() { return this.pressed; }
}
function resetCubeButtonFlags() { for (const cb of G.cubes) cb.onButton = false; }

// ───── pulsador de pedestal (temporizado) ─────
class Pedestal {
  constructor(L, spec) {
    this.id = spec.id; this.pos = v3(...spec.pos); this.duration = spec.duration || 0; this.action = spec.action || 'timer';
    this.until = -1; this.lastTick = 0; this.flash = 0; this.target = spec.target || null;
    const b = addBox(L, this.pos.x - 0.22, this.pos.y, this.pos.z - 0.22, this.pos.x + 0.22, this.pos.y + 1.15, this.pos.z + 0.22, 'metal', { render: false, top: 'none' });
    b.owner = this;
    const g = new THREE.Group();
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.1, 24), MAT.trim); foot.position.y = 0.05;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 1.0, 16), MAT.trimLight); col.position.y = 0.6; col.castShadow = true;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.12, 24), MAT.trim); head.position.y = 1.1; head.castShadow = true;
    this.btnMat = new THREE.MeshStandardMaterial({ color: 0xe03a2c, emissive: new THREE.Color(1, 0.12, 0.05), emissiveIntensity: 0.8, roughness: 0.3 });
    this.btn = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.08, 20), this.btnMat); this.btn.position.y = 1.19;
    this.ringMat = new THREE.MeshBasicMaterial({ color: SIGNAL_OFF.clone().multiplyScalar(2.5) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 6, 28), this.ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 1.165;
    g.add(foot, col, head, this.btn, ring); g.position.copy(this.pos); G.dyn.add(g);
  }
  press() {
    this.flash = 1;
    Sound.play('buttonOn');
    if (this.action === 'drop') { for (const d of G.droppers) if (!this.target || d.id === this.target) d.redispense(); return; }
    if (this.action === 'portals') { clearPortals(); return; }
    this.until = G.time + this.duration; this.lastTick = G.time;
  }
  get on() { return this.until > G.time; }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 3);
    this.btn.position.y = 1.19 - this.flash * 0.05;
    const on = this.on;
    this.ringMat.color.copy(on ? SIGNAL_ON : SIGNAL_OFF).multiplyScalar(2.5);
    if (on && G.time - this.lastTick >= 0.5) { this.lastTick = G.time; Sound.play('tick', { hi: Math.round(G.time * 2) % 2 === 0 }); }
  }
}

// ───── puertas ─────
class Door {
  constructor(spec) {
    this.requires = spec.requires || []; this.w = spec.w || 2; this.hgt = spec.h || 3;
    this.axis = spec.axis; // eje de la normal de la puerta: 'x' o 'z'
    this.pos = v3(...spec.pos); this.open = 0; this.wasOpen = false; this.latch = !!spec.latch; this.latched = false;
    const lat = this.axis === 'x' ? 'z' : 'x';
    this.lat = lat;
    const lo = this.pos.clone(), hi = this.pos.clone();
    lo[this.axis] -= 0.2; hi[this.axis] += 0.2; lo[lat] -= this.w / 2; hi[lat] += this.w / 2; hi.y += this.hgt;
    this.box = new Box(lo, hi, 'metal', { render: false });
    const g = new THREE.Group();
    const panelMat = new THREE.MeshStandardMaterial({ map: TEX.white.map, normalMap: TEX.white.normalMap, roughness: 0.4, metalness: 0.05, envMapIntensity: 0.6, color: 0xe9ecef });
    const pw = this.w / 2, depth = 0.22;
    const geo = this.axis === 'x' ? new THREE.BoxGeometry(depth, this.hgt, pw) : new THREE.BoxGeometry(pw, this.hgt, depth);
    this.pa = new THREE.Mesh(geo, panelMat); this.pb = new THREE.Mesh(geo, panelMat);
    for (const p of [this.pa, this.pb]) { p.castShadow = true; p.receiveShadow = true; g.add(p); }
    const stripeGeo = this.axis === 'x' ? new THREE.BoxGeometry(depth + 0.02, 0.18, pw) : new THREE.BoxGeometry(pw, 0.18, depth + 0.02);
    this.sa = new THREE.Mesh(stripeGeo, MAT.stripes); this.sb = new THREE.Mesh(stripeGeo, MAT.stripes);
    g.add(this.sa, this.sb);
    // marco
    const fw = 0.22, fd = 0.5;
    const mk = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), MAT.trim); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    if (this.axis === 'x') {
      mk(fd, this.hgt + fw, fw, 0, (this.hgt + fw) / 2, -this.w / 2 - fw / 2);
      mk(fd, this.hgt + fw, fw, 0, (this.hgt + fw) / 2, this.w / 2 + fw / 2);
      mk(fd, fw, this.w + fw * 2, 0, this.hgt + fw / 2, 0);
    } else {
      mk(fw, this.hgt + fw, fd, -this.w / 2 - fw / 2, (this.hgt + fw) / 2, 0);
      mk(fw, this.hgt + fw, fd, this.w / 2 + fw / 2, (this.hgt + fw) / 2, 0);
      mk(this.w + fw * 2, fw, fd, 0, this.hgt + fw / 2, 0);
    }
    this.lightMat = new THREE.MeshBasicMaterial({ color: SIGNAL_OFF.clone().multiplyScalar(2.5) });
    const lg = this.axis === 'x' ? new THREE.BoxGeometry(fd + 0.04, 0.06, this.w * 0.8) : new THREE.BoxGeometry(this.w * 0.8, 0.06, fd + 0.04);
    const l = new THREE.Mesh(lg, this.lightMat); l.position.y = this.hgt + fw * 0.5; g.add(l);
    g.position.copy(this.pos); G.dyn.add(g);
    this.place();
  }
  place() {
    const off = (this.w / 4) + this.open * (this.w / 2 - 0.02);
    const k = this.lat;
    this.pa.position.set(0, this.hgt / 2, 0); this.pb.position.set(0, this.hgt / 2, 0);
    this.pa.position[k] = -off; this.pb.position[k] = off;
    this.sa.position.copy(this.pa.position); this.sb.position.copy(this.pb.position);
    this.sa.position.y = this.sb.position.y = this.hgt * 0.62;
  }
  get solid() { return this.open < 0.55; }
  update(dt) {
    let want = signalsOn(this.requires);
    if (this.latch && want) this.latched = true;
    if (this.latched) want = true;
    const prev = this.open;
    this.open = clamp(this.open + (want ? 2.2 : -2.6) * dt, 0, 1);
    if ((this.open > 0 && prev === 0) || (this.open < 1 && prev === 1)) Sound.play('door');
    this.lightMat.color.copy(want ? SIGNAL_ON : SIGNAL_OFF).multiplyScalar(2.6);
    this.place();
  }
}

// ───── plataformas móviles (puentes) ─────
class Platform {
  constructor(spec) {
    this.requires = spec.requires || []; this.latch = !!spec.latch; this.latched = false;
    this.a = { min: v3(...spec.from[0]), max: v3(...spec.from[1]) };
    this.b = { min: v3(...spec.to[0]), max: v3(...spec.to[1]) };
    this.t = 0; this.speed = spec.speed || 0.5;
    this.box = new Box(this.a.min.clone(), this.a.max.clone(), 'metal', { render: false });
    this.box.owner = this;
    const g = new THREE.Group();
    this.body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), MAT.trimLight); this.body.castShadow = true; this.body.receiveShadow = true;
    this.edgeMat = new THREE.MeshBasicMaterial({ color: SIGNAL_OFF.clone().multiplyScalar(2.5) });
    this.edge = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.edgeMat);
    g.add(this.body, this.edge); G.dyn.add(g); this.mesh = g;
    this.delta = v3();
    this.sync();
  }
  sync() {
    const lo = this.a.min.clone().lerp(this.b.min, this.t), hi = this.a.max.clone().lerp(this.b.max, this.t);
    this.box.min.copy(lo); this.box.max.copy(hi);
    const size = hi.clone().sub(lo);
    this.mesh.position.copy(lo).add(hi).multiplyScalar(0.5);
    this.body.scale.copy(size);
    this.edge.scale.set(size.x + 0.04, 0.05, size.z + 0.04); this.edge.position.y = size.y / 2 - 0.04;
  }
  update(dt) {
    let want = signalsOn(this.requires);
    if (this.latch && want) this.latched = true;
    if (this.latched) want = true;
    const before = this.box.min.clone();
    const prevT = this.t;
    this.t = clamp(this.t + (want ? 1 : -1) * this.speed * dt, 0, 1);
    this.sync();
    this.delta.copy(this.box.min).sub(before);
    if (this.t !== prevT) for (const body of [G.player, ...G.cubes]) if (body.groundOwner === this) body.c.add(this.delta);
    this.edgeMat.color.copy(want ? SIGNAL_ON : SIGNAL_OFF).multiplyScalar(2.5);
  }
}

// ───── bolas de energía ─────
class Launcher {
  constructor(L, spec) {
    this.pos = v3(...spec.pos); this.dir = v3(...spec.dir).normalize(); this.target = spec.receiver || null;
    this.speed = spec.speed || 7; this.life = spec.life || 11; this.cool = 1.2; this.pellet = null;
    const back = this.pos.clone().addScaledVector(this.dir, -0.45);
    const lo = back.clone().min(this.pos).subScalar(0.5), hi = back.clone().max(this.pos).addScalar(0.5);
    for (const k of AX) if (Math.abs(this.dir[k]) > 0.5) { lo[k] = Math.min(back[k], this.pos[k] - 0.08 * this.dir[k]); hi[k] = Math.max(back[k], this.pos[k] - 0.08 * this.dir[k]); }
    addBox(L, lo.x, lo.y, lo.z, hi.x, hi.y, hi.z, 'metal', { render: false });
    const g = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.42), MAT.trim);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 10, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.2, 1.2) })); ring.position.z = 0.22;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.27, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.1, 0.4) })); hole.position.z = 0.215;
    const stripes = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.12, 0.44), MAT.stripes); stripes.position.y = -0.44;
    g.add(housing, ring, hole, stripes);
    g.position.copy(this.pos).addScaledVector(this.dir, -0.22);
    g.lookAt(g.position.clone().add(this.dir));
    G.dyn.add(g);
    this.light = new THREE.PointLight(new THREE.Color(1, 0.8, 0.4), 0, 7, 2); G.dyn.add(this.light);
  }
  update(dt) {
    if (this.target && signalsOn([this.target])) { if (this.pellet) this.pellet.kill(false); return; }
    if (this.pellet) {
      if (!this.pellet.alive) { this.pellet = null; this.cool = 1.2; this.light.intensity = 0; }
      else { this.light.position.copy(this.pellet.c); this.light.intensity = 7; }
      return;
    }
    this.cool -= dt;
    if (this.cool <= 0) {
      this.pellet = new Pellet(this.pos.clone().addScaledVector(this.dir, 0.25), this.dir.clone().multiplyScalar(this.speed), this.life);
      G.pellets.push(this.pellet);
      Sound.play('pellet');
    }
  }
}
class Pellet {
  constructor(pos, vel, life) {
    sharedGeo();
    this.kind = 'pellet'; this.c = pos; this.vel = vel; this.life = life; this.h = v3(0.17, 0.17, 0.17);
    this.alive = true; this.canTeleport = true; this.canStep = false; this.ghost = new Set();
    const g = new THREE.Group();
    const core = new THREE.Mesh(SHARED.sphere, new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.2, 2.2) })); core.scale.setScalar(0.16);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.dot, color: new THREE.Color(2.4, 1.7, 0.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.scale.setScalar(1.3);
    g.add(core, sp); this.mesh = g; G.dyn.add(g);
    this.trailN = 26; this.trail = [];
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.trailN * 3), 3));
    const col = new Float32Array(this.trailN * 3);
    for (let i = 0; i < this.trailN; i++) { const k = 1 - i / this.trailN; col[i * 3] = 2.2 * k; col[i * 3 + 1] = 1.5 * k; col[i * 3 + 2] = 0.4 * k; }
    tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.trailMesh = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.trailMesh.frustumCulled = false;
    G.dyn.add(this.trailMesh);
    this.onTeleport = () => { this.trail.length = 0; Sound.play('teleport'); };
  }
  kill(explode = true) {
    if (!this.alive) return;
    this.alive = false;
    G.dyn.remove(this.mesh, this.trailMesh);
    if (explode) { spawnBurst(this.c, new THREE.Color(1.6, 1.1, 0.4), 50, 4); Sound.play('explode'); }
  }
  update(dt) {
    if (!this.alive) return;
    this.life -= dt;
    if (this.life <= 0) { this.kill(true); return; }
    this.bounced = false;
    moveBody(this, dt);
    if (this.bounced) { Sound.play('bounce'); spawnBurst(this.c, new THREE.Color(1.4, 1, 0.4), 6, 1.5); }
    for (const r of G.receivers) {
      if (!r.active && this.c.distanceTo(r.pos) < 0.95) { r.capture(); this.kill(false); return; }
    }
    const p = G.player;
    if (p.alive && Math.abs(this.c.x - p.c.x) < p.h.x + 0.2 && Math.abs(this.c.y - p.c.y) < p.h.y + 0.2 && Math.abs(this.c.z - p.c.z) < p.h.z + 0.2) {
      this.kill(true); killPlayer('pellet'); return;
    }
    for (const f of G.fizzlers) if (boxOverlap(this.c, this.h, f) && f.eatsPellets) { this.kill(true); return; }
    if (this.c.y < G.killY) { this.kill(false); return; }
    this.trail.unshift(this.c.clone());
    if (this.trail.length > this.trailN) this.trail.length = this.trailN;
  }
  syncMesh() {
    if (!this.alive) return;
    this.mesh.position.copy(this.c);
    const pa = this.trailMesh.geometry.attributes.position;
    for (let i = 0; i < this.trailN; i++) { const q = this.trail[Math.min(i, this.trail.length - 1)] || this.c; pa.setXYZ(i, q.x, q.y, q.z); }
    pa.needsUpdate = true;
  }
}
class Receiver {
  constructor(L, spec) {
    this.id = spec.id; this.n = v3(...spec.normal); this.wallPos = v3(...spec.pos);
    this.pos = this.wallPos.clone().addScaledVector(this.n, 0.42);
    this.active = false; this.reset = spec.reset || 0; this.timer = 0;
    const lo = this.wallPos.clone().subScalar(0.55), hi = this.wallPos.clone().addScalar(0.55);
    for (const k of AX) if (Math.abs(this.n[k]) > 0.5) { lo[k] = Math.min(this.wallPos[k], this.pos[k] - this.n[k] * 0.06); hi[k] = Math.max(this.wallPos[k], this.pos[k] - this.n[k] * 0.06); }
    addBox(L, lo.x, lo.y, lo.z, hi.x, hi.y, hi.z, 'metal', { render: false });
    const g = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.4), MAT.trim);
    housing.position.z = 0.18;
    this.ringMat = new THREE.MeshBasicMaterial({ color: SIGNAL_OFF.clone().multiplyScalar(3) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 10, 36), this.ringMat); ring.position.z = 0.4;
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.08, 0.12) });
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.3, 28), this.coreMat); core.position.z = 0.39;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.02), this.ringMat); cross.position.z = 0.385;
    const cross2 = cross.clone(); cross2.rotation.z = Math.PI / 2;
    g.add(housing, ring, core, cross, cross2);
    g.position.copy(this.wallPos); g.lookAt(this.wallPos.clone().add(this.n));
    G.dyn.add(g);
  }
  capture() {
    this.active = true; this.timer = this.reset;
    Sound.play('capture');
    spawnBurst(this.pos, new THREE.Color(1.6, 1.1, 0.4), 60, 3);
    this.ringMat.color.copy(SIGNAL_ON).multiplyScalar(3);
    this.coreMat.color.setRGB(4, 2.8, 1);
    G.events.received = true;
  }
  get on() { return this.active; }
  update(dt) {
    if (this.active && this.reset) {
      this.timer -= dt;
      if (this.timer <= 0) { this.active = false; this.ringMat.color.copy(SIGNAL_OFF).multiplyScalar(3); this.coreMat.color.setRGB(0.05, 0.08, 0.12); }
    }
  }
}

// ───── campos de emancipación ─────
const FIZZ_FS = /* glsl */`
uniform float uTime; uniform vec2 uSize; varying vec2 vUv;
${GLSL_NOISE}
void main(){
  vec2 p = vUv*uSize;
  float n = fbm(vec2(p.x*1.4, p.y*0.7 - uTime*0.9));
  float lines = 0.5 + 0.5*sin(p.y*22.0 + uTime*5.0 + n*4.0);
  float sp = step(0.988, hash(floor(p*vec2(26.0,26.0)) + floor(uTime*14.0)));
  float edge = smoothstep(0.0, 0.06, vUv.x)*smoothstep(1.0, 0.94, vUv.x);
  vec3 col = vec3(0.22, 0.5, 1.0)*(0.05 + 0.2*n + 0.06*lines) + vec3(0.65, 0.88, 1.0)*sp*1.4;
  gl_FragColor = vec4(col*edge, 1.0);
}`;
class Fizzler {
  constructor(spec) {
    this.min = v3(...spec.min); this.max = v3(...spec.max); this.eatsPellets = false;
    const size = this.max.clone().sub(this.min);
    const thin = size.x < size.z ? 'x' : 'z';
    const wide = thin === 'x' ? 'z' : 'x';
    const w = size[wide], h = size.y;
    this.uniforms = { uTime: { value: 0 }, uSize: { value: new THREE.Vector2(w, h) } };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: PORTAL_VS, fragmentShader: FIZZ_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(this.min).add(this.max).multiplyScalar(0.5);
    if (thin === 'x') m.rotation.y = Math.PI / 2;
    m.renderOrder = 5;
    G.dyn.add(m);
    // emisores en los extremos
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(thin === 'x' ? 0.3 : 0.16, h, thin === 'x' ? 0.16 : 0.3), MAT.trim);
      post.position.copy(m.position); post.position[wide] += s * (w / 2 - 0.08);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(thin === 'x' ? 0.06 : 0.02, h * 0.96, thin === 'x' ? 0.02 : 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.4, 5) }));
      strip.position.copy(post.position); strip.position[wide] -= s * 0.09;
      G.dyn.add(post, strip);
    }
  }
}

// ───── fluido tóxico ─────
const GOO_VS = /* glsl */`
uniform float uTime; varying vec3 vPos;
void main(){ vec4 wp = modelMatrix*vec4(position,1.0);
  wp.y += sin(wp.x*1.3+uTime*1.1)*0.035 + sin(wp.z*1.7-uTime*0.8)*0.035;
  vPos = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`;
const GOO_FS = /* glsl */`
uniform float uTime; varying vec3 vPos;
${GLSL_NOISE}
void main(){
  vec2 p = vPos.xz*0.38;
  float n = fbm(p + vec2(uTime*0.05, uTime*0.03));
  float n2 = fbm(p*2.3 - vec2(uTime*0.09, -uTime*0.06) + n*1.5);
  vec3 deep = vec3(0.05, 0.13, 0.01), mid = vec3(0.25, 0.55, 0.04), hi = vec3(0.75, 1.3, 0.15);
  vec3 col = mix(deep, mid, smoothstep(0.25, 0.6, n2));
  col = mix(col, hi, smoothstep(0.62, 0.86, n2));
  float bub = smoothstep(0.82, 0.9, fbm(p*6.0 + uTime*0.25));
  col += vec3(0.8, 1.2, 0.4)*bub*0.8;
  vec3 V = normalize(cameraPosition - vPos);
  float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
  col += vec3(0.25, 0.45, 0.2)*fres;
  gl_FragColor = vec4(col, 1.0);
}`;
class Goo {
  constructor(spec) {
    this.min = v3(...spec.min); this.max = v3(...spec.max);
    const size = this.max.clone().sub(this.min);
    this.uniforms = { uTime: { value: 0 } };
    const geo = new THREE.PlaneGeometry(size.x, size.z, Math.ceil(size.x * 2), Math.ceil(size.z * 2));
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: GOO_VS, fragmentShader: GOO_FS }));
    m.position.set((this.min.x + this.max.x) / 2, this.max.y, (this.min.z + this.max.z) / 2);
    m.receiveShadow = false;
    G.dyn.add(m);
    const light = new THREE.PointLight(new THREE.Color(0.5, 1, 0.2), 4 + size.x * size.z * 0.06, Math.max(size.x, size.z) * 0.9 + 4, 2);
    light.position.set(m.position.x, this.max.y + 1.2, m.position.z);
    G.dyn.add(light);
  }
}

// ───── salida (ascensor) ─────
class Exit {
  constructor(spec) {
    this.pos = v3(...spec.pos);
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.3, 0.1, 40), MAT.trim); base.position.y = 0.05; base.receiveShadow = true;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 1.6, 2.6) })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.105;
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.6, 4.5) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.04, 8, 48), this.ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.11;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.1, 40, 1, true, 0.7, Math.PI * 2 - 1.4), MAT.glass); tube.position.y = 1.65;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.2, 40), MAT.trim); cap.position.y = 3.25;
    const lamp = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 40), MAT.lamp); lamp.rotation.x = Math.PI / 2; lamp.position.y = 3.13;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), MAT.exitSign); sign.position.set(0, 3.7, 0);
    this.sign = sign;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.0, 32, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.18, 0.3), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 1.6;
    g.add(base, disc, ring, tube, cap, lamp, sign, beam);
    g.position.copy(this.pos);
    if (spec.face !== undefined) g.rotation.y = spec.face;
    G.dyn.add(g);
    const light = new THREE.PointLight(new THREE.Color(0.6, 0.85, 1), 18, 9, 2); light.position.copy(this.pos).add(v3(0, 2.6, 0)); G.dyn.add(light);
  }
  update() {
    this.sign.lookAt(G.camera.position.x, this.sign.getWorldPosition(v3()).y, G.camera.position.z);
    const p = G.player;
    const feet = p.c.y - p.h.y;
    if (p.alive && Math.hypot(p.c.x - this.pos.x, p.c.z - this.pos.z) < 0.85 && feet > this.pos.y - 0.4 && feet < this.pos.y + 1.6) levelComplete();
  }
}

// ───── señales e indicadores ─────
function signalsOn(ids) {
  for (const id of ids) {
    const neg = id[0] === '!';
    const v = !!G.signals[neg ? id.slice(1) : id];
    if (neg ? v : !v) return false;
  }
  return true;
}
class Indicator {
  constructor(spec) {
    this.ids = spec.ids; this.mat = new THREE.MeshBasicMaterial({ color: SIGNAL_OFF.clone().multiplyScalar(1.8) });
    const pts = spec.points.map(p => v3(...p));
    const geo = new THREE.CircleGeometry(0.075, 12);
    const n = v3(...(spec.normal || [0, 1, 0]));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = a.distanceTo(b), steps = Math.max(1, Math.floor(len / 0.5));
      for (let s = 0; s < steps; s++) {
        const m = new THREE.Mesh(geo, this.mat);
        m.position.copy(a).lerp(b, s / steps).addScaledVector(n, 0.012);
        m.lookAt(m.position.clone().add(n));
        G.dyn.add(m);
      }
    }
    this.state = null;
  }
  update() {
    const on = signalsOn(this.ids);
    if (on !== this.state) { this.state = on; this.mat.color.copy(on ? SIGNAL_ON : SIGNAL_OFF).multiplyScalar(on ? 2.4 : 1.6); }
  }
}

// ───── partículas sueltas (chispas) ─────
const BURSTS = [];
function spawnBurst(pos, color, count = 24, speed = 3) {
  const N = count, positions = new Float32Array(N * 3), vels = [];
  for (let i = 0; i < N; i++) {
    positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y; positions[i * 3 + 2] = pos.z;
    const d = v3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
    vels.push(d);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ map: TEX.dot, color: color.clone().multiplyScalar(2.5), size: 0.12, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  G.fx.add(pts);
  BURSTS.push({ pts, vels, life: 0, max: 0.6 + Math.random() * 0.3 });
}
function updateBursts(dt) {
  for (let i = BURSTS.length - 1; i >= 0; i--) {
    const b = BURSTS[i];
    b.life += dt;
    const pa = b.pts.geometry.attributes.position;
    for (let k = 0; k < b.vels.length; k++) {
      const v = b.vels[k]; v.y -= 6 * dt;
      pa.setXYZ(k, pa.getX(k) + v.x * dt, pa.getY(k) + v.y * dt, pa.getZ(k) + v.z * dt);
    }
    pa.needsUpdate = true;
    b.pts.material.opacity = 1 - b.life / b.max;
    if (b.life >= b.max) { G.fx.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); BURSTS.splice(i, 1); }
  }
}
function clearBursts() { for (const b of BURSTS) { G.fx.remove(b.pts); b.pts.geometry.dispose(); } BURSTS.length = 0; }
