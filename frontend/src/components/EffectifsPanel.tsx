/**
 * CDC v2.3 — Panneau "Effectifs" du dashboard Admin QG.
 *
 * Le QG gère ses AGENTS DE PATROUILLE ET ses EQUIPES D'INTERVENTION.
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
import type { Agent, RepairAgent, Specialite } from '../types';

/** Spécialités gérées par le QG (JIRAMA : compétence nationale, hors console commune). */
const SPECIALITE_OPTIONS: { v: Specialite; l: string }[] = [
  { v: 'ROUTE', l: 'Route (voirie)' },
  { v: 'MACON', l: 'Maçon (bâtiment)' },
  { v: 'NETTOYEUR', l: 'Nettoyeur (propreté)' },
];

export function EffectifsPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [repairs, setRepairs] = useState<RepairAgent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showCreatePatrol, setShowCreatePatrol] = useState(false);
  const [showCreateRepair, setShowCreateRepair] = useState(false);

  const load = useCallback(async () => {
    try {
      const { agents: list } = await api.qgAgents();
      const { agents: repairList } = await api.qgRepairAgents();
      setAgents(list);
      setRepairs(repairList);
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
      {err ? <p className="alert error">{err}</p> : null}
      {msg ? <p className="alert success">{msg}</p> : null}

      <div className="row" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setShowCreatePatrol((v) => !v);
            setMsg(null);
          }}
        >
          {showCreatePatrol ? 'Fermer' : 'Enrôler un agent de patrouille'}
        </button>
      </div>

      {showCreatePatrol ? (
        <CreateAgentForm
          onDone={async (created) => {
            setShowCreatePatrol(false);
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

      <section className="kanban" style={{ marginTop: 14 }}>
        <h3>Équipes d'intervention ({repairs.length})</h3>
        <p className="muted small">
          Ces comptes sont gérés par votre commune (QG).
        </p>
        <div className="row" style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setShowCreateRepair((v) => !v);
              setMsg(null);
            }}
          >
            {showCreateRepair ? 'Fermer' : "Créer une équipe d'intervention"}
          </button>
        </div>
        {showCreateRepair ? (
          <CreateRepairForm
            onDone={async (created) => {
              setShowCreateRepair(false);
              await load();
              setMsg(`Compte ${created.email} créé. Mot de passe à communiquer en sécurité.`);
            }}
            onError={setErr}
          />
        ) : null}
        <RepairList
          agents={repairs}
          onSuspend={(a) => runAction(api.qgSuspendRepairAgent(a.id), `${a.email} suspendu.`)}
          onReactivate={(a) => runAction(api.qgReactivateRepairAgent(a.id), `${a.email} réactivé.`)}
          onDelete={(a) => runAction(api.qgDeleteRepairAgent(a.id), `${a.email} supprimé.`)}
        />
      </section>
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

function CreateRepairForm({
  onDone,
  onError,
}: {
  onDone: (agent: RepairAgent) => void | Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [numeroTelephone, setNumeroTelephone] = useState('');
  const [matricule, setMatricule] = useState('');
  const [specialite, setSpecialite] = useState<Specialite>('ROUTE');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    setLoading(true);
    try {
      const { agent } = await api.qgCreateRepairAgent({
        nom: nom.trim(),
        prenom: prenom.trim(),
        email: email.trim(),
        password,
        numeroTelephone: numeroTelephone.trim(),
        matricule: matricule.trim() || null,
        specialite,
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
        Spécialité
        <select value={specialite} onChange={(e) => setSpecialite(e.target.value as Specialite)}>
          {SPECIALITE_OPTIONS.map((s) => (
            <option key={s.v} value={s.v}>
              {s.l}
            </option>
          ))}
        </select>
      </label>
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
        {loading ? 'Création…' : "Créer l'équipe"}
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

function RepairList({
  agents,
  onSuspend,
  onReactivate,
  onDelete,
}: {
  agents: RepairAgent[];
  onSuspend: (a: RepairAgent) => void;
  onReactivate: (a: RepairAgent) => void;
  onDelete: (a: RepairAgent) => void;
}) {
  if (agents.length === 0) {
    return <p className="muted small">Aucune équipe pour l'instant.</p>;
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
            {a.specialite ? ` · ${a.specialite}` : ''}
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
