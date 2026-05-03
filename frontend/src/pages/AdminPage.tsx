/**
 * CDC v2.3 — Console super-admin.
 *
 * Accès : compte SUPER_ADMIN connecté (JWT) — ou, en secours, un jeton
 * X-Admin-Token (legacy). La page détecte automatiquement le JWT et, sinon,
 * propose le formulaire jeton.
 *
 * Sections :
 *   - Territoires gérés ici : arrondissements (communes) et routes nationales
 *     uniquement — pas de création ni d'édition des dépôts (référentiel possible
 *     en base, tracé sur la carte en lecture seule dans la liste).
 *   - Admins QG : création des comptes ADMIN_QG rattachés à une commune ou un axe.
 *
 * Dépôts et équipes d'intervention : gérés au niveau des ADMIN_QG (Cf. dashboard
 * communal). Les AGENT_PATROUILLE sont enrôlés par chaque Admin QG.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  APIProvider,
  Map,
  Marker,
  Polygon,
  useMap,
  type MapCameraChangedEvent,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import { api, getAdminToken, getToken, setAdminToken } from '../api';
import { useAuth } from '../useAuth';
import type {
  AdminQg,
  GeoJsonPolygon,
  TypeZone,
  Zone,
} from '../types';

const TANA = { lat: -18.8792, lng: 47.5079 };
const MADAGASCAR_BOUNDS = {
  north: -10.8,
  south: -27.2,
  west: 41.6,
  east: 52.8,
};
const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

type AdminMode = 'jwt' | 'token';

type Tab = 'zones' | 'qg';

const ZONE_TYPE_LABEL: Record<TypeZone, string> = {
  ARRONDISSEMENT: 'Arrondissement / Commune',
  ROUTE_NATIONALE: 'Route nationale',
  DEPOT_REPARATION: 'Dépôt de réparation',
};

/** Types de zone que la console super-admin peut créer ou modifier. */
type SuperAdminZoneType = 'ARRONDISSEMENT' | 'ROUTE_NATIONALE';

const SUPER_ADMIN_ZONE_TYPES: SuperAdminZoneType[] = ['ARRONDISSEMENT', 'ROUTE_NATIONALE'];

type ZoneDraft = {
  id?: string;
  nom: string;
  type: SuperAdminZoneType;
  code: string;
  numeroQg: string;
  vertices: { lat: number; lng: number }[];
};

const EMPTY_DRAFT: ZoneDraft = {
  nom: '',
  type: 'ARRONDISSEMENT',
  code: '',
  numeroQg: '',
  vertices: [],
};

function verticesToGeoJson(vertices: { lat: number; lng: number }[]): GeoJsonPolygon | null {
  if (vertices.length < 3) return null;
  const ring = vertices.map((v) => [v.lng, v.lat]);
  ring.push([vertices[0].lng, vertices[0].lat]);
  return { type: 'Polygon', coordinates: [ring] };
}

function geoJsonToVertices(g: unknown): { lat: number; lng: number }[] {
  if (!g || typeof g !== 'object') return [];
  const gj = g as { type?: string; coordinates?: unknown };
  if (gj.type !== 'Polygon' || !Array.isArray(gj.coordinates)) return [];
  const first = (gj.coordinates as number[][][])[0];
  if (!Array.isArray(first)) return [];
  const last = first[first.length - 1];
  const head = first[0];
  const cleaned =
    first.length > 1 && last?.[0] === head?.[0] && last?.[1] === head?.[1] ? first.slice(0, -1) : first;
  return cleaned.map(([lng, lat]) => ({ lat, lng }));
}

type RegionName =
  | 'Antananarivo'
  | 'Fianarantsoa'
  | 'Toliara'
  | 'Toamasina'
  | 'Mahajanga'
  | 'Antsiranana';

const REGION_ANCHORS: Record<RegionName, { lat: number; lng: number }> = {
  Antananarivo: { lat: -18.8792, lng: 47.5079 },
  Fianarantsoa: { lat: -21.4536, lng: 47.0857 },
  Toliara: { lat: -23.35, lng: 43.67 },
  Toamasina: { lat: -18.1492, lng: 49.4023 },
  Mahajanga: { lat: -15.7167, lng: 46.3167 },
  Antsiranana: { lat: -12.2787, lng: 49.2917 },
};

const REGION_LABELS: Record<RegionName, string> = {
  Antananarivo: 'Antananarivo',
  Fianarantsoa: 'Fianarantsoa',
  Toliara: 'Toliara',
  Toamasina: 'Toamasina (Tamatave)',
  Mahajanga: 'Mahajanga',
  Antsiranana: 'Antsiranana',
};

