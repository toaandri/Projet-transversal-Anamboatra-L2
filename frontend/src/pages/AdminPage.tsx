import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { api, getAdminToken, getToken, setAdminToken } from '@/lib/api';
import { ANAMBOATRA_MAP_STYLE } from '@/theme/mapStyles';
import { type MapBasemapId, googleMapTypeFromBasemap } from '@/theme/mapBasemap';
import { useAuth } from '@/auth/useAuth';
import type {
  AdminQg,
  GeoJsonPolygon,
  TypeZone,
  Zone,
} from '@/lib/types';
import { OrgEmailLocalField, fullOrgEmail, localPartFromInput } from '@/components/OrgEmailLocalField';
import { MadagascarBrandMark } from '@/components/MadagascarBrandMark';
import { ROLE_LABELS } from '@/theme/mapColors';
import { anam } from '@/theme/anamboatraTheme';

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
  ARRONDISSEMENT: 'Commune ou arrondissement',
  ROUTE_NATIONALE: 'Route nationale',
  DEPOT_REPARATION: 'Dépôt de réparation',
};

type SuperAdminZoneType = 'ARRONDISSEMENT' | 'ROUTE_NATIONALE';

const SUPER_ADMIN_ZONE_TYPES: SuperAdminZoneType[] = ['ARRONDISSEMENT', 'ROUTE_NATIONALE'];

type QgAdminEditRow = {
  id: string;
  nom: string;
  prenom: string;
  emailLocal: string;
    password: string;
  numeroTelephone: string;
  matricule: string;
};

type ZoneDraft = {
  id?: string;
  nom: string;
  type: SuperAdminZoneType;
  code: string;
  numeroQg: string;
  vertices: { lat: number; lng: number }[];
    qgPrenom: string;
  qgNom: string;
  qgEmailLocal: string;
  qgPassword: string;
  qgNumeroTelephone: string;
  qgMatricule: string;
    qgAdminRows: QgAdminEditRow[];
};

