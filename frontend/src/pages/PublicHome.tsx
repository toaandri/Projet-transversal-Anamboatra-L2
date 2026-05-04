import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { MapView } from '../components/MapView';
import type { GeoJsonFeature, TypeInfrastructure, Zone } from '../types';
import { useMapSocket } from '../useMapSocket';

const TYPE_COLORS: Record<TypeInfrastructure, string> = {
  ROUTE: '#64748b',
  ELECTRICITE: '#f59e0b',
  EAU: '#0ea5e9',
};

const TYPES: { v: TypeInfrastructure; l: string; color: string }[] = [
  { v: 'ROUTE', l: 'Route', color: TYPE_COLORS.ROUTE },
  { v: 'ELECTRICITE', l: 'Électricité', color: TYPE_COLORS.ELECTRICITE },
  { v: 'EAU', l: 'Eau', color: TYPE_COLORS.EAU },
];

function initialCitizenSideOpen(): boolean {
  if (typeof window === 'undefined') return true;
  return !window.matchMedia('(max-width: 1200px), (max-aspect-ratio: 11/10)').matches;
}

export function PublicHome() {
  const [features, setFeatures] = useState<GeoJsonFeature[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [zoneId, setZoneId] = useState('');
  const [typeSuggere, setTypeSuggere] = useState<TypeInfrastructure>('ROUTE');
  const [description, setDescription] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [pick, setPick] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sideOpen, setSideOpen] = useState(initialCitizenSideOpen);

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

  useEffect(() => {
    void (async () => {
      try {
        const { zones: z } = await api.publicZones();
        setZones(z);
        setZoneId((prev) => (prev ? prev : z[0]?.id ?? ''));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const cancelSuggestion = useCallback(() => {
    setDescription('');
    setPseudo('');
    setLat(null);
    setLng(null);
    setPick(false);
    setTypeSuggere('ROUTE');
    setZoneId(zones[0]?.id ?? '');
    setErr(null);
    setOk(null);
  }, [zones]);

  async function submitSuggestion(e: React.FormEvent) {
    e.preventDefault();
    setOk(null);
    setErr(null);
    if (lat === null || lng === null) {
      setErr('Une position géographique sur la carte est obligatoire.');
      return;
    }
    if (!zoneId) {
      setErr('Sélection de la zone administrative obligatoire.');
      return;
    }
    setSubmitting(true);
    try {
      await api.publicSuggestion({
        description,
        typeSuggere,
        latitude: lat,
        longitude: lng,
        zoneId,
        pseudoCitoyen: pseudo || undefined,
      });
      setOk('Transmission reçue. La proposition sera traitée selon le circuit officiel.');
      setDescription('');
      setPseudo('');
      setLat(null);
      setLng(null);
      setPick(false);
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
              <small>Plateforme Anamboatra</small>
              <strong>Carte publique</strong>
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
              Seuls les dossiers publiés par le MTP figurent sur la carte. Complétez les champs ci-dessous et validez
              pour transmettre une proposition.
            </p>
          </section>

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
                <span className="qg-section-eyebrow">2 · Territoire</span>
                <div className="qg-section-titlerow">
                  <h3>Zone</h3>
                </div>
              </header>
              <label className="public-field-label">
                <span className="muted small">Zone</span>
                <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} required>
                  <option value="">Sélectionner…</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.nom} ({z.code})
                    </option>
                  ))}
                </select>
              </label>
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
        </aside>

        <section className="panel map-panel">
          <MapView
            geojson={features}
            viewerRole={null}
            compactUI
            height="100%"
            pickMode={pick}
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
