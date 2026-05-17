import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrgEmailLocalField, fullOrgEmail } from '@/components/OrgEmailLocalField';
import { useAuth } from '@/auth/useAuth';

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [emailLocal, setEmailLocal] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(fullOrgEmail(emailLocal), password);
      nav('/app', { replace: true });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Échec de l’authentification.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page login-page">
      <div className="panel login-card">
        <h1>Authentification Anamboatra</h1>
        <p className="muted small">
          Portail opérationnel MTP et quartiers généraux — accès restreint, hors espace grand public.
        </p>
        <details className="login-details-muted">
          <summary>Agents terrain (patrouille et intervention)</summary>
          <p className="muted small">
            Authentification via l&apos;application mobile Terrain ; ce poste ne prend pas en charge ces profils.
          </p>
        </details>
        {err ? <p className="alert error">{err}</p> : null}
        <form onSubmit={onSubmit} className="form">
          <label>
            Courriel institutionnel
            <OrgEmailLocalField required value={emailLocal} onChange={setEmailLocal} />
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
