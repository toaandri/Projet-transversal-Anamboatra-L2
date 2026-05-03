/** Effectifs Admin QG : patrouilles et équipes d'intervention (pages séparées dans le dashboard). */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Agent, RepairAgent, Specialite } from '../types';
import { OrgEmailLocalField, fullOrgEmail } from './OrgEmailLocalField';

/** Spécialités proposées à la création d’une équipe par le QG. */
const SPECIALITE_OPTIONS_QG: { v: Specialite; l: string }[] = [
  { v: 'ROUTE', l: 'Route — voirie' },
  {
    v: 'JIRAMA',
    l: 'JIRAMA — réseau électrique de proximité',
  },
  { v: 'NETTOYEUR', l: 'Nettoyage / propreté' },
  { v: 'REPARATEUR', l: 'Réparation — chantiers courants / polyvalent' },
];

function specialiteLabel(s: Specialite | string | undefined | null): string {
  if (!s) return '';
  const map: Partial<Record<Specialite | 'MACON', string>> = {
    ROUTE: 'Route',
    JIRAMA: 'JIRAMA',
    NETTOYEUR: 'Nettoyeur',
    MACON: 'Maçon',
    REPARATEUR: 'Réparateur',
  };
  return map[s as Specialite] ?? String(s);
}

function useEffectifsLoad(
  loadPatrol: boolean,
  loadRepair: boolean,
): {
  agents: Agent[];
  repairs: RepairAgent[];
  err: string | null;
  msg: string | null;
  setErr: (s: string | null) => void;
  setMsg: (s: string | null) => void;
  load: () => Promise<void>;
} {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [repairs, setRepairs] = useState<RepairAgent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const promises: Promise<void>[] = [];
      if (loadPatrol) {
        promises.push(
          api.qgAgents().then(({ agents: list }) => {
            setAgents(list);
          }),
        );
      }
      if (loadRepair) {
        promises.push(
          api.qgRepairAgents().then(({ agents: repairList }) => {
            setRepairs(repairList);
          }),
        );
      }
      await Promise.all(promises);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Chargement impossible');
    }
  }, [loadPatrol, loadRepair]);

  useEffect(() => {
    void load();
  }, [load]);

  return { agents, repairs, err, msg, setErr, setMsg, load };
}

