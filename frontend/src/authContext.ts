import { createContext } from 'react';
import type { User } from './types';

export type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

// Fichier dédié (pas de JSX, pas de composant) pour que React Fast Refresh
// puisse rafraîchir AuthContext.tsx (provider) et useAuth.ts (hook) sans
// recharger toute la page. Cf. https://github.com/vitejs/vite-plugin-react/
// tree/main/packages/plugin-react#consistent-components-exports
export const AuthContext = createContext<AuthState | null>(null);
