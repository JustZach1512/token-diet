// ───────────────────────── estado del juego, carga de niveles y bucle principal ─────────────────────────
const G = {
  mode: 'boot', portals: [], T: [new THREE.Matrix4(), new THREE.Matrix4()], R: [new THREE.Matrix3(), new THREE.Matrix3()], linked: false,
  staticBoxes: [], collide: [], dynBlockers: [],
  cubes: [], buttons: [], pedestals: [], doors: [], platforms: [], launchers: [], pellets: [], receivers: [], fizzlers: [], goos: [], exits: [], droppers: [], indicators: [],
  triggers: [], checkpoints: [], signals: {}, timers: [], events: {},
  time: 0, levelTime: 0, gravityScale: 1, killY: -30, levelToken: 0,
  stats: { shots: 0, deaths: 0, teleports: 0 }, checkpoint: null, controlsEnabled: true,
  levelIndex: 0, def: null, L: null, flashPortal: null, deathFlash: 0,
  onEvent(name) { const t = G.L && G.L.onEvent && G.L.onEvent[name]; if (t) say(t); },
};
function after(t, fn) { G.timers.push({ t, fn, token: G.levelToken }); }

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'umbral.save.v1';
const save = { unlocked: 1, best: {}, settings: { quality: 'high', sens: 1, vol: 0.7, invert: false } };
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s) { Object.assign(save, s); save.settings = Object.assign({ quality: 'high', sens: 1, vol: 0.7, invert: false }, s.settings || {}); } } catch (e) { /* sin almacenamiento */ }
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* sin almacenamiento */ } }

// ───── escena base ─────
function initScene() {
  const canvas = $('view');
  initRenderer(canvas);
  buildMaterials(R.renderer);
  const env = makeEnvMap(R.renderer);
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.background = new THREE.Color(0x05070a);
  scene.fog = new THREE.FogExp2(0x0a0d12, 0.0065);
  G.scene = scene;
  G.camera = new THREE.PerspectiveCamera(75, 1, 0.03, 260);
  G.camera.rotation.order = 'YXZ';
  const hemi = new THREE.HemisphereLight(0xdde7ff, 0x3a4048, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  G.sun = sun;
  G.portals = [new Portal(0), new Portal(1)];
  for (const P of G.portals) scene.add(P.group, P.light);
  G.bodyModel = buildBodyModel(); G.bodyModel.visible = false; scene.add(G.bodyModel);
  // dispositivo en primera persona
  G.gunScene = new THREE.Scene();
  G.gunScene.environment = env;
  G.gunCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  G.gun = buildGun(); G.gun.scale.setScalar(0.82); G.gunScene.add(G.gun);
  G.gunScene.add(new THREE.HemisphereLight(0xeef3ff, 0x2b3038, 0.55));
  const gl = new THREE.DirectionalLight(0xffffff, 0.85); gl.position.set(1, 2, 1); G.gunScene.add(gl);
  G.gunLight = new THREE.PointLight(BLUE, 0.12, 0.8, 2); G.gunLight.position.set(0.2, -0.05, -0.6); G.gunScene.add(G.gunLight);
  G.player = new Player();
  resize(true);
}

function disposeTree(o) {
  o.traverse(n => {
    if (n.geometry) n.geometry.dispose();
    if (n.material && !Object.values(MAT).includes(n.material)) {
      const ms = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of ms) m.dispose();
    }
  });
}

function newLevelData() {
  return { boxes: [], goo: [], fizzlers: [], cubes: [], droppers: [], buttons: [], pedestals: [], doors: [], platforms: [], launchers: [], receivers: [], exits: [], triggers: [], lights: [], strips: [], hazard: [], windows: [], indicators: [], messages: [], checkpoints: [], killY: null };
}

