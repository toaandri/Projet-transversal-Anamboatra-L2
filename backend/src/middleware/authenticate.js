const { verifyToken } = require('../utils/jwt');
const { User } = require('../models/postgres');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentification requise' });
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyToken(token);
    const user = await User.findByPk(payload.sub);
    if (!user) return res.status(401).json({ message: 'Utilisateur introuvable' });

    if (user.actif === false) {
      return res.status(403).json({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Compte suspendu. Contactez votre QG.',
      });
    }
    req.user = user;
    req.auth = { sub: payload.sub, role: user.role, zoneId: user.zoneId };
    return next();
  } catch {
    return res.status(401).json({ message: 'Jeton invalide ou expiré' });
  }
}

module.exports = { authenticate };
