import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'anamboatra_token';
const USER_KEY = 'anamboatra_user';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getCachedUser<T = unknown>(): Promise<T | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setCachedUser(user: unknown | null): Promise<void> {
  if (user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  else await AsyncStorage.removeItem(USER_KEY);
}

export async function logoutLocal(): Promise<void> {
  await Promise.all([setToken(null), setCachedUser(null)]);
}
