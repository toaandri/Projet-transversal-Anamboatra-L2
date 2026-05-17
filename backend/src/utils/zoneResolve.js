const { TypeZoneEnum } = require('../constants/enums');
const { pointInPolygonLngLat, toFiniteNumber } = require('./geoPolygon');

function ringAreaSq(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return Infinity;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a / 2);
}

function geometryAreaSq(geometry) {
  if (!geometry || typeof geometry !== 'object') return Infinity;
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates?.[0])) {
    return ringAreaSq(geometry.coordinates[0]);
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.reduce((sum, poly) => {
      const outer = poly?.[0];
      return sum + (outer ? ringAreaSq(outer) : 0);
    }, 0);
  }
  return Infinity;
}

async function findArrondissementZoneForCoordinates(Zone, lng, lat) {
  const ln = toFiniteNumber(lng);
  const lt = toFiniteNumber(lat);
  if (ln === null || lt === null) return null;

  const zones = await Zone.findAll({
    where: { type: TypeZoneEnum.ARRONDISSEMENT },
    attributes: ['id', 'nom', 'code', 'geometrie'],
  });

  const matches = [];
  for (const z of zones) {
    const g = z.geometrie;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    if (pointInPolygonLngLat(ln, lt, g)) matches.push(z);
  }
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  matches.sort((a, b) => geometryAreaSq(a.geometrie) - geometryAreaSq(b.geometrie));
  return matches[0];
}

module.exports = { findArrondissementZoneForCoordinates, geometryAreaSq };
