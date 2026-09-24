import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'node:http';

const API = process.env.VAJRA_API ?? 'http://localhost:8000';

/**
 * When the optional FastAPI service is not running, answer /api/v1/health locally with {ok:false}
 * so the app's health probe never produces network errors in the console (offline-first).
 */
function apiHealthFallback(): Plugin {
  const handler = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/v1/health')) return next();
    const probe = http.get(`${API}/api/v1/health`, { timeout: 800 }, (r) => {
      let body = '';
      r.on('data', (c) => (body += c));
      r.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.end(body || '{"ok":false,"engine":false}');
      });
    });
    const offline = () => {
      if (res.headersSent) return;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"ok":false,"engine":false,"llm":false}');
    };
    probe.on('error', offline);
    probe.on('timeout', () => {
      probe.destroy();
      offline();
    });
  };
  return {
    name: 'vajra-api-health-fallback',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [apiHealthFallback(), react()],
  worker: { format: 'es' },
  server: {
    port: 5173,
    proxy: {
      '/api': API,
      '/ws': { target: API.replace('http', 'ws'), ws: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': API,
      '/ws': { target: API.replace('http', 'ws'), ws: true },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](maplibre-gl|@deck\.gl|@luma\.gl|@loaders\.gl|@math\.gl)[\\/]/.test(id)) return 'map';
          if (/[\\/](three|@react-three|three-stdlib)[\\/]/.test(id)) return 'three';
          if (/[\\/](echarts|zrender)[\\/]/.test(id)) return 'charts';
          return undefined;
        },
      },
    },
  },
});
