/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL absolue de l’API si le front n’utilise pas le proxy (ex. http://localhost:4000). */
  readonly VITE_API_URL?: string;
  /** Cible du proxy Vite (dev + preview). Défaut : http://localhost:4000 */
  readonly VITE_PROXY_TARGET?: string;
  /** Clé Google Maps JavaScript API (obligatoire pour la carte). */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /** (Optionnel) Map ID de la console Google Cloud pour cartes vectorielles / AdvancedMarker. */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
