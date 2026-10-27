// Map generation and environment rendering: sky, fog, lights, terrain,
// buildings, loops with pallets, generators, hooks, exit gates, foliage.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTextures } from './textures.js';
import { Physics } from './physics.js';
import { mulberry32, clamp, shuffle, dist } from './util.js';
import { MAP_HALF, GENS_TOTAL } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);

function boxGeo(w, h, d, ts = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / ts, (uv.getY(i) * dims[f][1]) / ts);
    }
  }
  return g;
}

function place(g, x, y, z, ry = 0, rx = 0, rz = 0) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

function clean(g) {
  let out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(k)) out.deleteAttribute(k);
  if (!out.attributes.uv) {
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  }
  return out;
}

function jitter(g, amt, rng) {
  const p = g.attributes.position;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let o = map.get(key);
    if (!o) { o = [(rng() - 0.5) * amt, (rng() - 0.5) * amt, (rng() - 0.5) * amt]; map.set(key, o); }
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  g.computeVertexNormals();
  return g;
}

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = /* glsl */`
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 moonDir;
uniform vec3 moonColor;
uniform float time;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(horizon, top, smoothstep(-0.02, 0.55, h));
  float s = hash(floor(d * 420.0));
  float star = step(0.9972, s) * smoothstep(0.08, 0.45, h) * (0.55 + 0.45 * sin(time * 2.3 + s * 90.0));
  col += vec3(0.85, 0.9, 1.0) * star * 1.6;
  float md = max(dot(d, moonDir), 0.0);
  float disc = smoothstep(0.99935, 0.99965, md);
  float crater = 0.78 + 0.22 * hash(floor(d * 1400.0));
  col += moonColor * (pow(md, 90.0) * 0.5 + pow(md, 10.0) * 0.12 + pow(md, 3.0) * 0.04);
  col = mix(col, moonColor * 7.0 * crater, disc);
  gl_FragColor = vec4(col, 1.0);
}`;

export class World {
  constructor(scene, quality, opts = {}) {
    this.scene = scene;
    this.q = quality;
    this.seed = opts.seed ?? (Math.random() * 1e9) | 0;
    this.rng = mulberry32(this.seed);
    this.nightmare = !!opts.nightmare;
    this.diorama = !!opts.diorama;
    this.half = this.diorama ? 22 : MAP_HALF;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.physics = new Physics(this.half);
    this.gens = []; this.hooks = []; this.pallets = []; this.gates = [];
    this.lightSources = []; this.fires = []; this.bushes = []; this.reserved = [];
    this.buckets = {};
    this.tex = getTextures();
    this.mats = this._materials();
    this.time = 0;
    this.lightTimer = 0;
    this.windUniform = { value: 0 };
    this.trees = { pine: [], dead: [] };
    this.rocks = [];
    this.disposables = [];
  }

