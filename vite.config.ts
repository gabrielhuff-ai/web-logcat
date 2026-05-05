// `defineConfig` from `vitest/config` (rather than `vite`) extends the
// Vite config type with the `test` property — without it, tsc -b on
// vite.config.ts fails with "test does not exist in type
// UserConfigExport". Equivalent at runtime to the regular vite import.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base` controls the public path the app is served from.
//
//   - GitHub Pages production: /web-logcat/
//   - GitHub Pages staging:    /web-logcat/staging/
//   - Local dev / preview:     /
//
// The deploy workflow sets BASE_PATH at build time. See
// .github/workflows/deploy.yml and docs/DEPLOYMENT.md.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    // Scope Vitest to the unit tests under src/. Playwright specs in
    // tests/ live in their own runner — without this they'd both be
    // picked up by Vitest, which doesn't know how to execute them.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
