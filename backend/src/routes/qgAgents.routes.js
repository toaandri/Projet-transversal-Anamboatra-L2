/**
 * CDC v2.3 — Gestion des AGENTS DE PATROUILLE par l'Admin QG.
 *
 * Routes protégées par JWT (authenticate) + requireRole(ADMIN_QG).
 * Le QG ne peut manipuler que ses agents de SA zone.
 *
 * Les équipes d'intervention hors spécialité JIRAMA sont gérées par l'Admin QG
 * (JIRAMA : compétence nationale — pas listées ni affectables depuis le QG).
 *
 * Actions :
 *   - GET    /api/qg/agents                     liste des AGENT_PATROUILLE de la zone
 *   - POST   /api/qg/agents                     crée un AGENT_PATROUILLE
 *   - PATCH  /api/qg/agents/:id                 met à jour identité / téléphone / matricule
 *   - PATCH  /api/qg/agents/:id/suspendre       actif = false  (libère le binding device)
 *   - PATCH  /api/qg/agents/:id/reactiver       actif = true
 *   - PATCH  /api/qg/agents/:id/reset-device    appareilUnique = null
 *   - DELETE /api/qg/agents/:id                 suppression (si aucun ticket signalé)
 */
const express = require('express');
const { Op } = require('sequelize');
const { body, param, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/requireRole');
const { User, Ticket } = require('../models/postgres');
const { hashPassword } = require('../utils/password');
const { RoleEnum, SpecialiteEnum } = require('../constants/enums');

const router = express.Router();

router.use(authenticate, requireRole(RoleEnum.ADMIN_QG));

function serializeAgent(u) {
  return {
    id: u.id,
    nom: u.nom,
    prenom: u.prenom,
    email: u.email,
    matricule: u.matricule,
    role: u.role,
    zoneId: u.zoneId,
    numeroTelephone: u.numeroTelephone,
    specialite: u.specialite, // toujours null pour un AGENT_PATROUILLE
    appareilLie: Boolean(u.appareilUnique),
    actif: u.actif,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

async function findPatrolInMyZone(id, zoneId) {
  return User.findOne({
    where: { id, zoneId, role: RoleEnum.AGENT_PATROUILLE },
  });
}

async function findRepairInMyZone(id, zoneId) {
  return User.findOne({
    where: { id, zoneId, role: RoleEnum.EQUIPE_INTERVENTION },
  });
}

function assertQgMayManageRepairAgent(agent) {
  if (!agent) return;
  if (agent.specialite === SpecialiteEnum.JIRAMA) {
    const err = new Error('Les équipes JIRAMA sont hors périmètre du QG.');
    err.status = 403;
    throw err;
  }
}

/* ------------------------------- List ----------------------------- */
router.get('/agents', async (req, res) => {
  if (!req.user.zoneId) {
    return res.status(400).json({ message: "Ce QG n'est rattaché à aucune zone" });
  }
  const agents = await User.findAll({
    where: { zoneId: req.user.zoneId, role: RoleEnum.AGENT_PATROUILLE },
    order: [['nom', 'ASC'], ['prenom', 'ASC']],
  });
  return res.json({ agents: agents.map(serializeAgent) });
});

/* ------------------------------ Create ---------------------------- */
router.post(
  '/agents',
  body('nom').isString().trim().isLength({ min: 2, max: 120 }),
  body('prenom').isString().trim().isLength({ min: 2, max: 120 }),
  body('email').isEmail(),
  body('password').isString().isLength({ min: 8, max: 200 }),
  body('numeroTelephone').isString().trim().isLength({ min: 4, max: 32 }),
  body('matricule').optional({ nullable: true }).isString().isLength({ max: 64 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (!req.user.zoneId) {
      return res.status(400).json({ message: "Ce QG n'est rattaché à aucune zone" });
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
      role: RoleEnum.AGENT_PATROUILLE,
      zoneId: req.user.zoneId, // secteur de l'agent = zone du QG
      numeroTelephone: req.body.numeroTelephone,
      specialite: null,
      actif: true,
    });

    return res.status(201).json({ agent: serializeAgent(agent) });
  },
);

/* ------------------------------ Update ---------------------------- */
router.patch(
  '/agents/:id',
  param('id').isUUID(),
  body('nom').optional().isString().trim().isLength({ min: 2, max: 120 }),
  body('prenom').optional().isString().trim().isLength({ min: 2, max: 120 }),
  body('numeroTelephone').optional().isString().trim().isLength({ min: 4, max: 32 }),
  body('matricule').optional({ nullable: true }).isString().isLength({ max: 64 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const agent = await findPatrolInMyZone(req.params.id, req.user.zoneId);
    if (!agent) return res.status(404).json({ message: 'Agent introuvable dans votre zone' });

    await agent.update({
      nom: req.body.nom ?? agent.nom,
      prenom: req.body.prenom ?? agent.prenom,
      numeroTelephone: req.body.numeroTelephone ?? agent.numeroTelephone,
      matricule: req.body.matricule !== undefined ? req.body.matricule : agent.matricule,
    });

    return res.json({ agent: serializeAgent(agent) });
  },
);

/* ---------------------------- Suspension -------------------------- */
router.patch('/agents/:id/suspendre', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const agent = await findPatrolInMyZone(req.params.id, req.user.zoneId);
  if (!agent) return res.status(404).json({ message: 'Agent introuvable dans votre zone' });

  await agent.update({ actif: false, appareilUnique: null });
  return res.json({ agent: serializeAgent(agent) });
});

router.patch('/agents/:id/reactiver', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const agent = await findPatrolInMyZone(req.params.id, req.user.zoneId);
  if (!agent) return res.status(404).json({ message: 'Agent introuvable dans votre zone' });

  await agent.update({ actif: true });
  return res.json({ agent: serializeAgent(agent) });
});

/* ------------------------- Reset device bind ---------------------- */
router.patch('/agents/:id/reset-device', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const agent = await findPatrolInMyZone(req.params.id, req.user.zoneId);
  if (!agent) return res.status(404).json({ message: 'Agent introuvable dans votre zone' });

  await agent.update({ appareilUnique: null });
  return res.json({ agent: serializeAgent(agent) });
});

/* ------------------------------ Delete ---------------------------- */
router.delete('/agents/:id', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const agent = await findPatrolInMyZone(req.params.id, req.user.zoneId);
  if (!agent) return res.status(404).json({ message: 'Agent introuvable dans votre zone' });

  const linked = await Ticket.count({ where: { signalantUserId: agent.id } });
  if (linked > 0) {
    return res.status(409).json({
      message: `Cet agent a signalé ${linked} ticket(s) : suspendez-le au lieu de le supprimer pour conserver l'historique.`,
    });
  }

  await agent.destroy();
  return res.json({ ok: true });
});

