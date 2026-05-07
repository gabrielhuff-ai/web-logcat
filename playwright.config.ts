import { defineConfig } from '@playwright/test';

// Smoke tests run against a locally-served preview build (vite preview).
// They cover the simulated-data path end-to-end: empty state, connect,
// log streaming, filter chip + autocomplete. The real WebUSB+ADB path
// can't be tested headlessly (no devices in CI), so it's excluded.
//
// CI invokes this via `npm run e2e`; locally `npx playwright test` works
// once `npx playwright install --with-deps chromium` has been run.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // Tells the browser to advertise `prefers-reduced-motion: reduce`,
    // which the app's `performanceModeOn` heuristic in `lib/tweaks.ts`
    // honours by toggling `[data-perf="on"]` on the document. That
    // disables the position transitions on `.tile`, so bounding-box
    // probes after a drag/resize/add see the final layout instead of
    // a frame mid-easing. The app's runtime UX still animates for
    // real users — the toggle only affects this headless context.
    reducedMotion: 'reduce',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // `npm run preview` serves whatever is in `dist/`. The CI workflow
    // does a separate `npm run build` ahead of `npm run e2e` so the
    // preview server has something to serve.
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
