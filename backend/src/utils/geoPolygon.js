
function pointInRingLngLat(lng, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoords(lng, lat, polygonCoords) {
  if (!polygonCoords || !polygonCoords[0]) return false;
  const outer = polygonCoords[0];
  if (!pointInRingLngLat(lng, lat, outer)) return false;
  for (let i = 1; i < polygonCoords.length; i++) {
    if (pointInRingLngLat(lng, lat, polygonCoords[i])) return false;
  }
  return true;
}

function pointInPolygonLngLat(lng, lat, geometry) {
  if (!geometry || typeof geometry !== 'object') return true;
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    return pointInPolygonCoords(lng, lat, geometry.coordinates);
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    for (const polygonCoords of geometry.coordinates) {
      if (pointInPolygonCoords(lng, lat, polygonCoords)) return true;
    }
    return false;
  }
  return true;
}

function isValidCoordPair(lng, lat) {
  return (
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    typeof lat === 'number' &&
    Number.isFinite(lat)
  );
}

function toFiniteNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

module.exports = {
  pointInPolygonLngLat,
  isValidCoordPair,
  toFiniteNumber,
};
