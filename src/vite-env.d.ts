/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** A stand-in for https://api.github.com in browser checks (scripts/fake-github.mjs, M4 decision 17). */
  readonly VITE_GITHUB_API?: string;
}
