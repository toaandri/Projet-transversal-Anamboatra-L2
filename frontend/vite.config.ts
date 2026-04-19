import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

const proxyPaths = ['/api', '/static', '/map', '/socket.io'];

// Codes d'erreur "normaux" déclenchés quand une page se recharge (HMR),
// quand l'onglet se ferme ou quand le backend redémarre. On les ignore
// pour ne pas polluer les logs du dev-server.
const SILENT_ERRS = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'EPIPE',
  'ECANCELED',
]);

function silenceExpectedErrors(p: ProxyOptions): ProxyOptions {
  return {
    ...p,
    configure: (proxy) => {
      proxy.on('error', (err) => {
        const code = (err as NodeJS.ErrnoException).code;
        if (code && SILENT_ERRS.has(code)) return;
        console.error('[vite proxy]', err.message);
      });
    },
  };
}

function proxyTo(target: string) {
  return Object.fromEntries(
    proxyPaths.map((p) => [
      p,
      silenceExpectedErrors(
        p === '/socket.io'
          ? { target, changeOrigin: true, ws: true }
          : { target, changeOrigin: true },
      ),
    ]),
  );
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const api = env.VITE_PROXY_TARGET || 'http://localhost:4000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: proxyTo(api),
    },
    preview: {
      port: 4173,
      proxy: proxyTo(api),
    },
  };
});
