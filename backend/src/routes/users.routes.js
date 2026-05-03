const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/authenticate');
const { User, Zone } = require('../models/postgres');
const { Op } = require('sequelize');
const { RoleEnum, SpecialiteEnum } = require('../constants/enums');

const router = express.Router();

router.use(authenticate);

router.get('/me', async (req, res) => {
  const u = req.user;
  return res.json({
    user: {
      id: u.id,
      email: u.email,
      nom: u.nom,
      prenom: u.prenom,
      role: u.role,
      zoneId: u.zoneId,
      positionLatitude: u.positionLatitude,
      positionLongitude: u.positionLongitude,
    },
  });
});

/**
 * Zone (commune / arrondissement / dépôt) à laquelle l'utilisateur courant est
 * rattaché, avec sa géométrie. Utilisé par le dashboard pour centrer la carte
 * sur la zone d'action du QG / agent / équipe.
 */
router.get('/me/zone', async (req, res) => {
  if (!req.user.zoneId) return res.json({ zone: null });
  const zone = await Zone.findByPk(req.user.zoneId, {
    attributes: ['id', 'nom', 'type', 'code', 'numeroQg', 'geometrie'],
  });
  return res.json({ zone });
});

router.patch(
  '/me/position',
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (![RoleEnum.AGENT_PATROUILLE, RoleEnum.EQUIPE_INTERVENTION].includes(req.user.role)) {
      return res.status(403).json({ message: 'Rôle non autorisé' });
    }

    await req.user.update({
      positionLatitude: req.body.latitude,
      positionLongitude: req.body.longitude,
    });

    const io = req.app.get('io');
    if (io && req.user.zoneId) {
      io.to(`zone:${req.user.zoneId}`).emit('agent:position', {
        userId: req.user.id,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
      });
    }

    return res.json({ ok: true });
  },
);

/**
 * CDC v2.3 — liste des équipes d'intervention disponibles pour l'affectation.
 *
 * Les équipes sont désormais rattachées à des DEPOT_REPARATION (cross-zone).
 * On retourne donc toutes les équipes actives, avec leur spécialité et leur
 * dépôt, pour que l'Admin QG puisse filtrer au moment de l'affectation.
 */
router.get('/equipes', async (req, res) => {
  if (req.user.role !== RoleEnum.ADMIN_QG) {
    return res.status(403).json({ message: 'Admin QG uniquement' });
  }
  const equipes = await User.findAll({
    where: {
      role: RoleEnum.EQUIPE_INTERVENTION,
      actif: true,
      specialite: { [Op.ne]: SpecialiteEnum.JIRAMA },
    },
    attributes: [
      'id',
      'nom',
      'prenom',
      'email',
      'matricule',
      'zoneId',
      'specialite',
    ],
    order: [['nom', 'ASC'], ['prenom', 'ASC']],
  });
  return res.json({ equipes });
});

module.exports = router;
