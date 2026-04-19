export type Role = 'AGENT_PATROUILLE' | 'ADMIN_QG' | 'EQUIPE_INTERVENTION' | 'CITOYEN';

export type Statut =
  | 'EN_ATTENTE_CONFIRMATION'
  | 'REPARATION_PREVUE'
  | 'EN_REPARATION'
  | 'TERMINE'
  | 'CLOTURE';

export type Urgence = 'NORMAL' | 'URGENT';

export type TypeInfrastructure = 'ROUTE' | 'ELECTRICITE' | 'EAU';

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
  typeInfrastructure: TypeInfrastructure;
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
}

export interface GeoFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    kind: 'ticket' | 'suggestion';
    statut?: Statut;
    urgence?: Urgence;
    typeInfrastructure?: TypeInfrastructure;
    typeSuggere?: TypeInfrastructure;
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

export interface SuggestionCitoyen {
  id: string;
  description: string;
  typeSuggere: TypeInfrastructure;
  pseudoCitoyen?: string | null;
  traitee: boolean;
  zoneId: string;
  localisation: { latitude: number; longitude: number };
  dateSoumission?: string;
  createdAt?: string;
}
