import type { Role, Statut, Urgence } from './types';

export function ticketMarkerStyle(statut: Statut, urgence: Urgence, viewerRole: Role | null) {
  const base = { weight: 2, opacity: 1, fillOpacity: 0.85 };
  switch (statut) {
    case 'EN_ATTENTE_CONFIRMATION':
      if (viewerRole === 'ADMIN_QG') return { ...base, color: '#991b1b', fillColor: '#dc2626' };
      return { ...base, color: '#4b5563', fillColor: '#9ca3af' };
    case 'REPARATION_PREVUE':
      return { ...base, color: '#c2410c', fillColor: '#f97316' };
    case 'EN_REPARATION':
      return { ...base, color: '#1e40af', fillColor: '#3b82f6' };
    case 'TERMINE':
    case 'CLOTURE':
      return { ...base, color: '#166534', fillColor: '#22c55e' };
    default:
      return { ...base, color: '#64748b', fillColor: urgence === 'URGENT' ? '#ef4444' : '#f59e0b' };
  }
}

export function suggestionMarkerStyle() {
  return { weight: 2, color: '#6b21a8', fillColor: '#a855f7', opacity: 1, fillOpacity: 0.9 };
}

export const STATUT_LABELS: Record<Statut, string> = {
  EN_ATTENTE_CONFIRMATION: 'En attente de confirmation',
  REPARATION_PREVUE: 'Réparation prévue',
  EN_REPARATION: 'En réparation',
  TERMINE: 'Terminé',
  CLOTURE: 'Clôturé',
};

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super-administrateur',
  AGENT_PATROUILLE: 'Agent de patrouille',
  ADMIN_QG: 'Administrateur QG',
  EQUIPE_INTERVENTION: "Équipe d'intervention",
  CITOYEN: 'Citoyen',
};
