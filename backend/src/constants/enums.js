/** Aligné sur le cahier des charges v2.3 (base vide + super-admin) */

/**
 * @template T
 * @param {Readonly<Record<string, T>>} enumObject
 * @returns {ReadonlySet<T>}
 */
function enumValueSet(enumObject) {
  return Object.freeze(new Set(Object.values(enumObject)));
}

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
  /** Réseaux électricité et eau regroupés (ex-JIRAMA / hydrants). */
  ELECTRICITE_EAU: 'ELECTRICITE_EAU',
  PROPRIETE_PUBLIQUE: 'PROPRIETE_PUBLIQUE',
  /** Salubrité, déchets, propreté urbaine. */
  SALUBRITE: 'SALUBRITE',
});

/** Spécialité d'une EQUIPE_INTERVENTION (indépendante de TypeEnum depuis v2.3). */
const SpecialiteEnum = Object.freeze({
  ROUTE: 'ROUTE',
  JIRAMA: 'JIRAMA',
  MACON: 'MACON',
  NETTOYEUR: 'NETTOYEUR',
  REPARATEUR: 'REPARATEUR',
});

const TypeZoneEnum = Object.freeze({
  ARRONDISSEMENT: 'ARRONDISSEMENT',
  ROUTE_NATIONALE: 'ROUTE_NATIONALE',
  DEPOT_REPARATION: 'DEPOT_REPARATION', // garage / point de départ des équipes
});

const MapRole = Object.freeze({
  PUBLIC: 'PUBLIC',
});

/** Clôture terrain (agent) — traçabilité CDC v2 / retour QG. */
const TerrainClotureCodeEnum = Object.freeze({
  OFFICIAL_TICKET: 'OFFICIAL_TICKET',
  /** @deprecated gardé pour anciennes lignes BD ; nouveau terrain : NON_CONFORME */
  FAUSSE_ALERTE: 'FAUSSE_ALERTE',
  /** Remplit le cas « scam / tromperie » côté patrouille. */
  NON_CONFORME: 'NON_CONFORME',
  NON_REPERE: 'NON_REPERE',
  AUTRE: 'AUTRE',
});

/** Appartenance O(1) pour validateurs / parsing (mêmes valeurs que les ENUM Sequelize). */
const RoleEnumValueSet = enumValueSet(RoleEnum);
const UrgenceEnumValueSet = enumValueSet(UrgenceEnum);
const StatutEnumValueSet = enumValueSet(StatutEnum);
const TypeEnumValueSet = enumValueSet(TypeEnum);
const SpecialiteEnumValueSet = enumValueSet(SpecialiteEnum);
const TypeZoneEnumValueSet = enumValueSet(TypeZoneEnum);
const TerrainClotureCodeEnumValueSet = enumValueSet(TerrainClotureCodeEnum);

module.exports = {
  RoleEnum,
  UrgenceEnum,
  StatutEnum,
  TypeEnum,
  SpecialiteEnum,
  TypeZoneEnum,
  MapRole,
  TerrainClotureCodeEnum,
  RoleEnumValueSet,
  UrgenceEnumValueSet,
  StatutEnumValueSet,
  TypeEnumValueSet,
  SpecialiteEnumValueSet,
  TypeZoneEnumValueSet,
  TerrainClotureCodeEnumValueSet,
};
