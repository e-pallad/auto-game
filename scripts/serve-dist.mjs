// Minimal static server that mounts dist/ under a subpath (/play/floeline/),
// mimicking how itch.io serves HTML5 games from a subdirectory. No dependencies.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const port = Number(process.argv[2] ?? 4317);
const root = resolve('dist');
const base = '/play/floeline/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (!url.pathname.startsWith(base)) {
    res.writeHead(404).end('not under subpath');
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname.slice(base.length)) || 'index.html');
  const file = join(root, rel);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving dist at http://localhost:${port}${base}`));
