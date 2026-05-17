const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapScopeZoneIdFromQuery(value) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return UUID_RE.test(t) ? t : null;
}

module.exports = { mapScopeZoneIdFromQuery };
