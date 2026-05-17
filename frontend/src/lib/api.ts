import type {
  AdminQg,
  Agent,
  EquipeUser,
  MapTilesPayload,
  RepairAgent,
  Specialite,
  SuggestionCitoyen,
  Ticket,
  User,
  Zone,
} from './types';
import { apiUrl } from './apiBase';

const TOKEN_KEY = 'anamboatra_token';
const ADMIN_TOKEN_KEY = 'anamboatra_admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(t: string | null) {
  if (t) localStorage.setItem(ADMIN_TOKEN_KEY, t);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function clearAllAuthStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function parseJson<T>(res: Response): Promise<T> {
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
  init: RequestInit & {
    json?: unknown;
    token?: string | null;
    adminToken?: string | null;
  } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const token = init.token !== undefined ? init.token : getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.adminToken) headers.set('X-Admin-Token', init.adminToken);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await fetch(apiUrl(path), { ...init, headers, body });
  const raw = await parseJson<unknown>(res);
  const data =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  if (!res.ok) {
    const message = typeof data.message === 'string' ? data.message : null;
    let fromValidation: string | null = null;
    if (Array.isArray(data.errors)) {
      fromValidation = data.errors
        .map((e) => (e && typeof e === 'object' && 'msg' in e ? String((e as { msg?: string }).msg || '') : ''))
        .filter(Boolean)
        .join(', ');
    }
    throw new Error(message || fromValidation || `Erreur ${res.status}`);
  }
  return data as unknown as T;
}

