// Captures the main menu and the world map, and follows Play from the menu to a level.
// Usage: node tools/dev/shoot-menu.mjs <baseUrl> <outDir>
import { createRequire } from 'node:module';
const require = createRequire(process.env.PUPPETEER_FROM ?? '/Users/msaucedo/Documents/code/node_modules/');
const puppeteer = require('puppeteer-core');

const [base, outDir] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=960,640'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 640 });
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon') && !m.text().includes('404')) problems.push('console: ' + m.text()); });
  await page.goto(base + '?mute', { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction('document.body.dataset.ready || document.body.dataset.error', { timeout: 20000 });
  await sleep(500);
  await page.screenshot({ path: `${outDir}/M1-menu.png` });
  const box = await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const at = (gx, gy) => [box.x + (gx / 480) * box.w, box.y + (gy / 320) * box.h];
  await page.mouse.move(...at(359, 161));
  await sleep(300);
  await page.screenshot({ path: `${outDir}/M2-menu-hover.png` });
  await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }), page.mouse.click(...at(359, 161))]);
  await page.waitForFunction('document.body.dataset.ready || document.body.dataset.error', { timeout: 20000 });
  console.log('after Play:', new URL(page.url()).search);
  await sleep(600);
  await page.screenshot({ path: `${outDir}/M3-map.png` });
  // Drag the map to the left and back, then start the selected level with the bar's Play button.
  await page.mouse.move(...at(300, 120)); await page.mouse.down(); await page.mouse.move(...at(60, 120), { steps: 8 }); await page.mouse.up();
  await sleep(300);
  await page.screenshot({ path: `${outDir}/M4-map-scrolled.png` });
  await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }), page.mouse.click(...at(419, 295))]);
  await page.waitForFunction('document.body.dataset.ready || document.body.dataset.error', { timeout: 20000 });
  console.log('after map Play:', new URL(page.url()).search);
  console.log('problems:', problems.length ? problems : 'none');
} finally {
  await browser.close();
}
