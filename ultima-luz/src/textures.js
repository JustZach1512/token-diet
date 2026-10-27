// Procedural canvas textures (no image assets): tileable value-noise fBm,
// colour maps plus normal maps derived from height fields.
import * as THREE from 'three';
import { mulberry32, clamp, smoothstep } from './util.js';

function valueNoise(px, py, seed) {
  const r = mulberry32(seed);
  const g = new Float32Array(px * py);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf);
    yf = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const a = g[y0 * px + x0], b = g[y0 * px + x1], c = g[y1 * px + x0], d = g[y1 * px + x1];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

function fbm(size, px, py, octaves, seed, gain = 0.5) {
  const layers = [];
  let amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const lx = px << o, ly = py << o;
    layers.push({ n: valueNoise(lx, ly, seed + o * 977), lx, ly, amp });
    norm += amp;
    amp *= gain;
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const L of layers) v += L.n((x / size) * L.lx, (y / size) * L.ly) * L.amp;
      out[y * size + x] = v / norm;
    }
  }
  return out;
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function paint(size, fn) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const rgb = [0, 0, 0, 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      rgb[3] = 255;
      fn(x, y, y * size + x, rgb);
      const o = (y * size + x) * 4;
      d[o] = clamp(rgb[0], 0, 255);
      d[o + 1] = clamp(rgb[1], 0, 255);
      d[o + 2] = clamp(rgb[2], 0, 255);
      d[o + 3] = clamp(rgb[3], 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function normalMap(h, size, strength) {
  const c = paint(size, (x, y, i, out) => {
    const xl = (x - 1 + size) % size, xr = (x + 1) % size;
    const yu = (y - 1 + size) % size, yd = (y + 1) % size;
    const dx = (h[y * size + xr] - h[y * size + xl]) * strength;
    const dy = (h[yd * size + x] - h[yu * size + x]) * strength;
    const len = Math.hypot(dx, dy, 1);
    out[0] = (-dx / len * 0.5 + 0.5) * 255;
    out[1] = (dy / len * 0.5 + 0.5) * 255;
    out[2] = (1 / len * 0.5 + 0.5) * 255;
  });
  return toTexture(c, false);
}

const mix = (a, b, t) => a + (b - a) * t;
function mix3(out, a, b, t) {
  out[0] = mix(a[0], b[0], t);
  out[1] = mix(a[1], b[1], t);
  out[2] = mix(a[2], b[2], t);
}

function ground(size) {
  const big = fbm(size, 4, 4, 6, 11);
  const patch = fbm(size, 3, 3, 4, 23);
  const fine = fbm(size, 48, 48, 2, 37);
  const r = mulberry32(5);
  const h = new Float32Array(size * size);
  const peb = new Float32Array(size * size);
  for (let k = 0; k < size * 1.6; k++) {
    const cx = r() * size, cy = r() * size, rad = 1 + r() * size * 0.006;
    for (let yy = -rad - 1; yy <= rad + 1; yy++) {
      for (let xx = -rad - 1; xx <= rad + 1; xx++) {
        const d = Math.hypot(xx, yy) / rad;
        if (d > 1) continue;
        const px = ((Math.floor(cx + xx) % size) + size) % size;
        const py = ((Math.floor(cy + yy) % size) + size) % size;
        peb[py * size + px] = Math.max(peb[py * size + px], Math.sqrt(1 - d * d));
      }
    }
  }
  const soil = [46, 38, 30], moss = [30, 40, 24], dry = [62, 58, 40], dark = [20, 18, 16], stone = [86, 84, 80];
  const col = [0, 0, 0];
  const map = paint(size, (x, y, i, out) => {
    const b = big[i], p = patch[i], f = fine[i];
    mix3(col, soil, moss, smoothstep(0.42, 0.62, p));
    mix3(col, col, dry, smoothstep(0.58, 0.75, b) * 0.7);
    mix3(col, col, dark, smoothstep(0.45, 0.25, b) * 0.6);
    mix3(col, col, stone, peb[i] * 0.85);
    const v = 0.78 + f * 0.44;
    out[0] = col[0] * v; out[1] = col[1] * v; out[2] = col[2] * v;
    h[i] = b * 0.5 + f * 0.35 + peb[i] * 0.6;
  });
  return { map: toTexture(map), normal: normalMap(h, size, 5) };
}

function bark(size) {
  const n = fbm(size, 24, 2, 4, 51);
  const m = fbm(size, 6, 6, 3, 52);
  const map = paint(size, (x, y, i, out) => {
    const v = n[i], k = smoothstep(0.35, 0.7, v);
    const g = 0.75 + m[i] * 0.4;
    out[0] = mix(28, 66, k) * g; out[1] = mix(22, 54, k) * g; out[2] = mix(18, 44, k) * g;
  });
  return { map: toTexture(map), normal: normalMap(n, size, 9) };
}

function bricks(size, seed = 61, tint = [92, 84, 78]) {
  const r = mulberry32(seed);
  const rows = 12, cols = 6;
  const bh = size / rows, bw = size / cols;
  const shade = [];
  for (let i = 0; i < rows * cols * 2; i++) shade.push(0.7 + r() * 0.45);
  const grime = fbm(size, 4, 4, 5, seed + 3);
  const fine = fbm(size, 32, 32, 2, seed + 4);
  const h = new Float32Array(size * size);
  const map = paint(size, (x, y, i, out) => {
    const row = Math.floor(y / bh);
    const off = (row % 2) * bw * 0.5;
    const xs = (x + off) % size;
    const col = Math.floor(xs / bw);
    const lx = xs - col * bw, ly = y - row * bh;
    const edge = Math.min(lx, bw - lx, ly, bh - ly);
    const mortar = edge < size * 0.006 + 1 ? 1 : 0;
    const s = shade[row * cols + col] * (0.8 + fine[i] * 0.35) * (0.65 + grime[i] * 0.5);
    if (mortar) {
      out[0] = 44 * (0.7 + grime[i] * 0.4); out[1] = 42 * (0.7 + grime[i] * 0.4); out[2] = 38 * (0.7 + grime[i] * 0.4);
      h[i] = 0;
    } else {
      const moss = smoothstep(0.62, 0.8, grime[i]);
      out[0] = mix(tint[0] * s, 40, moss); out[1] = mix(tint[1] * s, 56, moss); out[2] = mix(tint[2] * s, 30, moss);
      h[i] = 0.6 + fine[i] * 0.4 - smoothstep(4, 0, edge) * 0.3;
    }
  });
  return { map: toTexture(map), normal: normalMap(h, size, 4) };
}

function planks(size, seed = 71) {
  const r = mulberry32(seed);
  const rows = 6, ph = size / rows;
  const tint = [];
  for (let i = 0; i < rows; i++) tint.push(0.7 + r() * 0.5);
  const grain = fbm(size, 2, 16, 4, seed + 1);
  const dirt = fbm(size, 4, 4, 4, seed + 2);
  const h = new Float32Array(size * size);
  const map = paint(size, (x, y, i, out) => {
    const row = Math.floor(y / ph), ly = y - row * ph;
    const gap = ly < 2 || ly > ph - 2;
    const g = Math.sin((grain[i] * 9 + x / size * 2) * Math.PI * 2) * 0.5 + 0.5;
    const t = tint[row] * (0.75 + g * 0.3) * (0.7 + dirt[i] * 0.5);
    if (gap) { out[0] = 16; out[1] = 12; out[2] = 10; h[i] = 0; }
    else { out[0] = 92 * t; out[1] = 70 * t; out[2] = 50 * t; h[i] = 0.7 + g * 0.2; }
  });
  return { map: toTexture(map), normal: normalMap(h, size, 4) };
}

function rust(size, seed = 81) {
  const n = fbm(size, 4, 4, 6, seed);
  const streak = fbm(size, 24, 2, 3, seed + 1);
  const fine = fbm(size, 32, 32, 2, seed + 2);
  const map = paint(size, (x, y, i, out) => {
    const rr = smoothstep(0.45, 0.65, n[i] * 0.7 + streak[i] * 0.4);
    const f = 0.8 + fine[i] * 0.35;
    out[0] = mix(62, 112, rr) * f; out[1] = mix(66, 50, rr) * f; out[2] = mix(70, 26, rr) * f;
  });
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = n[i] * 0.6 + fine[i] * 0.4;
  return { map: toTexture(map), normal: normalMap(h, size, 3) };
}

function rock(size, seed = 91) {
  const n = fbm(size, 4, 4, 6, seed);
  const ridge = fbm(size, 6, 6, 4, seed + 7);
  const lich = fbm(size, 8, 8, 3, seed + 9);
  const h = new Float32Array(size * size);
  const map = paint(size, (x, y, i, out) => {
    const crack = 1 - smoothstep(0.0, 0.035, Math.abs(ridge[i] - 0.5));
    const g = 0.6 + n[i] * 0.6 - crack * 0.4;
    const l = smoothstep(0.62, 0.75, lich[i]) * 0.6;
    out[0] = mix(66 * g, 58, l); out[1] = mix(65 * g, 66, l); out[2] = mix(64 * g, 38, l);
    h[i] = n[i] - crack * 0.5;
  });
  return { map: toTexture(map), normal: normalMap(h, size, 6) };
}

function cloth(size) {
  const n = fbm(size, 64, 64, 1, 101);
  const m = fbm(size, 4, 4, 4, 102);
  const map = paint(size, (x, y, i, out) => {
    const weave = ((x + y) % 4 < 2 ? 0.94 : 1.04) * (0.85 + n[i] * 0.2) * (0.85 + m[i] * 0.3);
    out[0] = out[1] = out[2] = 220 * weave;
  });
  return { map: toTexture(map) };
}

function grassBlades(size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const r = mulberry32(7);
  for (let i = 0; i < 16; i++) {
    const x = size * (0.1 + r() * 0.8);
    const w = size * (0.025 + r() * 0.03);
    const lean = (r() - 0.5) * size * 0.35;
    const top = size * (0.05 + r() * 0.35);
    const g = ctx.createLinearGradient(0, size, 0, top);
    g.addColorStop(0, '#1f2a18');
    g.addColorStop(0.55, '#4c5c36');
    g.addColorStop(1, '#a3a46a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w, size);
    ctx.quadraticCurveTo(x - w * 0.5 + lean * 0.3, size * 0.55, x + lean, top);
    ctx.quadraticCurveTo(x + w * 0.5 + lean * 0.3, size * 0.55, x + w, size);
    ctx.fill();
  }
  const t = toTexture(c, true, false);
  return t;
}

function glow(size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c, true, false);
}

function fogPuff(size = 256) {
  const n = fbm(size, 4, 4, 5, 131);
  const c = paint(size, (x, y, i, out) => {
    const dx = x / size - 0.5, dy = y / size - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const a = smoothstep(1, 0.2, d) * smoothstep(0.25, 0.75, n[i]);
    out[0] = out[1] = out[2] = 255;
    out[3] = a * 255;
  });
  return toTexture(c, true, false);
}

function scratch(size = 64) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    ctx.lineWidth = 3 - i * 0.4;
    ctx.beginPath();
    ctx.moveTo(10 + i * 9, 6);
    ctx.quadraticCurveTo(20 + i * 9, 32, 14 + i * 9, 58);
    ctx.stroke();
  }
  return toTexture(c, true, false);
}