const EMPTY_DRAFT: ZoneDraft = {
  nom: '',
  type: 'ARRONDISSEMENT',
  code: '',
  numeroQg: '',
  vertices: [],
  qgPrenom: '',
  qgNom: '',
  qgEmailLocal: '',
  qgPassword: '',
  qgNumeroTelephone: '',
  qgMatricule: '',
  qgAdminRows: [],
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
    const [showNewZoneForm, setShowNewZoneForm] = useState(false);
    const [mapPlacementActive, setMapPlacementActive] = useState(false);
  const [detailZone, setDetailZone] = useState<Zone | null>(null);
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

  const openZoneForEdit = useCallback(
    (z: Zone) => {
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
        qgPrenom: '',
        qgNom: '',
        qgEmailLocal: '',
        qgPassword: '',
        qgNumeroTelephone: '',
        qgMatricule: '',
        qgAdminRows: admins
          .filter((a) => a.zoneId === z.id)
          .map((a) => ({
            id: a.id,
            nom: a.nom,
            prenom: a.prenom,
            emailLocal: localPartFromInput(a.email),
            password: '',
            numeroTelephone: a.numeroTelephone || '',
            matricule: a.matricule || '',
          })),
      });
      setMsg(null);
      setErr(null);
    },
    [admins],
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
        setErr(e instanceof Error ? e.message : 'Jeton d’accès refusé ou expiré.');
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

  if (!mode) {
    return (
      <div className="page center">
        <div className="panel" style={{ maxWidth: 460, width: '100%' }}>
          <h2 style={{ marginBottom: 6 }}>Console nationale — Anamboatra</h2>
          <p className="muted small" style={{ marginTop: 0, marginBottom: 16, lineHeight: 1.45 }}>
            Référentiel territorial et administration des comptes quartier général (MTP). Accès réservé aux
            profils d’ingénierie et de pilotage habilités.
          </p>
          {user?.role && user.role !== 'SUPER_ADMIN' ? (
            <p className="alert error">
              Ce compte n’est pas habilité pour la console nationale.
            </p>
          ) : null}
          <div className="row" style={{ marginBottom: 12 }}>
            <Link to="/" className="btn btn-primary">
              Authentification super-administrateur
            </Link>
          </div>
          <details>
            <summary className="muted small">Accès par jeton d’installation</summary>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                if (tokenInput.trim()) void tryToken(tokenInput.trim());
              }}
            >
              <label>
                Jeton sécurisé
                <input
                  type="password"
                  autoComplete="off"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Saisir le jeton"
                />
              </label>
              {err ? <p className="alert error">{err}</p> : null}
              <button type="submit" className="btn btn-ghost" disabled={checking}>
                {checking ? 'Contrôle en cours…' : 'Valider l’accès'}
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
      nav('/', { replace: true });
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
          <MadagascarBrandMark />
          <div>
            <div className="muted small" style={{ fontWeight: 600, letterSpacing: '0.02em' }}>
              République de Madagascar
            </div>
            <strong>Ministère des Travaux Publics</strong>
            <div className="muted small">
              Référentiel territorial — Anamboatra
              {mode === 'jwt' && user?.role === 'SUPER_ADMIN'
                ? ` · ${ROLE_LABELS.SUPER_ADMIN}`
                : mode === 'jwt' && (user?.prenom || user?.nom)
                  ? ` · ${`${user?.prenom ?? ''} ${user?.nom ?? ''}`.trim()}`
                  : mode === 'token'
                    ? ' · session jeton d’installation'
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
            title={mapVisible ? 'Masquer le fond cartographique' : 'Afficher le fond cartographique'}
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
            <MadagascarBrandMark />
            <div className="qg-header-text">
              <small>République de Madagascar</small>
              <strong>Référentiel territorial</strong>
              <div className="muted small">Anamboatra </div>
              <div className="muted" style={{ marginTop: 6, fontSize: '0.88rem' }}>
                {mode === 'jwt'
                  ? user?.role === 'SUPER_ADMIN'
                    ? ROLE_LABELS.SUPER_ADMIN
                    : `${user?.prenom ?? ''} ${user?.nom ?? ''}`.trim() || ROLE_LABELS.SUPER_ADMIN
                  : 'Session jeton d’installation'}
              </div>
            </div>
          </div>
          <div className="side-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setMapVisible((v) => !v)}
              aria-pressed={!mapVisible}
              title={mapVisible ? 'Masquer le fond cartographique' : 'Afficher le fond cartographique'}
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
              <span className="admin-kpi-label">Entités</span>
              <strong className="admin-kpi-value">{zoneCountByType.all}</strong>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Communes</span>
              <strong className="admin-kpi-value">{zoneCountByType.arr}</strong>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Axes RN</span>
              <strong className="admin-kpi-value">{zoneCountByType.route}</strong>
            </div>
            <div className="admin-kpi-card admin-kpi-card-wide">
              <span className="admin-kpi-label">Comptes QG actifs</span>
              <strong className="admin-kpi-value">{admins.filter((a) => a.actif).length}</strong>
            </div>
          </section>

          <div className="chips" style={{ marginBottom: 10 }}>
            <button
              type="button"
              className={tab === 'zones' ? 'chip on' : 'chip'}
              onClick={() => setTab('zones')}
            >
              Périmètres et axes
            </button>
            <button
              type="button"
              className={tab === 'qg' ? 'chip on' : 'chip'}
              onClick={() => setTab('qg')}
            >
              Comptes QG
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
                    Nouveau périmètre
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
                onSave={async (payload, qgAdmin) => {
                  try {
                    setErr(null);
                    if (draft.id) {
                      await api.adminUpdateZone(draft.id, payload, adminOpts);
                      for (const row of draft.qgAdminRows) {
                        const pwd = row.password.trim();
                        if (pwd.length > 0 && pwd.length < 8) {
                          setErr('Mot de passe : 8 caractères minimum, ou laisser vide pour ne pas changer.');
                          return;
                        }
                        const patch: Parameters<typeof api.adminUpdateQgAdmin>[1] = {
                          nom: row.nom.trim(),
                          prenom: row.prenom.trim(),
                          email: fullOrgEmail(row.emailLocal),
                          numeroTelephone: row.numeroTelephone.trim(),
                          matricule: row.matricule.trim() || null,
                        };
                        if (pwd.length >= 8) patch.password = pwd;
                        await api.adminUpdateQgAdmin(row.id, patch, adminOpts);
                      }
                      setMsg('Enregistrement effectué (périmètre et comptes QG).');
                    } else {
                      const { zone } = await api.adminCreateZone(payload, adminOpts);
                      if (qgAdmin) {
                        try {
                          await api.adminCreateQgAdmin(
                            { zoneId: zone.id, ...qgAdmin },
                            adminOpts,
                          );
                          setMsg(`Périmètre créé · compte QG : ${qgAdmin.email}`);
                        } catch (e2) {
                          setErr(
                            e2 instanceof Error
                              ? e2.message
                              : 'Échec de création du compte administrateur.',
                          );
                          setMsg(
                            `Périmètre « ${zone.nom} » enregistré. Création du compte QG à finaliser sous l’onglet Comptes QG.`,
                          );
                        }
                      } else {
                        setMsg('Périmètre créé.');
                      }
                    }
                    resetNewZoneFlow();
                    await runRefresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Échec de l’opération.');
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
                onDetail={(z) => setDetailZone(z)}
                onEdit={openZoneForEdit}
                onDelete={async (z) => {
                  if (z.type === 'DEPOT_REPARATION') return;
                  if (!confirm(`Supprimer définitivement « ${z.nom} » ?`)) return;
                  try {
                    setErr(null);
                    await api.adminDeleteZone(z.id, adminOpts);
                    setMsg('Suppression enregistrée.');
                    await runRefresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Échec de l’opération.');
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
                    setMsg(`Compte QG créé : ${body.email}`);
                    await runRefresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Échec de l’opération.');
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

      {detailZone ? (
        <ZoneDetailModal
          zone={detailZone}
          linkedAdmins={admins.filter((a) => a.zoneId === detailZone.id)}
          onClose={() => setDetailZone(null)}
          onEdit={(z) => {
            setDetailZone(null);
            openZoneForEdit(z);
          }}
        />
      ) : null}
    </div>
  );
}

function formatShortDate(iso?: string): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return null;
  }
}

function ZoneDetailModal({
  zone,
  linkedAdmins,
  onClose,
  onEdit,
}: {
  zone: Zone;
  linkedAdmins: AdminQg[];
  onClose: () => void;
  onEdit: (z: Zone) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const vertices = geoJsonToVertices(zone.geometrie);
  const nVert = vertices.length;
  const regionEstim =
    zone.type === 'ARRONDISSEMENT' && nVert >= 3 ? inferRegionFromVertices(vertices) : null;
  const created = formatShortDate(zone.createdAt);
  const updated = formatShortDate(zone.updatedAt);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="zone-detail-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        style={{ width: 'min(540px, 100%)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="zone-detail-title" style={{ marginTop: 0 }}>
          Détail du périmètre
        </h3>
        <p style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 12 }}>{zone.nom}</p>
        <dl
          style={{
            margin: '0 0 16px',
            display: 'grid',
            gap: '6px 12px',
            gridTemplateColumns: 'auto 1fr',
            fontSize: '0.9rem',
          }}
        >
          <dt className="muted small" style={{ margin: 0 }}>
            Type
          </dt>
          <dd style={{ margin: 0 }}>{ZONE_TYPE_LABEL[zone.type as TypeZone] || zone.type}</dd>
          <dt className="muted small" style={{ margin: 0 }}>
            Code
          </dt>
          <dd style={{ margin: 0 }}>{zone.code}</dd>
          {regionEstim ? (
            <>
              <dt className="muted small" style={{ margin: 0 }}>
                Région (estim.)
              </dt>
              <dd style={{ margin: 0 }}>{REGION_LABELS[regionEstim]}</dd>
            </>
          ) : null}
          <dt className="muted small" style={{ margin: 0 }}>
            Contact périmètre
          </dt>
          <dd style={{ margin: 0 }}>{zone.numeroQg?.trim() || '—'}</dd>
          <dt className="muted small" style={{ margin: 0 }}>
            Géométrie
          </dt>
          <dd style={{ margin: 0 }}>
            {nVert >= 3
              ? `Polygone · ${nVert} sommets`
              : nVert > 0
                ? `${nVert} point(s) — délimitation incomplète`
                : 'Non renseignée'}
          </dd>
          <dt className="muted small" style={{ margin: 0 }}>
            Identifiant
          </dt>
          <dd style={{ margin: 0, wordBreak: 'break-all' }} className="muted small">
            {zone.id}
          </dd>
          {created ? (
            <>
              <dt className="muted small" style={{ margin: 0 }}>
                Créé
              </dt>
              <dd style={{ margin: 0 }}>{created}</dd>
            </>
          ) : null}
          {updated ? (
            <>
              <dt className="muted small" style={{ margin: 0 }}>
                Modifié
              </dt>
              <dd style={{ margin: 0 }}>{updated}</dd>
            </>
          ) : null}
        </dl>

        <div style={{ marginBottom: 16 }}>
          <div className="small" style={{ fontWeight: 700, marginBottom: 8 }}>
            Comptes QG rattachés ({linkedAdmins.length})
          </div>
          {linkedAdmins.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              Aucun administrateur QG pour ce périmètre.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {linkedAdmins.map((a) => (
                <li
                  key={a.id}
                  style={{
                    padding: '8px 0',
                    borderTop: '1px solid rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {a.prenom} {a.nom}
                    {!a.actif ? <span className="muted small"> · compte désactivé</span> : null}
                  </div>
                  <div className="muted small">
                    {a.email}
                    {a.numeroTelephone ? ` · ${a.numeroTelephone}` : ''}
                    {a.matricule ? ` · mat. ${a.matricule}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="row admin-form-actions" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Fermer
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onEdit(zone)}>
            Modifier
          </button>
        </div>
      </div>
    </div>
  );
}

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

  onCancelMapPlacement?: () => void;
  onSave: (
    payload: {
      nom: string;
      type: string;
      code: string;
      numeroQg: string | null;
      geometrie: GeoJsonPolygon | null;
    },
    qgAdmin:
      | null
      | {
          nom: string;
          prenom: string;
          email: string;
          password: string;
          numeroTelephone: string;
          matricule: string | null;
        },
  ) => Promise<void> | void;
  onCancel: () => void;
}) {
  const geojson = useMemo(() => verticesToGeoJson(draft.vertices), [draft.vertices]);
  const isNewZone = !draft.id;
  const formRef = useRef<HTMLFormElement | null>(null);
  const [localFormErr, setLocalFormErr] = useState<string | null>(null);

  return (
    <section className="form bubble-card">
      <h3>{draft.id ? 'Modification du périmètre' : 'Création d’un périmètre'}</h3>
      {localFormErr ? <p className="alert error">{localFormErr}</p> : null}
      {isNewZone && carteVisible && !mapPlacementActive && onBeginMapPlacement ? (
        <div
          role="region"
          aria-label="Saisie cartographique"
          style={{
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid rgba(15, 23, 42, 0.09)',
            background: 'rgba(248, 250, 252, 0.95)',
          }}
        >
          <button type="button" className="btn btn-primary" onClick={() => onBeginMapPlacement()}>
            Saisie cartographique — placer et tracer
          </button>
        </div>
      ) : null}
      {isNewZone && carteVisible && mapPlacementActive && onCancelMapPlacement ? (
        <div style={{ marginBottom: 14 }}>
          <button type="button" className="btn btn-ghost" onClick={() => onCancelMapPlacement()}>
            Quitter la saisie cartographique
          </button>
        </div>
      ) : null}
      {!carteVisible ? (
        <p className="muted small admin-form-intro" role="status">
          Fond cartographique masqué — réactivez-le pour saisir ou modifier la géométrie.
        </p>
      ) : null}
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          setLocalFormErr(null);
          if (!formRef.current?.checkValidity()) {
            formRef.current?.reportValidity();
            return;
          }
          const zonePayload = {
            nom: draft.nom.trim(),
            type: draft.type,
            code: draft.code.trim(),
            numeroQg: draft.numeroQg.trim() || null,
            geometrie: geojson,
          };
          let qgAdmin:
            | null
            | {
                nom: string;
                prenom: string;
                email: string;
                password: string;
                numeroTelephone: string;
                matricule: string | null;
              } = null;
          if (isNewZone && draft.type === 'ARRONDISSEMENT') {
            qgAdmin = {
              nom: draft.qgNom.trim(),
              prenom: draft.qgPrenom.trim(),
              email: fullOrgEmail(draft.qgEmailLocal),
              password: draft.qgPassword,
              numeroTelephone: draft.qgNumeroTelephone.trim(),
              matricule: draft.qgMatricule.trim() || null,
            };
            if (
              !qgAdmin.nom ||
              !qgAdmin.prenom ||
              !draft.qgEmailLocal.trim() ||
              qgAdmin.password.length < 8 ||
              !qgAdmin.numeroTelephone
            ) {
              return;
            }
          }
          if (!isNewZone && draft.qgAdminRows.length > 0) {
            for (const row of draft.qgAdminRows) {
              if (
                !row.nom.trim() ||
                !row.prenom.trim() ||
                !row.emailLocal.trim() ||
                !row.numeroTelephone.trim()
              ) {
                setLocalFormErr('Complétez tous les champs obligatoires pour chaque administrateur QG.');
                return;
              }
              if (row.password.length > 0 && row.password.length < 8) {
                setLocalFormErr(
                  'Mot de passe : au moins 8 caractères, ou laissez vide pour ne pas le modifier.',
                );
                return;
              }
            }
          }
          void onSave(zonePayload, qgAdmin);
        }}
      >
      <label>
        Dénomination
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
        Code référence
        <input
          required
          value={draft.code}
          onChange={(e) => setDraft({ ...draft, code: e.target.value.trim() })}
          maxLength={64}
        />
      </label>
      <label>
        Téléphone de contact (facultatif)
        <input
          value={draft.numeroQg}
          onChange={(e) => setDraft({ ...draft, numeroQg: e.target.value })}
          maxLength={32}
          placeholder="+261 …"
        />
      </label>
      {!isNewZone && (draft.type === 'ARRONDISSEMENT' || draft.type === 'ROUTE_NATIONALE') ? (
        <div style={{ marginTop: 14 }}>
          <h4 className="small" style={{ fontWeight: 700, margin: '0 0 10px' }}>
            Comptes administrateur QG
          </h4>
          <p className="muted small" style={{ marginTop: 0, marginBottom: 10, lineHeight: 1.45 }}>
            Nom, prénom, courriel, téléphone et mot de passe (facultatif : laisser vide pour conserver l’actuel).
          </p>
          {draft.qgAdminRows.length === 0 ? (
            <p className="muted small" style={{ lineHeight: 1.45 }}>
              Aucun compte QG rattaché — créez-en depuis l’onglet « Comptes QG ».
            </p>
          ) : (
            draft.qgAdminRows.map((row, idx) => (
              <fieldset
                key={row.id}
                style={{
                  marginBottom: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(15, 23, 42, 0.12)',
                  background: 'rgba(248, 250, 252, 0.9)',
                }}
              >
                <legend className="small" style={{ fontWeight: 600, padding: '0 6px' }}>
                  Administrateur #{idx + 1}
                </legend>
                <label>
                  Nom
                  <input
                    required
                    value={row.nom}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        qgAdminRows: d.qgAdminRows.map((r, i) =>
                          i === idx ? { ...r, nom: e.target.value } : r,
                        ),
                      }))
                    }
                  />
                </label>
                <label>
                  Prénom
                  <input
                    required
                    value={row.prenom}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        qgAdminRows: d.qgAdminRows.map((r, i) =>
                          i === idx ? { ...r, prenom: e.target.value } : r,
                        ),
                      }))
                    }
                  />
                </label>
                <label>
                  Courriel
                  <OrgEmailLocalField
                    required
                    value={row.emailLocal}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        qgAdminRows: d.qgAdminRows.map((r, i) =>
                          i === idx ? { ...r, emailLocal: v } : r,
                        ),
                      }))
                    }
                  />
                </label>
                <label>
                  Nouveau mot de passe (facultatif)
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={row.password}
                    placeholder="8 caractères min. — vide = inchangé"
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        qgAdminRows: d.qgAdminRows.map((r, i) =>
                          i === idx ? { ...r, password: e.target.value } : r,
                        ),
                      }))
                    }
                  />
                </label>
                <label>
                  Téléphone
                  <input
                    required
                    value={row.numeroTelephone}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        qgAdminRows: d.qgAdminRows.map((r, i) =>
                          i === idx ? { ...r, numeroTelephone: e.target.value } : r,
                        ),
                      }))
                    }
                    placeholder="+261 …"
                  />
                </label>
                <label>
                  Matricule (facultatif)
                  <input
                    value={row.matricule}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        qgAdminRows: d.qgAdminRows.map((r, i) =>
                          i === idx ? { ...r, matricule: e.target.value } : r,
                        ),
                      }))
                    }
                  />
                </label>
              </fieldset>
            ))
          )}
        </div>
      ) : null}
      {isNewZone && draft.type === 'ARRONDISSEMENT' ? (
        <fieldset
          className="admin-zone-qg-fieldset"
          style={{
            marginTop: 12,
            marginBottom: 8,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid rgba(15, 23, 42, 0.12)',
            background: 'rgba(248, 250, 252, 0.9)',
          }}
        >
          <legend className="small" style={{ fontWeight: 700, padding: '0 6px' }}>
            Premier compte administrateur QG
          </legend>
          <p className="muted small" style={{ marginTop: 0, marginBottom: 12, lineHeight: 1.45 }}>
            Données du responsable local ; identiques au formulaire de l’onglet Comptes QG.
          </p>
          <label>
            Nom
            <input
              required
              value={draft.qgNom}
              onChange={(e) => setDraft({ ...draft, qgNom: e.target.value })}
            />
          </label>
          <label>
            Prénom
            <input
              required
              value={draft.qgPrenom}
              onChange={(e) => setDraft({ ...draft, qgPrenom: e.target.value })}
            />
          </label>
          <label>
            Courriel
            <OrgEmailLocalField required value={draft.qgEmailLocal} onChange={(v) => setDraft({ ...draft, qgEmailLocal: v })} />
          </label>
          <label>
            Mot de passe (8 caractères minimum)
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={draft.qgPassword}
              onChange={(e) => setDraft({ ...draft, qgPassword: e.target.value })}
            />
          </label>
          <label>
            Téléphone
            <input
              required
              value={draft.qgNumeroTelephone}
              onChange={(e) => setDraft({ ...draft, qgNumeroTelephone: e.target.value })}
              placeholder="+261 …"
            />
          </label>
          <label>
            Matricule (facultatif)
            <input
              value={draft.qgMatricule}
              onChange={(e) => setDraft({ ...draft, qgMatricule: e.target.value })}
            />
          </label>
        </fieldset>
      ) : null}
      <div className="muted small admin-zone-vertices">
        Sommets du polygone : {draft.vertices.length}
        {draft.vertices.length > 0 && mapPlacementActive ? (
          <>
            {' · '}
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => setDraft({ ...draft, vertices: draft.vertices.slice(0, -1) })}
            >
              Retirer le dernier point
            </button>
            {' · '}
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => setDraft({ ...draft, vertices: [] })}
            >
              Effacer la géométrie
            </button>
          </>
        ) : null}
      </div>
      <div className="row admin-form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="btn btn-primary">
          {draft.id
            ? 'Enregistrer les modifications'
            : draft.type === 'ARRONDISSEMENT'
              ? 'Créer la commune et le compte QG'
              : 'Enregistrer l’axe routier'}
        </button>
      </div>
      </form>
    </section>
  );
}

function ZoneList({
  zones,
  onDetail,
  onEdit,
  onDelete,
}: {
  zones: Zone[];
  onDetail: (z: Zone) => void;
  onEdit: (z: Zone) => void;
  onDelete: (z: Zone) => Promise<void> | void;
}) {
    const listZones = useMemo(() => zones.filter((z) => z.type !== 'DEPOT_REPARATION'), [zones]);
  const [filter, setFilter] = useState<'ALL' | SuperAdminZoneType>('ALL');
  const [query, setQuery] = useState('');
  const filtered = listZones.filter((z) => {
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
      <h3>Périmètres ({listZones.length})</h3>
      <label className="small muted">
        Filtrer
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom, code, téléphone…"
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
            {t === 'ALL' ? 'Tous les types' : ZONE_TYPE_LABEL[t as TypeZone]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="muted small">Aucun enregistrement ne correspond aux critères.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {filtered.map((z) => (
            <li key={z.id} className="admin-list-item">
              <div className="admin-list-item-main">
                <div className="admin-list-item-title">{z.nom}</div>
                <div className="muted small">
                  {z.code} · {ZONE_TYPE_LABEL[z.type as TypeZone] || z.type}
                  {z.numeroQg ? ` · ${z.numeroQg}` : ''}
                  {z.geometrie ? ' · géométrie renseignée' : ''}
                </div>
              </div>
              <div className="admin-list-item-actions">
                <button type="button" className="btn btn-ghost small" onClick={() => onDetail(z)}>
                  Détail
                </button>
                <button type="button" className="btn btn-ghost small" onClick={() => onEdit(z)}>
                  Modifier
                </button>
                <button
                  type="button"
                  className="btn btn-ghost small"
                  onClick={() => void onDelete(z)}
                >
                  Supprimer
                </button>
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
      <h3>Création d’un compte QG</h3>
      {zones.length === 0 ? (
        <p className="muted small">Créez d’abord un périmètre dans l’onglet précédent.</p>
      ) : (
        <>
          <label>
            Périmètre d’affectation
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} required>
              <option value="">— Sélectionner —</option>
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
            Courriel
            <OrgEmailLocalField required value={emailLocal} onChange={setEmailLocal} />
          </label>
          <label>
            Mot de passe (8 caractères minimum)
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
            Matricule (facultatif)
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
              Créer le compte
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
      <h3>Comptes QG ({admins.length})</h3>
      {admins.length === 0 ? (
        <p className="muted small">Aucun compte enregistré.</p>
      ) : (
        <ul className="admin-qg-list">
          {admins.map((a) => (
            <li key={a.id} className="admin-qg-item">
              <div className="admin-qg-item-title">
                {a.prenom} {a.nom} {a.actif ? '' : '· compte désactivé'}
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

  const [selectedRouteId, setSelectedRouteId] = useState<string>('');

  if (!apiKey) {
    return (
      <div className="map-missing">
        <div>
          <strong>Cartographie</strong>
          <p className="muted small">
            Définir la variable d’environnement <code>VITE_GOOGLE_MAPS_API_KEY</code> (fichier <code>.env.local</code>).
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
    () =>
      communeZones.filter((z) => regionFilter === 'ALL' || z.region === regionFilter),
    [communeZones, regionFilter],
  );
  const selectedZoneVertices = useMemo(
    () => filteredCommunes.find((z) => z.id === selectedZoneId)?.vertices ?? null,
    [filteredCommunes, selectedZoneId],
  );
  const routeZones = useMemo(
    () =>
      zones
        .filter((z) => z.type === 'ROUTE_NATIONALE')
        .slice()
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [zones],
  );
  const selectedRouteVertices = useMemo(() => {
    const z = zones.find((x) => x.id === selectedRouteId && x.type === 'ROUTE_NATIONALE');
    if (!z) return null;
    const v = geoJsonToVertices(z.geometrie);
    return v.length >= 3 ? v : null;
  }, [zones, selectedRouteId]);
  const focusReferenceVertices = selectedZoneVertices ?? selectedRouteVertices;
  const consultedZone = useMemo(() => {
    if (selectedZoneId) return zones.find((z) => z.id === selectedZoneId) ?? null;
    if (selectedRouteId) return zones.find((z) => z.id === selectedRouteId) ?? null;
    return null;
  }, [zones, selectedZoneId, selectedRouteId]);
  const consultedVerticesCount = useMemo(() => {
    if (!consultedZone) return 0;
    return geoJsonToVertices(consultedZone.geometrie).length;
  }, [consultedZone]);
  const consultedCommuneRegion = useMemo(() => {
    if (!consultedZone || consultedZone.type !== 'ARRONDISSEMENT') return null;
    const v = geoJsonToVertices(consultedZone.geometrie);
    if (v.length < 3) return null;
    return inferRegionFromVertices(v);
  }, [consultedZone]);

  useEffect(() => {
    if (!selectedZoneId) return;
    if (filteredCommunes.some((z) => z.id === selectedZoneId)) return;
    setSelectedZoneId('');
  }, [filteredCommunes, selectedZoneId]);
  useEffect(() => {
    if (!selectedZoneId) return;
    const selected = communeZones.find((z) => z.id === selectedZoneId);
    if (!selected) return;
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
    <div className="admin-polygon-picker-root">
      <div
        className={`admin-map-shell map-wrap admin-zone-picker${
          interactionEnabled && stage === 'delimit' ? ' draw-mode' : ''
        }`}
      >
        <div className="admin-map-toolbar" aria-label="Contrôles carte">
          <div className="admin-map-toolbar-cluster">
            <label className="admin-map-compact admin-map-compact--basemap">
              <span className="admin-map-compact-label">Fond</span>
              <select
                value={basemap}
                onChange={(e) => setBasemap(e.target.value as MapBasemapId)}
                title="Fond de carte"
                aria-label="Fond de carte"
              >
                <option value="plan">Plan</option>
                <option value="satellite">Satellite</option>
              </select>
            </label>
          </div>
          <div className="admin-map-toolbar-cluster admin-map-filters">
            <label className="admin-map-compact">
              <span className="admin-map-compact-label">Région</span>
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value as 'ALL' | RegionName)}
                title="Filtrer par région administrative"
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
            <label className="admin-map-compact">
              <span className="admin-map-compact-label">Commune</span>
              <select
                value={selectedZoneId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedZoneId(id);
                  if (id) setSelectedRouteId('');
                }}
                title="Commune de référence sur la carte"
              >
                <option value="">Commune…</option>
                {filteredCommunes.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nom} ({REGION_LABELS[z.region]})
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-map-compact">
              <span className="admin-map-compact-label">Route nat.</span>
              <select
                value={selectedRouteId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedRouteId(id);
                  if (id) setSelectedZoneId('');
                }}
                title="Axe routier national de référence"
              >
                <option value="">Axe…</option>
                {routeZones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nom} ({z.code})
                  </option>
                ))}
              </select>
            </label>
          </div>
          {interactionEnabled ? (
            <div className="admin-map-toolbar-cluster admin-map-toolbar-actions">
              {stage === 'pick' ? (
                <button type="button" className="btn btn-primary btn--map-toolbar" onClick={confirmLocation}>
                  Valider l’ancrage
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-primary btn--map-toolbar" disabled>
                    Délimitation active
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn--map-toolbar"
                    onClick={() => onChange(vertices.slice(0, -1))}
                    disabled={vertices.length === 0}
                  >
                    Annuler sommet
                  </button>
                  <button type="button" className="btn btn-ghost btn--map-toolbar" onClick={resetLocation}>
                    Repositionner centre
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>

        {consultedZone ? (
          <div className="admin-map-consulted-card" role="region" aria-label="Détail du périmètre consulté">
            <div className="admin-map-consulted-title">{consultedZone.nom}</div>
            <dl className="admin-map-consulted-dl">
              <dt className="muted small">Type</dt>
              <dd>{ZONE_TYPE_LABEL[consultedZone.type as TypeZone] || consultedZone.type}</dd>
              <dt className="muted small">Code</dt>
              <dd>{consultedZone.code}</dd>
              {consultedCommuneRegion ? (
                <>
                  <dt className="muted small">Région</dt>
                  <dd>{REGION_LABELS[consultedCommuneRegion]}</dd>
                </>
              ) : null}
              <dt className="muted small">Contact</dt>
              <dd>{consultedZone.numeroQg?.trim() || '—'}</dd>
              <dt className="muted small">Géom.</dt>
              <dd>
                {consultedVerticesCount >= 3
                  ? `Polygone · ${consultedVerticesCount} sommets`
                  : consultedVerticesCount > 0
                    ? `${consultedVerticesCount} pt(s) — incomplet`
                    : '—'}
              </dd>
            </dl>
          </div>
        ) : null}

        <div className="admin-map-canvas">
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
          <SelectedCommuneFocus vertices={focusReferenceVertices} />
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
              strokeColor={anam.teal}
              strokeOpacity={0.95}
              strokeWeight={3}
              fillColor={anam.mgGreen}
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
              title="Point d’ancrage validé"
              icon={centerIcon}
              label={{ text: 'C', color: 'white', fontSize: '12px', fontWeight: '700' }}
            />
          ) : interactionEnabled && pickedCenter ? (
            <Marker
              position={pickedCenter}
              title="Point d’ancrage provisoire"
              icon={centerIcon}
              label={{ text: 'C', color: 'white', fontSize: '12px', fontWeight: '700' }}
            />
          ) : null}
        </Map>
      </APIProvider>
      {interactionEnabled ? (
        <div className="admin-map-pick-overlay">
          {stage === 'pick' ? <div className="admin-map-pick-crosshair" aria-hidden /> : null}
          <div className="admin-map-stage-pill muted small" role="status">
            {stage === 'pick' ? (
              <>
                Centre sur la carte, puis valider.
                <br />
                <span className="admin-map-stage-pill-sub">
                  {pickedCenter ? 'Valider l’ancrage pour tracer le polygone.' : 'Indiquer le centre sur la carte.'}
                </span>
              </>
            ) : (
              <>
                Sommets dans l’ordre — fermeture auto du polygone.
                {vertices.length >= 3 ? (
                  <>
                    {' '}
                    · Région : <strong>{REGION_LABELS[draftRegion]}</strong>
                  </>
                ) : null}
                <br />
                <span className="admin-map-stage-pill-sub">
                  {vertices.length} sommet{vertices.length > 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        </div>
      ) : null}
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
