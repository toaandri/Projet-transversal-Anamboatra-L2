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
  /**
   * (Optionnel) ID YouTube de la vidéo illustrative Antananarivo sur l’accueil storytelling.
   * Ex. chaîne YouTube après watch?v=
   */
  readonly VITE_ANTANANARIVO_VIDEO_ID?: string;
  /** Chemin ou URL du MP4 hero (ex. `/videos/mon-fichier.mp4`). Vide = fichier par défaut `public/videos/tana-hero-1080p.mp4`. */
  readonly VITE_HERO_VIDEO_SRC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
