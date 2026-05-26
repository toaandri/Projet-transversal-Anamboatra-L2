import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/auth/useAuth';
import { QgInterventionAgentsPanel, QgPatrolAgentsPanel } from '@/components/EffectifsPanel';
import { anam, anamRgba, typeInfraColors, statutUiColors } from '@/theme/anamboatraTheme';
import { MadagascarBrandMark } from '@/components/MadagascarBrandMark';
import { MapView } from '@/components/MapView';
import { STATUT_LABELS, ROLE_LABELS } from '@/theme/mapColors';
import type {
  EquipeUser,
  GeoJsonFeature,
  Role,
  Statut,
  SuggestionCitoyen,
  Ticket,
  TypeInfrastructure,
  TypeInfrastructureLegacy,
  Urgence,
  Zone,
} from '@/lib/types';
import { useMapSocket } from '@/hooks/useMapSocket';

const STATUTS_ORDER: Statut[] = [
  'EN_ATTENTE_CONFIRMATION',
  'REPARATION_PREVUE',
  'EN_REPARATION',
  'TERMINE',
  'CLOTURE',
];

const TYPES: { v: TypeInfrastructure; l: string; color: string }[] = [
  { v: 'ROUTE', l: 'Route', color: typeInfraColors.ROUTE! },
  { v: 'ELECTRICITE_EAU', l: 'Électricité / eau', color: typeInfraColors.ELECTRICITE_EAU! },
  { v: 'PROPRIETE_PUBLIQUE', l: 'Propriété publique', color: typeInfraColors.PROPRIETE_PUBLIQUE! },
  { v: 'SALUBRITE', l: 'Propreté (salubrité)', color: typeInfraColors.SALUBRITE! },
];

const TYPE_META_BY_INFRASTRUCTURE = new Map<TypeInfrastructure, (typeof TYPES)[number]>(
  TYPES.map((t) => [t.v, t]),
);

const STATUT_COLORS: Record<Statut, string> = {
  EN_ATTENTE_CONFIRMATION: statutUiColors.EN_ATTENTE_CONFIRMATION,
  REPARATION_PREVUE: statutUiColors.REPARATION_PREVUE,
  EN_REPARATION: statutUiColors.EN_REPARATION,
  TERMINE: statutUiColors.TERMINE,
  CLOTURE: statutUiColors.CLOTURE,
};

const URGENCE_COLORS: Record<Urgence, string> = {
  NORMAL: anam.muted,
  URGENT: anam.mgRed,
};

function canonicalInfrastructureType(v: string | undefined): TypeInfrastructure | undefined {
  if (!v) return undefined;
  if (v === 'ELECTRICITE' || v === 'EAU') return 'ELECTRICITE_EAU';
  if (v === 'ROUTE' || v === 'ELECTRICITE_EAU' || v === 'PROPRIETE_PUBLIQUE' || v === 'SALUBRITE') return v;
  return undefined;
}

function typeMetaForInfrastructureField(
  raw: string | undefined,
): (typeof TYPES)[number] | undefined {
  const key =
    canonicalInfrastructureType(raw) ??
    (raw && TYPE_META_BY_INFRASTRUCTURE.has(raw as TypeInfrastructure) ? (raw as TypeInfrastructure) : undefined);
  if (!key) return undefined;
  return TYPE_META_BY_INFRASTRUCTURE.get(key);
}

type Filters = { statuts: Statut[]; urgences: Urgence[]; types: TypeInfrastructure[] };

