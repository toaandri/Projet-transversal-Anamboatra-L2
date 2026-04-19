function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ message: 'Authentification requise' });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ message: 'Droits insuffisants' });
    }
    next();
  };
}

module.exports = { requireRole };
