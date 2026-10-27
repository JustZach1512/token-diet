// ───────────────────────── texturas procedurales y materiales ─────────────────────────
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
// mapa de normales (tangente) a partir de un mapa de alturas en escala de grises
function normalFromHeight(hc, strength) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = mkCanvas(w, h), ctx = out.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  const H = (x, y) => src[((((y + h) % h) * w) + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
let MAX_ANISO = 4;
function tex(canvas, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MAX_ANISO;
  return t;
}
function grey(ctx, v, a = 1) { ctx.fillStyle = a === 1 ? `rgb(${v},${v},${v})` : `rgba(${v},${v},${v},${a})`; }

// panel blanco (portalable). La textura cubre 2×2 m: 4 paneles de 1 m.
function makeWhiteSet() {
  const S = 512, P = 256, gap = 5, rnd = mulberry(11);
  const a = mkCanvas(S, S), ac = a.getContext('2d');
  const hm = mkCanvas(S, S), hc = hm.getContext('2d');
  const rm = mkCanvas(S, S), rc = rm.getContext('2d');
  ac.fillStyle = '#4d545c'; ac.fillRect(0, 0, S, S);
  grey(hc, 0); hc.fillRect(0, 0, S, S);
  rc.fillStyle = 'rgb(0,235,0)'; rc.fillRect(0, 0, S, S);
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
    const x = px * P + gap, y = py * P + gap, w = P - gap * 2, h = P - gap * 2;
    const b = 226 + Math.floor(rnd() * 12 - 6);
    const g = ac.createLinearGradient(x, y, x + w * 0.7, y + h);
    g.addColorStop(0, `rgb(${b + 8},${b + 10},${b + 12})`);
    g.addColorStop(1, `rgb(${b - 14},${b - 12},${b - 9})`);
    ac.fillStyle = g; rrect(ac, x, y, w, h, 7); ac.fill();
    for (let k = 0; k < 7; k++) { grey(hc, Math.round(70 + 185 * (k + 1) / 7)); rrect(hc, x + k, y + k, w - 2 * k, h - 2 * k, 7); hc.fill(); }
    const rv = 70 + Math.floor(rnd() * 30);
    rc.fillStyle = `rgb(0,${rv},0)`; rrect(rc, x + 2, y + 2, w - 4, h - 4, 6); rc.fill();
    // ligera suciedad en la parte baja del panel
    const gg = ac.createLinearGradient(0, y + h * 0.65, 0, y + h);
    gg.addColorStop(0, 'rgba(70,60,50,0)'); gg.addColorStop(1, `rgba(70,60,50,${0.05 + rnd() * 0.06})`);
    ac.fillStyle = gg; rrect(ac, x, y, w, h, 7); ac.fill();
  }
  for (let i = 0; i < 9000; i++) {
    ac.fillStyle = `rgba(30,35,40,${rnd() * 0.05})`;
    ac.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  for (let i = 0; i < 2500; i++) {
    rc.fillStyle = `rgba(0,${150 + rnd() * 100},0,0.15)`;
    rc.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  return { map: tex(a), normalMap: tex(normalFromHeight(hm, 3.2), false), roughnessMap: tex(rm, false) };
}

// panel metálico oscuro (no portalable)
function makeMetalSet() {
  const S = 512, rnd = mulberry(23);
  const a = mkCanvas(S, S), ac = a.getContext('2d');
  const hm = mkCanvas(S, S), hc = hm.getContext('2d');
  const rm = mkCanvas(S, S), rc = rm.getContext('2d');
  ac.fillStyle = '#15181c'; ac.fillRect(0, 0, S, S);
  grey(hc, 0); hc.fillRect(0, 0, S, S);
  rc.fillStyle = 'rgb(0,240,0)'; rc.fillRect(0, 0, S, S);
  const cols = 2, rows = 2, PW = S / cols, PH = S / rows, gap = 4;
  for (let py = 0; py < rows; py++) for (let px = 0; px < cols; px++) {
    const x = px * PW + gap, y = py * PH + gap, w = PW - gap * 2, h = PH - gap * 2;
    const b = 84 + Math.floor(rnd() * 14);
    ac.fillStyle = `rgb(${b},${b + 5},${b + 11})`; ac.fillRect(x, y, w, h);
    for (let i = 0; i < 260; i++) {
      const yy = y + rnd() * h;
      ac.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},255,${rnd() * 0.035})`;
      ac.fillRect(x, yy, w, 1);
    }
    // marco interior
    ac.strokeStyle = 'rgba(0,0,0,0.35)'; ac.lineWidth = 3; ac.strokeRect(x + 18, y + 18, w - 36, h - 36);
    ac.strokeStyle = 'rgba(255,255,255,0.06)'; ac.lineWidth = 1; ac.strokeRect(x + 20, y + 20, w - 40, h - 40);
    for (let k = 0; k < 4; k++) { grey(hc, 120 + k * 30); hc.fillRect(x + k, y + k, w - 2 * k, h - 2 * k); }
    grey(hc, 165); hc.fillRect(x + 16, y + 16, w - 32, h - 32);
    grey(hc, 200); hc.fillRect(x + 21, y + 21, w - 42, h - 42);
    rc.fillStyle = `rgb(0,${110 + Math.floor(rnd() * 40)},0)`; rc.fillRect(x, y, w, h);
    // remaches
    for (const [bx, by] of [[x + 9, y + 9], [x + w - 9, y + 9], [x + 9, y + h - 9], [x + w - 9, y + h - 9]]) {
      const g = ac.createRadialGradient(bx - 1, by - 1, 0, bx, by, 5);
      g.addColorStop(0, '#9aa3ad'); g.addColorStop(1, '#2a2f35');
      ac.fillStyle = g; ac.beginPath(); ac.arc(bx, by, 4.5, 0, Math.PI * 2); ac.fill();
      grey(hc, 255); hc.beginPath(); hc.arc(bx, by, 4, 0, Math.PI * 2); hc.fill();
    }
  }
  for (let i = 0; i < 40; i++) { // arañazos
    ac.strokeStyle = `rgba(200,210,220,${0.03 + rnd() * 0.05})`; ac.lineWidth = 1;
    const x = rnd() * S, y = rnd() * S, l = 10 + rnd() * 50, ang = rnd() * Math.PI;
    ac.beginPath(); ac.moveTo(x, y); ac.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); ac.stroke();
  }
  return { map: tex(a), normalMap: tex(normalFromHeight(hm, 2.2), false), roughnessMap: tex(rm, false) };
}

// baldosas de suelo oscuras de 0,5 m
function makeFloorSet() {
  const S = 512, T = 128, gap = 3, rnd = mulberry(5);
  const a = mkCanvas(S, S), ac = a.getContext('2d');
  const hm = mkCanvas(S, S), hc = hm.getContext('2d');
  const rm = mkCanvas(S, S), rc = rm.getContext('2d');
  ac.fillStyle = '#121417'; ac.fillRect(0, 0, S, S);
  grey(hc, 0); hc.fillRect(0, 0, S, S);
  rc.fillStyle = 'rgb(0,240,0)'; rc.fillRect(0, 0, S, S);
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
    const x = tx * T + gap, y = ty * T + gap, w = T - gap * 2, h = T - gap * 2;
    const b = 64 + Math.floor(rnd() * 16);
    const g = ac.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, `rgb(${b + 8},${b + 10},${b + 13})`); g.addColorStop(1, `rgb(${b - 6},${b - 4},${b})`);
    ac.fillStyle = g; ac.fillRect(x, y, w, h);
    ac.strokeStyle = 'rgba(255,255,255,0.05)'; ac.lineWidth = 1; ac.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    for (let k = 0; k < 3; k++) { grey(hc, 140 + k * 50); hc.fillRect(x + k, y + k, w - 2 * k, h - 2 * k); }
    rc.fillStyle = `rgb(0,${130 + Math.floor(rnd() * 50)},0)`; rc.fillRect(x, y, w, h);
    if ((tx + ty) % 2 === 0) { // patrón antideslizante
      ac.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) ac.fillRect(x + 12 + i * 18, y + 12 + j * 18, 6, 2);
      grey(hc, 255, 0.5);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) hc.fillRect(x + 12 + i * 18, y + 12 + j * 18, 6, 2);
    }
  }
  for (let i = 0; i < 7000; i++) { ac.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`; ac.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 3); }
  return { map: tex(a), normalMap: tex(normalFromHeight(hm, 2.0), false), roughnessMap: tex(rm, false) };
}

function makeStripes() {
  const c = mkCanvas(256, 64), x = c.getContext('2d');
  x.fillStyle = '#e8b20a'; x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#17181a';
  for (let i = -2; i < 10; i++) { x.beginPath(); x.moveTo(i * 32, 64); x.lineTo(i * 32 + 16, 64); x.lineTo(i * 32 + 48, 0); x.lineTo(i * 32 + 32, 0); x.fill(); }
  return tex(c);
}

function makeCubeTextures(companion) {
  const S = 256, a = mkCanvas(S, S), ac = a.getContext('2d'), e = mkCanvas(S, S), ec = e.getContext('2d');
  const g = ac.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#d9dde1'); g.addColorStop(1, '#a9b0b7');
  ac.fillStyle = g; ac.fillRect(0, 0, S, S);
  ec.fillStyle = '#000'; ec.fillRect(0, 0, S, S);
  ac.fillStyle = '#3b4148';
  const k = 62, t = 22;
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [S, 0, -1, 1], [0, S, 1, -1], [S, S, -1, -1]]) {
    ac.beginPath(); ac.moveTo(cx, cy); ac.lineTo(cx + sx * k, cy); ac.lineTo(cx + sx * k, cy + sy * t);
    ac.lineTo(cx + sx * t, cy + sy * t); ac.lineTo(cx + sx * t, cy + sy * k); ac.lineTo(cx, cy + sy * k); ac.closePath(); ac.fill();
  }
  ac.strokeStyle = '#7d858d'; ac.lineWidth = 4; ac.strokeRect(30, 30, S - 60, S - 60);
  ac.fillStyle = '#5a616a'; ac.beginPath(); ac.arc(S / 2, S / 2, 66, 0, Math.PI * 2); ac.fill();
  ac.fillStyle = '#c9ced3'; ac.beginPath(); ac.arc(S / 2, S / 2, 52, 0, Math.PI * 2); ac.fill();
  if (companion) {
    const heart = (ctx) => {
      ctx.beginPath(); const cx = S / 2, cy = S / 2 + 6;
      ctx.moveTo(cx, cy + 26);
      ctx.bezierCurveTo(cx - 44, cy - 6, cx - 22, cy - 40, cx, cy - 18);
      ctx.bezierCurveTo(cx + 22, cy - 40, cx + 44, cy - 6, cx, cy + 26); ctx.fill();
    };
    ac.fillStyle = '#e8649a'; heart(ac);
    ec.fillStyle = '#ff6fa8'; heart(ec);
  } else {
    ac.strokeStyle = '#9ea6ae'; ac.lineWidth = 10; ac.beginPath(); ac.arc(S / 2, S / 2, 30, 0, Math.PI * 2); ac.stroke();
    ec.strokeStyle = '#fff'; ec.lineWidth = 9; ec.beginPath(); ec.arc(S / 2, S / 2, 30, 0, Math.PI * 2); ec.stroke();
  }
  ec.strokeStyle = '#fff'; ec.lineWidth = 3; ec.beginPath(); ec.arc(S / 2, S / 2, 59, 0, Math.PI * 2); ec.stroke();
  return { map: tex(a, true, false), emissiveMap: tex(e, true, false) };
}

