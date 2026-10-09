// Checks the game flow: a finished level, its report and what it saves, then the shop before the
// next level: buying an improvement and seeing it in the airport. Usage: node tools/dev/shoot-flow.mjs <baseUrl> <outDir>
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
  const open = async (query) => {
    await page.goto(`${base}${query}`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForFunction('document.body.dataset.ready || document.body.dataset.error', { timeout: 20000 });
    const error = await page.evaluate('document.body.dataset.error');
    if (error) throw new Error(error);
    await sleep(500);
  };
  const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` });
  const click = async (gx, gy) => {
    const r = await page.evaluate(() => { const b = document.querySelector('canvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
    await page.mouse.click(r.x + (gx / 480) * r.w, r.y + (gy / 320) * r.h);
  };
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('am2web.progress.v2') ?? 'null'));

  await open('?reset&mute'); await shot('F0-main-menu');
  // Play level 1 perfectly through the simulation API: every plane lands, uses a gate and leaves.
  await open('?level=1&mute');
  const result = await page.evaluate(() => {
    const sim = window.game.sim; const handled = new Set();
    for (let i = 0; i < 60 * 400 && !sim.ended; i++) {
      for (const p of sim.planes) {
        if (p.gone) continue;
        const gate = sim.gates.find((g) => g.service === 'idle' && !sim.planes.some((q) => q !== p && !q.gone && (q.place === g || q.queue.includes(g))));
        const runway = sim.runways.find((r) => r.use === 'free' && !sim.planes.some((q) => q !== p && !q.gone && q.queue.includes(r))) ?? sim.runways[0];
        if (!p.landed && !p.landing && p.queue.length === 0) sim.addOrder(p, runway);
        else if (p.landed && !p.unloaded && p.state === 2 && p.queue.length === 0 && gate) sim.addOrder(p, gate);
        else if (p.loaded && p.state === 2 && p.queue.length === 0) sim.addOrder(p, runway);
      }
      sim.update(1 / 60);
    }
    return { ended: sim.ended, score: sim.score, served: sim.planesServed, lost: sim.planesLost };
  });
  console.log('level 1 auto-play:', JSON.stringify(result));
  await sleep(1500); await shot('F2-report-building'); await sleep(9000); await shot('F2-report');
  console.log('saved after level 1:', JSON.stringify(await saved()));

  // Level 2 opens on the shop with the funds level 1 earned. The dialog is 430x270 centred, so
  // its centre is (240, 160): Buy is at (-20, 120) from it and Exit at (140, 120).
  await open('?stage=1&level=2&mute');
  await sleep(600); await shot('F3-shop');
  await click(240 - 20, 160 + 120);
  await sleep(400); await shot('F4-shop-bought');
  console.log('saved after buying:', JSON.stringify((await saved()).records['1-2']));
  await click(240 + 140, 160 + 120);
  await page.waitForFunction('location.search.includes("go")', { timeout: 10000 });
  await page.waitForFunction('document.body.dataset.ready', { timeout: 20000 });
  await sleep(1500); await shot('F5-level2');
  console.log('level 2 airport:', JSON.stringify(await page.evaluate(() => ({ gates: window.game.sim.gates.map((g) => g.letter), stopSpots: window.game.sim.stopSpots.length, paused: window.game.paused }))));
  console.log('problems:', problems.length ? problems : 'none');
} finally {
  await browser.close();
}
