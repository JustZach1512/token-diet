// ============================================================================
// GRÁFICOS — pixel art 100% generado por código (paletas, máscaras con
// sombreado automático, generador procedural de Clawd, tiles, fondos, fuente)
// ============================================================================
const GFX = (() => {
  'use strict';
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0); };

  // ------------------------------------------------------------ máscaras con sombreado automático
  // rows: strings; pal: { ch: '#color' | [light, base, dark] }; outline: color o null
  function sprite(rows, pal, outline, flipY) {
    const h = rows.length, w = rows[0].length;
    const c = cv(w, h), x = c.getContext('2d');
    const at = (i, j) => (j < 0 || j >= h || i < 0 || i >= w) ? '.' : rows[j][i];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const ch = rows[j][i];
      if (ch === '.') {
        if (outline && (at(i - 1, j) !== '.' || at(i + 1, j) !== '.' || at(i, j - 1) !== '.' || at(i, j + 1) !== '.')) {
          x.fillStyle = outline; x.fillRect(i, j, 1, 1);
        }
        continue;
      }
      let col = pal[ch];
      if (col === undefined) continue;
      if (Array.isArray(col)) {
        const up = at(i, j - 1), dn = at(i, j + 1), lf = at(i - 1, j), rt = at(i + 1, j);
        if (up !== ch || lf === '.') col = col[0];
        else if (dn !== ch || rt === '.') col = col[2];
        else col = col[1];
      }
      x.fillStyle = col; x.fillRect(i, j, 1, 1);
    }
    return c;
  }
  function flipH(src) { const c = cv(src.width, src.height), x = c.getContext('2d'); x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); return c; }
  function flipV(src) { const c = cv(src.width, src.height), x = c.getContext('2d'); x.translate(0, src.height); x.scale(1, -1); x.drawImage(src, 0, 0); return c; }
  function tint(src, color, alpha) {
    const c = cv(src.width, src.height), x = c.getContext('2d');
    x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.globalAlpha = alpha == null ? 1 : alpha;
    x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c;
  }
  // par [derecha, izquierda]
  const pair = (c) => [c, flipH(c)];

  // ------------------------------------------------------------ FUENTE PIXELADA (5x7 + minúsculas, acentos y ñ)
  const FONT = {
    'A': '.###.|#...#|#...#|#####|#...#|#...#|#...#', 'B': '####.|#...#|#...#|####.|#...#|#...#|####.',
    'C': '.###.|#...#|#....|#....|#....|#...#|.###.', 'D': '####.|#...#|#...#|#...#|#...#|#...#|####.',
    'E': '#####|#....|#....|####.|#....|#....|#####', 'F': '#####|#....|#....|####.|#....|#....|#....',
    'G': '.###.|#...#|#....|#.###|#...#|#...#|.####', 'H': '#...#|#...#|#...#|#####|#...#|#...#|#...#',
    'I': '.###.|..#..|..#..|..#..|..#..|..#..|.###.', 'J': '..###|...#.|...#.|...#.|#..#.|#..#.|.##..',
    'K': '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', 'L': '#....|#....|#....|#....|#....|#....|#####',
    'M': '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', 'N': '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
    'O': '.###.|#...#|#...#|#...#|#...#|#...#|.###.', 'P': '####.|#...#|#...#|####.|#....|#....|#....',
    'Q': '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', 'R': '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    'S': '.####|#....|#....|.###.|....#|....#|####.', 'T': '#####|..#..|..#..|..#..|..#..|..#..|..#..',
    'U': '#...#|#...#|#...#|#...#|#...#|#...#|.###.', 'V': '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    'W': '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', 'X': '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    'Y': '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', 'Z': '#####|....#|...#.|..#..|.#...|#....|#####',
    '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
    '2': '.###.|#...#|....#|...#.|..#..|.#...|#####', '3': '####.|....#|....#|.###.|....#|....#|####.',
    '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', '5': '#####|#....|####.|....#|....#|#...#|.###.',
    '6': '.###.|#....|#....|####.|#...#|#...#|.###.', '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
    '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.', '9': '.###.|#...#|#...#|.####|....#|....#|.###.',
    'a': '2:.###.|....#|.####|#...#|.####', 'b': '#....|#....|####.|#...#|#...#|#...#|####.',
    'c': '2:.###.|#....|#....|#...#|.###.', 'd': '....#|....#|.####|#...#|#...#|#...#|.####',
    'e': '2:.###.|#...#|#####|#....|.###.', 'f': '..##.|.#..#|.#...|###..|.#...|.#...|.#...',
    'g': '2:.####|#...#|#...#|#...#|.####|....#|.###.', 'h': '#....|#....|####.|#...#|#...#|#...#|#...#',
    'i': '..#..|.....|.##..|..#..|..#..|..#..|.###.', 'j': '...#.|.....|..##.|...#.|...#.|...#.|...#.|#..#.|.##..',
    'k': '#....|#....|#..#.|#.#..|##...|#.#..|#..#.', 'l': '.##..|..#..|..#..|..#..|..#..|..#..|.###.',
    'm': '2:##.#.|#.#.#|#.#.#|#.#.#|#.#.#', 'n': '2:####.|#...#|#...#|#...#|#...#',
    'o': '2:.###.|#...#|#...#|#...#|.###.', 'p': '2:####.|#...#|#...#|#...#|####.|#....|#....',
    'q': '2:.####|#...#|#...#|#...#|.####|....#|....#', 'r': '2:#.##.|##..#|#....|#....|#....',
    's': '2:.####|#....|.###.|....#|####.', 't': '1:.#...|####.|.#...|.#...|.#..#|..##.',
    'u': '2:#...#|#...#|#...#|#..##|.##.#', 'v': '2:#...#|#...#|#...#|.#.#.|..#..',
    'w': '2:#...#|#...#|#.#.#|#.#.#|.#.#.', 'x': '2:#...#|.#.#.|..#..|.#.#.|#...#',
    'y': '2:#...#|#...#|#...#|#...#|.####|....#|.###.', 'z': '2:#####|...#.|..#..|.#...|#####',
    ' ': '.....', '.': '5:.##..|.##..', ',': '5:.##..|..#..|.#...', ':': '1:.##..|.##..|.....|.##..|.##..',
    ';': '1:.##..|.##..|.....|.##..|..#..|.#...', '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
    '?': '.###.|#...#|....#|..##.|..#..|.....|..#..', '¡': '..#..|.....|..#..|..#..|..#..|..#..|..#..',
    '¿': '..#..|.....|..#..|.##..|#....|#...#|.###.', "'": '..#..|..#..|.#...', '"': '.#.#.|.#.#.',
    '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.', ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...',
    '[': '.###.|.#...|.#...|.#...|.#...|.#...|.###.', ']': '.###.|...#.|...#.|...#.|...#.|...#.|.###.',
    '{': '...##|..#..|..#..|.#...|..#..|..#..|...##', '}': '##...|..#..|..#..|...#.|..#..|..#..|##...',
    '+': '1:..#..|..#..|#####|..#..|..#..', '-': '3:#####', '=': '2:#####|.....|#####',
    '*': '1:#.#.#|.###.|#####|.###.|#.#.#', '/': '....#|....#|...#.|..#..|.#...|#....|#....',
    '\\': '#....|#....|.#...|..#..|...#.|....#|....#', '_': '6:#####', '<': '...#.|..#..|.#...|#....|.#...|..#..|...#.',
    '>': '.#...|..#..|...#.|....#|...#.|..#..|.#...', '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.',
    '@': '.###.|#...#|#.###|#.#.#|#.###|#....|.###.', '%': '##..#|##..#|...#.|..#..|.#...|#..##|#..##',
    '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#', '$': '..#..|.####|#.#..|.###.|..#.#|####.|..#..',
    '|': '..#..|..#..|..#..|..#..|..#..|..#..|..#..', '~': '2:.#...|#.#.#|...#.', '^': '..#..|.#.#.|#...#',
    '×': '1:#...#|.#.#.|..#..|.#.#.|#...#', '©': '.###.|#...#|#.###|#.#.#|#.###|#...#|.###.',
    '←': '1:..#..|.#...|#####|.#...|..#..', '→': '1:..#..|...#.|#####|...#.|..#..',
    '↑': '..#..|.###.|#.#.#|..#..|..#..|..#..', '↓': '1:..#..|..#..|..#..|#.#.#|.###.|..#..',
    '♥': '1:.#.#.|#####|#####|.###.|..#..', '✓': '1:....#|...#.|#.#..|.#...', '·': '3:.##..|.##..',
    '¤': '1:.#.#.|#####|#.#.#|#####|.#.#.', '★': '..#..|..#..|#####|.###.|.#.#.|#...#',
  };
  const ACC = { '´': ['...#.', '..#..'], '~': ['.##.#', '#.##.'], '¨': ['.#.#.', '.....'] };
  const COMPOSE = { 'Á': ['A', '´'], 'É': ['E', '´'], 'Í': ['I', '´'], 'Ó': ['O', '´'], 'Ú': ['U', '´'], 'Ñ': ['N', '~'], 'Ü': ['U', '¨'],
    'á': ['a', '´'], 'é': ['e', '´'], 'í': ['ı', '´'], 'ó': ['o', '´'], 'ú': ['u', '´'], 'ñ': ['n', '~'], 'ü': ['u', '¨'] };
  FONT['ı'] = '2:.##..|..#..|..#..|..#..|.###.';
  function glyphRows(ch) {
    let def = FONT[ch];
    if (def === undefined) {
      const cp = COMPOSE[ch];
      if (!cp) return glyphRows('?');
      const base = glyphRows(cp[0]); const acc = ACC[cp[1]];
      const rows = base.rows.map(r => r.slice());
      let top = base.top;
      if (top >= 2) { // minúscula: el acento cabe en las filas libres
        return { rows: [acc[0], acc[1]].concat(Array(top - 2).fill('.....')).concat(rows), top: 0 };
      }
      return { rows: [acc[0], acc[1]].concat(rows), top: -2 };
    }
    let top = 0;
    const m = def.match(/^(\d):/);
    if (m) { top = +m[1]; def = def.slice(2); }
    return { rows: def.split('|'), top };
  }
  const glyphCache = new Map();
  function glyph(ch, color) {
    const k = ch + color;
    let g = glyphCache.get(k);
    if (g) return g;
    const { rows, top } = glyphRows(ch);
    const c = cv(5, rows.length), x = c.getContext('2d');
    x.fillStyle = color;
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') x.fillRect(i, j, 1, 1); });
    g = { c, top };
    glyphCache.set(k, g);
    return g;
  }
  // dibuja texto; opts: {color, shadow, outline, align, scale}
  function text(ctx, str, x, y, o) {
    o = o || {};
    const color = o.color || '#fff', sc = o.scale || 1;
    const w = textW(str) * sc;
    if (o.align === 'center') x -= Math.floor(w / 2); else if (o.align === 'right') x -= w;
    x = Math.round(x); y = Math.round(y);
    if (o.outline) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) drawRaw(ctx, str, x + dx * sc, y + dy * sc, o.outline, sc);
    else if (o.shadow) drawRaw(ctx, str, x + sc, y + sc, o.shadow, sc);
    drawRaw(ctx, str, x, y, color, sc);
    return w;
  }
  function drawRaw(ctx, str, x, y, color, sc) {
    let cx = x;
    for (const ch of str) {
      if (ch !== ' ') {
        const g = glyph(ch, color);
        if (sc === 1) ctx.drawImage(g.c, cx, y + g.top);
        else ctx.drawImage(g.c, 0, 0, 5, g.c.height, cx, y + g.top * sc, 5 * sc, g.c.height * sc);
      }
      cx += 6 * sc;
    }
  }
  const textW = (str) => [...str].length * 6 - 1;

  // ------------------------------------------------------------ CLAWD (generador procedural)
  const CLAWD_PALS = {
    normal: { O: '#3d1a10', B: '#da7756', L: '#f2a07c', D: '#b04e2e', H: '#ffd9c0', E: '#1a0b06', A: '#da7756', F: '#8f3a20', M: '#5a1a10' },
    fire: { O: '#123447', B: '#ffb15c', L: '#ffe2a6', D: '#e07434', H: '#fffbe6', E: '#0b2230', A: '#38d6f0', F: '#1d8fb0', M: '#5a1a10' },
    star: [
      { O: '#4a2a00', B: '#ffd23c', L: '#fff3a0', D: '#e09a10', H: '#ffffff', E: '#3a1a00', A: '#ffd23c', F: '#b07000', M: '#5a1a10' },
      { O: '#4a0030', B: '#ff5cc8', L: '#ffb0e8', D: '#c02890', H: '#ffffff', E: '#2a0018', A: '#ff5cc8', F: '#900060', M: '#2a0018' },
      { O: '#002a40', B: '#4ae0ff', L: '#b0f6ff', D: '#1a98c8', H: '#ffffff', E: '#00202e', A: '#4ae0ff', F: '#10709a', M: '#00202e' },
      { O: '#123a00', B: '#8ef04a', L: '#d8ffb0', D: '#4ab020', H: '#ffffff', E: '#0c2400', A: '#8ef04a', F: '#2e8010', M: '#0c2400' },
    ],
  };
  const CW = 22, CH = 36; // lienzo de cada fotograma (ancla abajo-centro en x=11)
  // o: {big, bw, bh, lean, legs:0..3|'tuck'|'spread'|'together'|'none', arms:'side'|'up'|'out'|'back'|'punch'|'swimA'|'swimB'|'grab'|'up1',
  //     eyes:'open'|'blink'|'x'|'happy'|'squint'|'hurt', mouth:'none'|'o'|'smile', front:bool}
  function clawdGrid(o) {
    const g = Array.from({ length: CH }, () => Array(CW).fill('.'));
    const set = (x, y, c) => { if (x >= 0 && x < CW && y >= 0 && y < CH) g[y][x] = c; };
    const big = o.big;
    const bw = o.bw || 12, bh = o.bh || (big ? 23 : 10);
    const lh = o.legs === 'none' ? 0 : o.legs === 'tuck' ? 2 : (big ? 4 : 3);
    const bottom = CH - lh; // fila siguiente al cuerpo
    const top = bottom - bh;
    const x0 = 11 - Math.floor(bw / 2);
    const leanRows = Math.floor(bh * 0.45);
    const shift = (y) => (o.lean && y < top + leanRows) ? o.lean : 0;
    // cuerpo con contorno y esquinas redondeadas
    for (let y = top; y < bottom; y++) {
      const sx = shift(y);
      for (let x = x0; x < x0 + bw; x++) {
        const edgeX = x === x0 || x === x0 + bw - 1, edgeY = y === top || y === bottom - 1;
        const corner = edgeX && edgeY;
        if (corner) continue;
        let c = 'B';
        if (edgeX || edgeY) c = 'O';
        else if ((x === x0 + 1 && y === top + 1)) c = 'H';
        else if (y === top + 1 || x === x0 + 1) c = 'L';
        else if (y === bottom - 2 || x === x0 + bw - 2) c = 'D';
        set(x + sx, y, c);
      }
      // esquina interior redondeada
    }
    set(x0 + 1 + shift(top + 1), top + 1, 'O'); set(x0 + bw - 2 + shift(top + 1), top + 1, 'O');
    set(x0 + 1, bottom - 2, 'O'); set(x0 + bw - 2, bottom - 2, 'O');
    // ojos
    const ey = top + Math.max(2, Math.floor(bh * (big ? 0.28 : 0.3)));
    const eh = big ? 3 : 2;
    const off = o.front ? 0 : 1;
    const exL = x0 + Math.floor(bw * 0.3) + off + shift(ey), exR = x0 + bw - 1 - Math.floor(bw * 0.3) + off + shift(ey);
    const eyes = o.eyes || 'open';
    for (const ex of [exL, exR]) {
      if (eyes === 'open') for (let k = 0; k < eh; k++) set(ex, ey + k, 'E');
      else if (eyes === 'blink' || eyes === 'squint') { set(ex, ey + eh - 1, 'E'); if (eyes === 'squint') set(ex - 1, ey + eh - 1, 'E'); }
      else if (eyes === 'x') { set(ex - 1, ey, 'E'); set(ex + 1, ey, 'E'); set(ex, ey + 1, 'E'); set(ex - 1, ey + 2, 'E'); set(ex + 1, ey + 2, 'E'); }
      else if (eyes === 'happy') { set(ex - 1, ey + 1, 'E'); set(ex, ey, 'E'); set(ex + 1, ey + 1, 'E'); }
      else if (eyes === 'hurt') { set(ex, ey, 'E'); set(ex, ey + 1, 'E'); set(ex + (ex === exL ? -1 : 1), ey, 'E'); }
    }
    // boca
    const my = ey + eh + (big ? 2 : 1);
    const mx = Math.floor((exL + exR) / 2);
    if (o.mouth === 'o') { set(mx, my, 'M'); set(mx + 1, my, 'M'); set(mx, my + 1, 'M'); set(mx + 1, my + 1, 'M'); }
    else if (o.mouth === 'smile') { set(mx - 1, my, 'M'); set(mx, my + 1, 'M'); set(mx + 1, my + 1, 'M'); set(mx + 2, my, 'M'); }
    // brazos (pequeños muñones a los lados)
    const ay = top + Math.floor(bh * 0.45);
    const L = x0 - 1, R = x0 + bw;
    const arm = (side, kind) => {
      const ax = side < 0 ? L : R, d = side;
      const sx = shift(ay);
      switch (kind) {
        case 'side': set(ax + sx, ay, 'A'); set(ax + sx, ay + 1, 'A'); set(ax + d + sx, ay + 1, 'F'); set(ax + d + sx, ay, 'A'); break;
        case 'up': set(ax + sx, ay - 2, 'A'); set(ax + d + sx, ay - 3, 'A'); set(ax + d + sx, ay - 4, 'F'); set(ax + sx, ay - 1, 'A'); break;
        case 'out': set(ax + sx, ay - 1, 'A'); set(ax + d + sx, ay - 1, 'A'); set(ax + 2 * d + sx, ay - 1, 'F'); set(ax + sx, ay, 'A'); break;
        case 'back': set(ax + sx, ay + 1, 'A'); set(ax + d + sx, ay + 2, 'F'); set(ax + sx, ay + 2, 'A'); break;
        case 'punch': set(ax + sx, ay, 'A'); set(ax + d + sx, ay, 'A'); set(ax + 2 * d + sx, ay, 'A'); set(ax + 3 * d + sx, ay, 'F'); set(ax + 2 * d + sx, ay - 1, 'F'); break;
        case 'down': set(ax + sx, ay + 2, 'A'); set(ax + sx, ay + 3, 'F'); break;
        case 'grab': set(ax + sx, ay - 3, 'A'); set(ax + sx, ay - 4, 'A'); set(ax + sx, ay - 5, 'F'); break;
      }
    };
    const arms = o.arms || 'side';
    if (arms === 'up1') { arm(-1, 'side'); arm(1, 'up'); }
    else if (arms === 'swimA') { arm(-1, 'up'); arm(1, 'down'); }
    else if (arms === 'swimB') { arm(-1, 'down'); arm(1, 'up'); }
    else if (arms === 'punch') { arm(-1, 'back'); arm(1, 'punch'); }
    else if (arms === 'grab') { arm(-1, 'side'); arm(1, 'grab'); }
    else { arm(-1, arms); arm(1, arms); }
    // patas: 4 patitas
    if (lh > 0) {
      const lx = [x0 + 2, x0 + 4, x0 + bw - 5, x0 + bw - 3];
      const ph = o.legs;
      for (let k = 0; k < 4; k++) {
        let px = lx[k], up = 0;
        if (ph === 1) { if (k === 0 || k === 2) up = 1; px += (k % 2 ? 1 : 0); }
        if (ph === 3) { if (k === 1 || k === 3) up = 1; px -= (k % 2 ? 0 : 1); }
        if (ph === 'spread') px += (k < 2 ? -1 : 1);
        if (ph === 'together') px += (k < 2 ? 1 : -1);
        for (let y = bottom; y < CH - up; y++) set(px, y, y === CH - 1 - up ? 'F' : 'D');
      }
    }
    return g;
  }
  const clawdCache = new Map();
  function clawd(o, palName, starIdx) {
    const key = JSON.stringify(o) + palName + (starIdx || 0);
    let r = clawdCache.get(key);
    if (r) return r;
    const pal = palName === 'star' ? CLAWD_PALS.star[starIdx || 0] : CLAWD_PALS[palName];
    const g = clawdGrid(o);
    const c = cv(CW, CH), x = c.getContext('2d');
    for (let y = 0; y < CH; y++) for (let i = 0; i < CW; i++) {
      const ch = g[y][i]; if (ch === '.') continue;
      x.fillStyle = pal[ch]; x.fillRect(i, y, 1, 1);
    }
    // contorno exterior de las patas y brazos
    const out = cv(CW, CH), ox = out.getContext('2d');
    ox.drawImage(tint(c, pal.O), -1, 0); ox.drawImage(tint(c, pal.O), 1, 0); ox.drawImage(tint(c, pal.O), 0, 1);
    ox.drawImage(c, 0, 0);
    r = pair(out);
    clawdCache.set(key, r);
    return r;
  }

  // ------------------------------------------------------------ ENEMIGOS
  const SPR = {};
  function build() {
    // ---- BUG (escarabajo de código)
    const bugPal = { '#': ['#ff86cf', '#d8338f', '#8e1a5c'], 'w': '#ffffff', 'k': '#1a0614', 'c': '#5ff0e8', 'l': '#3a0f2c', 'a': '#3a0f2c', 'y': '#ffe14a' };
    const bugBody = [
      '................',
      '...a........a...',
      '....a......a....',
      '.....######.....',
      '...##########...',
      '..###c####c###..',
      '..#wwww##wwww#..',
      '.##wwww##wwww##.',
      '.##wwww##wwww##.',
      '.###ww####ww###.',
      '.##############.',
      '..#c###cc###c#..',
      '...##########...',
    ];
    const bugLegs = [
      ['...l..l..l..l...', '..l..l....l..l..', '................'],
      ['....l.l..l.l....', '....l.l..l.l....', '................'],
      ['...l..l..l..l...', '...l..l..l..l...', '................'],
      ['....l..ll..l....', '...l..l..l..l...', '................'],
    ];
    SPR.bug = [];
    for (let dir = 0; dir < 2; dir++) for (let f = 0; f < 4; f++) {
      const rows = bugBody.map(r => r.split(''));
      const po = dir === 0 ? 0 : 2; // pupilas mirando izquierda/derecha
      for (const ex of [3, 9]) for (const yy of [7, 8]) { rows[yy][ex + po] = 'k'; rows[yy][ex + po + 1] = 'k'; }
      const body = rows.map(r => r.join(''));
      const all = (f % 2 === 1 ? ['................'].concat(body.slice(0, 12)) : body).concat(bugLegs[f]);
      SPR.bug.push(sprite(all, bugPal, '#2a0a20'));
    }
    SPR.bugFlat = sprite([
      '................', '................', '................', '................', '................',
      '................', '................', '................', '................', '................',
      '................', '...##########...', '.##ww#####ww###.', '.##kk######kk##.', '..##c#c##c#c##..', '................',
    ], bugPal, '#2a0a20');

    // ---- GLITCH (criatura con caparazón de píxeles)
    const glPal = { '*': ['#7ff5e0', '#21b8a0', '#0f6e62'], '#': ['#c6ff7a', '#7fd63a', '#3f8a1a'], 'm': '#ff4fd8', 'y': '#fff04a', 'w': '#ffffff', 'k': '#101010', 'l': '#2d5a12' };
    const glBase = [
      '................',
      '.....*******....',
      '....*********...',
      '....**mm**y***..',
      '....**********..',
      '.##.***yy**mm*..',
      '####**********..',
      '#ww#***mm*****..',
      '#wk#****y******.',
      '####***********.',
      '.###**********..',
      '..##*********...',
      '...#########....',
    ];
    const glLegs = [
      ['...l.l...l.l....', '..l...l.l...l...'],
      ['....l.l...l.l...', '....l.l...l.l...'],
      ['...l.l...l.l....', '...l.l...l.l....'],
      ['...l..l..l..l...', '..l...l.l...l...'],
    ];
    SPR.glitch = [];
    for (let f = 0; f < 4; f++) {
      const rows = (f % 2 ? ['................'].concat(glBase.slice(0, 12)) : glBase).concat(glLegs[f]).concat(['................']);
      SPR.glitch.push(pair(flipH(sprite(rows, glPal, '#0a2a20'))));
    }
    SPR.shell = [];
    const shellRows = [
      '................',
      '....********....',
      '...**********...',
      '..**mm***y****..',
      '..************..',
      '..***yy***mm**..',
      '..************..',
      '..***mm*******..',
      '..*****y******..',
      '..************..',
      '...**********...',
      '....********....',
    ];
    for (let f = 0; f < 4; f++) {
      const rows = shellRows.map((r, j) => {
        if (j < 3 || j > 9) return r;
        const a = r.split(''); const sh = (f * 2 + j) % 10;
        for (let i = 3; i < 13; i++) if (a[i] !== '.') a[i] = ((i + sh) % 7 === 0) ? 'm' : ((i + sh + j) % 9 === 0 ? 'y' : '*');
        return a.join('');
      });
      SPR.shell.push(sprite(rows, glPal, '#0a2a20'));
    }

    // ---- PING (sónar volador)
    const pgPal = { '#': ['#fff6a0', '#f4d03a', '#b8901a'], 'w': '#ffffff', 'k': '#141414', 'r': '#ff6a3a', 'v': ['#d8f4ff', '#8ec8f0', '#4a86c0'], 'a': '#4a3a10' };
    const pgBody = [
      '.......a........',
      '......a.a.......',
      '.......a........',
      '......####......',
      '.....######.....',
      '....##wwww##....',
      '....#wwkkww#....',
      '....#wwkkww#....',
      '....##wwww##....',
      '.....#r##r#.....',
      '......####......',
      '................',
      '................',
      '................',
    ];
    const wings = [
      [[2, 3], [3, 3], [1, 2], [2, 2], [0, 1], [3, 4], [2, 4]],
      [[1, 6], [2, 6], [3, 6], [0, 6], [1, 7], [2, 7], [3, 7]],
      [[2, 9], [3, 9], [1, 10], [2, 10], [0, 11], [3, 8], [2, 8]],
      [[1, 6], [2, 6], [3, 6], [0, 6], [1, 7], [2, 7], [3, 7]],
    ];
    SPR.ping = [];
    for (let f = 0; f < 4; f++) {
      const rows = pgBody.map(r => r.split(''));
      for (const [x, y] of wings[f]) { rows[y][x] = 'v'; rows[y][15 - x] = 'v'; }
      SPR.ping.push(pair(sprite(rows.map(r => r.join('')), pgPal, '#3a2a08')));
    }

    // ---- CABLE (enchufe que sale de la tubería)
    const cbPal = { '#': ['#a8b8e0', '#6a7cb8', '#3a4880'], 's': ['#ffffff', '#d0d4e0', '#8a90a8'], 'w': '#ffffff', 'k': '#120c1c', 'r': '#ff3a5a', 't': '#ffffff' };
    SPR.cable = [
      sprite([
        '..............',
        '...ss....ss...',
        '...ss....ss...',
        '...ss....ss...',
        '.############.',
        '.##ww####ww##.',
        '.##wk####kw##.',
        '.############.',
        '.###########..',
        '.############.',
        '.############.',
        '..##########..',
        '..............',
      ].map(r => r.length < 14 ? r + '.' : r), cbPal, '#1a1430'),
      sprite([
        '..............',
        '...ss....ss...',
        '...ss....ss...',
        '...ss....ss...',
        '.############.',
        '.##ww####ww##.',
        '.##wk####kw##.',
        '.##kkkkkkkk##.',
        '.#ktkktkktkk#.',
        '.#kkkkkkkkkk#.',
        '.##ktkktkkt##.',
        '..##########..',
        '..............',
      ], cbPal, '#1a1430'),
    ];

    // ---- PIXEL (píxel muerto del techo, con subpíxeles RGB)
    const pxPal = { '#': ['#5a4a8a', '#2e2450', '#140f26'], 'r': '#ff3a5a', 'g': '#3aff7a', 'b': '#3a8aff', 'w': '#ffffff', 'k': '#000000', 'd': '#2e2450' };
    const pxRows = [
      '................',
      '..############..',
      '..#rrggbbrrgg#..',
      '..#rrggbbrrgg#..',
      '..##wwwwwwww##..',
      '..#wwwwkkwwww#..',
      '..#wwwwkkwwww#..',
      '..##wwwwwwww##..',
      '..#bbrrggbbrr#..',
      '..############..',
      '..#.##.##.##.#..',
      '...d..d..d..d...',
      '................',
    ];
    SPR.pixel = [sprite(pxRows, pxPal, '#08060f')];
    SPR.pixel.push(sprite(pxRows.map((r, j) => j === 5 || j === 6 ? r.replace('wwwwkkwwww', 'wwkkwwwwww') : r), pxPal, '#08060f'));
    SPR.pixelFlat = sprite(['................', '................', '................', '................', '................', '................',
      '................', '................', '................', '..############..', '..#rrggbbrrgg#..', '..#wwkkwwkkww#..', '..############..'], pxPal, '#08060f');

    // ---- CHISPA (bola eléctrica)
    SPR.chispa = [];
    for (let f = 0; f < 4; f++) {
      const c = cv(14, 14), x = c.getContext('2d');
      const cx = 7, cy = 7;
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + f * 0.4;
        const r = (k + f) % 2 ? 6 : 5;
        x.fillStyle = (k + f) % 3 ? '#7ff6ff' : '#ffe94a';
        x.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
      }
      x.fillStyle = '#ff9a2a'; x.beginPath(); x.arc(cx, cy, 4.2, 0, 7); x.fill();
      x.fillStyle = '#ffe94a'; x.fillRect(cx - 3, cy - 2, 6, 4); x.fillRect(cx - 2, cy - 3, 4, 6);
      x.fillStyle = '#ffffff'; x.fillRect(cx - 1 + (f % 2), cy - 1, 2, 2);
      SPR.chispa.push(c);
    }

    // ---- FIREWALL (con casco de ladrillos y llamas)
    const fwPal = { 'b': ['#ff8a6a', '#d0402a', '#7a1a10'], 'm': '#3a0c08', 'y': '#ffe14a', 'r': '#ff6a1a', '#': ['#d8dcef', '#9aa0c0', '#5a6088'], 'w': '#ffffff', 'k': '#101018', 'l': '#2a2c40', 's': '#7fd0ff' };
    const fwHelm = [
      '....y..y..y.....',
      '...yry.yr.ryy...',
      '...rrrrrrrrrr...',
      '..bbbbmbbbbmbb..',
      '..bbbbmbbbbmbb..',
      '..mmmmmmmmmmmm..',
      '..bmbbbbmbbbbb..',
      '..bmbbbbmbbbbb..',
    ];
    const fwFace = [
      '...##########...',
      '..#wwk####wwk#..',
      '..#wwk####wwk#..',
      '..############..',
      '...##########...',
    ];
    SPR.firewall = [];
    for (let f = 0; f < 4; f++) {
      const legs = f % 2 ? ['....l.l..l.l....', '....l.l..l.l....'] : ['...l..l..l..l...', '..l..l....l..l..'];
      const helm = fwHelm.map((r, j) => j < 2 && f % 2 ? r.replace(/y/g, 'r').replace(/r(?=r)/, 'y') : r);
      SPR.firewall.push(pair(flipH(sprite(['................'].concat(helm, fwFace, legs), fwPal, '#1a0a08'))));
    }
    SPR.firewallBare = [];
    for (let f = 0; f < 4; f++) {
      const legs = f % 2 ? ['....l.l..l.l....', '....l.l..l.l....'] : ['...l..l..l..l...', '..l..l....l..l..'];
      SPR.firewallBare.push(pair(flipH(sprite([
        '................', '................', '................', '................', '.......s........',
        '......s.........', '....######......', '...########.....', '..##########....',
      ].concat(['...##########...', '..#wk#####wk##..', '..#ww#####ww##..', '..###########...', '...####kk###....'], legs), fwPal, '#1a0a08'))));
    }
    SPR.helmet = sprite(fwHelm, fwPal, '#1a0a08');

    // ---- OBJETOS
    // Seta de memoria: sombrero de placa de circuito con contactos dorados
    SPR.mush = sprite([
      '................',
      '.....######.....',
      '...##########...',
      '..###kk###kk##..',
      '.####kk###kk###.',
      '.##############.',
      '.#k##########k#.',
      '.yyyyyyyyyyyyyy.',
      '..y.y.y.y.y.y.y.',
      '....ssssssss....',
      '....sswsswss....',
      '....ssssssss....',
      '....ssssssss....',
      '.....ssssss.....',
      '................',
    ], { '#': ['#7ef09a', '#24a85a', '#0f5c32'], 'k': '#122018', 'y': '#ffd34a', 's': ['#ffffff', '#e4e2f0', '#a8a4c0'], 'w': '#5a5870' }, '#0a2a18');
    SPR.life = sprite([
      '..............',
      '.############.',
      '.#ssssssss#.#.',
      '.#ss####ss###.',
      '.#ss####ss###.',
      '.#ssssssss###.',
      '.############.',
      '.##wwwwwwwww#.',
      '.##w.w.www.w#.',
      '.##w...w.w.w#.',
      '.##w.w.www.w#.',
      '.##wwwwwwwww#.',
      '.############.',
      '..............',
    ], { '#': ['#7ab8ff', '#2a6ae0', '#16388a'], 's': ['#ffffff', '#d4dae8', '#9aa4bc'], 'w': '#ffffff', '.': null }, '#0a1a40');
    // Flor de CPU
    SPR.flower = [];
    for (let f = 0; f < 4; f++) {
      const pinC = ['#ffd34a', '#ffe98a', '#fff6c8', '#ffe98a'][f];
      SPR.flower.push(sprite([
        '................',
        '.....y.y.y......',
        '...kkkkkkkkk....',
        '..ykssssssskk...',
        '...kscccccsk....',
        '..ykscwwwcskk...',
        '...kscwcwcsk....',
        '..ykscwwwcskk...',
        '...kscccccsk....',
        '...kssssssskk...',
        '...kkkkkkkkk....',
        '.....y.y.y......',
        '.......g........',
        '..lll..g..lll...',
        '...llllgllll....',
        '.......g........',
      ].map(r => r.length < 16 ? r.padEnd(16, '.') : r), { k: '#20202c', s: ['#c8cce0', '#8a90a8', '#5a6078'], c: '#38d6f0', w: '#ffffff', y: pinC, g: '#2a9a4a', l: ['#8ef09a', '#3ac05a', '#1a7a32'] }, '#0c0c14'));
    }
    // Estrella de root
    SPR.star = [];
    const starRows = [
      '.......##.......',
      '.......##.......',
      '......####......',
      '......####......',
      '##############..',
      '.############...',
      '..####kk.k###...',
      '...###k.kk##....',
      '...##########...',
      '..#####..#####..',
      '..####....####..',
      '.###........###.',
      '.#............#.',
    ].map(r => r.padEnd(16, '.'));
    ['#ffe14a', '#ff7ad8', '#6af0ff', '#9aff6a'].forEach(c => {
      SPR.star.push(sprite(starRows, { '#': [c === '#ffe14a' ? '#fff6b0' : '#ffffff', c, '#c07a10'], k: '#3a2400' }, '#3a2400'));
    });
    // Chip (moneda) girando
    const chipFrames = [
      ['.y.y.y.', 'yGGGGGy', '.GOOOG.', 'yGOWOGy', '.GOOOG.', 'yGOOOGy', '.GGGGG.', 'y.y.y.y'],
      ['.y.y.', 'yGGGy', '.GOG.', 'yGWGy', '.GOG.', 'yGOGy', '.GGG.', 'y.y.y'],
      ['.y.', 'yGy', '.G.', 'yGy', '.G.', 'yGy', '.G.', 'y.y'],
      ['.y.y.', 'yGGGy', '.GOG.', 'yGOGy', '.GWG.', 'yGOGy', '.GGG.', 'y.y.y'],
    ];
    SPR.chip = chipFrames.map(rows => {
      const w = 9, padded = rows.map(r => { const p = Math.floor((w - r.length) / 2); return '.'.repeat(p) + r + '.'.repeat(w - r.length - p); });
      return sprite(['.........'].concat(padded, ['.........']), { G: ['#fff2a0', '#ffc93c', '#c47a12'], O: '#e8a020', W: '#ffffff', y: '#b8741a' }, '#4a2a06');
    });
    // Llave USB
    SPR.key = sprite([
      '............',
      '.ssss.......',
      '.s##s#######',
      '.ssss#######',
      '.s##s#######',
      '.ssss.......',
      '............',
    ].map(r => r.padEnd(12, '.')), { s: ['#ffffff', '#c8cce0', '#7a80a0'], '#': ['#8affc0', '#22c070', '#0e6a3c'] }, '#0c1a14');
    // Bolas de código (jugador)
    SPR.cball = [];
    for (let f = 0; f < 4; f++) {
      const c = cv(10, 10), x = c.getContext('2d');
      x.fillStyle = '#0a3a50'; x.beginPath(); x.arc(5, 5, 4.6, 0, 7); x.fill();
      x.fillStyle = '#38d6f0'; x.beginPath(); x.arc(5, 5, 3.6, 0, 7); x.fill();
      x.fillStyle = '#c8fbff'; x.fillRect(3, 3, 4, 4);
      x.fillStyle = '#ffffff';
      const pts = [[2, 4], [3, 3], [7, 4], [6, 3]];
      x.fillRect(f % 2 ? 2 : 3, 4, 1, 2); x.fillRect(f % 2 ? 7 : 6, 4, 1, 2);
      x.fillStyle = '#0a6a8a'; x.fillRect(4 + (f % 2), 5, 1, 1);
      void pts;
      SPR.cball.push(c);
    }
    // Bola del jefe
    SPR.bball = [];
    for (let f = 0; f < 4; f++) {
      const c = cv(12, 12), x = c.getContext('2d');
      x.fillStyle = '#2a0a30'; x.beginPath(); x.arc(6, 6, 5.6, 0, 7); x.fill();
      x.fillStyle = '#c03ad8'; x.beginPath(); x.arc(6, 6, 4.4, 0, 7); x.fill();
      x.fillStyle = '#ff9af0'; x.fillRect(3 + (f % 2), 3, 3, 2);
      x.fillStyle = '#ffe14a'; x.fillRect(6, 7 - (f % 2), 2, 1); x.fillRect(4, 8, 1, 1);
      SPR.bball.push(c);
    }
    // Onda de choque
    SPR.wave = [];
    for (let f = 0; f < 4; f++) {
      const c = cv(14, 14), x = c.getContext('2d');
      for (let k = 0; k < 3; k++) {
        const hgt = 12 - k * 3 - (f + k) % 2 * 2;
        x.fillStyle = ['#ffffff', '#ffd34a', '#ff6a3a'][k];
        x.fillRect(4 + k * 2 - (f % 2), 14 - hgt, 2, hgt);
        x.fillRect(8 - k * 2 + (f % 2), 14 - hgt + 2, 2, hgt - 2);
      }
      SPR.wave.push(c);
    }
    // Resorte
    SPR.spring = [0, 1, 2].map(k => {
      const c = cv(16, 16), x = c.getContext('2d');
      const top = 2 + k * 3;
      x.fillStyle = '#2a1a40'; x.fillRect(1, top - 1, 14, 5);
      x.fillStyle = '#ff5c8a'; x.fillRect(2, top, 12, 3);
      x.fillStyle = '#ffb0c8'; x.fillRect(2, top, 12, 1);
      const coilH = 15 - (top + 3);
      for (let i = 0; i < coilH; i++) { x.fillStyle = i % 2 ? '#7a86a8' : '#d8dcef'; x.fillRect(4 + (i % 2) * 2, top + 3 + i, 6, 1); }
      x.fillStyle = '#2a1a40'; x.fillRect(2, 14, 12, 2); x.fillStyle = '#5a5a7a'; x.fillRect(3, 14, 10, 1);
      return c;
    });
    // Palanca
    SPR.lever = [0, 1].map(on => {
      const c = cv(16, 16), x = c.getContext('2d');
      x.fillStyle = '#1a1626'; x.fillRect(2, 11, 12, 5); x.fillStyle = '#6a6488'; x.fillRect(3, 12, 10, 3);
      x.fillStyle = on ? '#4aff8a' : '#ff4a5a'; x.fillRect(7, 13, 2, 1);
      x.strokeStyle = '#d8dcef'; x.lineWidth = 2; x.beginPath(); x.moveTo(8, 12); x.lineTo(on ? 13 : 3, 4); x.stroke();
      x.fillStyle = on ? '#4aff8a' : '#ffd34a'; x.fillRect(on ? 11 : 2, 2, 4, 4); x.fillStyle = '#ffffff'; x.fillRect(on ? 12 : 3, 3, 1, 1);
      return c;
    });
    // Checkpoint (terminal con bandera)
    SPR.ck = [0, 1].map(on => {
      const c = cv(16, 32), x = c.getContext('2d');
      x.fillStyle = '#2a2a3a'; x.fillRect(7, 6, 2, 26);
      x.fillStyle = '#5a5a7a'; x.fillRect(7, 6, 1, 26);
      x.fillStyle = '#14141e'; x.fillRect(2, 18, 12, 9);
      x.fillStyle = on ? '#1a5a2a' : '#262636'; x.fillRect(3, 19, 10, 7);
      x.fillStyle = on ? '#6aff8a' : '#5a5a7a';
      if (on) { x.fillRect(5, 22, 1, 1); x.fillRect(6, 23, 1, 1); x.fillRect(7, 22, 1, 1); x.fillRect(8, 21, 1, 1); x.fillRect(9, 20, 1, 1); }
      else { x.fillRect(5, 23, 4, 1); }
      x.fillStyle = '#14141e'; x.fillRect(4, 27, 8, 2);
      if (on) { x.fillStyle = '#4aff8a'; x.fillRect(9, 6, 6, 5); x.fillStyle = '#c8ffd8'; x.fillRect(9, 6, 6, 1); }
      else { x.fillStyle = '#8a8aa0'; x.fillRect(9, 6, 5, 4); }
      x.fillStyle = '#ffd34a'; x.fillRect(6, 4, 4, 3);
      return c;
    });
    // Núcleo final (1-4)
    SPR.core = [0, 1, 2, 3].map(f => {
      const c = cv(32, 32), x = c.getContext('2d');
      x.fillStyle = '#1a1030'; x.fillRect(4, 24, 24, 8); x.fillStyle = '#3a2a60'; x.fillRect(5, 25, 22, 2);
      const g = x.createRadialGradient(16, 13, 1, 16, 13, 12);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, ['#7ff6ff', '#a8fbff', '#7ff6ff', '#5ae0ff'][f]); g.addColorStop(1, 'rgba(60,120,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(16, 13, 12, 0, 7); x.fill();
      x.fillStyle = '#ffffff';
      for (let k = 0; k < 4; k++) { const a = f * 0.4 + k * Math.PI / 2; x.fillRect(Math.round(16 + Math.cos(a) * 9), Math.round(13 + Math.sin(a) * 9), 1, 1); }
      return c;
    });
    // bandera del banderín
    SPR.flag = sprite([
      '##############..',
      '#############...',
      '##ww#####ww##...',
      '#w####ww###w#...',
      '##ww#####ww##...',
      '#############...',
      '##############..',
      '..............  '.replace(/ /g, '.'),
    ], { '#': ['#8affc0', '#22c070', '#0e6a3c'], w: '#ffffff' }, null);
    buildBoss();
    buildFX();
  }

  // ------------------------------------------------------------ JEFE: EL GRAN BLOATWARE
  function buildBoss() {
    const W = 44, Hh = 40;
    const tints = [
      { b: ['#c89aff', '#8a4ad8', '#4a1a8a'], win: '#ffe6ff', bar: '#ff6ad0' },
      { b: ['#ffb08a', '#e0602a', '#8a2a10'], win: '#fff0e0', bar: '#ffd34a' },
      { b: ['#ff8a9a', '#d02a4a', '#6a0a20'], win: '#ffe0e6', bar: '#ff3a3a' },
    ];
    SPR.boss = [];
    tints.forEach((tc, phase) => {
      const frames = [];
      for (let f = 0; f < 4; f++) { // 0 idle, 1 idle2, 2 boca abierta, 3 agachado
        const c = cv(W, Hh), x = c.getContext('2d');
        const squash = f === 3 ? 4 : (f === 1 ? 1 : 0);
        const top = 6 + squash, bot = Hh - 5;
        // cuerpo hinchado (elipse)
        const rows = [];
        for (let y = 0; y < Hh; y++) {
          let r = '';
          for (let i = 0; i < W; i++) {
            const nx = (i - W / 2 + 0.5) / (W / 2 - 1), ny = (y - (top + bot) / 2) / ((bot - top) / 2);
            const blob = nx * nx * (1 + 0.15 * Math.sin(y * 0.7)) + ny * ny * ny * ny;
            r += blob < 1 && y >= top && y <= bot ? '#' : '.';
          }
          rows.push(r);
        }
        const body = sprite(rows, { '#': tc.b }, '#1a0624');
        x.drawImage(body, 0, 0);
        // ventanas emergentes pegadas (bloat)
        const wins = [[6, top + 14, 9, 7], [29, top + 15, 9, 6], [13, top + 22, 7, 5], [26, top + 23, 8, 5]];
        for (const [wx, wy, ww, wh] of wins) {
          x.fillStyle = '#1a0624'; x.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
          x.fillStyle = tc.win; x.fillRect(wx, wy, ww, wh);
          x.fillStyle = tc.bar; x.fillRect(wx, wy, ww, 2);
          x.fillStyle = '#ffffff'; x.fillRect(wx + ww - 2, wy, 1, 1);
          x.fillStyle = '#9a8ab0'; for (let k = 3; k < wh - 1; k += 2) x.fillRect(wx + 1, wy + k, ww - 3 - (k % 3), 1);
        }
        // corona de cables enredados
        const cols = ['#ffd34a', '#38d6f0', '#ff5c8a', '#8ef04a'];
        for (let k = 0; k < 4; k++) {
          x.strokeStyle = cols[k]; x.lineWidth = 1; x.beginPath();
          const bx = 10 + k * 8;
          x.moveTo(bx, top + 3); x.quadraticCurveTo(bx - 4 + (f % 2) * 2, top - 7, bx + 4, top - 3 + (k % 2) * 2); x.quadraticCurveTo(bx + 7, top, bx + 3, top + 2);
          x.stroke();
        }
        // ojos LED
        const ey = top + 5;
        for (const ex of [12, 26]) {
          x.fillStyle = '#1a0624'; x.fillRect(ex - 1, ey - 1, 9, 8);
          x.fillStyle = '#ffffff'; x.fillRect(ex, ey, 7, 6);
          x.fillStyle = '#ff2a3a'; x.fillRect(ex + 2, ey + 2, 3, 3);
          x.fillStyle = '#ffd0d0'; x.fillRect(ex + 2, ey + 2, 1, 1);
        }
        // cejas furiosas
        x.fillStyle = '#1a0624';
        for (let k = 0; k < 7; k++) { x.fillRect(11 + k, ey - 3 + Math.floor(k / 3), 1, 2); x.fillRect(33 - k, ey - 3 + Math.floor(k / 3), 1, 2); }
        // boca con dientes de tecla
        const mo = f === 2 ? 7 : 3;
        x.fillStyle = '#1a0624'; x.fillRect(13, ey + 9, 18, mo + 2);
        x.fillStyle = '#4a0a2a'; x.fillRect(14, ey + 10, 16, mo);
        x.fillStyle = '#f4f0ff';
        for (let k = 0; k < 4; k++) { x.fillRect(15 + k * 4, ey + 10, 3, 2); if (f === 2) x.fillRect(15 + k * 4, ey + 10 + mo - 2, 3, 2); }
        // patas
        x.fillStyle = '#1a0624'; x.fillRect(10, Hh - 6, 9, 6); x.fillRect(25, Hh - 6, 9, 6);
        x.fillStyle = '#3a2a4a'; x.fillRect(11, Hh - 5, 7, 3); x.fillRect(26, Hh - 5, 7, 3);
        frames.push(pair(c));
      }
      SPR.boss.push(frames);
    });
    SPR.bossWhite = SPR.boss[0].map(p => p.map(c => tint(c, '#ffffff')));
  }

  // ------------------------------------------------------------ PARTÍCULAS PRE-RENDERIZADAS
  function buildFX() {
    SPR.sparkle = [[1, '#ffffff'], [2, '#fff6a0'], [3, '#ffd34a']].map(([r, c]) => {
      const cv2 = cv(7, 7), x = cv2.getContext('2d'); x.fillStyle = c;
      x.fillRect(3, 3 - r, 1, r * 2 + 1); x.fillRect(3 - r, 3, r * 2 + 1, 1); return cv2;
    });
  }

  // ------------------------------------------------------------ TILES POR TEMA
  const THEMES = {
    surface: { gTop: ['#b6f58a', '#5fd068', '#2e9e4f'], soil: ['#e2a26a', '#c77d47', '#8f4f2a'], trace: '#a8673a', node: '#ffd25a',
      brick: ['#f6a06a', '#d2693c', '#6b2e1a'], semi: 'cloud' },
    cave: { gTop: ['#8a92ff', '#5a62d0', '#2d3170'], soil: ['#3c4290', '#2b2f6a', '#1a1c40'], trace: '#3fe0d0', node: '#ffe14a',
      brick: ['#8a94ff', '#4f58c0', '#1d2050'], semi: 'girder' },
    sky: { gTop: ['#c8ffd8', '#7ee8a8', '#3cae72'], soil: ['#d8c8ff', '#b29ae8', '#7a62b8'], trace: '#9a80d8', node: '#ffffff',
      brick: ['#ffb08a', '#e8805a', '#8a3a20'], semi: 'cloud' },
    fortress: { gTop: ['#9aa0c8', '#5a6088', '#2a2c40'], soil: ['#4e5272', '#3a3d58', '#22243a'], trace: '#6a6e98', node: '#ff5a5a',
      brick: ['#a890c8', '#6e5a8a', '#2b2238'], semi: 'grate' },
    bonus: { gTop: ['#6af6ff', '#2aa8c8', '#145070'], soil: ['#1e2244', '#151834', '#0a0c20'], trace: '#3a4ad0', node: '#ff6ad8',
      brick: ['#8a94ff', '#4f58c0', '#1d2050'], semi: 'girder' },
  };
  const tileSets = {};
  function tileCanvas(fn) { const c = cv(16, 16), x = c.getContext('2d'); fn(x, (i, j, col) => { x.fillStyle = col; x.fillRect(i, j, 1, 1); }); return c; }

  function makeTiles(theme) {
    const P = THEMES[theme], t = {};
    // suelo superior y relleno (2 variantes)
    t.top = [0, 1].map(v => tileCanvas((x, px) => {
      x.fillStyle = P.soil[1]; x.fillRect(0, 0, 16, 16);
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const h = hash(i + v * 31, j + 7);
        if (h % 11 === 0) px(i, j, P.soil[2]); else if (h % 17 === 0) px(i, j, P.soil[0]);
      }
      if (theme === 'fortress') {
        x.fillStyle = P.gTop[1]; x.fillRect(0, 0, 16, 3); x.fillStyle = P.gTop[0]; x.fillRect(0, 0, 16, 1);
        x.fillStyle = P.gTop[2]; x.fillRect(0, 3, 16, 1);
        px(2, 6, '#8a8fb0'); px(13, 6, '#8a8fb0'); px(2, 13, '#8a8fb0'); px(13, 13, '#8a8fb0');
        x.fillStyle = P.soil[2]; x.fillRect(0, 15, 16, 1); x.fillRect(15, 4, 1, 12);
        for (let k = 0; k < 3; k++) { x.fillStyle = '#22243a'; x.fillRect(5, 7 + k * 2, 6, 1); }
        return;
      }
      for (let i = 0; i < 16; i++) {
        const d = 3 + (hash(i + v * 13, 3) % 3);
        for (let j = 0; j < d; j++) px(i, j, j === 0 ? P.gTop[0] : (j === d - 1 ? P.gTop[2] : P.gTop[1]));
        if (hash(i, v) % 5 === 0) px(i, d, P.gTop[2]);
      }
      // trazas de circuito en la tierra
      x.fillStyle = P.trace; x.fillRect(2, 10, 7 + v * 3, 1); x.fillRect(8 + v * 3, 10, 1, 4);
      px(2, 10, P.node); px(8 + v * 3, 13, P.node);
    }));
    t.fill = [0, 1].map(v => tileCanvas((x, px) => {
      x.fillStyle = P.soil[1]; x.fillRect(0, 0, 16, 16);
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const h = hash(i + v * 57, j + 99);
        if (h % 11 === 0) px(i, j, P.soil[2]); else if (h % 19 === 0) px(i, j, P.soil[0]);
      }
      if (theme === 'fortress') {
        x.fillStyle = P.soil[2]; x.fillRect(0, 15, 16, 1); x.fillRect(15, 0, 1, 16); x.fillStyle = P.soil[0]; x.fillRect(0, 0, 16, 1); x.fillRect(0, 0, 1, 16);
        px(3, 3, '#8a8fb0'); px(12, 3, '#8a8fb0'); px(3, 12, '#8a8fb0'); px(12, 12, '#8a8fb0');
        return;
      }
      x.fillStyle = P.trace;
      if (v) { x.fillRect(4, 3, 1, 9); x.fillRect(4, 11, 8, 1); px(4, 3, P.node); px(11, 11, P.node); }
      else { x.fillRect(1, 6, 10, 1); x.fillRect(10, 6, 1, 7); px(1, 6, P.node); px(10, 12, P.node); }
    }));
    // ladrillo
    t.brick = tileCanvas((x, px) => {
      x.fillStyle = P.brick[2]; x.fillRect(0, 0, 16, 16);
      const bricks = [[0, 0, 8, 7], [8, 0, 8, 7], [-4, 8, 8, 7], [4, 8, 8, 7], [12, 8, 8, 7]];
      for (const [bx, by, bw, bh] of bricks) {
        x.fillStyle = P.brick[1]; x.fillRect(bx + 1, by + 1, bw - 1, bh - 1);
        x.fillStyle = P.brick[0]; x.fillRect(bx + 1, by + 1, bw - 1, 1); x.fillRect(bx + 1, by + 1, 1, bh - 1);
      }
      for (let k = 0; k < 6; k++) px(hash(k, 5) % 16, 1 + hash(k, 9) % 14, P.brick[0]);
    });
    // bloque "?" (4 fotogramas de brillo) — terminal dorado con interrogante
    t.q = [0, 1, 2, 3].map(f => tileCanvas((x, px) => {
      const base = ['#ffc93c', '#ffd864', '#ffe98a', '#ffd864'][f];
      x.fillStyle = '#5a3108'; x.fillRect(0, 0, 16, 16);
      x.fillStyle = base; x.fillRect(1, 1, 14, 14);
      x.fillStyle = '#fff6c0'; x.fillRect(1, 1, 14, 1); x.fillRect(1, 1, 1, 14);
      x.fillStyle = '#c47a12'; x.fillRect(1, 14, 14, 1); x.fillRect(14, 1, 1, 14);
      px(3, 3, '#c47a12'); px(12, 3, '#c47a12'); px(3, 12, '#c47a12'); px(12, 12, '#c47a12');
      const q = ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'];
      q.forEach((r, j) => { for (let i = 0; i < 5; i++) if (r[i] === '#') { px(6 + i, 4 + j, '#7a3c06'); px(5 + i, 3 + j, '#ffffff'); } });
    }));
    t.used = tileCanvas((x, px) => {
      x.fillStyle = '#3a1f10'; x.fillRect(0, 0, 16, 16);
      x.fillStyle = theme === 'fortress' || theme === 'cave' || theme === 'bonus' ? '#6a5a7a' : '#a26c48'; x.fillRect(1, 1, 14, 14);
      x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(1, 1, 14, 1); x.fillRect(1, 1, 1, 14);
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(1, 14, 14, 1); x.fillRect(14, 1, 1, 14);
      for (const [a, b] of [[3, 3], [12, 3], [3, 12], [12, 12]]) { px(a, b, '#2a140a'); px(a - 1, b - 1, 'rgba(255,255,255,0.4)'); }
    });
    // bloque duro: tecla de teclado
    const keyGlyphs = ['A', 'S', 'D', 'W', 'Z', 'X', 'C', 'Q', 'E', 'R'];
    t.hard = keyGlyphs.map((gch, k) => tileCanvas((x, px) => {
      const dark = theme === 'fortress' || theme === 'cave';
      x.fillStyle = dark ? '#16141e' : '#4a4660'; x.fillRect(0, 0, 16, 16);
      x.fillStyle = dark ? '#4a4660' : '#b8b4c8'; x.fillRect(1, 1, 14, 14);
      x.fillStyle = dark ? '#6c6888' : '#e8e6f0'; x.fillRect(2, 2, 12, 10);
      x.fillStyle = dark ? '#8a86a8' : '#ffffff'; x.fillRect(2, 2, 12, 1);
      x.fillStyle = dark ? '#34304a' : '#8a86a0'; x.fillRect(1, 13, 14, 2);
      const g = FONT[gch].split('|');
      g.forEach((r, j) => { if (j % 2 === 0 || j === 6) for (let i = 0; i < 5; i++) if (r[i] === '#') px(4 + Math.floor(i * 0.8), 3 + Math.floor(j * 0.7), dark ? '#2a2638' : '#8a86a0'); });
      void k;
    }));
    // tuberías (conductos de cables)
    const pc = theme === 'fortress' ? ['#e0a0ff', '#9a5ad8', '#5a2a8a', '#2a0e4a'] : theme === 'cave' ? ['#ffb0e8', '#d85ab8', '#8a2a70', '#3a0a30'] : ['#8ff5e2', '#2fbfa8', '#137a6b', '#0b3e37'];
    const band = ['#ffd08a', '#e08a3c', '#a85a20'];
    const pipeBody = (x, px, side) => {
      x.fillStyle = pc[3]; x.fillRect(0, 0, 16, 16);
      if (side === 'L') {
        x.fillStyle = pc[1]; x.fillRect(2, 0, 14, 16); x.fillStyle = pc[0]; x.fillRect(4, 0, 3, 16); x.fillStyle = pc[3]; x.fillRect(1, 0, 1, 16);
        x.fillStyle = pc[2]; x.fillRect(12, 0, 4, 16);
      } else {
        x.fillStyle = pc[2]; x.fillRect(0, 0, 13, 16); x.fillStyle = pc[1]; x.fillRect(0, 0, 4, 16); x.fillStyle = pc[3]; x.fillRect(13, 0, 1, 16);
        x.fillStyle = '#ffffff22'; x.fillRect(5, 0, 1, 16);
      }
      // cables visibles
      for (let j = 3; j < 16; j += 6) { x.fillStyle = pc[3]; x.fillRect(side === 'L' ? 2 : 0, j, side === 'L' ? 14 : 13, 1); }
    };
    t.pipeL = tileCanvas((x, px) => pipeBody(x, px, 'L'));
    t.pipeR = tileCanvas((x, px) => pipeBody(x, px, 'R'));
    const pipeTop = (x, px, side) => {
      x.fillStyle = pc[3]; x.fillRect(0, 0, 16, 16);
      if (side === 'L') {
        x.fillStyle = band[1]; x.fillRect(1, 1, 15, 12); x.fillStyle = band[0]; x.fillRect(3, 1, 3, 12); x.fillRect(1, 1, 15, 1);
        x.fillStyle = band[2]; x.fillRect(1, 11, 15, 2);
        x.fillStyle = pc[3]; x.fillRect(0, 13, 16, 1); x.fillStyle = pc[1]; x.fillRect(3, 14, 13, 2); x.fillStyle = pc[0]; x.fillRect(5, 14, 3, 2);
        x.fillStyle = '#05080a'; x.fillRect(4, 1, 12, 2); x.fillStyle = band[0]; x.fillRect(1, 1, 3, 1);
      } else {
        x.fillStyle = band[1]; x.fillRect(0, 1, 15, 12); x.fillStyle = band[2]; x.fillRect(10, 1, 5, 12); x.fillStyle = band[0]; x.fillRect(0, 1, 15, 1);
        x.fillStyle = band[2]; x.fillRect(0, 11, 15, 2);
        x.fillStyle = pc[3]; x.fillRect(0, 13, 16, 1); x.fillStyle = pc[2]; x.fillRect(0, 14, 12, 2); x.fillStyle = pc[1]; x.fillRect(0, 14, 3, 2);
        x.fillStyle = '#05080a'; x.fillRect(0, 1, 12, 2);
      }
      for (let i = 2; i < 15; i += 4) px(i, 7, band[2]);
    };
    t.pipeTL = tileCanvas((x, px) => pipeTop(x, px, 'L'));
    t.pipeTR = tileCanvas((x, px) => pipeTop(x, px, 'R'));
    // tubería lateral: rotaciones
    const rot = (src, q) => { const c = cv(16, 16), x = c.getContext('2d'); x.translate(8, 8); x.rotate(q * Math.PI / 2); x.drawImage(src, -8, -8); return c; };
    t.spipeTop = rot(t.pipeTR, 3); t.spipeBot = rot(t.pipeTL, 3);
    t.sbodyTop = rot(t.pipeR, 3); t.sbodyBot = rot(t.pipeL, 3);
    // plataforma de paso
    t.semi = tileCanvas((x, px) => {
      if (P.semi === 'cloud') {
        x.fillStyle = '#c8dcff'; x.fillRect(0, 3, 16, 7);
        x.fillStyle = '#ffffff'; x.fillRect(0, 2, 16, 6);
        for (let i = 0; i < 16; i += 4) { x.fillRect(i + 1, 1, 3, 1); }
        x.fillStyle = '#e8f2ff'; x.fillRect(0, 7, 16, 2); x.fillStyle = '#9ab8f0'; x.fillRect(0, 9, 16, 1);
        px(3, 4, '#d8e6ff'); px(11, 5, '#d8e6ff');
      } else if (P.semi === 'girder') {
        x.fillStyle = '#20243a'; x.fillRect(0, 0, 16, 7);
        x.fillStyle = '#7a86c8'; x.fillRect(0, 1, 16, 2); x.fillStyle = '#4a5490'; x.fillRect(0, 3, 16, 3);
        for (let i = 0; i < 16; i += 4) { x.fillStyle = '#20243a'; x.fillRect(i + 1, 3, 2, 2); }
        px(2, 1, '#3fe0d0'); px(10, 1, '#3fe0d0');
      } else {
        x.fillStyle = '#16141e'; x.fillRect(0, 0, 16, 6);
        x.fillStyle = '#8a86a8'; x.fillRect(0, 1, 16, 1); x.fillStyle = '#5a5672'; x.fillRect(0, 2, 16, 3);
        for (let i = 1; i < 16; i += 3) { x.fillStyle = '#16141e'; x.fillRect(i, 2, 1, 3); }
      }
    });
    // pinchos
    t.spike = tileCanvas((x, px) => {
      for (let k = 0; k < 4; k++) for (let j = 0; j < 8; j++) {
        const w = Math.floor((j + 1) / 2);
        x.fillStyle = '#e8ecf8'; x.fillRect(k * 4 + 2 - w, 8 + j - 8 + 8, 1, 1);
        x.fillStyle = j < 2 ? '#ffffff' : '#c0c6dc'; x.fillRect(k * 4 + 2 - w, 8 + j, w * 2, 1);
        x.fillStyle = '#6a7090'; x.fillRect(k * 4 + 2, 8 + j, w, 1);
      }
      x.fillStyle = '#2a2c40'; x.fillRect(0, 14, 16, 2);
    });
    t.spikeC = flipV(t.spike);
    // puertas
    t.door = tileCanvas((x, px) => {
      x.fillStyle = '#1a1626'; x.fillRect(0, 0, 16, 16);
      for (let i = 1; i < 16; i += 5) { x.fillStyle = '#8a86a8'; x.fillRect(i, 0, 3, 16); x.fillStyle = '#c8c4e0'; x.fillRect(i, 0, 1, 16); }
      x.fillStyle = '#ffb02a'; x.fillRect(0, 7, 16, 2); x.fillStyle = '#2a1a06'; for (let i = 1; i < 16; i += 3) x.fillRect(i, 7, 1, 2);
    });
    t.doork = tileCanvas((x, px) => {
      x.fillStyle = '#0e2a1c'; x.fillRect(0, 0, 16, 16);
      x.fillStyle = '#1e6a44'; x.fillRect(1, 0, 14, 16); x.fillStyle = '#3aaa70'; x.fillRect(1, 0, 1, 16);
      x.fillStyle = '#0e2a1c'; x.fillRect(5, 5, 6, 6); x.fillStyle = '#c8cce0'; x.fillRect(6, 6, 4, 3); x.fillStyle = '#0e2a1c'; x.fillRect(7, 7, 1, 1); x.fillRect(8, 7, 1, 1);
      px(3, 2, '#8affc0'); px(12, 13, '#8affc0');
    });
    t.gate = tileCanvas((x) => {
      x.fillStyle = '#200810'; x.fillRect(0, 0, 16, 16);
      for (let i = 1; i < 16; i += 4) { x.fillStyle = '#d02a4a'; x.fillRect(i, 0, 2, 16); x.fillStyle = '#ff8a9a'; x.fillRect(i, 0, 1, 16); }
      x.fillStyle = '#ffd34a'; x.fillRect(0, 3, 16, 1); x.fillRect(0, 12, 16, 1);
    });
    t.bossdoor = tileCanvas((x) => {
      x.fillStyle = '#140a24'; x.fillRect(0, 0, 16, 16);
      for (let i = 1; i < 16; i += 4) { x.fillStyle = '#8a4ad8'; x.fillRect(i, 0, 2, 16); x.fillStyle = '#c89aff'; x.fillRect(i, 0, 1, 16); }
      x.fillStyle = '#ff5cd8'; x.fillRect(0, 7, 16, 2);
    });
    tileSets[theme] = t;
  }

  // ------------------------------------------------------------ FONDOS CON PARALLAX
  const bgs = {};
  function hillLayer(w, h, base, amp, freq, cols, seed, dither) {
    const c = cv(w, h), x = c.getContext('2d');
    for (let i = 0; i < w; i++) {
      const y = Math.round(base - Math.abs(Math.sin((i + seed) * freq)) * amp - Math.sin((i + seed * 3) * freq * 2.7) * amp * 0.25);
      x.fillStyle = cols[0]; x.fillRect(i, y, 1, 2);
      x.fillStyle = cols[1]; x.fillRect(i, y + 2, 1, h - y);
      if (dither) for (let j = y + 4; j < h; j += 3) if (hash(i, j + seed) % 7 === 0) { x.fillStyle = cols[2]; x.fillRect(i, j, 1, 1); }
    }
    return c;
  }
  function makeBG(theme) {
    const L = {};
    if (theme === 'surface') {
      L.far = hillLayer(512, 224, 150, 46, 0.018, ['#d6e2ff', '#a7b8f0', '#93a6e6'], 10, true);
      L.mid = hillLayer(512, 224, 178, 30, 0.03, ['#b8f5a0', '#7fd88a', '#5fbf70'], 77, true);
      // dígitos binarios en las colinas
      const x = L.mid.getContext('2d');
      for (let k = 0; k < 40; k++) { const i = hash(k, 3) % 512, j = 190 + hash(k, 8) % 30; drawRaw(x, hash(k, 1) % 2 ? '1' : '0', i, j, '#6acb7c', 1); }
    } else if (theme === 'cave') {
      L.far = cv(512, 224); const x = L.far.getContext('2d');
      x.strokeStyle = '#232a62'; x.lineWidth = 1;
      for (let k = 0; k < 26; k++) {
        let px0 = hash(k, 1) % 512, py0 = 30 + hash(k, 2) % 170;
        x.beginPath(); x.moveTo(px0 + 0.5, py0 + 0.5);
        for (let s = 0; s < 4; s++) { if (s % 2) py0 += (hash(k, s) % 40) - 20; else px0 += 20 + hash(k, s + 9) % 50; x.lineTo(px0 + 0.5, py0 + 0.5); }
        x.stroke();
      }
      L.mid = cv(512, 224); const y = L.mid.getContext('2d');
      for (let k = 0; k < 18; k++) {
        const sx = hash(k, 4) % 512, len = 14 + hash(k, 5) % 30, w = 6 + hash(k, 6) % 10;
        y.fillStyle = '#1a1e4a';
        for (let j = 0; j < len; j++) { const ww = Math.max(1, Math.round(w * (1 - j / len))); y.fillRect(sx - ww / 2, 32 + j, ww, 1); }
        const cx = hash(k, 7) % 512, ch = 8 + hash(k, 8) % 14;
        for (let j = 0; j < ch; j++) { y.fillStyle = j < 2 ? '#3a3f9a' : '#262b6e'; y.fillRect(cx - (ch - j) / 3, 224 - 32 - j, (ch - j) / 1.5, 1); }
      }
    } else if (theme === 'sky') {
      L.far = cv(512, 224); const x = L.far.getContext('2d');
      for (let k = 0; k < 12; k++) {
        const ix = hash(k, 1) % 512, iy = 60 + hash(k, 2) % 70, iw = 20 + hash(k, 3) % 40;
        x.fillStyle = '#c4d4fa'; x.fillRect(ix, iy, iw, 4); x.fillStyle = '#d8e4ff'; x.fillRect(ix + 2, iy - 2, iw - 4, 2);
        for (let j = 0; j < 10; j++) { x.fillStyle = '#b8c8f2'; x.fillRect(ix + j * 0.6 + 3, iy + 4 + j, iw - j * 1.2 - 6, 1); }
      }
      L.mid = cv(512, 224); const y = L.mid.getContext('2d');
      for (let i = 0; i < 512; i += 1) {
        const top = 176 + Math.round(Math.sin(i * 0.05) * 6 + Math.sin(i * 0.13) * 3);
        y.fillStyle = '#ffffff'; y.fillRect(i, top, 1, 224 - top);
        y.fillStyle = '#e6f0ff'; y.fillRect(i, top + 8, 1, 224 - top);
        y.fillStyle = '#cfe0ff'; y.fillRect(i, top + 22, 1, 224 - top);
      }
    } else if (theme === 'fortress') {
      L.far = cv(512, 224); const x = L.far.getContext('2d');
      for (let k = 0; k < 8; k++) {
        const rx = k * 64 + 8;
        x.fillStyle = '#1e1430'; x.fillRect(rx, 50, 44, 150);
        x.fillStyle = '#2c2046'; x.fillRect(rx + 2, 52, 40, 146);
        for (let j = 0; j < 12; j++) { x.fillStyle = '#1a1028'; x.fillRect(rx + 4, 56 + j * 12, 36, 9); x.fillStyle = '#3a2c58'; x.fillRect(rx + 4, 56 + j * 12, 36, 1); }
      }
      L.mid = cv(512, 224); const y = L.mid.getContext('2d');
      for (let k = 0; k < 4; k++) {
        const ax = k * 128 + 40;
        y.fillStyle = '#140c22'; y.fillRect(ax, 48, 18, 176); y.fillStyle = '#22163a'; y.fillRect(ax + 2, 48, 3, 176);
      }
    } else {
      L.far = cv(512, 224); const x = L.far.getContext('2d');
      x.strokeStyle = '#1c1f4a';
      for (let i = 0; i < 512; i += 16) { x.beginPath(); x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, 224); x.stroke(); }
      for (let j = 0; j < 224; j += 16) { x.beginPath(); x.moveTo(0, j + 0.5); x.lineTo(512, j + 0.5); x.stroke(); }
      L.mid = cv(512, 224);
    }
    bgs[theme] = L;
  }
  const SKY = {
    surface: ['#5ab8ff', '#7cc8ff', '#9ed8ff', '#c0e8ff', '#dff4ff'],
    cave: ['#090b22', '#0d1030', '#11153c', '#161a48', '#1b2054'],
    sky: ['#6fcaff', '#94daff', '#b6e8ff', '#d4f2ff', '#effbff'],
    fortress: ['#0d0718', '#140a24', '#1c0f30', '#26143e', '#32184a'],
    bonus: ['#05050f', '#070818', '#0a0b20', '#0c0e28', '#0f1130'],
  };
  function drawSky(ctx, theme) {
    const c = SKY[theme];
    const bandH = Math.ceil(224 / c.length);
    for (let k = 0; k < c.length; k++) {
      ctx.fillStyle = c[k]; ctx.fillRect(0, k * bandH, 320, bandH + 1);
      if (k > 0) { // tramado entre bandas
        ctx.fillStyle = c[k - 1];
        for (let i = 0; i < 320; i += 2) { ctx.fillRect(i + ((k * 3) % 2), k * bandH, 1, 1); ctx.fillRect(i + 1, k * bandH + 2, 1, 1); }
      }
    }
  }
  function drawLayer(ctx, img, ox, oy) {
    const w = img.width; let x = -Math.floor(ox % w); if (x > 0) x -= w;
    for (; x < 320; x += w) ctx.drawImage(img, x, oy || 0);
  }
  // nubes con ojos (decoración animada)
  function cloud(ctx, x, y, s, t, face) {
    x = Math.round(x); y = Math.round(y);
    const w = 18 * s, h = 8 * s;
    ctx.fillStyle = '#b8d0f8'; ctx.fillRect(x + 2, y + h - 2, w - 4, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y + 3, w, h - 3); ctx.fillRect(x + 3, y, w * 0.35, 4); ctx.fillRect(x + w * 0.45, y - 2, w * 0.35, 6);
    ctx.fillStyle = '#e4eeff'; ctx.fillRect(x, y + h - 3, w, 2);
    if (face) {
      const blink = (Math.floor(t / 7) % 40) === 0;
      ctx.fillStyle = '#3a4a7a';
      const ex = x + w * 0.4, ey = y + 4;
      if (blink) { ctx.fillRect(ex, ey + 1, 2, 1); ctx.fillRect(ex + 6, ey + 1, 2, 1); }
      else { ctx.fillRect(ex, ey, 1, 2); ctx.fillRect(ex + 6, ey, 1, 2); }
      ctx.fillStyle = '#ffb0c8'; ctx.fillRect(ex - 3, ey + 3, 2, 1); ctx.fillRect(ex + 8, ey + 3, 2, 1);
    }
  }

  function init() {
    build();
    for (const th of Object.keys(THEMES)) { makeTiles(th); makeBG(th); }
  }

  return { init, SPR, clawd, text, textW, tileSets, bgs, drawSky, drawLayer, cloud, cv, hash, flipH, tint, sprite, THEMES };
})();
