const { env } = require('../config/env');

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
