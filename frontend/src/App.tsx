import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLanding } from './pages/PublicLanding';
import { PublicHome } from './pages/PublicHome';

/** Site citoyen uniquement : pas de connexion ni d’espace QG (réservés à l’application bureau). */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicLanding />} />
      <Route path="/travaux" element={<PublicHome />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
