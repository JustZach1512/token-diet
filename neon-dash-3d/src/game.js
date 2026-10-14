// Neon Dash 3D — rendering, player visuals, effects, camera, UI and input.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const Core = window.NeonCore, Snd = window.NeonAudio;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const DT = Core.DT;

// ================================================================ save data
const SAVE_KEY = 'neon-dash-3d-v1';
const COLORS = ['#7dff00', '#00ff6a', '#00ffd0', '#00e1ff', '#2f7bff', '#5a2dff', '#b23bff', '#ff3bf2',
  '#ff2f7d', '#ff2a2a', '#ff7a00', '#ffc800', '#ffff3a', '#ffffff', '#9aa0b4', '#2b2b3a'];
let save = { lv: {}, icon: 0, c1: 0, c2: 3, music: 0.7, sfx: 0.8, quality: 'auto', autoCp: true, portraitOk: false };
try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); if (d && typeof d === 'object') save = Object.assign(save, d); } catch (e) { /* storage blocked */ }
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ } }
function lvSave(id) { return save.lv[id] || (save.lv[id] = { best: 0, prac: 0, coins: [0, 0, 0], done: 0, att: 0 }); }

// ================================================================ renderer
const canvas = $('game');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
} catch (e) {
  $('loadMsg').textContent = 'Tu navegador no tiene WebGL 2, que el juego necesita. Prueba con Chrome o Safari actualizados.';
  throw e;
}
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
scene.fog = new THREE.Fog(0x000000, 30, 140);

// No MSAA: multisampled half-float targets feed NaNs into the bloom on some GPUs (whole screen goes white).
const QUALITY = {
  high: { dpr: 2, msaa: 0, bloom: true, parts: 1 },
  medium: { dpr: 1.5, msaa: 0, bloom: true, parts: 0.7 },
  low: { dpr: 1, msaa: 0, bloom: false, parts: 0.5 },
};
let quality = save.quality === 'auto' ? 'high' : save.quality;
let composer = null, bloomPass = null, W = 1, H = 1;

function setupPost() {
  const q = QUALITY[quality];
  if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
  if (bloomPass) bloomPass.dispose();
  const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  const rt = new THREE.WebGLRenderTarget(Math.max(1, W * dpr), Math.max(1, H * dpr), { type: THREE.HalfFloatType, samples: q.msaa });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = null;
  if (q.bloom) {
    bloomPass = new UnrealBloomPass(new THREE.Vector2(W, H), 0.85, 0, 0.86);
    // weight the small mips: tight neon glow instead of a full-screen haze from the wide ones
    bloomPass.compositeMaterial.uniforms.bloomFactors.value = [1.3, 1.0, 0.5, 0.18, 0.06];
    composer.addPass(bloomPass);
  }
  composer.addPass(new OutputPass());
}

// ================================================================ shared uniforms & palette
const U = {
  uTime: { value: 0 }, uPulse: { value: 0 },
  uNeon: { value: new THREE.Color() }, uBase: { value: new THREE.Color() },
  uSky: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
  uBgBase: { value: new THREE.Color() }, uBgNeon: { value: new THREE.Color() },
  uFogColor: { value: new THREE.Color() }, uFogNear: { value: 34 }, uFogFar: { value: 150 },
};
const pal = { sky: new THREE.Color('#1d33ff'), ground: new THREE.Color('#1a2bd8'), neon: new THREE.Color('#7fe9ff'), accent: new THREE.Color('#ffe14d') };
const palT = { sky: pal.sky.clone(), ground: pal.ground.clone(), neon: pal.neon.clone(), accent: pal.accent.clone() };
function setPalette(p, instant) {
  palT.sky.set(p.sky); palT.ground.set(p.ground); palT.neon.set(p.neon); palT.accent.set(p.accent);
  if (instant) for (const k in pal) pal[k].copy(palT[k]);
}
function updatePalette(dt) {
  const t = 1 - Math.exp(-dt * 3);
  for (const k in pal) pal[k].lerp(palT[k], t);
  U.uSky.value.copy(pal.sky);
  U.uGround.value.copy(pal.ground);
  U.uFogColor.value.copy(pal.sky).multiplyScalar(0.62);
  U.uBase.value.copy(pal.sky).multiplyScalar(0.07).addScalar(0.006);
  U.uNeon.value.copy(pal.neon).multiplyScalar(1.8);
  U.uBgBase.value.copy(pal.sky).multiplyScalar(0.2);
  U.uBgNeon.value.copy(pal.neon).multiplyScalar(0.75);
  scene.fog.color.copy(U.uFogColor.value);
  scene.fog.near = U.uFogNear.value; scene.fog.far = U.uFogFar.value;
  neonMat.color.copy(U.uNeon.value);
  edgeMat.color.copy(pal.neon).multiplyScalar(1.5);
}

