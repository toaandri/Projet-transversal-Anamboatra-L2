import Constants from 'expo-constants';
import { Platform } from 'react-native';

type Extra = { API_URL?: string; GOOGLE_MAPS_API_KEY?: string };

const extra =
  (Constants.expoConfig?.extra as Extra) ||
  (Constants.manifestExtra as Extra) ||
  {};

/** Port par défaut du backend Express (modifiable côté backend via .env). */
const DEFAULT_BACKEND_PORT = 4000;

/**
 * Récupère l'IP du PC qui sert le bundle Metro (Expo Go).
 *
 * - `Constants.expoConfig.hostUri` ou `Constants.expoGoConfig.hostUri` ressemble
 *   à `192.168.1.42:8081`.
 * - C'est exactement l'IP que le téléphone peut joindre puisqu'il a déjà chargé
 *   le bundle depuis cette adresse → on la réutilise pour le backend en
 *   remplaçant juste le port.
 */
function expoLanHost(): string | null {
  const candidates: Array<string | undefined | null> = [
    // expo SDK 49+ : Constants.expoConfig.hostUri
    (Constants.expoConfig as { hostUri?: string } | null | undefined)?.hostUri,
    // expo Go runtime
    (Constants as unknown as { expoGoConfig?: { hostUri?: string } }).expoGoConfig?.hostUri,
    // legacy SDK
    (Constants.manifest as { hostUri?: string; debuggerHost?: string } | null | undefined)?.hostUri,
    (Constants.manifest as { debuggerHost?: string } | null | undefined)?.debuggerHost,
    (Constants.manifest2 as { extra?: { expoGo?: { debuggerHost?: string } } } | null | undefined)
      ?.extra?.expoGo?.debuggerHost,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) {
      return c.split(':')[0];
    }
  }
  return null;
}

/** Heuristique de fallback (émulateur Android) si on ne trouve rien d'autre. */
function defaultDevHost(): string {
  if (Platform.OS === 'android') return '10.0.2.2'; // loopback de l'émulateur Android vers l'hôte
  return 'localhost';
}

function resolveApiUrl(): string {
  const explicit = (extra.API_URL || '').trim();
  // Si l'utilisateur a explicitement renseigné une URL non-localhost, on la respecte.
  if (explicit && !/localhost|127\.0\.0\.1|10\.0\.2\.2/.test(explicit)) {
    return explicit.replace(/\/+$/, '');
  }

  const lan = expoLanHost();
  if (lan) return `http://${lan}:${DEFAULT_BACKEND_PORT}`;

  if (explicit) return explicit.replace(/\/+$/, '');
  return `http://${defaultDevHost()}:${DEFAULT_BACKEND_PORT}`;
}

/**
 * URL de l'API Express, résolue automatiquement en dev :
 *   1. Une `API_URL` explicite (non-localhost) dans `app.json` → respectée.
 *   2. Sinon, l'IP du Metro bundler (Expo Go) + port backend → joignable
 *      automatiquement depuis le téléphone sur le même Wi-Fi.
 *   3. Sinon, fallback `10.0.2.2` (émulateur Android) ou `localhost` (iOS sim).
 */
export const API_URL = resolveApiUrl();

/** Préfixe `API_URL` sur les chemins relatifs servis par le backend (`/static/...`). */
export function resolveAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/')) return `${API_URL}${path}`;
  return `${API_URL}/${path}`;
}

/** Clé Google Maps (Maps SDK Android). Optionnelle pour Expo Go. */
export const GOOGLE_MAPS_API_KEY = extra.GOOGLE_MAPS_API_KEY || '';
