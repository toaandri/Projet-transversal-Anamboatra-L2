/**
 * CDC v2.3 — Console super-admin.
 *
 * Accès : compte SUPER_ADMIN (JWT) OU jeton X-Admin-Token (legacy).
 * Cf. middleware/requireAdminAccess.js.
 *
 * Scope :
 *   - CRUD zones (arrondissement / route nationale / dépôt de réparation)
 *     avec géométrie GeoJSON tracée sur la carte.
 *   - CRUD admins QG rattachés à une zone de commune.
 *   - CRUD agents de réparation (EQUIPE_INTERVENTION) rattachés à un dépôt,
 *     avec spécialité (ROUTE / JIRAMA / MACON / NETTOYEUR), suspension,
 *     réinitialisation de l'appareil lié, suppression.
 *
 * La création des AGENT_PATROUILLE reste à la main de chaque Admin QG depuis
 * son dashboard (cf. qgAgents.routes.js).
 */
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { requireAdminAccess } = require('../middleware/requireAdminAccess');
const { Zone, User, Ticket } = require('../models/postgres');
const { hashPassword } = require('../utils/password');
const {
  RoleEnum,
  TypeZoneEnum,
  SpecialiteEnum,
} = require('../constants/enums');

const router = express.Router();

router.use(requireAdminAccess);

/* --------------------------- Serializers -------------------------- */
function serializeZone(z) {
  return {
    id: z.id,
    nom: z.nom,
    type: z.type,
    code: z.code,
    numeroQg: z.numeroQg,
    geometrie: z.geometrie,
    createdAt: z.createdAt,
    updatedAt: z.updatedAt,
  };
}

