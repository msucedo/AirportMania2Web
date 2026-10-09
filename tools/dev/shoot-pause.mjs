// Pauses a level, changes the music volume from the pause menu's options, resumes, then pauses
// again and leaves for the map. Usage: node tools/dev/shoot-pause.mjs <baseUrl> <outDir>
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
  await page.goto(base + '?stage=1&level=1&mute', { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction('document.body.dataset.ready || document.body.dataset.error', { timeout: 20000 });
  const box = await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const at = (gx, gy) => [box.x + (gx / 480) * box.w, box.y + (gy / 320) * box.h];
  const time = () => page.evaluate(() => window.game.sim.time);
  // Pause menu: 220x236 centred, corner at (130, 42); buttons at y 70, 112, 154, 196.
  const entry = (i) => at(240, 42 + 70 + i * 42);
  await sleep(1200);
  await page.mouse.click(...at(452, 14)); // menu button
  await sleep(400);
  const stopped = await time();
  await page.screenshot({ path: `${outDir}/P1-pause.png` });
  await sleep(700);
  console.log('time stands still while paused:', (await time()) === stopped);
  await page.mouse.click(...entry(1)); // options
  await sleep(400);
  // Options without the language row: 300x192 centred, corner at (90, 64); music slider at y 104.
  await page.mouse.move(...at(90 + 270, 64 + 104)); await page.mouse.down(); await page.mouse.move(...at(90 + 210, 64 + 104), { steps: 5 }); await page.mouse.up();
  await page.screenshot({ path: `${outDir}/P2-pause-options.png` });
  await page.mouse.click(...at(240, 64 + 154)); // accept
  await sleep(400);
  console.log('saved:', await page.evaluate(() => localStorage.getItem('am2web.settings.v1')));
  await page.mouse.click(...entry(0)); // resume
  await sleep(800);
  console.log('time runs again after resuming:', (await time()) > stopped, '| planes untouched by menu clicks:', await page.evaluate(() => window.game.sim.selected === null));
  await page.mouse.click(...at(452, 14));
  await sleep(400);
  await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }), page.mouse.click(...entry(3))]);
  console.log('after "map":', new URL(page.url()).search);
  console.log('problems:', problems.length ? problems : 'none');
} finally {
  await browser.close();
}
