const { DataTypes } = require('sequelize');

function defineZone(sequelize) {
  return sequelize.define(
    'Zone',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      nom: { type: DataTypes.STRING(255), allowNull: false },
      type: {

        type: DataTypes.ENUM('ARRONDISSEMENT', 'ROUTE_NATIONALE', 'DEPOT_REPARATION'),
        allowNull: false,
      },
      code: { type: DataTypes.STRING(64), allowNull: false, unique: true },

      numeroQg: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'numero_qg',
      },
      geometrie: { type: DataTypes.JSONB, allowNull: true },
    },
    { tableName: 'zones', underscored: true, timestamps: true },
  );
}

module.exports = { defineZone };
