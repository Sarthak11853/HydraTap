// Renders the HydraTap icon set from assets/icon-source/bottle.js using the
// Playwright Chromium. Usage: node scripts/render-icons.mjs
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { bottle, background } = await import(pathToFileURL(join(root, 'assets/icon-source/bottle.js')).href);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const out = join(root, 'assets/images');
mkdirSync(out, { recursive: true });

// scale: bottle size relative to canvas, centred.
const svg = (inner, { scale = 1, size = 1024, bg = '' } = {}) => {
  const t = (1 - scale) * 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${bg}<g transform="translate(${t} ${t + 14 * scale}) scale(${scale})">${inner}</g></svg>`;
};

const jobs = [
  { file: 'icon.png', size: 1024, svg: svg(bottle(), { scale: 0.86, bg: background() }) },
  { file: 'android-icon-background.png', size: 1024, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">${background()}</svg>` },
  // Adaptive icon foreground: keep the bottle inside the 66% safe zone.
  { file: 'android-icon-foreground.png', size: 1024, transparent: true, svg: svg(bottle(), { scale: 0.6 }) },
  { file: 'android-icon-monochrome.png', size: 1024, transparent: true, svg: svg(bottle({ mono: true }), { scale: 0.6 }) },
  { file: 'splash-icon.png', size: 512, transparent: true, svg: svg(bottle(), { scale: 0.95, size: 512 }) },
  { file: 'favicon.png', size: 48, svg: svg(bottle(), { scale: 0.9, size: 48, bg: background() }) },
  { file: 'notification-icon.png', size: 96, transparent: true, svg: svg(bottle({ mono: true }), { scale: 0.92, size: 96 }) },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const job of jobs) {
  await page.setViewportSize({ width: job.size, height: job.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${job.svg}</body></html>`);
  await page.screenshot({ path: join(out, job.file), omitBackground: !!job.transparent, clip: { x: 0, y: 0, width: job.size, height: job.size } });
  console.log('rendered', job.file);
}
await browser.close();
