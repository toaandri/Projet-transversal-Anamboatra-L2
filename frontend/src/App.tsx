import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './useAuth';
import { AdminPage } from './pages/AdminPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { PublicLanding } from './pages/PublicLanding';
import { PublicHome } from './pages/PublicHome';

function ProtectedApp() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page center muted">Chargement du profil…</div>;
  if (!user) return <Navigate to="/connexion" replace />;
  return <DashboardPage />;
}

function LoginGate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page center muted">Chargement du profil…</div>;
  if (user) return <Navigate to="/app" replace />;
  return <LoginPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicLanding />} />
      <Route path="/travaux" element={<PublicHome />} />
      <Route path="/connexion" element={<LoginGate />} />
      <Route path="/app" element={<ProtectedApp />} />
      <Route path="/admin-setup" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
