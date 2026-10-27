// Procedural low-poly characters with a joint rig and pose-based animation.
import * as THREE from 'three';
import { getTextures } from './textures.js';
import { damp, clamp } from './util.js';

const INVISIBLE = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}

function capsule(r, len, mat, y = 0) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 8), mat);
  m.position.y = y;
  return m;
}

function sphere(r, mat, ws = 12, hs = 10, phi = Math.PI) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, phi), mat);
}

function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

class Rig {
  constructor() {
    this.root = new THREE.Group();
    this.meshes = [];
    this.mats = [];
    this.auraMeshes = [];
    this.phase = 0;
    this.time = Math.random() * 10;
    this.lie = 0;
  }

  add(parent, mesh) {
    parent.add(mesh);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    this.meshes.push(mesh);
    if (mesh.material && !this.mats.includes(mesh.material)) this.mats.push(mesh.material);
    return mesh;
  }

  buildAura() {
    this.mats = [...new Set(this.meshes.map((m) => m.material))];
    this.auraMat = new THREE.MeshBasicMaterial({
      color: 0xff3030, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    for (const m of this.meshes) {
      const a = new THREE.Mesh(m.geometry, this.auraMat);
      a.renderOrder = 20;
      a.visible = false;
      a.scale.setScalar(1.08);
      m.add(a);
      this.auraMeshes.push(a);
    }
  }

  setAura(color, opacity = 0.55) {
    const on = color !== null && color !== undefined;
    if (on) { this.auraMat.color.setHex(color); this.auraMat.opacity = opacity; }
    if (on === this._auraOn) return;
    this._auraOn = on;
    for (const a of this.auraMeshes) a.visible = on;
  }

  setOpacity(o) {
    if (this._op === o) return;
    this._op = o;
    for (const m of this.mats) {
      if (!m.transparent) { m.transparent = true; m.needsUpdate = true; }
      m.opacity = o;
      m.depthWrite = o > 0.5;
    }
    for (const m of this.meshes) m.castShadow = o > 0.5;
  }

  hideForFirstPerson() {
    for (const m of this.meshes) {
      m.material = INVISIBLE;
      m.castShadow = true;
    }
  }
}

function buildBody(rig, P) {
  const s = P.scale || 1;
  const bulk = P.bulk || 1;
  const hipH = 0.95;
  rig.hipH = hipH;
  rig.root.scale.setScalar(s);
  const body = rig.body = new THREE.Group();
  body.position.y = hipH;
  rig.root.add(body);

  rig.add(body, box(0.32 * bulk, 0.18, 0.2, P.pants)).position.y = 0.02;
  const spine = rig.spine = new THREE.Group();
  spine.position.y = 0.08;
  body.add(spine);
  const torso = rig.add(spine, capsule(0.17, 0.3, P.shirt, 0.25));
  torso.scale.set(1.15 * bulk, 1, 0.78 * (bulk > 1 ? 1.1 : 1));

  const neck = rig.neck = new THREE.Group();
  neck.position.y = 0.52;
  spine.add(neck);
  rig.add(neck, capsule(0.05, 0.06, P.skin, 0.03));
  const head = rig.head = new THREE.Group();
  head.position.y = 0.17;
  neck.add(head);
  rig.headMesh = rig.add(head, sphere(0.12, P.skin));
  rig.headMesh.scale.set(0.95, 1.05, 1);

  const arm = (side) => {
    const sh = new THREE.Group();
    sh.position.set(side * 0.215 * bulk, 0.43, 0);
    spine.add(sh);
    rig.add(sh, sphere(0.07 * bulk, P.shirt, 8, 6));
    rig.add(sh, capsule(0.055 * bulk, 0.2, P.sleeve || P.shirt, -0.15));
    const el = new THREE.Group();
    el.position.y = -0.3;
    sh.add(el);
    rig.add(el, capsule(0.048 * bulk, 0.19, P.forearm || P.skin, -0.13));
    const hand = new THREE.Group();
    hand.position.y = -0.28;
    el.add(hand);
    rig.add(hand, sphere(0.052 * bulk, P.hands || P.skin, 8, 6));
    return { sh, el, hand };
  };
  const L = arm(1), R = arm(-1);
  rig.shL = L.sh; rig.elL = L.el; rig.handL = L.hand;
  rig.shR = R.sh; rig.elR = R.el; rig.handR = R.hand;

  const leg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1 * bulk, 0, 0);
    body.add(hip);
    rig.add(hip, capsule(0.078 * bulk, 0.28, P.pants, -0.22));
    const kn = new THREE.Group();
    kn.position.y = -0.45;
    hip.add(kn);
    rig.add(kn, capsule(0.062 * bulk, 0.3, P.pants, -0.21));
    const foot = rig.add(kn, box(0.1 * bulk, 0.08, 0.25, P.shoes));
    foot.position.set(0, -0.43, 0.05);
    return { hip, kn };
  };
  const LL = leg(1), RL = leg(-1);
  rig.hipL = LL.hip; rig.knL = LL.kn; rig.hipR = RL.hip; rig.knR = RL.kn;
  return rig;
}

