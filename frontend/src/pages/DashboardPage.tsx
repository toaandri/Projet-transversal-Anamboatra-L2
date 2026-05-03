import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../useAuth';
import { QgInterventionAgentsPanel, QgPatrolAgentsPanel } from '../components/EffectifsPanel';
import { MapView } from '../components/MapView';
import { STATUT_LABELS, ROLE_LABELS } from '../mapColors';
import type {
  EquipeUser,
  GeoJsonFeature,
  Role,
  Statut,
  SuggestionCitoyen,
  Ticket,
  TypeInfrastructure,
  Urgence,
  Zone,
} from '../types';
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

type QgMenuPage = 'signalements' | 'patrouille' | 'intervention';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const role = user?.role ?? null;

  if (role === 'SUPER_ADMIN') {
    return <Navigate to="/admin-setup" replace />;
  }

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
  const [mapVisible, setMapVisible] = useState(true);
  const [selectedSuggestion, setSelectedSuggestion] = useState<SuggestionCitoyen | null>(null);
  const [qgMenuPage, setQgMenuPage] = useState<QgMenuPage>('signalements');
  /** Choix du lieu d’une équipe d’intervention sur la carte (page Intervention). */
  const [pickEquipeLieu, setPickEquipeLieu] = useState(false);
  const [equipeLieuCoords, setEquipeLieuCoords] = useState<{ lat: number; lng: number } | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const sideRef   = useRef<HTMLElement>(null);

  function goQgPage(next: QgMenuPage) {
    setQgMenuPage(next);
    setSelected(null);
    setSelectedSuggestion(null);
    setAssignIds([]);
    if (next !== 'intervention') {
      setPickEquipeLieu(false);
      setEquipeLieuCoords(null);
    }
  }

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
        } else {
          setEquipes([]);
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

  /** Filtres : le QG communal n'expose pas la couche électricité nationale. */
  const filtersForRole = useMemo(() => {
    if (role !== 'ADMIN_QG') return filters;
    const types = filters.types.filter((t) => t !== 'ELECTRICITE');
    return types.length === filters.types.length ? filters : { ...filters, types };
  }, [role, filters]);

  const typeFilterChips = useMemo(
    () => (role === 'ADMIN_QG' ? TYPES.filter((t) => t.v !== 'ELECTRICITE') : TYPES),
    [role],
  );

  const filteredFeatures = useMemo(
    () => filterGeo(features, filtersForRole),
    [features, filtersForRole],
  );

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filtersForRole.statuts.length && !filtersForRole.statuts.includes(t.statut)) return false;
      if (filtersForRole.urgences.length && !filtersForRole.urgences.includes(t.urgence))
        return false;
      if (
        filtersForRole.types.length &&
        !filtersForRole.types.includes(t.typeInfrastructure)
      )
        return false;
      return true;
    });
  }, [tickets, filtersForRole]);

  // Stats d'en-tête (tickets bruts)
  const stats = useMemo(() => ({
    total:   tickets.length,
    urgent:  tickets.filter((t) => t.urgence === 'URGENT').length,
    enCours: tickets.filter((t) => t.statut === 'EN_REPARATION').length,
    termine: tickets.filter((t) => t.statut === 'TERMINE' || t.statut === 'CLOTURE').length,
    attente: tickets.filter((t) => t.statut === 'EN_ATTENTE_CONFIRMATION').length,
  }), [tickets]);

  async function onFeatureSelect(f: GeoJsonFeature) {
    if (role === 'ADMIN_QG' && qgMenuPage !== 'signalements') {
      setQgMenuPage('signalements');
    }
    const p = f.properties as { id?: string; kind?: string };
    if (p.kind === 'suggestion' && p.id && role !== 'CITOYEN') {
      setSelected(null);
      setAssignIds([]);
      try {
        const { suggestion } = await api.suggestionCitoyenne(p.id);
        setSelectedSuggestion(suggestion);
        setErr(null);
      } catch {
        setSelectedSuggestion(null);
        setErr('Référence de suggestion inconnue ou profil non habilité.');
      }
      return;
    }
    setSelectedSuggestion(null);
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

  useEffect(() => {
    if (!selected && !selectedSuggestion) return;
    setSideOpen(true);
    const t = setTimeout(() => {
      const detail = detailRef.current;
      const side   = sideRef.current;
      if (!detail || !side) return;
      const offsetTop = detail.offsetTop - side.offsetTop;
      side.scrollTo({ top: offsetTop - 12, behavior: 'smooth' });
    }, 120);
    return () => clearTimeout(t);
  }, [selected, selectedSuggestion]);

  function toggleFilter<K extends keyof Filters>(key: K, value: Filters[K][number]) {
    setFilters((prev) => {
      const arr = prev[key] as unknown[];
      const has = arr.includes(value);
      const next = has ? arr.filter((x) => x !== value) : [...arr, value];
      return { ...prev, [key]: next };
    });
  }

  return (
    <div className="page dashboard">
      <header className="topbar">
        <div className="brand">
          <span className="logo" />
          <div>
            <strong>{role === 'CITOYEN' ? 'Espace citoyen · Anamboatra' : 'Tableau de bord'}</strong>
            <div className="muted small">
              {user?.prenom} {user?.nom} · {role ? ROLE_LABELS[role] : ''}
            </div>
          </div>
        </div>
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
        <aside className="panel side" ref={sideRef}>
          <div className="side-header">
            <span className="qg-mark" aria-hidden="true">
              <span className="qg-mark-flag" />
              <span className="qg-mark-pin" />
            </span>
            <div className="qg-header-text">
              {role === 'CITOYEN' ? (
                <>
                  <small>Plateforme Anamboatra</small>
                  <strong>Espace citoyen</strong>
                </>
              ) : (
                <>
                  <small>Ministère des Travaux Publics</small>
                  <strong>Quartier général · Anamboatra</strong>
                </>
              )}
              <div className="muted">
                {user?.prenom} {user?.nom} · {role ? ROLE_LABELS[role] : ''}
              </div>
            </div>
          </div>

          <div className="side-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setMapVisible((v) => !v)}
              aria-pressed={!mapVisible}
              title={mapVisible ? 'Masquer la carte' : 'Afficher la carte'}
            >
              {mapVisible ? 'Masquer la carte' : 'Afficher la carte'}
            </button>
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

          {role === 'ADMIN_QG' ? (
            <nav className="qg-nav" aria-label="Navigation quartier général">
              <span className="qg-nav-label">Menu</span>
              <div className="qg-nav-row">
                <button
                  type="button"
                  className={qgMenuPage === 'signalements' ? 'qg-nav-btn on' : 'qg-nav-btn'}
                  onClick={() => goQgPage('signalements')}
                >
                  Signalements
                </button>
                <button
                  type="button"
                  className={qgMenuPage === 'patrouille' ? 'qg-nav-btn on' : 'qg-nav-btn'}
                  onClick={() => goQgPage('patrouille')}
                >
                  Patrouille
                </button>
                <button
                  type="button"
                  className={qgMenuPage === 'intervention' ? 'qg-nav-btn on' : 'qg-nav-btn'}
                  onClick={() => goQgPage('intervention')}
                >
                  Intervention
                </button>
              </div>
            </nav>
          ) : null}

          {err ? <p className="alert error">{err}</p> : null}
          {msg ? <p className="alert success">{msg}</p> : null}

          {/* ---- Stats strip (ADMIN_QG · page signalements) ---- */}
          {role === 'ADMIN_QG' && qgMenuPage === 'signalements' && tickets.length > 0 ? (
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

          {(role !== 'ADMIN_QG' || qgMenuPage === 'signalements')
            ? (() => {
            const total =
              filtersForRole.statuts.length +
              filtersForRole.urgences.length +
              filtersForRole.types.length;
            return (
              <section className="qg-section">
                <header className="qg-section-head">
                  <span className="qg-section-eyebrow">Carte</span>
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
                      <span className="qg-section-meta">Aucun critère</span>
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
                        className={filtersForRole.statuts.includes(s) ? 'chip dot on' : 'chip dot'}
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
                        className={filtersForRole.urgences.includes(u) ? 'chip dot on' : 'chip dot'}
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
                    {typeFilterChips.map((t) => (
                      <button
                        key={t.v}
                        type="button"
                        className={
                          filtersForRole.types.includes(t.v) ? 'chip dot on' : 'chip dot'
                        }
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
          })()
            : null}

          {user?.role === 'AGENT_PATROUILLE' || user?.role === 'EQUIPE_INTERVENTION' ? (
            <section className="qg-section">
              <header className="qg-section-head">
              <span className="qg-section-eyebrow">Terrain</span>
              <div className="qg-section-titlerow">
                <h3>Actions</h3>
                </div>
              </header>
              <div className="qg-actions">
                {user?.role === 'AGENT_PATROUILLE' ? (
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
                    Nouveau signalement patrouille
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
                            setMsg('Position enregistrée côté serveur.');
                          });
                      },
                      () => setErr('Géolocalisation indisponible ou refusée par l’appareil.'),
                    );
                  }}
                >
                  Envoyer la position (GPS)
                </button>
              </div>
            </section>
          ) : null}

          {role === 'ADMIN_QG' && qgMenuPage === 'patrouille' ? <QgPatrolAgentsPanel /> : null}

          {role === 'ADMIN_QG' && qgMenuPage === 'intervention' ? (
            <QgInterventionAgentsPanel
              lieuCoords={equipeLieuCoords}
              onLieuxCoordsChange={setEquipeLieuCoords}
              mapPickWaiting={pickEquipeLieu}
              onActivateMapPick={() => {
                setPickReport(false);
                setPickEquipeLieu(true);
                setMapVisible(true);
                setErr(null);
                  setMsg('Carte : indiquez l’emplacement de l’unité (cliquer dans le panneau carte).');
              }}
              onCancelMapPick={() => {
                setPickEquipeLieu(false);
              }}
            />
          ) : null}

          {role === 'ADMIN_QG' && qgMenuPage === 'signalements' ? (
            <section className="qg-section qg-section--kanban">
              <header className="qg-section-head">
                <span className="qg-section-eyebrow">Suivi</span>
                <div className="qg-section-titlerow">
                  <h3>Liste des tickets par statut</h3>
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
                              setSelectedSuggestion(null);
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

          {(role !== 'ADMIN_QG' || qgMenuPage === 'signalements') ? (
          <section className="qg-section qg-section--detail" ref={detailRef}>
            <header className="qg-section-head">
              <span className="qg-section-eyebrow">Fiche</span>
              <div className="qg-section-titlerow">
                <h3>Détail</h3>
                {selectedSuggestion ? (
                  <button
                    type="button"
                    className="qg-section-link"
                    onClick={() => setSelectedSuggestion(null)}
                  >
                    Fermer
                  </button>
                ) : selected ? (
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
            {selectedSuggestion && role !== 'CITOYEN' ? (
              <SuggestionQgPanel suggestion={selectedSuggestion} role={role} />
            ) : selected ? (
              <DetailPanel
                ticket={selected}
                role={role}
                equipes={equipes}
                assignIds={assignIds}
                setAssignIds={setAssignIds}
                closureFile={closureFile}
                setClosureFile={setClosureFile}
                userId={user?.id}
                onClearSelection={() => setSelected(null)}
                onUpdated={async () => {
                  setMsg('Dossier mis à jour.');
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
                <p className="muted small">
                  {mapVisible
                    ? 'Carte : sélectionnez un ticket ou une suggestion, ou une entrée du tableau ci-dessus.'
                    : 'Affichez la carte pour localiser un dossier.'}
                </p>
              </div>
            )}
          </section>
          ) : null}
        </aside>

        {mapVisible ? (
          <section className="panel map-panel">
            <MapView
              geojson={filteredFeatures}
              viewerRole={role}
              onSelectFeature={pickEquipeLieu ? undefined : onFeatureSelect}
              pickMode={pickReport || pickEquipeLieu}
              pickBannerText={
                pickEquipeLieu
                  ? "Cliquer sur la carte : emplacement de rattachement de l’équipe"
                  : undefined
              }
              onPickLatLng={(la, ln) => {
                if (pickEquipeLieu) {
                  setEquipeLieuCoords({ lat: la, lng: ln });
                  setPickEquipeLieu(false);
                  setMsg(null);
                  return;
                }
                setReportLat(la);
                setReportLng(ln);
              }}
              height="100%"
              myZone={myZone}
            />
            {role === 'ADMIN_QG' && qgMenuPage === 'signalements' && tickets.length > 0 ? (
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
        ) : null}
      </div>

      {reportOpen && user?.role === 'AGENT_PATROUILLE' ? (
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
            setMsg('Signalement enregistré.');
            await load();
          }}
          onError={setErr}
        />
      ) : null}
    </div>
  );
}

function SuggestionQgPanel({
  suggestion,
  role,
}: {
  suggestion: SuggestionCitoyen;
  role: Role | null;
}) {
  const typeLabel = TYPES.find((t) => t.v === suggestion.typeSuggere)?.l ?? suggestion.typeSuggere;
  const code = suggestion.terrainClotureCode;
  const terrainDone =
    code === 'OFFICIAL_TICKET'
      ? 'Traitement clos — signalement officiel issu de la patrouille'
      : code === 'NON_CONFORME'
        ? 'Clôture terrain — dossier non conforme (ex. fraude signalée)'
        : code === 'NON_REPERE'
          ? 'Clôture terrain — lieu non retrouvé'
          : code === 'AUTRE'
            ? 'Clôture terrain — autre motif'
            : code === 'FAUSSE_ALERTE'
              ? 'Clôture terrain — fausse alerte (historique)'
              : null;

  return (
    <div className="suggestion-qg-panel">
      <div className="suggestion-qg-stripe" aria-hidden="true" />
      <div className="qg-section-meta suggestion-qg-eyebrow">Suggestion citoyenne</div>
      <div className="suggestion-qg-head">
        <span className="badge" style={{ ['--chip-color' as string]: '#a855f7' }}>
          {typeLabel}
        </span>
        {suggestion.traitee ? (
          <span className="badge" style={{ ['--chip-color' as string]: '#16a34a' }}>
            Traitée
          </span>
        ) : (
          <span className="muted small suggestion-qg-pill">Instruction patrouille</span>
        )}
      </div>

      <p className="small suggestion-qg-desc">{suggestion.description}</p>
      <dl className="suggestion-qg-meta">
        <div>
          <dt>Auteur</dt>
          <dd>{suggestion.pseudoCitoyen || 'Anonyme'}</dd>
        </div>
        <div>
          <dt>Coordonnées</dt>
          <dd>
            {suggestion.localisation.latitude.toFixed(5)}, {suggestion.localisation.longitude.toFixed(5)}
          </dd>
        </div>
      </dl>

      {terrainDone ? (
        <div className="suggestion-qg-order">
          <strong>État</strong>
          <p className="small muted">{terrainDone}</p>
          {suggestion.terrainClotureComment ? (
            <blockquote className="suggestion-qg-instruction">{suggestion.terrainClotureComment}</blockquote>
          ) : null}
        </div>
      ) : null}

      {role === 'ADMIN_QG' && !suggestion.traitee ? (
        <p className="muted small" style={{ marginTop: 10, lineHeight: 1.5 }}>
          Pas d’affectation nominative depuis le QG : les patrouilles consultent leur liste d’attente, se déplacent
          avec l’itinéraire intégré, puis ouvrent soit le signalement officiel soit une clôture motivée.
        </p>
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
  onClearSelection,
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
  onClearSelection?: () => void;
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
      onError('Une photographie de clôture doit être jointe.');
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
      <h3>Ticket</h3>
      <div className="muted small">{STATUT_LABELS[ticket.statut]}</div>
      {ticket.photoSignalement ? (
        <a href={ticket.photoSignalement} target="_blank" rel="noreferrer" className="thumb-link">
          <img src={ticket.photoSignalement} alt="" className="thumb" />
        </a>
      ) : null}
      <p className="small">{ticket.description}</p>

      {role === 'ADMIN_QG' && ticket.statut === 'EN_ATTENTE_CONFIRMATION' ? (
        <div className="form">
          <div className="muted small">Affectations</div>
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
          <div className="row" style={{ marginTop: '0.35rem' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                setAssignIds(
                  ticket.mission?.assignedUserIds ? [...ticket.mission.assignedUserIds] : [],
                )
              }
            >
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void adminConfirm()}>
              Valider — réparation prévue
            </button>
          </div>
        </div>
      ) : null}

      {role === 'ADMIN_QG' && ticket.statut === 'TERMINE' ? (
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={() => onClearSelection?.()}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void adminCloture()}>
              Clôturer (définitif)
          </button>
        </div>
      ) : null}

      {role === 'EQUIPE_INTERVENTION' && assigned && ticket.statut === 'REPARATION_PREVUE' ? (
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={() => onClearSelection?.()}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void equipeStart()}>
              Démarrer l’intervention
          </button>
        </div>
      ) : null}

      {role === 'EQUIPE_INTERVENTION' && assigned && ticket.statut === 'EN_REPARATION' ? (
        <div className="form">
          <label>
              Clôture — joindre une photographie
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setClosureFile(e.target.files?.[0] || null)} />
          </label>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={() => setClosureFile(null)}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void equipeFinish()}>
              Terminer avec photo
            </button>
          </div>
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
      onError('Coordonnées géographiques et photographie obligatoires.');
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
        <button type="button" className={pickReport ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setPickReport(!pickReport)}>
          {pickReport ? 'Sélection carte active' : 'Pointer sur la carte'}
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
              {loading ? 'Transmission…' : 'Enregistrer'}
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
          <h1>Interface web indisponible pour ce profil</h1>
          <p className="muted small">
            Comptes «&nbsp;agent de patrouille&nbsp;» et «&nbsp;équipe d’intervention&nbsp;» sont servis depuis
            l&apos;application mobile Terrain. Ce portail reste destiné aux profils citoyen, administrateur QG et MTP.
          </p>
          <div className="row" style={{ marginTop: '0.85rem' }}>
            <Link to="/" className="btn btn-ghost">
              Annuler
            </Link>
            <button type="button" className="btn btn-primary" onClick={onLogout}>
              Se déconnecter
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
