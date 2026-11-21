import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const clients = new Set();
const latestLocations = new Map();

function broadcast(event, data) {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(chunk);
  }
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    clients.add(res);
    broadcast('presence', { onlineCount: clients.size });

    if (latestLocations.size > 0) {
      res.write(
        `event: locations_snapshot\ndata: ${JSON.stringify(
          Array.from(latestLocations.values())
        )}\n\n`
      );
    }

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 20000);

    req.on('close', () => {
      clearInterval(keepAlive);
      clients.delete(res);
      broadcast('presence', { onlineCount: clients.size });
    });
    return;
  }

  if (urlPath === '/api/love') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 16384) req.destroy();
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const payload = {
            id: parsed.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            senderId: parsed.senderId || 'unknown',
            senderName: String(parsed.senderName || 'Alguien').slice(0, 24),
            message: String(parsed.message || 'Te amo ❤️').slice(0, 120),
            sentAt:
              parsed.sentAt ||
              new Date().toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              }),
          };

          broadcast('love', payload);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify({ ok: true, onlineCount: clients.size }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false }));
        }
      });
      return;
    }
  }

  if (urlPath === '/api/location') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 16384) req.destroy();
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          if (
            !parsed.senderId ||
            !parsed.coords ||
            typeof parsed.coords.lat !== 'number' ||
            typeof parsed.coords.lng !== 'number'
          ) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false }));
            return;
          }

          const payload = {
            senderId: parsed.senderId,
            senderName: String(parsed.senderName || 'Tu Pareja').slice(0, 24),
            coords: {
              lat: parsed.coords.lat,
              lng: parsed.coords.lng,
            },
            accuracy:
              typeof parsed.accuracy === 'number' ? parsed.accuracy : undefined,
            updatedAt:
              parsed.updatedAt ||
              new Date().toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              }),
          };

          latestLocations.set(payload.senderId, payload);
          broadcast('location', payload);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false }));
        }
      });
      return;
    }
  }

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
