const { verifyToken } = require('../utils/jwt');
const { User } = require('../models/postgres');

async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyToken(token);
    const user = await User.findByPk(payload.sub);
    if (user) {
      req.user = user;
      req.auth = { sub: payload.sub, role: user.role, zoneId: user.zoneId };
    }
  } catch {
    // jeton invalide : traiter comme anonyme
  }
  next();
}

module.exports = { optionalAuth };
