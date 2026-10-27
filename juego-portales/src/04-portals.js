// ───────────────────────── portales: colocación, transformaciones y aspecto ─────────────────────────
const GLSL_NOISE = /* glsl */`
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x), u.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
`;
const PORTAL_VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const PORTAL_FS = /* glsl */`
uniform sampler2D tView; uniform vec2 uRes; uniform vec3 uColor; uniform float uTime, uOpen, uLinked, uFallback, uRect;
varying vec2 vUv;
${GLSL_NOISE}
void main(){
  vec2 p = vUv*2.0-1.0;
  float r = length(p);
  vec2 dir = r > 1e-4 ? p/r : vec2(1.0,0.0);
  float n1 = fbm(dir*2.2 + vec2(uTime*0.9, -uTime*0.7));
  float n2 = fbm(dir*4.5 + vec2(-uTime*1.9, uTime*1.4) + r*1.5);
  float edge = uOpen*(0.91 + 0.09*n1);
  if (uRect < 0.5 && r > edge) discard;
  vec3 col;
  if (uLinked > 0.5 && uFallback < 0.5) {
    col = texture2D(tView, gl_FragCoord.xy/uRes).rgb;
  } else {
    float a = atan(p.y, p.x) + r*3.5 - uTime*1.6;
    float sw = fbm(vec2(cos(a), sin(a))*2.0 + r*3.0 + uTime*0.3);
    col = uColor*(0.12 + 1.25*sw*sw) + uColor*0.35*(1.0-r);
  }
  if (uRect < 0.5) {
    float rim = smoothstep(edge-0.17-0.07*n2, edge-0.01, r);
    float hot = smoothstep(edge-0.05, edge, r);
    vec3 rimCol = uColor*(1.3 + 2.4*n2) + mix(uColor, vec3(1.0), 0.35)*hot*1.6;
    col = mix(col, rimCol, rim);
  }
  gl_FragColor = vec4(col, 1.0);
}`;
const HALO_FS = /* glsl */`
uniform vec3 uColor; uniform float uOpen, uTime; varying vec2 vUv;
void main(){
  vec2 p = (vUv*2.0-1.0)*vec2(1.7,1.45);
  float r = length(p);
  float g = exp(-pow(max(r - uOpen*0.96, 0.0)*3.0, 2.0)) * smoothstep(0.5, 0.97, r);
  g *= 0.8 + 0.2*sin(uTime*3.0 + r*9.0);
  gl_FragColor = vec4(uColor*g*0.6*uOpen, 1.0);
}`;
const SPARK_VS = /* glsl */`
attribute float aSeed; uniform float uTime, uOpen, uPix; varying float vA;
void main(){
  float s = aSeed;
  float life = fract(uTime*(0.35+0.3*fract(s*5.3)) + s*7.13);
  float ang = s*6.2831 + uTime*(0.25 + fract(s*3.7)*0.5)*(fract(s*11.0) > 0.5 ? 1.0 : -1.0);
  vec2 e = vec2(cos(ang)*0.65, sin(ang)*1.1)*(0.97 + life*0.22)*uOpen;
  vec3 pos = vec3(e, 0.02 + life*0.45*fract(s*13.7));
  vA = (1.0-life)*smoothstep(0.0, 0.12, life)*uOpen;
  vec4 mv = modelViewMatrix*vec4(pos,1.0);
  gl_PointSize = (1.5 + 3.5*fract(s*31.1))*uPix / max(0.3, -mv.z);
  gl_Position = projectionMatrix*mv;
}`;
const SPARK_FS = /* glsl */`
uniform vec3 uColor; varying float vA;
void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5, 0.0, d)*vA; gl_FragColor = vec4(uColor*3.0*a, 1.0); }`;

