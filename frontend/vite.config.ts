import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const proxyPaths = ['/api', '/static', '/map', '/socket.io'];

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
  const api = env.VITE_PROXY_TARGET || 'http://localhost:4000'
  const staffDesktop = mode === 'staff-desktop';
  const openStaffBrowser = process.env.npm_lifecycle_event === 'dev:staff';

  return {
    base: staffDesktop ? './' : '/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    plugins: [react()],
    build: {
      outDir: staffDesktop ? 'dist-staff' : 'dist',
      rollupOptions: {
        input: path.resolve(__dirname, staffDesktop ? 'staff.html' : 'index.html'),
      },
    },
    server: {
      port: 5173,
      proxy: proxyTo(api),
      open: openStaffBrowser ? '/staff.html#/' : false,
    },
    preview: {
      port: 4173,
      proxy: proxyTo(api),
    },
  };
});
