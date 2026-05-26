require('dotenv').config();

function normalizeEnvString(value) {
  if (value === undefined || value === null) return '';
  let s = String(value).trim();
  if (s.charCodeAt(0) === 0xfeff) {
    s = s.slice(1).trim();
  }
  return s;
}

function trimOr(value, fallback) {
  const s = normalizeEnvString(value);
  return s === '' ? fallback : s;
}

let databaseUrl = null;
const databaseUrlRaw = process.env.DATABASE_URL;
if (databaseUrlRaw !== undefined && databaseUrlRaw !== null) {
  const u = normalizeEnvString(databaseUrlRaw);
  if (u) databaseUrl = u;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminSetupToken: trimOr(process.env.ADMIN_SETUP_TOKEN, 'dev-admin-token-change-me'),
  databaseUrl,
  postgres: {
    host: trimOr(process.env.POSTGRES_HOST, 'localhost'),
    port: (() => {
      const p = process.env.POSTGRES_PORT;
      if (p === undefined || p === null || normalizeEnvString(p) === '') return 5432;
      const n = Number(normalizeEnvString(p));
      return Number.isFinite(n) && n > 0 ? n : 5432;
    })(),
    database: trimOr(process.env.POSTGRES_DB, 'anamboatra'),
    user: trimOr(process.env.POSTGRES_USER, 'postgres'),
    password:
      process.env.POSTGRES_PASSWORD === undefined || process.env.POSTGRES_PASSWORD === null
        ? ''
        : normalizeEnvString(process.env.POSTGRES_PASSWORD),
    ssl: normalizeEnvString(process.env.POSTGRES_SSL).toLowerCase() === 'true',
  },
  uploadDir: trimOr(process.env.UPLOAD_DIR, 'uploads'),
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL && normalizeEnvString(process.env.PUBLIC_BASE_URL) !== ''
      ? normalizeEnvString(process.env.PUBLIC_BASE_URL)
      : `http://localhost:${Number(process.env.PORT) || 4000}`,
};

module.exports = { env };
