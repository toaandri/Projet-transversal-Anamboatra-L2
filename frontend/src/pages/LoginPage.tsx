import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../useAuth';

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <h1>Connexion Anamboatra</h1>
        <p className="muted small">
          Accès réservé aux comptes habilités QG et MTP — application poste (hors site grand public).
        </p>
        <details className="login-details-muted">
          <summary>Patrouilles et équipes d&apos;intervention</summary>
          <p className="muted small">
            Identifiants actifs depuis l&apos;application mobile Terrain (non disponible depuis ce poste).
          </p>
        </details>
        {err ? <p className="alert error">{err}</p> : null}
        <form onSubmit={onSubmit} className="form">
          <label>
            Adresse e-mail
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
          <div className="login-form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Connexion…' : 'Connexion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
