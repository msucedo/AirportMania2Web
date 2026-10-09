// Checks the game flow: stage screen, a finished level recorded in the progress, buying an
// improvement and seeing it in the next level. Usage: node tools/dev/shoot-flow.mjs <baseUrl> <outDir>
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
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('am2web.progress.v1') ?? 'null'));

  await open('?reset&mute'); await shot('F1-stage-empty');
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
  await sleep(900); await shot('F2-report');
  console.log('saved after level 1:', JSON.stringify(await saved()));

  // Give the player funds, buy the first improvement on the stage screen and check level 2 has it.
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('am2web.progress.v1')); d.funds = 50000; localStorage.setItem('am2web.progress.v1', JSON.stringify(d)); });
  await open('?mute'); await shot('F3-stage-funds');
  await click(12 + 54, 130 + 34);            // first shop tile: extra stop spot
  await sleep(200);
  await click(12 + 2 * 114 + 54, 130 + 34);  // third tile: gate C
  await sleep(300); await shot('F4-stage-bought');
  console.log('saved after buying:', JSON.stringify(await saved()));
  await click(240 - 72 * 2 + 30, 66);        // level 2 tile
  await page.waitForFunction('location.search.includes("level=2")', { timeout: 10000 });
  await page.waitForFunction('document.body.dataset.ready', { timeout: 20000 });
  await sleep(1500); await shot('F5-level2');
  console.log('level 2 airport:', JSON.stringify(await page.evaluate(() => ({ gates: window.game.sim.gates.map((g) => g.letter), stopSpots: window.game.sim.stopSpots.length }))));
  console.log('problems:', problems.length ? problems : 'none');
} finally {
  await browser.close();
}
