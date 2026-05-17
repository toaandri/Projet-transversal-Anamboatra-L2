const { Op, literal } = require('sequelize');
const { sequelize } = require('../config/postgres');
const { Ticket, SuggestionCitoyen, Zone } = require('../models/postgres');
const { RoleEnum, StatutEnum, MapRole } = require('../constants/enums');
const { pointInPolygonLngLat, isValidCoordPair, toFiniteNumber } = require('../utils/geoPolygon');

const statutsPublics = Object.freeze([
  StatutEnum.REPARATION_PREVUE,
  StatutEnum.EN_REPARATION,
  StatutEnum.TERMINE,
  StatutEnum.CLOTURE,
]);
const statutsPublicsSet = Object.freeze(new Set(statutsPublics));

const ROLES_WITH_ZONE_ONLY_TICKET_VISIBILITY = Object.freeze(
  new Set([RoleEnum.AGENT_PATROUILLE, RoleEnum.ADMIN_QG]),
);

function publicTicketsNationalWhere() {
  return {
    visiblePublic: true,
    statut: { [Op.in]: Array.from(statutsPublicsSet) },
  };
}

function publicTicketsInZoneWhere(mapScopeZoneId) {
  if (!mapScopeZoneId) {
    return { id: { [Op.in]: [] } };
  }
  return {
    visiblePublic: true,
    statut: { [Op.in]: Array.from(statutsPublicsSet) },
    zoneId: mapScopeZoneId,
  };
}

function ticketVisibilityWhere(principal) {
  if (!principal || principal.type === MapRole.PUBLIC) {
    return publicTicketsNationalWhere();
  }

  if (principal.role === RoleEnum.CITOYEN) {
    return publicTicketsNationalWhere();
  }

  const { role, zoneId, userId } = principal;

  if (ROLES_WITH_ZONE_ONLY_TICKET_VISIBILITY.has(role)) {
    return { zoneId };
  }

  if (role === RoleEnum.EQUIPE_INTERVENTION) {
    if (!zoneId) {
      return { id: { [Op.in]: [] } };
    }
    const assignedLiteral = literal(
      `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE("Ticket"."mission"->'assignedUserIds', '[]'::jsonb)) AS elem WHERE elem = ${sequelize.escape(userId)})`,
    );
    return {
      [Op.and]: [{ zoneId }, assignedLiteral],
    };
  }

  return { id: { [Op.in]: [] } };
}

function suggestionsWhere(principal) {
  if (!principal || principal.type === MapRole.PUBLIC || principal.role === RoleEnum.CITOYEN) {
    return null;
  }
  if (ROLES_WITH_ZONE_ONLY_TICKET_VISIBILITY.has(principal.role)) {
    return { zoneId: principal.zoneId, traitee: false };
  }
  if (principal.role === RoleEnum.EQUIPE_INTERVENTION) {
    if (!principal.zoneId) return null;
    const uid = String(principal.userId);
    const needle = sequelize.escape(JSON.stringify([uid]));
    return {
      [Op.and]: [
        { zoneId: principal.zoneId, traitee: false },
        literal(`EXISTS (
          SELECT 1 FROM tickets AS t
          WHERE t.zone_id = "SuggestionCitoyen"."zone_id"
          AND COALESCE(t.mission->'assignedUserIds', '[]'::jsonb) @> ${needle}::jsonb
        )`),
      ],
    };
  }
  return null;
}

function layersMeta(principal) {
  const base = ['tickets'];
  if (suggestionsWhere(principal)) base.push('suggestions');
  if (principal?.role === RoleEnum.ADMIN_QG) base.push('zones', 'agents_mission');
  if (principal?.role === RoleEnum.AGENT_PATROUILLE) base.push('zones');
  if (principal?.type === MapRole.PUBLIC) base.push('public_readonly');
  return base;
}

