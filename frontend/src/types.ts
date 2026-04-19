export type Role =
  | 'SUPER_ADMIN'
  | 'AGENT_PATROUILLE'
  | 'ADMIN_QG'
  | 'EQUIPE_INTERVENTION'
  | 'CITOYEN';

export type TypeZone = 'ARRONDISSEMENT' | 'ROUTE_NATIONALE' | 'DEPOT_REPARATION';

export type Statut =
  | 'EN_ATTENTE_CONFIRMATION'
  | 'REPARATION_PREVUE'
  | 'EN_REPARATION'
  | 'TERMINE'
  | 'CLOTURE';

export type Urgence = 'NORMAL' | 'URGENT';

/** Types d'infrastructure remontés par citoyens / agents dans un ticket. */
export type TypeInfrastructure = 'ROUTE' | 'ELECTRICITE' | 'EAU';

/** Spécialité d'une EQUIPE_INTERVENTION (indépendante de TypeInfrastructure). */
export type Specialite = 'ROUTE' | 'JIRAMA' | 'MACON' | 'NETTOYEUR';

export interface User {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: Role;
  zoneId: string | null;
  numeroTelephone?: string | null;
  specialite?: Specialite | null;
}

export interface Zone {
  id: string;
  nom: string;
  type: TypeZone | string;
  code: string;
  numeroQg?: string | null;
  geometrie?: GeoJsonPolygon | GeoJsonPoint | null;
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface AdminQg {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  matricule: string | null;
  role: 'ADMIN_QG';
  zoneId: string | null;
  numeroTelephone: string | null;
  specialite: null;
  actif: boolean;
}

/** Agent de patrouille (géré par l'Admin QG de sa zone). */
export interface Agent {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  matricule: string | null;
  role: 'AGENT_PATROUILLE';
  zoneId: string;
  numeroTelephone: string | null;
  specialite: null;
  appareilLie: boolean;
  actif: boolean;
}

/** Agent de réparation (EQUIPE_INTERVENTION) géré par le super-admin. */
export interface RepairAgent {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  matricule: string | null;
  role: 'EQUIPE_INTERVENTION';
  zoneId: string; // DEPOT_REPARATION
  numeroTelephone: string | null;
  specialite: Specialite;
  appareilLie: boolean;
  actif: boolean;
}

export interface GeoJsonFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

export interface MapTilesPayload {
  layers: string[];
  geojson: {
    type: 'FeatureCollection';
    features: GeoJsonFeature[];
  };
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

export interface EquipeUser {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  matricule: string | null;
  zoneId: string;
  specialite?: Specialite | null;
}
