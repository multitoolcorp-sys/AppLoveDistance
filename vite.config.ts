import os from 'node:os';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createLoveRelay } from './server/relay.mjs';

function loveNetworkPlugin(): Plugin {
  const relay = createLoveRelay();

  return {
    name: 'love-network-relay',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void relay.handleRequest(req, res).then((handled) => {
          if (!handled) next();
        });
      });

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
      server.middlewares.use((req, res, next) => {
        void relay.handleRequest(req, res).then((handled) => {
          if (!handled) next();
        });
      });
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
