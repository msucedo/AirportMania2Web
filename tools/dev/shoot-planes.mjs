// Plays a level for a while by sending each arriving plane to a free runway and gate, then
// captures the whole screen at 3x so plane details can be checked.
// Usage: node tools/dev/shoot-planes.mjs <url> <outDir> <name> [seconds=40] [select=0|1]
import { createRequire } from 'node:module';
const require = createRequire(process.env.PUPPETEER_FROM ?? '/Users/msaucedo/Documents/code/node_modules/');
const puppeteer = require('puppeteer-core');

const [url, outDir, name, seconds = '40', select = '0'] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=960,640'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 320, deviceScaleFactor: 3 });
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon') && !m.text().includes('404')) problems.push('console: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction('document.body.dataset.ready || document.body.dataset.error', { timeout: 20000 });
  const error = await page.evaluate('document.body.dataset.error');
  if (error) throw new Error(error);
  await page.evaluate(({ seconds, select }) => {
    const sim = window.game.sim;
    const ordered = new Set();
    for (let i = 0; i < 60 * seconds; i++) {
      for (const p of sim.planes) {
        if (p.gone || ordered.has(p.id)) continue;
        const runway = sim.runways.find((r) => !r.plane && !sim.planes.some((q) => q !== p && q.queue?.includes(r)));
        const gate = sim.gates.find((g) => !g.plane && !sim.planes.some((q) => q !== p && q.queue?.includes(g)));
        if (runway && gate && sim.addOrder(p, runway)) { sim.addOrder(p, gate); ordered.add(p.id); }
      }
      sim.update(1 / 60);
    }
    if (select === '1') { const p = sim.planes.find((p) => !p.gone); if (p) sim.select(p); }
  }, { seconds: Number(seconds), select });
  await sleep(3200); // lets the floating texts raised by the fast-forward fade out
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('planes:', JSON.stringify(await page.evaluate(() => window.game.sim.planes.filter((p) => !p.gone).map((p) => ({ s: p.state, x: Math.round(p.x), y: Math.round(p.y), e: +p.energy.toFixed(2), c: p.color, sex: p.sex })))));
  console.log('problems:', problems.length ? problems : 'none');
} finally {
  await browser.close();
}