/* --------------------- Equipes d'intervention --------------------- */
function serializeRepair(u) {
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

router.get('/repair-agents', async (req, res) => {
  if (!req.user.zoneId) {
    return res.status(400).json({ message: "Ce QG n'est rattaché à aucune zone" });
  }
  const agents = await User.findAll({
    where: {
      zoneId: req.user.zoneId,
      role: RoleEnum.EQUIPE_INTERVENTION,
      specialite: { [Op.ne]: SpecialiteEnum.JIRAMA },
    },
    order: [['nom', 'ASC'], ['prenom', 'ASC']],
  });
  return res.json({ agents: agents.map(serializeRepair) });
});

router.post(
  '/repair-agents',
  body('nom').isString().trim().isLength({ min: 2, max: 120 }),
  body('prenom').isString().trim().isLength({ min: 2, max: 120 }),
  body('email').isEmail(),
  body('password').isString().isLength({ min: 8, max: 200 }),
  body('numeroTelephone').isString().trim().isLength({ min: 4, max: 32 }),
  body('matricule').optional({ nullable: true }).isString().isLength({ max: 64 }),
  body('specialite')
    .isIn([SpecialiteEnum.ROUTE, SpecialiteEnum.MACON, SpecialiteEnum.NETTOYEUR])
    .withMessage('specialite doit être ROUTE, MACON ou NETTOYEUR (JIRAMA : compétence nationale)'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (!req.user.zoneId) {
      return res.status(400).json({ message: "Ce QG n'est rattaché à aucune zone" });
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
      zoneId: req.user.zoneId,
      numeroTelephone: req.body.numeroTelephone,
      specialite: req.body.specialite,
      actif: true,
    });

    return res.status(201).json({ agent: serializeRepair(agent) });
  },
);

router.patch('/repair-agents/:id/suspendre', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const agent = await findRepairInMyZone(req.params.id, req.user.zoneId);
  if (!agent) return res.status(404).json({ message: 'Agent de réparation introuvable dans votre zone' });
  try {
    assertQgMayManageRepairAgent(agent);
  } catch (e) {
    return res.status(e.status || 403).json({ message: e.message });
  }

  await agent.update({ actif: false, appareilUnique: null });
  return res.json({ agent: serializeRepair(agent) });
});

router.patch('/repair-agents/:id/reactiver', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const agent = await findRepairInMyZone(req.params.id, req.user.zoneId);
  if (!agent) return res.status(404).json({ message: 'Agent de réparation introuvable dans votre zone' });
  try {
    assertQgMayManageRepairAgent(agent);
  } catch (e) {
    return res.status(e.status || 403).json({ message: e.message });
  }

  await agent.update({ actif: true });
  return res.json({ agent: serializeRepair(agent) });
});

router.delete('/repair-agents/:id', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const agent = await findRepairInMyZone(req.params.id, req.user.zoneId);
  if (!agent) return res.status(404).json({ message: 'Agent de réparation introuvable dans votre zone' });
  try {
    assertQgMayManageRepairAgent(agent);
  } catch (e) {
    return res.status(e.status || 403).json({ message: e.message });
  }

  await agent.destroy();
  return res.json({ ok: true });
});

module.exports = router;
