// Opens the options from the main menu, lowers the music, switches language and accepts.
// Usage: node tools/dev/shoot-options.mjs <baseUrl> <outDir>
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
  const ready = () => page.waitForFunction('document.body.dataset.ready || document.body.dataset.error', { timeout: 20000 });
  await page.goto(base, { waitUntil: 'load', timeout: 20000 });
  await ready();
  const box = await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const at = (gx, gy) => [box.x + (gx / 480) * box.w, box.y + (gy / 320) * box.h];
  const saved = () => page.evaluate(() => localStorage.getItem('am2web.settings.v1'));
  await page.mouse.click(...at(359, 237)); // Options entry
  await sleep(400);
  await page.screenshot({ path: `${outDir}/O1-options.png` });
  // The dialog is 300x232 centred: its corner is at (90, 44). Music slider at y 104, from x 150 to 270.
  await page.mouse.move(...at(90 + 270, 44 + 104)); await page.mouse.down(); await page.mouse.move(...at(90 + 180, 44 + 104), { steps: 6 }); await page.mouse.up();
  await page.mouse.click(...at(90 + 150 + 60 + 74, 44 + 144)); // next language
  await sleep(300);
  await page.screenshot({ path: `${outDir}/O2-options-changed.png` });
  await page.mouse.click(...at(240, 44 + 194)); // Accept: a new language reloads the page
  await sleep(2500);
  await ready();
  console.log('saved:', await saved());
  await page.screenshot({ path: `${outDir}/O3-menu-new-language.png` });
  console.log('problems:', problems.length ? problems : 'none');
} finally {
  await browser.close();
}
