/**
 * CDC v2.3 — Panneau "Effectifs" du dashboard Admin QG.
 *
 * Le QG gère uniquement ses AGENTS DE PATROUILLE (les équipes d'intervention
 * sont créées par le super-admin et rattachées à un dépôt — cf. AdminPage).
 *
 * Actions :
 *   - lister ses agents de patrouille
 *   - enrôler un nouvel agent (nom, prénom, téléphone, matricule optionnel)
 *   - suspendre / réactiver
 *   - supprimer (si aucun ticket signalé)
 *
 * Note : le verrou "appareil unique" est désactivé tant que le projet n'est
 * pas en phase de déploiement (cf. backend/src/routes/auth.routes.js).
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Agent } from '../types';

export function EffectifsPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const { agents: list } = await api.qgAgents();
      setAgents(list);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Chargement impossible');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(promise: Promise<unknown>, successMsg: string) {
    try {
      setErr(null);
      await promise;
      setMsg(successMsg);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    }
  }

  return (
    <section className="kanban">
      <h3>Agents de patrouille ({agents.length})</h3>
      <p className="muted small">
        Les équipes de réparation sont gérées par le super-administrateur et
        rattachées à des dépôts de réparation.
      </p>
      {err ? <p className="alert error">{err}</p> : null}
      {msg ? <p className="alert success">{msg}</p> : null}

      <div className="row" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setShowCreate((v) => !v);
            setMsg(null);
          }}
        >
          {showCreate ? 'Fermer' : 'Enrôler un agent de patrouille'}
        </button>
      </div>

      {showCreate ? (
        <CreateAgentForm
          onDone={async (created) => {
            setShowCreate(false);
            await load();
            setMsg(`Compte ${created.email} créé. Mot de passe à communiquer en sécurité.`);
          }}
          onError={setErr}
        />
      ) : null}

      <AgentList
        agents={agents}
        onSuspend={(a) => runAction(api.qgSuspendPatrouille(a.id), `${a.email} suspendu.`)}
        onReactivate={(a) => runAction(api.qgReactivatePatrouille(a.id), `${a.email} réactivé.`)}
        onDelete={(a) => runAction(api.qgDeletePatrouille(a.id), `${a.email} supprimé.`)}
      />
    </section>
  );
}

function CreateAgentForm({
  onDone,
  onError,
}: {
  onDone: (agent: Agent) => void | Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [numeroTelephone, setNumeroTelephone] = useState('');
  const [matricule, setMatricule] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    setLoading(true);
    try {
      const { agent } = await api.qgCreatePatrouille({
        nom: nom.trim(),
        prenom: prenom.trim(),
        email: email.trim(),
        password,
        numeroTelephone: numeroTelephone.trim(),
        matricule: matricule.trim() || null,
      });
      await onDone(agent);
    } catch (ex) {
      onError(ex instanceof Error ? ex.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Nom
        <input required value={nom} onChange={(e) => setNom(e.target.value)} />
      </label>
      <label>
        Prénom
        <input required value={prenom} onChange={(e) => setPrenom(e.target.value)} />
      </label>
      <label>
        Email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Mot de passe initial (≥ 8 caractères)
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label>
        Téléphone
        <input
          required
          value={numeroTelephone}
          onChange={(e) => setNumeroTelephone(e.target.value)}
          placeholder="+261 …"
        />
      </label>
      <label>
        Matricule (optionnel)
        <input value={matricule} onChange={(e) => setMatricule(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? 'Création…' : 'Créer le compte'}
      </button>
    </form>
  );
}

function AgentList({
  agents,
  onSuspend,
  onReactivate,
  onDelete,
}: {
  agents: Agent[];
  onSuspend: (a: Agent) => void;
  onReactivate: (a: Agent) => void;
  onDelete: (a: Agent) => void;
}) {
  if (agents.length === 0) {
    return <p className="muted small">Aucun agent pour l'instant.</p>;
  }
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {agents.map((a) => (
        <li key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
          <div style={{ fontWeight: 600 }}>
            {a.prenom} {a.nom} {a.actif ? '' : '· SUSPENDU'}
          </div>
          <div className="muted small">
            {a.email}
            {a.numeroTelephone ? ` · ${a.numeroTelephone}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {a.actif ? (
              <button type="button" className="btn btn-ghost small" onClick={() => onSuspend(a)}>
                Suspendre
              </button>
            ) : (
              <button type="button" className="btn btn-primary small" onClick={() => onReactivate(a)}>
                Réactiver
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => {
                if (confirm(`Supprimer définitivement ${a.email} ?`)) onDelete(a);
              }}
            >
              Supprimer
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
