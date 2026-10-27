// Bundles src/ into one self-contained HTML file (three.js inlined).
//   dist/ultima-luz.html  full standalone page (open directly or host anywhere)
//   dist/artifact.html    same page without <html>/<head>/<body> wrappers
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  write: false,
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('index.html', 'utf8');
const page = html.replace(/<!-- build:remove -->[\s\S]*?<!-- \/build:remove -->\n?/, '');
const full = page.replace('</body>', `<script>${js}</script>\n</body>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/ultima-luz.html', full);

const head = page.slice(page.indexOf('<head>') + 6, page.indexOf('</head>'))
  .replace(/<meta charset[^>]*>\n?/, '')
  .replace(/<meta name="viewport"[^>]*>\n?/, '');
const body = page.slice(page.indexOf('<body>') + 6, page.indexOf('</body>'));
writeFileSync('dist/artifact.html', `${head.trim()}\n${body.trim()}\n<script>${js}</script>\n`);
console.log(`built: ${(full.length / 1024).toFixed(0)} KB`);
