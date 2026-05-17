const path = require('path');
const express = require('express');
require('express-async-errors');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const apiRoutes = require('./routes');
const { buildMapPayload } = require('./services/mapFilterService');
const { MapRole } = require('./constants/enums');
const { env } = require('./config/env');
const { ensureUploadDir } = require('./utils/photoUpload');

function createApp() {
  const app = express();

  ensureUploadDir();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use(
    '/static',
    express.static(path.resolve(process.cwd(), env.uploadDir), {
      fallthrough: false,
      maxAge: '7d',
    }),
  );

    app.get('/map/tiles', async (req, res, next) => {
    try {
      const payload = await buildMapPayload({ type: MapRole.PUBLIC });
      return res.json(payload);
    } catch (e) {
      return next(e);
    }
  });

  app.use('/api', apiRoutes);

  app.use((req, res) => {
    if (req.path.startsWith('/socket.io')) {
      res.status(404).end();
      return;
    }
    res.status(404).json({ message: 'Ressource introuvable' });
  });

  app.use((err, _req, res, next) => {
    if (!err) return next();
    if (err.message === 'Format image non supporté') {
      return res.status(400).json({ message: err.message });
    }
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: 'Erreur serveur' });
  });

  return app;
}

module.exports = { createApp };
