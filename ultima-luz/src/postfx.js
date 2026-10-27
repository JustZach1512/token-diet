// Bloom + cinematic grade (vignette, grain, chromatic aberration, terror tint).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    terror: { value: 0 },
    damage: { value: 0 },
    desat: { value: 0 },
    blind: { value: 0 },
    grain: { value: 0.05 },
    tint: { value: new THREE.Color(1, 1, 1) },
    res: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time, terror, damage, desat, blind, grain;
    uniform vec3 tint;
    uniform vec2 res;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      float ab = 0.0015 + terror * 0.006 + damage * 0.01;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), desat);
      col *= tint;
      vec3 shadows = col * vec3(0.9, 1.0, 1.1);
      vec3 highs = col * vec3(1.08, 1.0, 0.9);
      col = mix(shadows, highs, smoothstep(0.15, 0.7, l));
      col = (col - 0.5) * 1.06 + 0.5;
      float vig = smoothstep(0.9, 0.18, r2 * (1.15 + terror * 1.5));
      col *= mix(0.32, 1.0, vig);
      float edge = (1.0 - vig);
      col = mix(col, col * vec3(1.5, 0.35, 0.35) + vec3(0.16, 0.0, 0.0), clamp(edge * terror * 0.95 + damage * 0.7, 0.0, 1.0));
      col += (rand(uv * res + fract(time * 7.3) * 91.0) - 0.5) * grain;
      col = mix(col, vec3(1.0, 0.98, 0.92), blind);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.q = quality;
    this.enabled = !!quality.post;
    this.u = { terror: 0, damage: 0, desat: 0, blind: 0 };
    if (!this.enabled) return;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x * pr), Math.max(1, size.y * pr), {
      type: THREE.HalfFloatType, samples: quality.id === 'alta' ? 4 : 0,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    if (quality.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.85, 0.65, 0.82);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(w, h, pr) {
    if (!this.enabled) return;
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.grade.uniforms.res.value.set(w * pr, h * pr);
  }

  render(scene, camera, t, nightmare = false) {
    if (!this.enabled) { this.renderer.render(scene, camera); return; }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    const U = this.grade.uniforms;
    U.time.value = t;
    U.terror.value = this.u.terror;
    U.damage.value = this.u.damage;
    U.desat.value = this.u.desat;
    U.blind.value = this.u.blind;
    U.tint.value.setRGB(nightmare ? 1.08 : 0.97, nightmare ? 0.9 : 1.0, nightmare ? 0.88 : 1.05);
    this.composer.render();
  }

  dispose() {
    if (!this.enabled) return;
    this.composer.dispose?.();
    this.bloom?.dispose?.();
  }
}
