/**
 * Placeholder MVP : vérification EXIF anti-falsification (CDC 8.3).
 * Étendre avec exifr / piexifjs et règles métier.
 */
async function assertPhotoLocationConsistent(_filePath, expectedLat, expectedLng, toleranceMeters = 500) {
  void _filePath;
  void expectedLat;
  void expectedLng;
  void toleranceMeters;
  return { ok: true, skipped: true };
}

module.exports = { assertPhotoLocationConsistent };
