// Generador de niveles de Clawd Quest.
// Construye los mapas con pequeñas funciones (suelo, tuberías, escaleras...) y
// los exporta como ARRAYS DE STRINGS (un carácter por tile) en src/levels.js.
// El HTML final contiene directamente esos arrays, así que se pueden editar a mano.
//
// Uso: node tools/levelgen.js   (escribe src/levels.js)
'use strict';
const fs = require('fs');
const path = require('path');
const H = 14;

class Map2D {
  constructor(w) { this.w = w; this.g = Array.from({ length: H }, () => Array(w).fill('.')); }
  set(x, y, c) { if (x >= 0 && x < this.w && y >= 0 && y < H) this.g[y][x] = c; }
  get(x, y) { return (x >= 0 && x < this.w && y >= 0 && y < H) ? this.g[y][x] : '#'; }
  fill(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  ground(x0, x1, top = 12) { this.fill(x0, top, x1, 13, '#'); }
  hole(x0, x1) { this.fill(x0, 12, x1, 13, '.'); }
  row(x, y, s) { for (let i = 0; i < s.length; i++) if (s[i] !== ' ') this.set(x + i, y, s[i]); }
  pipe(x, top, bottom = 11) {
    this.set(x, top, '['); this.set(x + 1, top, ']');
    for (let y = top + 1; y <= bottom; y++) { this.set(x, y, '{'); this.set(x + 1, y, '}'); }
  }
  // escalera de bloques duros: dir=+1 sube hacia la derecha, -1 baja
  stairs(x, n, dir = 1, base = 11) {
    for (let i = 0; i < n; i++) {
      const h = dir > 0 ? i + 1 : n - i;
      this.fill(x + i, base - h + 1, x + i, base, 'X');
    }
  }
  island(x0, x1, top) { this.fill(x0, top, x1, 13, '#'); }
  lava(x0, x1) { this.fill(x0, 12, x1, 12, 'L'); this.fill(x0, 13, x1, 13, 'l'); }
  // tubería lateral: boca en (x, y-1..y), cuerpo a la derecha
  sidePipe(x, y, bodyLen = 1) {
    this.set(x, y - 1, '('); this.set(x, y, '(');
    for (let i = 1; i <= bodyLen; i++) { this.set(x + i, y - 1, '-'); this.set(x + i, y, '-'); }
  }
  out() { return this.g.map(r => r.join('')); }
}

// ---------------------------------------------------------------- 1-1
function level11() {
  const m = new Map2D(210);
  m.ground(0, 209);
  m.hole(54, 55); m.hole(86, 88); m.hole(127, 128); m.hole(157, 159);
  m.set(8, 8, '?');
  m.row(12, 8, 'B?M?B');
  m.set(14, 4, '?');
  m.set(20, 11, 'b');
  m.pipe(23, 10);
  m.set(29, 11, 'b');
  m.pipe(33, 9);
  m.set(38, 11, 'b'); m.set(40, 11, 'b');
  m.pipe(44, 9);                      // entrada a la sala bonus
  m.set(50, 8, 'H');                  // bloque oculto con vida extra
  m.row(60, 8, 'B?BB?B');
  m.row(62, 4, 'B?B');
  m.set(63, 7, 'b');
  m.set(70, 11, 'g');
  m.set(74, 8, '?'); m.set(77, 8, 'B'); m.set(77, 4, 'S'); m.set(80, 8, '?');
  m.set(83, 11, 'b');
  m.set(92, 11, '!');
  m.stairs(96, 3, 1); m.stairs(99, 3, -1);
  m.set(104, 11, 'b'); m.set(106, 11, 'b');
  m.row(108, 8, 'BCB');
  m.set(112, 8, '?');
  m.pipe(118, 10);                    // salida de la sala bonus
  m.set(123, 11, 'g');
  m.row(131, 8, 'B?B?B');
  m.set(133, 4, '?');
  m.set(135, 11, 'b'); m.set(138, 11, 'b');
  m.row(142, 8, '?M?');
  m.set(148, 11, 'g');
  m.row(152, 4, 'ooo');
  m.set(163, 11, 'b'); m.set(166, 11, 'b'); m.set(169, 11, 'b');
  m.row(172, 8, 'B?B');
  m.stairs(178, 6, 1);
  m.set(190, 11, 'G');
  m.set(196, 11, 'K');

  const b = new Map2D(20);
  b.ground(0, 19);
  b.fill(0, 0, 0, 13, '#'); b.fill(19, 0, 19, 13, '#');
  b.row(4, 2, 'BBBBBBBBBBBBBBB');
  b.row(5, 6, 'oooooooooo');
  b.row(5, 9, 'oooooooooo');
  b.row(7, 4, 'oooooo');
  b.sidePipe(17, 11, 1);
  return {
    id: '1-1', name: 'Colinas de Píxeles', time: 300, music: 'surface',
    start: { area: 'main', x: 3, y: 11, mode: 'stand' },
    areas: {
      main: { theme: 'surface', prog: 0, map: m.out() },
      bonus: { theme: 'bonus', prog: -1e6, secret: true, map: b.out() },
    },
    links: [
      { from: 'main:44,9', to: { area: 'bonus', x: 2, y: 1, mode: 'drop' } },
      { from: 'bonus:17,11', to: { area: 'main', x: 118, y: 10, mode: 'pipeUp' } },
    ],
  };
}

// ---------------------------------------------------------------- 1-2
function level12() {
  const m = new Map2D(200);
  m.fill(0, 0, 199, 1, '#');
  m.ground(0, 199);
  m.pipe(2, 10);                      // tubería de entrada
  m.row(8, 8, 'B?BM');
  m.fill(16, 2, 30, 6, 'B');          // techo bajo de ladrillos
  m.set(20, 7, 'x'); m.set(27, 7, 'x');
  m.set(23, 11, 'b'); m.set(26, 11, 'b');
  m.pipe(33, 9); m.set(33, 8, 'c');
  m.hole(38, 39);
  m.fill(42, 11, 43, 11, 'X'); m.fill(44, 10, 45, 11, 'X');
  m.row(46, 8, 'BBBBBBB');
  m.set(49, 7, 'g');
  m.set(54, 9, 'h');                  // escalón oculto
  m.fill(56, 6, 61, 6, 'X');          // repisa alta
  m.pipe(58, 4, 5);                   // tubería secreta (atajo)
  m.set(62, 11, 'b'); m.set(64, 11, 'b');
  m.hole(67, 69);
  m.row(71, 8, '?B?');
  m.set(73, 2, 'x');
  m.hole(76, 79); m.row(77, 9, 'BB');
  m.set(83, 2, 'x');
  m.set(85, 11, 'g'); m.set(89, 11, 'b');
  m.row(86, 8, 'B?BSB');
  m.fill(93, 2, 98, 5, 'B');
  m.fill(96, 9, 96, 11, 'X');
  m.set(101, 11, 'b'); m.set(104, 11, 'b');
  m.fill(107, 10, 107, 11, 'X');
  m.set(112, 11, '!');
  m.row(116, 8, 'BBBB');
  m.set(118, 7, 'b');
  m.row(121, 5, 'B?B');
  m.set(124, 2, 'x');
  m.pipe(128, 10);                    // salida del atajo
  m.set(133, 11, 'g');
  m.hole(136, 147);
  m.row(137, 9, 'III'); m.row(142, 8, 'III');
  m.set(152, 11, 'b'); m.set(155, 11, 'b'); m.set(158, 11, 'g');
  m.fill(161, 2, 176, 5, 'B');
  m.set(164, 6, 'x'); m.set(171, 6, 'x');
  m.row(166, 9, '?C?');
  m.set(174, 11, 'b');
  m.stairs(180, 3, 1); m.stairs(184, 3, -1);
  m.sidePipe(191, 11, 2);             // tubería de salida
  m.fill(191, 2, 191, 9, '#');
  m.fill(192, 2, 193, 9, 'P');        // conducto vertical decorativo
  m.fill(194, 2, 199, 11, '#');

  const b = new Map2D(24);
  b.ground(0, 23);
  b.fill(0, 0, 0, 13, '#'); b.fill(23, 0, 23, 13, '#');
  b.row(4, 2, 'BBBBBBBBBBBBBBBBBBB');
  b.row(4, 5, 'oooooooooooooo');
  b.row(4, 7, 'oooooooooooooo');
  b.row(6, 9, 'X.X.X.X.X.X');
  b.set(12, 4, '1');
  b.pipe(20, 10);

  const e = new Map2D(40);
  e.ground(0, 39);
  e.pipe(2, 10);
  e.stairs(10, 4, 1);
  e.set(22, 11, 'G');
  e.set(28, 11, 'K');
  return {
    id: '1-2', name: 'Cuevas de Circuitos', time: 300, music: 'cave',
    start: { area: 'main', x: 2, y: 10, mode: 'pipeUp' },
    areas: {
      main: { theme: 'cave', prog: 0, map: m.out() },
      bonus: { theme: 'bonus', prog: -1e6, secret: true, map: b.out() },
      exit: { theme: 'surface', prog: 100000, map: e.out() },
    },
    links: [
      { from: 'main:58,4', to: { area: 'bonus', x: 2, y: 1, mode: 'drop' } },
      { from: 'bonus:20,10', to: { area: 'main', x: 128, y: 10, mode: 'pipeUp' } },
      { from: 'main:191,11', to: { area: 'exit', x: 2, y: 10, mode: 'pipeUp' } },
    ],
  };
}

// ---------------------------------------------------------------- 1-3
function level13() {
  const m = new Map2D(228);
  m.island(0, 9, 11);
  m.island(12, 18, 10); m.set(15, 6, 'M');
  m.row(22, 9, '___');
  m.island(28, 33, 10); m.set(31, 9, 'b');
  m.row(36, 10, 'fff'); m.row(41, 9, 'fff');
  m.island(46, 53, 9); m.set(49, 5, 'V');
  m.row(56, 9, '===');
  m.set(59, 6, 'p');
  m.row(62, 8, '===');
  m.island(67, 75, 11); m.set(73, 10, 'T'); m.set(69, 10, 'g');
  m.row(71, 3, 'ooo'); m.set(72, 2, '1');
  m.island(79, 83, 10);
  m.island(87, 90, 9);
  m.row(94, 9, '___');
  m.island(100, 105, 10); m.set(103, 9, 'b');
  m.set(107, 6, 'p');
  m.island(109, 114, 9); m.set(111, 8, '!');
  m.row(117, 9, 'fff');
  m.island(121, 125, 10); m.set(123, 9, 'b');
  m.row(116, 5, '?.?');
  m.row(128, 9, '___');
  m.island(133, 135, 9);
  // estanque: hay que nadar
  m.fill(136, 13, 160, 13, '#');
  m.fill(136, 9, 160, 9, '~'); m.fill(136, 10, 160, 12, 'w');
  m.fill(144, 11, 145, 12, 'X'); m.fill(152, 10, 153, 12, 'X');
  m.row(139, 11, 'ooo'); m.row(147, 11, 'ooo'); m.row(155, 11, 'oo');
  m.island(161, 165, 9);
  m.set(167, 5, 'p');
  m.island(169, 173, 10);
  m.row(176, 10, 'fff');
  m.island(181, 186, 9); m.set(184, 8, 'a'); m.row(182, 5, 'B?B');
  m.row(190, 8, '___');
  m.island(196, 200, 10); m.set(198, 9, 'g');
  m.set(202, 6, 'p');
  m.island(204, 227, 10);
  m.stairs(206, 3, 1, 9);
  m.set(214, 9, 'G');
  m.set(219, 9, 'K');

  const c = new Map2D(60);
  c.fill(0, 11, 59, 11, '=');
  c.row(6, 8, 'oooooooooooooooooooo');
  c.row(30, 6, 'oooooooooooooooo');
  c.row(14, 5, '?.?.?');
  c.set(40, 10, 'T');
  return {
    id: '1-3', name: 'Cielo de Datos', time: 300, music: 'sky',
    start: { area: 'main', x: 3, y: 10, mode: 'stand' },
    areas: {
      main: { theme: 'sky', prog: 0, map: m.out(), wind: [{ x0: 78, x1: 132, s: 0.32 }] },
      clouds: { theme: 'sky', prog: -1e6, secret: true, map: c.out(),
        exit: { area: 'main', x: 170, y: 2, mode: 'drop' } },
    },
    links: [
      { from: 'vine:main', to: { area: 'clouds', x: 3, y: 10, mode: 'stand' } },
    ],
  };
}

// ---------------------------------------------------------------- 1-4
function level14() {
  const m = new Map2D(204);
  m.fill(0, 0, 203, 2, '#');
  m.ground(0, 203);
  m.lava(13, 15); m.set(14, 12, 'z');
  m.set(21, 9, 'R');
  m.row(27, 8, 'B?MB');
  m.set(34, 11, 'a');
  m.lava(38, 42); m.row(39, 10, 'fff');
  m.fill(45, 3, 54, 8, '#');          // pasillo con palanca y puerta
  m.set(48, 11, '/');
  m.fill(52, 9, 52, 11, 'D');
  m.row(58, 11, '^^^');
  m.set(66, 9, 'J');
  m.lava(72, 80); m.row(74, 10, '___');
  m.set(84, 11, '!');
  m.set(86, 8, 'H');                  // secreto: vida extra oculta
  m.row(90, 8, 'B?B?B');
  m.set(89, 11, 'a'); m.set(95, 11, 'a');
  m.fill(103, 3, 114, 8, '#');        // pasillo con llave y puerta
  m.set(107, 11, 'k');
  m.fill(113, 9, 113, 11, 'd');
  m.set(118, 9, 'R');
  m.lava(121, 122); m.set(121, 12, 'z');
  m.row(125, 11, '^^');
  m.set(128, 9, 'J');
  m.lava(131, 132); m.set(132, 12, 'z');
  m.lava(135, 149); m.row(136, 10, 'fff'); m.row(141, 9, 'fff'); m.row(146, 10, 'fff');
  m.row(153, 8, 'BMB');
  m.set(158, 11, '!');
  // arena del jefe
  m.fill(167, 3, 167, 8, '#'); m.fill(167, 9, 167, 11, '7');
  m.fill(188, 3, 188, 8, '#'); m.fill(188, 9, 188, 11, '8');
  m.row(171, 8, '==='); m.row(182, 8, '===');
  m.set(196, 11, 'E');
  return {
    id: '1-4', name: 'Fortaleza de Servidores', time: 400, music: 'fortress',
    start: { area: 'main', x: 3, y: 11, mode: 'stand' },
    areas: {
      main: { theme: 'fortress', prog: 0, map: m.out() },
    },
    links: [],
    boss: { area: 'main', arenaX: 168, arenaW: 20, spawn: 182 },
  };
}

const levels = [level11(), level12(), level13(), level14()];

// ---- serialización legible: un string por fila
function ser(lv) {
  const L = [];
  L.push('  {');
  for (const k of ['id', 'name', 'time', 'music']) L.push(`    ${k}: ${JSON.stringify(lv[k])},`);
  L.push(`    start: ${JSON.stringify(lv.start)},`);
  L.push('    areas: {');
  for (const [an, a] of Object.entries(lv.areas)) {
    L.push(`      ${an}: {`);
    for (const [k, v] of Object.entries(a)) if (k !== 'map') L.push(`        ${k}: ${JSON.stringify(v)},`);
    L.push('        map: [');
    for (const r of a.map) L.push(`          ${JSON.stringify(r)},`);
    L.push('        ],');
    L.push('      },');
  }
  L.push('    },');
  L.push(`    links: ${JSON.stringify(lv.links)},`);
  if (lv.boss) L.push(`    boss: ${JSON.stringify(lv.boss)},`);
  L.push('  },');
  return L.join('\n');
}

const header = `// ============================================================================
// NIVELES — un carácter por tile (14 filas). Generado por tools/levelgen.js,
// pero se puede editar a mano directamente aquí.
// Leyenda: . vacío  # suelo  B ladrillo  ? bloque chip  M bloque power-up
//  S bloque estrella  1 bloque vida  H/h bloque oculto (vida/chip)  C ladrillo multi-chip
//  V ladrillo con enredadera  N ladrillo con power-up  X bloque tecla (duro)
//  [ ] { } tubería vertical  ( - tubería lateral  P conducto decorativo  = plataforma de paso
//  ~ w agua  L l lava eléctrica  ^ pinchos  v pinchos de techo  D puerta de palanca
//  d puerta de llave  7 compuerta del jefe  8 puerta de salida del jefe  o chip
//  Entidades: b Bug  g Glitch  p Ping  q Ping vertical  x Pixel  a Firewall  c Cable
//  z Chispa  T resorte  ! checkpoint  / palanca  k llave  R J barras de energía
//  G banderín  K castillo  E núcleo final  _ plataforma horizontal  I vertical  f que cae
// ============================================================================
const LEVELS = [
`;
const text = header + levels.map(ser).join('\n') + '\n];\n';
fs.writeFileSync(path.join(__dirname, '..', 'src', 'levels.js'), text);

if (process.argv.includes('--print')) {
  for (const lv of levels) for (const [an, a] of Object.entries(lv.areas)) {
    console.log(`== ${lv.id} ${an} (${a.map[0].length})`);
    const w = a.map[0].length;
    let ruler = ''; for (let x = 0; x < w; x++) ruler += (x % 10 === 0) ? String((x / 10) % 10) : ' ';
    console.log(ruler);
    for (const r of a.map) console.log(r);
  }
}
console.log('levels.js escrito:', levels.map(l => l.id + ' ' + l.areas.main.map[0].length).join(', '));
