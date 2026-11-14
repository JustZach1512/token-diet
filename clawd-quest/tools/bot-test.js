// Bot de pruebas en Node: ejecuta la simulación EXACTA del juego (el mismo bloque
// <script id="core"> del HTML) sin gráficos ni sonido y demuestra que cada nivel
// se completa con entradas de al menos `chunk` frames.
// Uso: node tools/bot-test.js [--src] [--chunk 6] [--beam 40] [--level 0]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
let code;
const html = path.join(__dirname, '..', 'clawd-quest.html');
if (!args.includes('--src') && fs.existsSync(html)) {
  const m = fs.readFileSync(html, 'utf8').match(/<script id="core">([\s\S]*?)<\/script>/);
  code = m[1];
  console.log('Usando el núcleo embebido en clawd-quest.html');
} else {
  code = fs.readFileSync(path.join(__dirname, '..', 'src', 'levels.js'), 'utf8') + '\n' +
         fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8');
  console.log('Usando src/levels.js + src/core.js');
}
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(code + '\nthis.ClawdCore = ClawdCore;', ctx);
const C = ctx.ClawdCore;
const chunks = String(opt('chunk', '6')).split(',').map(Number);
const beam = +opt('beam', 40);
const only = opt('level', null);
let allOk = true;
const rows = [];
for (const chunk of chunks) {
  for (let li = 0; li < C.LEVELS.length; li++) {
    if (only !== null && +only !== li) continue;
    const t0 = Date.now();
    const r = C.botSolve(li, { chunk, beam, onProgress: args.includes('-v') ? (p) => console.log('  ', JSON.stringify(p)) : null });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.ok) console.log(`✔ ${r.level} superado | pulsación mínima ${r.minHoldFrames} frames (bloques de ${chunk}) | ${r.frames} frames (${r.seconds}s de juego) | ${r.jumps} saltos | ${r.lines} líneas | riesgo ${(r.deathRate*100).toFixed(1)}% | ${dt}s CPU`);
    else { console.log(`✘ ${r.level} NO superado (${r.reason}) mejor x=${r.bestX} | ${dt}s CPU`); allOk = false; }
    rows.push({ chunk, level: r.level, ok: r.ok, deathRate: r.deathRate, frames: r.frames, jumps: r.jumps, minHold: r.minHoldFrames, reason: r.reason, bestX: r.bestX });
  }
}
if (args.includes('--json')) fs.writeFileSync(opt('json', 'bot-result.json'), JSON.stringify(rows, null, 1));
process.exit(allOk ? 0 : 1);
