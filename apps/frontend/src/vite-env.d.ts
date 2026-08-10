/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VOUCH_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