class Portal {
  constructor(kind) {
    this.kind = kind;
    this.color = kind === 0 ? BLUE.clone() : ORANGE.clone();
    this.placed = false;
    this.c = v3(); this.n = v3(); this.u = v3(); this.r = v3();
    this.axis = 0; this.sign = 1;
    this.M = new THREE.Matrix4(); this.Minv = new THREE.Matrix4();
    this.open = 0; this.hole = null;
    this.group = new THREE.Group(); this.group.matrixAutoUpdate = false; this.group.visible = false;
    const uniforms = {
      tView: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uColor: { value: this.color },
      uTime: { value: 0 }, uOpen: { value: 0 }, uLinked: { value: 0 }, uFallback: { value: 0 }, uRect: { value: 0 },
    };
    this.uniforms = uniforms;
    this.surfMat = new THREE.ShaderMaterial({ uniforms, vertexShader: PORTAL_VS, fragmentShader: PORTAL_FS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(PORTAL_W, PORTAL_H), this.surfMat);
    this.surface.position.z = 0.012;
    this.innerUniforms = { ...uniforms, uRect: { value: 1 } };
    this.innerMat = new THREE.ShaderMaterial({ uniforms: this.innerUniforms, vertexShader: PORTAL_VS, fragmentShader: PORTAL_FS, side: THREE.BackSide });
    this.inner = new THREE.Mesh(new THREE.BoxGeometry(PORTAL_W, PORTAL_H, 0.7), this.innerMat);
    this.inner.position.z = -0.35 + 0.013; this.inner.visible = false;
    this.haloMat = new THREE.ShaderMaterial({ uniforms: { uColor: uniforms.uColor, uOpen: uniforms.uOpen, uTime: uniforms.uTime }, vertexShader: PORTAL_VS, fragmentShader: HALO_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(PORTAL_W * 1.7, PORTAL_H * 1.45), this.haloMat);
    this.halo.position.z = 0.008; this.halo.renderOrder = 3;
    const N = 90, seeds = new Float32Array(N), pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) seeds[i] = Math.random();
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    sg.boundingSphere = new THREE.Sphere(v3(), 2);
    this.sparkUniforms = { uTime: uniforms.uTime, uOpen: uniforms.uOpen, uColor: uniforms.uColor, uPix: { value: 60 } };
    this.sparks = new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: this.sparkUniforms, vertexShader: SPARK_VS, fragmentShader: SPARK_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.sparks.renderOrder = 4;
    this.light = new THREE.PointLight(this.color, 0, 8, 2);
    this.group.add(this.surface, this.inner, this.halo, this.sparks);
  }
  set(c, n, u) {
    this.c.copy(c); this.n.copy(n); this.u.copy(u);
    this.r.crossVectors(u, n).normalize();
    this.axis = Math.abs(n.x) > 0.5 ? 0 : Math.abs(n.y) > 0.5 ? 1 : 2;
    this.sign = n.getComponent(this.axis) > 0 ? 1 : -1;
    this.M.makeBasis(this.r, this.u, this.n).setPosition(this.c);
    this.Minv.copy(this.M).invert();
    this.group.matrix.copy(this.M); this.group.matrixWorldNeedsUpdate = true;
    this.group.visible = true;
    this.placed = true; this.open = 0;
    this.light.position.copy(c).addScaledVector(n, 0.6);
    this.computeHole();
  }
  clear() { this.placed = false; this.group.visible = false; this.light.intensity = 0; this.hole = null; }
  local(p, out) { out.set(p.x - this.c.x, p.y - this.c.y, p.z - this.c.z); return out.set(out.dot(this.r), out.dot(this.u), out.dot(this.n)); }
  // caja-agujero (para colisiones) detrás del portal; profundidad según el grosor de la pared
  computeHole() {
    let thick = 2;
    const pts = [[0, 0], [-0.55, -0.95], [0.55, -0.95], [-0.55, 0.95], [0.55, 0.95]];
    for (const [a, b] of pts) {
      const p = this.c.clone().addScaledVector(this.r, a).addScaledVector(this.u, b);
      let t = 0.02;
      while (t < 2 && G.staticBoxes.some(bx => pointIn(p.clone().addScaledVector(this.n, -t), bx))) t += 0.04;
      thick = Math.min(thick, t);
    }
    const depth = clamp(thick - 0.06, 0.25, 1.4);
    const lo = v3(Infinity, Infinity, Infinity), hi = v3(-Infinity, -Infinity, -Infinity);
    // la abertura de colisión es algo más ancha que la elipse visible para que entrar no exija precisión milimétrica
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) for (const d of [0.01, -depth]) {
      const p = this.c.clone().addScaledVector(this.r, sa * (PORTAL_W / 2 + 0.12)).addScaledVector(this.u, sb * (PORTAL_H / 2 + 0.06)).addScaledVector(this.n, d);
      lo.min(p); hi.max(p);
    }
    this.hole = { min: lo, max: hi };
  }
}