function loadLevel(def, opts = {}) {
  G.levelToken++;
  if (G.world) { G.scene.remove(G.world); disposeTree(G.world); }
  clearBursts(); TRACERS.length = 0;
  G.world = new THREE.Group(); G.static = new THREE.Group(); G.dyn = new THREE.Group(); G.fx = new THREE.Group();
  G.world.add(G.static, G.dyn, G.fx); G.scene.add(G.world);
  G.def = def; G.timers = []; G.events = {}; G.signals = {}; G.pellets = []; G.checkpoint = null; G.gravityScale = 1;
  const L = newLevelData();
  def.build(L);
  G.L = L;
  G.buttons = L.buttons.map(s => new FloorButton(L, s));
  G.pedestals = L.pedestals.map(s => new Pedestal(L, s));
  G.launchers = L.launchers.map(s => new Launcher(L, s));
  G.receivers = L.receivers.map(s => new Receiver(L, s));
  G.staticBoxes = L.boxes;
  buildStaticMeshes(L.boxes, G.static);
  G.doors = L.doors.map(s => new Door(s));
  G.platforms = L.platforms.map(s => new Platform(s));
  G.fizzlers = L.fizzlers.map(s => new Fizzler(s));
  G.goos = L.goo.map(s => new Goo(s));
  G.exits = L.exits.map(s => new Exit(s));
  G.droppers = L.droppers.map(s => new Dropper(s));
  G.indicators = L.indicators.map(s => new Indicator(s));
  G.cubes = [];
  for (const c of L.cubes) spawnCube(v3(...c.pos), c);
  G.triggers = L.triggers.map(t => ({ ...t, min: v3(...t.min), max: v3(...t.max), done: false }));
  G.checkpoints = L.checkpoints.map(c => ({ ...c, done: false }));
  // límites del nivel
  const lo = v3(Infinity, Infinity, Infinity), hi = v3(-Infinity, -Infinity, -Infinity);
  for (const b of L.boxes) { lo.min(b.min); hi.max(b.max); }
  G.bounds = { min: lo, max: hi };
  G.killY = L.killY !== null ? L.killY : lo.y - 6;
  decorate(L);
  // sol para las sombras
  const ctr = lo.clone().add(hi).multiplyScalar(0.5), ext = hi.clone().sub(lo);
  const sun = G.sun;
  sun.position.set(ctr.x - ext.x * 0.18, hi.y + 30, ctr.z + ext.z * 0.12);
  sun.target.position.copy(ctr);
  const half = Math.max(ext.x, ext.z) * 0.62 + 4;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: ext.y + 80 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.castShadow = R.quality === 'high';
  for (const P of G.portals) P.clear();
  portalsChanged();
  G.stats = opts.keepStats ? G.stats : { shots: 0, deaths: 0, teleports: 0 };
  G.levelTime = opts.keepStats ? G.levelTime : 0;
  const sp = L.spawn;
  G.player.spawnAt(v3(...sp.pos), sp.yaw, sp.pitch || 0);
  G.player.c.y += 0.0;
  for (const m of L.messages) after(m.t, () => say(m.text, { once: def.num + m.t }));
  updateCrosshair();
  R.renderer.compile(G.scene, G.camera);
}