function addFace(rig, eyeMat) {
  for (const sx of [-1, 1]) {
    const e = sphere(0.016, eyeMat, 6, 4);
    e.position.set(sx * 0.042, 0.02, 0.108);
    rig.head.add(e);
  }
}

export function makeSurvivorRig(def) {
  const tex = getTextures();
  const c = def.colors;
  const P = {
    skin: std(c.skin, { roughness: 0.6 }),
    shirt: std(c.shirt, { map: tex.cloth.map }),
    pants: std(c.pants, { map: tex.cloth.map }),
    shoes: std(c.shoes, { roughness: 0.7 }),
    hair: std(c.hair, { roughness: 0.9 }),
  };
  if (def.id === 'iris' || def.id === 'teo') P.sleeve = P.shirt;
  if (def.id === 'teo') P.forearm = P.shirt;
  if (def.id === 'iris') P.forearm = P.skin;
  const rig = buildBody(new Rig(), P);
  addFace(rig, std(0x111111, { roughness: 0.3 }));
  const hair = P.hair;
  const cap = rig.add(rig.head, sphere(0.128, hair, 12, 8, Math.PI * 0.55));
  cap.position.set(0, 0.01, -0.012);
  if (def.hair === 'bun') {
    rig.add(rig.head, sphere(0.06, hair, 8, 6)).position.set(0, 0.1, -0.1);
  } else if (def.hair === 'ponytail') {
    const p = rig.add(rig.head, capsule(0.035, 0.18, hair));
    p.position.set(0, -0.04, -0.13);
    p.rotation.x = 0.35;
  } else if (def.hair === 'hood') {
    const hood = rig.add(rig.head, sphere(0.155, P.shirt, 12, 8, Math.PI * 0.62));
    hood.position.set(0, 0.0, -0.025);
    hood.rotation.x = -0.25;
  }
  if (def.id === 'marco') {
    // backpack
    const bp = rig.add(rig.spine, box(0.26, 0.32, 0.14, std(0x4a3b26, { map: tex.cloth.map })));
    bp.position.set(0, 0.3, -0.17);
  }
  if (def.id === 'lucia') {
    const bag = rig.add(rig.spine, box(0.12, 0.12, 0.08, std(0xdedede)));
    bag.position.set(-0.2, -0.02, 0.05);
    const cross = rig.add(bag, box(0.06, 0.02, 0.01, std(0xb01818)));
    cross.position.z = 0.045;
  }
  if (def.id === 'iris') {
    const belt = rig.add(rig.body, box(0.36, 0.05, 0.23, std(0x3a2a18)));
    belt.position.y = 0.1;
    const wrench = rig.add(rig.body, box(0.03, 0.2, 0.05, std(0x8a8f96, { metalness: 0.7, roughness: 0.4 })));
    wrench.position.set(0.19, 0.0, 0.05);
  }
  rig.buildAura();
  return rig;
}

