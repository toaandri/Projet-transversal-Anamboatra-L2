/**
 * Style carte Anamboatra : réduire le bruit POI tout en gardant rues, quartiers,
 * transports (bus…) et quelques repères utiles (eau, parcs).
 *
 * S’applique aux fonds roadmap et hybrid/satellite (**sans `mapId`**).
 * Avec `VITE_GOOGLE_MAPS_MAP_ID`, configurez l’équivalent dans Google Cloud.
 */
export const ANAMBOATRA_MAP_STYLE: google.maps.MapTypeStyle[] = [
  // --- POI à masquer (restaurants, hôpitaux, écoles, etc.) ---
  { featureType: 'poi.business', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.sports_complex', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.attraction', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.place_of_worship', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.government', elementType: 'all', stylers: [{ visibility: 'off' }] },

  // Autres POI résiduels (hors parcs) : masquer le picto / point
  { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'all', stylers: [{ visibility: 'on' }] },

  // --- Transports : arrêts bus, gares, lignes ---
  { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'on' }] },

  // --- Quartiers + communes ---
  { featureType: 'administrative.neighborhood', elementType: 'labels', stylers: [{ visibility: 'on' }] },
  { featureType: 'administrative.locality', elementType: 'labels', stylers: [{ visibility: 'on' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.province', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.country', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },

  // --- Routes : noms visibles, pictos d’autoroute allégés ---
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'on' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  // --- Eau (repère géographique) ---
  { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'on' }] },

  // --- Paysage : moins d’étiquettes artificielles ---
  { featureType: 'landscape.man_made', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
];
