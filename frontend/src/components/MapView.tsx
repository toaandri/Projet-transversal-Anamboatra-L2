import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, MapPin } from 'lucide-react';
import {
  APIProvider,
  Map,
  Marker,
  InfoWindow,
  Polygon,
  useMap,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import { ANAMBOATRA_MAP_STYLE } from '../mapStyles';
import type {
  GeoJsonFeature,
  GeoJsonPolygon,
  Role,
  Statut,
  TypeInfrastructure,
  Urgence,
  Zone,
} from '../types';
import { STATUT_LABELS, ticketMarkerStyle, suggestionMarkerStyle } from '../mapColors';

const STATUT_COLORS: Record<Statut, string> = {
  EN_ATTENTE_CONFIRMATION: '#dc2626',
  REPARATION_PREVUE: '#f97316',
  EN_REPARATION: '#3b82f6',
  TERMINE: '#22c55e',
  CLOTURE: '#16a34a',
};

const TYPE_COLORS: Record<TypeInfrastructure, string> = {
  ROUTE: '#64748b',
  ELECTRICITE: '#f59e0b',
  EAU: '#0ea5e9',
};

const TYPE_LABELS: Record<TypeInfrastructure, string> = {
  ROUTE: 'Route',
  ELECTRICITE: 'Électricité',
  EAU: 'Eau',
};

const TANA = { lat: -18.8792, lng: 47.5079 };

const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const mapId = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || '').trim() || undefined;

type Props = {
  geojson: GeoJsonFeature[];
  viewerRole: Role | null;
  onSelectFeature?: (feature: GeoJsonFeature) => void;
  pickMode?: boolean;
  onPickLatLng?: (lat: number, lng: number) => void;
  height?: string;
  /** Zone d'action du viewer (commune QG, dépôt, etc.). Affichée en surbrillance. */
  myZone?: Zone | null;
};

type FeatureProps = {
  id?: string;
  kind?: string;
  statut?: Statut;
  urgence?: Urgence;
  typeInfrastructure?: TypeInfrastructure;
  typeSuggere?: TypeInfrastructure;
  description?: string;
  photoSignalement?: string;
  dateSignalement?: string;
  dateSoumission?: string;
};

function propsOf(f: GeoJsonFeature): FeatureProps {
  return f.properties as FeatureProps;
}