const ROT_Y_PI = new THREE.Matrix4().makeRotationY(Math.PI);
function computeLinks() {
  const [A, B] = G.portals;
  G.linked = A.placed && B.placed;
  if (!G.linked) return;
  G.T[0].multiplyMatrices(B.M, ROT_Y_PI).multiply(A.Minv);
  G.T[1].multiplyMatrices(A.M, ROT_Y_PI).multiply(B.Minv);
  G.R[0].setFromMatrix4(G.T[0]); G.R[1].setFromMatrix4(G.T[1]);
}
function rebuildCollision() {
  let list = G.staticBoxes;
  if (G.linked) {
    for (const P of G.portals) list = list.flatMap(b => subtractBox(b, P.hole, P));
  }
  G.collide = list;
}
function portalsChanged() {
  computeLinks();
  rebuildCollision();
  for (const P of G.portals) {
    P.uniforms.uLinked.value = G.linked ? 1 : 0;
  }
  updateCrosshair();
}
function clearPortals(silent) {
  let any = false;
  for (const P of G.portals) { if (P.placed) any = true; P.clear(); }
  portalsChanged();
  if (any && !silent) Sound.play('fizzle');
  return any;
}

// rejilla de desplazamientos ordenados por distancia, para buscar un hueco válido cerca del impacto
const NUDGES = (() => {
  const out = [];
  for (let i = -13; i <= 13; i++) for (let j = -13; j <= 13; j++) { const d = Math.hypot(i, j) * 0.1; if (d <= 1.35) out.push([i * 0.1, j * 0.1, d]); }
  return out.sort((a, b) => a[2] - b[2]);
})();

function portalFits(c, n, u, r, axis, sign, near, other) {
  const plane = c.getComponent(axis);
  const p = v3(), q = v3();
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 8; j++) {
    const lx = (i / 6 - 0.5) * (PORTAL_W - 0.06), ly = (j / 8 - 0.5) * (PORTAL_H - 0.06);
    p.copy(c).addScaledVector(r, lx).addScaledVector(u, ly);
    q.copy(p).addScaledVector(n, -0.03);
    let host = false;
    for (const b of near) {
      if (!pointIn(q, b)) continue;
      const face = sign > 0 ? b.max.getComponent(axis) : b.min.getComponent(axis);
      if (Math.abs(face - plane) < 0.015 && isPortalable(b, axis, sign)) host = true;
      else { host = false; break; }
    }
    if (!host) return false;
    q.copy(p).addScaledVector(n, 0.03);
    for (const b of near) if (pointIn(q, b)) return false;
    for (const b of G.dynBlockers) if (pointIn(q, b)) return false;
  }
  if (other && other.placed && other.axis === axis && other.sign === sign && Math.abs(other.c.getComponent(axis) - plane) < 0.02) {
    const ra = rectExtents(c, u, r), rb = rectExtents(other.c, other.u, other.r);
    let overlap = true;
    for (const k of AX) {
      if (k === AX[axis]) continue;
      if (ra.max[k] <= rb.min[k] + 0.02 || ra.min[k] >= rb.max[k] - 0.02) overlap = false;
    }
    if (overlap) return false;
  }
  return true;
}
function rectExtents(c, u, r) {
  const lo = v3(Infinity, Infinity, Infinity), hi = v3(-Infinity, -Infinity, -Infinity);
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const p = c.clone().addScaledVector(r, sa * PORTAL_W / 2).addScaledVector(u, sb * PORTAL_H / 2);
    lo.min(p); hi.max(p);
  }
  return { min: lo, max: hi };
}

