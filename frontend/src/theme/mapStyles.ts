export const ANAMBOATRA_MAP_STYLE: google.maps.MapTypeStyle[] = [

  { featureType: 'poi.business', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.sports_complex', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.attraction', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.place_of_worship', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.government', elementType: 'all', stylers: [{ visibility: 'off' }] },

  { featureType: 'poi', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'all', stylers: [{ visibility: 'on' }] },

  { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'on' }] },

  { featureType: 'administrative.neighborhood', elementType: 'labels', stylers: [{ visibility: 'on' }] },
  { featureType: 'administrative.locality', elementType: 'labels', stylers: [{ visibility: 'on' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.province', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.country', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },

  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'on' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'on' }] },

  { featureType: 'landscape.man_made', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
];