function serializeUser(u) {
  return {
    id: u.id,
    nom: u.nom,
    prenom: u.prenom,
    email: u.email,
    matricule: u.matricule,
    role: u.role,
    zoneId: u.zoneId,
    numeroTelephone: u.numeroTelephone,
    specialite: u.specialite,
    appareilLie: Boolean(u.appareilUnique),
    actif: u.actif,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

/* ----------------------------- Health ----------------------------- */
router.get('/ping', (req, res) => {
  res.json({ ok: true, scope: 'admin-console', via: req.adminAuth?.via || null });
});

/* ------------------------------ Zones ----------------------------- */
router.get('/zones', async (_req, res) => {
  const zones = await Zone.findAll({ order: [['code', 'ASC']] });
  return res.json({ zones: zones.map(serializeZone) });
});

router.post(
  '/zones',
  body('nom').isString().trim().isLength({ min: 2, max: 255 }),
  body('type').isIn(Object.values(TypeZoneEnum)),
  body('code').isString().trim().isLength({ min: 2, max: 64 }),
  body('numeroQg').optional({ nullable: true }).isString().isLength({ max: 32 }),
  body('geometrie').optional({ nullable: true }).custom((v) => v === null || typeof v === 'object'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const existing = await Zone.findOne({ where: { code: req.body.code } });
    if (existing) return res.status(409).json({ message: 'Ce code zone existe déjà' });

    const zone = await Zone.create({
      nom: req.body.nom,
      type: req.body.type,
      code: req.body.code,
      numeroQg: req.body.numeroQg ?? null,
      geometrie: req.body.geometrie ?? null,
    });
    return res.status(201).json({ zone: serializeZone(zone) });
  },
);

router.patch(
  '/zones/:id',
  param('id').isUUID(),
  body('nom').optional().isString().trim().isLength({ min: 2, max: 255 }),
  body('type').optional().isIn(Object.values(TypeZoneEnum)),
  body('code').optional().isString().trim().isLength({ min: 2, max: 64 }),
  body('numeroQg').optional({ nullable: true }).isString().isLength({ max: 32 }),
  body('geometrie').optional({ nullable: true }).custom((v) => v === null || typeof v === 'object'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const zone = await Zone.findByPk(req.params.id);
    if (!zone) return res.status(404).json({ message: 'Zone introuvable' });

    if (req.body.code && req.body.code !== zone.code) {
      const dup = await Zone.findOne({ where: { code: req.body.code } });
      if (dup) return res.status(409).json({ message: 'Ce code zone existe déjà' });
    }

    await zone.update({
      nom: req.body.nom ?? zone.nom,
      type: req.body.type ?? zone.type,
      code: req.body.code ?? zone.code,
      numeroQg: req.body.numeroQg !== undefined ? req.body.numeroQg : zone.numeroQg,
      geometrie: req.body.geometrie !== undefined ? req.body.geometrie : zone.geometrie,
    });
    return res.json({ zone: serializeZone(zone) });
  },
);

router.delete('/zones/:id', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const zone = await Zone.findByPk(req.params.id);
  if (!zone) return res.status(404).json({ message: 'Zone introuvable' });

  const linked = await User.count({ where: { zoneId: zone.id } });
  if (linked > 0) {
    return res.status(409).json({
      message: `Zone liée à ${linked} utilisateur(s). Réaffectez ou supprimez-les d'abord.`,
    });
  }

  await zone.destroy();
  return res.json({ ok: true });
});

/* ---------------------------- Admins QG --------------------------- */
router.get('/qg-admins', async (_req, res) => {
  const admins = await User.findAll({
    where: { role: RoleEnum.ADMIN_QG },
    order: [['email', 'ASC']],
  });
  return res.json({ admins: admins.map(serializeUser) });
});

router.post(
  '/qg-admins',
  body('zoneId').isUUID().withMessage('zoneId UUID requis'),
  body('nom').isString().trim().isLength({ min: 2, max: 120 }),
  body('prenom').isString().trim().isLength({ min: 2, max: 120 }),
  body('email').isEmail(),
  body('password').isString().isLength({ min: 8, max: 200 }),
  body('numeroTelephone').isString().trim().isLength({ min: 4, max: 32 }),
  body('matricule').optional({ nullable: true }).isString().isLength({ max: 64 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const zone = await Zone.findByPk(req.body.zoneId);
    if (!zone) return res.status(404).json({ message: 'Zone introuvable' });
    if (zone.type === TypeZoneEnum.DEPOT_REPARATION) {
      return res.status(400).json({
        message: "Un Admin QG ne peut pas être rattaché à un dépôt de réparation.",
      });
    }

    const dup = await User.findOne({ where: { email: req.body.email } });
    if (dup) return res.status(409).json({ message: 'Cet email est déjà utilisé' });

    const hash = await hashPassword(req.body.password);
    const admin = await User.create({
      nom: req.body.nom,
      prenom: req.body.prenom,
      email: req.body.email,
      motDePasseHash: hash,
      role: RoleEnum.ADMIN_QG,
      zoneId: zone.id,
      numeroTelephone: req.body.numeroTelephone,
      matricule: req.body.matricule ?? null,
      specialite: null,
      actif: true,
    });
    return res.status(201).json({ admin: serializeUser(admin) });
  },
);

/* ---------------------- Agents de réparation ---------------------- */
/* (EQUIPE_INTERVENTION rattaché à un DEPOT_REPARATION, avec spécialité) */
router.use('/agents', (_req, res) => {
  return res.status(403).json({
    message:
      "La gestion des équipes de réparation est désormais déléguée aux communes (ADMIN_QG).",
  });
});

async function findRepairAgent(id) {
  return User.findOne({
    where: { id, role: RoleEnum.EQUIPE_INTERVENTION },
  });
}

router.get('/agents', async (_req, res) => {
  const agents = await User.findAll({
    where: { role: RoleEnum.EQUIPE_INTERVENTION },
    order: [['nom', 'ASC'], ['prenom', 'ASC']],
  });
  return res.json({ agents: agents.map(serializeUser) });
});

router.post(
  '/agents',
  body('zoneId').isUUID().withMessage('zoneId (dépôt) requis'),
  body('nom').isString().trim().isLength({ min: 2, max: 120 }),
  body('prenom').isString().trim().isLength({ min: 2, max: 120 }),
  body('email').isEmail(),
  body('password').isString().isLength({ min: 8, max: 200 }),
  body('numeroTelephone').isString().trim().isLength({ min: 4, max: 32 }),
  body('matricule').optional({ nullable: true }).isString().isLength({ max: 64 }),
  body('specialite')
    .isIn(Object.values(SpecialiteEnum))
    .withMessage('specialite doit être ROUTE, JIRAMA, MACON ou NETTOYEUR'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const depot = await Zone.findByPk(req.body.zoneId);
    if (!depot) return res.status(404).json({ message: 'Dépôt introuvable' });
    if (depot.type !== TypeZoneEnum.DEPOT_REPARATION) {
      return res.status(400).json({
        message: "L'agent de réparation doit être rattaché à un DEPOT_REPARATION.",
      });
    }

    const dup = await User.findOne({ where: { email: req.body.email } });
    if (dup) return res.status(409).json({ message: 'Cet email est déjà utilisé' });

    const hash = await hashPassword(req.body.password);
    const agent = await User.create({
      nom: req.body.nom,
      prenom: req.body.prenom,
      email: req.body.email,
      matricule: req.body.matricule ?? null,
      motDePasseHash: hash,
      role: RoleEnum.EQUIPE_INTERVENTION,
      zoneId: depot.id,
      numeroTelephone: req.body.numeroTelephone,
      specialite: req.body.specialite,
      actif: true,
    });

    return res.status(201).json({ agent: serializeUser(agent) });
  },
);

router.patch(
  '/agents/:id',
  param('id').isUUID(),
  body('nom').optional().isString().trim().isLength({ min: 2, max: 120 }),
  body('prenom').optional().isString().trim().isLength({ min: 2, max: 120 }),
  body('numeroTelephone').optional().isString().trim().isLength({ min: 4, max: 32 }),
  body('matricule').optional({ nullable: true }).isString().isLength({ max: 64 }),
  body('specialite').optional().isIn(Object.values(SpecialiteEnum)),
  body('zoneId').optional({ nullable: false }).isUUID(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const agent = await findRepairAgent(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent de réparation introuvable' });

    let zoneId = agent.zoneId;
    if (req.body.zoneId && req.body.zoneId !== agent.zoneId) {
      const depot = await Zone.findByPk(req.body.zoneId);
      if (!depot) return res.status(404).json({ message: 'Dépôt introuvable' });
      if (depot.type !== TypeZoneEnum.DEPOT_REPARATION) {
        return res.status(400).json({
          message: "L'agent de réparation ne peut être rattaché qu'à un DEPOT_REPARATION.",
        });
      }
      zoneId = depot.id;
    }

    await agent.update({
      nom: req.body.nom ?? agent.nom,
      prenom: req.body.prenom ?? agent.prenom,
      numeroTelephone: req.body.numeroTelephone ?? agent.numeroTelephone,
      matricule: req.body.matricule !== undefined ? req.body.matricule : agent.matricule,
      specialite: req.body.specialite ?? agent.specialite,
      zoneId,
    });

    return res.json({ agent: serializeUser(agent) });
  },
);

router.patch('/agents/:id/suspendre', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const agent = await findRepairAgent(req.params.id);
  if (!agent) return res.status(404).json({ message: 'Agent de réparation introuvable' });

  await agent.update({ actif: false, appareilUnique: null });
  return res.json({ agent: serializeUser(agent) });
});

router.patch('/agents/:id/reactiver', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const agent = await findRepairAgent(req.params.id);
  if (!agent) return res.status(404).json({ message: 'Agent de réparation introuvable' });

  await agent.update({ actif: true });
  return res.json({ agent: serializeUser(agent) });
});

router.patch('/agents/:id/reset-device', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const agent = await findRepairAgent(req.params.id);
  if (!agent) return res.status(404).json({ message: 'Agent de réparation introuvable' });

  await agent.update({ appareilUnique: null });
  return res.json({ agent: serializeUser(agent) });
});

router.delete('/agents/:id', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const agent = await findRepairAgent(req.params.id);
  if (!agent) return res.status(404).json({ message: 'Agent de réparation introuvable' });

  // Les équipes sont pointées par assignedUserIds dans Ticket.mission (JSONB).
  // On bloque la suppression si le compte est assigné à une mission en cours.
  const activeMission = await Ticket.findOne({
    where: {
      statut: { [Op.in]: ['REPARATION_PREVUE', 'EN_REPARATION'] },
      // on ne peut pas requêter un id dans un JSONB array sans opérateur dédié —
      // ce filtrage-là est tenté best-effort en JS
    },
  });
  if (activeMission) {
    const ids = activeMission.mission?.assignedUserIds || [];
    if (Array.isArray(ids) && ids.includes(agent.id)) {
      return res.status(409).json({
        message:
          "Cet agent est encore assigné à une mission active. Réaffectez-la ou suspendez le compte.",
      });
    }
  }

  await agent.destroy();
  return res.json({ ok: true });
});

module.exports = router;