function svgIconForFeature(p: FeatureProps, viewerRole: Role | null) {
  const isSug = p.kind === 'suggestion';
  const style = isSug
    ? suggestionMarkerStyle()
    : ticketMarkerStyle(
        (p.statut || 'EN_ATTENTE_CONFIRMATION') as Statut,
        (p.urgence || 'NORMAL') as Urgence,
        viewerRole,
      );

  const fill = style.fillColor;
  const stroke = style.color;
  const radius = isSug ? 9 : 11;
  const size = (radius + 4) * 2;
  const center = size / 2;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${center}" cy="${center}" r="${radius + 2}" fill="white" opacity="0.95"/>
  <circle cx="${center}" cy="${center}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
</svg>`;

  if (typeof window === 'undefined' || !window.google?.maps) return undefined;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(size, size),
    anchor: new window.google.maps.Point(center, center),
  } as google.maps.Icon;
}

function MissingKey() {
  return (
    <div className="map-missing">
      <div>
        <strong>Clé Google Maps manquante</strong>
        <p className="muted small">
          Ajoutez <code>VITE_GOOGLE_MAPS_API_KEY</code> dans <code>frontend/.env.local</code>, puis redémarrez{' '}
          <code>npm run dev</code>.
        </p>
        <p className="muted small">
          Console&nbsp;:{' '}
          <a href="https://console.cloud.google.com/google/maps-apis" target="_blank" rel="noreferrer">
            console.cloud.google.com/google/maps-apis
          </a>{' '}
          — activer « Maps JavaScript API ».
        </p>
      </div>
    </div>
  );
}

export function MapView({
  geojson,
  viewerRole,
  onSelectFeature,
  pickMode,
  onPickLatLng,
  height = 'min(72vh, 640px)',
  myZone,
}: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const zonePaths = useMemo(() => zoneToPaths(myZone?.geometrie), [myZone]);
  const zoneCenter = useMemo(() => (zonePaths ? centroidOfPaths(zonePaths) : null), [zonePaths]);

  const features = useMemo(
    () =>
      geojson
        .map((f, idx) => ({ f, idx }))
        .filter(
          (x) => Array.isArray(x.f.geometry?.coordinates) && (x.f.geometry.coordinates as unknown[]).length === 2,
        ),
    [geojson],
  );

  const onMapClick = useCallback(
    (e: MapMouseEvent) => {
      if (!pickMode || !onPickLatLng) return;
      const ll = e.detail.latLng;
      if (ll) onPickLatLng(ll.lat, ll.lng);
    },
    [pickMode, onPickLatLng],
  );

  if (!apiKey) {
    return (
      <div className="map-wrap" style={{ height, borderRadius: 12, overflow: 'hidden' }}>
        <MissingKey />
      </div>
    );
  }

  const selected = selectedIdx !== null ? features.find((x) => x.idx === selectedIdx) ?? null : null;

  return (
    <div
      className={`map-wrap${pickMode ? ' pick-mode' : ''}`}
      style={{ height, borderRadius: 12, overflow: 'hidden', position: 'relative' }}
    >
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={TANA}
          defaultZoom={12}
          mapId={mapId}
          defaultMapTypeId="hybrid"
          styles={mapId ? undefined : ANAMBOATRA_MAP_STYLE}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapTypeControl
          mapTypeControlOptions={{ mapTypeIds: ['hybrid', 'roadmap'] }}
          zoomControl
          streetViewControl
          fullscreenControl
          scaleControl
          rotateControl
          clickableIcons={!pickMode}
          onClick={onMapClick}
          style={{ width: '100%', height: '100%' }}
        >
          {zonePaths ? (
            <>
              {/* Halo extérieur (style "spotlight" doux pour bien faire ressortir) */}
              <Polygon
                paths={zonePaths}
                strokeColor="#ffffff"
                strokeOpacity={0.85}
                strokeWeight={4}
                fillColor="#007e3a"
                fillOpacity={0.06}
                clickable={false}
                zIndex={1}
              />
              {/* Liseré principal Anamboatra (vert) */}
              <Polygon
                paths={zonePaths}
                strokeColor="#007e3a"
                strokeOpacity={0.95}
                strokeWeight={2.5}
                fillColor="#007e3a"
                fillOpacity={0.08}
                clickable={false}
                zIndex={2}
              />
            </>
          ) : null}

          {zoneCenter ? (
            <Marker
              position={zoneCenter}
              icon={zoneCenterIcon()}
              title={myZone?.nom || 'Ma zone'}
              clickable={false}
              zIndex={50}
            />
          ) : null}

          {features.map(({ f, idx }) => {
            const [lng, lat] = f.geometry.coordinates;
            const p = propsOf(f);
            const icon = svgIconForFeature(p, viewerRole);
            return (
              <Marker
                key={`${p.kind || 'pt'}-${p.id || idx}`}
                position={{ lat, lng }}
                icon={icon}
                onClick={() => {
                  setSelectedIdx(idx);
                  if (pickMode && onPickLatLng) onPickLatLng(lat, lng);
                  onSelectFeature?.(f);
                }}
              />
            );
          })}

          {selected ? (
            <InfoWindow
              position={{
                lat: selected.f.geometry.coordinates[1],
                lng: selected.f.geometry.coordinates[0],
              }}
              pixelOffset={[0, -18]}
              headerDisabled
              maxWidth={340}
              onCloseClick={() => setSelectedIdx(null)}
            >
              <FeaturePopup
                feature={selected.f}
                onClose={() => setSelectedIdx(null)}
                onOpenDetail={() => {
                  onSelectFeature?.(selected.f);
                  setSelectedIdx(null);
                }}
              />
            </InfoWindow>
          ) : null}
        </Map>

        <ZoneFocus zone={myZone || null} paths={zonePaths} />
      </APIProvider>
      {pickMode ? <div className="pick-banner">Cliquez sur la carte pour placer le point</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------
 * Sous-composants & helpers : zone du QG (polygone, fitBounds,
 * marqueur central, bouton "Recentrer sur ma commune").
 * --------------------------------------------------------*/

type LatLng = { lat: number; lng: number };

function zoneToPaths(geo?: GeoJsonPolygon | { type: string; coordinates?: unknown } | null): LatLng[][] | null {
  if (!geo || geo.type !== 'Polygon') return null;
  const coords = (geo as GeoJsonPolygon).coordinates;
  if (!Array.isArray(coords) || coords.length === 0) return null;
  const rings: LatLng[][] = [];
  for (const ring of coords) {
    if (!Array.isArray(ring)) continue;
    const points: LatLng[] = [];
    for (const pt of ring) {
      if (Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
        points.push({ lat: pt[1], lng: pt[0] });
      }
    }
    if (points.length >= 3) rings.push(points);
  }
  return rings.length ? rings : null;
}

function centroidOfPaths(paths: LatLng[][]): LatLng | null {
  const ring = paths[0];
  if (!ring || ring.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const p of ring) {
    sx += p.lng;
    sy += p.lat;
  }
  return { lat: sy / ring.length, lng: sx / ring.length };
}

function zoneCenterIcon(): google.maps.Icon | undefined {
  if (typeof window === 'undefined' || !window.google?.maps) return undefined;
  const size = 44;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#007e3a" stop-opacity="0.32"/>
      <stop offset="60%" stop-color="#007e3a" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#007e3a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="url(#g)"/>
  <g transform="translate(${size / 2 - 11} ${size / 2 - 14})">
    <path d="M11 0 C5 0 0 4.5 0 11 c0 8 11 17 11 17 s11 -9 11 -17 C22 4.5 17 0 11 0 z"
          fill="#c8102e" stroke="#ffffff" stroke-width="2"/>
    <circle cx="11" cy="11" r="4" fill="#ffffff"/>
  </g>
</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(size, size),
    anchor: new window.google.maps.Point(size / 2, size - 8),
  };
}

function ZoneFocus({ zone, paths }: { zone: Zone | null; paths: LatLng[][] | null }) {
  const map = useMap();
  const fittedRef = useRef<string | null>(null);

  const fit = useCallback(() => {
    if (!map || !paths) return;
    const bounds = new window.google.maps.LatLngBounds();
    for (const ring of paths) {
      for (const p of ring) bounds.extend(p);
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 80);
    }
  }, [map, paths]);

  // Recentre automatiquement la première fois que la zone change.
  useEffect(() => {
    if (!map || !paths || !zone) return;
    if (fittedRef.current === zone.id) return;
    fittedRef.current = zone.id;
    fit();
  }, [map, paths, zone, fit]);

  if (!zone || !paths) return null;

  return (
    <button
      type="button"
      className="map-zone-recenter"
      onClick={fit}
      title={`Recentrer sur ${zone.nom}`}
    >
      <span className="map-zone-recenter-icon" aria-hidden="true">⌖</span>
      <span className="map-zone-recenter-label">
        <small>Ma commune</small>
        <strong>{zone.nom}</strong>
      </span>
    </button>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatRelative(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (!d) return '';
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 30) return `il y a ${j} j`;
  return formatDate(iso);
}

function useReverseGeocode(lat: number, lng: number) {
  const [label, setLabel] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    if (typeof window === 'undefined' || !window.google?.maps?.Geocoder) return;
    const geo = new window.google.maps.Geocoder();
    geo.geocode({ location: { lat, lng } }, (results, status) => {
      if (cancelled || status !== 'OK' || !results || !results.length) return;
      const r = results.find((x) => x.types.includes('route')) || results[0];
      const parts: string[] = [];
      const comps = r.address_components;
      const route = comps.find((c) => c.types.includes('route'));
      const sub = comps.find((c) => c.types.includes('sublocality') || c.types.includes('neighborhood'));
      const loc = comps.find((c) => c.types.includes('locality'));
      if (route) parts.push(route.long_name);
      if (sub) parts.push(sub.long_name);
      else if (loc) parts.push(loc.long_name);
      setLabel(parts.length ? parts.join(' · ') : r.formatted_address.split(',').slice(0, 2).join(','));
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);
  return label;
}

function FeaturePopup({
  feature,
  onClose,
  onOpenDetail,
}: {
  feature: GeoJsonFeature;
  onClose: () => void;
  onOpenDetail: () => void;
}) {
  const p = propsOf(feature);
  const [lng, lat] = feature.geometry.coordinates;
  const situation = useReverseGeocode(lat, lng);

  if (p.kind === 'suggestion') {
    return (
      <div className="anam-popup anam-popup--suggestion">
        <div className="anam-popup-stripe" aria-hidden="true" />
        <button type="button" className="anam-popup-close" onClick={onClose} aria-label="Fermer">
          ×
        </button>
        <div className="anam-popup-body">
          <div className="anam-popup-eyebrow">
            <span className="anam-popup-dot" style={{ background: '#a855f7' }} />
            Suggestion citoyenne
          </div>
          <div className="anam-popup-title">
            {p.typeSuggere ? TYPE_LABELS[p.typeSuggere] : 'Type non précisé'}
          </div>
          {situation ? (
            <div className="anam-popup-situation">
              <MapPin size={11} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
              {situation}
            </div>
          ) : null}
          <div className="anam-popup-meta">
            <span>Lat {lat.toFixed(5)}</span>
            <span>Lng {lng.toFixed(5)}</span>
            {p.dateSoumission ? <span>{formatRelative(p.dateSoumission)}</span> : null}
          </div>
        </div>
        <div className="anam-popup-foot">
          <span className="anam-popup-brand">Anamboatra · Maps</span>
        </div>
      </div>
    );
  }

  const statut = (p.statut || 'EN_ATTENTE_CONFIRMATION') as Statut;
  const statutColor = STATUT_COLORS[statut];
  const typeColor = p.typeInfrastructure ? TYPE_COLORS[p.typeInfrastructure] : '#64748b';
  const typeLabel = p.typeInfrastructure ? TYPE_LABELS[p.typeInfrastructure] : 'Inconnu';

  return (
    <div className="anam-popup anam-popup--ticket">
      <div className="anam-popup-stripe" aria-hidden="true" />
      <button type="button" className="anam-popup-close" onClick={onClose} aria-label="Fermer">
        ×
      </button>

      {p.photoSignalement ? (
        <a
          href={p.photoSignalement}
          target="_blank"
          rel="noreferrer"
          className="anam-popup-photo"
          style={{ backgroundImage: `url(${p.photoSignalement})` }}
        >
          <span className="anam-popup-photo-shade" />
          <span className="anam-popup-photo-badge">
            <span className="anam-popup-dot" style={{ background: statutColor }} />
            {STATUT_LABELS[statut]}
          </span>
          {p.urgence === 'URGENT' ? <span className="anam-popup-photo-urgent">URGENT</span> : null}
        </a>
      ) : (
        <div className="anam-popup-photo anam-popup-photo--placeholder">
          <span className="anam-popup-photo-badge">
            <span className="anam-popup-dot" style={{ background: statutColor }} />
            {STATUT_LABELS[statut]}
          </span>
          {p.urgence === 'URGENT' ? <span className="anam-popup-photo-urgent">URGENT</span> : null}
        </div>
      )}

      <div className="anam-popup-body">
        <div className="anam-popup-eyebrow">
          <span className="anam-popup-pin" aria-hidden="true">
            <span className="anam-popup-pin-dot" style={{ background: typeColor }} />
          </span>
          Signalement · {typeLabel}
        </div>

        <div className="anam-popup-situation">
          <MapPin size={11} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
          {situation ? situation : `Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)}`}
        </div>

        {p.description ? (
          <p className="anam-popup-desc">« {p.description} »</p>
        ) : (
          <p className="anam-popup-desc anam-popup-desc--empty">Aucune description fournie.</p>
        )}

        <div className="anam-popup-meta">
          {p.dateSignalement ? (
            <span title={formatDate(p.dateSignalement)}>
              <Clock size={11} strokeWidth={2.2} style={{ flexShrink: 0 }} />
              {formatRelative(p.dateSignalement)}
            </span>
          ) : null}
          <span>#{(p.id || '').slice(0, 6).toUpperCase()}</span>
        </div>
      </div>

      <div className="anam-popup-foot">
        <span className="anam-popup-brand">
          <span className="anam-popup-flag" aria-hidden="true">
            <span /><span /><span />
          </span>
          Anamboatra Maps
        </span>
        <button type="button" className="anam-popup-action" onClick={onOpenDetail}>
          Ouvrir le détail →
        </button>
      </div>
    </div>
  );
}
