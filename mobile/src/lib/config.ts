import Constants from 'expo-constants';
import { Platform } from 'react-native';

type Extra = { API_URL?: string; GOOGLE_MAPS_API_KEY?: string };

const extra =
  (Constants.expoConfig?.extra as Extra) ||
  (Constants.manifestExtra as Extra) ||
  {};

const DEFAULT_BACKEND_PORT = 4000;

function expoLanHost(): string | null {
  const candidates: Array<string | undefined | null> = [
    (Constants.expoConfig as { hostUri?: string } | null | undefined)?.hostUri,
    (Constants as unknown as { expoGoConfig?: { hostUri?: string } }).expoGoConfig?.hostUri,
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

function defaultDevHost(): string {
  if (Platform.OS === 'android') return '10.0.2.2';
  return 'localhost';
}

function resolveApiUrl(): string {
  const explicit = (extra.API_URL || '').trim();
  if (explicit && !/localhost|127\.0\.0\.1|10\.0\.2\.2/.test(explicit)) {
    return explicit.replace(/\/+$/, '');
  }

  const lan = expoLanHost();
  if (lan) return `http://${lan}:${DEFAULT_BACKEND_PORT}`;

  if (explicit) return explicit.replace(/\/+$/, '');
  return `http://${defaultDevHost()}:${DEFAULT_BACKEND_PORT}`;
}

export const API_URL = resolveApiUrl();

export function resolveAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/')) return `${API_URL}${path}`;
  return `${API_URL}/${path}`;
}

export const GOOGLE_MAPS_API_KEY = extra.GOOGLE_MAPS_API_KEY || '';