/** Page QG : liste des agents de patrouille, création sous bouton. */
export function QgPatrolAgentsPanel() {
  const { agents, err, msg, setErr, setMsg, load } = useEffectifsLoad(true, false);
  const [showCreate, setShowCreate] = useState(false);

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
    <section className="qg-section qg-section--effectifs">
      <header className="qg-section-head">
        <span className="qg-section-eyebrow">Ressources humaines</span>
        <div className="qg-section-titlerow">
          <h3>Agents de patrouille</h3>
          <span className="qg-section-meta">{agents.length} agent{agents.length > 1 ? 's' : ''}</span>
        </div>
      </header>
      {err ? <p className="alert error">{err}</p> : null}
      {msg ? <p className="alert success">{msg}</p> : null}

      <div className="qg-effectifs-split">
        <div className="qg-effectifs-block">
          <h4 className="qg-effectifs-subtitle">Agents inscrits</h4>
          <AgentList
            agents={agents}
            onSuspend={(a) => runAction(api.qgSuspendPatrouille(a.id), `${a.email} suspendu.`)}
            onReactivate={(a) => runAction(api.qgReactivatePatrouille(a.id), `${a.email} réactivé.`)}
            onDelete={(a) => runAction(api.qgDeletePatrouille(a.id), `${a.email} supprimé.`)}
          />
        </div>

        <button
          type="button"
          className="btn btn-primary block qg-effectifs-expand"
          onClick={() => setShowCreate((v) => !v)}
          aria-expanded={showCreate}
        >
          {showCreate ? 'Fermer le formulaire' : 'Enrôler un agent de patrouille'}
        </button>

        {showCreate ? (
          <>
            <hr className="qg-effectifs-divider" aria-hidden="true" />
            <div className="qg-effectifs-block">
              <h4 className="qg-effectifs-subtitle">Nouveau compte patrouille</h4>
              <CreateAgentForm
                onDone={async () => {
                  await load();
                  setMsg('Compte créé.');
                  setShowCreate(false);
                }}
                onError={setErr}
              />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

/** Page QG : équipes d'intervention, lieu choisi sur la carte. */
export function QgInterventionAgentsPanel({
  lieuCoords,
  onLieuxCoordsChange,
  mapPickWaiting,
  onActivateMapPick,
  onCancelMapPick,
}: {
  lieuCoords: { lat: number; lng: number } | null;
  onLieuxCoordsChange: (coords: { lat: number; lng: number } | null) => void;
  mapPickWaiting: boolean;
  onActivateMapPick: () => void;
  onCancelMapPick: () => void;
}) {
  const { repairs, err, msg, setErr, setMsg, load } = useEffectifsLoad(false, true);
  const [showCreate, setShowCreate] = useState(false);

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
    <section className="qg-section qg-section--effectifs">
      <header className="qg-section-head">
        <span className="qg-section-eyebrow">Ressources humaines</span>
        <div className="qg-section-titlerow">
          <h3>Équipes d&apos;intervention</h3>
          <span className="qg-section-meta">
            {repairs.length} équipe{repairs.length > 1 ? 's' : ''}
          </span>
        </div>
      </header>
      {err ? <p className="alert error">{err}</p> : null}
      {msg ? <p className="alert success">{msg}</p> : null}

      <div className="qg-effectifs-split">
        <div className="qg-effectifs-block">
          <h4 className="qg-effectifs-subtitle">Équipes inscrites</h4>
          <RepairList
            agents={repairs}
            onSuspend={(a) => runAction(api.qgSuspendRepairAgent(a.id), `${a.email} suspendu.`)}
            onReactivate={(a) => runAction(api.qgReactivateRepairAgent(a.id), `${a.email} réactivé.`)}
            onDelete={(a) => runAction(api.qgDeleteRepairAgent(a.id), `${a.email} supprimé.`)}
          />
        </div>

        <button
          type="button"
          className="btn btn-primary block qg-effectifs-expand"
          onClick={() => setShowCreate((v) => !v)}
          aria-expanded={showCreate}
        >
          {showCreate ? 'Fermer le formulaire' : "Créer une équipe d'intervention"}
        </button>

        {showCreate ? (
          <>
            <hr className="qg-effectifs-divider" aria-hidden="true" />
            <div className="qg-effectifs-block">
              <h4 className="qg-effectifs-subtitle">Nouvelle équipe</h4>
              <CreateRepairForm
                lieuCoords={lieuCoords}
                onLieuxCoordsChange={onLieuxCoordsChange}
                mapPickWaiting={mapPickWaiting}
                onRequestMapPick={onActivateMapPick}
                onCancelMapPick={onCancelMapPick}
                onDone={async () => {
                  await load();
                  setMsg('Équipe créée.');
                  setShowCreate(false);
                  onLieuxCoordsChange(null);
                }}
                onError={setErr}
              />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function CreateAgentForm({
  onDone,
  onError,
}: {
  onDone: () => void | Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [emailLocal, setEmailLocal] = useState('');
  const [password, setPassword] = useState('');
  const [numeroTelephone, setNumeroTelephone] = useState('');
  const [matricule, setMatricule] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    setLoading(true);
    try {
      await api.qgCreatePatrouille({
        nom: nom.trim(),
        prenom: prenom.trim(),
        email: fullOrgEmail(emailLocal),
        password,
        numeroTelephone: numeroTelephone.trim(),
        matricule: matricule.trim() || null,
      });
      setNom('');
      setPrenom('');
      setEmailLocal('');
      setPassword('');
      setNumeroTelephone('');
      setMatricule('');
      await onDone();
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
        E-mail
        <OrgEmailLocalField required value={emailLocal} onChange={setEmailLocal} />
      </label>
      <label>
        Mot de passe provisoire (≥ 8 caractères)
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
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Création…' : 'Créer le compte'}
        </button>
      </div>
    </form>
  );
}

function CreateRepairForm({
  onDone,
  onError,
  lieuCoords,
  onLieuxCoordsChange,
  mapPickWaiting,
  onRequestMapPick,
  onCancelMapPick,
}: {
  onDone: () => void | Promise<void>;
  onError: (msg: string | null) => void;
  lieuCoords: { lat: number; lng: number } | null;
  onLieuxCoordsChange: (coords: { lat: number; lng: number } | null) => void;
  mapPickWaiting: boolean;
  onRequestMapPick: () => void;
  onCancelMapPick: () => void;
}) {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [emailLocal, setEmailLocal] = useState('');
  const [password, setPassword] = useState('');
  const [numeroTelephone, setNumeroTelephone] = useState('');
  const [matricule, setMatricule] = useState('');
  const [specialite, setSpecialite] = useState<Specialite>('ROUTE');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    if (!lieuCoords) {
      onError('Choisissez le lieu sur la carte (bouton ci-dessous).');
      return;
    }
    setLoading(true);
    try {
      await api.qgCreateRepairAgent({
        nom: nom.trim(),
        prenom: prenom.trim(),
        email: fullOrgEmail(emailLocal),
        password,
        numeroTelephone: numeroTelephone.trim(),
        matricule: matricule.trim() || null,
        specialite,
        latitude: lieuCoords.lat,
        longitude: lieuCoords.lng,
      });
      setNom('');
      setPrenom('');
      setEmailLocal('');
      setPassword('');
      setNumeroTelephone('');
      setMatricule('');
      setSpecialite('ROUTE');
      await onDone();
    } catch (ex) {
      onError(ex instanceof Error ? ex.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="qg-effectifs-lieu-box">
        <div className="qg-effectifs-lieu-head">
          <strong>Lieu de rattachement</strong>
          <span className="muted small">
            Coordonnées à saisir depuis le panneau carte
          </span>
        </div>
        <div className="qg-effectifs-lieu-body">
          {lieuCoords ? (
            <>
              <p className="small qg-effectifs-lieu-values">
                {lieuCoords.lat.toFixed(5)} · {lieuCoords.lng.toFixed(5)}
              </p>
              <div className="row qg-effectifs-lieu-actions">
                <button type="button" className="btn btn-ghost" onClick={onRequestMapPick}>
                  Modifier sur la carte
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => onLieuxCoordsChange(null)}
                >
                  Effacer
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn-primary block" onClick={onRequestMapPick}>
              Désigner le lieu sur la carte
            </button>
          )}
          {mapPickWaiting ? (
            <div className="qg-effectifs-map-wait muted small">
              <p>
                Mode désignation carte : cliquer au point souhaité. Les sélections ticket / suggestion restent
                inactives jusqu’à validation ou annulation.
              </p>
              <button type="button" className="btn btn-ghost small" onClick={onCancelMapPick}>
                Annuler
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <label>
        Spécialité
        <select value={specialite} onChange={(e) => setSpecialite(e.target.value as Specialite)}>
          {SPECIALITE_OPTIONS_QG.map((s) => (
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
        E-mail
        <OrgEmailLocalField required value={emailLocal} onChange={setEmailLocal} />
      </label>
      <label>
        Mot de passe provisoire (≥ 8 caractères)
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
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Création…' : "Créer l'équipe"}
        </button>
      </div>
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
    return <p className="muted small">Aucun agent.</p>;
  }
  return (
    <ul className="qg-agent-list">
      {agents.map((a) => (
        <li key={a.id}>
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
                if (confirm(`Confirmer la suppression définitive du compte (${a.email}) ?`)) onDelete(a);
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
    return <p className="muted small">Aucune équipe.</p>;
  }
  return (
    <ul className="qg-agent-list">
      {agents.map((a) => (
        <li key={a.id}>
          <div style={{ fontWeight: 600 }}>
            {a.prenom} {a.nom} {a.actif ? '' : '· SUSPENDU'}
          </div>
          <div className="muted small">
            {a.email}
            {' · '}
            {specialiteLabel(a.specialite)}
            {a.positionLatitude != null &&
            a.positionLongitude != null &&
            !Number.isNaN(a.positionLatitude) &&
            !Number.isNaN(a.positionLongitude) ? (
              <>
                {' · '}
                <span title="Lieu désigné (WGS84)">
                  {a.positionLatitude.toFixed(5)}, {a.positionLongitude.toFixed(5)}
                </span>
              </>
            ) : null}
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
                if (confirm(`Confirmer la suppression définitive du compte (${a.email}) ?`)) onDelete(a);
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