// ================================================================ shaders
const FOG_FS = /* glsl */`
uniform vec3 uFogColor; uniform float uFogNear, uFogFar;
vec3 fogIt(vec3 c, float d) { return mix(c, uFogColor, smoothstep(uFogNear, uFogFar, d)); }`;
const OUT_FS = /* glsl */`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

const BLOCK_VS = /* glsl */`
varying vec3 vP; varying vec3 vN; varying vec3 vH; varying float vD;
void main() {
  vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vH = sc * 0.5; vP = position * sc; vN = normal;
  vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  vD = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const BLOCK_FS = /* glsl */`
uniform vec3 uBase, uNeon; uniform float uPulse, uEdge, uTile;
varying vec3 vP; varying vec3 vN; varying vec3 vH; varying float vD;
${FOG_FS}
void main() {
  vec3 n = normalize(vN);
  vec2 p, h;
  if (abs(n.z) > 0.5) { p = vP.xy; h = vH.xy; }
  else if (abs(n.x) > 0.5) { p = vP.zy; h = vH.zy; }
  else { p = vP.xz; h = vH.xz; }
  vec2 d2 = h - abs(p);
  float d = min(d2.x, d2.y);
  float edge = 1.0 - smoothstep(0.035, 0.085, d);
  float inner = exp(-d * 5.0) * 0.32;
  float tile = 0.0;
  if (n.z > 0.5) {
    vec2 q = fract(p + h);
    vec2 c = abs(q - 0.5);
    float sq = max(c.x, c.y);
    tile = (1.0 - smoothstep(0.015, 0.04, abs(sq - 0.3))) * 0.16 + (1.0 - smoothstep(0.46, 0.5, sq)) * 0.0;
    tile += (1.0 - smoothstep(0.0, 0.035, 0.5 - sq)) * 0.12;
  }
  float lit = n.y > 0.5 ? 1.5 : (n.z > 0.5 ? 1.0 : 0.55);
  vec3 col = uBase * lit + uNeon * (uEdge * (edge * (1.0 + uPulse * 0.6) + inner) + tile * uTile);
  gl_FragColor = vec4(fogIt(col, vD), 1.0);
  ${OUT_FS}
}`;

const SPIKE_VS = /* glsl */`
attribute vec3 bary;
varying vec3 vB; varying vec3 vN; varying float vD; varying float vY;
void main() {
  vB = bary; vN = normalize(mat3(instanceMatrix) * normal); vY = position.y;
  vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  vD = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const SPIKE_FS = /* glsl */`
uniform vec3 uBase, uNeon; uniform float uPulse;
varying vec3 vB; varying vec3 vN; varying float vD; varying float vY;
${FOG_FS}
void main() {
  float e = min(min(vB.x, vB.y), vB.z);
  float edge = 1.0 - smoothstep(0.025, 0.06, e);
  float lit = 0.7 + 0.6 * max(dot(normalize(vN), normalize(vec3(0.3, 0.8, 0.6))), 0.0);
  vec3 col = uBase * lit * 1.6 + uNeon * (edge * (0.9 + uPulse * 0.5) + exp(-e * 12.0) * 0.12);
  gl_FragColor = vec4(fogIt(col, vD), 1.0);
  ${OUT_FS}
}`;

const SIMPLE_VS = /* glsl */`
varying vec3 vP; varying vec3 vN; varying vec3 vW; varying float vD;
void main() {
  vP = position; vN = normal;
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vec4 mv = viewMatrix * w; vD = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const SAW_FS = /* glsl */`
uniform vec3 uBase, uNeon; uniform float uPulse;
varying vec3 vP; varying vec3 vN; varying vec3 vW; varying float vD;
${FOG_FS}
void main() {
  float r = length(vP.xy);
  vec3 col;
  if (abs(vN.z) > 0.6) {
    float ring = 1.0 - smoothstep(0.02, 0.05, abs(r - 0.52));
    float hub = 1.0 - smoothstep(0.24, 0.32, r);
    col = uBase * 1.6 + uNeon * (ring * 0.9 + hub * 0.6 + smoothstep(0.72, 0.98, r) * (0.9 + uPulse * 0.5));
  } else col = uNeon * 1.1;
  gl_FragColor = vec4(fogIt(col, vD), 1.0);
  ${OUT_FS}
}`;
const WALL_FS = /* glsl */`
uniform vec3 uBase, uNeon;
varying vec3 vP; varying vec3 vN; varying vec3 vW; varying float vD;
${FOG_FS}
void main() {
  vec3 n = normalize(vN);
  vec3 col = uBase * (n.z > 0.5 ? 1.0 : 0.6);
  if (n.z > 0.5) {
    vec2 q = fract(vW.xy);
    vec2 c = abs(q - 0.5);
    float sq = max(c.x, c.y);
    col += uNeon * ((1.0 - smoothstep(0.0, 0.03, 0.5 - sq)) * 0.035 + (1.0 - smoothstep(0.015, 0.04, abs(sq - 0.3))) * 0.025);
  }
  gl_FragColor = vec4(fogIt(col, vD), 1.0);
  ${OUT_FS}
}`;
const GROUND_FS = /* glsl */`
uniform vec3 uGround, uNeon; uniform float uPulse, uEdgeY;
varying vec3 vP; varying vec3 vN; varying vec3 vW; varying float vD;
${FOG_FS}
void main() {
  vec3 n = normalize(vN);
  vec3 col;
  if (abs(n.y) > 0.5) {
    vec2 g = vW.xz * 0.5;
    vec2 fw = fwidth(g) * 1.2;
    vec2 gg = abs(fract(g - 0.5) - 0.5) / max(fw, vec2(1e-4));
    float line = 1.0 - min(min(gg.x, gg.y), 1.0);
    float lane = smoothstep(0.08, 0.0, abs(abs(vW.z) - 0.62));
    float fade = exp(-max(-vW.z, 0.0) * 0.03);
    col = uGround * 0.28 + uNeon * (line * 0.22 * fade + lane * (0.6 + uPulse * 0.5));
  } else {
    float y = abs(vW.y - uEdgeY);
    vec2 t = vec2(vW.x, y) / 2.0;
    vec2 q = fract(t);
    vec2 c = abs(q - 0.5);
    float sq = max(c.x, c.y);
    float tile = 1.0 - smoothstep(0.44, 0.48, sq);
    col = uGround * (0.55 + 0.45 * tile) * (0.55 + 0.45 * exp(-y * 0.35));
    col += uNeon * (exp(-y * 14.0) * 1.4 + (1.0 - tile) * 0.08);
  }
  gl_FragColor = vec4(fogIt(col, vD), 1.0);
  ${OUT_FS}
}`;
const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = /* glsl */`
uniform vec3 uSky, uFogColor; uniform float uTime;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
void main() {
  float h = vDir.y;
  vec3 col = mix(uFogColor, uSky * 0.16, smoothstep(0.0, 0.55, h));
  col = mix(col, uSky * 0.22, smoothstep(0.0, -0.25, h));
  vec2 g = vec2(atan(vDir.z, vDir.x) * 60.0, h * 60.0);
  vec2 id = floor(g); vec2 f = fract(g) - 0.5;
  float s = hash(id);
  float star = step(0.985, s) * smoothstep(0.12, 0.0, length(f)) * smoothstep(0.08, 0.4, h);
  col += vec3(star) * (0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0));
  gl_FragColor = vec4(col, 1.0);
  ${OUT_FS}
}`;
const BACK_FS = /* glsl */`
uniform vec3 uSky, uFogColor; uniform float uPulse;
varying vec3 vP; varying vec3 vN; varying vec3 vW; varying float vD;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 t = vW.xy / 14.0;
  vec2 id = floor(t), q = fract(t);
  vec2 c = abs(q - 0.5);
  float sq = max(c.x, c.y);
  float v = 0.5 + 0.35 * hash(id);
  float border = 1.0 - smoothstep(0.44, 0.47, sq);
  vec3 col = uSky * (0.36 * v * border + 0.18) * (1.0 + uPulse * 0.15);
  col = mix(col, uFogColor, 0.35 + 0.4 * smoothstep(40.0, -10.0, vW.y));
  gl_FragColor = vec4(col, 1.0);
  ${OUT_FS}
}`;
const MEMBRANE_FS = /* glsl */`
uniform vec3 uCol; uniform float uTime;
varying vec3 vP; varying vec3 vN; varying vec3 vW; varying float vD;
void main() {
  vec2 c = vP.xy * 2.0;
  float r = length(c);
  float a = smoothstep(1.0, 0.2, r);
  float st = 0.5 + 0.5 * sin(vP.y * 18.0 - uTime * 6.0);
  gl_FragColor = vec4(uCol * a * (0.45 + 0.35 * st), 1.0);
}`;
const DUST_VS = /* glsl */`
uniform float uCamX, uTime;
attribute float aSeed;
varying float vA;
void main() {
  vec3 p = position;
  p.x = mod(p.x - uCamX + 60.0 + uTime * (0.5 + aSeed), 160.0) + uCamX - 60.0;
  p.y += sin(uTime * 0.6 + aSeed * 30.0) * 0.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = 0.4 + 0.6 * aSeed;
  gl_PointSize = (90.0 + 120.0 * aSeed) / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FS = /* glsl */`
uniform vec3 uNeon;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uNeon * 0.35 * a * a * vA, 1.0);
}`;

const blockMat = new THREE.ShaderMaterial({
  uniforms: { uBase: U.uBase, uNeon: U.uNeon, uPulse: U.uPulse, uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar, uEdge: { value: 1 }, uTile: { value: 1 } },
  vertexShader: BLOCK_VS, fragmentShader: BLOCK_FS,
});
const bgMat = new THREE.ShaderMaterial({
  uniforms: { uBase: U.uBgBase, uNeon: U.uBgNeon, uPulse: U.uPulse, uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar, uEdge: { value: 0.9 }, uTile: { value: 0.6 } },
  vertexShader: BLOCK_VS, fragmentShader: BLOCK_FS,
});
const spikeMat = new THREE.ShaderMaterial({
  uniforms: { uBase: U.uBase, uNeon: U.uNeon, uPulse: U.uPulse, uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar },
  vertexShader: SPIKE_VS, fragmentShader: SPIKE_FS,
});
const sawMat = new THREE.ShaderMaterial({
  uniforms: { uBase: U.uBase, uNeon: U.uNeon, uPulse: U.uPulse, uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar },
  vertexShader: SIMPLE_VS, fragmentShader: SAW_FS,
});
const wallMat = new THREE.ShaderMaterial({
  uniforms: { uBase: U.uBase, uNeon: U.uNeon, uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar },
  vertexShader: SIMPLE_VS, fragmentShader: WALL_FS,
});
function groundMaterial(edgeY) {
  return new THREE.ShaderMaterial({
    uniforms: { uGround: U.uGround, uNeon: U.uNeon, uPulse: U.uPulse, uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar, uEdgeY: { value: edgeY } },
    vertexShader: SIMPLE_VS, fragmentShader: GROUND_FS,
  });
}
const neonMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });

// ================================================================ geometry
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const pyramidGeo = (() => {
  const a = [0, 1, 0], v = [[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5]], pos = [], bar = [];
  for (let i = 0; i < 4; i++) { pos.push(...v[i], ...v[(i + 1) % 4], ...a); bar.push(1, 0, 0, 0, 1, 0, 0, 0, 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('bary', new THREE.Float32BufferAttribute(bar, 3));
  g.computeVertexNormals();
  return g;
})();
const sawGeo = (() => {
  const s = new THREE.Shape(), N = 14;
  for (let i = 0; i <= N * 2; i++) {
    const a = i / (N * 2) * Math.PI * 2 + (i % 2 ? 0.08 : 0), r = i % 2 ? 0.76 : 1;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(r, 0);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.15, 0, Math.PI * 2, true); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -0.11);
  return g;
})();
const chevronGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.32, 0.5); s.lineTo(0.02, 0.5); s.lineTo(0.36, 0); s.lineTo(0.02, -0.5); s.lineTo(-0.32, -0.5); s.lineTo(0.02, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false });
  g.translate(0, 0, -0.08);
  return g;
})();
const sphereGeo = new THREE.SphereGeometry(1, 24, 16);
const torusGeo = new THREE.TorusGeometry(1, 0.08, 8, 48);
const planeGeo = new THREE.PlaneGeometry(1, 1);
const coinGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 32).rotateX(Math.PI / 2);
const domeGeo = new THREE.SphereGeometry(0.44, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const octaGeo = new THREE.OctahedronGeometry(0.38);

const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
function hdr(hex, k) { return new THREE.Color(hex).multiplyScalar(k); }
const additive = (color, opacity = 1, map = null) => new THREE.MeshBasicMaterial({
  color, map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
});

// ================================================================ environment
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
  uniforms: { uSky: U.uSky, uFogColor: U.uFogColor, uTime: U.uTime }, vertexShader: SKY_VS, fragmentShader: SKY_FS,
  side: THREE.BackSide, depthWrite: false,
}));
sky.renderOrder = -10; sky.frustumCulled = false;
scene.add(sky);

const backWall = new THREE.Mesh(new THREE.PlaneGeometry(1400, 320), new THREE.ShaderMaterial({
  uniforms: { uSky: U.uSky, uFogColor: U.uFogColor, uPulse: U.uPulse }, vertexShader: SIMPLE_VS, fragmentShader: BACK_FS, depthWrite: false,
}));
backWall.position.set(0, 120, -190);
backWall.renderOrder = -9;
scene.add(backWall);

const ground = new THREE.Mesh(boxGeo, groundMaterial(0));
ground.scale.set(500, 40, 110);
ground.position.set(0, -20, -52.5);
scene.add(ground);
const ceiling = new THREE.Mesh(boxGeo, groundMaterial(10));
ceiling.scale.set(500, 40, 9);
ceiling.position.set(0, 60, -2);
scene.add(ceiling);
let ceilY = 60, ceilTarget = 60;

const CITY_N = 70, city = new THREE.InstancedMesh(boxGeo, bgMat, CITY_N), cityData = [];
const FLOAT_N = 14, floaters = new THREE.InstancedMesh(boxGeo, bgMat, FLOAT_N), floatData = [];
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();
function placeCity(i, x) {
  const z = -14 - Math.random() * 60, far = (-z - 14) / 60;
  const d = cityData[i] = { x, z, w: 2 + Math.random() * 5, d: 2 + Math.random() * 5, h: 3 + Math.random() * (8 + far * 26) };
  tmpM.makeScale(d.w, d.h, d.d); tmpM.setPosition(d.x, d.h / 2, d.z);
  city.setMatrixAt(i, tmpM);
}
for (let i = 0; i < CITY_N; i++) placeCity(i, -80 + Math.random() * 260);
city.frustumCulled = false;
scene.add(city);
for (let i = 0; i < FLOAT_N; i++) {
  floatData.push({ x: -60 + Math.random() * 220, y: 7 + Math.random() * 14, z: -18 - Math.random() * 30, s: 0.8 + Math.random() * 2.2, r: Math.random() * 6, v: 0.2 + Math.random() * 0.6 });
}
floaters.frustumCulled = false;
scene.add(floaters);

const dust = (() => {
  const n = 260, pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = Math.random() * 160; pos[i * 3 + 1] = Math.random() * 24 - 1; pos[i * 3 + 2] = -2 - Math.random() * 40; seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const p = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uCamX: { value: 0 }, uTime: U.uTime, uNeon: U.uNeon }, vertexShader: DUST_VS, fragmentShader: DUST_FS,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  p.frustumCulled = false;
  return p;
})();
scene.add(dust);

scene.add(new THREE.HemisphereLight(0xffffff, 0x404060, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(4, 8, 10);
scene.add(sun);

function updateEnv(camX, dt) {
  sky.position.copy(camera.position);
  backWall.position.x = camX * 0.82;
  ground.position.x = camX;
  ceiling.position.x = camX;
  ceilY = damp(ceilY, ceilTarget, 5, dt);
  ceiling.position.y = ceilY + 20;
  ceiling.material.uniforms.uEdgeY.value = ceilY;
  dust.material.uniforms.uCamX.value = camX;
  let dirty = false;
  for (let i = 0; i < CITY_N; i++) {
    const d = cityData[i];
    if (d.x + d.w < camX - 90) { placeCity(i, d.x + 250 + Math.random() * 10); dirty = true; }
    else if (d.x > camX + 200) { placeCity(i, d.x - 250); dirty = true; }
  }
  if (dirty) city.instanceMatrix.needsUpdate = true;
  const t = U.uTime.value;
  for (let i = 0; i < FLOAT_N; i++) {
    const f = floatData[i];
    if (f.x < camX - 70) f.x += 240; else if (f.x > camX + 200) f.x -= 240;
    const s = f.s * (1 + U.uPulse.value * 0.12);
    tmpE.set(t * f.v + f.r, t * f.v * 0.7, f.r);
    tmpQ.setFromEuler(tmpE); tmpS.set(s, s, s); tmpP.set(f.x, f.y + Math.sin(t * 0.5 + f.r) * 0.8, f.z);
    tmpM.compose(tmpP, tmpQ, tmpS);
    floaters.setMatrixAt(i, tmpM);
  }
  floaters.instanceMatrix.needsUpdate = true;
}

// ================================================================ particles
class Particles {
  constructor(geo, mat, max) {
    this.max = max; this.n = 0;
    this.d = new Float32Array(max * 16);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.count = 0;
    scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, life, size, col, grav = 0, spin = 0) {
    if (this.n >= this.max) return;
    const o = this.n++ * 16, d = this.d;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
    d[o + 6] = life; d[o + 7] = life; d[o + 8] = size; d[o + 9] = col.r; d[o + 10] = col.g; d[o + 11] = col.b;
    d[o + 12] = grav; d[o + 13] = Math.random() * 6; d[o + 14] = spin; d[o + 15] = 0;
  }
  clear() { this.n = 0; this.mesh.count = 0; }
  update(dt, rot3d) {
    const d = this.d, m = this.mesh.instanceMatrix.array, c = this.mesh.instanceColor.array;
    let i = 0;
    while (i < this.n) {
      const o = i * 16;
      d[o + 6] -= dt;
      if (d[o + 6] <= 0) { d.copyWithin(o, (this.n - 1) * 16, this.n * 16); this.n--; continue; }
      d[o + 4] -= d[o + 12] * dt;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      d[o + 13] += d[o + 14] * dt;
      const k = d[o + 6] / d[o + 7], s = d[o + 8] * (rot3d ? 1 : (0.35 + 0.65 * k)), a = d[o + 13];
      const ca = Math.cos(a) * s, sa = Math.sin(a) * s, mo = i * 16;
      if (rot3d) {
        tmpE.set(a, a * 0.7, a * 0.3); tmpQ.setFromEuler(tmpE); tmpS.set(s, s, s); tmpP.set(d[o], d[o + 1], d[o + 2]);
        tmpM.compose(tmpP, tmpQ, tmpS); tmpM.toArray(m, mo);
      } else {
        m[mo] = ca; m[mo + 1] = sa; m[mo + 2] = 0; m[mo + 3] = 0;
        m[mo + 4] = -sa; m[mo + 5] = ca; m[mo + 6] = 0; m[mo + 7] = 0;
        m[mo + 8] = 0; m[mo + 9] = 0; m[mo + 10] = s; m[mo + 11] = 0;
        m[mo + 12] = d[o]; m[mo + 13] = d[o + 1]; m[mo + 14] = d[o + 2]; m[mo + 15] = 1;
      }
      const f = rot3d ? Math.min(1, k * 3) : k;
      c[i * 3] = d[o + 9] * f; c[i * 3 + 1] = d[o + 10] * f; c[i * 3 + 2] = d[o + 11] * f;
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
const sparks = new Particles(planeGeo, additive(0xffffff, 1, glowTex), 700);
const shards = new Particles(boxGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), 80);
const tmpC = new THREE.Color();
function burst(x, y, col, n, speed, life, size, grav = 0, z = 0.6) {
  n = Math.round(n * QUALITY[quality].parts);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6);
    sparks.spawn(x, y, z, Math.cos(a) * v, Math.sin(a) * v, (Math.random() - 0.5) * v * 0.6, life * (0.6 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.6), col, grav);
  }
}

// shockwave rings
const rings = [];
function ring(x, y, col, size = 3, life = 0.45) {
  const m = new THREE.Mesh(torusGeo, additive(hdr(col, 2.2)));
  m.position.set(x, y, 0.4);
  scene.add(m);
  rings.push({ m, t: 0, life, size });
}
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt;
    const k = r.t / r.life;
    if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); continue; }
    const s = 0.3 + r.size * (1 - Math.pow(1 - k, 3));
    r.m.scale.set(s, s, s); r.m.material.opacity = 1 - k;
  }
}

// ================================================================ trail ribbon
class Trail {
  constructor(n) {
    this.n = n; this.pts = new Float32Array(n * 2); this.count = 0; this.head = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3); this.col = new Float32Array(n * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  reset() { this.count = 0; this.mesh.geometry.setDrawRange(0, 0); }
  push(x, y) {
    if (this.count) {
      const h = this.head * 2, dx = x - this.pts[h], dy = y - this.pts[h + 1];
      if (dx * dx + dy * dy < 0.0025) { this.pts[h] = x; this.pts[h + 1] = y; return; }
    }
    this.head = (this.head + 1) % this.n;
    this.pts[this.head * 2] = x; this.pts[this.head * 2 + 1] = y;
    this.count = Math.min(this.count + 1, this.n);
  }
  update(width, col, z, solid, max = this.n) {
    const n = Math.min(this.count, max);
    if (n < 2) { this.mesh.geometry.setDrawRange(0, 0); return; }
    const P = this.pts, pos = this.pos, C = this.col, N = this.n;
    for (let i = 0; i < n; i++) {
      const k = ((this.head - i) % N + N) % N, j = ((this.head - Math.min(i + 1, n - 1) + (i === n - 1 ? 2 : 0)) % N + N) % N;
      let dx = P[k * 2] - P[j * 2], dy = P[k * 2 + 1] - P[j * 2 + 1];
      if (i === n - 1) { dx = -dx; dy = -dy; }
      const l = Math.hypot(dx, dy) || 1, t = i / (n - 1);
      const w = width * (solid ? (1 - Math.pow(t, 6)) : (1 - t));
      const nx = -dy / l * w, ny = dx / l * w, o = i * 6;
      pos[o] = P[k * 2] + nx; pos[o + 1] = P[k * 2 + 1] + ny; pos[o + 2] = z;
      pos[o + 3] = P[k * 2] - nx; pos[o + 4] = P[k * 2 + 1] - ny; pos[o + 5] = z;
      const a = solid ? (1 - Math.pow(t, 4)) : (1 - t) * (1 - t);
      C[o] = C[o + 3] = col.r * a; C[o + 1] = C[o + 4] = col.g * a; C[o + 2] = C[o + 5] = col.b * a;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, (n - 1) * 6);
  }
}
const trail = new Trail(48), waveTrail = new Trail(220);

// ================================================================ player look
const ICON_N = 12, K = '#0a0614';
function drawIcon(ctx, S, icon, c1, c2) {
  const u = S / 16, R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x * u, y * u, w * u, h * u); };
  const P = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x * u, y * u) : ctx.moveTo(x * u, y * u)); ctx.closePath(); ctx.fill(); };
  R(0, 0, 16, 16, K); R(1, 1, 14, 14, c1);
  switch (icon) {
    case 0: R(4, 4, 8, 8, K); R(5.5, 5.5, 5, 5, c2); break;
    case 1: R(3, 4, 4, 4, K); R(9, 4, 4, 4, K); R(4, 5, 2, 2, c2); R(10, 5, 2, 2, c2); R(4, 10, 8, 2, K); break;
    case 2: P([[15, 1], [15, 15], [1, 15]], c2); P([[13.5, 1], [15, 1], [15, 2.5], [2.5, 15], [1, 15], [1, 13.5]], K); break;
    case 3: P([[2, 4], [4, 2], [8, 6], [12, 2], [14, 4], [10, 8], [14, 12], [12, 14], [8, 10], [4, 14], [2, 12], [6, 8]], K);
      P([[3.4, 4], [4, 3.4], [8, 7.4], [12, 3.4], [12.6, 4], [8.6, 8], [12.6, 12], [12, 12.6], [8, 8.6], [4, 12.6], [3.4, 12], [7.4, 8]], c2); break;
    case 4: R(3, 3, 10, 10, K); R(4, 4, 8, 8, c2); R(5.5, 5.5, 5, 5, K); R(7, 7, 2, 2, c1); break;
    case 5: for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { R(2.5 + i * 4, 2.5 + j * 4, 3, 3, K); R(3.2 + i * 4, 3.2 + j * 4, 1.6, 1.6, c2); } break;
    case 6: R(2, 5, 12, 5, K); R(3.5, 6.5, 3, 2, c2); R(9.5, 6.5, 3, 2, c2); R(5, 12, 6, 1.5, K); R(7.25, 1, 1.5, 4, K); break;
    case 7: P([[3, 3], [6, 3], [10, 8], [6, 13], [3, 13], [7, 8]], K); P([[7, 3], [10, 3], [14, 8], [10, 13], [7, 13], [11, 8]], K);
      P([[4, 4], [5.5, 4], [8.7, 8], [5.5, 12], [4, 12], [7.2, 8]], c2); P([[8, 4], [9.5, 4], [12.7, 8], [9.5, 12], [8, 12], [11.2, 8]], c2); break;
    case 8: P([[8, 2], [14, 8], [8, 14], [2, 8]], K); P([[8, 3.5], [12.5, 8], [8, 12.5], [3.5, 8]], c2); P([[8, 6], [10, 8], [8, 10], [6, 8]], K); break;
    case 9: R(3, 4, 4, 4, K); R(9, 4, 4, 4, K); R(4.5, 5.5, 1.5, 1.5, c2); R(10, 5.5, 1.5, 1.5, c2);
      R(3, 10, 10, 3.5, K); for (let i = 0; i < 4; i++) R(3.7 + i * 2.4, 10.6, 1.6, 2.3, c2); break;
    case 10: for (let i = 0; i < 4; i++) { R(2 + i * 3.2, 2, 2, 12, K); R(2.5 + i * 3.2, 2.5, 1, 11, c2); } break;
    case 11: ctx.fillStyle = K; ctx.beginPath(); ctx.arc(8 * u, 8 * u, 5.2 * u, 0, 7); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(8 * u, 8 * u, 4 * u, 0, 7); ctx.fill();
      ctx.fillStyle = K; ctx.beginPath(); ctx.arc(9 * u, 7.5 * u, 1.9 * u, 0, 7); ctx.fill(); R(9.4, 6.2, 0.9, 0.9, '#fff'); break;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(u, u, 14 * u, 1.6 * u);
}
const texCache = new Map();
function iconTex(icon, c1, c2) {
  const key = `${icon}|${c1}|${c2}`;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  drawIcon(c.getContext('2d'), 128, icon, c1, c2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
function ballTex(c1, c2) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = c1; x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 4; i++) { x.fillStyle = K; x.fillRect(i * 64 + 26, 0, 12, 128); x.fillStyle = c2; x.fillRect(i * 64 + 29, 0, 6, 128); }
  x.fillStyle = K; x.fillRect(0, 58, 256, 12); x.fillStyle = c2; x.fillRect(0, 61, 256, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function look() { return { icon: save.icon, c1: COLORS[save.c1], c2: COLORS[save.c2] }; }
function buildVehicles(lk) {
  const tex = iconTex(lk.icon, lk.c1, lk.c2);
  const std = (c, e = 0.35, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.35, metalness: 0.15 }, extra));
  const cubeMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.05 });
  const glow = additive(hdr(lk.c2, 1.3), 0.28); glow.side = THREE.BackSide;
  const miniCube = s => { const m = new THREE.Mesh(boxGeo, cubeMat); m.scale.setScalar(s); return m; };
  const v = {};

  v.cube = new THREE.Group();
  const cb = new THREE.Mesh(boxGeo, cubeMat); v.cube.add(cb);
  const cg = new THREE.Mesh(boxGeo, glow); cg.scale.setScalar(1.18); v.cube.add(cg);

  v.ship = new THREE.Group();
  const sh = new THREE.Shape();
  sh.moveTo(0.82, -0.02); sh.lineTo(0.3, 0.2); sh.lineTo(-0.2, 0.2); sh.lineTo(-0.52, 0.1); sh.lineTo(-0.78, 0.36);
  sh.lineTo(-0.86, -0.06); sh.lineTo(-0.66, -0.3); sh.lineTo(0.42, -0.3); sh.closePath();
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.66, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2 }).translate(0, 0, -0.33), std(lk.c1));
  const st = new THREE.Shape();
  st.moveTo(0.55, -0.12); st.lineTo(0.2, 0.02); st.lineTo(-0.6, 0.02); st.lineTo(-0.66, -0.12); st.closePath();
  const stripe = new THREE.Mesh(new THREE.ExtrudeGeometry(st, { depth: 0.8, bevelEnabled: false }).translate(0, 0, -0.4), std(lk.c2, 0.9));
  const pilot = miniCube(0.46); pilot.position.set(-0.02, 0.36, 0);
  v.ship.add(body, stripe, pilot);

  v.ball = new THREE.Group();
  const bm = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ map: ballTex(lk.c1, lk.c2), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.0, roughness: 0.35 }));
  bm.material.emissive = new THREE.Color(lk.c1); bm.material.emissiveIntensity = 0.25;
  bm.scale.setScalar(0.5);
  const bg = new THREE.Mesh(sphereGeo, glow); bg.scale.setScalar(0.6);
  v.ball.add(bm, bg);

  v.ufo = new THREE.Group();
  const saucer = new THREE.Mesh(sphereGeo, std(lk.c1)); saucer.scale.set(0.72, 0.24, 0.72); saucer.position.y = -0.12;
  const rim = new THREE.Mesh(torusGeo, std(lk.c2, 1.1)); rim.scale.set(0.7, 0.7, 0.9); rim.rotation.x = Math.PI / 2; rim.position.y = -0.12;
  const dome = new THREE.Mesh(domeGeo, new THREE.MeshStandardMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2, depthWrite: false }));
  dome.position.y = -0.02;
  const ufoPilot = miniCube(0.38); ufoPilot.position.y = 0.16;
  v.ufo.add(ufoPilot, saucer, rim, dome);

  v.wave = new THREE.Group();
  const ws = new THREE.Shape();
  ws.moveTo(0.5, 0); ws.lineTo(-0.38, 0.36); ws.lineTo(-0.18, 0); ws.lineTo(-0.38, -0.36); ws.closePath();
  const wgeo = new THREE.ExtrudeGeometry(ws, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 1 }).translate(0, 0, -0.13);
  const wm = new THREE.Mesh(wgeo, std(lk.c1, 0.9));
  const wg = new THREE.Mesh(wgeo, glow); wg.scale.setScalar(1.45);
  const wc = new THREE.Mesh(wgeo, std(lk.c2, 1.2)); wc.scale.setScalar(0.45); wc.position.set(-0.05, 0, 0.1);
  v.wave.add(wm, wg, wc);
  v.wave.scale.setScalar(1.15);
  return v;
}
function disposeTree(o) {
  o.traverse(c => {
    if (c.geometry && ![boxGeo, sphereGeo, torusGeo, domeGeo].includes(c.geometry)) c.geometry.dispose();
    if (c.material && c.material.map && ![...texCache.values()].includes(c.material.map)) c.material.map.dispose();
    if (c.material && c.material !== neonMat) c.material.dispose();
  });
}

const rig = new THREE.Group();
scene.add(rig);
let vehicles = null;
const MODES = ['cube', 'ship', 'ball', 'ufo', 'wave'];
function refreshLook() {
  if (vehicles) MODES.forEach(m => { rig.remove(vehicles[m]); disposeTree(vehicles[m]); });
  vehicles = buildVehicles(look());
  MODES.forEach(m => rig.add(vehicles[m]));
  setVehicle(rig.userData.mode || 'cube');
  buildShowroom();
}
function setVehicle(m) {
  rig.userData.mode = m;
  MODES.forEach(k => { vehicles[k].visible = k === m; });
}

// garage showroom
const showroom = new THREE.Group();
scene.add(showroom);
showroom.visible = false;
function buildShowroom() {
  while (showroom.children.length) { const c = showroom.children.pop(); disposeTree(c); }
  const v = buildVehicles(look());
  const spots = { cube: [0, 0.9, 0, 1.5], ship: [-2.1, 2.5, -2.6, 1.1], ufo: [2.1, 2.6, -2.6, 1.1], ball: [-2.1, 0.5, -1, 1], wave: [2.1, 0.6, -1, 1.1] };
  for (const m of MODES) { const [x, y, z, s] = spots[m]; v[m].position.set(x, y, z); v[m].scale.setScalar(s); showroom.add(v[m]); }
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.2, 40), new THREE.MeshStandardMaterial({ color: 0x111122, emissive: 0x2244ff, emissiveIntensity: 0.25, roughness: 0.3 }));
  pad.position.y = 0.05;
  const halo = new THREE.Mesh(torusGeo, neonMat); halo.rotation.x = Math.PI / 2; halo.scale.set(1.62, 1.62, 1); halo.position.y = 0.16;
  showroom.add(pad, halo);
}

// ================================================================ text sprites
function textMesh(text, h = 1, color = '#ffffff') {
  const c = document.createElement('canvas'), x = c.getContext('2d'), fs = 96;
  x.font = `${fs}px "Lilita One", "Arial Rounded MT Bold", sans-serif`;
  const w = Math.ceil(x.measureText(text).width) + 40;
  c.width = w; c.height = fs + 40;
  x.font = `${fs}px "Lilita One", "Arial Rounded MT Bold", sans-serif`;
  x.textBaseline = 'middle'; x.lineJoin = 'round';
  x.strokeStyle = 'rgba(10,6,20,0.85)'; x.lineWidth = 14; x.strokeText(text, 20, c.height / 2);
  x.fillStyle = color; x.fillText(text, 20, c.height / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  m.scale.set(h * c.width / c.height, h, 1);
  return m;
}

// ================================================================ level scene
const ORB_COL = { yellow: '#ffe600', pink: '#ff4fd8', blue: '#2fd6ff' };
const PORTAL_COL = { cube: '#46ff5a', ship: '#ff5ec4', ball: '#ff6a2b', ufo: '#ffb52b', wave: '#2fd6ff' };
const GRAV_COL = { 1: '#3a8bff', '-1': '#ffe14d' };
const SPEED_COL = ['#ffa02b', '#3ad7ff', '#46ff5a', '#ff5ec4', '#ff3b3b'];
const HINTS = { cube: 'Toca para saltar', ship: 'Mantén para subir', ball: 'Toca para invertir la gravedad', ufo: 'Toca para impulsarte', wave: 'Mantén: sube · Suelta: baja' };
let level = null, levelGroup = null, items = [], attemptLabel = null, endGate = null;
const membraneMats = new Map();
function membraneMat(col) {
  if (!membraneMats.has(col)) {
    membraneMats.set(col, new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(col) }, uTime: U.uTime }, vertexShader: SIMPLE_VS, fragmentShader: MEMBRANE_FS,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
  }
  return membraneMats.get(col);
}

function disposeLevel() {
  if (!levelGroup) return;
  scene.remove(levelGroup);
  levelGroup.traverse(c => {
    if (c.isInstancedMesh) c.dispose();
    if (c.geometry && c.userData.own) c.geometry.dispose();
    if (c.material && c.userData.ownMat) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
  });
  levelGroup = null; items = [];
}

function buildLevelScene(L, opts = {}) {
  disposeLevel();
  level = L;
  levelGroup = new THREE.Group();
  scene.add(levelGroup);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();

  const solids = L.objs.filter(o => o.k === 'S');
  if (solids.length) {
    const bm = new THREE.InstancedMesh(boxGeo, blockMat, solids.length);
    solids.forEach((o, i) => { m.makeScale(o.x1 - o.x0, o.y1 - o.y0, 1); m.setPosition((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, 0); bm.setMatrixAt(i, m); });
    levelGroup.add(bm);
  }
  const spikes = L.objs.filter(o => o.k === 'H');
  if (spikes.length) {
    const sm = new THREE.InstancedMesh(pyramidGeo, spikeMat, spikes.length);
    const down = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI), up = new THREE.Quaternion();
    spikes.forEach((o, i) => {
      const hgt = o.small ? 0.5 : 1;
      s.set(1, hgt, 1);
      p.set(o.x + 0.5, o.dir === 'u' ? o.y : o.y + 1, 0);
      m.compose(p, o.dir === 'u' ? up : down, s);
      sm.setMatrixAt(i, m);
    });
    levelGroup.add(sm);
  }
  // tunnel walls + neon edge bars
  const bars = [];
  for (const w of L.walls) {
    const sh = new THREE.Shape();
    sh.moveTo(w.pts[0][0], w.edge + (w.side > 0 ? 0.01 : -0.01));
    for (const [x, y] of w.pts) sh.lineTo(x, y);
    sh.lineTo(w.pts[w.pts.length - 1][0], w.edge);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
    const mesh = new THREE.Mesh(g, wallMat); mesh.userData.own = true;
    levelGroup.add(mesh);
    for (let i = 0; i + 1 < w.pts.length; i++) bars.push([w.pts[i], w.pts[i + 1]]);
  }
  if (bars.length) { // thin neon rails on the front and back edges of every wall segment
    const nb = new THREE.InstancedMesh(boxGeo, edgeMat, bars.length * 2);
    bars.forEach(([a, b], i) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(dy, dx));
      s.set(len + 0.05, 0.05, 0.05);
      for (const z of [0.5, -0.5]) { p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z); m.compose(p, q, s); nb.setMatrixAt(i * 2 + (z > 0 ? 0 : 1), m); }
    });
    levelGroup.add(nb);
  }
  // interactive objects
  const firstMode = {};
  const lvl = lvSave(L.id);
  for (const o of L.objs) {
    const it = makeItem(o, opts.demo ? null : lvl);
    if (it) { items.push(it); levelGroup.add(it.g); }
    if (o.k === 'G' && o.kind === 'mode' && !firstMode[o.val] && !opts.demo) {
      firstMode[o.val] = 1;
      const t = textMesh(HINTS[o.val], 0.7); t.userData.ownMat = true;
      t.position.set(o.x + 0.5, (o.band ? o.band[0] : 0) + (o.h || 4) * 0.5 + (o.band ? 0 : 3.2), -0.6);
      if (o.band) t.position.y = o.y + o.h + 0.9 > o.band[1] ? o.band[1] - 1.2 : o.y + o.h + 0.9;
      if (!o.band) t.position.y = 5;
      levelGroup.add(t);
    }
  }
  if (!opts.demo) {
    const st = textMesh(L.id === 1 ? HINTS.cube : L.name, 0.75); st.userData.ownMat = true;
    st.position.set(10, 3.4, -0.6); levelGroup.add(st);
    // end gate
    endGate = new THREE.Group();
    const r1 = new THREE.Mesh(torusGeo, additive(hdr('#ffffff', 2.4))); r1.userData.ownMat = true; r1.scale.set(2.2, 4.2, 1);
    const r2 = new THREE.Mesh(planeGeo, membraneMat('#bfefff')); r2.scale.set(4.2, 8.2, 1);
    endGate.add(r1, r2);
    endGate.position.set(L.length + 3, 4.4, 0);
    levelGroup.add(endGate);
  }
  attemptLabel = null;
}

function makeItem(o, lvl) {
  const g = new THREE.Group();
  let x = o.x;
  switch (o.k) {
    case 'O': {
      const col = ORB_COL[o.type];
      const core = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: hdr(col, 1.8), fog: false })); core.scale.setScalar(0.3); core.userData.ownMat = true;
      const rg = new THREE.Mesh(torusGeo, new THREE.MeshBasicMaterial({ color: hdr(col, 1.4), fog: false })); rg.scale.setScalar(0.56); rg.userData.ownMat = true;
      const halo = new THREE.Mesh(planeGeo, additive(new THREE.Color(col), 0.55, glowTex)); halo.scale.setScalar(2.2); halo.userData.ownMat = true;
      g.add(halo, core, rg);
      g.position.set(o.x, o.y, 0);
      return { o, g, x, kind: 'orb', ring: rg };
    }
    case 'P': {
      const col = ORB_COL[o.type];
      const dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ color: hdr(col, 1.6), fog: false })); dome.scale.set(1, 0.32, 1); dome.userData.ownMat = true;
      const beam = new THREE.Mesh(planeGeo, additive(new THREE.Color(col), 0.5, glowTex)); beam.scale.set(1.3, 1.6, 1); beam.position.y = 0.5; beam.userData.ownMat = true;
      g.add(dome, beam);
      g.position.set(o.x + 0.5, o.dir > 0 ? o.y : o.y + 1, 0);
      if (o.dir < 0) g.scale.y = -1;
      return { o, g, x, kind: 'pad', beam };
    }
    case 'G': {
      if (o.kind === 'speed') {
        const col = SPEED_COL[o.val], n = Math.max(1, o.val), mat = new THREE.MeshBasicMaterial({ color: hdr(col, 1.7), fog: false });
        for (let i = 0; i < n; i++) {
          const c = new THREE.Mesh(chevronGeo, mat); c.userData.ownMat = i === 0;
          c.position.x = (i - (n - 1) / 2) * 0.42; c.scale.set(0.9, 1.6, 1);
          if (o.val === 0) c.rotation.z = Math.PI;
          g.add(c);
        }
        const halo = new THREE.Mesh(planeGeo, additive(new THREE.Color(col), 0.35, glowTex)); halo.scale.set(3.2, 3.6, 1); halo.userData.ownMat = true;
        g.add(halo);
        g.position.set(o.x + 0.5, 1.8, 0);
        return { o, g, x, kind: 'speed' };
      }
      const col = o.kind === 'mode' ? PORTAL_COL[o.val] : GRAV_COL[o.val];
      const hh = o.h / 2;
      const rg = new THREE.Mesh(torusGeo, new THREE.MeshBasicMaterial({ color: hdr(col, 1.9), fog: false })); rg.userData.ownMat = true;
      rg.scale.set(0.55, hh, 1.2);
      const rg2 = new THREE.Mesh(torusGeo, rg.material); rg2.scale.set(0.45, hh * 0.92, 1); rg2.position.z = -0.35;
      const mem = new THREE.Mesh(planeGeo, membraneMat(col)); mem.scale.set(1.0, o.h * 0.98, 1);
      const halo = new THREE.Mesh(planeGeo, additive(new THREE.Color(col), 0.3, glowTex)); halo.scale.set(3, o.h * 1.4, 1); halo.userData.ownMat = true;
      g.add(halo, mem, rg, rg2);
      if (o.kind === 'grav') {
        const ar = new THREE.Mesh(chevronGeo, rg.material); ar.rotation.z = o.val > 0 ? -Math.PI / 2 : Math.PI / 2; ar.scale.set(0.6, 0.8, 1); g.add(ar);
      }
      g.position.set(o.x + 0.5, o.y + hh, 0);
      return { o, g, x, kind: 'portal', col };
    }
    case 'K': {
      const had = lvl && lvl.coins[o.idx];
      const mat = had
        ? new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.35, fog: false })
        : new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 0.85, roughness: 0.25, emissive: 0xff9a00, emissiveIntensity: 0.75 });
      const coin = new THREE.Mesh(coinGeo, mat); coin.userData.ownMat = true;
      const rim = new THREE.Mesh(torusGeo, new THREE.MeshBasicMaterial({ color: had ? hdr('#9fd0ff', 0.6) : hdr('#ffe27a', 1.8), fog: false })); rim.scale.setScalar(0.47); rim.userData.ownMat = true;
      const halo = new THREE.Mesh(planeGeo, additive(new THREE.Color(had ? '#7fb0ff' : '#ffcf3a'), had ? 0.2 : 0.5, glowTex)); halo.scale.setScalar(2.4); halo.userData.ownMat = true;
      const spin = new THREE.Group(); spin.add(coin, rim);
      g.add(halo, spin);
      g.position.set(o.x, o.y, 0);
      return { o, g, x, kind: 'coin', spin };
    }
    case 'C': {
      const saw = new THREE.Mesh(sawGeo, sawMat);
      saw.scale.setScalar(o.r);
      g.add(saw);
      g.position.set(o.x, o.y, 0);
      x = o.x - o.r;
      return { o, g, x, kind: 'saw', saw };
    }
  }
  return null;
}

function updateItems(dt, camX) {
  const t = U.uTime.value;
  for (const it of items) {
    const vis = it.x > camX - 26 && it.x < camX + 46;
    it.g.visible = vis && !it.hidden;
    if (!vis) continue;
    switch (it.kind) {
      case 'orb': it.ring.rotation.y = t * 3; it.ring.rotation.x = Math.sin(t * 2) * 0.4; it.g.scale.setScalar(1 + U.uPulse.value * 0.12 + (it.flash || 0)); break;
      case 'pad': it.beam.material.opacity = 0.35 + U.uPulse.value * 0.3; break;
      case 'coin': it.spin.rotation.y = t * 3; it.g.position.y = it.o.y + Math.sin(t * 2.4) * 0.08; break;
      case 'saw': it.saw.rotation.z = -t * 5; break;
      case 'portal': it.g.children[2].rotation.y = Math.sin(t * 2) * 0.15; break;
    }
    if (it.flash) it.flash = Math.max(0, it.flash - dt * 2);
  }
}

// ================================================================ demo (menu background)
let demo = null;
function startDemo() {
  const L = Core.buildDemo();
  buildLevelScene(L, { demo: true });
  demo = { L, ps: Core.newState(L), acc: 0, prevX: 0, prevY: 0.5 };
  demo.ps.events = [];
  setVehicle('cube');
  rig.visible = true;
  trail.reset(); waveTrail.reset();
  camY = 2.9;
}
function updateDemo(dt) {
  const d = demo, ps = d.ps;
  d.acc += dt;
  while (d.acc >= DT) {
    d.prevX = ps.x; d.prevY = ps.y;
    Core.step(ps, d.L, Core.demoInput(ps, d.L));
    d.acc -= DT;
    for (const e of ps.events) if (e.type === 'land') landFx(ps);
    ps.events.length = 0;
    if (ps.dead || ps.win || ps.x > d.L.length - 40) { startDemo(); return; }
  }
  const a = d.acc / DT, px = lerp(d.prevX, ps.x, a), py = lerp(d.prevY, ps.y, a);
  animateRig(dt, ps, px, py);
  updateCamera(dt, px, py, ps);
  return px;
}

// ================================================================ gameplay
const game = {
  state: 'boot', idx: 0, practice: false, ps: null, acc: 0, prevX: 0, prevY: 0.5,
  dead: false, deadT: 0, won: false, winT: 0, attempt: 0, jumpsRun: 0, timeRun: 0,
  cps: [], cpMarkers: [], lastCpT: 0, spawnT: 0, spawnedAuto: false, lastPct: -1, bestShown: false,
};
let camY = 2.9, camX = 0, shake = 0, rot = 0, squash = 0;

function music() { return Core.LEVELS[game.idx].music; }

function startLevel(idx, practice) {
  game.idx = idx; game.practice = practice;
  const L = Core.buildLevel(idx);
  buildLevelScene(L);
  setPalette(L.colors[0], true);
  game.cps = []; game.cpMarkers = [];
  game.attempt = 0; game.jumpsRun = 0; game.timeRun = 0; game.ps = null; game.palNow = null;
  Snd.setPractice(practice);
  showScreen(null);
  $('hud').hidden = false;
  $('practiceBtns').hidden = !practice;
  $('pBar').classList.toggle('pr', practice);
  game.state = 'play';
  spawn(false);
}

function spawn(fromCp) {
  const L = level;
  const cp = fromCp && game.cps.length ? game.cps[game.cps.length - 1] : null;
  if (game.ps) { game.jumpsRun += game.ps.jumps; game.timeRun += game.ps.t - (game.ps.t0 || 0); }
  const ps = cp ? Core.clone(cp.s) : Core.newState(L);
  ps.events = []; ps.t0 = ps.t; ps.jumps = 0;
  game.ps = ps; game.acc = 0; game.prevX = ps.x; game.prevY = ps.y;
  game.dead = false; game.won = false; game.spawnT = 0; game.lastCpT = ps.t; game.spawnedAuto = cp ? !!cp.auto : false;
  game.attempt++;
  const lv = lvSave(L.id); lv.att++; persist();
  setVehicle(ps.mode);
  rig.visible = true; rig.scale.setScalar(1);
  rot = 0; squash = 0;
  trail.reset(); waveTrail.reset();
  ceilTarget = ps.band ? ps.band[1] : 60;
  // colors in effect at this x
  let palNow = L.colors[0];
  for (const c of L.colors) if (c.x <= ps.x) palNow = c;
  setPalette(palNow, !cp);
  for (const it of items) if (it.kind === 'coin') it.hidden = ps.coins[it.o.idx];
  camY = ps.band ? (ps.band[0] + ps.band[1]) / 2 - 0.3 : Math.max(2.9, ps.y + 0.5);
  if (!cp) {
    if (attemptLabel) { levelGroup.remove(attemptLabel); attemptLabel.material.map.dispose(); attemptLabel.material.dispose(); }
    attemptLabel = textMesh(`Intento ${game.attempt}`, 1.25);
    attemptLabel.position.set(ps.x + 9, 6.2, -1);
    levelGroup.add(attemptLabel);
  }
  Snd.play(music(), cp ? cp.s.t : 0);
  game.lastPct = -1;
}

function progress() { return Math.min(100, Math.floor(game.ps.x / level.length * 100)); }

function onDie() {
  const ps = game.ps;
  game.dead = true; game.deadT = 0;
  Snd.stop(); Snd.fx('die');
  rig.visible = false;
  explode(ps.x, ps.y);
  shake = 0.55;
  const pct = progress(), lv = lvSave(level.id);
  if (game.practice) { if (pct > lv.prac) lv.prac = pct; }
  else if (pct > lv.best) {
    lv.best = pct;
    if (pct >= 5) toast(`${pct}%`, '¡Nuevo récord!');
  }
  persist();
  if (game.practice && game.spawnedAuto && game.spawnT < 0.45 && game.cps.length) removeCheckpoint();
}

function onWin() {
  const ps = game.ps;
  game.won = true; game.winT = 0;
  Snd.stop(1.5); Snd.fx('win');
  const lv = lvSave(level.id), def = Core.LEVELS[game.idx];
  game.firstWin = false;
  game.newCoins = 0;
  if (game.practice) lv.prac = 100;
  else {
    game.firstWin = !lv.done;
    lv.done = 1; lv.best = 100;
    ps.coins.forEach((c, i) => { if (c && !lv.coins[i]) { lv.coins[i] = 1; game.newCoins++; } });
  }
  persist();
  game.winStars = game.firstWin ? def.stars : 0;
  game.jumpsRun += ps.jumps; game.timeRun += ps.t - (ps.t0 || 0); ps.jumps = 0; ps.t0 = ps.t;
}

function explode(x, y) {
  const lk = look(), c1 = new THREE.Color(lk.c1), c2 = new THREE.Color(lk.c2);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
    shards.spawn(x, y, (Math.random() - 0.5) * 0.8, Math.cos(a) * v, Math.sin(a) * v + 3, (Math.random() - 0.5) * 6, 0.9 + Math.random() * 0.5, 0.12 + Math.random() * 0.2, i % 3 ? c1 : c2, 22, 8);
  }
  burst(x, y, hdr(lk.c2, 2), 40, 10, 0.6, 0.5);
  burst(x, y, hdr('#ffffff', 2), 14, 4, 0.4, 0.9);
  ring(x, y, lk.c2, 3.4, 0.5);
}

function handleEvents(ps) {
  for (const e of ps.events) {
    switch (e.type) {
      case 'land': landFx(ps); break;
      case 'jump': squash = -0.18; break;
      case 'orb': case 'pad': {
        const col = ORB_COL[e.o.type];
        ring(e.o.k === 'O' ? e.o.x : e.o.x + 0.5, e.o.k === 'O' ? e.o.y : e.o.y + 0.2, col, 1.6, 0.35);
        burst(e.x, e.y, hdr(col, 2), 14, 5, 0.4, 0.35);
        const it = items.find(i => i.o === e.o); if (it) it.flash = 0.6;
        Snd.fx(e.type);
        break;
      }
      case 'portal': {
        const col = e.o.kind === 'mode' ? PORTAL_COL[e.o.val] : GRAV_COL[e.o.val];
        burst(e.o.x + 0.5, ps.y, hdr(col, 2), 22, 7, 0.5, 0.4);
        Snd.fx('portal');
        if (e.o.kind === 'mode') {
          setVehicle(ps.mode); trail.reset(); waveTrail.reset();
          ceilTarget = ps.band ? ps.band[1] : 60;
          const c = level.colors.find(c => Math.abs(c.x - e.o.x) < 0.5); if (c) setPalette(c);
        }
        break;
      }
      case 'speed': burst(e.o.x + 0.5, 1.8, hdr(SPEED_COL[e.o.val], 2), 16, 6, 0.4, 0.4); Snd.fx('portal'); break;
      case 'coin': {
        const it = items.find(i => i.o === e.o); if (it) it.hidden = true;
        burst(e.o.x, e.o.y, hdr('#ffd23a', 2.4), 28, 7, 0.7, 0.45);
        ring(e.o.x, e.o.y, '#ffd23a', 1.8, 0.4);
        Snd.fx('coin');
        break;
      }
      case 'die': onDie(); break;
      case 'win': onWin(); break;
    }
  }
  ps.events.length = 0;
}

function landFx(ps) {
  squash = 0.22;
  if (ps.mode !== 'cube' && ps.mode !== 'ball') return;
  const y = ps.y - 0.5 * ps.gs;
  for (let i = 0; i < 5; i++) sparks.spawn(ps.x - 0.3, y, 0.3 + Math.random() * 0.3, -2 - Math.random() * 3, ps.gs * (1 + Math.random() * 2), 0, 0.35, 0.22, U.uNeon.value, 0);
}

function animateRig(dt, ps, px, py) {
  const sp = Core.SPEEDS[ps.spd], m = ps.mode;
  rig.position.set(px, py, 0);
  const v = vehicles[m];
  squash = damp(squash, 0, 10, dt);
  let rz = 0, sy = 1;
  switch (m) {
    case 'cube': {
      if (ps.grounded) { const t = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2); rot = damp(rot, t, 22, dt); }
      else rot -= ps.gs * dt * Math.PI / 0.45 * 1.0;
      rz = rot;
      v.scale.set(1 + squash * 0.5, 1 - squash * 0.6, 1);
      break;
    }
    case 'ship': rz = Math.atan2(ps.vy, sp) * 0.9; sy = ps.gs; break;
    case 'ball': rot -= ps.gs * sp * dt / 0.5; rz = rot; break;
    case 'ufo': rz = clamp(-ps.vy * 0.015, -0.25, 0.25); sy = ps.gs; break;
    case 'wave': rz = ps.grounded ? 0 : (ps.vy > 0 ? Math.PI / 4 : -Math.PI / 4); break;
  }
  v.rotation.z = m === 'wave' ? damp(v.rotation.z, rz, 30, dt) : rz;
  if (m === 'wave') v.scale.set(1.15, 1.15, 1.15);
  else if (m !== 'cube') v.scale.set(1, sy, 1);
  // trails and sparks
  const lk = look(), c2 = tmpC.set(lk.c2).multiplyScalar(1.4);
  if (m === 'wave') {
    waveTrail.push(px - 0.05, py); waveTrail.update(0.15, c2, 0.3, true);
    trail.update(0, c2, 0, false);
  } else {
    trail.push(px - (m === 'ship' ? 0.7 : 0.3), py - (m === 'ship' ? 0.05 : 0));
    trail.update(m === 'cube' ? 0.16 : 0.32, c2.multiplyScalar(m === 'cube' ? 0.3 : 0.6), -0.05, false, m === 'cube' ? 12 : 48);
    waveTrail.update(0, c2, 0, true);
  }
  if (Math.random() < QUALITY[quality].parts) {
    if ((m === 'cube' || m === 'ball') && ps.grounded) {
      sparks.spawn(px - 0.45, py - 0.5 * ps.gs, 0.2 + Math.random() * 0.4, -2 - Math.random() * 2, ps.gs * Math.random() * 1.5, 0, 0.3, 0.16, U.uNeon.value, 0);
    } else if (m === 'ship' || m === 'ufo') {
      const fx = m === 'ship' ? px - 0.85 : px - 0.2, fy = m === 'ship' ? py - 0.05 * ps.gs : py - 0.25 * ps.gs;
      sparks.spawn(fx, fy, (Math.random() - 0.5) * 0.4, -3 - Math.random() * 3, (Math.random() - 0.5) * 2 - (m === 'ufo' ? 2 * ps.gs : 0), 0, 0.35, 0.3, c2, 0);
    }
  }
}

let camDist = 12;
function updateCamera(dt, px, py, ps) {
  const aspect = W / H, band = ps && ps.band, tanH = Math.tan(camera.fov * Math.PI / 360) * 2;
  // keep ~23 blocks across and the whole band (or ~10 blocks for the cube) in view
  const tdist = clamp(Math.max((band ? 12.8 : 9.8) / tanH, 23 / (tanH * aspect)), 9, 34);
  camDist = damp(camDist, tdist, 2.5, dt);
  let ty;
  if (band) ty = (band[0] + band[1]) / 2 - 0.3;
  else ty = Math.max(2.9, clamp(camY, py - 1.4, py + 2.6));
  camY = damp(camY, ty, band ? 3 : 4, dt);
  camX = px;
  shake = Math.max(0, shake - dt * 1.6);
  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
  const ahead = aspect < 1 ? 2.5 : Math.min(8, tanH * camDist * aspect * 0.25);
  camera.position.set(px + ahead - 3.2 + sx, camY + 2.3 + sy, camDist);
  camera.lookAt(px + ahead, camY + 0.35, 0);
}

function updatePlay(dt) {
  const ps = game.ps;
  if (game.dead) {
    game.deadT += dt;
    if (game.deadT > 1.0) spawn(game.practice);
    updateCamera(dt, ps.x, ps.y, ps);
    return ps.x;
  }
  if (game.won) {
    game.winT += dt;
    const gx = level.length + 3, k = Math.min(1, game.winT / 0.9);
    const px = lerp(ps.x, gx, k * k), py = lerp(ps.y, 4.4, k);
    rig.position.set(px, py, 0);
    rig.scale.setScalar(Math.max(0.01, 1 - k));
    if (game.winT < 1 && Math.random() < 0.6) burst(px, py, hdr('#bfefff', 2), 3, 3, 0.5, 0.4);
    if (game.winT > 0.9 && !game.shownWin) {
      game.shownWin = true;
      for (let i = 0; i < 4; i++) setTimeout(() => confetti(gx), i * 220);
      showComplete();
    }
    updateCamera(dt, Math.min(px, gx - 4), py, ps);
    return camX;
  }
  game.acc += dt;
  game.spawnT += dt;
  while (game.acc >= DT) {
    game.prevX = ps.x; game.prevY = ps.y;
    let hold = input.hold;
    if (input.tap) { hold = true; input.tap = false; }
    if (window.__autoInput) hold = window.__autoInput(ps);
    Core.step(ps, level, hold);
    game.acc -= DT;
    if (ps.events.length) handleEvents(ps);
    if (ps.dead || ps.win) { game.shownWin = false; return ps.x; }
    if (game.practice && save.autoCp && ps.t - game.lastCpT > 2.6 && (ps.grounded || ps.mode !== 'cube') && game.spawnT > 0.5) addCheckpoint(true);
  }
  // color triggers that were passed without a portal event
  let palNow = level.colors[0];
  for (const c of level.colors) if (c.x <= ps.x) palNow = c;
  if (palNow !== game.palNow) { game.palNow = palNow; setPalette(palNow); }
  const a = game.acc / DT, px = lerp(game.prevX, ps.x, a), py = lerp(game.prevY, ps.y, a);
  animateRig(dt, ps, px, py);
  updateCamera(dt, px, py, ps);
  if (attemptLabel) attemptLabel.material.opacity = clamp((attemptLabel.position.x + 4 - px) / 8, 0, 1);
  const pct = progress();
  if (pct !== game.lastPct) { game.lastPct = pct; $('pFill').style.width = pct + '%'; $('pPct').textContent = pct + '%'; }
  return px;
}

function confetti(x) {
  const cols = ['#ff5ec4', '#46ff5a', '#ffe14d', '#3ad7ff', '#ff6a2b'];
  for (let i = 0; i < 30; i++) {
    const c = new THREE.Color(cols[i % cols.length]);
    shards.spawn(camX - 6 + Math.random() * 22, camY + 8, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4, -2 - Math.random() * 3, 0, 2.5, 0.16 + Math.random() * 0.12, c, 4, 4);
  }
  burst(x, 4.4, hdr('#ffffff', 2), 30, 9, 0.8, 0.5);
}

// practice checkpoints
function addCheckpoint(auto) {
  const ps = game.ps;
  if (!ps || ps.dead || ps.win) return;
  game.cps.push({ s: Core.clone(ps), auto });
  game.lastCpT = ps.t;
  const mk = new THREE.Mesh(octaGeo, new THREE.MeshBasicMaterial({ color: hdr('#3dff7a', 1.8), fog: false }));
  mk.position.set(ps.x, ps.y + 0.9 * ps.gs, 0); mk.userData.ownMat = true;
  levelGroup.add(mk); game.cpMarkers.push(mk);
  if (!auto) Snd.fx('checkpoint');
}
function removeCheckpoint() {
  if (!game.cps.length) return;
  game.cps.pop();
  const mk = game.cpMarkers.pop();
  if (mk) { levelGroup.remove(mk); mk.material.dispose(); }
}

// ================================================================ UI
const SCREENS = ['loading', 'menu', 'levels', 'garage', 'settings', 'pause', 'complete'];
function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('show', s === id);
  if (id && id !== 'pause' && id !== 'complete') $('hud').hidden = true;
}
function toast(big, small) {
  const t = $('toast');
  t.innerHTML = `${big}${small ? `<small>${small}</small>` : ''}`;
  t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1300);
}
const STAR_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z" fill="#ffd23a" stroke="#10081f" stroke-width="1.6"/></svg>';
const COIN_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#ffc21a" stroke="#10081f" stroke-width="2"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#fff3a0" stroke-width="1.6"/></svg>';
const DIFF = {
  easy: ['Fácil', '#38c8ff'], normal: ['Normal', '#43e04a'], hard: ['Difícil', '#ffc22e'],
  harder: ['Muy difícil', '#ff6a2e'], insane: ['Locura', '#ff4fd8'], demon: ['Demonio', '#ff2e3a'],
};
function faceSVG(d) {
  const c = DIFF[d][1], o = '#10081f';
  const horns = d === 'demon' ? `<path d="M12 20 L6 4 L22 14 Z M52 20 L58 4 L42 14 Z" fill="#ffd23a" stroke="${o}" stroke-width="3" stroke-linejoin="round"/>` : '';
  const brows = ['harder', 'insane', 'demon'].includes(d) ? `<path d="M17 24 L28 29 M47 24 L36 29" stroke="${o}" stroke-width="4.5" stroke-linecap="round"/>` : (d === 'hard' ? `<path d="M18 26 L28 26 M36 26 L46 26" stroke="${o}" stroke-width="3.5" stroke-linecap="round"/>` : '');
  const eyes = `<ellipse cx="24" cy="33" rx="4.5" ry="5.5" fill="${o}"/><ellipse cx="40" cy="33" rx="4.5" ry="5.5" fill="${o}"/><circle cx="25.5" cy="31" r="1.6" fill="#fff"/><circle cx="41.5" cy="31" r="1.6" fill="#fff"/>`;
  const mouth = {
    easy: `<path d="M19 42 Q32 56 45 42 Z" fill="#d4224a" stroke="${o}" stroke-width="3" stroke-linejoin="round"/>`,
    normal: `<path d="M21 43 Q32 51 43 43" fill="none" stroke="${o}" stroke-width="3.5" stroke-linecap="round"/>`,
    hard: `<path d="M25 46 L39 45" stroke="${o}" stroke-width="3.5" stroke-linecap="round"/>`,
    harder: `<path d="M22 48 Q32 41 42 48" fill="none" stroke="${o}" stroke-width="3.5" stroke-linecap="round"/>`,
    insane: `<path d="M20 49 Q32 39 44 49 Z" fill="#fff" stroke="${o}" stroke-width="3" stroke-linejoin="round"/>`,
    demon: `<path d="M19 47 L25 43 L29 47 L32 43 L35 47 L39 43 L45 47 Q32 55 19 47 Z" fill="#fff" stroke="${o}" stroke-width="3" stroke-linejoin="round"/>`,
  }[d];
  return `<svg viewBox="0 0 64 64">${horns}<circle cx="32" cy="36" r="24" fill="${c}" stroke="${o}" stroke-width="4"/><ellipse cx="25" cy="24" rx="8" ry="4" fill="#fff" opacity=".35"/>${brows}${eyes}${mouth}</svg>`;
}
function barsHTML(lv) {
  return `<div class="lbl stroke">Modo normal</div><div class="bar"><i style="width:${lv.best}%"></i><span class="stroke">${lv.best}%</span></div>
    <div class="lbl stroke">Modo práctica</div><div class="bar pr"><i style="width:${lv.prac}%"></i><span class="stroke">${lv.prac}%</span></div>`;
}

let lvIdx = 0;
function renderLevels() {
  const track = $('lvTrack');
  track.innerHTML = Core.LEVELS.map((d, i) => {
    const lv = lvSave(d.id);
    const coins = [0, 1, 2].map(c => `<span class="coin-slot${lv.coins[c] ? '' : ' off'}">${COIN_SVG}</span>`).join('');
    return `<div class="lv-card" data-i="${i}">
      <div class="lv-box" data-play="${i}" role="button" tabindex="0" aria-label="Jugar ${d.name}">
        <div class="lv-face">${faceSVG(d.diff)}</div>
        <div class="lv-name stroke">${d.name}</div>
        <div class="lv-meta stroke"><span class="diff">${DIFF[d.diff][0]}</span><span class="coins">${coins}</span>${lv.done ? '<span style="color:#7dff6a">✔ Completado</span>' : ''}</div>
        <div class="lv-stars stroke">${d.stars} ${STAR_SVG}</div>
      </div>
      <div class="bars">${barsHTML(lv)}</div>
      <div class="lv-actions"><button class="gbtn stroke" data-play="${i}">Jugar</button><button class="gbtn alt stroke" data-prac="${i}">Práctica</button></div>
    </div>`;
  }).join('');
  $('lvDots').innerHTML = Core.LEVELS.map(() => '<b></b>').join('');
  setLvIdx(lvIdx, true);
}
function setLvIdx(i, instant) {
  lvIdx = (i + Core.LEVELS.length) % Core.LEVELS.length;
  $('lvTrack').style.transform = `translateX(${-lvIdx * 100}%)`;
  [...$('lvTrack').children].forEach((c, k) => c.classList.toggle('on', k === lvIdx));
  [...$('lvDots').children].forEach((c, k) => c.classList.toggle('on', k === lvIdx));
  setPalette(Core.PAL[Core.LEVELS[lvIdx].pal], instant);
}
function updateStats() {
  let stars = 0, coins = 0;
  for (const d of Core.LEVELS) { const lv = lvSave(d.id); if (lv.done) stars += d.stars; coins += lv.coins.reduce((a, b) => a + b, 0); }
  $('statStars').textContent = stars; $('statCoins').textContent = coins;
}

function goMenu() {
  Snd.setPractice(false);
  if (game.state === 'play' || game.state === 'paused' || game.state === 'complete' || !demo) { startDemo(); Snd.play(MENU_SONG); }
  game.state = 'menu';
  showroom.visible = false; rig.visible = true;
  setPalette(Core.PAL.blue);
  updateStats();
  showScreen('menu');
}
function goLevels() {
  if (game.state === 'play' || game.state === 'paused' || game.state === 'complete') { startDemo(); Snd.play(MENU_SONG); }
  game.state = 'levels';
  showroom.visible = false; rig.visible = true;
  renderLevels();
  showScreen('levels');
}
function pause() {
  if (game.state !== 'play' || game.won) return;
  game.state = 'paused';
  if (Snd.ctx) Snd.ctx.suspend();
  const d = Core.LEVELS[game.idx];
  $('pauseTitle').textContent = d.name + (game.practice ? ' · Práctica' : '');
  $('pauseBars').innerHTML = barsHTML(lvSave(d.id));
  $('psPractice').setAttribute('aria-label', game.practice ? 'Salir del modo práctica' : 'Modo práctica');
  $('pauseHint').textContent = game.practice ? 'Pulsa el diamante para salir del modo práctica.' : 'El diamante activa el modo práctica: pon puntos de control y reaparece en ellos.';
  syncSliders();
  showScreen('pause');
}
function resume() {
  if (game.state !== 'paused') return;
  showScreen(null); $('hud').hidden = false;
  game.state = 'play';
  if (Snd.ctx) Snd.ctx.resume();
  input.pointers.clear(); input.keys.clear(); input.hold = false; input.tap = false;
}
function showComplete() {
  game.state = 'complete';
  const d = Core.LEVELS[game.idx], ps = game.ps, lv = lvSave(d.id);
  const secs = Math.round(game.timeRun);
  $('winTitle').textContent = game.practice ? '¡Práctica completada!' : '¡Nivel completado!';
  $('winStats').innerHTML = `<span>Intentos: <b>${game.attempt}</b></span><span>Saltos: <b>${game.jumpsRun}</b></span><span>Tiempo: <b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b></span>`;
  $('winCoins').innerHTML = [0, 1, 2].map(c => `<span class="coin-slot${(game.practice ? ps.coins[c] : lv.coins[c]) ? '' : ' off'}" style="width:1em">${COIN_SVG}</span>`).join('');
  $('winReward').innerHTML = game.winStars ? `+${game.winStars} ${STAR_SVG}` : (game.newCoins ? `+${game.newCoins} ${COIN_SVG}` : (game.practice ? 'Ahora pruébalo en modo normal' : ''));
  $('cmNext').style.visibility = game.idx < Core.LEVELS.length - 1 ? 'visible' : 'hidden';
  $('hud').hidden = true;
  showScreen('complete');
}

// garage panel
function renderGarage() {
  const icons = $('gaIcons'), lk = look();
  icons.innerHTML = '';
  for (let i = 0; i < ICON_N; i++) {
    const b = document.createElement('button');
    b.setAttribute('aria-label', `Icono ${i + 1}`);
    b.className = i === save.icon ? 'on' : '';
    const c = document.createElement('canvas'); c.width = c.height = 64;
    drawIcon(c.getContext('2d'), 64, i, lk.c1, lk.c2);
    b.appendChild(c);
    b.onclick = () => { save.icon = i; persist(); Snd.fx('click'); refreshLook(); renderGarage(); };
    icons.appendChild(b);
  }
  for (const [id, key] of [['gaC1', 'c1'], ['gaC2', 'c2']]) {
    const el = $(id);
    el.innerHTML = '';
    COLORS.forEach((col, i) => {
      const b = document.createElement('button');
      b.style.background = col; b.className = save[key] === i ? 'on' : '';
      b.setAttribute('aria-label', `Color ${i + 1}`);
      b.onclick = () => { save[key] = i; persist(); Snd.fx('click'); refreshLook(); renderGarage(); };
      el.appendChild(b);
    });
  }
}
function goGarage() {
  game.state = 'garage';
  showroom.visible = true; rig.visible = false;
  renderGarage();
  showScreen('garage');
}

// settings
function syncSliders() {
  for (const id of ['stMusic', 'psMusic']) $(id).value = Math.round(save.music * 100);
  for (const id of ['stSfx', 'psSfx']) $(id).value = Math.round(save.sfx * 100);
  [...$('stQuality').children].forEach(b => b.classList.toggle('on', b.dataset.q === save.quality));
  $('stAuto').classList.toggle('on', !!save.autoCp);
  $('stFull').classList.toggle('on', !!document.fullscreenElement);
}
function goSettings() {
  game.state = 'settings';
  syncSliders();
  $('stResetBox').innerHTML = '<button class="gbtn warn stroke" id="stReset">Borrar progreso</button>';
  $('stReset').onclick = askReset;
  showScreen('settings');
}
function askReset() {
  $('stResetBox').innerHTML = '<span class="small">¿Seguro? Se borran récords y monedas.</span><button class="gbtn warn stroke" id="stYes">Borrar</button><button class="gbtn alt stroke" id="stNo">Cancelar</button>';
  $('stYes').onclick = () => { save.lv = {}; persist(); updateStats(); $('stResetBox').innerHTML = '<span class="small">Progreso borrado.</span>'; };
  $('stNo').onclick = () => { $('stResetBox').innerHTML = '<button class="gbtn warn stroke" id="stReset">Borrar progreso</button>'; $('stReset').onclick = askReset; };
}
function setVol(kind, v) {
  save[kind] = v / 100; persist();
  Snd.setVolumes(save.music, save.sfx);
  syncSliders();
}
function toggleFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen(); return; }
  const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
  if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* unsupported */ } }).catch(() => {});
}

// ================================================================ input
const input = { hold: false, tap: false, pointers: new Set(), keys: new Set() };
function updHold() { input.hold = input.pointers.size > 0 || input.keys.size > 0; }
canvas.addEventListener('pointerdown', e => {
  if (game.state !== 'play') return;
  e.preventDefault();
  input.pointers.add(e.pointerId); input.tap = true; updHold();
});
const release = e => { input.pointers.delete(e.pointerId); updHold(); };
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
canvas.addEventListener('contextmenu', e => e.preventDefault());
const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW', 'Enter'];
window.addEventListener('keydown', e => {
  if (JUMP_KEYS.includes(e.code)) {
    if (game.state === 'play') { e.preventDefault(); if (!e.repeat) { input.keys.add(e.code); input.tap = true; updHold(); } }
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    if (game.state === 'play') pause(); else if (game.state === 'paused') resume();
  } else if (e.code === 'KeyR' && game.state === 'play' && !game.dead) {
    game.ps.dead = true; onDie();
  }
});
window.addEventListener('keyup', e => { input.keys.delete(e.code); updHold(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); if (Snd.ctx) Snd.ctx.suspend(); }
  else if (game.state !== 'paused' && Snd.ctx) Snd.ctx.resume();
});
window.addEventListener('blur', () => { input.pointers.clear(); input.keys.clear(); updHold(); });

// unlock audio on the first touch anywhere
const unlock = () => { Snd.unlock(); if (game.state === 'menu' && !Snd.song) Snd.play(MENU_SONG); };
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

function click(id, fn) {
  $(id).addEventListener('click', e => { e.stopPropagation(); Snd.unlock(); Snd.fx('click'); fn(e); });
  $(id).addEventListener('pointerdown', e => e.stopPropagation());
}
click('btnPlay', goLevels);
click('btnGarage', goGarage);
click('btnSettings', goSettings);
click('lvBack', goMenu);
click('gaBack', goMenu);
click('stBack', goMenu);
click('lvPrev', () => setLvIdx(lvIdx - 1));
click('lvNext', () => setLvIdx(lvIdx + 1));
click('btnPause', pause);
click('cpAdd', () => addCheckpoint(false));
click('cpDel', removeCheckpoint);
click('psResume', resume);
click('psRestart', () => { resume(); game.cps = []; game.cpMarkers.forEach(m => levelGroup.remove(m)); game.cpMarkers = []; game.ps.dead = true; game.deadT = 1; game.dead = true; rig.visible = false; Snd.stop(); });
click('psMenu', () => { if (Snd.ctx) Snd.ctx.resume(); goLevels(); });
click('psPractice', () => {
  if (Snd.ctx) Snd.ctx.resume();
  if (game.practice) startLevel(game.idx, false);
  else {
    game.practice = true; Snd.setPractice(true);
    $('practiceBtns').hidden = false; $('pBar').classList.add('pr');
    resume();
    if (!game.dead) addCheckpoint(false);
  }
});
click('cmRetry', () => startLevel(game.idx, game.practice));
click('cmNext', () => startLevel(Math.min(game.idx + 1, Core.LEVELS.length - 1), false));
click('cmMenu', goLevels);
click('stAuto', () => { save.autoCp = !save.autoCp; persist(); syncSliders(); });
click('stFull', () => { toggleFullscreen(); setTimeout(syncSliders, 400); });
click('rotateOk', () => { save.portraitOk = true; persist(); checkRotate(); });
$('stQuality').addEventListener('click', e => {
  const q = e.target.dataset && e.target.dataset.q;
  if (!q) return;
  save.quality = q; persist();
  quality = q === 'auto' ? 'high' : q; autoQ.samples = []; setupPost(); syncSliders();
});
for (const [id, kind] of [['stMusic', 'music'], ['psMusic', 'music'], ['stSfx', 'sfx'], ['psSfx', 'sfx']]) {
  $(id).addEventListener('input', e => setVol(kind, +e.target.value));
  $(id).addEventListener('pointerdown', e => e.stopPropagation());
}
$('lvTrack').addEventListener('click', e => {
  const t = e.target.closest('[data-play],[data-prac]');
  if (!t || swipe.moved) return;
  const i = +(t.dataset.play ?? t.dataset.prac);
  if (i !== lvIdx) { setLvIdx(i); return; }
  Snd.unlock(); Snd.fx('click');
  startLevel(i, t.dataset.prac != null);
});
const swipe = { x: 0, on: false, moved: false };
$('levels').addEventListener('pointerdown', e => { swipe.x = e.clientX; swipe.on = true; swipe.moved = false; });
$('levels').addEventListener('pointermove', e => { if (swipe.on && Math.abs(e.clientX - swipe.x) > 12) swipe.moved = true; });
$('levels').addEventListener('pointerup', e => {
  if (!swipe.on) return;
  swipe.on = false;
  const dx = e.clientX - swipe.x;
  if (Math.abs(dx) > 50) setLvIdx(lvIdx + (dx < 0 ? 1 : -1));
  setTimeout(() => { swipe.moved = false; }, 0);
});
window.addEventListener('keydown', e => {
  if (game.state !== 'levels') return;
  if (e.code === 'ArrowLeft') setLvIdx(lvIdx - 1);
  else if (e.code === 'ArrowRight') setLvIdx(lvIdx + 1);
  else if (e.code === 'Enter' || e.code === 'Space') startLevel(lvIdx, false);
});

function checkRotate() {
  const portrait = H > W * 1.05;
  $('rotate').classList.toggle('show', portrait && !save.portraitOk);
}
function resize() {
  W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight);
  camera.aspect = W / H;
  camera.fov = W / H < 1 ? 62 : 50;
  camera.updateProjectionMatrix();
  setupPost();
  checkRotate();
}
window.addEventListener('resize', () => { clearTimeout(resize._t); resize._t = setTimeout(resize, 120); });

// ================================================================ main loop
const MENU_SONG = { bpm: 112, root: 55, scale: 'major', prog: [0, 4, 5, 3], seed: 21, menu: true };
const autoQ = { samples: [], t: 0 };
let last = performance.now(), fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  U.uTime.value += dt;
  const beat = Snd.beat(), bf = beat - Math.floor(beat);
  U.uPulse.value = Math.exp(-bf * 6) * (game.state === 'play' && !game.dead ? 1 : 0.6);

  let cx = camX;
  if (game.state === 'play') cx = updatePlay(dt);
  else if (game.state === 'paused' || game.state === 'complete') { if (game.state === 'complete') updatePlay(dt); }
  else if (game.state === 'garage') {
    const sx = demo ? demo.ps.x + 6 : 0;
    showroom.position.set(sx, 0, 2);
    showroom.rotation.y += dt * 0.5;
    const portrait = W < H;
    camera.position.set(sx + (portrait ? 0 : 2.9), portrait ? 3.6 : 2.7, portrait ? 13 : 9.4);
    camera.lookAt(sx + (portrait ? 0 : 2.9), portrait ? 0.4 : 1.6, 0);
    cx = sx;
  } else if (demo) cx = updateDemo(dt);

  updatePalette(dt);
  updateEnv(cx, dt);
  updateItems(dt, cx);
  sparks.update(dt, false);
  shards.update(dt, true);
  updateRings(dt);
  composer.render();

  // auto quality: step down when the game runs below ~45 fps during play
  if (game.state === 'play' && save.quality === 'auto') {
    autoQ.samples.push(dt);
    if (autoQ.samples.length >= 150) {
      const avg = autoQ.samples.reduce((a, b) => a + b, 0) / autoQ.samples.length;
      autoQ.samples = [];
      if (avg > 1 / 45 && quality !== 'low') { quality = quality === 'high' ? 'medium' : 'low'; setupPost(); }
    }
  }
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) { if (game.state === 'settings') $('stFps').textContent = `${Math.round(fpsN / fpsAcc)} FPS · calidad ${quality === 'high' ? 'alta' : quality === 'medium' ? 'media' : 'baja'}`; fpsAcc = 0; fpsN = 0; }
}

// ================================================================ boot
async function boot() {
  try { await Promise.race([document.fonts.load('48px "Lilita One"'), new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* fonts optional */ }
  Snd.setVolumes(save.music, save.sfx);
  resize();
  refreshLook();
  setPalette(Core.PAL.blue, true);
  updatePalette(0);
  startDemo();
  window.__neonBooted = true;
  game.state = 'menu';
  updateStats();
  showScreen('menu');
  requestAnimationFrame(t => { last = t; frame(t); });
  // expose a tiny hook for automated checks
  window.__neon = { game, Core, startLevel, input, scene, rig, camera, get vehicles() { return vehicles; }, pause, QUALITY, setupPost, setQ(q) { quality = q; setupPost(); }, objs: { dust, city, floaters, backWall, sky, ground, ceiling, rig, trail: trail.mesh, sparks: sparks.mesh }, get levelGroup() { return levelGroup; }, get level() { return level; }, get quality() { return quality; } };
}
boot();
