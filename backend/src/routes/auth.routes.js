const express = require('express');
const { body, validationResult } = require('express-validator');
const { User } = require('../models/postgres');
const { verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { RoleEnum } = require('../constants/enums');

const router = express.Router();

const DEVICE_BOUND_ROLES = new Set();

router.post(
  '/login',
  body('email').isEmail(),
  body('password').isString().isLength({ min: 6 }),
  body('deviceId').optional({ nullable: true }).isString().isLength({ max: 191 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const user = await User.findOne({ where: { email: req.body.email } });
    if (!user) return res.status(401).json({ message: 'Identifiants invalides' });

    const ok = await verifyPassword(req.body.password, user.motDePasseHash);
    if (!ok) return res.status(401).json({ message: 'Identifiants invalides' });

    if (!user.actif) {
      return res.status(403).json({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Compte suspendu. Contactez votre QG.',
      });
    }

    const deviceId = typeof req.body.deviceId === 'string' ? req.body.deviceId.trim() : '';

    if (DEVICE_BOUND_ROLES.has(user.role)) {
      if (!deviceId) {
        return res.status(400).json({
          code: 'DEVICE_ID_REQUIRED',
          message: "Identifiant d'appareil requis pour ce compte.",
        });
      }
      if (!user.appareilUnique) {

        await user.update({ appareilUnique: deviceId });
      } else if (user.appareilUnique !== deviceId) {
        return res.status(403).json({
          code: 'DEVICE_MISMATCH',
          message:
            "Cet appareil n'est pas celui qui a été enregistré pour ce compte. " +
            'Demandez à votre QG de réinitialiser le binding appareil.',
        });
      }
    }

    const token = signToken({ sub: user.id, role: user.role, zoneId: user.zoneId });
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom,
        role: user.role,
        zoneId: user.zoneId,
        numeroTelephone: user.numeroTelephone,
        specialite: user.specialite,
      },
    });
  },
);

module.exports = router;
