const { env } = require('../config/env');

/**
 * CDC v2.2 — garde les endpoints de la console d'administration technique.
 * L'admin n'est pas un acteur métier (hors UML) : un simple jeton partagé
 * suffit, provisionné côté env (ADMIN_SETUP_TOKEN).
 *
 * Comparaison en temps constant pour éviter les attaques par timing.
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function requireAdminToken(req, res, next) {
  const expected = env.adminSetupToken;
  const received = req.headers['x-admin-token'];
  if (!expected || typeof received !== 'string' || !timingSafeEqual(received, expected)) {
    return res.status(401).json({ message: 'Jeton administrateur invalide ou manquant' });
  }
  return next();
}

module.exports = { requireAdminToken };
