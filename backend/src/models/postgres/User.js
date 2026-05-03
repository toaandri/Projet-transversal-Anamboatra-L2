const { DataTypes } = require('sequelize');

function defineUser(sequelize) {
  return sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      nom: { type: DataTypes.STRING(120), allowNull: false },
      prenom: { type: DataTypes.STRING(120), allowNull: false },
      matricule: { type: DataTypes.STRING(64), allowNull: true, unique: true },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      motDePasseHash: { type: DataTypes.STRING(255), allowNull: false, field: 'mot_de_passe_hash' },
      role: {
        type: DataTypes.ENUM(
          'SUPER_ADMIN',
          'AGENT_PATROUILLE',
          'ADMIN_QG',
          'EQUIPE_INTERVENTION',
          'CITOYEN',
        ),
        allowNull: false,
      },
      // Commune pour ADMIN_QG/AGENT_PATROUILLE, dépôt pour EQUIPE_INTERVENTION,
      // NULL pour SUPER_ADMIN et CITOYEN.
      zoneId: { type: DataTypes.UUID, allowNull: true, field: 'zone_id' },
      // CDC v2.3 — profils opérationnels
      numeroTelephone: {
        type: DataTypes.STRING(32),
        allowNull: true,
        field: 'numero_telephone',
      },
      // Spécialité d'une EQUIPE_INTERVENTION (cf. SpecialiteEnum)
      specialite: {
        type: DataTypes.ENUM('ROUTE', 'JIRAMA', 'MACON', 'NETTOYEUR', 'REPARATEUR'),
        allowNull: true,
      },
      // Fingerprint terminal scellé au premier login (UNIQUE).
      // Bloque la copie des secrets de l'application sur un autre appareil.
      appareilUnique: {
        type: DataTypes.STRING(191),
        allowNull: true,
        unique: true,
        field: 'appareil_unique',
      },
      // FALSE = compte suspendu par le QG, libère le binding device.
      actif: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      positionLatitude: { type: DataTypes.DOUBLE, allowNull: true, field: 'position_latitude' },
      positionLongitude: { type: DataTypes.DOUBLE, allowNull: true, field: 'position_longitude' },
    },
    { tableName: 'users', underscored: true, timestamps: true },
  );
}

module.exports = { defineUser };
