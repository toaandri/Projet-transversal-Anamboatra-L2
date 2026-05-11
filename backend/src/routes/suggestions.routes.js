const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { SuggestionCitoyen, User } = require('../models/postgres');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/requireRole');
const { RoleEnum, TerrainClotureCodeEnum } = require('../constants/enums');
const { suggestionsWhere, filterSuggestionsByZoneGeometry } = require('../services/mapFilterService');

const router = express.Router();

router.use(authenticate);
router.use(requireRole(RoleEnum.AGENT_PATROUILLE, RoleEnum.ADMIN_QG));

function serializeSuggestion(doc) {
  const s = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  return {
    ...s,
    id: String(s.id),
    zoneId: String(s.zoneId),
    assignedPatrolUserId: s.assignedPatrolUserId ? String(s.assignedPatrolUserId) : null,
  };
}

function canSeeSuggestion(auth, sug) {
  if (!auth?.zoneId || !sug) return false;
  if (sug.zoneId !== auth.zoneId) return false;
  return auth.role === RoleEnum.ADMIN_QG || auth.role === RoleEnum.AGENT_PATROUILLE;
}

router.get('/', async (req, res) => {
  const principal = {
    role: req.auth.role,
    zoneId: req.auth.zoneId,
    userId: req.auth.sub,
  };
  const q = suggestionsWhere(principal);
  if (!q) return res.json({ suggestions: [] });
  let suggestions = await SuggestionCitoyen.findAll({
    where: q,
    order: [['createdAt', 'DESC']],
    include: [
      {
        model: User,
        as: 'patrolAssignee',
        attributes: ['id', 'nom', 'prenom', 'matricule', 'role'],
      },
    ],
  });
  suggestions = await filterSuggestionsByZoneGeometry(principal, suggestions);
  return res.json({ suggestions: suggestions.map(serializeSuggestion) });
});

router.get('/:id', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const sug = await SuggestionCitoyen.findByPk(req.params.id, {
    include: [{ model: User, as: 'patrolAssignee', attributes: ['id', 'nom', 'prenom', 'matricule'] }],
  });
  if (!sug) return res.status(404).json({ message: 'Suggestion introuvable' });

  const auth = {
    zoneId: req.auth.zoneId,
    role: req.auth.role,
  };
  if (!canSeeSuggestion(auth, sug)) return res.status(403).json({ message: 'Accès refusé' });

  const principal = {
    role: req.auth.role,
    zoneId: req.auth.zoneId,
    userId: req.auth.sub,
  };
  const geoScoped = await filterSuggestionsByZoneGeometry(principal, [sug]);
  if (geoScoped.length === 0) {
    return res.status(403).json({ message: 'Suggestion hors du périmètre cartographique de votre zone.' });
  }

  return res.json({ suggestion: serializeSuggestion(sug) });
});

router.patch(
  '/:id/terrain-cloture',
  requireRole(RoleEnum.AGENT_PATROUILLE),
  param('id').isUUID(),
  body('code').isIn([
    TerrainClotureCodeEnum.NON_CONFORME,
    TerrainClotureCodeEnum.NON_REPERE,
    TerrainClotureCodeEnum.AUTRE,
  ]),
  body('comment').isString().trim().isLength({ min: 8, max: 800 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const zoneId = req.user.zoneId;
    if (!zoneId) return res.status(400).json({ message: 'Zone agent manquante.' });

    const sug = await SuggestionCitoyen.findOne({
      where: {
        id: req.params.id,
        zoneId,
        traitee: false,
      },
    });
    if (!sug) {
      return res.status(400).json({
        message: 'Suggestion introuvable dans votre zone ou déjà traitée.',
      });
    }

    const comment = req.body.comment.trim();
    const code = req.body.code;

    await sug.update({
      traitee: true,
      terrainClotureCode: code,
      terrainClotureComment: comment,
      terrainClotureParUserId: req.user.id,
      terrainClotureAt: new Date(),
    });

    const fresh = await SuggestionCitoyen.findByPk(sug.id, {
      include: [{ model: User, as: 'patrolAssignee', attributes: ['id', 'nom', 'prenom', 'matricule'] }],
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`zone:${zoneId}`).emit('suggestion:terrain-cloture', {
        id: String(sug.id),
        zoneId,
        code,
      });
    }

    return res.json({ suggestion: serializeSuggestion(fresh) });
  },
);

module.exports = router;
