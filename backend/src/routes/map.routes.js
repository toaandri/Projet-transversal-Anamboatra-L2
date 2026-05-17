const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { optionalAuth } = require('../middleware/optionalAuth');
const { buildMapPayload } = require('../services/mapFilterService');
const { MapRole } = require('../constants/enums');

const router = express.Router();

router.get('/tiles', authenticate, async (req, res) => {
  const principal = {
    role: req.auth.role,
    zoneId: req.auth.zoneId,
    userId: req.auth.sub,
  };
  try {
    const payload = await buildMapPayload(principal);
    return res.json(payload);
  } catch (e) {
    console.error('[GET /map/tiles]', e);
    return res.status(500).json({ message: e.message || 'Erreur serveur' });
  }
});

router.get('/tiles-optional', optionalAuth, async (req, res) => {
  const principal = req.auth
    ? { role: req.auth.role, zoneId: req.auth.zoneId, userId: req.auth.sub }
    : { type: MapRole.PUBLIC };
  try {
    const payload = await buildMapPayload(principal);
    return res.json(payload);
  } catch (e) {
    console.error('[GET /map/tiles-optional]', e);
    return res.status(500).json({ message: e.message || 'Erreur serveur' });
  }
});

module.exports = router;