const REGION_ALIASES: Record<RegionName, string[]> = {
  Antananarivo: ['antananarivo', 'tana'],
  Fianarantsoa: ['fianarantsoa'],
  Toliara: ['toliara', 'tulear', 'tulear'],
  Toamasina: ['toamasina', 'tamatave'],
  Mahajanga: ['mahajanga', 'majunga'],
  Antsiranana: ['antsiranana', 'diego', 'diego suarez'],
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function centroidOfRing(vertices: { lat: number; lng: number }[]): { lat: number; lng: number } | null {
  if (vertices.length === 0) return null;
  const sum = vertices.reduce(
    (acc, v) => ({ lat: acc.lat + v.lat, lng: acc.lng + v.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / vertices.length, lng: sum.lng / vertices.length };
}

function inferRegionFromVertices(vertices: { lat: number; lng: number }[]): RegionName {
  const c = centroidOfRing(vertices);
  if (!c) return 'Antananarivo';
  const entries = Object.entries(REGION_ANCHORS) as [RegionName, { lat: number; lng: number }][];
  let best: RegionName = 'Antananarivo';
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [name, anchor] of entries) {
    const dLat = c.lat - anchor.lat;
    const dLng = c.lng - anchor.lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      best = name;
    }
  }
  return best;
}

export function AdminPage() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const [mode, setMode] = useState<AdminMode | null>(null);
  const [tokenInput, setTokenInput] = useState<string>(getAdminToken() || '');
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('zones');
  const [sideOpen, setSideOpen] = useState(true);
  const [mapVisible, setMapVisible] = useState(true);

  const [zones, setZones] = useState<Zone[]>([]);
  const [admins, setAdmins] = useState<AdminQg[]>([]);
  const [draft, setDraft] = useState<ZoneDraft>(EMPTY_DRAFT);
  const zoneCountByType = useMemo(
    () => ({
      all: zones.length,
      arr: zones.filter((z) => z.type === 'ARRONDISSEMENT').length,
      route: zones.filter((z) => z.type === 'ROUTE_NATIONALE').length,
    }),
    [zones],
  );

  const adminOpts = useMemo(
    () => (mode === 'token' ? { adminToken: getAdminToken() } : {}),
    [mode],
  );

  const refresh = useCallback(
    async (opts: { adminToken?: string | null }) => {
      const [z, a] = await Promise.all([
        api.adminListZones(opts),
        api.adminListQgAdmins(opts),
      ]);
      setZones(z.zones);
      setAdmins(a.admins);
    },
    [],
  );

  const tryJwt = useCallback(async () => {
    if (!getToken() || user?.role !== 'SUPER_ADMIN') return false;
    try {
      await api.adminPing({});
      setMode('jwt');
      await refresh({});
      return true;
    } catch {
      return false;
    }
  }, [user, refresh]);

  const tryToken = useCallback(
    async (t: string) => {
      setChecking(true);
      setErr(null);
      try {
        await api.adminPing({ adminToken: t });
        setAdminToken(t);
        setMode('token');
        await refresh({ adminToken: t });
      } catch (e) {
        setAdminToken(null);
        setMode(null);
        setErr(e instanceof Error ? e.message : 'Jeton invalide');
      } finally {
        setChecking(false);
      }
    },
    [refresh],
  );

  useEffect(() => {
    void (async () => {
      const ok = await tryJwt();
      if (!ok) {
        const stored = getAdminToken();
        if (stored) void tryToken(stored);
      }
    })();
  }, [tryJwt, tryToken]);

  // Si plus authentifié, écran d'accès
  if (!mode) {
    return (
      <div className="page center">
        <div className="panel" style={{ maxWidth: 460, width: '100%' }}>
          <h2>Console super-admin</h2>
          {user?.role && user.role !== 'SUPER_ADMIN' ? (
            <p className="alert error">
              Votre compte ({user.role}) n'a pas les droits super-administrateur.
            </p>
          ) : null}
          <p className="muted small">
            Connectez-vous avec le compte <code>admin@anamboatra.mg</code>{' '}
            (mot de passe initial <code>admin1234</code>), ou saisissez le jeton{' '}
            <code>ADMIN_SETUP_TOKEN</code> si vous en disposez.
          </p>
          <div className="row" style={{ marginBottom: 12 }}>
            <Link to="/connexion" className="btn btn-primary">
              Me connecter
            </Link>
            <Link to="/" className="btn btn-ghost">
              Retour
            </Link>
          </div>
          <details>
            <summary className="muted small">Accès par jeton (dépannage)</summary>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                if (tokenInput.trim()) void tryToken(tokenInput.trim());
              }}
            >
              <label>
                Jeton administrateur
                <input
                  type="password"
                  autoComplete="off"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="ADMIN_SETUP_TOKEN"
                />
              </label>
              {err ? <p className="alert error">{err}</p> : null}
              <button type="submit" className="btn btn-ghost" disabled={checking}>
                {checking ? 'Vérification…' : 'Entrer avec un jeton'}
              </button>
            </form>
          </details>
        </div>
      </div>
    );
  }

  const signOut = () => {
    if (mode === 'token') {
      setAdminToken(null);
      setMode(null);
    } else {
      logout();
      nav('/connexion', { replace: true });
    }
  };

  async function runRefresh() {
    await refresh(adminOpts);
  }

  return (
    <div className="page dashboard">
      <header className="topbar">
        <div className="brand">
          <span className="logo" />
          <div>
            <strong>Console super-admin</strong>
            <div className="muted small">
              Amorçage du territoire ·{' '}
              {mode === 'jwt'
                ? `connecté : ${user?.prenom} ${user?.nom}`
                : 'accès par jeton'}
            </div>
          </div>
        </div>
        <nav className="nav">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setMapVisible((v) => !v)}
            aria-pressed={!mapVisible}
            title={mapVisible ? 'Masquer la carte (saisie et listes uniquement)' : 'Afficher la carte'}
          >
            {mapVisible ? 'Masquer la carte' : 'Afficher la carte'}
          </button>
          <Link to="/" className="btn btn-ghost">
            Portail public
          </Link>
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            {mode === 'token' ? 'Verrouiller' : 'Déconnexion'}
          </button>
        </nav>
      </header>

      <div
        className={`dash-grid${sideOpen ? '' : ' side-closed'}${mapVisible ? '' : ' map-hidden'}`}
      >
        <button
          type="button"
          className="side-toggle"
          onClick={() => setSideOpen((o) => !o)}
          aria-label={sideOpen ? 'Réduire le panneau latéral' : 'Afficher le panneau latéral'}
          title={sideOpen ? 'Réduire' : 'Afficher'}
        >
          {sideOpen ? '‹' : '›'}
        </button>
        <aside className="panel side">
          <div className="side-header">
            <span className="logo" />
            <div>
              <strong>Console super-admin</strong>
              <div className="muted">
                {mode === 'jwt'
                  ? `${user?.prenom ?? ''} ${user?.nom ?? ''}`.trim() || 'Super-administrateur'
                  : 'Accès par jeton'}
              </div>
            </div>
          </div>
          <div className="side-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setMapVisible((v) => !v)}
              aria-pressed={!mapVisible}
            >
              {mapVisible ? 'Masquer la carte' : 'Afficher la carte'}
            </button>
            <Link to="/" className="btn btn-ghost">
              Portail public
            </Link>
            <button type="button" className="btn btn-ghost" onClick={signOut}>
              {mode === 'token' ? 'Verrouiller' : 'Déconnexion'}
            </button>
          </div>

          {err ? <p className="alert error">{err}</p> : null}
          {msg ? <p className="alert success">{msg}</p> : null}

          <section className="admin-kpi-grid" aria-label="Indicateurs de la console">
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Zones</span>
              <strong className="admin-kpi-value">{zoneCountByType.all}</strong>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Arrond.</span>
              <strong className="admin-kpi-value">{zoneCountByType.arr}</strong>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Axes</span>
              <strong className="admin-kpi-value">{zoneCountByType.route}</strong>
            </div>
            <div className="admin-kpi-card admin-kpi-card-wide">
              <span className="admin-kpi-label">Admins QG actifs</span>
              <strong className="admin-kpi-value">{admins.filter((a) => a.actif).length}</strong>
            </div>
          </section>

          <div className="chips" style={{ marginBottom: 10 }}>
            <button
              type="button"
              className={tab === 'zones' ? 'chip on' : 'chip'}
              onClick={() => setTab('zones')}
            >
              Communes & axes
            </button>
            <button
              type="button"
              className={tab === 'qg' ? 'chip on' : 'chip'}
              onClick={() => setTab('qg')}
            >
              Admins QG
            </button>
          </div>

          {tab === 'zones' ? (
            <>
              <ZoneEditor
                draft={draft}
                setDraft={setDraft}
                carteVisible={mapVisible}
                onSave={async (payload) => {
                  try {
                    setErr(null);
                    if (draft.id) {
                      await api.adminUpdateZone(draft.id, payload, adminOpts);
                      setMsg('Zone mise à jour.');
                    } else {
                      await api.adminCreateZone(payload, adminOpts);
                      setMsg('Zone créée.');
                    }
                    setDraft(EMPTY_DRAFT);
                    await runRefresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Erreur');
                  }
                }}
                onCancel={() => setDraft(EMPTY_DRAFT)}
              />

              <ZoneList
                zones={zones}
                onEdit={(z) => {
                  if (z.type === 'DEPOT_REPARATION') return;
                  const t: SuperAdminZoneType =
                    z.type === 'ROUTE_NATIONALE' ? 'ROUTE_NATIONALE' : 'ARRONDISSEMENT';
                  setDraft({
                    id: z.id,
                    nom: z.nom,
                    type: t,
                    code: z.code,
                    numeroQg: z.numeroQg || '',
                    vertices: geoJsonToVertices(z.geometrie),
                  });
                  setMsg(null);
                  setErr(null);
                }}
                onDelete={async (z) => {
                  if (z.type === 'DEPOT_REPARATION') return;
                  if (!confirm(`Supprimer la zone "${z.nom}" ? Irréversible.`)) return;
                  try {
                    setErr(null);
                    await api.adminDeleteZone(z.id, adminOpts);
                    setMsg('Zone supprimée.');
                    await runRefresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Erreur');
                  }
                }}
              />
            </>
          ) : null}

          {tab === 'qg' ? (
            <>
              <QgAdminForm
                zones={zones.filter(
                  (z) => z.type === 'ARRONDISSEMENT' || z.type === 'ROUTE_NATIONALE',
                )}
                onCreate={async (body) => {
                  try {
                    setErr(null);
                    await api.adminCreateQgAdmin(body, adminOpts);
                    setMsg(`Admin QG ${body.email} créé.`);
                    await runRefresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Erreur');
                  }
                }}
              />
              <QgAdminList admins={admins} zones={zones} />
            </>
          ) : null}

        </aside>

        {mapVisible ? (
          <section className="panel map-panel">
            <PolygonPicker
              zones={zones}
              editingZoneId={draft.id}
              vertices={draft.vertices}
              onChange={(vertices) => setDraft({ ...draft, vertices })}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ZoneEditor({
  draft,
  setDraft,
  carteVisible = true,
  onSave,
  onCancel,
}: {
  draft: ZoneDraft;
  setDraft: (d: ZoneDraft) => void;
  carteVisible?: boolean;
  onSave: (payload: {
    nom: string;
    type: string;
    code: string;
    numeroQg: string | null;
    geometrie: GeoJsonPolygon | null;
  }) => Promise<void> | void;
  onCancel: () => void;
}) {
  const geojson = useMemo(() => verticesToGeoJson(draft.vertices), [draft.vertices]);

  return (
    <section className="form bubble-card">
      <h3>{draft.id ? 'Modifier la zone' : 'Nouvelle zone'}</h3>
      <p className="muted small admin-form-intro">
        Commune ou route nationale : renseignez les champs puis tracez le contour sur la carte.
      </p>
      {!carteVisible ? (
        <p className="muted small admin-form-intro" role="status">
          Carte masquée — réaffichez-la pour tracer ou modifier le polygone sur la carte.
        </p>
      ) : null}
      <label>
        Nom (commune ou désignation de l&rsquo;axe)
        <input
          required
          value={draft.nom}
          onChange={(e) => setDraft({ ...draft, nom: e.target.value })}
          maxLength={255}
        />
      </label>
      <label>
        Type
        <select
          value={draft.type}
          onChange={(e) => setDraft({ ...draft, type: e.target.value as SuperAdminZoneType })}
        >
          {SUPER_ADMIN_ZONE_TYPES.map((t) => (
            <option key={t} value={t}>
              {ZONE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Code (unique, ex. TNR-ARR-07, RN7-TNR-DIL)
        <input
          required
          value={draft.code}
          onChange={(e) => setDraft({ ...draft, code: e.target.value.trim() })}
          maxLength={64}
        />
      </label>
      <label>
        Numéro de contact (optionnel)
        <input
          value={draft.numeroQg}
          onChange={(e) => setDraft({ ...draft, numeroQg: e.target.value })}
          maxLength={32}
          placeholder="+261 …"
        />
      </label>
      <div className="muted small admin-zone-vertices">
        Sommets : {draft.vertices.length}
        {draft.vertices.length > 0 ? (
          <>
            {' · '}
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => setDraft({ ...draft, vertices: draft.vertices.slice(0, -1) })}
            >
              Annuler le dernier
            </button>
            {' · '}
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => setDraft({ ...draft, vertices: [] })}
            >
              Tout effacer
            </button>
          </>
        ) : null}
      </div>
      <div className="row admin-form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {draft.id ? 'Annuler' : 'Réinitialiser'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            void onSave({
              nom: draft.nom.trim(),
              type: draft.type,
              code: draft.code.trim(),
              numeroQg: draft.numeroQg.trim() || null,
              geometrie: geojson,
            })
          }
        >
          {draft.id ? 'Enregistrer' : 'Créer la zone'}
        </button>
      </div>
    </section>
  );
}

function ZoneList({
  zones,
  onEdit,
  onDelete,
}: {
  zones: Zone[];
  onEdit: (z: Zone) => void;
  onDelete: (z: Zone) => Promise<void> | void;
}) {
  const [filter, setFilter] = useState<'ALL' | SuperAdminZoneType>('ALL');
  const [query, setQuery] = useState('');
  const filtered = zones.filter((z) => {
    if (filter !== 'ALL' && z.type !== filter) return false;
    const q = normalizeText(query);
    if (!q) return true;
    return (
      normalizeText(z.nom).includes(q) ||
      normalizeText(z.code).includes(q) ||
      normalizeText(z.numeroQg || '').includes(q)
    );
  });
  return (
    <section className="kanban">
      <h3>Territoires ({zones.length})</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        Les dépôts éventuels apparaissent en lecture seule (gérés par les communes).
      </p>
      <label className="small muted">
        Recherche rapide
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom, code ou contact"
        />
      </label>
      <div className="chips" style={{ marginBottom: 6 }}>
        {(['ALL', ...SUPER_ADMIN_ZONE_TYPES] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={filter === t ? 'chip on' : 'chip'}
            onClick={() => setFilter(t)}
          >
            {t === 'ALL' ? 'Toutes' : ZONE_TYPE_LABEL[t as TypeZone]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="muted small">Aucune zone à afficher.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {filtered.map((z) => (
            <li key={z.id} className="admin-list-item">
              <div className="admin-list-item-main">
                <div className="admin-list-item-title">{z.nom}</div>
                <div className="muted small">
                  {z.code} · {ZONE_TYPE_LABEL[z.type as TypeZone] || z.type}
                  {z.numeroQg ? ` · ${z.numeroQg}` : ''}
                  {z.geometrie ? ' · tracée' : ''}
                </div>
              </div>
              <div className="admin-list-item-actions">
                {z.type === 'DEPOT_REPARATION' ? (
                  <span className="muted small">Lecture seule</span>
                ) : (
                  <>
                    <button type="button" className="btn btn-ghost small" onClick={() => onEdit(z)}>
                      Éditer
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost small"
                      onClick={() => void onDelete(z)}
                    >
                      Suppr.
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QgAdminForm({
  zones,
  onCreate,
}: {
  zones: Zone[];
  onCreate: (body: {
    zoneId: string;
    nom: string;
    prenom: string;
    email: string;
    password: string;
    numeroTelephone: string;
    matricule?: string | null;
  }) => Promise<void> | void;
}) {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [zoneId, setZoneId] = useState<string>('');
  const [numeroTelephone, setNumeroTelephone] = useState('');
  const [matricule, setMatricule] = useState('');

  return (
    <section className="form bubble-card">
      <h3>Créer un Admin QG</h3>
      <p className="muted small admin-form-intro">
        Créez un compte de supervision local rattaché a une zone.
      </p>
      {zones.length === 0 ? (
        <p className="muted small">
          Créez d'abord une zone (arrondissement / route nationale) avant d'y
          rattacher un Admin QG.
        </p>
      ) : (
        <>
          <label>
            Zone (commune / axe)
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} required>
              <option value="">— choisir —</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nom} ({z.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            Nom
            <input required value={nom} onChange={(e) => setNom(e.target.value)} />
          </label>
          <label>
            Prénom
            <input required value={prenom} onChange={(e) => setPrenom(e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Mot de passe initial (≥ 8 caractères)
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Téléphone
            <input
              required
              value={numeroTelephone}
              onChange={(e) => setNumeroTelephone(e.target.value)}
              placeholder="+261 …"
            />
          </label>
          <label>
            Matricule (optionnel)
            <input value={matricule} onChange={(e) => setMatricule(e.target.value)} />
          </label>
          <div className="row admin-form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setNom('');
                setPrenom('');
                setEmail('');
                setPassword('');
                setZoneId('');
                setNumeroTelephone('');
                setMatricule('');
              }}
            >
              Réinitialiser
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                if (!zoneId) return;
                await onCreate({
                  zoneId,
                  nom: nom.trim(),
                  prenom: prenom.trim(),
                  email: email.trim(),
                  password,
                  numeroTelephone: numeroTelephone.trim(),
                  matricule: matricule.trim() || null,
                });
                setNom('');
                setPrenom('');
                setEmail('');
                setPassword('');
                setZoneId('');
                setNumeroTelephone('');
                setMatricule('');
              }}
            >
              Créer Admin QG
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function QgAdminList({ admins, zones }: { admins: AdminQg[]; zones: Zone[] }) {
  const zoneById = useMemo(() => Object.fromEntries(zones.map((z) => [z.id, z])), [zones]);
  return (
    <section className="kanban">
      <h3>Admins QG existants ({admins.length})</h3>
      {admins.length === 0 ? (
        <p className="muted small">Aucun Admin QG.</p>
      ) : (
        <ul className="admin-qg-list">
          {admins.map((a) => (
            <li key={a.id} className="admin-qg-item">
              <div className="admin-qg-item-title">
                {a.prenom} {a.nom} {a.actif ? '' : '· SUSPENDU'}
              </div>
              <div className="muted small">
                {a.email} · {a.zoneId ? zoneById[a.zoneId]?.nom || a.zoneId : '—'}{' '}
                {a.numeroTelephone ? `· ${a.numeroTelephone}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PolygonPicker({
  zones,
  editingZoneId,
  vertices,
  onChange,
}: {
  zones: Zone[];
  editingZoneId?: string;
  vertices: { lat: number; lng: number }[];
  onChange: (v: { lat: number; lng: number }[]) => void;
}) {
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'terrain' | 'satellite' | 'hybrid'>('terrain');
  const [center, setCenter] = useState<{ lat: number; lng: number }>(TANA);
  const [pickedCenter, setPickedCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [confirmedCenter, setConfirmedCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [regionFilter, setRegionFilter] = useState<'ALL' | RegionName>('ALL');
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  if (!apiKey) {
    return (
      <div className="map-missing">
        <div>
          <strong>Clé Google Maps manquante</strong>
          <p className="muted small">
            Ajoutez <code>VITE_GOOGLE_MAPS_API_KEY</code> dans <code>frontend/.env.local</code>.
          </p>
          <textarea
            className="geo-textarea"
            rows={6}
            placeholder='Sans clé : collez un GeoJSON {"type":"Polygon","coordinates":[...]}'
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                if (parsed && parsed.type === 'Polygon' && Array.isArray(parsed.coordinates?.[0])) {
                  onChange(geoJsonToVertices(parsed));
                }
              } catch {
                /* ignore */
              }
            }}
          />
        </div>
      </div>
    );
  }

  const stage = confirmedCenter ? 'delimit' : 'pick';

  function confirmLocation() {
    const c = pickedCenter || { lat: center.lat, lng: center.lng };
    setConfirmedCenter(c);
    onChange([]);
  }

  function resetLocation() {
    setPickedCenter(null);
    setConfirmedCenter(null);
    onChange([]);
  }

  const polygonPaths = useMemo(
    () => (vertices.length >= 3 ? [vertices] : []),
    [vertices],
  );
  const zonePolygons = useMemo(
    () =>
      zones
        .map((z) => {
          const zoneVertices = geoJsonToVertices(z.geometrie);
          return {
            id: z.id,
            paths: zoneVertices.length >= 3 ? [zoneVertices] : [],
          };
        })
        .filter((z) => z.paths.length > 0),
    [zones],
  );
  const communeZones = useMemo(
    () =>
      zones
        .filter((z) => z.type === 'ARRONDISSEMENT')
        .map((z) => {
          const zoneVertices = geoJsonToVertices(z.geometrie);
          return {
            id: z.id,
            nom: z.nom,
            region: inferRegionFromVertices(zoneVertices),
            vertices: zoneVertices,
          };
        })
        .filter((z) => z.vertices.length >= 3)
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [zones],
  );
  const filteredCommunes = useMemo(
    () => {
      const query = normalizeText(searchQuery);
      return communeZones.filter((z) => {
        if (regionFilter !== 'ALL' && z.region !== regionFilter) return false;
        if (!query) return true;
        const nom = normalizeText(z.nom);
        if (nom.includes(query)) return true;
        const regionAliases = REGION_ALIASES[z.region];
        return regionAliases.some((alias) => alias.includes(query) || query.includes(alias));
      });
    },
    [communeZones, regionFilter, searchQuery],
  );
  const selectedZoneVertices = useMemo(
    () => filteredCommunes.find((z) => z.id === selectedZoneId)?.vertices ?? null,
    [filteredCommunes, selectedZoneId],
  );

  useEffect(() => {
    if (!selectedZoneId) return;
    if (filteredCommunes.some((z) => z.id === selectedZoneId)) return;
    setSelectedZoneId('');
  }, [filteredCommunes, selectedZoneId]);
  useEffect(() => {
    const query = normalizeText(searchQuery);
    if (!query) return;
    const matchedRegion = (Object.entries(REGION_ALIASES) as [RegionName, string[]][])
      .find(([, aliases]) => aliases.some((alias) => query.includes(alias)));
    if (matchedRegion) setRegionFilter(matchedRegion[0]);
  }, [searchQuery]);
  useEffect(() => {
    if (!selectedZoneId) return;
    const selected = communeZones.find((z) => z.id === selectedZoneId);
    if (!selected) return;
    setSearchQuery(selected.nom);
    setRegionFilter(selected.region);
  }, [selectedZoneId, communeZones]);
  const draftRegion = useMemo(() => inferRegionFromVertices(vertices), [vertices]);

  function pinIcon(fill: string): google.maps.Icon | undefined {
    if (typeof window === 'undefined' || !window.google?.maps) return undefined;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
  <path d="M17 2.5C10.1 2.5 4.5 8.1 4.5 15c0 9.4 10.6 20 12.1 21.7a.7.7 0 0 0 1 0C19.1 35 29.5 24.4 29.5 15 29.5 8.1 23.9 2.5 17 2.5Z"
    fill="${fill}" stroke="#ffffff" stroke-width="2.6"/>
  <circle cx="17" cy="15" r="6.6" fill="#ffffff" stroke="#0f172a" stroke-opacity="0.2" stroke-width="1"/>
</svg>`;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new window.google.maps.Size(34, 44),
      anchor: new window.google.maps.Point(17, 41),
      labelOrigin: new window.google.maps.Point(17, 15),
    };
  }

  const vertexIcon = useMemo(() => pinIcon('#0ea5e9'), []);
  const centerIcon = useMemo(() => pinIcon('#1a73e8'), []);

  function addVertexFromClick(e: MapMouseEvent) {
    const ll = e.detail.latLng;
    if (!ll) return;
    if (!confirmedCenter) {
      setPickedCenter({ lat: ll.lat, lng: ll.lng });
      return;
    }
    onChange([...vertices, { lat: ll.lat, lng: ll.lng }]);
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        height: '100%',
        width: '100%',
        padding: '12px',
      }}
    >
      <div className="row">
        <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Fond de carte
          <select
            value={mapTypeId}
            onChange={(e) =>
              setMapTypeId(e.target.value as 'roadmap' | 'terrain' | 'satellite' | 'hybrid')
            }
            style={{ minWidth: 170 }}
          >
            <option value="roadmap">Plan</option>
            <option value="terrain">Relief (terrain)</option>
            <option value="satellite">Satellite</option>
            <option value="hybrid">Hybride</option>
          </select>
        </label>
        <div
          className="admin-map-filters"
        >
          <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Région
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value as 'ALL' | RegionName)}
              style={{ minWidth: 170 }}
            >
              <option value="ALL">Toutes les régions</option>
              <option value="Antananarivo">Antananarivo</option>
              <option value="Fianarantsoa">Fianarantsoa</option>
              <option value="Toliara">Toliara</option>
              <option value="Toamasina">Toamasina (Tamatave)</option>
              <option value="Mahajanga">Mahajanga</option>
              <option value="Antsiranana">Antsiranana</option>
            </select>
          </label>
          <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Recherche
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ex: tamatave"
              list="commune-search-suggestions"
              style={{ minWidth: 180 }}
            />
            <datalist id="commune-search-suggestions">
              {communeZones.map((z) => (
                <option key={`${z.id}-nom`} value={z.nom} />
              ))}
              {(Object.entries(REGION_ALIASES) as [RegionName, string[]][])
                .flatMap(([, aliases]) => aliases)
                .filter((alias, idx, arr) => arr.indexOf(alias) === idx)
                .map((alias) => (
                  <option key={`alias-${alias}`} value={alias} />
                ))}
            </datalist>
          </label>
          <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Commune
            <select
              value={selectedZoneId}
              onChange={(e) => setSelectedZoneId(e.target.value)}
              style={{ minWidth: 230 }}
            >
              <option value="">-- choisir une commune --</option>
              {filteredCommunes.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nom} ({REGION_LABELS[z.region]})
                </option>
              ))}
            </select>
          </label>
        </div>
        {stage === 'pick' ? (
          <button type="button" className="btn btn-primary" onClick={confirmLocation}>
            Confirmer cet emplacement
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary" disabled>
              Cliquez sur la carte pour tracer
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onChange(vertices.slice(0, -1))}
              disabled={vertices.length === 0}
            >
              Annuler dernier sommet
            </button>
            <button type="button" className="btn btn-ghost" onClick={resetLocation}>
              Rechoisir le lieu
            </button>
          </>
        )}
      </div>

      {stage === 'pick' ? (
        <p className="muted small" style={{ margin: 0 }}>
          Étape 1/2: cliquez sur la carte pour choisir l'emplacement de la commune, puis confirmez.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <p className="muted small" style={{ margin: 0 }}>
            Étape 2/2: tracez la délimitation en cliquant les sommets sur la carte, dans
            l'ordre (comme une polyligne). Le contour se ferme automatiquement entre le
            dernier et le premier point.
          </p>
          {vertices.length >= 3 ? (
            <p className="muted small" style={{ margin: 0 }}>
              Région détectée automatiquement: <strong>{REGION_LABELS[draftRegion]}</strong>
            </p>
          ) : null}
        </div>
      )}
      <div
        className={`map-wrap admin-zone-picker${stage === 'delimit' ? ' draw-mode' : ''}`}
        style={{
          flex: '1 1 auto',
          minHeight: 320,
          borderRadius: 12,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={TANA}
          defaultZoom={12}
          minZoom={5.8}
          restriction={{ latLngBounds: MADAGASCAR_BOUNDS, strictBounds: true }}
          mapTypeId={mapTypeId}
          gestureHandling="greedy"
          onCameraChanged={(ev: MapCameraChangedEvent) => setCenter(ev.detail.center)}
          onClick={addVertexFromClick}
          style={{ width: '100%', height: '100%' }}
        >
          <SelectedCommuneFocus vertices={selectedZoneVertices} />
          {zonePolygons.map((zone) => (
            <Polygon
              key={zone.id}
              paths={zone.paths}
              strokeColor="#0f766e"
              strokeOpacity={zone.id === editingZoneId ? 0.95 : 0.7}
              strokeWeight={zone.id === editingZoneId ? 3 : 2}
              fillColor="#14b8a6"
              fillOpacity={zone.id === editingZoneId ? 0.18 : 0.1}
              clickable={false}
              zIndex={0}
            />
          ))}
          {polygonPaths.length > 0 ? (
            <Polygon
              paths={polygonPaths}
              strokeColor="#007e3a"
              strokeOpacity={0.95}
              strokeWeight={3}
              fillColor="#007e3a"
              fillOpacity={0.22}
              clickable={false}
              zIndex={1}
            />
          ) : null}
          {vertices.map((v, i) => (
            <Marker
              key={`${i}-${v.lat}-${v.lng}`}
              position={v}
              icon={vertexIcon}
              label={{ text: String(i + 1), color: '#0f172a', fontSize: '12px', fontWeight: '700' }}
            />
          ))}
          {confirmedCenter ? (
            <Marker
              position={confirmedCenter}
              title="Centre commune confirmé"
              icon={centerIcon}
              label={{ text: 'C', color: 'white', fontSize: '12px', fontWeight: '700' }}
            />
          ) : pickedCenter ? (
            <Marker
              position={pickedCenter}
              title="Centre choisi (non confirmé)"
              icon={centerIcon}
              label={{ text: 'C', color: 'white', fontSize: '12px', fontWeight: '700' }}
            />
          ) : null}
        </Map>
      </APIProvider>
        {/* Guide visuel : centre fixe + grand cercle transparent pour juger la grandeur */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#1a73e8',
              border: '2px solid white',
              boxShadow: '0 0 0 2px rgba(0, 0, 0, 0.35)',
            }}
          />
          <div
            className="muted small"
            style={{
              position: 'absolute',
              bottom: 10,
              left: 10,
              background: 'rgba(255, 255, 255, 0.96)',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              borderRadius: 999,
              padding: '6px 12px',
              color: '#202124',
              boxShadow: '0 2px 6px rgba(60, 64, 67, 0.18)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {stage === 'pick'
              ? (pickedCenter
                ? "Centre choisi - cliquez sur Confirmer cet emplacement"
                : 'Cliquez sur la carte pour choisir le centre')
              : `Délimitation en cours • ${vertices.length} sommet${vertices.length > 1 ? 's' : ''}`}
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectedCommuneFocus({
  vertices,
}: {
  vertices: { lat: number; lng: number }[] | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !vertices || vertices.length < 3 || typeof window === 'undefined' || !window.google?.maps) return;
    const bounds = new window.google.maps.LatLngBounds();
    for (const v of vertices) bounds.extend(v);
    if (!bounds.isEmpty()) map.fitBounds(bounds, 80);
  }, [map, vertices]);

  return null;
}
