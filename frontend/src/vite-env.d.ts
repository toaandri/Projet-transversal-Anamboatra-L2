/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_PROXY_TARGET?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
  readonly VITE_ANTANANARIVO_VIDEO_ID?: string;
  readonly VITE_HERO_VIDEO_SRC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
