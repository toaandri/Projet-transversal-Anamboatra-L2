/**
 * CDC v2.3 — Console super-admin.
 *
 * Accès : compte SUPER_ADMIN connecté (JWT) — ou, en secours, un jeton
 * X-Admin-Token (legacy). La page détecte automatiquement le JWT et, sinon,
 * propose le formulaire jeton.
 *
 * Sections :
 *   - Zones : arrondissements / communes / routes nationales + DÉPÔTS de
 *     réparation (garages des équipes d'intervention), tous tracés sur la carte.
 *   - Admins QG : création des comptes ADMIN_QG rattachés à une commune.
 *   - Agents de réparation : création / suspension / reset device des
 *     EQUIPE_INTERVENTION rattachées à un dépôt, avec spécialité (ROUTE /
 *     JIRAMA / MACON / NETTOYEUR).
 *
 * Les AGENT_PATROUILLE sont enrôlés par chaque Admin QG depuis son dashboard.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { APIProvider, Map, Marker, type MapCameraChangedEvent } from '@vis.gl/react-google-maps';
import { api, getAdminToken, getToken, setAdminToken } from '../api';
import { useAuth } from '../useAuth';
import type {
  AdminQg,
  GeoJsonPolygon,
  RepairAgent,
  Specialite,
  TypeZone,
  Zone,
} from '../types';

const TANA = { lat: -18.8792, lng: 47.5079 };
const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

type AdminMode = 'jwt' | 'token';

type Tab = 'zones' | 'qg' | 'reparation';

const ZONE_TYPE_LABEL: Record<TypeZone, string> = {
  ARRONDISSEMENT: 'Arrondissement / Commune',
  ROUTE_NATIONALE: 'Route nationale',
  DEPOT_REPARATION: 'Dépôt de réparation',
};

const SPECIALITE_OPTIONS: { v: Specialite; l: string }[] = [
  { v: 'ROUTE', l: 'Route (voirie)' },
  { v: 'JIRAMA', l: 'JIRAMA (courant + eau)' },
  { v: 'MACON', l: 'Maçon (bâtiment)' },
  { v: 'NETTOYEUR', l: 'Nettoyeur (propreté)' },
];

type ZoneDraft = {
  id?: string;
  nom: string;
  type: TypeZone;
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

function toRad(v: number): number {
  return (v * Math.PI) / 180;
}

function toDeg(v: number): number {
  return (v * 180) / Math.PI;
}

function destinationPoint(
  center: { lat: number; lng: number },
  bearingDeg: number,
  distanceMeters: number,
): { lat: number; lng: number } {
  const R = 6371000;
  const brng = toRad(bearingDeg);
  const lat1 = toRad(center.lat);
  const lon1 = toRad(center.lng);
  const angDist = distanceMeters / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) +
      Math.cos(lat1) * Math.sin(angDist) * Math.cos(brng),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: toDeg(lat2), lng: toDeg(lon2) };
}

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function buildCircleVertices(
  center: { lat: number; lng: number },
  radiusMeters: number,
  points = 20,
): { lat: number; lng: number }[] {
  const safePoints = Math.max(8, points);
  const out: { lat: number; lng: number }[] = [];
  for (let i = 0; i < safePoints; i += 1) {
    out.push(destinationPoint(center, (i * 360) / safePoints, radiusMeters));
  }
  return out;
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

  const [zones, setZones] = useState<Zone[]>([]);
  const [admins, setAdmins] = useState<AdminQg[]>([]);
  const [repairs, setRepairs] = useState<RepairAgent[]>([]);
  const [draft, setDraft] = useState<ZoneDraft>(EMPTY_DRAFT);

  const adminOpts = useMemo(
    () => (mode === 'token' ? { adminToken: getAdminToken() } : {}),
    [mode],
  );

  const refresh = useCallback(
    async (opts: { adminToken?: string | null }) => {
      const [z, a, r] = await Promise.all([
        api.adminListZones(opts),
        api.adminListQgAdmins(opts),
        api.adminListRepairAgents(opts),
      ]);
      setZones(z.zones);
      setAdmins(a.admins);
      setRepairs(r.agents);
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
          <Link to="/" className="btn btn-ghost">
            Portail public
          </Link>
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            {mode === 'token' ? 'Verrouiller' : 'Déconnexion'}
          </button>
        </nav>
      </header>

      <div className="top-actions">
        <Link to="/" className="btn btn-ghost">
          Portail public
        </Link>
        <button type="button" className="btn btn-ghost" onClick={signOut}>
          {mode === 'token' ? 'Verrouiller' : 'Déconnexion'}
        </button>
      </div>

      <div className={`dash-grid${sideOpen ? '' : ' side-closed'}`}>
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

          {err ? <p className="alert error">{err}</p> : null}
          {msg ? <p className="alert success">{msg}</p> : null}

          <div className="chips" style={{ marginBottom: 10 }}>
            <button
              type="button"
              className={tab === 'zones' ? 'chip on' : 'chip'}
              onClick={() => setTab('zones')}
            >
              Zones & dépôts
            </button>
            <button
              type="button"
              className={tab === 'qg' ? 'chip on' : 'chip'}
              onClick={() => setTab('qg')}
            >
              Admins QG
            </button>
            <button
              type="button"
              className={tab === 'reparation' ? 'chip on' : 'chip'}
              onClick={() => setTab('reparation')}
            >
              Agents réparation
            </button>
          </div>

          {tab === 'zones' ? (
            <>
              <ZoneEditor
                draft={draft}
                setDraft={setDraft}
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
                  setDraft({
                    id: z.id,
                    nom: z.nom,
                    type: (z.type as TypeZone) || 'ARRONDISSEMENT',
                    code: z.code,
                    numeroQg: z.numeroQg || '',
                    vertices: geoJsonToVertices(z.geometrie),
                  });
                  setMsg(null);
                  setErr(null);
                }}
                onDelete={async (z) => {
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

          {tab === 'reparation' ? (
            <>
              <RepairAgentForm
                depots={zones.filter((z) => z.type === 'DEPOT_REPARATION')}
                onCreate={async (body) => {
                  try {
                    setErr(null);
                    await api.adminCreateRepairAgent(body, adminOpts);
                    setMsg(`Agent ${body.email} créé.`);
                    await runRefresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Erreur');
                  }
                }}
              />
              <RepairAgentList
                agents={repairs}
                zones={zones}
                onSuspend={async (a) => {
                  try {
                    setErr(null);
                    await api.adminSuspendRepairAgent(a.id, adminOpts);
                    setMsg(`${a.email} suspendu.`);
                    await runRefresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Erreur');
                  }
                }}
                onReactivate={async (a) => {
                  try {
                    setErr(null);
                    await api.adminReactivateRepairAgent(a.id, adminOpts);
                    setMsg(`${a.email} réactivé.`);
                    await runRefresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Erreur');
                  }
                }}
                onDelete={async (a) => {
                  if (!confirm(`Supprimer ${a.email} ?`)) return;
                  try {
                    setErr(null);
                    await api.adminDeleteRepairAgent(a.id, adminOpts);
                    setMsg(`${a.email} supprimé.`);
                    await runRefresh();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : 'Erreur');
                  }
                }}
              />
            </>
          ) : null}
        </aside>

        <section className="panel map-panel">
          <PolygonPicker
            vertices={draft.vertices}
            onChange={(vertices) => setDraft({ ...draft, vertices })}
          />
        </section>
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
  onSave,
  onCancel,
}: {
  draft: ZoneDraft;
  setDraft: (d: ZoneDraft) => void;
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
      <label>
        Nom (commune / axe / nom du dépôt)
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
          onChange={(e) => setDraft({ ...draft, type: e.target.value as TypeZone })}
        >
          {(['ARRONDISSEMENT', 'ROUTE_NATIONALE', 'DEPOT_REPARATION'] as TypeZone[]).map((t) => (
            <option key={t} value={t}>
              {ZONE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Code (unique, ex. TNR-ARR-07, DEPOT-JIRAMA-01)
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
      <div className="muted small">
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
      <div className="row">
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
  const [filter, setFilter] = useState<'ALL' | TypeZone>('ALL');
  const filtered = zones.filter((z) => filter === 'ALL' || z.type === filter);
  return (
    <section className="kanban">
      <h3>Zones existantes ({zones.length})</h3>
      <div className="chips" style={{ marginBottom: 6 }}>
        {(['ALL', 'ARRONDISSEMENT', 'ROUTE_NATIONALE', 'DEPOT_REPARATION'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={filter === t ? 'chip on' : 'chip'}
            onClick={() => setFilter(t)}
          >
            {t === 'ALL' ? 'Toutes' : ZONE_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="muted small">Aucune zone à afficher.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {filtered.map((z) => (
            <li
              key={z.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid #eee',
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{z.nom}</div>
                <div className="muted small">
                  {z.code} · {ZONE_TYPE_LABEL[z.type as TypeZone] || z.type}
                  {z.numeroQg ? ` · ${z.numeroQg}` : ''}
                  {z.geometrie ? ' · tracée' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
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
    <section className="form">
      <h3>Créer un Admin QG</h3>
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
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {admins.map((a) => (
            <li key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}>
              <div style={{ fontWeight: 600 }}>
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

function RepairAgentForm({
  depots,
  onCreate,
}: {
  depots: Zone[];
  onCreate: (body: {
    zoneId: string;
    nom: string;
    prenom: string;
    email: string;
    password: string;
    numeroTelephone: string;
    matricule?: string | null;
    specialite: Specialite;
  }) => Promise<void> | void;
}) {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [zoneId, setZoneId] = useState<string>('');
  const [numeroTelephone, setNumeroTelephone] = useState('');
  const [matricule, setMatricule] = useState('');
  const [specialite, setSpecialite] = useState<Specialite>('ROUTE');

  return (
    <section className="form">
      <h3>Créer un agent de réparation</h3>
      {depots.length === 0 ? (
        <p className="muted small">
          Créez d'abord un <strong>dépôt de réparation</strong> (onglet Zones & dépôts)
          avant d'y rattacher un agent.
        </p>
      ) : (
        <>
          <label>
            Dépôt de rattachement
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} required>
              <option value="">— choisir —</option>
              {depots.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nom} ({z.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            Spécialité
            <select value={specialite} onChange={(e) => setSpecialite(e.target.value as Specialite)}>
              {SPECIALITE_OPTIONS.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.l}
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
                specialite,
              });
              setNom('');
              setPrenom('');
              setEmail('');
              setPassword('');
              setZoneId('');
              setNumeroTelephone('');
              setMatricule('');
              setSpecialite('ROUTE');
            }}
          >
            Créer l'agent
          </button>
        </>
      )}
    </section>
  );
}

function RepairAgentList({
  agents,
  zones,
  onSuspend,
  onReactivate,
  onDelete,
}: {
  agents: RepairAgent[];
  zones: Zone[];
  onSuspend: (a: RepairAgent) => void;
  onReactivate: (a: RepairAgent) => void;
  onDelete: (a: RepairAgent) => void;
}) {
  const zoneById = useMemo(() => Object.fromEntries(zones.map((z) => [z.id, z])), [zones]);
  const [filter, setFilter] = useState<'ALL' | Specialite>('ALL');
  const list = agents.filter((a) => filter === 'ALL' || a.specialite === filter);
  return (
    <section className="kanban">
      <h3>Agents de réparation ({agents.length})</h3>
      <div className="chips" style={{ marginBottom: 6 }}>
        <button
          type="button"
          className={filter === 'ALL' ? 'chip on' : 'chip'}
          onClick={() => setFilter('ALL')}
        >
          Tous
        </button>
        {SPECIALITE_OPTIONS.map((s) => (
          <button
            key={s.v}
            type="button"
            className={filter === s.v ? 'chip on' : 'chip'}
            onClick={() => setFilter(s.v)}
          >
            {s.l}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="muted small">Aucun agent pour ce filtre.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {list.map((a) => (
            <li key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
              <div style={{ fontWeight: 600 }}>
                {a.prenom} {a.nom} {a.actif ? '' : '· SUSPENDU'}
              </div>
              <div className="muted small">
                {a.email} · {a.specialite}
                {' · '}
                {a.zoneId ? zoneById[a.zoneId]?.nom || a.zoneId : '—'}
                {a.numeroTelephone ? ` · ${a.numeroTelephone}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {a.actif ? (
                  <button type="button" className="btn btn-ghost small" onClick={() => onSuspend(a)}>
                    Suspendre
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary small"
                    onClick={() => onReactivate(a)}
                  >
                    Réactiver
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost small"
                  onClick={() => onDelete(a)}
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

function PolygonPicker({
  vertices,
  onChange,
}: {
  vertices: { lat: number; lng: number }[];
  onChange: (v: { lat: number; lng: number }[]) => void;
}) {
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'terrain' | 'satellite' | 'hybrid'>('terrain');
  const [center, setCenter] = useState<{ lat: number; lng: number }>(TANA);
  const [confirmedCenter, setConfirmedCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [baseRadiusM, setBaseRadiusM] = useState<number>(1200);

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

  function addVertexAtCenter() {
    onChange([...vertices, { lat: center.lat, lng: center.lng }]);
  }

  const stage = confirmedCenter ? 'delimit' : 'pick';

  function confirmLocation() {
    const c = { lat: center.lat, lng: center.lng };
    setConfirmedCenter(c);
    // Base par défaut = cercle. L'admin peut ensuite affiner les limites.
    onChange(buildCircleVertices(c, baseRadiusM, 20));
  }

  function resetLocation() {
    setConfirmedCenter(null);
    onChange([]);
  }

  function regenerateCircle() {
    if (!confirmedCenter) return;
    onChange(buildCircleVertices(confirmedCenter, baseRadiusM, 20));
  }

  const adaptiveRadiusM = useMemo(() => {
    if (!confirmedCenter || vertices.length === 0) return baseRadiusM;
    const maxD = Math.max(...vertices.map((v) => distanceMeters(confirmedCenter, v)));
    return Math.max(baseRadiusM, Math.round(maxD));
  }, [confirmedCenter, vertices, baseRadiusM]);

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
        {stage === 'pick' ? (
          <button type="button" className="btn btn-primary" onClick={confirmLocation}>
            Confirmer cet emplacement
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={addVertexAtCenter}>
              Ajouter sommet au centre
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
          Étape 1/2: déplacez la carte pour mettre le centre sur la commune, puis confirmez l'emplacement.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <p className="muted small" style={{ margin: 0 }}>
            Étape 2/2: délimitez la zone (Sud/Est/Ouest...) en déplaçant la carte puis
            « Ajouter sommet au centre ».
          </p>
          <div className="row">
            <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Cercle de base (m)
              <input
                type="range"
                min={300}
                max={8000}
                step={100}
                value={baseRadiusM}
                onChange={(e) => setBaseRadiusM(Number(e.target.value))}
              />
              <span>{baseRadiusM} m</span>
            </label>
            <button type="button" className="btn btn-ghost" onClick={regenerateCircle}>
              Réappliquer cercle
            </button>
          </div>
        </div>
      )}
      <div
        className="map-wrap"
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
          mapTypeId={mapTypeId}
          gestureHandling="greedy"
          onCameraChanged={(ev: MapCameraChangedEvent) => setCenter(ev.detail.center)}
          style={{ width: '100%', height: '100%' }}
        >
          {vertices.map((v, i) => (
            <Marker
              key={`${i}-${v.lat}-${v.lng}`}
              position={v}
              label={{ text: String(i + 1), color: 'white', fontSize: '12px', fontWeight: '600' }}
            />
          ))}
          {confirmedCenter ? (
            <Marker
              position={confirmedCenter}
              title="Centre commune confirmé"
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
              width: Math.max(140, Math.min(320, adaptiveRadiusM / 8)),
              height: Math.max(140, Math.min(320, adaptiveRadiusM / 8)),
              borderRadius: '50%',
              border: '2px solid rgba(26, 115, 232, 0.7)',
              background: 'rgba(26, 115, 232, 0.12)',
              boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.18) inset',
            }}
          />
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
              ? "Placez le centre puis confirmez l'emplacement"
              : `Délimitation en cours • rayon guide ≈ ${adaptiveRadiusM} m`}
          </div>
        </div>
      </div>
    </div>
  );
}