// ───── decoración: luces, lámparas, señales, franjas y ventanas ─────
function decorate(L) {
  for (const l of L.lights) {
    const pl = new THREE.PointLight(l.color !== undefined ? l.color : 0xf2f5ff, l.i * 1.7, (l.d || 20) * 1.25, 2);
    pl.position.set(...l.pos); G.dyn.add(pl);
  }
  for (const [a, b] of L.strips) {
    const A = v3(...a), B = v3(...b), len = A.distanceTo(B), mid = A.clone().add(B).multiplyScalar(0.5);
    const alongX = Math.abs(B.x - A.x) > Math.abs(B.z - A.z);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.2, 0.05, alongX ? 0.2 : len), MAT.lamp);
    lamp.position.copy(mid).add(v3(0, -0.04, 0));
    const house = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len + 0.2 : 0.42, 0.08, alongX ? 0.42 : len + 0.2), MAT.trim);
    house.position.copy(mid).add(v3(0, -0.01, 0));
    G.static.add(house, lamp);
  }
  if (L.sign) {
    const d = G.def;
    const total = String(LEVELS.length).padStart(2, '0');
    const t = makeChamberSign(d.sandbox ? '∞' : d.num, d.sandbox ? '∞' : total, d.name, d.icons || []);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color(0.5, 0.5, 0.5), roughness: 0.6 }));
    const n = v3(...L.sign.normal);
    m.position.set(...L.sign.pos).addScaledVector(n, 0.02);
    m.lookAt(m.position.clone().add(n));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.12, 2.12, 0.024), MAT.trim);
    frame.position.set(...L.sign.pos).addScaledVector(n, 0.002); frame.lookAt(frame.position.clone().add(n));
    G.static.add(frame, m);
  }
  for (const [x0, y, z0, x1, z1] of L.hazard) {
    const w = x1 - x0, d = z1 - z0;
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv, longX = w >= d;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), vv = uv.getY(i);
      if (longX) uv.setXY(i, u * w / (Math.min(w, d) * 4), vv); else uv.setXY(i, vv * d / (Math.min(w, d) * 4), u);
    }
    const m = new THREE.Mesh(g, MAT.stripes); m.position.set((x0 + x1) / 2, y + 0.006, (z0 + z1) / 2); m.receiveShadow = true;
    G.static.add(m);
  }
  for (const w of L.windows) {
    const n = v3(...w.normal), pos = v3(...w.pos);
    const tex = makeWindowTexture();
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.h), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.4, 1.3, 1.2) }));
    inner.position.copy(pos).addScaledVector(n, 0.015); inner.lookAt(inner.position.clone().add(n));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.h), new THREE.MeshStandardMaterial({ color: 0x9fc8e8, roughness: 0.02, metalness: 0.6, transparent: true, opacity: 0.35, envMapIntensity: 2.5 }));
    glass.position.copy(pos).addScaledVector(n, 0.03); glass.lookAt(glass.position.clone().add(n));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w.w + 0.34, w.h + 0.34, 0.02), MAT.trim);
    frame.position.copy(pos); frame.lookAt(frame.position.clone().add(n));
    G.static.add(frame, inner, glass);
  }
  // motas de polvo
  const N = 650, pos = new Float32Array(N * 3), seeds = new Float32Array(N), b = G.bounds;
  for (let i = 0; i < N; i++) {
    pos[i * 3] = lerp(b.min.x + 1, b.max.x - 1, Math.random());
    pos[i * 3 + 1] = lerp(b.min.y + 1, b.max.y - 1, Math.random());
    pos[i * 3 + 2] = lerp(b.min.z + 1, b.max.z - 1, Math.random());
    seeds[i] = Math.random();
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  G.dustU = { uTime: { value: 0 }, uPix: { value: 30 } };
  const dust = new THREE.Points(dg, new THREE.ShaderMaterial({ uniforms: G.dustU, vertexShader: DUST_VS, fragmentShader: DUST_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  dust.frustumCulled = false;
  G.fx.add(dust);
}
let _windowTex = null;
function makeWindowTexture() {
  if (_windowTex) return _windowTex;
  const c = mkCanvas(512, 192), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 192); g.addColorStop(0, '#3b2f22'); g.addColorStop(1, '#120e0a');
  x.fillStyle = g; x.fillRect(0, 0, 512, 192);
  const l = x.createRadialGradient(256, -20, 10, 256, -20, 300); l.addColorStop(0, 'rgba(255,214,150,0.55)'); l.addColorStop(1, 'rgba(255,214,150,0)');
  x.fillStyle = l; x.fillRect(0, 0, 512, 192);
  for (let i = 0; i < 5; i++) {
    const px = 40 + i * 95;
    x.fillStyle = '#0b0907'; x.fillRect(px, 112, 70, 80);
    x.fillStyle = 'rgba(140,200,255,0.75)'; x.fillRect(px + 8, 82, 54, 30);
    x.fillStyle = '#0b0907'; x.fillRect(px + 31, 112, 8, 10);
  }
  x.fillStyle = '#080605'; x.fillRect(0, 150, 512, 42);
  _windowTex = tex(c, true, false);
  return _windowTex;
}

// ───── simulación ─────
function updateSignals() {
  for (const b of G.buttons) G.signals[b.id] = b.on;
  for (const p of G.pedestals) if (p.id) G.signals[p.id] = p.on;
  for (const r of G.receivers) G.signals[r.id] = r.on;
}
function step(dt) {
  G.time += dt;
  if (G.mode === 'play') G.levelTime += dt;
  if (G.mode === 'menu' && G.demoCube) {
    // demo del menú: el cubo cae al pozo y sale disparado por el portal de la pared
    G.demoT += dt;
    if (G.demoT > 6.5) {
      G.demoT = 0;
      const c = G.demoCube;
      if (c.alive) { spawnBurst(c.c, new THREE.Color(0.5, 0.8, 1), 20, 2); c.c.set(...MENU_DEMO.cube); c.vel.set(0, 0, 0); }
    }
  }
  for (let i = G.timers.length - 1; i >= 0; i--) {
    const t = G.timers[i];
    if (t.token !== G.levelToken) { G.timers.splice(i, 1); continue; }
    t.t -= dt;
    if (t.t <= 0) { G.timers.splice(i, 1); t.fn(); }
  }
  for (const cb of G.cubes) cb.onButton = false;
  for (const b of G.buttons) b.update(dt);
  for (const p of G.pedestals) p.update(dt);
  for (const r of G.receivers) r.update(dt);
  updateSignals();
  for (const d of G.doors) d.update(dt);
  for (const p of G.platforms) p.update(dt);
  G.dynBlockers = [];
  for (const d of G.doors) if (d.solid) G.dynBlockers.push(d.box);
  for (const p of G.platforms) G.dynBlockers.push(p.box);
  if (G.mode === 'play') G.player.update(dt);
  for (const cb of G.cubes.slice()) cb.update(dt);
  for (const d of G.droppers) d.update(dt);
  for (const l of G.launchers) l.update(dt);
  for (const p of G.pellets) p.update(dt);
  G.pellets = G.pellets.filter(p => p.alive);
  if (G.mode === 'play') {
    for (const e of G.exits) e.update();
    const pc = G.player.c;
    for (const t of G.triggers) if (!t.done && pc.x > t.min.x && pc.x < t.max.x && pc.y > t.min.y && pc.y < t.max.y && pc.z > t.min.z && pc.z < t.max.z) { t.done = true; say(t.text); }
    for (const cp of G.checkpoints) if (!cp.done && cp.when()) {
      cp.done = true; G.checkpoint = cp;
      if (cp.cubeSpawn) for (const cb of G.cubes) cb.spawn = v3(...cp.cubeSpawn);
    }
  }
  if (G.events.picked && !G.events.pickedSaid) { G.events.pickedSaid = true; G.onEvent('picked'); }
  if (G.events.received && !G.events.receivedSaid) { G.events.receivedSaid = true; G.onEvent('received'); }
  if (G.events.cubeFizzled && !G.events.cubeFizzSaid) { G.events.cubeFizzSaid = true; G.onEvent('cubeFizzled'); }
}
function simulate(dt) {
  const n = Math.max(1, Math.ceil(dt / MAX_SUBSTEP));
  const sdt = dt / n;
  for (let i = 0; i < n; i++) step(sdt);
}

function handleActions() {
  const p = G.player;
  if (G.mode !== 'play' || !p.alive) return;
  if (Input.wasHit('Mouse0', 'Digit1')) p.shoot(0);
  if (Input.wasHit('Mouse2', 'Digit2')) p.shoot(1);
  if (Input.wasHit('KeyE')) p.use();
  if (Input.wasHit('Space')) p.jumpBuf = 0.16;
  if (Input.wasHit('KeyR')) { restartLevel(); return; }
  if (G.def.sandbox) {
    if (Input.wasHit('KeyC')) {
      const at = p.eye.addScaledVector(p.forward(v3()), 1.8);
      const c = spawnCube(at, {}); c.spawn = null; depenetrate(c);
      Sound.play('drop');
    }
    if (Input.wasHit('KeyG')) { G.gravityScale = G.gravityScale === 1 ? 0.3 : 1; toast(G.gravityScale === 1 ? 'Gravedad normal' : 'Gravedad baja'); }
    if (Input.wasHit('KeyF')) clearPortals();
  }
}

// ───── flujo de nivel ─────
function startLevel(index, opts = {}) {
  G.levelIndex = index;
  const def = index === 'sandbox' ? SANDBOX : LEVELS[index];
  clearSay();
  loadLevel(def, opts);
  G.mode = 'play';
  showScreen(null);
  $('hud').hidden = false;
  $('hud-num').textContent = def.sandbox ? 'ZP' : def.num;
  $('hud-name').textContent = def.name;
  $('keys-sandbox').hidden = !def.sandbox;
  showIntro(def);
  lockPointer();
}
function restartLevel() {
  if (G.levelIndex === null) return;
  const keep = G.mode === 'play';
  const deaths = G.stats.deaths, shots = G.stats.shots, t = G.levelTime;
  loadLevel(G.def, {});
  if (keep) { G.stats.deaths = deaths; G.stats.shots = shots; G.levelTime = t; }
  G.mode = 'play';
  $('dead').hidden = true;
}
function killPlayer(reason) {
  const p = G.player;
  if (!p.alive || G.mode !== 'play') return;
  p.alive = false;
  if (p.holding) p.drop(true);
  G.stats.deaths++;
  G.deathFlash = 1;
  Sound.play('death');
  $('dead').hidden = false;
  const lines = (G.L && G.L.onDeath) || [];
  if (lines.length) say(lines[Math.min(G.stats.deaths - 1, lines.length - 1)], { force: true });
  const token = G.levelToken;
  setTimeout(() => {
    if (G.levelToken !== token) return;
    $('dead').hidden = true;
    if (G.def.sandbox) { softRespawn(G.L.spawn); return; }
    if (G.checkpoint) softRespawn(G.checkpoint);
    else restartLevel();
  }, 1500);
}
function softRespawn(cp) {
  clearPortals(true);
  for (const pl of G.pellets) pl.kill(false);
  G.player.spawnAt(v3(...cp.pos), cp.yaw);
  depenetrate(G.player);
  G.deathFlash = Math.min(G.deathFlash, 0.5);
}
function levelComplete() {
  if (G.mode !== 'play') return;
  G.mode = 'complete';
  Sound.play('complete');
  const def = G.def;
  const idx = G.levelIndex;
  const t = G.levelTime;
  let record = false;
  if (typeof idx === 'number') {
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, idx + 2));
    if (idx === LEVELS.length - 1) save.finished = true;
    const prev = save.best[def.num];
    if (!prev || t < prev) { save.best[def.num] = t; record = !!prev; }
    writeSave();
  }
  unlockPointer();
  $('done-num').textContent = def.num;
  $('done-name').textContent = def.name;
  $('done-time').textContent = fmtTime(t) + (record ? ' · récord' : '');
  $('done-shots').textContent = G.stats.shots;
  $('done-deaths').textContent = G.stats.deaths;
  const last = idx === LEVELS.length - 1;
  $('done-next').hidden = last;
  $('done-final').hidden = !last;
  setTimeout(() => { if (G.mode === 'complete') { $('hud').hidden = true; showScreen('done'); } }, 650);
}

