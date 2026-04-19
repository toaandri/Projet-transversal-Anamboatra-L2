const express = require('express');
const { SuggestionCitoyen } = require('../models/postgres');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/requireRole');
const { RoleEnum } = require('../constants/enums');
const { suggestionsWhere } = require('../services/mapFilterService');

const router = express.Router();

router.use(authenticate);
router.use(requireRole(RoleEnum.AGENT_PATROUILLE, RoleEnum.ADMIN_QG));

router.get('/', async (req, res) => {
  const principal = {
    role: req.auth.role,
    zoneId: req.auth.zoneId,
    userId: req.auth.sub,
  };
  const q = suggestionsWhere(principal);
  if (!q) return res.json({ suggestions: [] });
  const suggestions = await SuggestionCitoyen.findAll({
    where: q,
    order: [['createdAt', 'DESC']],
  });
  return res.json({ suggestions });
});

module.exports = router;
