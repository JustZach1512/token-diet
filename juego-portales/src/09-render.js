// ───────────────────────── render: pasadas de portal, bloom y composición final ─────────────────────────
const FS_VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BRIGHT_FS = /* glsl */`
uniform sampler2D tSrc; uniform float uThreshold, uKnee; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0*uKnee);
  soft = soft*soft/(4.0*uKnee + 1e-4);
  float k = max(soft, br - uThreshold)/max(br, 1e-4);
  gl_FragColor = vec4(min(c*k, vec3(40.0)), 1.0);
}`;
const DOWN_FS = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 s = texture2D(tSrc, vUv).rgb*4.0;
  s += texture2D(tSrc, vUv + uTexel*vec2(-1.0,-1.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel*vec2( 1.0,-1.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel*vec2(-1.0, 1.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel*vec2( 1.0, 1.0)).rgb;
  gl_FragColor = vec4(s/8.0, 1.0);
}`;
const UP_FS = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uScale; varying vec2 vUv;
void main(){
  vec2 t = uTexel;
  vec3 s = texture2D(tSrc, vUv + vec2(-t.x*2.0, 0.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(-t.x, t.y)).rgb*2.0;
  s += texture2D(tSrc, vUv + vec2(0.0, t.y*2.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(t.x, t.y)).rgb*2.0;
  s += texture2D(tSrc, vUv + vec2(t.x*2.0, 0.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(t.x, -t.y)).rgb*2.0;
  s += texture2D(tSrc, vUv + vec2(0.0, -t.y*2.0)).rgb;
  s += texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb*2.0;
  gl_FragColor = vec4(s/12.0*uScale, 1.0);
}`;
const COMP_FS = /* glsl */`
uniform sampler2D tScene, tBloom; uniform float uBloom, uTime, uExposure, uFlash, uVig, uAberr;
uniform vec3 uFlashColor; uniform vec2 uRes; varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  vec2 off = d*uAberr*r2;
  vec3 col;
  col.r = texture2D(tScene, vUv - off).r;
  col.g = texture2D(tScene, vUv).g;
  col.b = texture2D(tScene, vUv + off).b;
  col += texture2D(tBloom, vUv).rgb*uBloom;
  col *= uExposure;
  col = aces(col);
  col *= mix(1.0, smoothstep(0.9, 0.18, length(d*vec2(1.0, 0.85))), uVig);
  col = toSRGB(col);
  col += (h(vUv*uRes + fract(uTime)*91.7) - 0.5)*0.018;
  col = mix(col, uFlashColor, uFlash);
  gl_FragColor = vec4(col, 1.0);
}`;
const DUST_VS = /* glsl */`
uniform float uTime, uPix; attribute float aSeed; varying float vA;
void main(){
  vec3 p = position;
  p.x += sin(uTime*0.11 + aSeed*40.0)*0.6;
  p.y += sin(uTime*0.07 + aSeed*17.0)*0.4;
  p.z += cos(uTime*0.09 + aSeed*29.0)*0.6;
  vec4 mv = modelViewMatrix*vec4(p, 1.0);
  vA = 0.25 + 0.75*fract(aSeed*7.7);
  gl_PointSize = (0.6 + fract(aSeed*13.0)*1.4)*uPix/max(0.5, -mv.z);
  gl_Position = projectionMatrix*mv;
}`;
const DUST_FS = /* glsl */`varying float vA; void main(){ float d = length(gl_PointCoord-0.5); gl_FragColor = vec4(vec3(0.5,0.55,0.6)*smoothstep(0.5,0.0,d)*vA*0.35, 1.0); }`;

const R = {
  quality: 'high', ready: false, w: 1, h: 1, pr: 1,
};
function fsQuad(fs, uniforms, blending = THREE.NoBlending) {
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: FS_VS, fragmentShader: fs, depthTest: false, depthWrite: false, blending });
  return m;
}
function initRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.autoClear = false;
  R.renderer = renderer;
  R.quadScene = new THREE.Scene();
  R.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  R.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  R.quad.frustumCulled = false;
  R.quadScene.add(R.quad);
  R.brightMat = fsQuad(BRIGHT_FS, { tSrc: { value: null }, uThreshold: { value: 1.0 }, uKnee: { value: 0.6 } });
  R.downMat = fsQuad(DOWN_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  R.upMat = fsQuad(UP_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uScale: { value: 1 } }, THREE.AdditiveBlending);
  R.compMat = fsQuad(COMP_FS, {
    tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.75 }, uTime: { value: 0 }, uExposure: { value: 1.0 },
    uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(0.6, 0, 0) }, uVig: { value: 0.55 }, uAberr: { value: 0.004 }, uRes: { value: new THREE.Vector2(1, 1) },
  });
  R.virtualCam = new THREE.PerspectiveCamera();
  R.virtualCam.matrixAutoUpdate = false; R.virtualCam.matrixWorldAutoUpdate = false;
  R.clipPlane = new THREE.Plane();
  R.ready = true;
}
function makeRT(w, h, samples) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type: THREE.HalfFloatType, samples, depthBuffer: true, colorSpace: THREE.LinearSRGBColorSpace });
}
function setQuality(q) {
  R.quality = q;
  resize(true);
  if (G.sun) G.sun.castShadow = q === 'high';
  for (const m of [MAT.white, MAT.metal, MAT.floor]) m.needsUpdate = true;
}
function resize(force) {
  const r = R.renderer;
  const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
  const pr = R.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 1.5) : Math.min(window.devicePixelRatio || 1, 1) * 0.75;
  if (!force && w === R.w && h === R.h && pr === R.pr) return;
  R.w = w; R.h = h; R.pr = pr;
  r.setPixelRatio(pr); r.setSize(w, h, false);
  const W = Math.floor(w * pr), H = Math.floor(h * pr);
  R.W = W; R.H = H;
  const samples = R.quality === 'high' ? 4 : 0;
  for (const k of ['sceneRT', 'rtA', 'rtB']) if (R[k]) R[k].dispose();
  R.sceneRT = makeRT(W, H, samples);
  const ps = R.quality === 'high' ? 1 : 0.6;
  R.rtA = makeRT(Math.floor(W * ps), Math.floor(H * ps), samples ? 2 : 0);
  R.rtB = makeRT(Math.floor(W * ps), Math.floor(H * ps), samples ? 2 : 0);
  if (R.mips) R.mips.forEach(m => m.dispose());
  R.mips = [];
  let mw = W >> 1, mh = H >> 1;
  for (let i = 0; i < 6; i++) {
    R.mips.push(new THREE.WebGLRenderTarget(Math.max(1, mw), Math.max(1, mh), { type: THREE.HalfFloatType, depthBuffer: false }));
    mw >>= 1; mh >>= 1;
  }
  if (G.portals) {
    G.portals[0].uniforms.tView.value = R.rtA.texture; G.portals[1].uniforms.tView.value = R.rtB.texture;
    for (const P of G.portals) P.uniforms.uRes.value.set(W, H);
  }
  if (G.camera) { G.camera.aspect = w / h; G.camera.updateProjectionMatrix(); }
  if (G.gunCam) { G.gunCam.aspect = w / h; G.gunCam.updateProjectionMatrix(); }
  R.compMat.uniforms.uRes.value.set(W, H);
}
function blit(mat, target) {
  R.quad.material = mat;
  R.renderer.setRenderTarget(target);
  R.renderer.render(R.quadScene, R.quadCam);
}
function setObliqueClip(cam, plane) {
  const p = R.clipPlane.copy(plane).applyMatrix4(cam.matrixWorldInverse);
  const e = cam.projectionMatrix.elements;
  const cp = new THREE.Vector4(p.normal.x, p.normal.y, p.normal.z, p.constant);
  const q = new THREE.Vector4(
    (Math.sign(cp.x) + e[8]) / e[0],
    (Math.sign(cp.y) + e[9]) / e[5],
    -1.0,
    (1.0 + e[10]) / e[14]);
  cp.multiplyScalar(2.0 / cp.dot(q));
  e[2] = cp.x; e[6] = cp.y; e[10] = cp.z + 1.0; e[14] = cp.w;
}
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sphere = new THREE.Sphere();
function portalVisible(P, cam) {
  if (_tmpEye.copy(cam.position).sub(P.c).dot(P.n) < 0.0) return false;
  _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pm);
  return _frustum.intersectsSphere(_sphere.set(P.c, 1.4));
}
const _tmpEye = v3();

