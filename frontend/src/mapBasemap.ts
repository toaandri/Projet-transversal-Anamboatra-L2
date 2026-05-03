/**
 * Deux fonds : plan (vectoriel) et satellite (imagerie + étiquettes filtrées via style).
 * Le mode « satellite » utilise `hybrid` pour afficher routes, quartiers et transit sur l’image.
 */
export type MapBasemapId = 'plan' | 'satellite';

export function googleMapTypeFromBasemap(id: MapBasemapId): 'roadmap' | 'hybrid' {
  return id === 'plan' ? 'roadmap' : 'hybrid';
}
