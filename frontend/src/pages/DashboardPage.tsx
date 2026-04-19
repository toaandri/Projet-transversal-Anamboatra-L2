import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../useAuth';
import { EffectifsPanel } from '../components/EffectifsPanel';
import { MapView } from '../components/MapView';
import { STATUT_LABELS, ROLE_LABELS } from '../mapColors';
import type { EquipeUser, GeoJsonFeature, Role, Statut, Ticket, TypeInfrastructure, Urgence, Zone } from '../types';
import { useMapSocket } from '../useMapSocket';

const STATUTS_ORDER: Statut[] = [
  'EN_ATTENTE_CONFIRMATION',
  'REPARATION_PREVUE',
  'EN_REPARATION',
  'TERMINE',
  'CLOTURE',
];

const TYPES: { v: TypeInfrastructure; l: string; color: string }[] = [
  { v: 'ROUTE', l: 'Route', color: '#64748b' },
  { v: 'ELECTRICITE', l: 'Électricité', color: '#f59e0b' },
  { v: 'EAU', l: 'Eau', color: '#0ea5e9' },
];

const STATUT_COLORS: Record<Statut, string> = {
  EN_ATTENTE_CONFIRMATION: '#dc2626',
  REPARATION_PREVUE: '#f97316',
  EN_REPARATION: '#3b82f6',
  TERMINE: '#22c55e',
  CLOTURE: '#16a34a',
};

const URGENCE_COLORS: Record<Urgence, string> = {
  NORMAL: '#94a3b8',
  URGENT: '#dc2626',
};

function filterGeo(features: GeoJsonFeature[], f: Filters): GeoJsonFeature[] {
  return features.filter((x) => {
    const p = x.properties as { kind?: string; statut?: Statut; urgence?: Urgence; typeInfrastructure?: TypeInfrastructure; typeSuggere?: TypeInfrastructure };
    if (p.kind === 'suggestion') {
      if (f.types.length && !f.types.includes(p.typeSuggere as TypeInfrastructure)) return false;
      return true;
    }
    if (f.statuts.length && p.statut && !f.statuts.includes(p.statut)) return false;
    if (f.urgences.length && p.urgence && !f.urgences.includes(p.urgence)) return false;
    if (f.types.length && p.typeInfrastructure && !f.types.includes(p.typeInfrastructure)) return false;
    return true;
  });
}

type Filters = { statuts: Statut[]; urgences: Urgence[]; types: TypeInfrastructure[] };

