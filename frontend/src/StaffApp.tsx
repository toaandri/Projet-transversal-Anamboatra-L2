import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './useAuth';
import { AdminPage } from './pages/AdminPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';

function ProtectedApp() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page center muted">Chargement du profil…</div>;
  if (!user) return <Navigate to="/" replace />;
  return <DashboardPage />;
}

function LoginGate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page center muted">Chargement du profil…</div>;
  if (user) return <Navigate to="/app" replace />;
  return <LoginPage />;
}

/** Application poste QG / admin — livrée en .exe (Electron), pas exposée sur le site citoyen. */
export default function StaffApp() {
  return (
    <Routes>
      <Route path="/" element={<LoginGate />} />
      <Route path="/app" element={<ProtectedApp />} />
      <Route path="/admin-setup" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
