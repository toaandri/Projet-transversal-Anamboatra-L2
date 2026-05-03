const { DataTypes } = require('sequelize');
const { TypeEnum } = require('../../constants/enums');

function defineSuggestionCitoyen(sequelize) {
  return sequelize.define(
    'SuggestionCitoyen',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      description: { type: DataTypes.TEXT, allowNull: false },
      typeSuggere: {
        type: DataTypes.ENUM(...Object.values(TypeEnum)),
        allowNull: false,
        field: 'type_suggere',
      },
      dateSoumission: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'date_soumission',
        defaultValue: DataTypes.NOW,
      },
      pseudoCitoyen: { type: DataTypes.STRING(120), allowNull: true, field: 'pseudo_citoyen' },
      traitee: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      zoneId: { type: DataTypes.UUID, allowNull: false, field: 'zone_id' },
      localisation: { type: DataTypes.JSONB, allowNull: false },
      /** Ordre QG — agent désigné pour se rendre sur place avant signalement officiel. */
      assignedPatrolUserId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'assigned_patrol_user_id',
      },
      instructionQg: { type: DataTypes.STRING(512), allowNull: true, field: 'instruction_qg' },
      dispatchedAt: { type: DataTypes.DATE, allowNull: true, field: 'dispatched_at' },
      /** Clôture par l’agent sur le terrain (CDC v2 — traçabilité QG). */
      terrainClotureCode: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'terrain_cloture_code',
      },
      terrainClotureComment: {
        type: DataTypes.STRING(800),
        allowNull: true,
        field: 'terrain_cloture_comment',
      },
      terrainClotureParUserId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'terrain_cloture_par_user_id',
      },
      terrainClotureAt: { type: DataTypes.DATE, allowNull: true, field: 'terrain_cloture_at' },
    },
    { tableName: 'suggestion_citoyens', underscored: true, timestamps: true },
  );
}

module.exports = { defineSuggestionCitoyen };
