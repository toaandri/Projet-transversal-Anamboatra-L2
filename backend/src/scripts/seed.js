require('dotenv').config();

const { connectPostgres } = require('../config/postgres');
const { syncPostgres, User, sequelize } = require('../models/postgres');
const { hashPassword } = require('../utils/password');
const { RoleEnum } = require('../constants/enums');

const SUPER_ADMIN = Object.freeze({
  email: 'admin@anamboatra.mg',
  password: 'admin1234',
  nom: 'MTP national',
  prenom: 'Admin',
});

async function seed() {
  await connectPostgres();
  await syncPostgres();

  const hash = await hashPassword(SUPER_ADMIN.password);

  const [admin, created] = await User.findOrCreate({
    where: { email: SUPER_ADMIN.email },
    defaults: {
      nom: SUPER_ADMIN.nom,
      prenom: SUPER_ADMIN.prenom,
      email: SUPER_ADMIN.email,
      motDePasseHash: hash,
      role: RoleEnum.SUPER_ADMIN,
      zoneId: null,
      numeroTelephone: null,
      specialite: null,
      actif: true,
    },
  });

  if (!created) {

    await admin.update({
      nom: SUPER_ADMIN.nom,
      prenom: SUPER_ADMIN.prenom,
      role: RoleEnum.SUPER_ADMIN,
      actif: true,
    });
  }

  console.log('Seed terminé.');
  console.log(`  - Compte super-admin : ${SUPER_ADMIN.email}`);
  if (created) {
    console.log(`  - Mot de passe initial : ${SUPER_ADMIN.password}`);
  } else {
    console.log('  - (compte déjà présent, mot de passe inchangé)');
  }
  console.log('Toutes les autres données (zones, dépôts, agents, admins QG)');
  console.log("se créent via la Console super-admin après connexion.");

  await sequelize.close();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