async function zoneGeometryFilterFn(principal) {
  if (!principal || principal.type === MapRole.PUBLIC) return null;
  if (
    principal.role !== RoleEnum.ADMIN_QG &&
    principal.role !== RoleEnum.AGENT_PATROUILLE &&
    principal.role !== RoleEnum.EQUIPE_INTERVENTION
  ) {
    return null;
  }
  if (!principal.zoneId) return null;
  const zone = await Zone.findByPk(principal.zoneId, { attributes: ['geometrie'] });
  if (!zone || !zone.geometrie) return null;
  const g = zone.geometrie;
  if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') return null;
  return (lng, lat) => {
    const ln = toFiniteNumber(lng);
    const lt = toFiniteNumber(lat);
    if (!isValidCoordPair(ln, lt)) return false;
    return pointInPolygonLngLat(ln, lt, g);
  };
}

async function filterTicketsByZoneGeometry(principal, ticketList) {
  const fn = await zoneGeometryFilterFn(principal);
  if (!fn) return ticketList;
  return ticketList.filter((t) => {
    const loc = t.localisation || {};
    return fn(loc.longitude, loc.latitude);
  });
}

async function filterSuggestionsByZoneGeometry(principal, suggestionList) {
  const fn = await zoneGeometryFilterFn(principal);
  if (!fn) return suggestionList;
  return suggestionList.filter((s) => {
    const loc = s.localisation || {};
    return fn(loc.longitude, loc.latitude);
  });
}

async function buildMapPayload(principal) {
  const ticketWhere = ticketVisibilityWhere(principal);
  let tickets = await Ticket.findAll({
    where: ticketWhere,
    order: [['updatedAt', 'DESC']],
  });

  const sugWhere = suggestionsWhere(principal);
  let suggestions = sugWhere
    ? await SuggestionCitoyen.findAll({
        where: sugWhere,
        order: [['createdAt', 'DESC']],
      })
    : [];

  const geoFn = await zoneGeometryFilterFn(principal);
  if (geoFn) {
    tickets = tickets.filter((t) => {
      const loc = t.localisation || {};
      return geoFn(loc.longitude, loc.latitude);
    });
    suggestions = suggestions.filter((s) => {
      const loc = s.localisation || {};
      return geoFn(loc.longitude, loc.latitude);
    });
  }

  const ticketFeatures = tickets.map((t) => {
    const loc = t.localisation || {};
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [loc.longitude, loc.latitude],
      },
      properties: {
        id: String(t.id),
        kind: 'ticket',
        statut: t.statut,
        urgence: t.urgence,
        typeInfrastructure: t.typeInfrastructure,
        zoneId: t.zoneId,
        visiblePublic: t.visiblePublic,
        dateSignalement: t.dateSignalement,
        description: t.description,
        photoSignalement: t.photoSignalement,
        photoCloture: t.mission?.photoCloture || null,
      },
    };
  });

  const suggestionFeatures = suggestions.map((s) => {
    const loc = s.localisation || {};
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [loc.longitude, loc.latitude],
      },
      properties: {
        id: String(s.id),
        kind: 'suggestion',
        typeSuggere: s.typeSuggere,
        dateSoumission: s.dateSoumission,
        assignedPatrolUserId: s.assignedPatrolUserId ? String(s.assignedPatrolUserId) : null,
        dispatched: Boolean(s.assignedPatrolUserId && s.dispatchedAt),
        photoCitoyen: s.photoCitoyen || null,
      },
    };
  });

  return {
    layers: layersMeta(principal),
    geojson: {
      type: 'FeatureCollection',
      features: [...ticketFeatures, ...suggestionFeatures],
    },
  };
}

module.exports = {
  buildMapPayload,
  ticketVisibilityWhere,
  suggestionsWhere,
  publicTicketsInZoneWhere,
  publicTicketsNationalWhere,
  filterTicketsByZoneGeometry,
  filterSuggestionsByZoneGeometry,
};
