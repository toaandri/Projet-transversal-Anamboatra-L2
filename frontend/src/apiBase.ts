/**
 * Base URL de l’API Express (sans slash final).
 * - Vide : requêtes relatives → proxy Vite (`npm run dev` / `npm run preview`) ou même origine en prod derrière un reverse proxy.
 * - Définir `VITE_API_URL` si le front est servi sans proxy (ex. `http://localhost:4000` ou `http://192.168.1.10:4000`).
 */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL;
  if (typeof raw === 'string' && raw.trim()) return raw.trim().replace(/\/+$/, '');
  return '';
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/** Origine pour Socket.io : même logique que les fetch (proxy ou URL absolue). */
export function getSocketOrigin(): string {
  const base = getApiBaseUrl();
  if (base) return base;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}
