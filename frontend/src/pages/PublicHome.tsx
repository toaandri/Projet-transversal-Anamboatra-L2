import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../useAuth';
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
  { v: 'ELECTRICITE', l: 'Electricite', color: TYPE_COLORS.ELECTRICITE },
  { v: 'EAU', l: 'Eau', color: TYPE_COLORS.EAU },
];

export function PublicHome() {
  const { user } = useAuth();
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
  const [sideOpen, setSideOpen] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.publicMapTiles();
      setFeatures(data.geojson.features as GeoJsonFeature[]);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur carte');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useMapSocket(load);

  useEffect(() => {
    void (async () => {
      try {
        const { zones: z } = await api.publicZones();
        setZones(z);
        setZoneId((prev) => (prev ? prev : z[0]?.id ?? ''));
      } catch { /* ignore */ }
    })();
  }, []);

  async function submitSuggestion(e: React.FormEvent) {
    e.preventDefault();
    setOk(null);
    setErr(null);
    if (lat === null || lng === null) { setErr('Indiquez un point sur la carte.'); return; }
    if (!zoneId) { setErr('Choisissez une zone.'); return; }
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
      setOk('Suggestion envoyee. Merci.');
      setDescription('');
      setPseudo('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  /* ---- styles inline partagés ---- */
  const card: React.CSSProperties = {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  };
  const eyebrow: React.CSSProperties = {
    fontSize: 9,
    letterSpacing: '1.4px',
    fontWeight: 700,
    textTransform: 'uppercase',
    color: 'var(--muted)',
  };
  const fieldStyle: React.CSSProperties = {
    background: 'var(--bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 14,
    width: '100%',
    outline: 'none',
    fontFamily: 'inherit',
  };

  return (
    <div className="page dashboard">
      <header className="topbar">
        <div className="brand">
          <span className="logo" />
          <div>
            <strong>Anamboatra Maps</strong>
            <div className="muted small">Portail public</div>
          </div>
        </div>
        <nav className="nav">
          {user ? (
            <Link to="/app" className="btn btn-ghost">Espace connecte</Link>
          ) : (
            <Link to="/connexion" className="btn btn-primary">Connexion</Link>
          )}
        </nav>
      </header>

      <div className="top-actions">
        <Link to="/" className="btn btn-ghost">Accueil</Link>
        {user ? (
          <Link to="/app" className="btn btn-ghost">Espace connecte</Link>
        ) : (
          <Link to="/connexion" className="btn btn-ghost">Connexion</Link>
        )}
      </div>

      <div className={`dash-grid${sideOpen ? '' : ' side-closed'}`}>
        <button
          type="button"
          className="side-toggle"
          onClick={() => setSideOpen((o) => !o)}
          aria-label={sideOpen ? 'Reduire le panneau' : 'Afficher le panneau'}
        >
          {sideOpen ? '\u2039' : '\u203a'}
        </button>

        <section className="panel map-panel">
          <MapView
            geojson={features}
            viewerRole={null}
            height="100%"
            pickMode={pick}
            onPickLatLng={(la, ln) => { setLat(la); setLng(ln); }}
          />
        </section>

        {/* ---- Panneau lateral harmonise avec le mobile ---- */}
        <aside className="panel side" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden' }}>

          {/* En-tete identite */}
          <div style={{
            padding: '14px 18px 12px',
            background: 'var(--panel)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'var(--panel)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {/* Mini drapeau Madagascar */}
              <div style={{ width: 22, height: 16, borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid rgba(0,0,0,0.08)' }}>
                <div style={{ flex: 1, background: '#ffffff' }} />
                <div style={{ flex: 1, background: '#c8102e' }} />
                <div style={{ flex: 1, background: '#007e3a' }} />
              </div>
            </div>
            <div>
              <div style={eyebrow}>Republique de Madagascar</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Anamboatra Maps</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Carte publique</div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div>
              <div style={{ ...eyebrow, marginBottom: 4 }}>Carte des travaux visibles</div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                Les signalements en attente ne sont pas affiches. Proposez une anomalie geolocalisee ci-dessous.
              </p>
            </div>

            {err ? (
              <div style={{ background: 'var(--redSoft)', color: 'var(--red)', border: '1px solid #f5c6cb', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{err}</div>
            ) : null}
            {ok ? (
              <div style={{ background: 'var(--accentSoft)', color: 'var(--accent2)', border: '1px solid var(--borderStrong)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{ok}</div>
            ) : null}

            <form onSubmit={submitSuggestion} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Etape 1 — Type chips */}
              <div style={card}>
                <div style={eyebrow}>Etape 1</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                  Type d'infrastructure
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {TYPES.map((t) => {
                    const sel = typeSuggere === t.v;
                    return (
                      <button
                        key={t.v}
                        type="button"
                        onClick={() => setTypeSuggere(t.v)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '7px 14px', borderRadius: 999,
                          border: `1.5px solid ${sel ? t.color : 'var(--border)'}`,
                          background: sel ? t.color : 'var(--panel)',
                          color: sel ? '#fff' : 'var(--textSoft)',
                          fontWeight: sel ? 700 : 500, fontSize: 13, cursor: 'pointer',
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: sel ? '#fff' : t.color, flexShrink: 0 }} />
                        {t.l}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Etape 2 — Zone */}
              <div style={card}>
                <div style={eyebrow}>Etape 2 — Zone concernee</div>
                <select
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  required
                  style={fieldStyle}
                >
                  <option value="">-- Choisissez une zone --</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>{z.nom} ({z.code})</option>
                  ))}
                </select>
              </div>

              {/* Etape 3 — Description */}
              <div style={card}>
                <div style={eyebrow}>Etape 3 — Description</div>
                <textarea
                  required
                  minLength={3}
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Decrivez le probleme observe..."
                  style={{ ...fieldStyle, resize: 'vertical', minHeight: 100 }}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{description.length}/2000</div>
              </div>

              {/* Etape 4 — Pseudo */}
              <div style={card}>
                <div style={eyebrow}>Etape 4 — Pseudo (optionnel)</div>
                <input
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value)}
                  maxLength={120}
                  placeholder="Citoyen anonyme"
                  style={fieldStyle}
                />
              </div>

              {/* Etape 5 — Localisation */}
              <div style={card}>
                <div style={eyebrow}>Etape 5 — Position sur la carte</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 5,
                    background: lat !== null ? 'var(--ok)' : 'var(--muted)', flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                      {lat !== null && lng !== null
                        ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                        : 'Aucun point selectionne'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {lat !== null
                        ? 'Position valide.'
                        : 'Activez le mode placement puis cliquez la carte.'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPick((p) => !p)}
                  style={{
                    background: pick ? 'var(--accent)' : 'var(--bg)',
                    color: pick ? '#fff' : 'var(--textSoft)',
                    border: `1px solid ${pick ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 8, padding: '9px 14px', fontSize: 13,
                    fontWeight: 600, cursor: 'pointer', width: '100%',
                  }}
                >
                  {pick ? 'Placement actif -- cliquez la carte' : 'Choisir le point sur la carte'}
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  background: submitting ? 'var(--borderStrong)' : 'var(--accent)',
                  color: '#fff', border: 'none', borderRadius: 12,
                  padding: '13px 0', fontSize: 15, fontWeight: 800,
                  cursor: submitting ? 'default' : 'pointer', letterSpacing: '0.3px',
                  boxShadow: submitting ? 'none' : '0 4px 14px rgba(0,126,58,0.28)',
                  width: '100%',
                }}
              >
                {submitting ? 'Envoi...' : 'Envoyer la suggestion'}
              </button>

            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
