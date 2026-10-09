// Opens a level's menu, changes the music volume in its options, resumes, then opens it again
// and leaves for the map through the finish dialog. Usage: node tools/dev/shoot-pause.mjs <baseUrl> <outDir>
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
  await page.goto(base + '?stage=1&level=1&mute&nointro', { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction('document.body.dataset.ready || document.body.dataset.error', { timeout: 20000 });
  const box = await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const at = (gx, gy) => [box.x + (gx / 480) * box.w, box.y + (gy / 320) * box.h];
  const time = () => page.evaluate(() => window.game.sim.time);
  // The menu dialog is centred on (240, 160). In-game page: Options, Help, Finish game at y -90,
  // -30, 30 and Resume at 100. Options page: music slider at y -35 from x 10 to 160, Back at 90.
  // Finish page: restart, map, main menu at y -100, -40, 20 and Resume at 110.
  const at0 = (x, y) => at(240 + x, 160 + y);
  await sleep(1200);
  await page.mouse.click(...at(452, 14)); // menu button
  await sleep(400);
  const stopped = await time();
  await page.screenshot({ path: `${outDir}/P1-menu.png` });
  await sleep(700);
  console.log('time stands still while the menu is open:', (await time()) === stopped);
  await page.mouse.click(...at0(0, -90)); // options
  await sleep(400);
  await page.mouse.move(...at0(160, -35)); await page.mouse.down(); await page.mouse.move(...at0(85, -35), { steps: 5 }); await page.mouse.up();
  await page.screenshot({ path: `${outDir}/P2-menu-options.png` });
  console.log('saved:', await page.evaluate(() => localStorage.getItem('am2web.settings.v1')));
  await page.mouse.click(...at0(0, 90)); // back
  await sleep(400);
  await page.mouse.click(...at0(0, 100)); // resume
  await sleep(800);
  console.log('time runs again after resuming:', (await time()) > stopped, '| planes untouched by menu clicks:', await page.evaluate(() => window.game.sim.selected === null));
  await page.mouse.click(...at(452, 14));
  await sleep(400);
  await page.mouse.click(...at0(0, 30)); // finish game
  await sleep(400);
  await page.screenshot({ path: `${outDir}/P3-finish.png` });
  await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }), page.mouse.click(...at0(0, -40))]);
  console.log('after "map":', new URL(page.url()).search);
  console.log('problems:', problems.length ? problems : 'none');
} finally {
  await browser.close();
}
