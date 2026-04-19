/**
 * CDC v2.3 — base vide + compte SUPER_ADMIN unique.
 *
 * Ce script est idempotent : il (re)crée le compte super-admin si besoin
 * mais n'amorce aucune zone ni aucun autre utilisateur. Toute la configuration
 * du territoire (zones, dépôts, agents de réparation, admins QG) se fait
 * ensuite depuis la Console super-admin côté front.
 *
 * Compte amorcé :
 *   email     : admin@anamboatra.mg
 *   mot passe : admin1234
 *
 * Exécuter :  npm run seed
 */
require('dotenv').config();

const { connectPostgres } = require('../config/postgres');
const { syncPostgres, User, sequelize } = require('../models/postgres');
const { hashPassword } = require('../utils/password');
const { RoleEnum } = require('../constants/enums');

const SUPER_ADMIN = Object.freeze({
  email: 'admin@anamboatra.mg',
  password: 'admin1234',
  nom: 'Administrateur',
  prenom: 'Système',
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
    // On ne réinitialise PAS le mot de passe si le compte existe déjà,
    // pour ne pas écraser un mot de passe changé en prod. On s'assure
    // simplement que le compte reste actif et bien rôle SUPER_ADMIN.
    await admin.update({
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
