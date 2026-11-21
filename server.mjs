import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLoveRelay } from './server/relay.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const relay = createLoveRelay();

const server = http.createServer(async (req, res) => {
  if (await relay.handleRequest(req, res)) {
    return;
  }

  const urlPath = (req.url || '/').split('?')[0];
  const requested = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  let filePath = path.join(DIST_DIR, requested);
  if (!filePath.startsWith(DIST_DIR) || !fs.existsSync(filePath)) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`💖 Servidor Distancia de Amor activo en http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`📱 Abre en otros dispositivos de la red: http://${net.address}:${PORT}`);
      }
    }
  }
});
