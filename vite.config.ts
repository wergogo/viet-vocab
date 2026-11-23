import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };
import { contentSecurityPolicy } from './src/lib/csp.ts';

/** GitHub Pages serves the app at https://<user>.github.io/viet-vocab/ (spec §13). */
const BASE = '/viet-vocab/';

/** About shows the version, and a deploy adds its commit, so a phone can tell which build it runs. */
const COMMIT = process.env.GITHUB_SHA?.slice(0, 7);

/** Puts the Content-Security-Policy into built pages only, since the dev server's module reloading needs more (§7.5). */
function csp(mode: string): Plugin {
  return {
    name: 'viet-vocab-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(mode) },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig(({ command, mode, isPreview }) => ({
  // Built files, and `vite preview` serving them, live under the Pages path; the dev server stays at the root.
  base: command === 'build' || isPreview ? BASE : '/',
  plugins: [
    svelte(),
    // Spec §10: the service worker precaches the whole app, and a new version waits for the update bar's Reload.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // src/lib/pwa/pwa.ts registers it
      includeAssets: ['favicon.png'],
      workbox: {
        // The service worker answers every page load in its scope with the app, so About's link to the licence texts
        // would open the app again. Loads of that file go to the network instead.
        navigateFallbackDenylist: [/\/licenses\.txt$/],
      },
      manifest: {
        id: BASE,
        name: 'Viet Vocab',
        short_name: 'Viet Vocab',
        description: 'Vietnamese words with their Hán characters, IPA and meanings, reviewed with spaced repetition.',
        lang: 'en',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        theme_color: '#ffffff',
        background_color: '#faf7f2',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
    csp(mode),
  ],
  build: {
    // Minifying strips the libraries' licence comments, so their texts go into a file that About links to (spec §15).
    license: { fileName: 'licenses.txt' },
  },
  define: {
    __APP_VERSION__: JSON.stringify(COMMIT ? `${pkg.version}+${COMMIT}` : pkg.version),
  },
  test: {
    environment: 'happy-dom',
    globalSetup: ['./src/test-global-setup.ts'],
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
  },
}));
