// Exploratory: capture a short animated GIF of the WebLogcat hero
// composition (Mirror + Logcat + Shell + Dumpsys). Mirrors the seed
// state used by the existing `hero shot` Playwright test in
// scripts/capture-feature-screenshots.spec.ts so the framing matches
// the static PNG that ships today.
//
// Not wired into npm scripts; run with:
//   node scripts/capture-hero-gif.mjs

import { chromium } from '@playwright/test';
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!ffmpegPath) {
  throw new Error('ffmpeg-static did not resolve a binary for this platform');
}

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const OUT_DIR = path.resolve(ROOT, 'docs/public');
const OUT_GIF = path.resolve(OUT_DIR, 'screenshot.gif');

const FRAME_COUNT = 60;
const FRAME_INTERVAL_MS = 100; // 10 fps
const VIEWPORT = { width: 1440, height: 900 };
const EXEC_PATH = process.env.CHROMIUM_PATH || undefined;

const heroSeed = (theme) => {
  localStorage.clear();
  localStorage.setItem(
    'weblogcat:tweaks:v1',
    JSON.stringify({
      theme,
      accent: 'indigo',
      compactMode: true,
      performanceMode: 'on',
    }),
  );
  localStorage.setItem(
    'weblogcat-dashboard-v2',
    JSON.stringify({
      tiles: {
        w_mirror: { id: 'w_mirror', kind: 'mirror' },
        w_logcat: { id: 'w_logcat', kind: 'logcat' },
        w_shell: { id: 'w_shell', kind: 'shell' },
        w_dumpsys: { id: 'w_dumpsys', kind: 'dumpsys' },
      },
      tree: {
        type: 'split',
        dir: 'row',
        ratio: 0.32,
        a: { type: 'leaf', id: 'w_mirror' },
        b: {
          type: 'split',
          dir: 'col',
          ratio: 0.62,
          a: { type: 'leaf', id: 'w_logcat' },
          b: {
            type: 'split',
            dir: 'row',
            ratio: 0.5,
            a: { type: 'leaf', id: 'w_shell' },
            b: { type: 'leaf', id: 'w_dumpsys' },
          },
        },
      },
      focusId: 'w_logcat',
    }),
  );
};

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const framesDir = mkdtempSync(path.join(tmpdir(), 'hero-gif-'));
  console.log(`frames -> ${framesDir}`);

  const browser = await chromium.launch({ executablePath: EXEC_PATH });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  await page.addInitScript(heroSeed, 'dark');
  await page.goto('http://localhost:4173/');
  await page.getByRole('button', { name: /fake data/i }).click();
  await page.waitForSelector('.tile', { state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('.tile').length === 4);
  await page.waitForSelector('.row');
  await page.addStyleTag({ content: '.fake-badge,.toast{display:none!important}' });
  // Brief settle so the first frame doesn't catch a half-rendered widget.
  await page.waitForTimeout(800);

  const t0 = Date.now();
  for (let i = 0; i < FRAME_COUNT; i += 1) {
    const target = t0 + i * FRAME_INTERVAL_MS;
    const delay = target - Date.now();
    if (delay > 0) await page.waitForTimeout(delay);
    const file = path.join(framesDir, `frame-${String(i).padStart(4, '0')}.png`);
    await page.screenshot({ path: file, fullPage: false });
  }
  console.log(`captured ${FRAME_COUNT} frames in ${Date.now() - t0}ms`);

  await browser.close();

  // Build a palette for high-quality GIF (ffmpeg's standard two-pass).
  const palette = path.join(framesDir, 'palette.png');
  const fps = 1000 / FRAME_INTERVAL_MS;
  execFileSync(
    ffmpegPath,
    [
      '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame-%04d.png'),
      '-vf', 'scale=1280:-1:flags=lanczos,palettegen=stats_mode=diff',
      palette,
    ],
    { stdio: 'inherit' },
  );
  execFileSync(
    ffmpegPath,
    [
      '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame-%04d.png'),
      '-i', palette,
      '-lavfi', 'scale=1280:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5',
      '-loop', '0',
      OUT_GIF,
    ],
    { stdio: 'inherit' },
  );
  console.log(`wrote ${OUT_GIF}`);

  rmSync(framesDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
