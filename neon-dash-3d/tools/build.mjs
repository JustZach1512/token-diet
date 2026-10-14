// Inlines src/ into a single self-contained index.html (three.js loads from jsDelivr).
// `node tools/build.mjs [artifactOut]` also writes a body-only variant for hosts that add their own <head>.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
let html = read('index.template.html');
for (const [mark, file] of [['/*STYLE*/', 'style.css'], ['/*CORE*/', 'core.js'], ['/*AUDIO*/', 'audio.js'], ['/*GAME*/', 'game.js']]) {
  const src = read(file);
  if (src.includes('</script')) throw new Error(`${file} contains a closing script tag`);
  html = html.replace(mark, () => src);
}
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`index.html ${(html.length / 1024).toFixed(0)} KB`);

const out = process.argv[2];
if (out) {
  const drop = [/^<!doctype html>$/i, /^<html[^>]*>$/, /^<\/?head>$/, /^<\/?body>$/, /^<\/html>$/, /^<meta charset/, /^<meta name="viewport"/, /web-app-capable/];
  const body = html.split('\n').filter(l => !drop.some(r => r.test(l.trim()))).join('\n');
  fs.writeFileSync(out, body);
  console.log(`${out} ${(body.length / 1024).toFixed(0)} KB`);
}
