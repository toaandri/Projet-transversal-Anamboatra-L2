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
    },
    { tableName: 'suggestion_citoyens', underscored: true, timestamps: true },
  );
}

module.exports = { defineSuggestionCitoyen };