function makeSoftDot() {
  const c = mkCanvas(64, 64), x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return tex(c, false, false);
}

// pictogramas de las señales de cámara
function drawIcon(ctx, kind, x, y, s, on) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 100, s / 100);
  ctx.fillStyle = on ? '#14171b' : '#c3c8cd'; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  rrect(ctx, 0, 0, 100, 100, 12); ctx.fill();
  ctx.fillStyle = on ? '#eef0f2' : '#eef0f2'; ctx.strokeStyle = ctx.fillStyle;
  switch (kind) {
    case 'portal':
      ctx.lineWidth = 9; ctx.beginPath(); ctx.ellipse(34, 50, 14, 30, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(70, 50, 14, 30, 0, 0, Math.PI * 2); ctx.stroke(); break;
    case 'cube':
      ctx.fillRect(26, 34, 40, 40); ctx.beginPath(); ctx.moveTo(26, 34); ctx.lineTo(40, 22); ctx.lineTo(80, 22); ctx.lineTo(66, 34); ctx.fill();
      ctx.beginPath(); ctx.moveTo(66, 34); ctx.lineTo(80, 22); ctx.lineTo(80, 62); ctx.lineTo(66, 74); ctx.fill(); break;
    case 'button':
      ctx.fillRect(18, 66, 64, 10); ctx.beginPath(); ctx.ellipse(50, 60, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(50, 22); ctx.lineTo(50, 44); ctx.stroke(); ctx.beginPath(); ctx.moveTo(40, 36); ctx.lineTo(50, 46); ctx.lineTo(60, 36); ctx.stroke(); break;
    case 'goo':
      ctx.beginPath(); ctx.moveTo(14, 58); for (let i = 0; i <= 72; i += 6) ctx.lineTo(14 + i, 58 + Math.sin(i * 0.17) * 6); ctx.lineTo(86, 84); ctx.lineTo(14, 84); ctx.fill();
      ctx.beginPath(); ctx.arc(50, 30, 10, 0, Math.PI * 2); ctx.fill(); break;
    case 'fling':
      ctx.beginPath(); ctx.moveTo(18, 80); ctx.quadraticCurveTo(30, 20, 80, 34); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(66, 24); ctx.lineTo(82, 34); ctx.lineTo(68, 46); ctx.stroke(); break;
    case 'pellet':
      ctx.beginPath(); ctx.arc(50, 50, 14, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 8; i++) { const a2 = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(50 + Math.cos(a2) * 24, 50 + Math.sin(a2) * 24); ctx.lineTo(50 + Math.cos(a2) * 34, 50 + Math.sin(a2) * 34); ctx.stroke(); } break;
    case 'fizzler':
      ctx.lineWidth = 6; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(24 + i * 13, 18); ctx.lineTo(24 + i * 13, 82); ctx.stroke(); }
      ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(20, 80); ctx.lineTo(80, 20); ctx.stroke(); break;
    case 'timer':
      ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(50, 54, 28, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(50, 54); ctx.lineTo(50, 36); ctx.stroke(); ctx.beginPath(); ctx.moveTo(50, 54); ctx.lineTo(62, 62); ctx.stroke();
      ctx.fillRect(42, 14, 16, 8); break;
  }
  ctx.restore();
}
const FONT_DISPLAY = '"Saira Condensed", "Arial Narrow", sans-serif';
const FONT_BODY = '"Barlow", "Segoe UI", sans-serif';

function makeChamberSign(num, total, name, icons) {
  const W = 512, H = 1024, c = mkCanvas(W, H), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f4f5f6'); g.addColorStop(1, '#dfe2e5');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#14171b';
  x.font = `800 300px ${FONT_DISPLAY}`; x.textBaseline = 'alphabetic';
  x.fillText(num, 34, 300);
  x.font = `600 46px ${FONT_DISPLAY}`;
  x.fillText(`${num}/${total}`, 40, 370);
  x.fillRect(36, 392, W - 72, 5);
  for (let i = 0; i < 10; i++) { x.globalAlpha = i < Math.round(10 * Number(num) / Number(total)) ? 1 : 0.18; x.fillRect(38 + i * 44, 412, 32, 14); }
  x.globalAlpha = 1;
  const all = ['portal', 'cube', 'button', 'goo', 'fling', 'pellet', 'fizzler', 'timer'];
  all.forEach((k, i) => drawIcon(x, k, 38 + (i % 4) * 112, 470 + Math.floor(i / 4) * 112, 96, icons.includes(k)));
  x.fillRect(36, 720, W - 72, 3);
  x.font = `700 58px ${FONT_DISPLAY}`;
  x.fillText(name.toUpperCase(), 38, 800);
  x.font = `500 30px ${FONT_BODY}`; x.fillStyle = '#4a5159';
  x.fillText('Centro de Ensayos Umbral', 40, 950);
  x.font = `700 30px ${FONT_DISPLAY}`; x.fillStyle = '#14171b'; x.fillText('UMBRAL', W - 150, 950);
  return tex(c, true, false);
}

function makeExitSign() {
  const c = mkCanvas(512, 160), x = c.getContext('2d');
  x.fillStyle = '#0d1013'; x.fillRect(0, 0, 512, 160);
  x.fillStyle = '#fff'; x.font = `700 92px ${FONT_DISPLAY}`; x.textBaseline = 'middle';
  x.fillText('SALIDA', 40, 84);
  x.beginPath(); x.moveTo(410, 50); x.lineTo(470, 80); x.lineTo(410, 110); x.closePath(); x.fill();
  return tex(c, true, false);
}

function makeEnvMap(renderer) {
  // pequeña sala con paneles de luz para los reflejos (PMREM)
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 30), new THREE.MeshBasicMaterial({ color: 0x1c2229, side: THREE.BackSide }));
  room.position.y = 5; s.add(room);
  const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6.2, 6.6) });
  for (let i = -2; i <= 2; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 18), lm); p.position.set(i * 5, 11.8, 0); s.add(p);
  }
  const wall = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.58, 0.62) });
  const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 6, 26), wall); w1.position.set(-14.8, 3, 0); s.add(w1);
  const w2 = w1.clone(); w2.position.x = 14.8; s.add(w2);
  const fl = new THREE.Mesh(new THREE.BoxGeometry(30, 0.2, 30), new THREE.MeshBasicMaterial({ color: 0x0c0e11 })); fl.position.y = -1.9; s.add(fl);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.035);
  pm.dispose();
  return rt.texture;
}

