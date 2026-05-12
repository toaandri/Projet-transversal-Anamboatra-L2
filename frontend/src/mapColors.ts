import { anam } from './anamboatraTheme';
import type { Role, Statut, Urgence } from './types';

export function ticketMarkerStyle(statut: Statut, urgence: Urgence, viewerRole: Role | null) {
  const base = { weight: 2, opacity: 1, fillOpacity: 0.85 };
  switch (statut) {
    case 'EN_ATTENTE_CONFIRMATION':
      if (viewerRole === 'ADMIN_QG') return { ...base, color: '#7f1d1d', fillColor: anam.mgRed };
      return { ...base, color: anam.tealDark, fillColor: anam.sageDeep };
    case 'REPARATION_PREVUE':
      return { ...base, color: anam.amberDeep, fillColor: anam.amber };
    case 'EN_REPARATION':
      return { ...base, color: '#1e3a5f', fillColor: anam.blue };
    case 'TERMINE':
    case 'CLOTURE':
      return { ...base, color: anam.mgGreenDeep, fillColor: anam.mgGreen };
    default:
      return {
        ...base,
        color: anam.teal,
        fillColor: urgence === 'URGENT' ? anam.mgRed : anam.amber,
      };
  }
}

export function suggestionMarkerStyle() {
  return { weight: 2, color: anam.tealDark, fillColor: anam.lime, opacity: 1, fillOpacity: 0.92 };
}

export const STATUT_LABELS: Record<Statut, string> = {
  EN_ATTENTE_CONFIRMATION: 'En attente de validation QG',
  REPARATION_PREVUE: 'Intervention planifiée',
  EN_REPARATION: 'Intervention en cours',
  TERMINE: 'Travaux terminés',
  CLOTURE: 'Dossier clôturé',
};

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super-administrateur MTP',
  AGENT_PATROUILLE: 'Agent de patrouille',
  ADMIN_QG: 'Administrateur de quartier général',
  EQUIPE_INTERVENTION: "Équipe d'intervention",
  CITOYEN: 'Citoyen',
};