export function makeKillerRig(def) {
  const tex = getTextures();
  let rig;
  const metal = std(0x9aa0a6, { metalness: 0.8, roughness: 0.35 });
  const blood = std(0x4a0808, { roughness: 0.4 });
  if (def.id === 'carnicero') {
    const P = {
      skin: std(0xb59a7a, { roughness: 0.7 }),
      shirt: std(0x2c2420, { map: tex.cloth.map }),
      pants: std(0x1c1a19, { map: tex.cloth.map }),
      shoes: std(0x120f0d),
    };
    P.forearm = P.skin; P.hands = std(0x5a3a2a);
    rig = buildBody(new Rig(), { ...P, scale: 1.22, bulk: 1.35 });
    // burlap mask
    rig.headMesh.material = std(0x8f7a55, { map: tex.cloth.map, roughness: 1 });
    rig.mats.push(rig.headMesh.material);
    const eyeGlow = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a10, emissiveIntensity: 3 });
    for (const sx of [-1, 1]) {
      const e = sphere(0.02, eyeGlow, 6, 4);
      e.position.set(sx * 0.045, 0.025, 0.11);
      rig.add(rig.head, e);
    }
    const mouth = rig.add(rig.head, box(0.08, 0.012, 0.02, std(0x200a08)));
    mouth.position.set(0, -0.05, 0.11);
    const apron = rig.add(rig.spine, box(0.42, 0.85, 0.03, std(0x5b4a3c, { map: tex.cloth.map })));
    apron.position.set(0, 0.0, 0.17);
    const stain = rig.add(apron, box(0.2, 0.25, 0.005, blood));
    stain.position.set(0.06, -0.1, 0.018);
    // cleaver
    const w = new THREE.Group();
    rig.add(w, box(0.035, 0.22, 0.035, std(0x3a2414))).position.y = -0.03;
    const blade = rig.add(w, box(0.02, 0.36, 0.2, metal));
    blade.position.set(0, -0.3, 0.06);
    const edge = rig.add(blade, box(0.022, 0.2, 0.08, blood));
    edge.position.set(0, -0.06, 0.05);
    rig.handR.add(w);
    w.rotation.x = 0.2;
    rig.weapon = w;
  } else if (def.id === 'espectro') {
    const P = {
      skin: std(0x9fa9a8, { roughness: 0.5 }),
      shirt: std(0x16171c, { map: tex.cloth.map }),
      pants: std(0x101114),
      shoes: std(0x0a0a0c),
    };
    P.forearm = P.skin; P.hands = P.skin;
    rig = buildBody(new Rig(), { ...P, scale: 1.25, bulk: 0.85 });
    const robeMat = std(0x121318, { map: tex.cloth.map, side: THREE.DoubleSide });
    const g = new THREE.CylinderGeometry(0.2, 0.5, 1.35, 14, 5, true);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < -0.6) pos.setY(i, y + Math.random() * 0.3);
      pos.setX(i, pos.getX(i) * (0.95 + Math.random() * 0.1));
    }
    g.computeVertexNormals();
    const robe = rig.add(rig.body, new THREE.Mesh(g, robeMat));
    robe.position.y = -0.38;
    const hood = rig.add(rig.head, sphere(0.165, robeMat, 12, 8, Math.PI * 0.7));
    hood.position.set(0, 0.0, -0.02);
    hood.rotation.x = -0.35;
    rig.headMesh.material = std(0x050506);
    const eyeGlow = new THREE.MeshStandardMaterial({ color: 0x002233, emissive: 0xaee8ff, emissiveIntensity: 4 });
    for (const sx of [-1, 1]) {
      const e = sphere(0.018, eyeGlow, 6, 4);
      e.position.set(sx * 0.04, 0.02, 0.11);
      rig.add(rig.head, e);
    }
    const w = new THREE.Group();
    for (let i = -1; i <= 1; i++) {
      const claw = rig.add(w, new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.38, 5), metal));
      claw.position.set(i * 0.03, -0.2, 0.02);
      claw.rotation.x = Math.PI;
    }
    rig.handR.add(w);
    rig.weapon = w;
  } else {
    const P = {
      skin: std(0x7a5f50, { roughness: 0.7 }),
      shirt: std(0x2e3a2c, { map: tex.cloth.map }),
      pants: std(0x3b3326, { map: tex.cloth.map }),
      shoes: std(0x17130f),
    };
    P.forearm = P.skin; P.hands = std(0x2a2018);
    rig = buildBody(new Rig(), { ...P, scale: 1.26, bulk: 1.3 });
    const mask = rig.add(rig.head, sphere(0.135, metal, 12, 8, Math.PI * 0.6));
    mask.rotation.x = Math.PI / 2 - 0.2;
    mask.position.z = 0.02;
    const teeth = std(0xe8e0c8, { roughness: 0.4 });
    for (let i = -3; i <= 3; i++) {
      const t = rig.add(rig.head, box(0.016, 0.035, 0.01, teeth));
      t.position.set(i * 0.02, -0.055, 0.125);
    }
    const eyeGlow = new THREE.MeshStandardMaterial({ color: 0x221100, emissive: 0xff7a1a, emissiveIntensity: 3.5 });
    for (const sx of [-1, 1]) {
      const e = sphere(0.019, eyeGlow, 6, 4);
      e.position.set(sx * 0.045, 0.025, 0.125);
      rig.add(rig.head, e);
    }
    for (const sx of [-1, 1]) {
      const pad = rig.add(rig.spine, sphere(0.11, std(0x4a3a28), 8, 6, Math.PI * 0.5));
      pad.position.set(sx * 0.27, 0.45, 0);
    }
    const trap = rig.add(rig.body, new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 14), metal));
    trap.position.set(-0.24, 0.0, 0.05);
    trap.rotation.y = Math.PI / 2;
    const w = new THREE.Group();
    rig.add(w, box(0.035, 0.18, 0.035, std(0x2a1a0e))).position.y = -0.02;
    const blade = rig.add(w, box(0.015, 0.62, 0.075, metal));
    blade.position.set(0, -0.42, 0.02);
    rig.add(blade, box(0.017, 0.3, 0.05, blood)).position.set(0, -0.12, 0.012);
    rig.handR.add(w);
    w.rotation.x = 0.15;
    rig.weapon = w;
  }
  rig.buildAura();
  return rig;
}

