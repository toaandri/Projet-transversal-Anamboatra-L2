const { DataTypes } = require('sequelize');

function defineStatusAudit(sequelize) {
  return sequelize.define(
    'StatusAudit',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      ticketId: { type: DataTypes.UUID, allowNull: false, field: 'ticket_id' },
      ancienStatut: { type: DataTypes.STRING(64), allowNull: true, field: 'ancien_statut' },
      nouveauStatut: { type: DataTypes.STRING(64), allowNull: false, field: 'nouveau_statut' },
      acteurUserId: { type: DataTypes.UUID, allowNull: true, field: 'acteur_user_id' },
      acteurRole: { type: DataTypes.STRING(64), allowNull: true, field: 'acteur_role' },
      meta: { type: DataTypes.JSONB, allowNull: true },
      dateTransition: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'date_transition',
        defaultValue: DataTypes.NOW,
      },
    },
    { tableName: 'status_audits', underscored: true, timestamps: false },
  );
}

module.exports = { defineStatusAudit };