function filterGeo(features: GeoJsonFeature[], f: Filters): GeoJsonFeature[] {
  const statutsWant = f.statuts.length ? new Set(f.statuts) : null;
  const urgencesWant = f.urgences.length ? new Set(f.urgences) : null;
  const typesWant = f.types.length ? new Set(f.types) : null;

  return features.filter((x) => {
    const p = x.properties as {
      kind?: string;
      statut?: Statut;
      urgence?: Urgence;
      typeInfrastructure?: TypeInfrastructureLegacy;
      typeSuggere?: TypeInfrastructureLegacy;
    };
    if (p.kind === 'suggestion') {
      if (typesWant && typesWant.size > 0 && p.typeSuggere) {
        const t = canonicalInfrastructureType(p.typeSuggere);
        if (!t || !typesWant.has(t)) return false;
      }
      return true;
    }
    if (statutsWant && p.statut && !statutsWant.has(p.statut)) return false;
    if (urgencesWant && p.urgence && !urgencesWant.has(p.urgence)) return false;
    if (typesWant && typesWant.size > 0 && p.typeInfrastructure) {
      const t = canonicalInfrastructureType(p.typeInfrastructure);
      if (!t || !typesWant.has(t)) return false;
    }
    return true;
  });
}

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
      setErr(e instanceof Error ? e.message : 'Échec du chargement des données.');
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

  const typeFilterChips = TYPES;

  const filteredFeatures = useMemo(
    () => filterGeo(features, filters),
    [features, filters],
  );

  const filteredTickets = useMemo(() => {
    const statutsWant = filters.statuts.length ? new Set(filters.statuts) : null;
    const urgencesWant = filters.urgences.length ? new Set(filters.urgences) : null;
    const typesWant = filters.types.length ? new Set(filters.types) : null;

    return tickets.filter((t) => {
      if (statutsWant && !statutsWant.has(t.statut)) return false;
      if (urgencesWant && !urgencesWant.has(t.urgence)) return false;
      if (typesWant && typesWant.size > 0) {
        const ct = canonicalInfrastructureType(t.typeInfrastructure);
        if (!ct || !typesWant.has(ct)) return false;
      }
      return true;
    });
  }, [tickets, filters]);

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
        setErr('Référence introuvable ou habilitation insuffisante.');
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
          <MadagascarBrandMark />
          <div>
            <strong>{role === 'CITOYEN' ? 'Espace citoyen — Anamboatra' : 'Suivi des interventions'}</strong>
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
            <MadagascarBrandMark />
            <div className="qg-header-text">
              {role === 'CITOYEN' ? (
                <>
                  <small>République de Madagascar</small>
                  <strong>Espace citoyen</strong>
                </>
              ) : (
                <>
                  <small>République de Madagascar</small>
                  <strong>Quartier général — Anamboatra</strong>
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
              title={mapVisible ? 'Masquer le fond cartographique' : 'Afficher le fond cartographique'}
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
            <nav className="qg-nav" aria-label="Navigation QG">
              <span className="qg-nav-label">Vues</span>
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

          {role === 'ADMIN_QG' && qgMenuPage === 'signalements' && tickets.length > 0 ? (
            <div className="qg-stats-strip">
              <div className="qg-stat">
                <span className="qg-stat-value">{stats.total}</span>
                <span className="qg-stat-label">Dossiers</span>
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
              filters.statuts.length +
              filters.urgences.length +
              filters.types.length;
            return (
              <section className="qg-section">
                <header className="qg-section-head">
                  <span className="qg-section-eyebrow">Couche cartographique</span>
                  <div className="qg-section-titlerow">
                    <h3>Critères d’affichage</h3>
                    {total > 0 ? (
                      <button
                        type="button"
                        className="qg-section-link"
                        onClick={() => setFilters({ statuts: [], urgences: [], types: [] })}
                      >
                        Réinitialiser ({total})
                      </button>
                    ) : (
                      <span className="qg-section-meta">Aucun filtre actif</span>
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
                  <div className="qg-filter-label">Type d’infrastructure</div>
                  <div className="chips">
                    {typeFilterChips.map((t) => (
                      <button
                        key={t.v}
                        type="button"
                        className={
                          filters.types.includes(t.v) ? 'chip dot on' : 'chip dot'
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
                <h3>Actions terrain</h3>
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
                    Nouveau constat patrouille
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
                            setMsg('Position transmise au serveur.');
                          });
                      },
                      () => setErr('Géolocalisation indisponible ou refusée.'),
                    );
                  }}
                >
                  Émettre la position (GPS)
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
                  setMsg('Carte : cliquez pour indiquer la position opérationnelle de l’unité.');
              }}
              onCancelMapPick={() => {
                setPickEquipeLieu(false);
              }}
            />
          ) : null}

          {role === 'ADMIN_QG' && qgMenuPage === 'signalements' ? (
            <section className="qg-section qg-section--kanban">
              <header className="qg-section-head">
                <span className="qg-section-eyebrow">Pilotage</span>
                <div className="qg-section-titlerow">
                  <h3>Répartition par statut</h3>
                  <span className="qg-section-meta">
                    {filteredTickets.length} dossier{filteredTickets.length > 1 ? 's' : ''}
                  </span>
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
                        <div className="kanban-empty">Aucun dossier</div>
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
                                style={{
                                  ['--chip-color' as string]:
                                    typeMetaForInfrastructureField(t.typeInfrastructure)?.color || anam.teal,
                                }}
                              >
                                {typeMetaForInfrastructureField(t.typeInfrastructure)?.l ?? t.typeInfrastructure}
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
              <span className="qg-section-eyebrow">Détail</span>
              <div className="qg-section-titlerow">
                <h3>Fiche dossier</h3>
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
                  setMsg('Mise à jour enregistrée.');
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
                  <circle cx="20" cy="20" r="19" stroke={anamRgba.tealStrokeSoft} strokeWidth="1.5" fill={anamRgba.tealFillSoft} />
                  <path
                    d="M20 11c-3.866 0-7 3.134-7 7 0 4.5 7 11 7 11s7-6.5 7-11c0-3.866-3.134-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"
                    fill={anamRgba.tealIcon}
                  />
                </svg>
                <p className="muted small">
                  {mapVisible
                    ? 'Sélectionnez un marqueur sur la carte ou un dossier dans le tableau ci-dessus.'
                    : 'Réactivez la carte pour localiser un dossier.'}
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
                  ? "Carte : indiquer le point de rattachement de l’équipe"
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
                  <span className="map-stat-dot map-stat-dot--attente" />
                  <span>{stats.attente} en attente de traitement</span>
                </div>
                <div className="map-stats-row">
                  <span className="map-stat-dot map-stat-dot--intervention" />
                  <span>{stats.enCours} en intervention</span>
                </div>
                <div className="map-stats-row">
                  <span className="map-stat-dot map-stat-dot--clos" />
                  <span>{stats.termine} clôturés ou terminés</span>
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
            setMsg('Constat enregistré.');
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
  const typeLabel =
    typeMetaForInfrastructureField(suggestion.typeSuggere)?.l ?? suggestion.typeSuggere;
  const code = suggestion.terrainClotureCode;
  const terrainDone =
    code === 'OFFICIAL_TICKET'
      ? 'Dossier converti — constat patrouille homologué'
      : code === 'NON_CONFORME'
        ? 'Clôture terrain — non-conformité (ex. fraude)'
        : code === 'NON_REPERE'
          ? 'Clôture terrain — lieu non localisé'
          : code === 'AUTRE'
            ? 'Clôture terrain — autre motif'
            : code === 'FAUSSE_ALERTE'
              ? 'Clôture terrain — fausse alerte'
              : null;

  return (
    <div className="suggestion-qg-panel">
      <div className="suggestion-qg-stripe" aria-hidden="true" />
      <div className="qg-section-meta suggestion-qg-eyebrow">Proposition citoyenne</div>
      <div className="suggestion-qg-head">
        <span className="badge" style={{ ['--chip-color' as string]: anam.violet }}>
          {typeLabel}
        </span>
        {suggestion.traitee ? (
          <span className="badge" style={{ ['--chip-color' as string]: statutUiColors.TERMINE }}>
            Traitée
          </span>
        ) : (
          <span className="muted small suggestion-qg-pill">Attente patrouille</span>
        )}
      </div>

      {suggestion.photoCitoyen ? (
        <a
          href={suggestion.photoCitoyen}
          target="_blank"
          rel="noreferrer"
          className="thumb-link"
          style={{ marginBottom: 12, display: 'block' }}
        >
          <img src={suggestion.photoCitoyen} alt="Illustration citoyenne" className="thumb" />
        </a>
      ) : null}

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
          <strong>Statut terrain</strong>
          <p className="small muted">{terrainDone}</p>
          {suggestion.terrainClotureComment ? (
            <blockquote className="suggestion-qg-instruction">{suggestion.terrainClotureComment}</blockquote>
          ) : null}
        </div>
      ) : null}

      {role === 'ADMIN_QG' && !suggestion.traitee ? (
        <p className="muted small" style={{ marginTop: 10, lineHeight: 1.5 }}>
          Les affectations nominatives relèvent du dispositif terrain : la patrouille consulte sa file
          d’attente et saisit soit le constat officiel, soit une clôture motivée.
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
      onError('Une photographie de clôture est obligatoire.');
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
      <h3>Référence dossier</h3>
      <div className="muted small">{STATUT_LABELS[ticket.statut]}</div>
      {ticket.photoSignalement ? (
        <a href={ticket.photoSignalement} target="_blank" rel="noreferrer" className="thumb-link">
          <img src={ticket.photoSignalement} alt="" className="thumb" />
        </a>
      ) : null}
      <p className="small">{ticket.description}</p>

      {role === 'ADMIN_QG' && ticket.statut === 'EN_ATTENTE_CONFIRMATION' ? (
        <div className="form">
          <div className="muted small">Ressources affectées</div>
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
              Valider et planifier la réparation
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
              Clôturer définitivement
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
            Clôture — photographie justificative
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setClosureFile(e.target.files?.[0] || null)} />
          </label>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={() => setClosureFile(null)}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void equipeFinish()}>
              Clôturer avec justificatif
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
      onError('Coordonnées et photographie obligatoires.');
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
        <h2>Constat patrouille</h2>
        <button type="button" className={pickReport ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setPickReport(!pickReport)}>
          {pickReport ? 'Saisie par carte active' : 'Localiser sur la carte'}
        </button>
        <p className="muted small">
          {lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Position non renseignée'}
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
              {loading ? 'Envoi…' : 'Enregistrer'}
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
          <MadagascarBrandMark />
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
              <rect x="14" y="4" width="28" height="48" rx="5" stroke="#3e605f" strokeWidth="2.2" fill="rgba(62,96,95,0.08)"/>
              <rect x="22" y="8" width="12" height="2" rx="1" fill="#3e605f" opacity="0.4"/>
              <circle cx="28" cy="44" r="2.5" fill="#3e605f" opacity="0.5"/>
              <path d="M24 22l4 4 8-8" stroke="#3e605f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1>Application web non disponible pour ce profil</h1>
          <p className="muted small">
            Les comptes «&nbsp;agent de patrouille&nbsp;» et «&nbsp;équipe d’intervention&nbsp;» sont pris en charge
            par l’application mobile Terrain. Ce portail est réservé aux profils citoyen, administrateur QG et MTP.
          </p>
          <div className="row" style={{ marginTop: '0.85rem' }}>
            <Link to="/" className="btn btn-ghost">
              Retour
            </Link>
            <button type="button" className="btn btn-primary" onClick={onLogout}>
              Déconnexion
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