// First-person arm + weapon for the human killer (camera space: -z forward).
export function makeViewModel(def) {
  const tex = getTextures();
  const g = new THREE.Group();
  const sleeve = def.id === 'espectro' ? 0x16171c : def.id === 'carnicero' ? 0x2c2420 : 0x2e3a2c;
  const glove = def.id === 'espectro' ? 0x6f7878 : def.id === 'carnicero' ? 0x4a3226 : 0x2a2018;
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.4, 3, 8), std(sleeve, { map: tex.cloth.map }));
  arm.rotation.x = Math.PI / 2 - 0.35;
  arm.position.set(0.03, -0.1, 0.18);
  g.add(arm);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), std(glove, { roughness: 0.7 }));
  hand.scale.set(1, 0.9, 1.2);
  hand.position.set(0, -0.02, -0.06);
  g.add(hand);
  const metal = std(0xa8aeb4, { metalness: 0.85, roughness: 0.32 });
  const blood = std(0x4a0808, { roughness: 0.35 });
  const w = new THREE.Group();
  w.position.set(0, 0, -0.07);
  if (def.id === 'espectro') {
    for (let i = -1; i <= 1; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.36, 5), metal);
      claw.rotation.x = -Math.PI / 2 + 0.35;
      claw.position.set(i * 0.03, 0.04, -0.18);
      w.add(claw);
    }
  } else {
    const long = def.id === 'trampero';
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.035), std(0x2a1a0e));
    handle.position.y = 0.04;
    w.add(handle);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.014, long ? 0.58 : 0.3, long ? 0.07 : 0.17), metal);
    blade.position.set(0, long ? 0.41 : 0.27, long ? -0.01 : -0.05);
    w.add(blade);
    const stain = new THREE.Mesh(new THREE.BoxGeometry(0.016, long ? 0.22 : 0.12, long ? 0.05 : 0.1), blood);
    stain.position.set(0, blade.position.y + (long ? 0.12 : 0.06), blade.position.z - 0.02);
    w.add(stain);
    w.rotation.x = -0.75;
  }
  g.add(w);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  return g;
}

