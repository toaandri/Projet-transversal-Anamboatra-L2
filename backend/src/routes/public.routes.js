const express = require('express');
const { body, validationResult } = require('express-validator');
const { Ticket, SuggestionCitoyen, Zone } = require('../models/postgres');
const { buildMapPayload, publicTicketsInZoneWhere, publicTicketsNationalWhere } = require('../services/mapFilterService');
const { MapRole, TypeEnum } = require('../constants/enums');
const { mapScopeZoneIdFromQuery } = require('../utils/mapScopeZone');

const router = express.Router();

/** Liste des zones (sélection citoyenne pour suggestion géolocalisée). */
router.get('/zones', async (_req, res) => {
  const zones = await Zone.findAll({
    attributes: ['id', 'nom', 'type', 'code'],
    order: [['nom', 'ASC']],
  });
  return res.json({ zones });
});

/** Tickets « vitrine » nationaux ; `?zoneId=` restreint à une commune si besoin. */
router.get('/tickets', async (req, res) => {
  const mapScopeZoneId = mapScopeZoneIdFromQuery(req.query.zoneId);
  const tickets = await Ticket.findAll({
    where: mapScopeZoneId ? publicTicketsInZoneWhere(mapScopeZoneId) : publicTicketsNationalWhere(),
    order: [['updatedAt', 'DESC']],
  });
  return res.json({ tickets });
});

router.get('/map/tiles', async (_req, res) => {
  const payload = await buildMapPayload({ type: MapRole.PUBLIC });
  return res.json(payload);
});

router.post(
  '/suggestions',
  body('description').isString().isLength({ min: 3, max: 2000 }),
  body('typeSuggere').isIn(Object.values(TypeEnum)),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 }),
  body('zoneId').isUUID(),
  body('pseudoCitoyen').optional().isString().isLength({ max: 120 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const zone = await Zone.findByPk(req.body.zoneId);
    if (!zone) return res.status(400).json({ message: 'Zone invalide' });

    const doc = await SuggestionCitoyen.create({
      description: req.body.description,
      typeSuggere: req.body.typeSuggere,
      pseudoCitoyen: req.body.pseudoCitoyen,
      zoneId: zone.id,
      localisation: {
        latitude: req.body.latitude,
        longitude: req.body.longitude,
      },
      dateSoumission: new Date(),
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`zone:${zone.id}`).emit('suggestion:created', {
        id: String(doc.id),
        zoneId: zone.id,
      });
    }

    return res.status(201).json({ suggestion: doc });
  },
);

module.exports = router;
