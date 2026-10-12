// Sets up a wash on Africa (level 6-8) and captures the plane through its last second.
// Usage: node tools/dev/shoot-wash.mjs <baseUrl> <outDir>
import { createRequire } from 'node:module';
const require = createRequire(process.env.PUPPETEER_FROM ?? '/Users/msaucedo/Documents/code/node_modules/');
const puppeteer = require('puppeteer-core');
const [base, outDir] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 640 });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  const open = async (q) => { await page.goto(`${base}${q}`, { waitUntil: 'load' }); await page.waitForFunction('document.body.dataset.ready || document.body.dataset.error', { timeout: 30000 }); };
  await open('?reset&mute');
  await page.evaluate(() => [1, 0x77].map((id) => window.progress.buy(6, 8, id, 0)));
  await open('?stage=6&level=8&mute&go&nointro');
  await page.waitForFunction('window.game && window.game.sim', { timeout: 30000 });
  const info = await page.evaluate(async () => {
    const s = window.game.sim;
    for (let i = 0; i < 900 && s.planes.length === 0; i++) s.update(1 / 60);
    const p = s.planes[0];
    await window.game.textures.load([0, 1, 2].map((n) => `PLANE.TYPE${p.descriptor.type}.DIRT.${n}`));
    p.washDone = false;
    s.press(p.x - 2, p.y - p.altitude - 30, false);
    const r = s.runways[0];
    s.press(r.position.x, r.position.y, false);
    for (let i = 0; i < 60 * 40 && !p.landed; i++) s.update(1 / 60);
    const w = s.stopSpots.find((x) => x.wash);
    if (!w) return 'no wash';
    s.press(p.x - 2, p.y - 30, false);
    s.press(w.position.x, w.position.y, false);
    for (let i = 0; i < 60 * 40 && !(w.wash.left !== null); i++) s.update(1 / 60);
    window.__w = w; window.__p = p;
    return JSON.stringify({ state: p.state, left: w.wash.left, x: p.x, y: p.y });
  });
  console.log(info);
  for (let k = 0; k < 400; k++) { const left = await page.evaluate(() => window.__w.wash.left); if (k % 40 === 0) console.log('left', left, await page.evaluate(() => window.game.paused)); if (left === null || left < 1.02) break; if (await page.evaluate(() => window.game.paused)) { await page.screenshot({ path: `${outDir}/wash-paused.png` }); await page.mouse.click(480, 480); await sleep(300); } await sleep(25); }
  for (const n of [0, 1, 2, 3]) {
    const left = await page.evaluate(() => window.__w.wash.left);
    await page.screenshot({ path: `${outDir}/shake-${n}.png`, clip: { x: 200, y: 380, width: 360, height: 260 } });
    console.log(n, left);
  }
} finally { await browser.close(); }