// ---------------- animation ----------------
const J = ['hipL', 'hipR', 'knL', 'knR', 'shL', 'shR', 'elL', 'elR', 'spine', 'neck'];

export function animateRig(rig, a, dt) {
  rig.time += dt;
  const t = rig.time;
  const T = rig._target || (rig._target = {});
  for (const k of J) T[k] = 0;
  T.shLz = 0.08; T.shRz = -0.08; T.elL = -0.15; T.elR = -0.15;
  let bodyY = rig.hipH, lie = 0, rate = 12, bodyRz = 0;
  const v = a.speed || 0;
  const mode = a.mode || 'stand';

  if (mode === 'stand' || mode === 'crouch') {
    const crouch = mode === 'crouch';
    const A = clamp(v / 4.2, 0, 1) * (crouch ? 0.35 : 0.8) + (v > 0.2 ? 0.12 : 0);
    rig.phase += dt * (v / (crouch ? 0.9 : 1.55)) * Math.PI * 2 * 0.5;
    const ph = rig.phase;
    const sw = Math.sin(ph);
    if (v > 0.15) {
      T.hipL = sw * A; T.hipR = -sw * A;
      T.knL = Math.max(0, Math.sin(ph + 1.3)) * 1.2 * A + 0.05;
      T.knR = Math.max(0, Math.sin(ph + 1.3 + Math.PI)) * 1.2 * A + 0.05;
      T.shL = -sw * A * 0.9; T.shR = sw * A * 0.9;
      T.elL = -0.35 - 0.6 * A; T.elR = -0.35 - 0.6 * A;
      T.spine = 0.06 + 0.22 * A;
      bodyY += Math.abs(Math.cos(ph)) * 0.06 * A - 0.03 * A;
    } else {
      T.spine = Math.sin(t * 1.6) * 0.025;
      T.neck = Math.sin(t * 0.7) * 0.05;
    }
    if (a.injured && !crouch) { T.spine += 0.15; T.shL -= 0.3; T.elL = -1.2; T.shLz = 0.3; }
    if (crouch) {
      bodyY = rig.hipH * 0.64;
      T.hipL += -1.05; T.hipR += -1.05; T.knL += 1.75; T.knR += 1.75;
      T.spine += 0.5; T.neck -= 0.35; T.shL -= 0.35; T.shR -= 0.35; T.elL = -0.6; T.elR = -0.6;
    }
    if (a.carrying) { T.shL = -2.5; T.elL = -1.7; T.shLz = 0.25; }
  } else if (mode === 'work' || mode === 'reach') {
    if (mode === 'work') {
      bodyY = rig.hipH * 0.55;
      T.hipL = -1.5; T.knL = 2.1; T.hipR = -0.35; T.knR = 2.0; T.spine = 0.4;
      T.shL = -1.15 + Math.sin(t * 9) * 0.18; T.shR = -1.1 + Math.cos(t * 8) * 0.18;
      T.elL = -0.55; T.elR = -0.6; T.neck = 0.25;
    } else {
      T.shL = -1.9 + Math.sin(t * 6) * 0.1; T.shR = -1.95 + Math.cos(t * 5) * 0.1;
      T.elL = -0.4; T.elR = -0.4; T.spine = 0.08; T.neck = -0.2;
    }
  } else if (mode === 'downed') {
    lie = 1.42;
    bodyY = 0.24;
    rig.phase += dt * v * 3.2;
    const sw = Math.sin(rig.phase);
    T.shL = -2.7 + sw * 0.45 * (v > 0.1 ? 1 : 0.2); T.shR = -2.7 - sw * 0.45 * (v > 0.1 ? 1 : 0.2);
    T.elL = -0.3; T.elR = -0.3; T.hipL = 0.1 + sw * 0.2; T.hipR = 0.1 - sw * 0.2; T.knL = 0.4; T.knR = 0.3;
    T.neck = -0.7;
  } else if (mode === 'carried') {
    lie = 1.57;
    bodyY = 0;
    T.shL = -1.3 + Math.sin(t * 7) * 0.4; T.shR = -1.3 + Math.cos(t * 6) * 0.4;
    T.hipL = -0.4 + Math.sin(t * 5) * 0.3; T.hipR = -0.3 - Math.sin(t * 5) * 0.3; T.knL = 0.5; T.knR = 0.6;
    T.neck = -0.4;
    rate = 14;
  } else if (mode === 'hooked') {
    bodyY = 0;
    T.shL = -2.9; T.elL = -0.6; T.shR = -0.2 + Math.sin(t * 1.3) * 0.15; T.elR = -0.4;
    T.hipL = 0.15 + Math.sin(t * 1.1) * 0.12; T.hipR = 0.05 - Math.sin(t * 1.1) * 0.12; T.knL = 0.35; T.knR = 0.2;
    T.neck = 0.35; T.spine = -0.05;
    bodyRz = Math.sin(t * 0.9) * 0.06 + (a.struggle ? Math.sin(t * 17) * 0.12 : 0);
    if (a.struggle) { T.hipL += Math.sin(t * 13) * 0.5; T.hipR -= Math.sin(t * 13) * 0.5; }
  } else if (mode === 'stunned') {
    T.spine = -0.35; T.neck = -0.4; T.shLz = 0.9; T.shRz = -0.9; T.shL = -0.4; T.shR = -0.4;
    T.elL = -1.6; T.elR = -1.6; T.hipL = -0.2; T.knL = 0.4;
    bodyY = rig.hipH - 0.05 + Math.sin(t * 12) * 0.02;
  } else if (mode === 'trapped') {
    bodyY = rig.hipH * 0.72;
    T.hipL = -0.9; T.knL = 1.6; T.hipR = 0.3; T.knR = 0.4; T.spine = 0.55; T.neck = 0.4;
    T.shL = -1.4 + Math.sin(t * 10) * 0.25; T.shR = -1.3 + Math.cos(t * 10) * 0.25; T.elL = -0.8; T.elR = -0.8;
  } else if (mode === 'vault') {
    T.hipL = -1.3; T.hipR = -0.6; T.knL = 1.6; T.knR = 0.9; T.shL = -1.8; T.shR = -1.6; T.spine = 0.5;
    rate = 20;
  } else if (mode === 'kick') {
    T.hipR = -1.4 + Math.max(0, Math.sin(t * 9)) * 1.4; T.knR = 0.4; T.spine = -0.1; T.shL = -0.4; T.shR = 0.3;
  }

  if (a.attack >= 0) {
    const p = a.attack;
    if (p < 0.35) { T.shR = -2.8 * (p / 0.35); T.shRz = -0.4; T.elR = -0.9; T.spine = -0.1; }
    else { const q = clamp((p - 0.35) / 0.3, 0, 1); T.shR = -2.8 + 3.3 * q; T.shRz = -0.4 + 0.5 * q; T.elR = -0.3; T.spine = 0.25 * q; }
    rate = 30;
  }
  if (a.wipe) { T.shR = -1.0; T.elR = -1.6; T.shRz = 0.5; T.shL = -0.8; T.elL = -1.4; T.neck = 0.4; }
  if (a.lookPitch !== undefined) T.neck += a.lookPitch;

  for (const k of J) rig[k].rotation.x = damp(rig[k].rotation.x, T[k], rate, dt);
  rig.shL.rotation.z = damp(rig.shL.rotation.z, T.shLz, rate, dt);
  rig.shR.rotation.z = damp(rig.shR.rotation.z, T.shRz, rate, dt);
  rig.body.position.y = damp(rig.body.position.y, bodyY, rate, dt);
  rig.lie = damp(rig.lie, lie, mode === 'carried' || mode === 'hooked' ? 30 : 8, dt);
  rig.body.rotation.x = rig.lie;
  rig.body.rotation.z = damp(rig.body.rotation.z, bodyRz, 8, dt);
}