function renderFrame() {
  const r = R.renderer, cam = G.camera, scene = G.scene;
  scene.updateMatrixWorld();
  scene.matrixWorldAutoUpdate = false;
  cam.updateMatrixWorld();
  r.shadowMap.needsUpdate = true;
  const rts = [R.rtA, R.rtB];
  // 1) vistas a través de cada portal
  for (const P of G.portals) { P.uniforms.uFallback.value = 1; P.inner.visible = false; }
  G.bodyModel.visible = G.mode === 'play' && G.player.alive;
  const vc = R.virtualCam;
  for (let i = 0; i < 2; i++) {
    const P = G.portals[i], Q = G.portals[1 - i];
    P.drawn = false;
    if (!G.linked || P.open < 0.02 || !portalVisible(P, cam)) continue;
    vc.fov = cam.fov; vc.aspect = cam.aspect; vc.near = cam.near; vc.far = cam.far;
    vc.projectionMatrix.copy(cam.projectionMatrix);
    vc.matrixWorld.multiplyMatrices(G.T[i], cam.matrixWorld);
    vc.matrixWorldInverse.copy(vc.matrixWorld).invert();
    vc.position.setFromMatrixPosition(vc.matrixWorld);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(Q.n, Q.c.clone().addScaledVector(Q.n, 0.004));
    setObliqueClip(vc, plane);
    r.setRenderTarget(rts[i]);
    r.setClearColor(0x05070a, 1); r.clear();
    r.render(scene, vc);
    P.drawn = true;
  }
  // 2) vista principal
  G.bodyModel.visible = false;
  for (const P of G.portals) {
    P.uniforms.uFallback.value = P.drawn ? 0 : 1;
    if (P.placed && P.drawn) {
      const l = P.local(cam.position, v3());
      P.inner.visible = l.z > -0.05 && l.z < 0.6 && Math.abs(l.x) < PORTAL_W / 2 + 0.15 && Math.abs(l.y) < PORTAL_H / 2 + 0.15;
    }
  }
  r.setRenderTarget(R.sceneRT);
  r.setClearColor(0x05070a, 1); r.clear();
  r.render(scene, cam);
  if (G.gun.visible) { r.clearDepth(); r.render(G.gunScene, G.gunCam); }
  scene.matrixWorldAutoUpdate = true;
  // 3) bloom
  const U = R.compMat.uniforms;
  if (R.quality === 'high') {
    R.brightMat.uniforms.tSrc.value = R.sceneRT.texture;
    blit(R.brightMat, R.mips[0]);
    for (let i = 1; i < R.mips.length; i++) {
      R.downMat.uniforms.tSrc.value = R.mips[i - 1].texture;
      R.downMat.uniforms.uTexel.value.set(1 / R.mips[i - 1].width, 1 / R.mips[i - 1].height);
      blit(R.downMat, R.mips[i]);
    }
    for (let i = R.mips.length - 2; i >= 0; i--) {
      R.upMat.uniforms.tSrc.value = R.mips[i + 1].texture;
      R.upMat.uniforms.uTexel.value.set(1 / R.mips[i + 1].width, 1 / R.mips[i + 1].height);
      R.upMat.uniforms.uScale.value = 1.0;
      blit(R.upMat, R.mips[i]);
    }
    U.tBloom.value = R.mips[0].texture; U.uBloom.value = 0.42;
  } else { U.tBloom.value = R.mips[0].texture; U.uBloom.value = 0; }
  U.tScene.value = R.sceneRT.texture;
  U.uTime.value = G.time;
  U.uExposure.value = damp(U.uExposure.value, G.mode === 'menu' ? 0.72 : 1.0, 3, 1 / 60);
  blit(R.compMat, null);
}
