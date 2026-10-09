// Drives a plane that needs servicing into the hangar and captures it.
// Usage: node tools/dev/shoot-hangar.mjs <url> <outDir>
import { createRequire } from 'node:module';
const require = createRequire(process.env.PUPPETEER_FROM ?? '/Users/msaucedo/Documents/code/node_modules/');
const puppeteer = require('puppeteer-core');

const [url, outDir] = process.argv.slice(2);
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
  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction('document.body.dataset.ready || document.body.dataset.error', { timeout: 20000 });
  const error = await page.evaluate('document.body.dataset.error');
  if (error) throw new Error(error);
  const until = (label, test) => page.evaluate(({ label, test }) => {
    const sim = window.game.sim; const check = new Function('sim', `return ${test}`);
    for (let i = 0; i < 60 * 400 && !check(sim); i++) sim.update(1 / 60);
    if (!check(sim)) throw new Error('not reached: ' + label);
    return { time: sim.time, score: sim.score };
  }, { label, test });
  const log = (label, s) => console.log(label.padEnd(26), `t=${s.time.toFixed(1)} score=${s.score}`);

  log('service plane arrived', await until('service plane', 'sim.planes.some((p) => !p.serviceDone && !p.gone)'));
  await page.evaluate(() => { const sim = window.game.sim; const p = sim.planes.find((p) => !p.serviceDone && !p.gone); window.servicePlane = p; sim.select(p); sim.addOrder(p, sim.runways[0]); sim.addOrder(p, sim.gates[0]); });
  log('unloaded, wants service', await until('unloaded', 'window.servicePlane.unloaded'));
  await sleep(500); await page.screenshot({ path: `${outDir}/H-wants-service.png` });
  await page.evaluate(() => { const sim = window.game.sim; sim.addOrder(window.servicePlane, sim.hangars[0]); });
  log('in the hangar', await until('in hangar', 'window.servicePlane.state === 6'));
  await page.evaluate(() => { const sim = window.game.sim; for (let i = 0; i < 330; i++) sim.update(1 / 60); });
  await sleep(400); await page.screenshot({ path: `${outDir}/H-in-hangar.png` });
  log('service done', await until('service done', 'window.servicePlane.serviceDone'));
  console.log('problems:', problems.length ? problems : 'none');
} finally {
  await browser.close();
}
