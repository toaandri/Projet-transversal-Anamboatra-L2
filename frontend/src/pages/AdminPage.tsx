/** Référentiel territorial national — console administration (MTP / Anamboatra). */
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
import { ANAMBOATRA_MAP_STYLE } from '../mapStyles';
import { type MapBasemapId, googleMapTypeFromBasemap } from '../mapBasemap';
import { useAuth } from '../useAuth';
import type {
  AdminQg,
  GeoJsonPolygon,
  TypeZone,
  Zone,
} from '../types';
import { OrgEmailLocalField, fullOrgEmail } from '../components/OrgEmailLocalField';

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

/** Types de zone gérés par l’administration nationale (référentiel). */
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
  /** Panneau de création (barre gauche) : visible seulement après « Ajouter une zone » ou en édition. */
  const [showNewZoneForm, setShowNewZoneForm] = useState(false);
  /** Carte interactive (point central + tracer) : après « Ajouter un emplacement », ou toujours en édition. */
  const [mapPlacementActive, setMapPlacementActive] = useState(false);
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
          <h2 style={{ marginBottom: 6 }}>Administration nationale</h2>
          <p className="muted small" style={{ marginTop: 0, marginBottom: 16, lineHeight: 1.45 }}>
            Ministère des Travaux Publics — référentiel géographique et gestion centralisée des comptes
            administrateurs communaux Anamboatra.
          </p>
          {user?.role && user.role !== 'SUPER_ADMIN' ? (
            <p className="alert error">
              Ce compte ne dispose pas des habilitations administration nationale.
            </p>
          ) : null}
          <div className="row" style={{ marginBottom: 12 }}>
            <Link to="/connexion" className="btn btn-primary">
              Connexion super-administrateur
            </Link>
          </div>
          <details>
            <summary className="muted small">Jeton d&apos;installation</summary>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                if (tokenInput.trim()) void tryToken(tokenInput.trim());
              }}
            >
              <label>
                Jeton
                <input
                  type="password"
                  autoComplete="off"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Token"
                />
              </label>
              {err ? <p className="alert error">{err}</p> : null}
              <button type="submit" className="btn btn-ghost" disabled={checking}>
                {checking ? 'Vérification…' : 'Valider'}
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

  const isEditingZone = Boolean(draft.id);
  const showZoneEditor = isEditingZone || showNewZoneForm;
  const mapInteractionEnabled = isEditingZone || mapPlacementActive;

  function resetNewZoneFlow() {
    setDraft(EMPTY_DRAFT);
    setShowNewZoneForm(false);
    setMapPlacementActive(false);
  }

  return (
    <div className="page dashboard">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <div>
            <div className="muted small" style={{ fontWeight: 600, letterSpacing: '0.02em' }}>
              République de Madagascar
            </div>
            <strong>Ministère des Travaux Publics</strong>
            <div className="muted small">
              Référentiel territorial — Anamboatra
              {mode === 'jwt' && (user?.prenom || user?.nom)
                ? ` · ${`${user?.prenom ?? ''} ${user?.nom ?? ''}`.trim()}`
                : mode === 'token'
                  ? ' · accès installation (jeton)'
                  : ''}
            </div>
          </div>
        </div>
        <nav className="nav">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setMapVisible((v) => !v)}
            aria-pressed={!mapVisible}
            title={mapVisible ? 'Masquer la carte' : 'Afficher la carte'}
          >
            {mapVisible ? 'Masquer la carte' : 'Afficher la carte'}
          </button>
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
            <span className="logo" aria-hidden="true" />
            <div>
              <div className="muted small" style={{ fontWeight: 600 }}>
                Ministère des Travaux Publics
              </div>
              <strong>Référentiel territorial</strong>
              <div className="muted small">Anamboatra</div>
              <div className="muted" style={{ marginTop: 6, fontSize: '0.88rem' }}>
                {mode === 'jwt'
                  ? `${user?.prenom ?? ''} ${user?.nom ?? ''}`.trim() || 'Administrateur national'
                  : 'Accès installation (jeton)'}
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
            <button type="button" className="btn btn-ghost" onClick={signOut}>
              {mode === 'token' ? 'Verrouiller' : 'Déconnexion'}
            </button>
          </div>

          {err ? <p className="alert error">{err}</p> : null}
          {msg ? <p className="alert success">{msg}</p> : null}

          <section className="admin-kpi-grid" aria-label="Indicateurs du référentiel">
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
              {!showZoneEditor ? (
                <div className="bubble-card admin-idle-zone-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setDraft(EMPTY_DRAFT);
                      setShowNewZoneForm(true);
                      setMapPlacementActive(false);
                      setSideOpen(true);
                    }}
                  >
                    Nouvelle zone
                  </button>
                </div>
              ) : null}

              {showZoneEditor ? (
              <ZoneEditor
                draft={draft}
                setDraft={setDraft}
                carteVisible={mapVisible}
                mapPlacementActive={mapInteractionEnabled}
                onBeginMapPlacement={() => setMapPlacementActive(true)}
                onCancelMapPlacement={() => {
                  setMapPlacementActive(false);
                  setDraft((d) => ({ ...d, vertices: [] }));
                }}
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
                    resetNewZoneFlow();
                    await runRefresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Erreur');
                  }
                }}
                onCancel={() => {
                  if (draft.id) {
                    setDraft(EMPTY_DRAFT);
                    setMapPlacementActive(false);
                  } else {
                    resetNewZoneFlow();
                  }
                  setSideOpen(false);
                }}
              />
              ) : null}

              <ZoneList
                zones={zones}
                onEdit={(z) => {
                  if (z.type === 'DEPOT_REPARATION') return;
                  const t: SuperAdminZoneType =
                    z.type === 'ROUTE_NATIONALE' ? 'ROUTE_NATIONALE' : 'ARRONDISSEMENT';
                  setShowNewZoneForm(false);
                  setMapPlacementActive(true);
                  setSideOpen(true);
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
              interactionEnabled={mapInteractionEnabled}
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
  mapPlacementActive = false,
  onBeginMapPlacement,
  onCancelMapPlacement,
  onSave,
  onCancel,
}: {
  draft: ZoneDraft;
  setDraft: (d: ZoneDraft | ((prev: ZoneDraft) => ZoneDraft)) => void;
  carteVisible?: boolean;
  mapPlacementActive?: boolean;
  onBeginMapPlacement?: () => void;
  /** Nouvelle zone : quitter la carte placement et revenir en consultation sans fermer le formulaire. */
  onCancelMapPlacement?: () => void;
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
  const isNewZone = !draft.id;

  return (
    <section className="form bubble-card">
      <h3>{draft.id ? 'Modifier la zone' : 'Nouvelle zone'}</h3>
      {isNewZone && carteVisible && !mapPlacementActive && onBeginMapPlacement ? (
        <div
          role="region"
          aria-label="Carte"
          style={{
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid rgba(15, 23, 42, 0.09)',
            background: 'rgba(248, 250, 252, 0.95)',
          }}
        >
          <button type="button" className="btn btn-primary" onClick={() => onBeginMapPlacement()}>
            Carte · placer et tracer
          </button>
        </div>
      ) : null}
      {isNewZone && carteVisible && mapPlacementActive && onCancelMapPlacement ? (
        <div style={{ marginBottom: 14 }}>
          <button type="button" className="btn btn-ghost" onClick={() => onCancelMapPlacement()}>
            Quitter le mode carte
          </button>
        </div>
      ) : null}
      {!carteVisible ? (
        <p className="muted small admin-form-intro" role="status">
          Carte masquée.
        </p>
      ) : null}
      <label>
        Nom
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
        Code
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
        {draft.vertices.length > 0 && mapPlacementActive ? (
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
          Annuler
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
      <label className="small muted">
        Rechercher
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom, code…"
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
        <p className="muted small">Aucun territoire.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {filtered.map((z) => (
            <li key={z.id} className="admin-list-item">
              <div className="admin-list-item-main">
                <div className="admin-list-item-title">{z.nom}</div>
                <div className="muted small">
                  {z.code} · {ZONE_TYPE_LABEL[z.type as TypeZone] || z.type}
                  {z.numeroQg ? ` · ${z.numeroQg}` : ''}
                  {z.geometrie ? ' · cartographié' : ''}
                </div>
              </div>
              <div className="admin-list-item-actions">
                {z.type === 'DEPOT_REPARATION' ? (
                  <span className="muted small">Référentiel</span>
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
  const [emailLocal, setEmailLocal] = useState('');
  const [password, setPassword] = useState('');
  const [zoneId, setZoneId] = useState<string>('');
  const [numeroTelephone, setNumeroTelephone] = useState('');
  const [matricule, setMatricule] = useState('');

  return (
    <section className="form bubble-card">
      <h3>Nouvel administrateur QG</h3>
      {zones.length === 0 ? (
        <p className="muted small">Créez un territoire dans l&apos;onglet précédent.</p>
      ) : (
        <>
          <label>
            Zone
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
            E-mail
            <OrgEmailLocalField required value={emailLocal} onChange={setEmailLocal} />
          </label>
          <label>
            Mot de passe (≥ 8 caractères)
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
                setEmailLocal('');
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
                  email: fullOrgEmail(emailLocal),
                  password,
                  numeroTelephone: numeroTelephone.trim(),
                  matricule: matricule.trim() || null,
                });
                setNom('');
                setPrenom('');
                setEmailLocal('');
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
      <h3>Administrateurs QG ({admins.length})</h3>
      {admins.length === 0 ? (
        <p className="muted small">Aucun enregistrement.</p>
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
  interactionEnabled = true,
  onChange,
}: {
  zones: Zone[];
  editingZoneId?: string;
  vertices: { lat: number; lng: number }[];
  interactionEnabled?: boolean;
  onChange: (v: { lat: number; lng: number }[]) => void;
}) {
  const [basemap, setBasemap] = useState<MapBasemapId>('plan');
  const mapTypeId = googleMapTypeFromBasemap(basemap);
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
          <strong>Configurer la carte</strong>
          <p className="muted small">
            Variable <code>VITE_GOOGLE_MAPS_API_KEY</code> (<code>.env.local</code>).
          </p>
          <textarea
            className="geo-textarea"
            rows={6}
            placeholder='{"type":"Polygon","coordinates":[...]}'
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

  useEffect(() => {
    if (!interactionEnabled) {
      setPickedCenter(null);
      setConfirmedCenter(null);
    }
  }, [interactionEnabled]);

  /** Édition d’une zone existante avec polygone : passer directement en délimitation sans re-cliquer le centre. */
  useEffect(() => {
    if (!interactionEnabled) return;
    if (!editingZoneId || vertices.length < 3) return;
    setConfirmedCenter((prev) => prev ?? centroidOfRing(vertices) ?? null);
  }, [interactionEnabled, editingZoneId, vertices]);

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
    if (!interactionEnabled) return;
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
            value={basemap}
            onChange={(e) => setBasemap(e.target.value as MapBasemapId)}
            style={{ minWidth: 170 }}
          >
            <option value="plan">Plan</option>
            <option value="satellite">Satellite</option>
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
              placeholder="Commune ou région"
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
              <option value="">Commune…</option>
              {filteredCommunes.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nom} ({REGION_LABELS[z.region]})
                </option>
              ))}
            </select>
          </label>
        </div>
        {interactionEnabled ? (
          stage === 'pick' ? (
            <button type="button" className="btn btn-primary" onClick={confirmLocation}>
              Confirmer cet emplacement
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" disabled>
                Polygone — ajouter les sommets par clic carte
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
                Reprendre la désignation du centre
              </button>
            </>
          )
        ) : null}
      </div>

      {interactionEnabled ? (
        stage === 'pick' ? (
          <p className="muted small" style={{ margin: 0 }}>
            Cliquer pour positionner le centre administratif puis valider.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            <p className="muted small" style={{ margin: 0 }}>
              Sommets du polygone dans l&apos;ordre — le contour se ferme automatiquement.
            </p>
            {vertices.length >= 3 ? (
              <p className="muted small" style={{ margin: 0 }}>
                Région : <strong>{REGION_LABELS[draftRegion]}</strong>
              </p>
            ) : null}
          </div>
        )
      ) : null}
      <div
        className={`map-wrap admin-zone-picker${
          interactionEnabled && stage === 'delimit' ? ' draw-mode' : ''
        }`}
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
          styles={ANAMBOATRA_MAP_STYLE}
          gestureHandling="greedy"
          mapTypeControl={false}
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
          {interactionEnabled && confirmedCenter ? (
            <Marker
              position={confirmedCenter}
              title="Centre commune confirmé"
              icon={centerIcon}
              label={{ text: 'C', color: 'white', fontSize: '12px', fontWeight: '700' }}
            />
          ) : interactionEnabled && pickedCenter ? (
            <Marker
              position={pickedCenter}
              title="Centre choisi (non confirmé)"
              icon={centerIcon}
              label={{ text: 'C', color: 'white', fontSize: '12px', fontWeight: '700' }}
            />
          ) : null}
        </Map>
      </APIProvider>
        {interactionEnabled ? (
          <>
            {/* Guide visuel : point au centre écran pendant le choix d’emplacement */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {stage === 'pick' ? (
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
              ) : null}
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
                  ? pickedCenter
                    ? 'Valider avant de tracer le périmètre'
                    : 'Pointer le centre territorial sur la carte'
                  : `${vertices.length} sommet${vertices.length > 1 ? 's' : ''}`}
              </div>
            </div>
          </>
        ) : null}
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
