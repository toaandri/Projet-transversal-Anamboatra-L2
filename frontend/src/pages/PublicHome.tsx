import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { MapView } from '../components/MapView';
import { STATUT_LABELS } from '../mapColors';
import type { GeoJsonFeature, Statut, TypeInfrastructure } from '../types';
import { useMapSocket } from '../useMapSocket';

const TYPE_LABELS: Record<string, string> = {
  ROUTE: 'Route',
  ELECTRICITE_EAU: 'Électricité / eau',
  PROPRIETE_PUBLIQUE: 'Propriété publique',
  SALUBRITE: 'Propreté (salubrité)',
  ELECTRICITE: 'Électricité / eau',
  EAU: 'Électricité / eau',
};

const TYPE_COLORS: Record<string, string> = {
  ROUTE: '#64748b',
  ELECTRICITE_EAU: '#0e7490',
  PROPRIETE_PUBLIQUE: '#7c3aed',
  SALUBRITE: '#15803d',
  ELECTRICITE: '#0e7490',
  EAU: '#0e7490',
};

const TYPES: { v: TypeInfrastructure; l: string; color: string }[] = [
  { v: 'ROUTE', l: 'Route', color: TYPE_COLORS.ROUTE },
  { v: 'ELECTRICITE_EAU', l: 'Électricité / eau', color: TYPE_COLORS.ELECTRICITE_EAU },
  { v: 'PROPRIETE_PUBLIQUE', l: 'Propriété publique', color: TYPE_COLORS.PROPRIETE_PUBLIQUE },
  { v: 'SALUBRITE', l: 'Propreté (salubrité)', color: TYPE_COLORS.SALUBRITE },
];

