
function enumValueSet(enumObject) {
  return Object.freeze(new Set(Object.values(enumObject)));
}

const RoleEnum = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
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

const TypeEnum = Object.freeze({
  ROUTE: 'ROUTE',
    ELECTRICITE_EAU: 'ELECTRICITE_EAU',
  PROPRIETE_PUBLIQUE: 'PROPRIETE_PUBLIQUE',
    SALUBRITE: 'SALUBRITE',
});

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
  DEPOT_REPARATION: 'DEPOT_REPARATION',
});

const MapRole = Object.freeze({
  PUBLIC: 'PUBLIC',
});

const TerrainClotureCodeEnum = Object.freeze({
  OFFICIAL_TICKET: 'OFFICIAL_TICKET',
    FAUSSE_ALERTE: 'FAUSSE_ALERTE',
    NON_CONFORME: 'NON_CONFORME',
  NON_REPERE: 'NON_REPERE',
  AUTRE: 'AUTRE',
});

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
