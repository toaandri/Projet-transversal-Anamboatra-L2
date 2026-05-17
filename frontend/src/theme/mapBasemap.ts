export type MapBasemapId = 'plan' | 'satellite';

export function googleMapTypeFromBasemap(id: MapBasemapId): 'roadmap' | 'hybrid' {
  return id === 'plan' ? 'roadmap' : 'hybrid';
}
