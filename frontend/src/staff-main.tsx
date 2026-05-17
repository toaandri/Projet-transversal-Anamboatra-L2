import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import StaffApp from './StaffApp';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <StaffApp />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
);