function stained(size = 128, seed = 5) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const pal = ['#ff5a3a', '#ffd06a', '#3a7bff', '#8a2be2', '#2ad49a', '#ff2f6d'];
  const n = 7, w = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = pal[Math.floor(r() * pal.length)];
      ctx.globalAlpha = 0.5 + r() * 0.5;
      ctx.beginPath();
      ctx.moveTo(x * w + 2 + r() * 3, y * w + 2 + r() * 3);
      ctx.lineTo((x + 1) * w - 2 - r() * 3, y * w + 2 + r() * 3);
      ctx.lineTo((x + 1) * w - 2 - r() * 3, (y + 1) * w - 2 - r() * 3);
      ctx.lineTo(x * w + 2 + r() * 3, (y + 1) * w - 2 - r() * 3);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return toTexture(c, true, false);
}

let cache = null;
export function getTextures() {
  if (cache) return cache;
  cache = {
    ground: ground(512),
    bark: bark(256),
    brick: bricks(512, 61, [92, 84, 78]),
    redBrick: bricks(512, 63, [104, 58, 46]),
    wood: planks(256),
    rust: rust(256),
    rock: rock(256),
    cloth: cloth(128),
    grass: grassBlades(128),
    glow: glow(128),
    fog: fogPuff(256),
    scratch: scratch(64),
    stained: stained(128),
  };
  return cache;
}
