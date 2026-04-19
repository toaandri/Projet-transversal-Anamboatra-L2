const express = require('express');
const { Op } = require('sequelize');
const { body, param, validationResult } = require('express-validator');
const { Ticket } = require('../models/postgres');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/requireRole');
const { RoleEnum, UrgenceEnum, TypeEnum, StatutEnum } = require('../constants/enums');
const { uploadPhoto, publicUrlForStoredFile } = require('../utils/photoUpload');
const { assertPhotoLocationConsistent } = require('../utils/exifVerify');
const { ticketVisibilityWhere } = require('../services/mapFilterService');
const { applyTicketPatch } = require('../services/ticketLifecycle');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  const principal = {
    role: req.auth.role,
    zoneId: req.auth.zoneId,
    userId: req.auth.sub,
  };
  try {
    const filter = ticketVisibilityWhere(principal);
    const tickets = await Ticket.findAll({
      where: filter,
      order: [['updatedAt', 'DESC']],
    });
    return res.json({ tickets });
  } catch (e) {
    console.error('[GET /tickets]', e);
    return res.status(500).json({ message: e.message || 'Erreur serveur' });
  }
});

router.get('/:id', param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const ticket = await Ticket.findByPk(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });

  const principal = {
    role: req.auth.role,
    zoneId: req.auth.zoneId,
    userId: req.auth.sub,
  };
  const vis = ticketVisibilityWhere(principal);
  const allowed = await Ticket.findOne({
    where: {
      [Op.and]: [{ id: ticket.id }, vis],
    },
  });
  if (!allowed) return res.status(403).json({ message: 'Accès refusé à ce ticket' });

  return res.json({ ticket });
});

router.post(
  '/',
  requireRole(RoleEnum.AGENT_PATROUILLE),
  uploadPhoto.single('photo'),
  body('description').isString().isLength({ min: 3, max: 4000 }),
  body('urgence').isIn(Object.values(UrgenceEnum)),
  body('typeInfrastructure').isIn(Object.values(TypeEnum)),
  body('latitude').isFloat({ min: -90, max: 90 }),
  body('longitude').isFloat({ min: -180, max: 180 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!req.file) return res.status(400).json({ message: 'Photo requise' });

    await assertPhotoLocationConsistent(req.file.path, Number(req.body.latitude), Number(req.body.longitude));

    const zoneId = req.user.zoneId;
    if (!zoneId) return res.status(400).json({ message: 'Agent sans zone assignée' });

    const photoUrl = publicUrlForStoredFile(req.file.filename);

    const ticket = await Ticket.create({
      description: req.body.description,
      photoSignalement: photoUrl,
      urgence: req.body.urgence,
      typeInfrastructure: req.body.typeInfrastructure,
      zoneId,
      localisation: {
        latitude: Number(req.body.latitude),
        longitude: Number(req.body.longitude),
      },
      signalantUserId: req.user.id,
      statut: StatutEnum.EN_ATTENTE_CONFIRMATION,
      visiblePublic: false,
      dateSignalement: new Date(),
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`zone:${zoneId}`).emit('ticket:created', {
        ticketId: String(ticket.id),
        zoneId,
        statut: ticket.statut,
      });
    }

    return res.status(201).json({ ticket });
  },
);

router.patch(
  '/:id',
  requireRole(RoleEnum.ADMIN_QG, RoleEnum.EQUIPE_INTERVENTION),
  param('id').isUUID(),
  body('statut').optional().isString(),
  body('equipeUserIds').optional().isArray(),
  body('photoCloture').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const ticket = await Ticket.findByPk(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });

    try {
      const { ticket: updated, changed, ancien } = await applyTicketPatch(ticket, req.body, req.user);
      if (!changed) return res.json({ ticket: updated });

      const io = req.app.get('io');
      if (io) {
        const payload = {
          ticketId: String(updated.id),
          zoneId: updated.zoneId,
          statut: updated.statut,
          ancien,
        };
        io.to(`zone:${updated.zoneId}`).emit('ticket:updated', payload);
        if (updated.visiblePublic) {
          io.to('public').emit('ticket:updated', payload);
        }
      }

      return res.json({ ticket: updated });
    } catch (e) {
      return res.status(400).json({ message: e.message || 'Mise à jour impossible' });
    }
  },
);

module.exports = router;
