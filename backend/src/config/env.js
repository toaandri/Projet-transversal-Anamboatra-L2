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
  