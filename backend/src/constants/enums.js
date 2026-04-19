/** Aligné sur le cahier des charges v2.3 (base vide + super-admin) */

const RoleEnum = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN', // compte technique unique (hors UML)
  AGENT_PATROUILLE: 'AGENT_PATROUILLE',
  ADMIN_QG: 'ADMIN_QG',
  EQUIPE_INTERVENTION: 'EQUIPE_INTERVENTION',
  CITOYEN: 'CITOYEN',
});

const UrgenceEnum = Object.freeze({
  NORMAL: 'NORMAL',
  URGENT: 'URGENT',
});

const StatutEnum = Object.freeze({
  EN_ATTENTE_CONFIRMATION: 'EN_ATTENTE_CONFIRMATION',
  REPARATION_PREVUE: 'REPARATION_PREVUE',
  EN_REPARATION: 'EN_REPARATION',
  TERMINE: 'TERMINE',
  CLOTURE: 'CLOTURE',
});

/** Types d'infrastructure remontés par citoyens / agents (ticket / suggestion). */
const TypeEnum = Object.freeze({
  ROUTE: 'ROUTE',
  ELECTRICITE: 'ELECTRICITE',
  EAU: 'EAU',
});

/** Spécialité d'une EQUIPE_INTERVENTION (indépendante de TypeEnum depuis v2.3). */
const SpecialiteEnum = Object.freeze({
  ROUTE: 'ROUTE',
  JIRAMA: 'JIRAMA',
  MACON: 'MACON',
  NETTOYEUR: 'NETTOYEUR',
});

const TypeZoneEnum = Object.freeze({
  ARRONDISSEMENT: 'ARRONDISSEMENT',
  ROUTE_NATIONALE: 'ROUTE_NATIONALE',
  DEPOT_REPARATION: 'DEPOT_REPARATION', // garage / point de départ des équipes
});

const MapRole = Object.freeze({
  PUBLIC: 'PUBLIC',
});

module.exports = {
  RoleEnum,
  UrgenceEnum,
  StatutEnum,
  TypeEnum,
  SpecialiteEnum,
  TypeZoneEnum,
  MapRole,
};
