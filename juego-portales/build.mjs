// Une src/shell.html y src/*.js en un único index.html (y, opcionalmente, un fragmento sin <html>/<head>/<body>).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const src = new URL('./src/', import.meta.url);
const [head, body] = readFileSync(new URL('shell.html', src), 'utf8').split('<!--BODY-->');
const js = readdirSync(src).filter(f => f.endsWith('.js')).sort()
  .map(f => readFileSync(new URL(f, src), 'utf8')).join('\n');
const script = `<script type="module">\n${js}\n</script>`;

writeFileSync(new URL('./index.html', import.meta.url),
  `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head.trim()}\n</head>\n<body>\n${body.trim()}\n${script}\n</body>\n</html>\n`);
if (process.argv[2]) writeFileSync(process.argv[2], `${head.trim()}\n${body.trim()}\n${script}\n`);