// ───── mensajes de N.O.R.A. ─────
const SAY = { queue: [], cur: null, typed: 0, hold: 0, said: new Set() };
function say(text, o = {}) {
  if (o.once !== undefined) { if (SAY.said.has(o.once)) return; SAY.said.add(o.once); }
  if (o.force) { SAY.queue.length = 0; SAY.cur = null; }
  if (SAY.cur && SAY.cur.text === text) return;
  if (SAY.queue.some(q => q.text === text)) return;
  SAY.queue.push({ text });
}
function updateSay(dt) {
  const box = $('say'), txt = $('say-text');
  if (!SAY.cur && SAY.queue.length) {
    SAY.cur = SAY.queue.shift(); SAY.typed = 0; SAY.hold = Math.max(4.5, SAY.cur.text.length / 13);
    box.hidden = false; box.classList.remove('out'); Sound.play('msg');
  }
  if (!SAY.cur) return;
  if (SAY.typed < SAY.cur.text.length) {
    SAY.typed = Math.min(SAY.cur.text.length, SAY.typed + dt * 55);
    txt.textContent = SAY.cur.text.slice(0, Math.floor(SAY.typed));
  } else {
    SAY.hold -= dt;
    if (SAY.hold < 0.4) box.classList.add('out');
    if (SAY.hold <= 0) { SAY.cur = null; if (!SAY.queue.length) box.hidden = true; }
  }
}
function clearSay() { SAY.queue.length = 0; SAY.cur = null; $('say').hidden = true; }

let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; el.classList.remove('out'); toastT = 1.3; }