type AdminOpts = { adminToken?: string | null };

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),

  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      json: { email, password },
      token: null,
    }),

  me: () => request<{ user: User }>('/api/users/me'),

  myZone: () => request<{ zone: Zone | null }>('/api/users/me/zone'),

  publicMapTiles: () => request<MapTilesPayload>('/map/tiles', { token: null }),

  publicZones: () => request<{ zones: Zone[] }>('/api/public/zones', { token: null }),

  publicSuggestion: async (params: {
    description: string;
    typeSuggere: string;
    latitude: number;
    longitude: number;
    pseudoCitoyen?: string;
    photo?: File | null;
  }) => {
    const fd = new FormData();
    fd.append('description', params.description);
    fd.append('typeSuggere', params.typeSuggere);
    fd.append('latitude', String(params.latitude));
    fd.append('longitude', String(params.longitude));
    if (params.pseudoCitoyen?.trim()) fd.append('pseudoCitoyen', params.pseudoCitoyen.trim());
    if (params.photo) fd.append('photo', params.photo);
    const res = await fetch(apiUrl('/api/public/suggestions'), { method: 'POST', body: fd });
    const raw = await parseJson<{
      suggestion?: unknown;
      zoneAttribution?: { nom: string; code: string };
      message?: string;
      errors?: unknown;
    }>(res);
    if (!res.ok) {
      const message = typeof raw.message === 'string' ? raw.message : null;
      throw new Error(message || `Erreur ${res.status}`);
    }
    return raw as { suggestion: unknown; zoneAttribution?: { nom: string; code: string } };
  },

  mapTiles: () => request<MapTilesPayload>('/api/map/tiles'),

  suggestionCitoyenne: (id: string) =>
    request<{ suggestion: SuggestionCitoyen }>(`/api/suggestions/${id}`),

  tickets: () => request<{ tickets: Ticket[] }>('/api/tickets'),

  ticket: (id: string) => request<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}`),

  patchTicket: (id: string, body: Record<string, unknown>) =>
    request<{ ticket: Ticket }>(`/api/tickets/${id}`, { method: 'PATCH', json: body }),

  createTicket: async (form: FormData) => {
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(apiUrl('/api/tickets'), { method: 'POST', headers, body: form });
    const data = await parseJson<{ ticket?: Ticket; message?: string }>(res);
    if (!res.ok) throw new Error(data.message || `Erreur ${res.status}`);
    return data.ticket!;
  },

  closurePhoto: async (ticketId: string, file: File) => {
    const fd = new FormData();
    fd.append('photo', file);
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(apiUrl(`/api/tickets/${ticketId}/closure-photo`), { method: 'POST', headers, body: fd });
    const data = await parseJson<{ photoCloture?: string; message?: string }>(res);
    if (!res.ok) throw new Error(data.message || `Erreur ${res.status}`);
    return data.photoCloture!;
  },

  equipes: () => request<{ equipes: EquipeUser[] }>('/api/users/equipes'),

  updatePosition: (latitude: number, longitude: number) =>
    request<{ ok: boolean }>('/api/users/me/position', { method: 'PATCH', json: { latitude, longitude } }),

  adminPing: (opts: AdminOpts = {}) =>
    request<{ ok: boolean; via?: string }>('/api/admin/ping', {
      adminToken: opts.adminToken ?? undefined,
    }),

  adminListZones: (opts: AdminOpts = {}) =>
    request<{ zones: Zone[] }>('/api/admin/zones', {
      adminToken: opts.adminToken ?? undefined,
    }),

  adminCreateZone: (
    body: { nom: string; type: string; code: string; numeroQg?: string | null; geometrie?: unknown },
    opts: AdminOpts = {},
  ) =>
    request<{ zone: Zone }>('/api/admin/zones', {
      method: 'POST',
      json: body,
      adminToken: opts.adminToken ?? undefined,
    }),

  adminUpdateZone: (id: string, body: Partial<Zone>, opts: AdminOpts = {}) =>
    request<{ zone: Zone }>(`/api/admin/zones/${id}`, {
      method: 'PATCH',
      json: body,
      adminToken: opts.adminToken ?? undefined,
    }),

  adminDeleteZone: (id: string, opts: AdminOpts = {}) =>
    request<{ ok: boolean }>(`/api/admin/zones/${id}`, {
      method: 'DELETE',
      adminToken: opts.adminToken ?? undefined,
    }),

  adminListQgAdmins: (opts: AdminOpts = {}) =>
    request<{ admins: AdminQg[] }>('/api/admin/qg-admins', {
      adminToken: opts.adminToken ?? undefined,
    }),

  adminCreateQgAdmin: (
    body: {
      zoneId: string;
      nom: string;
      prenom: string;
      email: string;
      password: string;
      numeroTelephone: string;
      matricule?: string | null;
    },
    opts: AdminOpts = {},
  ) =>
    request<{ admin: AdminQg }>('/api/admin/qg-admins', {
      method: 'POST',
      json: body,
      adminToken: opts.adminToken ?? undefined,
    }),

  adminUpdateQgAdmin: (
    id: string,
    body: {
      nom?: string;
      prenom?: string;
      email?: string;
      password?: string;
      numeroTelephone?: string;
      matricule?: string | null;
      zoneId?: string;
      actif?: boolean;
    },
    opts: AdminOpts = {},
  ) =>
    request<{ admin: AdminQg }>(`/api/admin/qg-admins/${id}`, {
      method: 'PATCH',
      json: body,
      adminToken: opts.adminToken ?? undefined,
    }),

  adminListRepairAgents: (opts: AdminOpts = {}) =>
    request<{ agents: RepairAgent[] }>('/api/admin/agents', {
      adminToken: opts.adminToken ?? undefined,
    }),

  adminCreateRepairAgent: (
    body: {
      zoneId: string;
      nom: string;
      prenom: string;
      email: string;
      password: string;
      numeroTelephone: string;
      matricule?: string | null;
      specialite: Specialite;
    },
    opts: AdminOpts = {},
  ) =>
    request<{ agent: RepairAgent }>('/api/admin/agents', {
      method: 'POST',
      json: body,
      adminToken: opts.adminToken ?? undefined,
    }),

  adminUpdateRepairAgent: (
    id: string,
    body: {
      nom?: string;
      prenom?: string;
      numeroTelephone?: string;
      matricule?: string | null;
      specialite?: Specialite;
      zoneId?: string;
    },
    opts: AdminOpts = {},
  ) =>
    request<{ agent: RepairAgent }>(`/api/admin/agents/${id}`, {
      method: 'PATCH',
      json: body,
      adminToken: opts.adminToken ?? undefined,
    }),

  adminSuspendRepairAgent: (id: string, opts: AdminOpts = {}) =>
    request<{ agent: RepairAgent }>(`/api/admin/agents/${id}/suspendre`, {
      method: 'PATCH',
      adminToken: opts.adminToken ?? undefined,
    }),

  adminReactivateRepairAgent: (id: string, opts: AdminOpts = {}) =>
    request<{ agent: RepairAgent }>(`/api/admin/agents/${id}/reactiver`, {
      method: 'PATCH',
      adminToken: opts.adminToken ?? undefined,
    }),

  adminResetRepairAgentDevice: (id: string, opts: AdminOpts = {}) =>
    request<{ agent: RepairAgent }>(`/api/admin/agents/${id}/reset-device`, {
      method: 'PATCH',
      adminToken: opts.adminToken ?? undefined,
    }),

  adminDeleteRepairAgent: (id: string, opts: AdminOpts = {}) =>
    request<{ ok: boolean }>(`/api/admin/agents/${id}`, {
      method: 'DELETE',
      adminToken: opts.adminToken ?? undefined,
    }),

  qgAgents: () => request<{ agents: Agent[] }>('/api/qg/agents'),

  qgCreatePatrouille: (body: {
    nom: string;
    prenom: string;
    email: string;
    password: string;
    numeroTelephone: string;
    matricule?: string | null;
  }) => request<{ agent: Agent }>('/api/qg/agents', { method: 'POST', json: body }),

  qgUpdatePatrouille: (
    id: string,
    body: {
      nom?: string;
      prenom?: string;
      numeroTelephone?: string;
      matricule?: string | null;
    },
  ) => request<{ agent: Agent }>(`/api/qg/agents/${id}`, { method: 'PATCH', json: body }),

  qgSuspendPatrouille: (id: string) =>
    request<{ agent: Agent }>(`/api/qg/agents/${id}/suspendre`, { method: 'PATCH' }),

  qgReactivatePatrouille: (id: string) =>
    request<{ agent: Agent }>(`/api/qg/agents/${id}/reactiver`, { method: 'PATCH' }),

  qgResetPatrouilleDevice: (id: string) =>
    request<{ agent: Agent }>(`/api/qg/agents/${id}/reset-device`, { method: 'PATCH' }),

  qgDeletePatrouille: (id: string) =>
    request<{ ok: boolean }>(`/api/qg/agents/${id}`, { method: 'DELETE' }),

  qgRepairAgents: () => request<{ agents: RepairAgent[] }>('/api/qg/repair-agents'),

  qgCreateRepairAgent: (body: {
    nom: string;
    prenom: string;
    email: string;
    password: string;
    numeroTelephone: string;
    matricule?: string | null;
    specialite: Specialite;
    latitude: number;
    longitude: number;
  }) => request<{ agent: RepairAgent }>('/api/qg/repair-agents', { method: 'POST', json: body }),

  qgSuspendRepairAgent: (id: string) =>
    request<{ agent: RepairAgent }>(`/api/qg/repair-agents/${id}/suspendre`, { method: 'PATCH' }),

  qgReactivateRepairAgent: (id: string) =>
    request<{ agent: RepairAgent }>(`/api/qg/repair-agents/${id}/reactiver`, { method: 'PATCH' }),

  qgDeleteRepairAgent: (id: string) =>
    request<{ ok: boolean }>(`/api/qg/repair-agents/${id}`, { method: 'DELETE' }),
};
