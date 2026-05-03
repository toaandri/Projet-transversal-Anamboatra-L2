import { API_URL } from './config';
import { getToken } from './auth';
import type { MapTilesPayload, SuggestionCitoyen, TerrainClotureCodePatrouille, Ticket, User, Zone } from './types';

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Réponse serveur invalide');
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown; auth?: boolean } = { auth: true },
): Promise<T> {
  const headers = new Headers(init.headers);
  const wantsAuth = init.auth !== false;
  if (wantsAuth) {
    const token = await getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  let body = init.body as BodyInit | undefined;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, body });
  const raw = await parse<unknown>(res);
  const data =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  if (!res.ok) {
    const msg =
      (typeof data.message === 'string' && data.message) ||
      (Array.isArray(data.errors)
        ? data.errors
            .map((e) => (e && typeof e === 'object' && 'msg' in e ? String((e as { msg?: string }).msg || '') : ''))
            .filter(Boolean)
            .join(', ')
        : null) ||
      `Erreur ${res.status}`;
    throw new Error(msg);
  }
  return data as unknown as T;
}

export const api = {
  health: () => request<{ ok: boolean }>('/api/health', { auth: false }),

  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      json: { email, password },
      auth: false,
    }),

  me: () => request<{ user: User }>('/api/users/me'),

  myZone: () => request<{ zone: Zone | null }>('/api/users/me/zone'),

  mapTiles: () => request<MapTilesPayload>('/api/map/tiles'),

  tickets: () => request<{ tickets: Ticket[] }>('/api/tickets'),

  ticket: (id: string) => request<{ ticket: Ticket }>(`/api/tickets/${id}`),

  suggestions: () =>
    request<{ suggestions: SuggestionCitoyen[] }>('/api/suggestions'),

  suggestionCitoyenne: (id: string) =>
    request<{ suggestion: SuggestionCitoyen }>(`/api/suggestions/${id}`),

  clotureSuggestionTerrain: (id: string, body: { code: TerrainClotureCodePatrouille; comment: string }) =>
    request<{ suggestion: SuggestionCitoyen }>(`/api/suggestions/${id}/terrain-cloture`, {
      method: 'PATCH',
      json: body,
    }),

  patchTicket: (id: string, body: Record<string, unknown>) =>
    request<{ ticket: Ticket }>(`/api/tickets/${id}`, { method: 'PATCH', json: body }),

  updatePosition: (latitude: number, longitude: number) =>
    request<{ ok: boolean }>('/api/users/me/position', {
      method: 'PATCH',
      json: { latitude, longitude },
    }),

  createTicket: async (form: {
    description: string;
    urgence: 'NORMAL' | 'URGENT';
    typeInfrastructure: 'ROUTE' | 'ELECTRICITE' | 'EAU';
    latitude: number;
    longitude: number;
    photoUri: string;
    photoName?: string;
    photoMime?: string;
    originSuggestionId?: string;
  }): Promise<Ticket> => {
    const fd = new FormData();
    fd.append('description', form.description);
    fd.append('urgence', form.urgence);
    fd.append('typeInfrastructure', form.typeInfrastructure);
    fd.append('latitude', String(form.latitude));
    fd.append('longitude', String(form.longitude));
    if (form.originSuggestionId) {
      fd.append('originSuggestionId', form.originSuggestionId);
    }
    fd.append(
      'photo',
      {
        uri: form.photoUri,
        name: form.photoName || 'photo.jpg',
        type: form.photoMime || 'image/jpeg',
      } as unknown as Blob,
    );
    const headers = new Headers();
    const token = await getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(`${API_URL}/api/tickets`, { method: 'POST', headers, body: fd });
    const data = await parse<{ ticket?: Ticket; message?: string }>(res);
    if (!res.ok) throw new Error(data.message || `Erreur ${res.status}`);
    return data.ticket!;
  },

  closurePhoto: async (
    ticketId: string,
    photoUri: string,
    name = 'cloture.jpg',
    mime = 'image/jpeg',
  ): Promise<string> => {
    const fd = new FormData();
    fd.append('photo', { uri: photoUri, name, type: mime } as unknown as Blob);
    const headers = new Headers();
    const token = await getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(`${API_URL}/api/tickets/${ticketId}/closure-photo`, {
      method: 'POST',
      headers,
      body: fd,
    });
    const data = await parse<{ photoCloture?: string; message?: string }>(res);
    if (!res.ok) throw new Error(data.message || `Erreur ${res.status}`);
    return data.photoCloture!;
  },
};
