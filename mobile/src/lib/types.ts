export type Role = 'AGENT_PATROUILLE' | 'ADMIN_QG' | 'EQUIPE_INTERVENTION' | 'CITOYEN';

export type Statut =
  | 'EN_ATTENTE_CONFIRMATION'
  | 'REPARATION_PREVUE'
  | 'EN_REPARATION'
  | 'TERMINE'
  | 'CLOTURE';

export type Urgence = 'NORMAL' | 'URGENT';

export type TypeInfrastructure =
  | 'ROUTE'
  | 'ELECTRICITE_EAU'
  | 'PROPRIETE_PUBLIQUE'
  | 'SALUBRITE';

export type TypeInfrastructureLegacy = TypeInfrastructure | 'ELECTRICITE' | 'EAU';

export interface User {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: Role;
  zoneId: string | null;
}

export interface Ticket {
  id: string;
  description: string;
  photoSignalement: string;
  urgence: Urgence;
  statut: Statut;
  typeInfrastructure: TypeInfrastructureLegacy;
  zoneId: string;
  localisation: { latitude: number; longitude: number };
  visiblePublic: boolean;
  mission?: {
    assignedUserIds?: string[];
    photoCloture?: string;
    dateAssignation?: string;
    dateDebut?: string;
    dateFin?: string;
  } | null;
  dateSignalement?: string;
  updatedAt?: string;
  originSuggestionId?: string | null;
}

export interface SuggestionCitoyen {
  id: string;
  description: string;
  typeSuggere: TypeInfrastructureLegacy;
  pseudoCitoyen?: string | null;
  traitee: boolean;
  zoneId: string;
  localisation: { latitude: number; longitude: number };
  dateSoumission?: string;
  createdAt?: string;
  assignedPatrolUserId?: string | null;
  instructionQg?: string | null;
  dispatchedAt?: string | null;
  patrolAssignee?: { id: string; nom: string; prenom: string; matricule?: string | null } | null;
  photoCitoyen?: string | null;
  terrainClotureCode?: string | null;
  terrainClotureComment?: string | null;
}

export type TerrainClotureCodePatrouille = 'NON_CONFORME' | 'NON_REPERE' | 'AUTRE';

export interface GeoFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    kind: 'ticket' | 'suggestion';
    statut?: Statut;
    urgence?: Urgence;
    typeInfrastructure?: TypeInfrastructureLegacy;
    typeSuggere?: TypeInfrastructureLegacy;
    zoneId?: string;
    visiblePublic?: boolean;
  };
}

export interface MapTilesPayload {
  layers: string[];
  geojson: { type: 'FeatureCollection'; features: GeoFeature[] };
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface Zone {
  id: string;
  nom: string;
  type: string;
  code: string;
  numeroQg?: string | null;
  geometrie?: GeoJsonPolygon | { type: string; coordinates?: unknown } | null;
}
