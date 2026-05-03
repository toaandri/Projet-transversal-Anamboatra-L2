const { Op } = require('sequelize');
const { StatusAudit, User } = require('../models/postgres');
const { StatutEnum, RoleEnum, TypeEnum, SpecialiteEnum } = require('../constants/enums');

async function logTransition(ticketId, ancien, nouveau, acteur) {
  await StatusAudit.create({
    ticketId,
    ancienStatut: ancien,
    nouveauStatut: nouveau,
    acteurUserId: acteur.userId,
    acteurRole: acteur.role,
    dateTransition: new Date(),
  });
}

function assertAssigned(mission, userId) {
  const ids = mission?.assignedUserIds;
  return Array.isArray(ids) && ids.includes(userId);
}

async function applyTicketPatch(ticket, body, actorUser) {
  const role = actorUser.role;
  const userId = actorUser.id;
  const next = body.statut;

  if (!next || next === ticket.statut) {
    return { ticket, changed: false };
  }

  const ancien = ticket.statut;

  if (role === RoleEnum.ADMIN_QG) {
    if (String(ticket.zoneId) !== String(actorUser.zoneId)) {
      throw new Error('Ticket hors de votre zone QG');
    }
    if (ticket.typeInfrastructure === TypeEnum.ELECTRICITE) {
      throw new Error('Périmètre JIRAMA : ce ticket ne peut pas être piloté depuis le QG.');
    }
    if (ancien === StatutEnum.EN_ATTENTE_CONFIRMATION && next === StatutEnum.REPARATION_PREVUE) {
      const equipeIds = body.equipeUserIds;
      if (!Array.isArray(equipeIds) || equipeIds.length === 0) {
        throw new Error('equipeUserIds requis pour affecter une équipe');
      }
      const jiramaAffectes = await User.count({
        where: {
          id: { [Op.in]: equipeIds },
          role: RoleEnum.EQUIPE_INTERVENTION,
          specialite: SpecialiteEnum.JIRAMA,
        },
      });
      if (jiramaAffectes > 0) {
        throw new Error("Les équipes JIRAMA ne peuvent pas être affectées depuis le QG.");
      }
      ticket.statut = StatutEnum.REPARATION_PREVUE;
      ticket.visiblePublic = true;
      ticket.dateConfirmation = new Date();
      const prev = ticket.mission || {};
      ticket.mission = {
        ...prev,
        assignedUserIds: equipeIds,
        dateAssignation: new Date(),
      };
    } else if (ancien === StatutEnum.TERMINE && next === StatutEnum.CLOTURE) {
      ticket.statut = StatutEnum.CLOTURE;
    } else {
      throw new Error('Transition non autorisée pour le QG');
    }
  } else if (role === RoleEnum.EQUIPE_INTERVENTION) {
    if (!assertAssigned(ticket.mission, userId)) {
      throw new Error('Mission non assignée à cette équipe');
    }
    if (ancien === StatutEnum.REPARATION_PREVUE && next === StatutEnum.EN_REPARATION) {
      ticket.statut = StatutEnum.EN_REPARATION;
      const m = { ...(ticket.mission || {}), dateDebut: new Date() };
      ticket.mission = m;
    } else if (ancien === StatutEnum.EN_REPARATION && next === StatutEnum.TERMINE) {
      if (!body.photoCloture) throw new Error('photoCloture requise pour clôturer');
      ticket.statut = StatutEnum.TERMINE;
      ticket.mission = {
        ...(ticket.mission || {}),
        photoCloture: body.photoCloture,
        dateFin: new Date(),
      };
    } else {
      throw new Error('Transition non autorisée pour l’équipe');
    }
  } else {
    throw new Error('Rôle non autorisé à modifier le statut');
  }

  await ticket.save();
  await logTransition(String(ticket.id), ancien, ticket.statut, { userId, role });
  return { ticket, changed: true, ancien };
}

module.exports = { applyTicketPatch };
