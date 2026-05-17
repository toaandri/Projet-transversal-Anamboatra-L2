const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { env } = require('../config/env');

const uploadRoot = path.resolve(process.cwd(), env.uploadDir);

function ensureUploadDir() {
  if (!fs.existsSync(uploadRoot)) {
    fs.mkdirSync(uploadRoot, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    ensureUploadDir();
    cb(null, uploadRoot);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const uploadPhoto = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = /^image\/(jpeg|png|webp)$/i.test(file.mimetype);
    if (!ok) return cb(new Error('Format image non supporté'));
    cb(null, true);
  },
});

function publicUrlForStoredFile(filename) {
  return `/static/${filename}`;
}

module.exports = { uploadPhoto, uploadRoot, publicUrlForStoredFile, ensureUploadDir };
