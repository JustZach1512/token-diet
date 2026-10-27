// CPU-simulated point sprites (sparks, fire, blood, flare, entity ash) with fog.
import * as THREE from 'three';

const VERT = /* glsl */`
attribute float size;
attribute float alpha;
attribute vec3 pcolor;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  vColor = pcolor;
  vAlpha = alpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform sampler2D map;
uniform float uAdditive;
varying vec3 vColor;
varying float vAlpha;
#include <fog_pars_fragment>
void main() {
  float a = texture2D(map, gl_PointCoord).a * vAlpha;
  if (a < 0.003) discard;
  vec3 col = vColor;
  float ff = 0.0;
  vec3 fogC = vec3(0.0);
  #ifdef FOG_EXP2
    ff = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    fogC = fogColor;
  #endif
  if (uAdditive > 0.5) {
    gl_FragColor = vec4(col * a * (1.0 - ff), 1.0);
  } else {
    gl_FragColor = vec4(mix(col, fogC, ff), a);
  }
}`;

export class Particles {
  constructor(scene, max, additive, map) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ life: 0 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: map }, uScale: { value: 400 }, uAdditive: { value: additive ? 1 : 0 } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    this.mat.uniforms.map.value = map;
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.tmp = new THREE.Color();
  }

  spawn(o) {
    let slot = null;
    for (let k = 0; k < 8; k++) {
      const i = (this.cursor = ((this.cursor || 0) + 1) % this.max);
      if (this.p[i].life <= 0) { slot = this.p[i]; break; }
    }
    if (!slot) slot = this.p[(this.cursor = ((this.cursor || 0) + 1) % this.max)];
    slot.x = o.x; slot.y = o.y; slot.z = o.z;
    slot.vx = o.vx || 0; slot.vy = o.vy || 0; slot.vz = o.vz || 0;
    slot.life = slot.max = o.life || 1;
    slot.s0 = o.size ?? 0.3; slot.s1 = o.size1 ?? slot.s0;
    slot.a0 = o.alpha ?? 1; slot.a1 = o.alpha1 ?? 0;
    this.tmp.set(o.color ?? 0xffffff);
    slot.r = this.tmp.r; slot.g = this.tmp.g; slot.b = this.tmp.b;
    if (o.color1 !== undefined) { this.tmp.set(o.color1); slot.r1 = this.tmp.r; slot.g1 = this.tmp.g; slot.b1 = this.tmp.b; }
    else { slot.r1 = slot.r; slot.g1 = slot.g; slot.b1 = slot.b; }
    slot.grav = o.gravity ?? 0;
    slot.drag = o.drag ?? 0;
    slot.floor = o.floor ?? -1;
  }

  burst(n, f) { for (let i = 0; i < n; i++) this.spawn(f(i)); }

  update(dt, scale) {
    this.mat.uniforms.uScale.value = scale;
    let n = 0;
    const P = this.pos, C = this.col, S = this.size, A = this.alpha;
    for (const p of this.p) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.grav * dt;
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor > -1 && p.y < p.floor) { p.y = p.floor; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
      const t = 1 - p.life / p.max;
      P[n * 3] = p.x; P[n * 3 + 1] = p.y; P[n * 3 + 2] = p.z;
      C[n * 3] = p.r + (p.r1 - p.r) * t; C[n * 3 + 1] = p.g + (p.g1 - p.g) * t; C[n * 3 + 2] = p.b + (p.b1 - p.b) * t;
      S[n] = p.s0 + (p.s1 - p.s0) * t;
      A[n] = p.a0 + (p.a1 - p.a0) * t;
      n++;
    }
    this.n = n;
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'pcolor', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }

  dispose() {
    this.points.parent?.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
  }
}
