import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('apps/client/build/web');
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
};
const port = Number(process.env.PORT || 5173);
createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    const upstream = httpRequest(
      new URL(req.url, process.env.API_ORIGIN || 'http://127.0.0.1:8080'),
      { method: req.method, headers: req.headers },
      (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502);
      res.end('API unavailable');
    });
    req.pipe(upstream);
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (pathname.endsWith('/')) file = resolve(file, 'index.html');
    let bytes;
    try {
      bytes = await readFile(file);
    } catch {
      file = resolve(root, 'index.html');
      bytes = await readFile(file);
    }
    res.writeHead(200, {
      'content-type': types[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(bytes);
  } catch {
    res.writeHead(500);
    res.end('Build the Flutter web client first.');
  }
}).listen(port, '127.0.0.1', () => console.log(`Sticker Foundry: http://127.0.0.1:${port}`));
