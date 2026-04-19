import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { getCachedUser, getToken, logoutLocal, setCachedUser, setToken } from './auth';
import type { User } from './types';

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = await getToken();
    if (!t) {
      setUser(null);
      return;
    }
    try {
      const { user: u } = await api.me();
      setUser(u);
      await setCachedUser(u);
    } catch {
      await logoutLocal();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const cached = await getCachedUser<User>();
      if (cached) setUser(cached);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: u } = await api.login(email, password);
    await setToken(token);
    await setCachedUser(u);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await logoutLocal();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth hors AuthProvider');
  return c;
}
