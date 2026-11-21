import os from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

interface LovePayload {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  sentAt: string;
}

interface LocationPayload {
  senderId: string;
  senderName: string;
  coords: { lat: number; lng: number };
  accuracy?: number;
  updatedAt: string;
}

function attachLoveNetwork(middlewares: {
  use: (
    route: string,
    fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void
  ) => void;
}) {
  const clients = new Set<ServerResponse>();
  const latestLocations = new Map<string, LocationPayload>();

  const broadcast = (event: string, data: unknown) => {
    const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      client.write(chunk);
    }
  };

  middlewares.use('/api/events', (req, res, next) => {
    if (req.method !== 'GET') return next();

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
  });

  middlewares.use('/api/love', (req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method !== 'POST') return next();

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16384) req.destroy();
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}') as Partial<LovePayload>;
        const payload: LovePayload = {
          id: parsed.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          senderId: parsed.senderId || 'unknown',
          senderName: (parsed.senderName || 'Alguien').slice(0, 24),
          message: (parsed.message || 'Te amo ❤️').slice(0, 120),
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
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
  });

  middlewares.use('/api/location', (req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method !== 'POST') return next();

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16384) req.destroy();
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}') as Partial<LocationPayload>;
        if (
          !parsed.senderId ||
          !parsed.coords ||
          typeof parsed.coords.lat !== 'number' ||
          typeof parsed.coords.lng !== 'number'
        ) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid location' }));
          return;
        }

        const payload: LocationPayload = {
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
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
  });
}

function loveNetworkPlugin(): Plugin {
  return {
    name: 'love-network-relay',
    configureServer(server) {
      attachLoveNetwork(server.middlewares);
      server.httpServer?.once('listening', () => {
        const nets = os.networkInterfaces();
        for (const list of Object.values(nets)) {
          for (const net of list ?? []) {
            if (net.family === 'IPv4' && !net.internal) {
              console.log(`  💖 Red local lista: http://${net.address}:5173`);
            }
          }
        }
      });
    },
    configurePreviewServer(server) {
      attachLoveNetwork(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [react(), loveNetworkPlugin()],
  server: {
    host: true,
    port: 5173,
  },
});
