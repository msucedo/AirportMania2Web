// Opens a level, drives one plane that needs fuel through the pump using the simulation API, and
// captures the bubble and the fueling gauge. Usage: node tools/dev/shoot-level.mjs <url> <outDir>
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
  const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` });
  // Run the simulation forward until `test` holds (the page keeps rendering in between).
  const until = (label, test) => page.evaluate(({ label, test }) => {
    const sim = window.game.sim; const check = new Function('sim', `return ${test}`);
    for (let i = 0; i < 60 * 400 && !check(sim); i++) sim.update(1 / 60);
    if (!check(sim)) throw new Error('not reached: ' + label);
    return { time: sim.time, score: sim.score };
  }, { label, test });
  const log = (label, s) => console.log(label.padEnd(24), `t=${s.time.toFixed(1)} score=${s.score}`);

  await sleep(2500); await shot('L-start');
  log('fuel plane arrived', await until('fuel plane', 'sim.planes.some((p) => !p.gasDone && !p.gone)'));
  await page.evaluate(() => { const sim = window.game.sim; const p = sim.planes.find((p) => !p.gasDone && !p.gone); window.fuelPlane = p; sim.select(p); sim.addOrder(p, sim.runways[1]); sim.addOrder(p, sim.gates[1]); });
  log('unloaded, wants fuel', await until('unloaded', 'window.fuelPlane.unloaded'));
  await sleep(500); await shot('L-wants-fuel');
  await page.evaluate(() => { const sim = window.game.sim; sim.addOrder(window.fuelPlane, sim.gasStations[0]); });
  log('fueling', await until('fueling', 'window.fuelPlane.state === 7'));
  await page.evaluate(() => { const sim = window.game.sim; for (let i = 0; i < 150; i++) sim.update(1 / 60); });
  await sleep(400); await shot('L-fueling');
  log('fuel done', await until('fuel done', 'window.fuelPlane.gasDone'));
  await sleep(400); await shot('L-fuel-done');
  console.log('problems:', problems.length ? problems : 'none');
} finally {
  await browser.close();
}
