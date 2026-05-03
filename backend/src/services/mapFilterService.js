const { Op, literal } = require('sequelize');
const { sequelize } = require('../config/postgres');
const { Ticket, SuggestionCitoyen } = require('../models/postgres');
const { RoleEnum, StatutEnum, MapRole, TypeEnum } = require('../constants/enums');

const statutsPublics = [
  StatutEnum.REPARATION_PREVUE,
  StatutEnum.EN_REPARATION,
  StatutEnum.TERMINE,
  StatutEnum.CLOTURE,
];

/** Filtre Sequelize pour les tickets visibles selon le rôle (remplace l’ancien filtre Mongo). */
function ticketVisibilityWhere(principal) {
  if (!principal || principal.type === MapRole.PUBLIC || principal.role === RoleEnum.CITOYEN) {
    return {
      visiblePublic: true,
      statut: { [Op.in]: statutsPublics },
    };
  }

  const { role, zoneId, userId } = principal;

  if (role === RoleEnum.AGENT_PATROUILLE) {
    return {
      [Op.or]: [
        { zoneId, statut: StatutEnum.EN_ATTENTE_CONFIRMATION },
        { statut: { [Op.in]: statutsPublics } },
      ],
    };
  }

  if (role === RoleEnum.ADMIN_QG) {
    // Réseau « type JIRAMA » : hors compétence de la commune (pas de lecture opérationnelle).
    return {
      zoneId,
      typeInfrastructure: { [Op.ne]: TypeEnum.ELECTRICITE },
    };
  }

  if (role === RoleEnum.EQUIPE_INTERVENTION) {
    // Sequelize utilise le nom du modèle ("Ticket") comme alias, pas le nom
    // de table ("tickets") — il faut donc citer "Ticket"."mission".
    const assignedLiteral = literal(
      `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE("Ticket"."mission"->'assignedUserIds', '[]'::jsonb)) AS elem WHERE elem = ${sequelize.escape(userId)})`,
    );
    return {
      [Op.or]: [
        assignedLiteral,
        {
          zoneId,
          statut: { [Op.in]: statutsPublics },
        },
      ],
    };
  }

  return { id: { [Op.in]: [] } };
}

function suggestionsWhere(principal) {
  if (!principal || principal.type === MapRole.PUBLIC || principal.role === RoleEnum.CITOYEN) {
    return null;
  }
  if (principal.role === RoleEnum.EQUIPE_INTERVENTION) {
    return null;
  }
  if (principal.role === RoleEnum.AGENT_PATROUILLE) {
    return { zoneId: principal.zoneId, traitee: false };
  }
  if (principal.role === RoleEnum.ADMIN_QG) {
    return {
      zoneId: principal.zoneId,
      traitee: false,
      typeSuggere: { [Op.ne]: TypeEnum.ELECTRICITE },
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

async function buildMapPayload(principal) {
  const ticketWhere = ticketVisibilityWhere(principal);
  const tickets = await Ticket.findAll({
    where: ticketWhere,
    order: [['updatedAt', 'DESC']],
  });

  const sugWhere = suggestionsWhere(principal);
  const suggestions = sugWhere
    ? await SuggestionCitoyen.findAll({
        where: sugWhere,
        order: [['createdAt', 'DESC']],
      })
    : [];

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
};