// ───── HUD ─────
function fmtTime(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`; }
function updateCrosshair() {
  if (!G.portals.length) return;
  $('xh-b').classList.toggle('on', G.portals[0].placed);
  $('xh-o').classList.toggle('on', G.portals[1].placed);
}
function updateHUD(dt) {
  if (G.mode === 'play') $('hud-time').textContent = fmtTime(G.levelTime);
  updateSay(dt);
  if (toastT > 0) { toastT -= dt; if (toastT < 0.3) $('toast').classList.add('out'); if (toastT <= 0) $('toast').hidden = true; }
  const cd = $('countdown');
  let rem = 0;
  for (const p of G.pedestals) if (p.on && p.action === 'timer') rem = Math.max(rem, p.until - G.time);
  if (rem > 0 && G.mode === 'play') { cd.hidden = false; cd.textContent = rem.toFixed(1); cd.classList.toggle('low', rem < 3); }
  else cd.hidden = true;
  $('keys').classList.toggle('hide', !$('say').hidden || G.levelTime > 30);
  const held = G.player.holding;
  $('xhair').classList.toggle('holding', !!held);
}

// ───── cámara y efectos visuales ─────
let swayX = 0, swayY = 0;
function updateCamera(dt) {
  const cam = G.camera;
  if (G.mode === 'menu') {
    const t = G.time * 0.12;
    cam.position.set(22.5 + Math.sin(t) * 1.6, 3.4 + Math.sin(t * 0.7) * 0.4, 13.5 + Math.cos(t) * 1.2);
    cam.lookAt(25.6 + Math.sin(t * 0.8) * 0.5, 5.2, 2);
    cam.fov = 60; cam.updateProjectionMatrix();
    G.gun.visible = false;
    return;
  }
  const p = G.player;
  const e = p.eye;
  const hs = Math.hypot(p.vel.x, p.vel.z);
  if (p.onGround && hs > 0.6) { p.bobPhase += dt * hs * 1.75; p.bobAmt = damp(p.bobAmt, Math.min(1, hs / PHYS.walk), 8, dt); }
  else p.bobAmt = damp(p.bobAmt, 0, 6, dt);
  e.y += Math.sin(p.bobPhase * 2) * 0.028 * p.bobAmt - p.land * 0.14;
  e.x += Math.cos(p.yaw) * Math.cos(p.bobPhase) * 0.012 * p.bobAmt;
  e.z -= Math.sin(p.yaw) * Math.cos(p.bobPhase) * 0.012 * p.bobAmt;
  p.land = damp(p.land, 0, 6, dt);
  p.roll = damp(p.roll, 0, 3.2, dt);
  if (p.alive) cam.position.copy(e);
  else cam.position.y = damp(cam.position.y, p.c.y - 0.6, 3, dt);
  cam.rotation.set(p.pitch, p.yaw, p.roll + (p.alive ? 0 : 0.35), 'YXZ');
  const speed = p.vel.length();
  p.fov = damp(p.fov, 75 + clamp((speed - 10) * 0.55, 0, 14), 3.5, dt);
  cam.fov = p.fov; cam.updateProjectionMatrix();
  G.gunCam.fov = 62; G.gunCam.updateProjectionMatrix();
  // dispositivo
  const gun = G.gun;
  gun.visible = p.alive && G.mode !== 'complete';
  swayX = damp(swayX, clamp(-Input.dx * 0.0009, -0.06, 0.06), 10, dt);
  swayY = damp(swayY, clamp(Input.dy * 0.0009, -0.06, 0.06), 10, dt);
  p.recoil = damp(p.recoil, 0, 9, dt);
  const hold = p.holding ? 1 : 0;
  gun.position.set(0.24 + swayX + Math.cos(p.bobPhase) * 0.012 * p.bobAmt, -0.25 + swayY + Math.abs(Math.sin(p.bobPhase)) * 0.012 * p.bobAmt + hold * 0.03 - p.land * 0.05, -0.6 + p.recoil * 0.07);
  gun.rotation.set(p.recoil * 0.2 + hold * 0.06 + swayY * 0.8, -0.08 + swayX * 1.4, swayX * 0.8);
  const col = p.lastFired === 1 ? ORANGE : BLUE;
  gun.userData.coreMat.color.copy(col).multiplyScalar(1.6 + p.recoil * 3);
  G.gunLight.color.copy(col);
  gun.userData.prongs.rotation.z += dt * (hold ? 4 : 0.4);
  // figura del sujeto (solo en las vistas de portal)
  G.bodyModel.position.set(p.c.x, p.c.y - p.h.y, p.c.z);
  G.bodyModel.rotation.y = p.yaw;
}
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
function updateVisuals(dt) {
  for (const P of G.portals) {
    if (P.placed) P.open = Math.min(1, P.open + dt * 3.6);
    const o = P.placed ? easeOutBack(P.open) : 0;
    P.uniforms.uOpen.value = o;
    P.uniforms.uTime.value = G.time + P.kind * 13.7;
    P.light.intensity = P.placed ? 3.2 * Math.min(1, P.open * 1.5) : 0;
    P.sparkUniforms.uPix.value = R.H * 0.022;
  }
  for (const f of G.fizzlers) f.uniforms.uTime.value = G.time;
  for (const z of G.goos) z.uniforms.uTime.value = G.time;
  for (const cb of G.cubes) cb.syncMesh();
  for (const p of G.pellets) p.syncMesh();
  for (const ind of G.indicators) ind.update();
  updateBursts(dt); updateTracers(dt);
  if (G.dustU) { G.dustU.uTime.value = G.time; G.dustU.uPix.value = R.H * 0.008; }
  const U = R.compMat.uniforms;
  G.deathFlash = G.player.alive ? damp(G.deathFlash, 0, 2.5, dt) : damp(G.deathFlash, 1, 3, dt);
  let flash = G.deathFlash * 0.55, fc = new THREE.Color(0.55, 0.02, 0.0);
  if (G.flashPortal && G.flashPortal.t > 0) {
    G.flashPortal.t = Math.max(0, G.flashPortal.t - dt * 5);
    if (G.flashPortal.t * 0.22 > flash) { flash = G.flashPortal.t * 0.22; fc = G.flashPortal.color.clone().multiplyScalar(0.8); }
  }
  U.uFlash.value = flash; U.uFlashColor.value.copy(fc);
}

// ───── intro de cada prueba ─────
function showIntro(def) {
  const el = $('intro');
  $('intro-num').textContent = def.sandbox ? 'ZP' : def.num;
  $('intro-name').textContent = def.name;
  $('intro-icons').innerHTML = (def.icons || []).map(i => ICON_SVG[i] || '').join('');
  el.hidden = false; el.classList.remove('out');
  clearTimeout(showIntro.t1); clearTimeout(showIntro.t2);
  showIntro.t1 = setTimeout(() => el.classList.add('out'), 2300);
  showIntro.t2 = setTimeout(() => { el.hidden = true; }, 3000);
}

// ───── puntero y entrada ─────
let pointerFallback = false, lockFails = 0;
// si el navegador no deja capturar el puntero, se juega moviendo el ratón dentro de la ventana
function lockFailed() {
  lockFails++;
  if (lockFails >= 2 && !pointerFallback) { pointerFallback = true; toast('Ratón libre: mueve el ratón dentro de la ventana'); }
}
function lockPointer() {
  if (isTouch) return;
  const c = $('view');
  try {
    const r = c.requestPointerLock && c.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch (e) { lockFailed(); }
}
function unlockPointer() { if (document.pointerLockElement) document.exitPointerLock(); }
const locked = () => document.pointerLockElement === $('view');
function pause() {
  if (G.mode !== 'play') return;
  G.mode = 'paused';
  Input.reset();
  showScreen('pause');
}
function resume() {
  if (G.mode !== 'paused') return;
  G.mode = 'play';
  showScreen(null);
  $('hud').hidden = false;
  lockPointer();
}
function goMenu() {
  unlockPointer();
  clearSay();
  $('hud').hidden = true; $('dead').hidden = true; $('intro').hidden = true;
  G.levelIndex = null;
  loadMenuDemo();
  G.mode = 'menu';
  refreshMenu();
  showScreen('menu');
}
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  document.body.classList.toggle('playing', id === null && G.mode === 'play');
  $('touch').hidden = !(isTouch && id === null && (G.mode === 'play'));
}
function loadMenuDemo() {
  loadLevel(SANDBOX);
  G.mode = 'menu';
  clearSay();
  G.timers = [];
  const [bp, ba, bs] = MENU_DEMO.blue, [op, oa, os] = MENU_DEMO.orange;
  const nb = v3(); nb.setComponent(ba, bs);
  const no = v3(); no.setComponent(oa, os);
  G.portals[0].set(v3(...bp), nb, ba === 1 ? v3(0, 0, 1) : v3(0, 1, 0));
  G.portals[1].set(v3(...op), no, oa === 1 ? v3(0, 0, 1) : v3(0, 1, 0));
  portalsChanged();
  G.demoCube = spawnCube(v3(...MENU_DEMO.cube), {}); G.demoCube.spawn = v3(...MENU_DEMO.cube);
  G.demoT = 0;
}

function bindInput() {
  const canvas = $('view');
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (G.mode === 'play' && !locked()) { pause(); }
      else if (G.mode === 'paused') { /* el clic en Continuar reanuda */ }
      return;
    }
    if (G.mode === 'play' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    Input.press(e.code);
    if (e.code === 'KeyM') { Sound.setMuted(!Sound.muted); toast(Sound.muted ? 'Sonido desactivado' : 'Sonido activado'); }
  });
  addEventListener('keyup', (e) => Input.release(e.code));
  addEventListener('blur', () => { Input.reset(); if (G.mode === 'play' && !isTouch) pause(); });
  canvas.addEventListener('mousedown', (e) => {
    Sound.ensure();
    if (G.mode !== 'play') return;
    if (!locked() && !pointerFallback && !isTouch) { lockPointer(); return; }
    Input.press('Mouse' + e.button);
  });
  addEventListener('mouseup', (e) => Input.release('Mouse' + e.button));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    if (G.mode !== 'play' || isTouch) return;
    if (!locked() && !pointerFallback) return;
    const s = 0.0022 * save.settings.sens;
    const dx = clamp(e.movementX || 0, -250, 250), dy = clamp(e.movementY || 0, -250, 250);
    Input.dx += dx; Input.dy += dy;
    look(dx * s, dy * s);
  });
  document.addEventListener('pointerlockchange', () => {
    if (!locked() && G.mode === 'play') pause();
  });
  document.addEventListener('pointerlockerror', lockFailed);
}
function look(dx, dy) {
  const p = G.player;
  p.yaw -= dx;
  p.pitch = clamp(p.pitch - dy * (save.settings.invert ? -1 : 1), -1.53, 1.53);
}

// ───── controles táctiles ─────
function bindTouch() {
  if (!isTouch) return;
  const joy = $('t-joy'), knob = $('t-knob');
  let joyId = null, lookId = null, jx = 0, jy = 0, lx = 0, ly = 0;
  const area = $('touch');
  area.addEventListener('touchstart', (e) => {
    Sound.ensure();
    for (const t of e.changedTouches) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const btn = el && el.closest('[data-key]');
      if (btn) { Input.press(btn.dataset.key); btn.classList.add('down'); btn._tid = t.identifier; continue; }
      if (t.clientX < innerWidth * 0.42 && joyId === null) {
        joyId = t.identifier; jx = t.clientX; jy = t.clientY;
        joy.style.left = (jx - 60) + 'px'; joy.style.top = (jy - 60) + 'px'; joy.classList.add('on');
      } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  area.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        let dx = (t.clientX - jx) / 50, dy = (t.clientY - jy) / 50;
        const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        Input.move.x = dx; Input.move.y = -dy;
        knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
      } else if (t.identifier === lookId) {
        const s = 0.0055 * save.settings.sens;
        look((t.clientX - lx) * s, (t.clientY - ly) * s);
        Input.dx += t.clientX - lx; Input.dy += t.clientY - ly;
        lx = t.clientX; ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) { joyId = null; Input.move.x = Input.move.y = 0; knob.style.transform = ''; joy.classList.remove('on'); }
      if (t.identifier === lookId) lookId = null;
      for (const b of area.querySelectorAll('[data-key]')) if (b._tid === t.identifier) { Input.release(b.dataset.key); b.classList.remove('down'); b._tid = null; }
    }
  };
  area.addEventListener('touchend', end); area.addEventListener('touchcancel', end);
  $('t-pause').addEventListener('click', () => pause());
}

// ───── menús ─────
const ICON_SVG = {
  portal: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="8" cy="12" rx="3.2" ry="7" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="16" cy="12" rx="3.2" ry="7" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  cube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 7.5 12 12l8-4.5M12 12v9" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  button: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="16" width="18" height="3" rx="1" fill="currentColor"/><ellipse cx="12" cy="14.5" rx="6" ry="2.2" fill="currentColor"/><path d="M12 3v7M9 7.5 12 10.5 15 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  goo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15c2-2 4 2 6 0s4 2 6 0 4 2 6 0v6H3z" fill="currentColor"/><circle cx="12" cy="7" r="2.6" fill="currentColor"/></svg>',
  fling: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20C6 9 12 6 20 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 5l4 3-3.6 3.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pellet: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  fizzler: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v16M10 4v16M14 4v16M18 4v16" stroke="currentColor" stroke-width="1.6"/><path d="M4 20 20 4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  timer: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.5" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 13.5V9.5M12 13.5l3 2M10 3h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};
function refreshMenu() {
  const next = Math.min(save.unlocked, LEVELS.length) - 1;
  $('m-play').textContent = save.unlocked > 1 ? `Continuar · Prueba ${LEVELS[next].num}` : 'Empezar las pruebas';
  const grid = $('level-grid');
  grid.innerHTML = '';
  const cards = [...LEVELS.map((d, i) => ({ d, i })), { d: SANDBOX, i: 'sandbox' }];
  for (const { d, i } of cards) {
    const lockedLvl = typeof i === 'number' && i + 1 > save.unlocked;
    const b = document.createElement('button');
    b.className = 'card' + (d.sandbox ? ' sandbox' : '');
    b.disabled = lockedLvl;
    b.id = 'card-' + d.num;
    const best = save.best[d.num];
    b.innerHTML = `<span class="card-num">${d.sandbox ? '∞' : d.num}</span>
      <span class="card-bar"><span style="width:${d.sandbox ? 100 : (Number(d.num) / LEVELS.length) * 100}%"></span></span>
      <span class="card-name">${d.name}</span>
      <span class="card-icons">${(d.icons || []).map(k => ICON_SVG[k]).join('')}</span>
      <span class="card-foot">${lockedLvl ? 'Bloqueada' : d.sandbox ? 'Libre, sin salida' : best ? 'Mejor tiempo ' + fmtTime(best) : 'Sin completar'}</span>`;
    b.addEventListener('click', () => { Sound.ensure(); Sound.play('ui'); startLevel(i); });
    grid.appendChild(b);
  }
}
function bindMenus() {
  const click = (id, fn) => $(id).addEventListener('click', () => { Sound.ensure(); Sound.play('ui'); fn(); });
  click('m-play', () => startLevel(Math.min(save.unlocked, LEVELS.length) - 1));
  click('m-levels', () => showScreen('levels'));
  click('m-sandbox', () => startLevel('sandbox'));
  click('m-controls', () => showScreen('controls'));
  click('m-settings', () => { G.settingsBack = 'menu'; showScreen('settings'); });
  click('levels-back', () => showScreen('menu'));
  click('controls-back', () => showScreen('menu'));
  click('settings-back', () => showScreen(G.settingsBack || 'menu'));
  click('p-resume', resume);
  click('p-restart', () => { restartLevel(); resume(); });
  click('p-settings', () => { G.settingsBack = 'pause'; showScreen('settings'); });
  click('p-menu', goMenu);
  click('done-next', () => startLevel(G.levelIndex + 1));
  click('done-retry', () => startLevel(G.levelIndex));
  click('done-menu', goMenu);
  click('done-final', () => { showScreen('ending'); });
  click('ending-menu', goMenu);
  const q = $('s-quality');
  q.value = save.settings.quality;
  q.addEventListener('change', () => { save.settings.quality = q.value; save.settings.userQuality = true; setQuality(q.value); writeSave(); });
  const sens = $('s-sens');
  sens.value = save.settings.sens;
  sens.addEventListener('input', () => { save.settings.sens = Number(sens.value); $('s-sens-v').textContent = Number(sens.value).toFixed(1) + '×'; writeSave(); });
  $('s-sens-v').textContent = Number(save.settings.sens).toFixed(1) + '×';
  const vol = $('s-vol');
  vol.value = save.settings.vol;
  vol.addEventListener('input', () => { save.settings.vol = Number(vol.value); Sound.setVolume(save.settings.vol); $('s-vol-v').textContent = Math.round(vol.value * 100) + '%'; writeSave(); });
  $('s-vol-v').textContent = Math.round(save.settings.vol * 100) + '%';
  const inv = $('s-invert');
  inv.checked = !!save.settings.invert;
  inv.addEventListener('change', () => { save.settings.invert = inv.checked; writeSave(); });
  Sound.setVolume(save.settings.vol);
  if (isTouch) document.body.classList.add('is-touch');
}

// ───── bucle ─────
// si el equipo no llega a ~28 fps con calidad alta, baja la calidad una vez
const perf = { t: 0, n: 0, acc: 0, done: false };
function autoQuality(dt) {
  if (perf.done || G.freeze || G.mode !== 'play' || R.quality !== 'high' || save.settings.userQuality) return;
  perf.t += dt;
  if (perf.t > 1.5) { perf.acc += dt; perf.n++; }
  if (perf.t > 5.5) {
    perf.done = true;
    if (perf.acc / perf.n > 0.036) {
      setQuality('low'); save.settings.quality = 'low'; $('s-quality').value = 'low'; writeSave();
      toast('Calidad ajustada a Baja para ir más fluido');
    }
  }
}
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  resize(false);
  autoQuality(dt);
  handleActions();
  if (!G.freeze && (G.mode === 'play' || G.mode === 'menu' || G.mode === 'complete')) simulate(dt);
  else if (G.mode === 'paused') { /* congelado */ }
  updateCamera(dt);
  updateVisuals(dt);
  renderFrame();
  updateHUD(dt);
  Input.endFrame();
}

// API de depuración / pruebas automáticas
window.__umbral = {
  G, LEVELS, SANDBOX, startLevel, loadLevel, restartLevel, simulate, v3, THREE, placePortalAt, castRay, clearPortals, Input, renderFrame,
  aim(x, y, z) { const p = G.player, e = p.eye, d = v3(x, y, z).sub(e).normalize(); p.yaw = Math.atan2(-d.x, -d.z); p.pitch = Math.asin(clamp(d.y, -1, 1)); },
  shoot(kind) { G.player.cooldown = 0; G.player.shoot(kind); return G.portals[kind].placed; },
  hold(keys, sec) { for (const k of keys) Input.down.add(k); simulate(sec); for (const k of keys) Input.down.delete(k); },
  run(sec) { simulate(sec); },
  state() { const p = G.player; return { mode: G.mode, pos: [p.c.x, p.c.y - p.h.y, p.c.z].map(n => +n.toFixed(2)), vel: [p.vel.x, p.vel.y, p.vel.z].map(n => +n.toFixed(2)), alive: p.alive, holding: !!p.holding, portals: G.portals.map(P => P.placed ? [P.c.x, P.c.y, P.c.z].map(n => +n.toFixed(2)) : null), cubes: G.cubes.map(c => [c.c.x, c.c.y, c.c.z].map(n => +n.toFixed(2))), signals: { ...G.signals } }; },
};

function boot() {
  loadSave();
  try { initScene(); } catch (e) {
    $('loading').textContent = 'Tu navegador no puede ejecutar WebGL 2. Prueba con una versión reciente de Chrome, Edge o Firefox.';
    console.error(e);
    return;
  }
  R.quality = save.settings.quality;
  resize(true);
  bindInput(); bindTouch(); bindMenus();
  loadMenuDemo();
  G.mode = 'menu';
  refreshMenu();
  showScreen('menu');
  $('loading').hidden = true;
  requestAnimationFrame((t) => { lastT = t; frame(t); });
}
const fontsReady = document.fonts && document.fonts.load ? Promise.all([
  document.fonts.load('800 100px "Saira Condensed"'), document.fonts.load('700 50px "Saira Condensed"'), document.fonts.load('500 30px "Barlow"'),
]).catch(() => {}) : Promise.resolve();
Promise.race([fontsReady, new Promise(r => setTimeout(r, 2500))]).then(boot);
