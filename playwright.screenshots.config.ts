// Separate Playwright config for the docs screenshot capture script.
//
// `npm run docs:screenshots` runs `scripts/capture-feature-screenshots.spec.ts`
// against a vite-preview server, drives the simulator, and writes
// PNGs into `docs/features/img/`. CI's `npm run e2e` keeps using
// `playwright.config.ts` (testDir=./tests), so this script is opt-in
// and never blocks merges.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scripts',
  // Capture deterministically — no parallelism, no retries. The point
  // is bit-stable PNGs that diff cleanly when the UI hasn't changed.
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    // 2× device pixels for crisp screenshots on hi-DPI laptops.
    deviceScaleFactor: 2,
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // Allow overriding the browser binary so the script can run in
        // restricted environments where Playwright can't fetch its
        // pinned Chromium build (CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run docs:screenshots).
        ...(process.env.CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
