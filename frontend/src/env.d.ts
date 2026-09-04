/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL du projet Supabase. Absente = mode local seul. */
  readonly VITE_SUPABASE_URL?: string
  /** Clé anon du projet Supabase. Publique : les droits viennent de la RLS. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Empreinte des fichiers de `public/data/`, injectée au build : voir `vite.config.ts`. */
declare const __DATA_VERSION__: string