const MAT = {};
const TEX = {};
function buildMaterials(renderer) {
  MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  TEX.white = makeWhiteSet(); TEX.metal = makeMetalSet(); TEX.floor = makeFloorSet();
  TEX.stripes = makeStripes(); TEX.dot = makeSoftDot();
  TEX.cube = makeCubeTextures(false); TEX.companion = makeCubeTextures(true);
  TEX.exit = makeExitSign();
  MAT.white = new THREE.MeshStandardMaterial({ ...TEX.white, roughness: 1, metalness: 0, envMapIntensity: 0.55, normalScale: new THREE.Vector2(0.9, 0.9) });
  MAT.metal = new THREE.MeshStandardMaterial({ ...TEX.metal, roughness: 1, metalness: 0.45, envMapIntensity: 1.0, color: 0xc8ccd2, normalScale: new THREE.Vector2(0.8, 0.8) });
  MAT.floor = new THREE.MeshStandardMaterial({ ...TEX.floor, roughness: 1, metalness: 0.5, envMapIntensity: 0.7, color: 0xd5d8dc });
  MAT.glass = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.16, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide });
  MAT.glassEdge = new THREE.LineBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.55 });
  MAT.trim = new THREE.MeshStandardMaterial({ color: 0x23282e, roughness: 0.4, metalness: 0.8, envMapIntensity: 1 });
  MAT.trimLight = new THREE.MeshStandardMaterial({ color: 0xdfe3e7, roughness: 0.3, metalness: 0.1, envMapIntensity: 0.8 });
  MAT.stripes = new THREE.MeshStandardMaterial({ map: TEX.stripes, roughness: 0.6, metalness: 0.2 });
  MAT.lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.2, 5.4, 5.8) });
  MAT.lampWarm = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 4.4, 3.2) });
  MAT.black = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.7, metalness: 0.3 });
  MAT.exitSign = new THREE.MeshBasicMaterial({ map: TEX.exit, color: new THREE.Color(1.6, 1.6, 1.6) });
}
