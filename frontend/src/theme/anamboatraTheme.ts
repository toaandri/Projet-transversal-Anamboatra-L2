export const anam = {
  sage: '#d0d9d4',
  sageDeep: '#b9c4be',
  teal: '#3e605f',
  tealDark: '#2d4847',
  lime: '#e2e889',
  limeDeep: '#cdd36f',
  ink: '#1a2422',
  muted: '#4a5c59',
  textSoft: '#2a3835',
  mgRed: '#c8102e',
  mgGreen: '#007e3a',
  mgGreenDeep: '#0a5c32',
  blue: '#1a73e8',
    violet: '#6b5480',
    amber: '#d97706',
  amberDeep: '#b45309',
} as const;

export const anamRgba = {
  tealStrokeSoft: 'rgba(62, 96, 95, 0.22)',
  tealFillSoft: 'rgba(62, 96, 95, 0.07)',
  tealIcon: 'rgba(62, 96, 95, 0.42)',
} as const;

export const typeInfraColors: Record<string, string> = {
  ROUTE: anam.teal,
  ELECTRICITE_EAU: anam.blue,
  PROPRIETE_PUBLIQUE: '#5c4d6b',
  SALUBRITE: anam.mgGreen,
  ELECTRICITE: anam.blue,
  EAU: anam.blue,
};

export const statutUiColors: Record<string, string> = {
  EN_ATTENTE_CONFIRMATION: anam.mgRed,
  REPARATION_PREVUE: '#d97706',
  EN_REPARATION: anam.blue,
  TERMINE: anam.mgGreen,
  CLOTURE: anam.mgGreenDeep,
};
