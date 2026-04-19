import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../useAuth';

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('admin@anamboatra.mg');
  const [password, setPassword] = useState('admin1234');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(email, password);
      nav('/app', { replace: true });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page login-page">
      <div className="panel login-card">
        <Link to="/" className="muted small back-link">
          ← Retour portail public
        </Link>
        <h1>Connexion Anamboatra</h1>
        <p className="muted small">
          Espace web réservé au <strong>super-administrateur</strong>, aux
          <strong> Administrateurs QG</strong> et aux <strong>citoyens</strong>.
          Les <strong>agents de patrouille</strong> et les{' '}
          <strong>équipes d'intervention</strong> doivent utiliser l'application
          mobile <em>Anamboatra Terrain</em>.
        </p>
        <p className="muted small">
          Au premier démarrage (base vide), seul le compte <code>admin@anamboatra.mg</code>{' '}
          existe. Il sert à créer les zones, dépôts, Admins QG et agents de réparation
          depuis la console d'administration.
        </p>
        {err ? <p className="alert error">{err}</p> : null}
        <form onSubmit={onSubmit} className="form">
          <label>
            E-mail
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
