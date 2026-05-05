import { defineConfig } from 'vite';
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
});
