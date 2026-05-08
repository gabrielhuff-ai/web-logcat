// VitePress config for the WebLogcat docs site.
//
// The docs are served as a separate static app under `<app>/docs/`:
//   - Production: https://<owner>.github.io/web-logcat/docs/
//   - Staging:    https://<owner>.github.io/web-logcat/staging/docs/
//   - Local dev:  http://localhost:5174/  (vitepress dev)
//
// `base` is set from the DOCS_BASE_PATH env var so the deploy workflow
// can point it at the right subdirectory for each environment. The
// build output goes into `<repo>/dist/docs/` so the existing
// `actions-gh-pages` step publishes the app and the docs in one shot.

import { defineConfig } from 'vitepress';

const base = process.env.DOCS_BASE_PATH ?? '/';

// Placeholder href for "Open WebLogcat" links. The real URL of the
// live app depends on the *current* page (relative `../` from the
// docs root vs `../../` from a feature page) and on the deploy
// environment (production vs staging vs local dev), so we can't
// hard-code it in the static VitePress config. Instead, every
// "Open WebLogcat" anchor ships with this sentinel as its href and
// gets rewritten at runtime by `theme/index.ts`'s `fixAppLinks()`
// to `<window-host>/<app-base>/`. The sentinel itself is a 404 if
// clicked before the rewrite runs — but the rewrite happens on
// initial paint and after every route change, so the window is
// well under a second.
const APP_LINK = '/__open_app__';

export default defineConfig({
  title: 'WebLogcat',
  description: 'Browser-based Android device inspector — Logcat, Shell, Dumpsys, Files, Mirror.',
  base,
  // VitePress resolves `outDir` relative to the docs source root
  // (this `docs/` directory), so `../dist/docs` lands at
  // `<repo>/dist/docs/` — which is exactly what
  // `actions-gh-pages` then publishes into `<base>/docs/`.
  outDir: '../dist/docs',
  cleanUrls: true,
  lastUpdated: true,
  appearance: 'dark',
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['meta', { name: 'color-scheme', content: 'dark light' }],
    // JetBrains Mono — same family the main app uses. The docs theme
    // overrides --vp-font-family-mono in style.css so code blocks
    // render in the same monospace as the in-app log view.
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap',
      },
    ],
  ],
  themeConfig: {
    logo: '/favicon.svg',
    siteTitle: 'WebLogcat docs',

    nav: [
      { text: 'Features', link: '/features/', activeMatch: '/features/' },
      { text: 'Contributors', link: '/devs/', activeMatch: '/devs/' },
      { text: 'For agents', link: '/bots/', activeMatch: '/bots/' },
      {
        text: 'Open WebLogcat ↗',
        link: APP_LINK,
        target: '_blank',
        rel: 'noopener',
      },
    ],

    sidebar: {
      '/features/': [
        {
          text: 'Features',
          items: [
            { text: 'Overview', link: '/features/' },
            { text: 'Connecting a device', link: '/features/connecting' },
            { text: 'Dashboard & layout', link: '/features/dashboard' },
            { text: 'Logcat', link: '/features/logcat' },
            { text: 'Shell', link: '/features/shell' },
            { text: 'Dumpsys', link: '/features/dumpsys' },
            { text: 'Files', link: '/features/files' },
            { text: 'Screen Mirror', link: '/features/screen-mirror' },
            { text: 'Simulated stream', link: '/features/simulator' },
            { text: 'Appearance & settings', link: '/features/settings' },
          ],
        },
      ],
      '/devs/': [
        {
          text: 'Contributing',
          items: [
            { text: 'Overview', link: '/devs/' },
            { text: 'Contributing guide', link: '/devs/contributing' },
            { text: 'Architecture', link: '/devs/architecture' },
            { text: 'Deployment', link: '/devs/deployment' },
            { text: 'Release plan', link: '/devs/release-plan' },
            { text: 'Docs conventions', link: '/devs/docs-conventions' },
          ],
        },
      ],
      '/bots/': [
        {
          text: 'For agents',
          items: [
            { text: 'Overview', link: '/bots/' },
            { text: 'Widget contract', link: '/bots/widgets-contract' },
            { text: 'Doc-sync rules', link: '/bots/doc-sync' },
            { text: 'Test-sync rules', link: '/bots/test-sync' },
            { text: 'Screenshot pipeline', link: '/bots/screenshots' },
            { text: 'Maintaining bots/', link: '/bots/maintaining' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/gabrielhuff/web-logcat' },
    ],

    search: { provider: 'local' },

    editLink: {
      pattern: 'https://github.com/gabrielhuff/web-logcat/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT license.',
      copyright: 'WebLogcat — Browser-based Android inspector.',
    },
  },
});