  _materials() {
    const t = this.tex;
    const m = {
      ground: new THREE.MeshStandardMaterial({ map: t.ground.map, normalMap: t.ground.normal, roughness: 0.96, normalScale: new THREE.Vector2(1.2, 1.2) }),
      brick: new THREE.MeshStandardMaterial({ map: t.brick.map, normalMap: t.brick.normal, roughness: 0.92 }),
      redBrick: new THREE.MeshStandardMaterial({ map: t.redBrick.map, normalMap: t.redBrick.normal, roughness: 0.9 }),
      wood: new THREE.MeshStandardMaterial({ map: t.wood.map, normalMap: t.wood.normal, roughness: 0.88 }),
      rust: new THREE.MeshStandardMaterial({ map: t.rust.map, normalMap: t.rust.normal, roughness: 0.62, metalness: 0.45 }),
      rock: new THREE.MeshStandardMaterial({ map: t.rock.map, normalMap: t.rock.normal, roughness: 0.95 }),
      bark: new THREE.MeshStandardMaterial({ map: t.bark.map, normalMap: t.bark.normal, roughness: 0.95 }),
      pine: new THREE.MeshStandardMaterial({ color: 0x1b2a20, roughness: 0.95, flatShading: true }),
      bush: new THREE.MeshStandardMaterial({ color: 0x26361f, roughness: 0.95, flatShading: true }),
      metal: new THREE.MeshStandardMaterial({ color: 0x5c6166, roughness: 0.45, metalness: 0.8 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x141417, roughness: 0.7, metalness: 0.3 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
      bone: new THREE.MeshStandardMaterial({ color: 0xd9cfb5, roughness: 0.6 }),
      wax: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.5, emissive: 0x2a1a08 }),
      flame: new THREE.MeshBasicMaterial({ color: 0xffb060 }),
      glassRed: new THREE.MeshStandardMaterial({ color: 0x120304, emissive: 0xff6a50, emissiveMap: t.stained, emissiveIntensity: 0.9, roughness: 0.3 }),
      glassBlue: new THREE.MeshStandardMaterial({ color: 0x02050e, emissive: 0x7aa0ff, emissiveMap: t.stained, emissiveIntensity: 0.8, roughness: 0.3 }),
      exit: new THREE.MeshBasicMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    };
    m.grass = new THREE.MeshStandardMaterial({ map: t.grass, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 1 });
    m.grass.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.windUniform;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float sway = sin(uTime * 1.6 + ip.x * 0.31 + ip.z * 0.23) * 0.6 + sin(uTime * 3.3 + ip.x * 0.9) * 0.25;
        float k = clamp(position.y / 0.5, 0.0, 1.0);
        transformed.x += sway * k * k * 0.16;
        transformed.z += sway * k * k * 0.09;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);');
    };
    return m;
  }

  bucket(key, geo) {
    (this.buckets[key] || (this.buckets[key] = [])).push(clean(geo));
  }

  _flushBuckets() {
    for (const [key, list] of Object.entries(this.buckets)) {
      if (!list.length) continue;
      const g = mergeGeometries(list, false);
      for (const x of list) x.dispose();
      const mesh = new THREE.Mesh(g, this.mats[key]);
      mesh.castShadow = !['glassRed', 'glassBlue', 'flame', 'wax'].includes(key);
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
    this.buckets = {};
  }

  // ----------------------------------------------------------- building blocks
  // Solid box with collision. w along local x, d along local z.
  solid(x, z, w, d, h, rot, mat, opts = {}) {
    const y0 = opts.y0 || 0;
    this.bucket(mat, place(boxGeo(w, h, d, opts.ts || 2), x, y0 + h / 2, z, rot));
    if (!opts.noCollide) return this.physics.addBox(x, z, w / 2, d / 2, rot, y0 + h, opts.tag);
    return null;
  }

  // Wall between two world points, with ragged top made of chunks.
  wall(x0, z0, x1, z1, h, thick, mat, ragged = true) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.05) return;
    const rot = Math.atan2(-(z1 - z0), x1 - x0); // local x along the wall
    const n = Math.max(1, Math.round(len / 2.2));
    let minH = h;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const cx = x0 + (x1 - x0) * (t0 + t1) / 2, cz = z0 + (z1 - z0) * (t0 + t1) / 2;
      const hh = ragged ? h - this.rng() * 0.7 : h;
      minH = Math.min(minH, hh);
      this.bucket(mat, place(boxGeo(len / n + 0.02, hh, thick, 2), cx, hh / 2, cz, rot));
      if (ragged && this.rng() < 0.35) {
        const b = boxGeo(0.4 + this.rng() * 0.4, 0.25, thick + 0.04, 2);
        this.bucket(mat, place(b, cx + (this.rng() - 0.5) * len / n * 0.5, hh + 0.1, cz, rot + (this.rng() - 0.5) * 0.3));
      }
    }
    this.physics.addBox((x0 + x1) / 2, (z0 + z1) / 2, len / 2, thick / 2, rot, minH);
  }

  _tf(cx, cz, rot) {
    const c = Math.cos(rot), s = Math.sin(rot);
    return (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
  }

  isFree(x, z, r, extra = 0) {
    const H = this.half - 1.2;
    if (Math.abs(x) > H - r || Math.abs(z) > H - r) return false;
    const list = this.physics.query(x - r - 2, z - r - 2, x + r + 2, z + r + 2, []);
    for (const o of list) if (this.physics.distTo(o, x, z) < r) return false;
    for (const c of this.reserved) if (Math.hypot(c.x - x, c.z - z) < c.r + r + extra) return false;
    return true;
  }

  reserve(x, z, r) { this.reserved.push({ x, z, r }); }

  addLight(x, y, z, color, intensity, flicker = 0, range = 14) {
    const L = { x, y, z, color: new THREE.Color(color), intensity, base: intensity, flicker, range, on: true, seed: Math.random() * 100 };
    this.lightSources.push(L);
    return L;
  }

  // ---------------------------------------------------------------- sky/env
  _sky() {
    const nm = this.nightmare;
    const fogColor = new THREE.Color(nm ? 0x2c0d0e : 0x121d30);
    this.scene.fog = new THREE.FogExp2(fogColor, this.diorama ? 0.04 : nm ? 0.036 : 0.03);
    this.scene.background = fogColor.clone();
    this.moonDir = new THREE.Vector3(-0.45, 0.42, -0.79).normalize();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          top: { value: new THREE.Color(nm ? 0x070102 : 0x02050c) },
          horizon: { value: fogColor.clone() },
          moonDir: { value: this.moonDir },
          moonColor: { value: new THREE.Color(nm ? 0xff4a30 : 0xc8d8ff) },
          time: { value: 0 },
        },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.sky = sky;
    this.scene.add(sky);
    this.disposables.push(sky);
  }

  _lights() {
    const nm = this.nightmare;
    this.hemi = new THREE.HemisphereLight(nm ? 0xa86060 : 0x6a80b8, nm ? 0x221010 : 0x1c1914, nm ? 2.9 : 2.6);
    this.scene.add(this.hemi);
    const moon = this.moon = new THREE.DirectionalLight(nm ? 0xff9a8a : 0xb4c6f4, nm ? 3.3 : 3.3);
    moon.position.copy(this.moonDir).multiplyScalar(60);
    if (this.q.shadows) {
      moon.castShadow = true;
      moon.shadow.mapSize.set(this.q.shadows, this.q.shadows);
      const s = this.diorama ? 18 : 32;
      Object.assign(moon.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 160 });
      moon.shadow.bias = -0.0006;
      moon.shadow.normalBias = 0.04;
    }
    this.scene.add(moon);
    this.scene.add(moon.target);
    const n = this.q.id === 'baja' ? 2 : 4;
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const p = new THREE.PointLight(0xffaa66, 0, 16, 2);
      p.position.set(0, -100, 0);
      this.scene.add(p);
      this.pool.push(p);
    }
    this.disposables.push(this.hemi, moon, ...this.pool);
  }

  _ground() {
    const size = this.half * 2 + 180;
    const g = new THREE.PlaneGeometry(size, size, 1, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / 7, uv.getY(i) * size / 7);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, this.mats.ground);
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  // ------------------------------------------------------------ props
  _gen(x, z, rot) {
    const M = this.mats;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const add = (geo, mat, px, py, pz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    add(boxGeo(1.6, 0.5, 1.0, 1), M.rust, 0, 0.25, 0);
    add(boxGeo(1.25, 0.55, 0.8, 1), M.dark, 0, 0.77, 0);
    add(boxGeo(1.05, 0.12, 0.7, 1), M.rust, 0, 1.1, 0);
    const pistons = [];
    for (const [px, pz] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]]) {
      pistons.push(add(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 8), M.metal, px, 1.3, pz));
    }
    const pipe = add(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 8), M.rust, -0.62, 1.4, -0.32);
    pipe.rotation.z = 0.08;
    add(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 6), M.metal, 0.66, 1.75, -0.36);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2418, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.3 });
    add(new THREE.SphereGeometry(0.13, 12, 8), lampMat, 0.66, 2.62, -0.36);
    const shade = add(new THREE.ConeGeometry(0.22, 0.16, 10, 1, true), M.rust, 0.66, 2.74, -0.36);
    shade.material = M.rust;
    const leds = [];
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x220a06, emissive: 0xff3a10, emissiveIntensity: 0.4 });
      leds.push(mat);
      add(new THREE.SphereGeometry(0.035, 6, 4), mat, -0.36 + i * 0.18, 0.88, 0.41);
    }
    this.root.add(g);
    this.physics.addBox(x, z, 0.82, 0.52, rot, 1.4, 'gen');
    const c = Math.cos(rot), s = Math.sin(rot);
    const toW = (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
    const lp = toW(0.66, -0.36);
    const gen = {
      id: this.gens.length, x, z, rot, group: g, pistons, lampMat, leds,
      progress: 0, done: false, regress: false, workers: new Set(), kickedAt: -99,
      spots: [], light: this.addLight(lp.x, 2.6, lp.z, 0xffc070, 0, 0.08, 18), shake: 0,
    };
    gen.light.on = false;
    for (const [lx, lz] of [[0, 1.12], [0, -1.12], [1.35, 0], [-1.35, 0]]) {
      const p = toW(lx, lz);
      gen.spots.push({ x: p.x, z: p.z, yaw: Math.atan2(x - p.x, z - p.z), taken: null });
    }
    this.reserve(x, z, 2.2);
    this.gens.push(gen);
    return gen;
  }

  _hook(x, z, rot) {
    const M = this.mats;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const mk = (geo, mat, px, py, pz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    mk(jitter(new THREE.CylinderGeometry(0.45, 0.6, 0.3, 8), 0.12, this.rng), M.rock, 0, 0.15, 0);
    mk(new THREE.CylinderGeometry(0.08, 0.11, 3.0, 8), M.rust, 0, 1.5, 0);
    const arm = mk(new THREE.BoxGeometry(1.05, 0.1, 0.1), M.rust, 0.45, 2.95, 0);
    arm.rotation.z = -0.06;
    mk(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 4), M.metal, 0.92, 2.8, 0);
    const hk = mk(new THREE.TorusGeometry(0.11, 0.022, 6, 14, Math.PI * 1.4), M.metal, 0.92, 2.6, 0);
    hk.rotation.set(0, Math.PI / 2, Math.PI * 0.8);
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x1a0505, emissive: 0xff1a10, emissiveIntensity: 0, roughness: 0.4 });
    const spikes = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 2.6 + (i % 2) * 0.8, 5), glowMat);
      sp.position.set(Math.cos(a) * 0.9 + 0.9, 1.2, Math.sin(a) * 0.9);
      sp.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      spikes.add(sp);
    }
    spikes.scale.set(1, 0.001, 1);
    spikes.visible = false;
    g.add(spikes);
    this.root.add(g);
    this.physics.addCircle(x, z, 0.3, 3, 'hook');
    const c = Math.cos(rot), s = Math.sin(rot);
    const hp = { x: x + 0.92 * c, z: z - 0.92 * s };
    const hook = { id: this.hooks.length, x, z, rot, group: g, point: new THREE.Vector3(hp.x, 2.55, hp.z), victim: null, glowMat, spikes, spikeAnim: 0, light: this.addLight(x, 3.6, z, 0xff2010, 0, 0.15, 11) };
    hook.light.on = false;
    this.reserve(x, z, 1.8);
    this.hooks.push(hook);
    return hook;
  }

  // Pallet in a gap. (x,z) gap centre, yaw so local z (n) is the passage axis.
  _pallet(x, z, yaw, width, off = 0.42) {
    const M = this.mats;
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    root.rotation.y = yaw;
    const pivot = new THREE.Group();
    pivot.position.set(-width / 2, 0, -off);
    root.add(pivot);
    const panel = new THREE.Group();
    panel.position.set(width / 2, 0, 0);
    panel.rotation.x = -0.28;
    pivot.add(panel);
    const add = (w, h, d, px, py, pz) => {
      const m = new THREE.Mesh(boxGeo(w, h, d, 1.2), M.wood);
      m.position.set(px, py, pz);
      m.castShadow = m.receiveShadow = true;
      panel.add(m);
    };
    for (let i = 0; i < 4; i++) add(width + 0.15, 0.2, 0.05, 0, 0.15 + i * 0.28, 0);
    for (const px of [-width / 2 + 0.15, 0, width / 2 - 0.15]) add(0.12, 1.1, 0.1, px, 0.55, -0.06);
    pivot.rotation.z = Math.PI / 2;
    this.root.add(root);
    const n = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const t = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const p = { id: this.pallets.length, x, z, yaw, width, n, t, root, pivot, state: 'up', anim: 0, obstacle: null, off: Math.min(0.5, off - 0.1) };
    this.pallets.push(p);
    this.reserve(x, z, 1.6);
    return p;
  }

  dropPallet(p) {
    if (p.state !== 'up') return;
    p.state = 'down';
    p.anim = 0;
    const cx = p.x - p.n.x * p.off, cz = p.z - p.n.z * p.off;
    p.obstacle = this.physics.addBox(cx, cz, p.width / 2 + 0.3, 0.36, p.yaw, 1.0, 'pallet');
  }

  breakPallet(p) {
    if (p.state !== 'down') return;
    p.state = 'broken';
    this.physics.remove(p.obstacle);
    p.obstacle = null;
    p.root.visible = false;
  }

  _barrel(x, z) {
    const M = this.mats;
    const g = new THREE.CylinderGeometry(0.36, 0.33, 1.0, 12, 1, true);
    this.bucket('rust', place(g, x, 0.5, z));
    this.bucket('dark', place(new THREE.CircleGeometry(0.34, 10).rotateX(-Math.PI / 2), x, 0.85, z));
    this.physics.addCircle(x, z, 0.4, 1.0);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: 0xff8a30, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true }));
    core.position.set(x, 1.15, z);
    core.scale.set(1.6, 1.6, 1);
    this.root.add(core);
    this.fires.push({ x, y: 1.0, z, acc: 0, core });
    this.addLight(x, 1.7, z, 0xff8a3a, 22, 0.35, 16);
    this.reserve(x, z, 1.0);
  }

  _totem(x, z) {
    const r = this.rng;
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = r() * 0.35;
      this.bucket('bone', place(new THREE.SphereGeometry(0.07 + r() * 0.05, 6, 4), x + Math.cos(a) * d, 0.06 + r() * 0.12, z + Math.sin(a) * d));
    }
    this.bucket('bone', place(new THREE.CapsuleGeometry(0.03, 0.4, 2, 5), x + 0.2, 0.08, z - 0.1, 0.6, 0, Math.PI / 2));
    this.bucket('bone', place(new THREE.SphereGeometry(0.13, 10, 8), x, 0.32, z));
    this.bucket('bone', place(new THREE.BoxGeometry(0.14, 0.05, 0.1), x, 0.2, z + 0.05));
    this.bucket('dark', place(new THREE.SphereGeometry(0.03, 5, 4), x - 0.045, 0.34, z + 0.11));
    this.bucket('dark', place(new THREE.SphereGeometry(0.03, 5, 4), x + 0.045, 0.34, z + 0.11));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const cx = x + Math.cos(a) * 0.55, cz = z + Math.sin(a) * 0.55;
      const h = 0.15 + r() * 0.2;
      this.bucket('wax', place(new THREE.CylinderGeometry(0.03, 0.035, h, 6), cx, h / 2, cz));
      this.bucket('flame', place(new THREE.ConeGeometry(0.02, 0.07, 5), cx, h + 0.04, cz));
    }
    this.addLight(x, 0.6, z, this.nightmare ? 0xff3020 : 0xff9a40, 6, 0.4, 8);
  }

  _car(x, z, rot) {
    const tf = this._tf(x, z, rot);
    const M = (k, g) => this.bucket(k, g);
    const col = this.rng() < 0.5 ? 'rust' : 'rust';
    M(col, place(boxGeo(4.4, 0.75, 1.9, 1.5), x, 0.62, z, rot));
    const [cx, cz] = tf(-0.3, 0);
    M('dark', place(boxGeo(2.2, 0.62, 1.72, 1.5), cx, 1.3, cz, rot));
    M(col, place(boxGeo(2.0, 0.08, 1.75, 1.5), cx, 1.64, cz, rot + 0.05, 0, 0.04));
    for (const [lx, lz] of [[-1.4, 0.95], [1.4, 0.95], [-1.4, -0.95], [1.4, -0.95]]) {
      const [wx, wz] = tf(lx, lz);
      M('rubber', place(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 12), wx, 0.33, wz, rot, Math.PI / 2, 0));
    }
    this.physics.addBox(x, z, 2.2, 0.95, rot, 1.5);
  }

  _rockMesh(x, z, r, h, collide = true) {
    this.rocks.push({ x, z, r, h, rot: this.rng() * 6.28 });
    if (collide) this.physics.addCircle(x, z, r * 0.92, h);
  }

  _tree(x, z, kind, scale, collide = true) {
    this.trees[kind].push({ x, z, s: scale, rot: this.rng() * 6.28 });
    if (collide) this.physics.addCircle(x, z, 0.32 * scale + 0.1, 9);
  }

  // ------------------------------------------------------------ layout
  _layoutMap() {
    const H = this.half, r = this.rng;
    // perimeter + exit gates
    const gateXs = [(r() - 0.5) * 60, (r() - 0.5) * 60];
    for (const [side, gx] of [[-1, gateXs[0]], [1, gateXs[1]]]) {
      const zw = side * (H + 0.4);
      this.wall(-H - 0.8, zw, gx - 2.6, zw, 4.2, 0.8, 'brick');
      this.wall(gx + 2.6, zw, H + 0.8, zw, 4.2, 0.8, 'brick');
      this._gate(gx, side);
    }
    this.wall(-H - 0.4, -H - 0.8, -H - 0.4, H + 0.8, 4.2, 0.8, 'brick');
    this.wall(H + 0.4, -H - 0.8, H + 0.4, H + 0.8, 4.2, 0.8, 'brick');

    this._chapel(0, 0, r() < 0.5 ? 0 : Math.PI);

    const types = shuffle(r, ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'A', 'C', 'D', 'B']);
    let k = 0;
    for (const gx of [-39, -13, 13, 39]) {
      for (const gz of [-39, -13, 13, 39]) {
        if (Math.abs(gx) < 16 && Math.abs(gz) < 16) continue;
        const x = gx + (r() - 0.5) * 7, z = gz + (r() - 0.5) * 7;
        const rot = Math.floor(r() * 4) * Math.PI / 2 + (r() - 0.5) * 0.25;
        this._tile(types[k++ % types.length], x, z, rot);
      }
    }

    // generators: one inside the chapel already
    let tries = 0, minD = 21;
    while (this.gens.length < GENS_TOTAL && tries++ < 3000) {
      if (tries % 600 === 0) minD -= 3;
      const x = (r() - 0.5) * (H * 2 - 12), z = (r() - 0.5) * (H * 2 - 12);
      if (!this.isFree(x, z, 2.4)) continue;
      if (this.gens.some((g) => dist(g.x, g.z, x, z) < minD)) continue;
      if (this.gates.some((g) => dist(g.x, g.z, x, z) < 12)) continue;
      this._gen(x, z, r() * Math.PI * 2);
    }
    tries = 0; minD = 15;
    while (this.hooks.length < 10 && tries++ < 3000) {
      if (tries % 700 === 0) minD -= 2;
      const x = (r() - 0.5) * (H * 2 - 8), z = (r() - 0.5) * (H * 2 - 8);
      if (!this.isFree(x, z, 2.0)) continue;
      if (this.hooks.some((h) => dist(h.x, h.z, x, z) < minD)) continue;
      this._hook(x, z, r() * Math.PI * 2);
    }
    let barrels = 0;
    for (tries = 0; barrels < 7 && tries < 800; tries++) {
      const x = (r() - 0.5) * (H * 2 - 8), z = (r() - 0.5) * (H * 2 - 8);
      if (!this.isFree(x, z, 1.4, 1)) continue;
      if (this.fires.some((f) => dist(f.x, f.z, x, z) < 16)) continue;
      this._barrel(x, z);
      barrels++;
    }
    let tot = 0;
    for (tries = 0; tot < 5 && tries < 500; tries++) {
      const x = (r() - 0.5) * (H * 2 - 8), z = (r() - 0.5) * (H * 2 - 8);
      if (!this.isFree(x, z, 1.2)) continue;
      this._totem(x, z);
      this.reserve(x, z, 1);
      tot++;
    }
    const tf = this.q.trees;
    let placed = 0;
    for (tries = 0; placed < 55 * tf && tries < 3000; tries++) {
      const x = (r() - 0.5) * (H * 2 - 4), z = (r() - 0.5) * (H * 2 - 4);
      if (!this.isFree(x, z, 1.6)) continue;
      this._tree(x, z, r() < 0.55 ? 'pine' : 'dead', 0.8 + r() * 0.7);
      this.reserve(x, z, 0.8);
      placed++;
    }
    placed = 0;
    for (tries = 0; placed < 22 && tries < 2000; tries++) {
      const x = (r() - 0.5) * (H * 2 - 6), z = (r() - 0.5) * (H * 2 - 6);
      const rad = 0.9 + r() * 0.9;
      if (!this.isFree(x, z, rad + 1.0)) continue;
      this._rockMesh(x, z, rad, rad * (1.2 + r() * 0.6));
      this.reserve(x, z, rad);
      placed++;
    }
    for (let i = 0; i < 70; i++) {
      const x = (r() - 0.5) * (H * 2 - 2), z = (r() - 0.5) * (H * 2 - 2);
      if (!this.isFree(x, z, 0.5)) continue;
      this._rockMesh(x, z, 0.15 + r() * 0.3, 0.3, false);
    }
    placed = 0;
    for (tries = 0; placed < 40 && tries < 2000; tries++) {
      const x = (r() - 0.5) * (H * 2 - 4), z = (r() - 0.5) * (H * 2 - 4);
      if (!this.isFree(x, z, 1.4)) continue;
      this.bushes.push({ x, z, r: 0.9 + r() * 0.6 });
      placed++;
    }
    // forest beyond the walls
    const outer = Math.floor(320 * tf);
    for (let i = 0; i < outer; i++) {
      const x = (r() - 0.5) * (H * 2 + 70), z = (r() - 0.5) * (H * 2 + 70);
      if (Math.abs(x) < H + 2.5 && Math.abs(z) < H + 2.5) continue;
      if (this.gates.some((g) => Math.abs(x - g.x) < 5 && Math.abs(z - g.z) < 16)) continue;
      this._tree(x, z, r() < 0.7 ? 'pine' : 'dead', 1.0 + r() * 0.9, false);
    }
  }

  _gate(gx, side) {
    const H = this.half;
    const zw = side * (H + 0.4);
    const inward = -side;
    for (const px of [gx - 2.95, gx + 2.95]) this.solid(px, zw, 1.2, 1.5, 5.2, 0, 'brick');
    this.solid(gx, zw, 7.1, 0.7, 0.55, 0, 'metal', { y0: 5.0, noCollide: true });
    // corridor walls outside
    this.wall(gx - 3.1, zw + side * 0.8, gx - 3.1, zw + side * 12, 4.5, 0.5, 'brick');
    this.wall(gx + 3.1, zw + side * 0.8, gx + 3.1, zw + side * 12, 4.5, 0.5, 'brick');
    const exitGlow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), this.mats.exit.clone());
    exitGlow.position.set(gx, 2.4, zw + side * 11);
    exitGlow.rotation.y = side > 0 ? Math.PI : 0;
    this.root.add(exitGlow);
    const doors = [];
    for (const s of [-1, 1]) {
      const d = new THREE.Mesh(boxGeo(2.5, 4.2, 0.16, 1.5), this.mats.rust);
      d.position.set(gx + s * 1.25, 2.1, zw);
      d.castShadow = d.receiveShadow = true;
      this.root.add(d);
      doors.push({ mesh: d, closedX: gx + s * 1.25, openX: gx + s * 3.6 });
    }
    const obstacle = this.physics.addBox(gx, zw, 2.5, 0.3, 0, 4.2, 'gate');
    const lx = gx + 4.6, lz = zw + inward * 1.3;
    this.solid(lx, lz, 0.55, 0.4, 1.25, 0, 'metal');
    const bulbs = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.MeshStandardMaterial({ color: 0x220505, emissive: 0xff2010, emissiveIntensity: 0, roughness: 0.3 });
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m);
      b.position.set(lx - 0.15 + i * 0.15, 1.33, lz);
      this.root.add(b);
      bulbs.push(m);
    }
    const beamBulbs = [];
    for (let i = -1; i <= 1; i++) {
      const m = new THREE.MeshStandardMaterial({ color: 0x220505, emissive: 0xff2010, emissiveIntensity: 0, roughness: 0.3 });
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), m);
      b.position.set(gx + i * 2, 4.85, zw + inward * 0.4);
      this.root.add(b);
      beamBulbs.push(m);
    }
    const gate = {
      id: this.gates.length, x: gx, z: zw, side, inward, lever: { x: lx, z: lz + inward * 0.75 },
      powered: false, progress: 0, open: false, openAnim: 0, doors, bulbs, beamBulbs, obstacle, exitGlow,
      light: this.addLight(gx, 4.4, zw + inward * 1.2, 0xff2010, 0, 0.0, 22),
    };
    gate.light.on = false;
    this.reserve(gx, zw + inward * 2, 4);
    this.reserve(lx, lz + inward, 1.5);
    this.gates.push(gate);
  }

  _chapel(cx, cz, rot) {
    const tf = this._tf(cx, cz, rot);
    const W = (a, b, c, d, h = 5.2) => {
      const [x0, z0] = tf(a, b), [x1, z1] = tf(c, d);
      this.wall(x0, z0, x1, z1, h, 0.6, 'redBrick');
    };
    W(-8.3, -5.5, -1.3, -5.5); W(1.3, -5.5, 8.3, -5.5);
    W(-8.3, 5.5, 3.0, 5.5); W(5.6, 5.5, 8.3, 5.5);
    W(-8, -5.5, -8, -1.3); W(-8, 1.3, -8, 5.5);
    W(8, -5.5, 8, 5.5, 5.8);
    W(-3, -5.5, -3, 1.6, 4.4);
    // tower
    const [tx, tz] = tf(-9.4, 6.6);
    this.solid(tx, tz, 2.6, 2.6, 10, rot, 'redBrick');
    this.bucket('wood', place(new THREE.ConeGeometry(2.3, 2.8, 4, 1).rotateY(Math.PI / 4), tx, 11.4, tz, rot));
    // roof beams & partial roof over west room
    for (let i = 0; i < 6; i++) {
      const lx = -6.5 + i * 2.8;
      const [bx, bz] = tf(lx, 0);
      this.bucket('wood', place(boxGeo(0.25, 0.3, 11.6, 2), bx, 5.15, bz, rot));
    }
    const [rx, rz] = tf(-5.5, 0);
    this.bucket('wood', place(boxGeo(5.6, 0.18, 11.8, 2), rx, 5.45, rz, rot, 0, 0.12));
    // altar + candles
    const [ax, az] = tf(6.8, 0);
    this.solid(ax, az, 1.0, 2.4, 1.0, rot, 'brick');
    for (let i = 0; i < 5; i++) {
      const [px, pz] = tf(6.7, -0.9 + i * 0.45);
      const h = 0.2 + (i % 2) * 0.12;
      this.bucket('wax', place(new THREE.CylinderGeometry(0.035, 0.04, h, 6), px, 1.0 + h / 2, pz));
      this.bucket('flame', place(new THREE.ConeGeometry(0.025, 0.08, 5), px, 1.05 + h, pz));
    }
    this.addLight(ax, 1.6, az, 0xff9a40, 10, 0.3, 12);
    // stained glass
    for (const [lz, mat] of [[-2.6, 'glassRed'], [2.6, 'glassBlue']]) {
      for (const lx of [8.33, 7.67]) {
        const [gx, gz] = tf(lx, lz);
        this.bucket(mat, place(boxGeo(0.04, 1.8, 0.9, 1.8), gx, 3.2, gz, rot));
      }
    }
    // pews
    for (const lz of [-3.6, 3.4]) {
      const [px, pz] = tf(2.2, lz);
      this.solid(px, pz, 3.2, 0.6, 0.85, rot, 'wood');
    }
    const [px, pz] = tf(0, -5.5);
    this._pallet(px, pz, rot, 2.6);
    const [gx, gz] = tf(3.6, -0.6);
    this._gen(gx, gz, rot + Math.PI / 2);
    this.reserve(cx, cz, 2);
  }

  _tile(type, cx, cz, rot) {
    const tf = this._tf(cx, cz, rot);
    const W = (a, b, c, d, h = 2.7, mat = 'brick', th = 0.6) => {
      const [x0, z0] = tf(a, b), [x1, z1] = tf(c, d);
      this.wall(x0, z0, x1, z1, h, th, mat);
    };
    const P = (lx, lz, axisZ, w, off) => {
      const [x, z] = tf(lx, lz);
      this._pallet(x, z, rot + (axisZ ? 0 : Math.PI / 2), w, off);
    };
    if (type === 'A') {
      W(-5.8, 0, -1.2, 0); W(1.2, 0, 3.8, 0); W(3.8, -0.3, 3.8, 3.6);
      P(0, 0, true, 2.4);
      const [rx, rz] = tf(-6.5, 3);
      if (this.isFree(rx, rz, 1.2)) this._rockMesh(rx, rz, 0.9, 1.4);
    } else if (type === 'B') {
      let [x, z] = tf(-3.4, 0); this._car(x, z, rot);
      [x, z] = tf(3.4, 0.15); this._car(x, z, rot + 0.06);
      [x, z] = tf(6.9, 3.2); this._car(x, z, rot + Math.PI / 2 + 0.1);
      [x, z] = tf(-6.4, 1.9);
      for (let i = 0; i < 3; i++) this.bucket('rubber', place(new THREE.TorusGeometry(0.4, 0.15, 6, 12).rotateX(Math.PI / 2), x, 0.15 + i * 0.3, z));
      this.physics.addCircle(x, z, 0.55, 0.9);
      P(0, 0.05, true, 2.4, 1.1);
    } else if (type === 'C') {
      W(-3.2, -2.6, 3.2, -2.6, 3.0, 'wood', 0.25);
      W(-3.2, 2.6, -1.15, 2.6, 3.0, 'wood', 0.25); W(1.15, 2.6, 3.2, 2.6, 3.0, 'wood', 0.25);
      W(-3.2, -2.6, -3.2, 2.6, 3.0, 'wood', 0.25);
      W(3.2, -2.6, 3.2, -0.6, 3.0, 'wood', 0.25); W(3.2, 1.5, 3.2, 2.6, 3.0, 'wood', 0.25);
      this.bucket('wood', place(boxGeo(7.0, 0.15, 6.0, 2), cx, 3.15, cz, rot, 0, 0.08));
      P(0, 2.6, true, 2.3);
      const [lx, lz] = tf(-1.6, -1.2);
      this.bucket('metal', place(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 8), lx, 2.5, lz));
      this.bucket('flame', place(new THREE.SphereGeometry(0.06, 8, 6), lx, 2.35, lz));
      this.addLight(lx, 2.2, lz, 0xffa050, 6, 0.25, 9);
      this.reserve(cx, cz, 3);
    } else {
      let [x, z] = tf(-2.6, 0); this._rockMesh(x, z, 1.45, 2.6);
      [x, z] = tf(2.6, 0); this._rockMesh(x, z, 1.45, 2.4);
      [x, z] = tf(5.4, 1.8); this._rockMesh(x, z, 1.1, 1.8);
      [x, z] = tf(-5.4, -2.2);
      if (this.isFree(x, z, 1)) this._tree(x, z, 'dead', 1.2);
      P(0, 0, true, 2.4);
    }
    this.reserve(cx, cz, 2.5);
  }

  _layoutDiorama() {
    const r = this.rng;
    this.wall(-7, -6, -1.5, -6.5, 2.8, 0.6, 'brick');
    this.wall(-7, -6, -7.5, -1, 2.6, 0.6, 'brick');
    this._gen(-4.2, -3.2, 0.5);
    this._hook(4.4, -3.8, -0.4);
    this._barrel(2.4, 1.6);
    this._car(7.5, 2.5, 1.2);
    this._totem(-2.6, 2.8);
    this._rockMesh(-5.5, 3.5, 1.2, 1.6);
    this._rockMesh(6.2, -6.5, 1.5, 2.2);
    const [tx, tz] = [-10, -16];
    this.solid(tx, tz, 2.6, 2.6, 10, 0.3, 'redBrick');
    this.bucket('wood', place(new THREE.ConeGeometry(2.3, 2.8, 4, 1).rotateY(Math.PI / 4), tx, 11.4, tz, 0.3));
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = 10 + r() * 22;
      this._tree(Math.cos(a) * d, Math.sin(a) * d, r() < 0.6 ? 'pine' : 'dead', 0.9 + r() * 0.8, false);
    }
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2, d = 6 + r() * 6;
      this.bushes.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: 0.8 + r() * 0.5 });
    }
  }

  // ------------------------------------------------------------ instancing
  _instances() {
    const r = this.rng;
    const dummy = new THREE.Object3D();
    const make = (geo, mat, list, setup, cast = true) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => { setup(dummy, it); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
      im.castShadow = cast;
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.root.add(im);
      return im;
    };
    // pines
    const trunk = new THREE.CylinderGeometry(0.2, 0.32, 3.4, 7);
    trunk.translate(0, 1.7, 0);
    const uv = trunk.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 3);
    const fol = [];
    const tiers = [[2.3, 3.2, 3.0], [1.8, 2.8, 4.6], [1.25, 2.4, 6.0], [0.7, 1.8, 7.2]];
    for (const [rad, h, y] of tiers) {
      const c = new THREE.ConeGeometry(rad, h, 9, 2);
      jitter(c, 0.35, r);
      c.translate(0, y, 0);
      fol.push(clean(c));
    }
    const foliage = mergeGeometries(fol);
    foliage.computeVertexNormals();
    const set = (d, t) => { d.position.set(t.x, 0, t.z); d.rotation.set(0, t.rot, 0); d.scale.setScalar(t.s); };
    make(trunk, this.mats.bark, this.trees.pine, set);
    make(foliage, this.mats.pine, this.trees.pine, set);
    // dead trees
    const parts = [];
    const t0 = new THREE.CylinderGeometry(0.14, 0.34, 6.5, 7);
    t0.translate(0, 3.25, 0);
    parts.push(clean(t0));
    for (let i = 0; i < 6; i++) {
      const len = 1.4 + r() * 1.6;
      const b = new THREE.CylinderGeometry(0.03, 0.09, len, 5);
      b.translate(0, len / 2, 0);
      b.rotateZ(0.7 + r() * 0.5);
      b.rotateY((i / 6) * Math.PI * 2 + r());
      b.translate(0, 2.6 + i * 0.6, 0);
      parts.push(clean(b));
    }
    const dead = mergeGeometries(parts);
    make(dead, this.mats.bark, this.trees.dead, set);
    // rocks (three shapes)
    const shapes = [0, 1, 2].map((k) => {
      const g = new THREE.IcosahedronGeometry(1, 2);
      const p = g.attributes.position;
      const rr = (k + 3) * 13.7;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = 1 + 0.22 * Math.sin(x * 2.1 + rr) * Math.cos(z * 1.7 + rr * 0.5) + 0.12 * Math.sin(y * 4 + rr);
        p.setXYZ(i, x * n, y * n * 0.75, z * n);
      }
      g.computeVertexNormals();
      return g;
    });
    for (let k = 0; k < 3; k++) {
      const list = this.rocks.filter((_, i) => i % 3 === k);
      make(shapes[k], this.mats.rock, list, (d, t) => {
        d.position.set(t.x, t.h * 0.25, t.z);
        d.rotation.set(0, t.rot, 0);
        d.scale.set(t.r, t.h * 0.8, t.r);
      });
    }
    // bushes
    const lumps = [];
    for (const [lx, ly, lz, ls] of [[0, 0.45, 0, 0.62], [0.42, 0.3, 0.15, 0.45], [-0.38, 0.32, -0.12, 0.48], [0.05, 0.28, -0.45, 0.42], [-0.1, 0.25, 0.45, 0.4]]) {
      const b = new THREE.IcosahedronGeometry(ls, 1);
      jitter(b, ls * 0.35, r);
      b.translate(lx, ly, lz);
      lumps.push(clean(b));
    }
    const bush = mergeGeometries(lumps);
    bush.computeVertexNormals();
    make(bush, this.mats.bush, this.bushes, (d, t) => {
      d.position.set(t.x, 0, t.z);
      d.rotation.set(0, r() * 6, 0);
      d.scale.set(t.r, t.r * 0.9, t.r);
    });
  }

  _grass() {
    const count = Math.floor(this.q.grass * (this.diorama ? 0.35 : 1));
    if (!count) return;
    const planes = [];
    for (let i = 0; i < 3; i++) {
      const p = new THREE.PlaneGeometry(0.85, 0.5);
      p.translate(0, 0.25, 0);
      p.rotateY((i / 3) * Math.PI);
      planes.push(p);
    }
    const g = mergeGeometries(planes);
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const im = new THREE.InstancedMesh(g, this.mats.grass, count);
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    const r = this.rng;
    const H = this.half - 1;
    let k = 0;
    const tmp = [];
    for (let tries = 0; k < count && tries < count * 3; tries++) {
      const x = (r() - 0.5) * H * 2, z = (r() - 0.5) * H * 2;
      this.physics.query(x - 0.3, z - 0.3, x + 0.3, z + 0.3, tmp);
      let bad = false;
      for (const o of tmp) if (this.physics.distTo(o, x, z) < 0.25) { bad = true; break; }
      if (bad) continue;
      d.position.set(x, 0, z);
      d.rotation.set(0, r() * Math.PI, 0);
      const s = 0.55 + r() * 0.7;
      d.scale.set(s, s * (0.7 + r() * 0.6), s);
      d.updateMatrix();
      im.setMatrixAt(k, d.matrix);
      col.setHSL(0.17 + r() * 0.08, 0.2 + r() * 0.2, 0.75 + r() * 0.25);
      im.setColorAt(k, col);
      k++;
    }
    im.count = k;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    this.root.add(im);
  }

  _atmosphere() {
    const n = this.q.fogSprites;
    this.fogSprites = [];
    const fogTint = new THREE.Color(this.nightmare ? 0x5a2a2a : 0x41506e);
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map: this.tex.fog, color: fogTint, transparent: true, opacity: 0.08 + Math.random() * 0.08, depthWrite: false, fog: true });
      const s = new THREE.Sprite(m);
      const sc = 9 + Math.random() * 8;
      s.scale.set(sc, sc * 0.45, 1);
      s.position.set((Math.random() - 0.5) * 60, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 60);
      s.userData.v = { x: (Math.random() - 0.5) * 0.5, z: (Math.random() - 0.5) * 0.5 };
      s.renderOrder = 4;
      this.scene.add(s);
      this.fogSprites.push(s);
      this.disposables.push(s);
    }
    const dn = Math.floor(450 * this.q.particles);
    const pos = new Float32Array(dn * 3);
    for (let i = 0; i < dn; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = Math.random() * 9;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({
      size: this.nightmare ? 0.09 : 0.06, map: this.tex.glow, color: this.nightmare ? 0xff6a3a : 0xa8bcff,
      transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    this.disposables.push(this.dust);
    this.dustBase = pos.slice();
  }

  build() {
    this._sky();
    this._lights();
    this._ground();
    if (this.diorama) this._layoutDiorama(); else this._layoutMap();
    this._instances();
    this._flushBuckets();
    this.physics.buildGrid(1, 0.5);
    for (const g of this.gens) for (const s of g.spots) s.ok = this.physics.walkable(s.x, s.z);
    this._grass();
    this._atmosphere();
    return this;
  }

  // ------------------------------------------------------------ per frame
  update(dt, focus, camera, fx) {
    this.time += dt;
    const t = this.time;
    this.windUniform.value = t;
    this.sky.material.uniforms.time.value = t;
    this.sky.position.copy(camera.position);

    // moon shadow follows the focus, snapped to texels to avoid shimmer
    const snap = this.q.shadows ? (64 / this.q.shadows) : 1;
    const fx0 = Math.round(focus.x / snap) * snap, fz0 = Math.round(focus.z / snap) * snap;
    this.moon.target.position.set(fx0, 0, fz0);
    this.moon.position.set(fx0 + this.moonDir.x * 70, this.moonDir.y * 70, fz0 + this.moonDir.z * 70);

    // fire particles
    if (fx) {
      for (const f of this.fires) {
        const fl = 0.8 + Math.sin(t * 11 + f.x) * 0.12 + Math.sin(t * 23 + f.z) * 0.08;
        f.core.scale.set(1.7 * fl, 1.9 * fl, 1);
        if (Math.hypot(f.x - camera.position.x, f.z - camera.position.z) > 45) continue;
        f.acc += dt * 46 * this.q.particles;
        while (f.acc > 1) {
          f.acc -= 1;
          fx.add.spawn({
            x: f.x + (Math.random() - 0.5) * 0.4, y: f.y, z: f.z + (Math.random() - 0.5) * 0.4,
            vx: (Math.random() - 0.5) * 0.3, vy: 1.2 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 0.3,
            life: 0.45 + Math.random() * 0.5, size: 0.75, size1: 0.15, color: 0xffc060, color1: 0xff2a08, alpha: 0.85, alpha1: 0,
          });
          if (Math.random() < 0.08) {
            fx.add.spawn({ x: f.x, y: f.y + 0.3, z: f.z, vx: (Math.random() - 0.5), vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5), life: 1.4, size: 0.06, color: 0xffc070, alpha: 1, alpha1: 0, drag: 0.5 });
          }
        }
      }
    }

    // generators
    for (const g of this.gens) {
      const working = g.workers.size > 0;
      for (let i = 0; i < g.pistons.length; i++) {
        const target = g.done && !g.blocked ? 1.3 + Math.sin(t * 22 + i * 1.7) * 0.03 : working ? 1.3 + Math.sin(t * 14 + i * 1.6) * 0.07 : 1.3;
        g.pistons[i].position.y = target;
      }
      g.shake = Math.max(0, g.shake - dt * 2);
      const sh = (working ? 0.012 : 0) + g.shake * 0.05;
      g.group.position.x = g.x + (Math.random() - 0.5) * sh;
      g.group.position.z = g.z + (Math.random() - 0.5) * sh;
      const lit = Math.floor(g.progress * 5 + 0.001);
      const lit2 = g.done && !g.blocked;
      g.leds.forEach((m, i) => {
        m.emissive.setHex(lit2 ? 0x60ff80 : g.regress ? 0xff2010 : 0xffa020);
        m.emissiveIntensity = g.blocked ? 0 : lit2 ? 3 : i < lit ? 2.5 : g.regress ? (Math.sin(t * 10) > 0 ? 1.5 : 0.2) : 0.15;
      });
      g.lampMat.emissiveIntensity = lit2 ? 6 + Math.sin(t * 30) * 0.4 : working ? 0.2 + Math.random() * 0.3 : 0;
      g.light.on = lit2;
      g.light.intensity = lit2 ? 26 : 0;
    }
    // pallets
    for (const p of this.pallets) {
      if (p.state === 'down' && p.anim < 1) {
        p.anim = Math.min(1, p.anim + dt / 0.28);
        const e = p.anim * p.anim;
        p.pivot.rotation.z = (Math.PI / 2) * (1 - e) + (p.anim >= 1 ? 0.05 : 0);
      }
    }
    // hooks
    for (const h of this.hooks) {
      const occupied = !!h.victim;
      h.glowMat.emissiveIntensity = occupied ? 1.2 + Math.sin(t * 4) * 0.4 : 0;
      h.light.on = occupied;
      h.light.intensity = occupied ? 9 : 0;
      if (h.spikeAnim > 0) {
        h.spikes.visible = true;
        h.spikeAnim = Math.max(0, h.spikeAnim - dt * 0.35);
        const k = h.spikeAnim > 0.6 ? (1 - h.spikeAnim) / 0.4 : h.spikeAnim / 0.6;
        h.spikes.scale.set(1, Math.max(0.001, k), 1);
        h.glowMat.emissiveIntensity = 2.5 * k;
        if (h.spikeAnim === 0) h.spikes.visible = false;
      }
    }
    // gates
    for (const gt of this.gates) {
      if (gt.open && gt.openAnim < 1) {
        gt.openAnim = Math.min(1, gt.openAnim + dt / 2.4);
        const e = gt.openAnim * gt.openAnim * (3 - 2 * gt.openAnim);
        for (const d of gt.doors) d.mesh.position.x = d.closedX + (d.openX - d.closedX) * e;
      }
      const blink = Math.sin(t * 6) > 0;
      gt.bulbs.forEach((m, i) => {
        const on = gt.open || gt.progress > (i + 1) / 3 - 0.001;
        m.emissive.setHex(gt.open ? 0x40ff70 : 0xff2a10);
        m.emissiveIntensity = !gt.powered ? 0 : on ? 4 : (blink ? 0.6 : 0.15);
      });
      gt.beamBulbs.forEach((m) => {
        m.emissive.setHex(gt.open ? 0x40ff70 : 0xff2a10);
        m.emissiveIntensity = gt.powered ? (gt.open ? 5 : 3) : 0;
      });
      gt.light.on = gt.powered;
      gt.light.color.setHex(gt.open ? 0x50ff80 : 0xff2a10);
      gt.light.intensity = gt.powered ? 30 : 0;
      gt.exitGlow.material.opacity = gt.open ? 0.35 * gt.openAnim : 0;
    }

    // light pool: brightest nearby sources get the real lights
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.25;
      const cx = camera.position.x, cz = camera.position.z;
      const cand = this.lightSources.filter((L) => L.on && L.base + L.intensity > 0)
        .map((L) => ({ L, s: Math.max(L.intensity, L.base) / (1 + (L.x - cx) ** 2 + (L.z - cz) ** 2) }))
        .sort((a, b) => b.s - a.s);
      this.active = cand.slice(0, this.pool.length).map((c) => c.L);
    }
    this.pool.forEach((p, i) => {
      const L = this.active?.[i];
      if (!L) { p.intensity = 0; return; }
      p.position.set(L.x, L.y, L.z);
      p.color.copy(L.color);
      p.distance = L.range;
      const fl = L.flicker ? 1 - L.flicker * (0.5 + 0.5 * Math.sin(t * 13 + L.seed) * Math.sin(t * 7.3 + L.seed * 2)) : 1;
      p.intensity = Math.max(L.intensity, 0) * fl;
    });

    // drifting fog banks + dust around the camera
    if (this.fogSprites) {
      for (const s of this.fogSprites) {
        s.position.x += s.userData.v.x * dt;
        s.position.z += s.userData.v.z * dt;
        const dx = s.position.x - focus.x, dz = s.position.z - focus.z;
        if (Math.abs(dx) > 32) s.position.x -= Math.sign(dx) * 64;
        if (Math.abs(dz) > 32) s.position.z -= Math.sign(dz) * 64;
      }
    }
    if (this.dust) {
      const p = this.dust.geometry.attributes.position;
      const b = this.dustBase;
      const cx = camera.position.x, cz = camera.position.z;
      for (let i = 0; i < p.count; i++) {
        let x = b[i * 3] + Math.sin(t * 0.3 + i) * 0.6, z = b[i * 3 + 2] + Math.cos(t * 0.25 + i * 1.3) * 0.6;
        let y = b[i * 3 + 1] + (this.nightmare ? -t * 0.4 : Math.sin(t * 0.4 + i * 0.7) * 0.3);
        x = cx + ((((x - cx) % 50) + 75) % 50) - 25;
        z = cz + ((((z - cz) % 50) + 75) % 50) - 25;
        y = ((y % 9) + 9) % 9;
        p.setXYZ(i, x, y, z);
      }
      p.needsUpdate = true;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !Object.values(this.mats).includes(o.material)) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
    this.scene.remove(this.root);
    for (const d of this.disposables) {
      d.parent?.remove(d);
      if (d.geometry) d.geometry.dispose();
      if (d.material && d.material.dispose) d.material.dispose();
      if (d.dispose && d.isLight) d.dispose();
    }
    this.scene.remove(this.moon.target);
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

export function makeTrapMesh() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x4a4d50, metalness: 0.85, roughness: 0.4 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 6, 18), metal);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 10), metal);
  plate.position.y = 0.03;
  g.add(plate);
  const jaws = [];
  for (const s of [-1, 1]) {
    const jaw = new THREE.Group();
    jaw.position.set(0, 0.03, s * 0.02);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.02, 5, 12, Math.PI), metal);
    arc.rotation.x = s * Math.PI / 2;
    jaw.add(arc);
    for (let i = 1; i < 8; i++) {
      const a = (i / 8) * Math.PI;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 4), metal);
      tooth.position.set(Math.cos(a) * 0.26, 0, s * Math.sin(a) * 0.26);
      tooth.rotation.x = s * Math.PI / 2;
      jaw.add(tooth);
    }
    jaw.rotation.x = s * -1.35;
    g.add(jaw);
    jaws.push({ g: jaw, s });
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.jaws = jaws;
  return g;
}