function truncateText(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

const STATUT_DOT: Partial<Record<Statut, string>> = {
  EN_ATTENTE_CONFIRMATION: '#dc2626',
  REPARATION_PREVUE: '#f97316',
  EN_REPARATION: '#3b82f6',
  TERMINE: '#22c55e',
  CLOTURE: '#16a34a',
};

function initialCitizenSideOpen(): boolean {
  if (typeof window === 'undefined') return true;
  return !window.matchMedia('(max-width: 1200px), (max-aspect-ratio: 11/10)').matches;
}

export function PublicHome() {
  const [features, setFeatures] = useState<GeoJsonFeature[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [typeSuggere, setTypeSuggere] = useState<TypeInfrastructure>('ROUTE');
  const [description, setDescription] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [pick, setPick] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sideOpen, setSideOpen] = useState(initialCitizenSideOpen);
  const [formExpanded, setFormExpanded] = useState(false);
  const [mapFocus, setMapFocus] = useState<{ index: number; nonce: number } | null>(null);
  const mapFocusNonce = useRef(0);

  const publicSignalements = useMemo(() => {
    return features
      .map((f, geoIdx) => ({ f, geoIdx }))
      .filter((x) => (x.f.properties as { kind?: string }).kind === 'ticket')
      .sort((a, b) => {
        const da = new Date(
          String((a.f.properties as { dateSignalement?: string }).dateSignalement || 0),
        ).getTime();
        const db = new Date(
          String((b.f.properties as { dateSignalement?: string }).dateSignalement || 0),
        ).getTime();
        return db - da;
      });
  }, [features]);

  function requestMapFocus(geoIdx: number) {
    mapFocusNonce.current += 1;
    setMapFocus({ index: geoIdx, nonce: mapFocusNonce.current });
  }

  useEffect(() => {
    if (!sideOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSideOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sideOpen]);

  const load = useCallback(async () => {
    try {
      const data = await api.publicMapTiles();
      setFeatures(data.geojson.features as GeoJsonFeature[]);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur carte');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useMapSocket(load);

  const cancelSuggestion = useCallback(() => {
    setDescription('');
    setPseudo('');
    setPhoto(null);
    setLat(null);
    setLng(null);
    setPick(false);
    setTypeSuggere('ROUTE');
    setErr(null);
    setOk(null);
    setFormExpanded(false);
  }, []);

  async function submitSuggestion(e: React.FormEvent) {
    e.preventDefault();
    setOk(null);
    setErr(null);
    if (lat === null || lng === null) {
      setErr('Une position géographique sur la carte est obligatoire.');
      return;
    }
    setSubmitting(true);
    try {
      const { zoneAttribution } = await api.publicSuggestion({
        description,
        typeSuggere,
        latitude: lat,
        longitude: lng,
        pseudoCitoyen: pseudo || undefined,
        photo: photo || undefined,
      });
      const zoneLine = zoneAttribution
        ? ` Affectation automatique : ${zoneAttribution.nom} (${zoneAttribution.code}).`
        : '';
      setOk(`Transmission reçue.${zoneLine} La proposition sera traitée selon le circuit officiel.`);
      setDescription('');
      setPseudo('');
      setPhoto(null);
      setLat(null);
      setLng(null);
      setPick(false);
      setFormExpanded(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page dashboard dashboard--public-carto">
      <div className={`dash-grid${sideOpen ? '' : ' side-closed'}`}>
        {sideOpen ? (
          <button
            type="button"
            className="public-carto-backdrop"
            aria-label="Fermer le menu"
            onClick={() => setSideOpen(false)}
          />
        ) : null}

        <button
          type="button"
          className="side-toggle side-toggle-public"
          onClick={() => setSideOpen((o) => !o)}
          aria-expanded={sideOpen}
          aria-controls="public-carto-side"
          aria-label={sideOpen ? 'Replier le panneau latéral' : 'Afficher le panneau latéral'}
          title={sideOpen ? 'Replier' : 'Afficher le panneau'}
        >
          <span className="side-toggle-glyph">{sideOpen ? '‹' : '›'}</span>
          <span className="side-toggle-label">{sideOpen ? 'Fermer' : 'Menu'}</span>
        </button>

        <aside className="panel side" id="public-carto-side" aria-hidden={!sideOpen}>
          <div className="side-header">
            <span className="qg-mark" aria-hidden="true">
              <span className="qg-mark-flag" />
              <span className="qg-mark-pin" />
            </span>
            <div className="qg-header-text">
              <div>
                <small>Plateforme Anamboatra</small>
              </div>
              <div>
                <strong>Carte publique</strong>
              </div>
              <div className="muted small">Signalement hors compte — coordonnées obligatoires</div>
            </div>
          </div>

          <section className="qg-section public-side-nav" aria-label="Navigation">
            <header className="qg-section-head">
              <span className="qg-section-eyebrow">Navigation</span>
              <div className="qg-section-titlerow">
                <h3>Liens</h3>
              </div>
            </header>
            <div className="qg-actions">
              <Link to="/" className="btn btn-ghost">
                Présentation publique
              </Link>
            </div>
          </section>

          {err ? <p className="alert error">{err}</p> : null}
          {ok ? <p className="alert success">{ok}</p> : null}

          <section className="qg-section">
            <header className="qg-section-head">
              <span className="qg-section-eyebrow">Lecture</span>
              <div className="qg-section-titlerow">
                <h3>Information affichée</h3>
              </div>
            </header>
            <p className="muted small" style={{ margin: 0, lineHeight: 1.5 }}>
              Tous les dossiers rendus publics par le MTP sur le territoire figurent sur la carte. Pour transmettre
              une proposition, ouvrez le formulaire ci-dessous ; la commune est détectée automatiquement à partir du
              point sur la carte.
            </p>
          </section>

          <section className="qg-section public-signalements-section">
            <header className="qg-section-head">
              <span className="qg-section-eyebrow">Signalements</span>
              <div className="qg-section-titlerow">
                <h3>Dossiers visibles</h3>
                <span className="qg-section-meta">{publicSignalements.length}</span>
              </div>
            </header>
            {publicSignalements.length === 0 ? (
              <p className="muted small public-signalements-empty">
                Aucun signalement public sur la carte pour le moment.
              </p>
            ) : (
              <ul
                className="public-signalement-list"
                aria-label="Liste des signalements publics"
                style={{ listStyle: 'none', margin: 0, padding: 0 }}
              >
                {publicSignalements.map(({ f, geoIdx }) => {
                  const p = f.properties as {
                    id?: string;
                    statut?: Statut;
                    typeInfrastructure?: TypeInfrastructure;
                    description?: string;
                    dateSignalement?: string;
                  };
                  const statut = p.statut || 'EN_ATTENTE_CONFIRMATION';
                  const typeInf = p.typeInfrastructure || 'ROUTE';
                  return (
                    <li key={p.id || String(geoIdx)} style={{ listStyle: 'none' }}>
                      <button
                        type="button"
                        className="public-signalement-item"
                        onClick={() => requestMapFocus(geoIdx)}
                      >
                        <span
                          className="public-signalement-item-dot"
                          style={{
                            background: STATUT_DOT[statut] || '#94a3b8',
                          }}
                          aria-hidden
                        />
                        <span className="public-signalement-item-body">
                          <div className="public-signalement-item-title">
                            {TYPE_LABELS[typeInf]} · {STATUT_LABELS[statut] ?? statut}
                          </div>
                          <div className="public-signalement-item-desc">
                            {truncateText(p.description || 'Sans description', 96)}
                          </div>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="public-form-drawer">
            <button
              type="button"
              className={`btn block public-form-toggle ${formExpanded ? 'btn-ghost public-form-toggle--open' : 'btn-primary'}`}
              onClick={() => setFormExpanded((v) => !v)}
              aria-expanded={formExpanded}
            >
              {formExpanded
                ? 'Replier le formulaire de proposition'
                : 'Rédiger une proposition — afficher le formulaire'}
            </button>

            {formExpanded ? (
              <form onSubmit={submitSuggestion} className="public-suggest-form">
            <section className="qg-section">
              <header className="qg-section-head">
                <span className="qg-section-eyebrow">1 · Domaine</span>
                <div className="qg-section-titlerow">
                  <h3>Type d&apos;infrastructure</h3>
                </div>
              </header>
              <div className="chips">
                {TYPES.map((t) => (
                  <button
                    key={t.v}
                    type="button"
                    className={typeSuggere === t.v ? 'chip dot on' : 'chip dot'}
                    style={{ ['--chip-color' as string]: t.color }}
                    onClick={() => setTypeSuggere(t.v)}
                  >
                    <span className="chip-dot" />
                    {t.l}
                  </button>
                ))}
              </div>
            </section>

            <section className="qg-section">
              <header className="qg-section-head">
                <span className="qg-section-eyebrow">2 · Illustration</span>
                <div className="qg-section-titlerow">
                  <h3>Photo du constat</h3>
                  <span className="qg-section-meta">Facultatif</span>
                </div>
              </header>
              <div className="public-file-upload">
                <p className="public-file-upload-intro muted small">
                  Recommandé pour appuyer votre réclamation (JPEG, PNG ou WebP, 8&nbsp;Mo max).
                </p>
                <div className="public-file-upload-row">
                  <label className="public-file-upload-label">
                    <input
                      type="file"
                      className="public-file-upload-input"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                    />
                    <span className="public-file-upload-browse">Joindre un fichier</span>
                  </label>
                </div>
                {photo ? (
                  <div className="public-file-upload-picked">
                    <span className="public-file-upload-name" title={photo.name}>
                      {photo.name}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost small public-file-upload-remove"
                      onClick={() => setPhoto(null)}
                    >
                      Retirer
                    </button>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="qg-section">
              <header className="qg-section-head">
                <span className="qg-section-eyebrow">3 · Description</span>
                <div className="qg-section-titlerow">
                  <h3>Description</h3>
                  <span className="qg-section-meta">{description.length}/2000</span>
                </div>
              </header>
              <textarea
                required
                minLength={3}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Objet précis du constat ; repères géographiques visibles au sol…"
              />
            </section>

            <section className="qg-section">
              <header className="qg-section-head">
                <span className="qg-section-eyebrow">Facultatif</span>
                <div className="qg-section-titlerow">
                  <h3>Identifiant de contact libre</h3>
                </div>
              </header>
              <input
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                maxLength={120}
                placeholder="Laisser vide pour rester anonyme"
              />
            </section>

            <section className="qg-section">
              <header className="qg-section-head">
                <span className="qg-section-eyebrow">4 · Coordonnées</span>
                <div className="qg-section-titlerow">
                  <h3>Localisation géographique</h3>
                </div>
              </header>
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                {lat !== null && lng !== null
                  ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                  : 'Aucune position'}
              </p>
              <p className="muted small" style={{ margin: '0 0 8px', lineHeight: 1.45 }}>
                Ce point sert à déterminer automatiquement la commune d’acheminement de votre proposition.
              </p>
              <button
                type="button"
                className={pick ? 'btn btn-primary block' : 'btn btn-ghost block'}
                onClick={() => setPick((p) => !p)}
              >
                {pick ? 'Pointage actif · cliquer la carte à droite' : 'Pointer sur la carte'}
              </button>
            </section>

            <div className="public-suggest-actions">
              <button type="button" className="btn btn-ghost" onClick={cancelSuggestion}>
                Annuler
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Transmission…' : 'Transmettre'}
              </button>
            </div>
              </form>
            ) : null}
          </div>
        </aside>

        <section
          className="panel map-panel"
          style={{ minHeight: 'min(55vh, 560px)' }}
          aria-label="Carte des signalements publics"
        >
          <MapView
            geojson={features}
            viewerRole={null}
            compactUI
            height="100%"
            pickMode={pick}
            focusGeoIndex={mapFocus}
            onPickLatLng={(la, ln) => {
              setLat(la);
              setLng(ln);
            }}
          />
        </section>
      </div>
    </div>
  );
}