export function DashboardPage() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const role = user?.role ?? null;

  // CDC v2.3 — le super-admin n'a pas de vue opérationnelle, il est routé
  // directement vers la console d'amorçage.
  if (role === 'SUPER_ADMIN') {
    return <Navigate to="/admin-setup" replace />;
  }

  // CDC v2.3 — les agents terrain (patrouille) et les équipes d'intervention
  // travaillent exclusivement depuis l'application mobile. Le web ne leur
  // expose qu'un écran d'information.
  if (role === 'AGENT_PATROUILLE' || role === 'EQUIPE_INTERVENTION') {
    return (
      <MobileOnlyScreen
        role={role}
        userName={user ? `${user.prenom} ${user.nom}` : ''}
        onLogout={() => {
          logout();
          nav('/', { replace: true });
        }}
      />
    );
  }

  const [features, setFeatures] = useState<GeoJsonFeature[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [equipes, setEquipes] = useState<EquipeUser[]>([]);
  const [myZone, setMyZone] = useState<Zone | null>(null);
  const [pickReport, setPickReport] = useState(false);
  const [reportLat, setReportLat] = useState<number | null>(null);
  const [reportLng, setReportLng] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [closureFile, setClosureFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ statuts: [], urgences: [], types: [] });
  const [sideOpen, setSideOpen] = useState(true);
  const detailRef = useRef<HTMLElement>(null);
  const sideRef   = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      if (user.role === 'CITOYEN') {
        const pub = await api.publicMapTiles();
        setFeatures(pub.geojson.features as GeoJsonFeature[]);
        setTickets([]);
      } else {
        const [tiles, tlist] = await Promise.all([api.mapTiles(), api.tickets()]);
        setFeatures(tiles.geojson.features as GeoJsonFeature[]);
        setTickets(tlist.tickets);
        if (user.role === 'ADMIN_QG') {
          const { equipes: eq } = await api.equipes();
          setEquipes(eq);
        }
      }
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Chargement impossible');
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user || user.role === 'CITOYEN' || !user.zoneId) {
      setMyZone(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { zone } = await api.myZone();
        if (!cancelled) setMyZone(zone);
      } catch {
        if (!cancelled) setMyZone(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useMapSocket(load);

  const filteredFeatures = useMemo(() => filterGeo(features, filters), [features, filters]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filters.statuts.length && !filters.statuts.includes(t.statut)) return false;
      if (filters.urgences.length && !filters.urgences.includes(t.urgence)) return false;
      if (filters.types.length && !filters.types.includes(t.typeInfrastructure)) return false;
      return true;
    });
  }, [tickets, filters]);

  // Stats calculées sur TOUS les tickets (pas filtrés) pour le strip d'en-tête
  const stats = useMemo(() => ({
    total:   tickets.length,
    urgent:  tickets.filter((t) => t.urgence === 'URGENT').length,
    enCours: tickets.filter((t) => t.statut === 'EN_REPARATION').length,
    termine: tickets.filter((t) => t.statut === 'TERMINE' || t.statut === 'CLOTURE').length,
    attente: tickets.filter((t) => t.statut === 'EN_ATTENTE_CONFIRMATION').length,
  }), [tickets]);

  async function onFeatureSelect(f: GeoJsonFeature) {
    const p = f.properties as { id?: string; kind?: string };
    if (p.kind !== 'ticket' || !p.id) return;
    try {
      const { ticket } = await api.ticket(p.id);
      setSelected(ticket);
      const ids = ticket.mission?.assignedUserIds;
      setAssignIds(Array.isArray(ids) ? [...ids] : []);
    } catch {
      setSelected(null);
    }
  }

  // Quand un ticket est sélectionné : ouvrir le panneau + scroller vers le détail
  useEffect(() => {
    if (!selected) return;
    setSideOpen(true);
    // Petit délai pour laisser le panneau s'animer avant de scroller
    const t = setTimeout(() => {
      const detail = detailRef.current;
      const side   = sideRef.current;
      if (!detail || !side) return;
      const offsetTop = detail.offsetTop - side.offsetTop;
      side.scrollTo({ top: offsetTop - 12, behavior: 'smooth' });
    }, 120);
    return () => clearTimeout(t);
  }, [selected]);

  function toggleFilter<K extends keyof Filters>(key: K, value: Filters[K][number]) {
    setFilters((prev) => {
      const arr = prev[key] as unknown[];
      const has = arr.includes(value);
      const next = has ? arr.filter((x) => x !== value) : [...arr, value];
      return { ...prev, [key]: next };
    });
  }

  const isTerrain = role === 'ADMIN_QG' || role === 'AGENT_PATROUILLE' || role === 'EQUIPE_INTERVENTION';

  return (
    <div className="page dashboard">
      <header className="topbar">
        <div className="brand">
          <span className="logo" />
          <div>
            <strong>Espace connecté</strong>
            <div className="muted small">
              {user?.prenom} {user?.nom} · {role ? ROLE_LABELS[role] : ''}
            </div>
          </div>
        </div>
        <nav className="nav">
          <Link to="/" className="btn btn-ghost">
            Portail public
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              logout();
              nav('/', { replace: true });
            }}
          >
            Déconnexion
          </button>
        </nav>
      </header>

      <div className="top-actions">
        <Link to="/" className="btn btn-ghost">
          Portail public
        </Link>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            logout();
            nav('/', { replace: true });
          }}
        >
          Déconnexion
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
        <section className="panel map-panel">
          {!isTerrain && user?.role === 'CITOYEN' ? (
            <p className="muted">Vue citoyenne : mêmes couches que le portail public (tickets confirmés).</p>
          ) : null}
          <MapView
            geojson={filteredFeatures}
            viewerRole={role}
            onSelectFeature={onFeatureSelect}
            pickMode={pickReport}
            onPickLatLng={(la, ln) => {
              setReportLat(la);
              setReportLng(ln);
            }}
            height="100%"
            myZone={myZone}
          />
          {/* Overlay flottant de stats sur la carte */}
          {role === 'ADMIN_QG' && tickets.length > 0 ? (
            <div className="map-stats-overlay">
              <div className="map-stats-row">
                <span className="map-stat-dot" style={{ background: '#dc2626' }} />
                <span>{stats.attente} en attente</span>
              </div>
              <div className="map-stats-row">
                <span className="map-stat-dot" style={{ background: '#3b82f6' }} />
                <span>{stats.enCours} en cours</span>
              </div>
              <div className="map-stats-row">
                <span className="map-stat-dot" style={{ background: '#22c55e' }} />
                <span>{stats.termine} terminés</span>
              </div>
            </div>
          ) : null}
        </section>
        <aside className="panel side" ref={sideRef}>
          <div className="side-header">
            <span className="qg-mark" aria-hidden="true">
              <span className="qg-mark-flag" />
              <span className="qg-mark-pin" />
            </span>
            <div className="qg-header-text">
              <small>République de Madagascar</small>
              <strong>Quartier général · Anamboatra</strong>
              <div className="muted">
                {user?.prenom} {user?.nom} · {role ? ROLE_LABELS[role] : ''}
              </div>
            </div>
          </div>

          {err ? <p className="alert error">{err}</p> : null}
          {msg ? <p className="alert success">{msg}</p> : null}

          {/* ---- Stats strip (ADMIN_QG uniquement) ---- */}
          {role === 'ADMIN_QG' && tickets.length > 0 ? (
            <div className="qg-stats-strip">
              <div className="qg-stat">
                <span className="qg-stat-value">{stats.total}</span>
                <span className="qg-stat-label">Tickets</span>
              </div>
              <div className="qg-stat qg-stat--red">
                <span className="qg-stat-value">{stats.urgent}</span>
                <span className="qg-stat-label">Urgents</span>
              </div>
              <div className="qg-stat qg-stat--blue">
                <span className="qg-stat-value">{stats.enCours}</span>
                <span className="qg-stat-label">En cours</span>
              </div>
              <div className="qg-stat qg-stat--green">
                <span className="qg-stat-value">{stats.termine}</span>
                <span className="qg-stat-label">Terminés</span>
              </div>
            </div>
          ) : null}

          {(() => {
            const total = filters.statuts.length + filters.urgences.length + filters.types.length;
            return (
              <section className="qg-section">
                <header className="qg-section-head">
                  <span className="qg-section-eyebrow">Vue carte</span>
                  <div className="qg-section-titlerow">
                    <h3>Filtres</h3>
                    {total > 0 ? (
                      <button
                        type="button"
                        className="qg-section-link"
                        onClick={() => setFilters({ statuts: [], urgences: [], types: [] })}
                      >
                        Réinitialiser ({total})
                      </button>
                    ) : (
                      <span className="qg-section-meta">Tout affiché</span>
                    )}
                  </div>
                </header>

                <div className="qg-filter">
                  <div className="qg-filter-label">Statut</div>
                  <div className="chips">
                    {STATUTS_ORDER.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={filters.statuts.includes(s) ? 'chip dot on' : 'chip dot'}
                        style={{ ['--chip-color' as string]: STATUT_COLORS[s] }}
                        onClick={() => toggleFilter('statuts', s)}
                      >
                        <span className="chip-dot" />
                        {STATUT_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="qg-filter">
                  <div className="qg-filter-label">Urgence</div>
                  <div className="chips">
                    {(['NORMAL', 'URGENT'] as Urgence[]).map((u) => (
                      <button
                        key={u}
                        type="button"
                        className={filters.urgences.includes(u) ? 'chip dot on' : 'chip dot'}
                        style={{ ['--chip-color' as string]: URGENCE_COLORS[u] }}
                        onClick={() => toggleFilter('urgences', u)}
                      >
                        <span className="chip-dot" />
                        {u === 'URGENT' ? 'Urgent' : 'Normal'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="qg-filter">
                  <div className="qg-filter-label">Type d'infrastructure</div>
                  <div className="chips">
                    {TYPES.map((t) => (
                      <button
                        key={t.v}
                        type="button"
                        className={filters.types.includes(t.v) ? 'chip dot on' : 'chip dot'}
                        style={{ ['--chip-color' as string]: t.color }}
                        onClick={() => toggleFilter('types', t.v)}
                      >
                        <span className="chip-dot" />
                        {t.l}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            );
          })()}

          {role === 'AGENT_PATROUILLE' || role === 'EQUIPE_INTERVENTION' ? (
            <section className="qg-section">
              <header className="qg-section-head">
                <span className="qg-section-eyebrow">Terrain</span>
                <div className="qg-section-titlerow">
                  <h3>Actions rapides</h3>
                </div>
              </header>
              <div className="qg-actions">
                {role === 'AGENT_PATROUILLE' ? (
                  <button
                    type="button"
                    className="btn btn-primary block"
                    onClick={() => {
                      setReportOpen(true);
                      setPickReport(false);
                      setReportLat(null);
                      setReportLng(null);
                    }}
                  >
                    Signaler une anomalie
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost block"
                  onClick={() => {
                    if (!navigator.geolocation) return;
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        void api
                          .updatePosition(pos.coords.latitude, pos.coords.longitude)
                          .then(() => {
                            setMsg('Position transmise au QG.');
                          });
                      },
                      () => setErr('Géolocalisation refusée'),
                    );
                  }}
                >
                  Envoyer ma position (GPS)
                </button>
              </div>
            </section>
          ) : null}

          {role === 'ADMIN_QG' ? (
            <section className="qg-section qg-section--effectifs">
              <header className="qg-section-head">
                <span className="qg-section-eyebrow">Ressources humaines</span>
                <div className="qg-section-titlerow">
                  <h3>Effectifs</h3>
                </div>
              </header>
              <EffectifsPanel />
            </section>
          ) : null}

          {role === 'ADMIN_QG' ? (
            <section className="qg-section qg-section--kanban">
              <header className="qg-section-head">
                <span className="qg-section-eyebrow">Pilotage</span>
                <div className="qg-section-titlerow">
                  <h3>Kanban — votre zone</h3>
                  <span className="qg-section-meta">{filteredTickets.length} ticket{filteredTickets.length > 1 ? 's' : ''}</span>
                </div>
              </header>
              <div className="kanban-cols">
                {STATUTS_ORDER.map((st) => {
                  const items = filteredTickets.filter((t) => t.statut === st);
                  return (
                    <div key={st} className="kanban-col">
                      <div
                        className="kanban-title"
                        style={{ ['--col-color' as string]: STATUT_COLORS[st] }}
                      >
                        <span className="kanban-dot" />
                        <span>{STATUT_LABELS[st]}</span>
                        <span className="kanban-count">{items.length}</span>
                      </div>
                      {items.length === 0 ? (
                        <div className="kanban-empty">Aucun</div>
                      ) : (
                        items.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="ticket-card"
                            style={{ ['--ticket-color' as string]: STATUT_COLORS[t.statut] }}
                            onClick={() => {
                              void (async () => {
                                try {
                                  const { ticket } = await api.ticket(t.id);
                                  setSelected(ticket);
                                  const ids = ticket.mission?.assignedUserIds;
                                  setAssignIds(Array.isArray(ids) ? [...ids] : []);
                                } catch {
                                  setSelected(null);
                                }
                              })();
                            }}
                          >
                            <span className="ticket-card-row">
                              <span
                                className="badge"
                                style={{ ['--chip-color' as string]: TYPES.find((x) => x.v === t.typeInfrastructure)?.color || '#64748b' }}
                              >
                                {t.typeInfrastructure}
                              </span>
                              {t.urgence === 'URGENT' ? (
                                <span className="badge badge-urgent">URGENT</span>
                              ) : null}
                            </span>
                            <div className="small clamp">{t.description}</div>
                          </button>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="qg-section qg-section--detail" ref={detailRef}>
            <header className="qg-section-head">
              <span className="qg-section-eyebrow">Détail</span>
              <div className="qg-section-titlerow">
                <h3>Ticket sélectionné</h3>
                {selected ? (
                  <button
                    type="button"
                    className="qg-section-link"
                    onClick={() => setSelected(null)}
                  >
                    Fermer
                  </button>
                ) : null}
              </div>
            </header>
            {selected ? (
              <DetailPanel
                ticket={selected}
                role={role}
                equipes={equipes}
                assignIds={assignIds}
                setAssignIds={setAssignIds}
                closureFile={closureFile}
                setClosureFile={setClosureFile}
                userId={user?.id}
                onUpdated={async () => {
                  setMsg('Ticket mis à jour.');
                  await load();
                  const { ticket } = await api.ticket(selected.id);
                  setSelected(ticket);
                }}
                onError={setErr}
                onClearMsg={() => setMsg(null)}
              />
            ) : (
              <div className="qg-empty">
                <svg className="qg-empty-icon" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <circle cx="20" cy="20" r="19" stroke="rgba(0,126,58,0.18)" strokeWidth="1.5" fill="rgba(0,126,58,0.04)"/>
                  <path d="M20 11c-3.866 0-7 3.134-7 7 0 4.5 7 11 7 11s7-6.5 7-11c0-3.866-3.134-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" fill="rgba(0,126,58,0.35)"/>
                </svg>
                <p className="muted small">Cliquez sur un marqueur de la carte ou une carte Kanban pour afficher le détail.</p>
              </div>
            )}
          </section>
        </aside>
      </div>

      {reportOpen && role === 'AGENT_PATROUILLE' ? (
        <ReportModal
          onClose={() => {
            setReportOpen(false);
            setPickReport(false);
          }}
          pickReport={pickReport}
          setPickReport={setPickReport}
          lat={reportLat}
          lng={reportLng}
          onSuccess={async () => {
            setReportOpen(false);
            setPickReport(false);
            setMsg('Signalement créé.');
            await load();
          }}
          onError={setErr}
        />
      ) : null}
    </div>
  );
}

function DetailPanel({
  ticket,
  role,
  equipes,
  assignIds,
  setAssignIds,
  closureFile,
  setClosureFile,
  userId,
  onUpdated,
  onError,
  onClearMsg,
}: {
  ticket: Ticket;
  role: Role | null;
  equipes: EquipeUser[];
  assignIds: string[];
  setAssignIds: (ids: string[]) => void;
  closureFile: File | null;
  setClosureFile: (f: File | null) => void;
  userId?: string;
  onUpdated: () => Promise<void>;
  onError: (s: string | null) => void;
  onClearMsg: () => void;
}) {
  const assigned = ticket.mission?.assignedUserIds?.includes(userId || '') ?? false;

  async function adminConfirm() {
    onClearMsg();
    onError(null);
    try {
      await api.patchTicket(ticket.id, { statut: 'REPARATION_PREVUE', equipeUserIds: assignIds });
      await onUpdated();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erreur');
    }
  }

  async function adminCloture() {
    onClearMsg();
    onError(null);
    try {
      await api.patchTicket(ticket.id, { statut: 'CLOTURE' });
      await onUpdated();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erreur');
    }
  }

  async function equipeStart() {
    onClearMsg();
    onError(null);
    try {
      await api.patchTicket(ticket.id, { statut: 'EN_REPARATION' });
      await onUpdated();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erreur');
    }
  }

  async function equipeFinish() {
    onClearMsg();
    onError(null);
    if (!closureFile) {
      onError('Photo de clôture requise.');
      return;
    }
    try {
      const url = await api.closurePhoto(ticket.id, closureFile);
      await api.patchTicket(ticket.id, { statut: 'TERMINE', photoCloture: url });
      setClosureFile(null);
      await onUpdated();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Erreur');
    }
  }

  return (
    <div className="detail">
      <h3>Détail ticket</h3>
      <div className="muted small">{STATUT_LABELS[ticket.statut]}</div>
      {ticket.photoSignalement ? (
        <a href={ticket.photoSignalement} target="_blank" rel="noreferrer" className="thumb-link">
          <img src={ticket.photoSignalement} alt="" className="thumb" />
        </a>
      ) : null}
      <p className="small">{ticket.description}</p>

      {role === 'ADMIN_QG' && ticket.statut === 'EN_ATTENTE_CONFIRMATION' ? (
        <div className="form">
          <div className="muted small">Équipes à affecter</div>
          {equipes.map((e) => (
            <label key={e.id} className="check-row">
              <input
                type="checkbox"
                checked={assignIds.includes(e.id)}
                onChange={() =>
                  setAssignIds(assignIds.includes(e.id) ? assignIds.filter((x) => x !== e.id) : [...assignIds, e.id])
                }
              />
              {e.prenom} {e.nom}
            </label>
          ))}
          <button type="button" className="btn btn-primary" onClick={() => void adminConfirm()}>
            Confirmer — réparation prévue
          </button>
        </div>
      ) : null}

      {role === 'ADMIN_QG' && ticket.statut === 'TERMINE' ? (
        <button type="button" className="btn btn-primary" onClick={() => void adminCloture()}>
          Clôturer définitivement
        </button>
      ) : null}

      {role === 'EQUIPE_INTERVENTION' && assigned && ticket.statut === 'REPARATION_PREVUE' ? (
        <button type="button" className="btn btn-primary" onClick={() => void equipeStart()}>
          Démarrer la réparation
        </button>
      ) : null}

      {role === 'EQUIPE_INTERVENTION' && assigned && ticket.statut === 'EN_REPARATION' ? (
        <div className="form">
          <label>
            Photo de clôture
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setClosureFile(e.target.files?.[0] || null)} />
          </label>
          <button type="button" className="btn btn-primary" onClick={() => void equipeFinish()}>
            Terminer (avec photo)
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ReportModal({
  onClose,
  pickReport,
  setPickReport,
  lat,
  lng,
  onSuccess,
  onError,
}: {
  onClose: () => void;
  pickReport: boolean;
  setPickReport: (v: boolean) => void;
  lat: number | null;
  lng: number | null;
  onSuccess: () => Promise<void>;
  onError: (s: string | null) => void;
}) {
  const [description, setDescription] = useState('');
  const [urgence, setUrgence] = useState<Urgence>('NORMAL');
  const [typeInfrastructure, setTypeInfrastructure] = useState<TypeInfrastructure>('ROUTE');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lat === null || lng === null || !file) {
      onError('Point GPS et photo requis.');
      return;
    }
    setLoading(true);
    onError(null);
    try {
      const fd = new FormData();
      fd.append('description', description);
      fd.append('urgence', urgence);
      fd.append('typeInfrastructure', typeInfrastructure);
      fd.append('latitude', String(lat));
      fd.append('longitude', String(lng));
      fd.append('photo', file);
      await api.createTicket(fd);
      await onSuccess();
    } catch (ex) {
      onError(ex instanceof Error ? ex.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal" role="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Nouveau signalement</h2>
        <p className="muted small">Activez le placement sur la carte principale, puis cliquez la carte.</p>
        <button type="button" className={pickReport ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setPickReport(!pickReport)}>
          {pickReport ? 'Placement actif' : 'Placer sur la carte'}
        </button>
        <p className="muted small">
          {lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Aucune position'}
        </p>
        <form onSubmit={submit} className="form">
          <label>
            Description
            <textarea required minLength={3} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </label>
          <label>
            Urgence
            <select value={urgence} onChange={(e) => setUrgence(e.target.value as Urgence)}>
              <option value="NORMAL">NORMAL</option>
              <option value="URGENT">URGENT</option>
            </select>
          </label>
          <label>
            Type
            <select value={typeInfrastructure} onChange={(e) => setTypeInfrastructure(e.target.value as TypeInfrastructure)}>
              {TYPES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Photo (JPEG / PNG / WebP)
            <input type="file" accept="image/jpeg,image/png,image/webp" required onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Envoi…' : 'Créer le ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MobileOnlyScreen({
  role,
  userName,
  onLogout,
}: {
  role: 'AGENT_PATROUILLE' | 'EQUIPE_INTERVENTION';
  userName: string;
  onLogout: () => void;
}) {
  const label = role === 'AGENT_PATROUILLE' ? 'Agent de patrouille' : "Équipe d'intervention";
  return (
    <div className="page mobile-only">
      <header className="topbar">
        <div className="brand">
          <span className="logo" />
          <div>
            <strong>Anamboatra</strong>
            <div className="muted small">{userName ? `${userName} · ${label}` : label}</div>
          </div>
        </div>
        <nav className="nav">
          <Link to="/" className="btn btn-ghost">
            Portail public
          </Link>
          <button type="button" className="btn btn-ghost" onClick={onLogout}>
            Déconnexion
          </button>
        </nav>
      </header>

      <main className="mobile-only-main">
        <div className="panel mobile-only-card">
          <div className="mobile-only-icon" aria-hidden="true">
            <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:56,height:56}}>
              <rect x="14" y="4" width="28" height="48" rx="5" stroke="#007e3a" strokeWidth="2.2" fill="rgba(0,126,58,0.06)"/>
              <rect x="22" y="8" width="12" height="2" rx="1" fill="#007e3a" opacity="0.4"/>
              <circle cx="28" cy="44" r="2.5" fill="#007e3a" opacity="0.5"/>
              <path d="M24 22l4 4 8-8" stroke="#007e3a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1>Espace réservé à l'application mobile</h1>
          <p className="muted">
            Le rôle <strong>{label}</strong> travaille exclusivement depuis l'application mobile{' '}
            <strong>Anamboatra Terrain</strong> :
          </p>
          <ul className="mobile-only-list">
            {role === 'AGENT_PATROUILLE' ? (
              <>
                <li>signalement d'anomalies géolocalisées avec photo,</li>
                <li>transmission de la position GPS au QG en temps réel,</li>
                <li>suivi des tickets que vous avez ouverts.</li>
              </>
            ) : (
              <>
                <li>réception des missions de réparation affectées,</li>
                <li>démarrage / clôture d'intervention avec photo,</li>
                <li>transmission de la position GPS au QG en temps réel.</li>
              </>
            )}
          </ul>
          <p className="muted small">
            Connectez-vous depuis l'application mobile Anamboatra Terrain.
            L'interface web n'est disponible que pour les administrateurs et les Quartiers Généraux.
          </p>
          <div className="row" style={{ marginTop: '0.85rem' }}>
            <button type="button" className="btn btn-primary" onClick={onLogout}>
              Se déconnecter
            </button>
            <Link to="/" className="btn btn-ghost">
              Aller au portail public
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
