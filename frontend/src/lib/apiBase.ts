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

export function getSocketOrigin(): string {
  const base = getApiBaseUrl();
  if (base) return base;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}
