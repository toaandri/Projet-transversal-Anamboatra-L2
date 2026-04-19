/**
 * Style « Anamboatra » : on masque tout ce qui encombre (POI, commerces, parcs,
 * écoles, hôpitaux, transports, paysages…) mais on garde les **villes** et les
 * **noms de rues / routes**, indispensables pour situer un signalement.
 *
 * Note : ce tableau n’est appliqué qu’aux cartes RASTER (sans mapId).
 * Si vous définissez `VITE_GOOGLE_MAPS_MAP_ID`, configurez le style depuis la
 * console Google Cloud (« Map Styles »).
 */
export const ANAMBOATRA_MAP_STYLE: google.maps.MapTypeStyle[] = [
  // 1) Masquer toutes les icônes de POI (commerces, hôtels, attractions, etc.)
  { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'off' }] },

  // 2) Masquer aussi les paysages « parc » et autres remplissages décoratifs
  { featureType: 'landscape.man_made', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  // 3) Masquer le réseau de transport (gares, métro, bus, lignes…)
  { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'off' }] },

  // 4) Masquer les frontières administratives autres que les villes
  { featureType: 'administrative.country', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.province', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  // 5) GARDER : labels de villes (administrative.locality)
  { featureType: 'administrative.locality', elementType: 'labels', stylers: [{ visibility: 'on' }] },

  // 6) GARDER : noms de routes / rues (tous niveaux)
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'on' }] },

  // 7) Masquer les icônes (numéros d’autoroute, panneaux) qui encombrent au zoom élevé
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];
