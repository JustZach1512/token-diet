// Genera dist/noche-sin-fin.html: un único archivo con CSS y JS incrustados,
// fácil de pasar al móvil o subir a cualquier hosting estático.
// Uso: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
let html = readFileSync(join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, href) =>
  `<style>\n${readFileSync(join(root, href), 'utf8')}</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${readFileSync(join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', 'noche-sin-fin.html');
writeFileSync(out, html);
console.log(`Escrito ${out} (${(html.length / 1024).toFixed(0)} KB)`);
