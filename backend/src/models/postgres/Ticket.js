const { DataTypes } = require('sequelize');
const { StatutEnum, UrgenceEnum, TypeEnum } = require('../../constants/enums');

function defineTicket(sequelize) {
  return sequelize.define(
    'Ticket',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      description: { type: DataTypes.TEXT, allowNull: false },
      photoSignalement: { type: DataTypes.STRING(512), allowNull: false, field: 'photo_signalement' },
      urgence: { type: DataTypes.ENUM(...Object.values(UrgenceEnum)), allowNull: false },
      statut: {
        type: DataTypes.ENUM(...Object.values(StatutEnum)),
        allowNull: false,
        defaultValue: StatutEnum.EN_ATTENTE_CONFIRMATION,
      },
      typeInfrastructure: {
        type: DataTypes.ENUM(...Object.values(TypeEnum)),
        allowNull: false,
        field: 'type_infrastructure',
      },
      zoneId: { type: DataTypes.UUID, allowNull: false, field: 'zone_id' },
      localisation: { type: DataTypes.JSONB, allowNull: false },
      signalantUserId: { type: DataTypes.UUID, allowNull: false, field: 'signalant_user_id' },
      visiblePublic: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'visible_public' },
      dateSignalement: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'date_signalement',
        defaultValue: DataTypes.NOW,
      },
      dateConfirmation: { type: DataTypes.DATE, allowNull: true, field: 'date_confirmation' },
      mission: { type: DataTypes.JSONB, allowNull: true },
            originSuggestionId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'origin_suggestion_id',
      },
    },
    { tableName: 'tickets', underscored: true, timestamps: true },
  );
}

module.exports = { defineTicket };
