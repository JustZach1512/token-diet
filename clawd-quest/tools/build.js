// Ensambla el juego en UN SOLO archivo HTML autocontenido: clawd-quest.html
'use strict';
const fs = require('fs'), path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const core = src('levels.js') + '\n' + src('core.js');
const game = src('gfx.js') + '\n' + src('audio.js') + '\n' + src('main.js');
for (const [n, c] of [['core', core], ['game', game]]) if (/<\/script/i.test(c)) throw new Error('</script> dentro de ' + n);
const html = src('shell.html').replace('/*CORE*/', () => core).replace('/*GAME*/', () => game);
const out = path.join(__dirname, '..', 'clawd-quest.html');
fs.writeFileSync(out, html);
console.log('Escrito', out, (html.length / 1024).toFixed(1) + ' KB');
