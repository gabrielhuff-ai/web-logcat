// Exploratory: capture an animated hero GIF of the WebLogcat
// dashboard being built up from a logcat-only baseline to the
// canonical four-widget layout and then torn back down so the GIF
// loops cleanly.
//
// Choreography:
//   1. Boot with the default layout (logcat only, non-compact).
//   2. Add a Screen Mirror widget, swap it to the left half.
//   3. Add a Shell widget; type `echo Hello world.` and run it.
//   4. Add a Dumpsys widget. Brief hold on the four-tile composition.
//   5. Close the three new widgets in reverse order so the layout
//      returns to logcat-only — matching the first frame so a
//      browser will loop the GIF without a visible seam.
//
// Records a webm via Playwright, then converts to GIF with the
// ffmpeg binary bundled by the `ffmpeg-static` devDep so any session
// with `npm ci` can reproduce it.
//
// Not wired into npm scripts; run with:
//   node scripts/capture-hero-gif.mjs

import { chromium } from '@playwright/test';
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, readdirSync, statSync, renameSync } from 'node:fs';
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

const VIEWPORT = { width: 1280, height: 800 };
const EXEC_PATH = process.env.CHROMIUM_PATH || undefined;

const seedSimulatorState = () => {
  localStorage.clear();
  localStorage.setItem(
    'weblogcat:tweaks:v1',
    JSON.stringify({
      theme: 'dark',
      accent: 'indigo',
      // non-compact so the demo matches the layout in the brief
      compactMode: false,
      performanceMode: 'on',
    }),
  );
};

async function pause(page, ms) {
  await page.waitForTimeout(ms);
}

async function addWidget(page, label) {
  await page.getByRole('button', { name: /add widget/i }).click();
  await page.locator('.palette-card').filter({ hasText: label }).click();
}

async function tileHeader(page, widgetClass) {
  return page.locator('.tile').filter({ has: page.locator(widgetClass) }).locator('.tile-head').first();
}

async function dragSwap(page, fromHeader, toHeader) {
  const fromBox = await fromHeader.boundingBox();
  const toBox = await toHeader.boundingBox();
  if (!fromBox || !toBox) throw new Error('drag-swap: missing bounding box');
  const fromX = fromBox.x + fromBox.width / 2;
  const fromY = fromBox.y + fromBox.height / 2;
  const toX = toBox.x + toBox.width / 2;
  const toY = toBox.y + toBox.height / 2;
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  // The drag activates after the pointer moves a few pixels; sweep
  // along an arc so the swap-zone highlight has time to render in
  // the recorded video.
  const steps = 24;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const x = fromX + (toX - fromX) * t;
    const y = fromY + (toY - fromY) * t;
    await page.mouse.move(x, y, { steps: 1 });
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
}

async function closeTile(page, widgetClass) {
  const tile = page.locator('.tile').filter({ has: page.locator(widgetClass) });
  await tile.locator('button[aria-label="Remove tile"]').click();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const videoDir = mkdtempSync(path.join(tmpdir(), 'hero-vid-'));

  const browser = await chromium.launch({ executablePath: EXEC_PATH });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    recordVideo: { dir: videoDir, size: VIEWPORT },
  });
  const page = await context.newPage();

  await page.addInitScript(seedSimulatorState);
  await page.goto('http://localhost:4173/');
  await page.getByRole('button', { name: /fake data/i }).click();
  await page.waitForSelector('.lc-widget');
  await page.waitForSelector('.row');
  await page.addStyleTag({ content: '.fake-badge,.toast{display:none!important}' });

  // Settle on the logcat-only baseline so the first frame matches
  // the last frame (clean loop point).
  await pause(page, 1500);

  // --- Add Mirror, then swap it to the left half --------------------
  await addWidget(page, /Screen Mirror/);
  await page.waitForSelector('.mr-widget');
  await pause(page, 900);

  const mirrorHead = await tileHeader(page, '.mr-widget');
  const logcatHead = await tileHeader(page, '.lc-widget');
  await dragSwap(page, mirrorHead, logcatHead);
  await pause(page, 700);

  // Re-focus logcat so the next add splits it (top/bottom).
  await (await tileHeader(page, '.lc-widget')).click();
  await pause(page, 400);

  // --- Add Shell underneath logcat ---------------------------------
  await addWidget(page, /Shell/);
  await page.waitForSelector('.sh-widget');
  await pause(page, 700);

  const shellInput = page.locator('input[aria-label="Shell input"]');
  await shellInput.click();
  await pause(page, 200);
  await shellInput.pressSequentially('echo Hello world.', { delay: 60 });
  await pause(page, 250);
  await shellInput.press('Enter');
  await pause(page, 900);

  // --- Add Dumpsys next to shell -----------------------------------
  await addWidget(page, /Dumpsys/);
  await page.waitForSelector('.ds-widget');
  // Brief hold on the canonical four-tile composition.
  await pause(page, 1400);

  // --- Tear down so the GIF loops back to logcat-only --------------
  await closeTile(page, '.ds-widget');
  await pause(page, 500);
  await closeTile(page, '.sh-widget');
  await pause(page, 500);
  await closeTile(page, '.mr-widget');
  await pause(page, 1200);

  await context.close();
  await browser.close();

  // Playwright names the video with a random id; grab whichever
  // .webm landed in the dir.
  const webm = readdirSync(videoDir)
    .filter((f) => f.endsWith('.webm'))
    .map((f) => path.join(videoDir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (!webm) throw new Error('no recorded video found');
  console.log(`recorded ${webm} (${statSync(webm).size} bytes)`);

  const palette = path.join(videoDir, 'palette.png');
  const fps = 8;
  const width = 720;
  // Trim the lead-in: the video starts before `page.goto`, so the
  // first ~1.5s is the dark splash. Skipping it makes the first GIF
  // frame match the last (logcat-only baseline) for a clean loop.
  const trimSeconds = 1.7;
  // mpdecimate drops near-duplicate frames so static "hold" beats
  // don't pay frame-by-frame in the final stream. The same chain is
  // applied for palettegen and paletteuse so the palette covers
  // exactly the frames that survive decimation.
  const filterChain =
    `fps=${fps},scale=${width}:-1:flags=lanczos,` +
    'mpdecimate=hi=64*32:lo=64*16:frac=0.5';
  execFileSync(
    ffmpegPath,
    [
      '-y',
      '-ss', String(trimSeconds),
      '-i', webm,
      '-vf', `${filterChain},palettegen=stats_mode=diff`,
      palette,
    ],
    { stdio: 'inherit' },
  );
  execFileSync(
    ffmpegPath,
    [
      '-y',
      '-ss', String(trimSeconds),
      '-i', webm,
      '-i', palette,
      '-lavfi',
      `[0:v]${filterChain}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
      '-loop', '0',
      '-gifflags', '+transdiff',
      OUT_GIF,
    ],
    { stdio: 'inherit' },
  );
  console.log(`wrote ${OUT_GIF} (${statSync(OUT_GIF).size} bytes)`);

  rmSync(videoDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
