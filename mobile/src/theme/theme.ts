export const colors = {
  bg: '#f4faf6',
  panel: '#ffffff',
  panel2: '#fafdfb',
  text: '#0e2a14',
  textSoft: '#2b3a32',
  muted: '#6b7a73',
  border: '#e1ece5',
  borderStrong: '#cfe1d6',

  accent: '#007e3a',
  accentDark: '#006c32',
  accentSoft: '#e8f4ec',
  red: '#c8102e',
  redSoft: '#fde9ec',
  white: '#ffffff',

  danger: '#dc2626',
  ok: '#22c55e',
  warning: '#f59e0b',
  info: '#3b82f6',
  primary: '#007e3a',

  marker: {
    enAttenteAdmin: '#dc2626',
    enAttenteAutre: '#9ca3af',
    reparationPrevue: '#f97316',
    enReparation: '#3b82f6',
    termine: '#22c55e',
    suggestion: '#a855f7',
  },
};

export const STATUT_LABELS = {
  EN_ATTENTE_CONFIRMATION: 'En attente de confirmation',
  REPARATION_PREVUE: 'Réparation prévue',
  EN_REPARATION: 'En réparation',
  TERMINE: 'Terminé',
  CLOTURE: 'Clôturé',
};

export const ROLE_LABELS = {
  AGENT_PATROUILLE: 'Agent de patrouille',
  ADMIN_QG: 'Administrateur QG',
  EQUIPE_INTERVENTION: "Équipe d'intervention",
  CITOYEN: 'Citoyen',
};

export const TYPE_LABELS: Record<string, string> = {
  ROUTE: 'Route',
  ELECTRICITE_EAU: 'Électricité / eau',
  PROPRIETE_PUBLIQUE: 'Propriété publique',
  SALUBRITE: 'Propreté (salubrité)',
  ELECTRICITE: 'Électricité / eau',
  EAU: 'Électricité / eau',
};

export const STATUT_COLORS: Record<string, string> = {
  EN_ATTENTE_CONFIRMATION: '#dc2626',
  REPARATION_PREVUE: '#f97316',
  EN_REPARATION: '#3b82f6',
  TERMINE: '#22c55e',
  CLOTURE: '#16a34a',
};

export const TYPE_COLORS: Record<string, string> = {
  ROUTE: '#64748b',
  ELECTRICITE_EAU: '#0e7490',
  PROPRIETE_PUBLIQUE: '#7c3aed',
  SALUBRITE: '#15803d',
  ELECTRICITE: '#0e7490',
  EAU: '#0e7490',
};

export function markerColorForFeature(p: {
  kind?: string;
  statut?: keyof typeof STATUT_LABELS;
  urgence?: 'NORMAL' | 'URGENT';
}): string {
  if (p.kind === 'suggestion') return colors.marker.suggestion;
  switch (p.statut) {
    case 'EN_ATTENTE_CONFIRMATION':
      return colors.marker.enAttenteAdmin;
    case 'REPARATION_PREVUE':
      return colors.marker.reparationPrevue;
    case 'EN_REPARATION':
      return colors.marker.enReparation;
    case 'TERMINE':
    case 'CLOTURE':
      return colors.marker.termine;
    default:
      return colors.marker.enAttenteAutre;
  }
}
