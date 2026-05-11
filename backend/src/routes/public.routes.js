const express = require('express');
const { Ticket, SuggestionCitoyen, Zone } = require('../models/postgres');
const { buildMapPayload, publicTicketsInZoneWhere, publicTicketsNationalWhere } = require('../services/mapFilterService');
const { MapRole, TypeEnumValueSet } = require('../constants/enums');
const { mapScopeZoneIdFromQuery } = require('../utils/mapScopeZone');
const { uploadPhoto, publicUrlForStoredFile } = require('../utils/photoUpload');
const { findArrondissementZoneForCoordinates } = require('../utils/zoneResolve');

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

router.post('/suggestions', (req, res, next) => {
  uploadPhoto.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Fichier image invalide' });
    next();
  });
}, async (req, res) => {
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  if (description.length < 3 || description.length > 2000) {
    return res.status(400).json({ message: 'Description : entre 3 et 2000 caractères.' });
  }

  const typeSuggere = req.body.typeSuggere;
  if (!TypeEnumValueSet.has(typeSuggere)) {
    return res.status(400).json({ message: "Type d'infrastructure invalide." });
  }

  const lat = Number(req.body.latitude);
  const lng = Number(req.body.longitude);
  if (
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return res.status(400).json({ message: 'Coordonnées géographiques invalides.' });
  }

  let pseudoCitoyen = null;
  if (typeof req.body.pseudoCitoyen === 'string' && req.body.pseudoCitoyen.trim()) {
    pseudoCitoyen = req.body.pseudoCitoyen.trim().slice(0, 120);
  }

  const zone = await findArrondissementZoneForCoordinates(Zone, lng, lat);
  if (!zone) {
    return res.status(400).json({
      message:
        'Aucune commune ne correspond à l’emplacement indiqué (périmètre non couvert ou carte imprécise). Déplacez le point dans votre commune ou contactez votre mairie.',
    });
  }

  let photoCitoyen = null;
  if (req.file) {
    photoCitoyen = publicUrlForStoredFile(req.file.filename);
  }

  const doc = await SuggestionCitoyen.create({
    description,
    typeSuggere,
    pseudoCitoyen,
    zoneId: zone.id,
    localisation: { latitude: lat, longitude: lng },
    dateSoumission: new Date(),
    photoCitoyen,
  });

  const io = req.app.get('io');
  if (io) {
    io.to(`zone:${zone.id}`).emit('suggestion:created', {
      id: String(doc.id),
      zoneId: zone.id,
    });
  }

  return res.status(201).json({
    suggestion: doc,
    zoneAttribution: { id: zone.id, nom: zone.nom, code: zone.code },
  });
});

module.exports = router;
