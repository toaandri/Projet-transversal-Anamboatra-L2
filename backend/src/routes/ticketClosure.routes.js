const express = require('express');
const { param, validationResult } = require('express-validator');
const { Ticket } = require('../models/postgres');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/requireRole');
const { RoleEnum } = require('../constants/enums');
const { uploadPhoto, publicUrlForStoredFile } = require('../utils/photoUpload');
const { assertPhotoLocationConsistent } = require('../utils/exifVerify');

const router = express.Router({ mergeParams: true });

router.use(authenticate);
router.use(requireRole(RoleEnum.EQUIPE_INTERVENTION));

router.post(
  '/:id/closure-photo',
  param('id').isUUID(),
  uploadPhoto.single('photo'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!req.file) return res.status(400).json({ message: 'Photo requise' });

    const ticket = await Ticket.findByPk(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket introuvable' });

    const assigned = ticket.mission?.assignedUserIds?.includes(req.user.id);
    if (!assigned) return res.status(403).json({ message: 'Mission non assignée à cette équipe' });

    const loc = ticket.localisation || {};
    await assertPhotoLocationConsistent(req.file.path, loc.latitude, loc.longitude);

    const url = publicUrlForStoredFile(req.file.filename);
    return res.status(201).json({ photoCloture: url });
  },
);

module.exports = router;
