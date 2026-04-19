/**
 * CDC v2.3 — accès à la console d'administration.
 *
 * Deux modes acceptés (pratique pour la transition) :
 *   1) JWT d'un compte SUPER_ADMIN en Authorization: Bearer <token>   (flux normal)
 *   2) Jeton partagé X-Admin-Token = ADMIN_SETUP_TOKEN                (dépannage)
 *
 * Le mode 1 est privilégié. Le mode 2 n'est actif que si ADMIN_SETUP_TOKEN
 * est défini dans l'environnement serveur (sinon ignoré silencieusement).
 */
const { env } = require('../config/env');
const { verifyToken } = require('../utils/jwt');
const { User } = require('../models/postgres');
const { RoleEnum } = require('../constants/enums');

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function requireAdminAccess(req, res, next) {
  // --- Voie 2 : jeton partagé (legacy / dépannage) ---
  const expected = env.adminSetupToken;
  const received = req.headers['x-admin-token'];
  if (expected && typeof received === 'string' && timingSafeEqual(received, expected)) {
    req.adminAuth = { via: 'token' };
    return next();
  }

  // --- Voie 1 : JWT SUPER_ADMIN ---
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    try {
      const payload = verifyToken(token);
      const user = await User.findByPk(payload.sub);
      if (user && user.actif !== false && user.role === RoleEnum.SUPER_ADMIN) {
        req.user = user;
        req.auth = { sub: payload.sub, role: user.role, zoneId: null };
        req.adminAuth = { via: 'jwt', userId: user.id };
        return next();
      }
    } catch {
      /* fallthrough */
    }
  }

  return res.status(401).json({
    code: 'ADMIN_ACCESS_REQUIRED',
    message: 'Accès super-administrateur requis (connectez-vous avec le compte admin).',
  });
}

module.exports = { requireAdminAccess };