// intenta colocar el portal `kind` en el impacto `hit`; devuelve true si lo consigue
function placePortalAt(kind, point, axis, sign, viewDir) {
  const n = v3(); n.setComponent(axis, sign);
  let u;
  if (axis === 1) {
    const f = viewDir.clone(); f.y = 0;
    u = Math.abs(f.x) > Math.abs(f.z) ? v3(Math.sign(f.x) || 1, 0, 0) : v3(0, 0, Math.sign(f.z) || 1);
  } else u = v3(0, 1, 0);
  const r = v3().crossVectors(u, n).normalize();
  const near = G.staticBoxes.filter(b =>
    b.max.x > point.x - 3.2 && b.min.x < point.x + 3.2 && b.max.y > point.y - 3.2 && b.min.y < point.y + 3.2 && b.max.z > point.z - 3.2 && b.min.z < point.z + 3.2);
  const other = G.portals[1 - kind];
  const c = v3();
  let found = null;
  for (const [da, db] of NUDGES) {
    c.copy(point).addScaledVector(r, da).addScaledVector(u, db);
    if (portalFits(c, n, u, r, axis, sign, near, other)) { found = c.clone(); break; }
  }
  if (!found) return false;
  if (axis !== 1) {
    // si el borde inferior queda cerca del suelo, se apoya en él
    let D = Infinity;
    for (const off of [-0.55, 0, 0.55]) {
      const o = found.clone().addScaledVector(u, -PORTAL_H / 2).addScaledVector(r, off).addScaledVector(n, 0.06);
      const h = castRay(o, v3(0, -1, 0), SNAP_DIST + 0.2, { cubes: false });
      if (h) D = Math.min(D, h.t);
    }
    if (D > 0.004 && D < SNAP_DIST) {
      const c2 = found.clone().addScaledVector(u, -(D - 0.002));
      if (portalFits(c2, n, u, r, axis, sign, near, other)) found = c2;
    }
  }
  const P = G.portals[kind];
  P.set(found, n, u);
  portalsChanged();
  unstickBodies(P);
  return true;
}

// tras mover un portal, nadie debe quedar empotrado en la pared que acaba de cerrarse
function unstickBodies() {
  depenetrate(G.player, true);
  for (const cb of G.cubes) if (cb.alive) depenetrate(cb, false);
}

function portalTransformPoint(i, p) { return p.applyMatrix4(G.T[i]); }

// rayo contra las aberturas de los portales (elipses)
function rayPortals(o, d, maxT) {
  if (!G.linked) return null;
  let best = null;
  const tmp = v3();
  for (let i = 0; i < 2; i++) {
    const P = G.portals[i];
    const den = d.dot(P.n);
    if (den > -1e-6) continue;
    const t = tmp.copy(P.c).sub(o).dot(P.n) / den;
    if (t <= 0 || t > maxT || (best && t > best.t)) continue;
    const hp = o.clone().addScaledVector(d, t);
    const l = P.local(hp, v3());
    if ((l.x / (PORTAL_W / 2)) ** 2 + (l.y / (PORTAL_H / 2)) ** 2 <= 1) best = { t, i, point: hp };
  }
  return best;
}

// rayo contra el mundo (sólidos que bloquean disparos)
function castRay(o, d, maxT, opt = {}) {
  let best = null, tmax = maxT;
  const test = (b) => {
    const h = rayBox(o, d, b, tmax);
    if (h) { tmax = h.t; best = { t: h.t, axis: h.axis, sign: h.sign, box: b }; }
  };
  for (const b of G.staticBoxes) if (b.shot) test(b);
  for (const b of G.dynBlockers) test(b);
  if (opt.cubes !== false) {
    for (const cb of G.cubes) {
      if (!cb.alive || cb === opt.ignore) continue;
      const bb = { min: cb.c.clone().sub(cb.h), max: cb.c.clone().add(cb.h) };
      const h = rayBox(o, d, bb, tmax);
      if (h) { tmax = h.t; best = { t: h.t, axis: h.axis, sign: h.sign, cube: cb }; }
    }
  }
  if (best) best.point = o.clone().addScaledVector(d, best.t);
  return best;
}
