// Plays the first plane of level 1-1 with real pointer clicks and captures each phase.
// Usage: node tools/dev/play.mjs <url> <outDir>   (needs the dev server running)
import { createRequire } from 'node:module';
// puppeteer-core is not a project dependency; point PUPPETEER_FROM at a node_modules that has it.
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
  const audio = { ogg: 0, failed: 0 };
  page.on('response', (r) => { if (r.url().endsWith('.ogg')) { audio.ogg++; if (r.status() >= 400) audio.failed++; } });
  page.on('console', (m) => { if (m.text().includes('Could not load sample')) problems.push('audio: ' + m.text()); });
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon') && !m.text().includes('404')) problems.push('console: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction('document.body.dataset.ready || document.body.dataset.error', { timeout: 20000 });
  const error = await page.evaluate('document.body.dataset.error');
  if (error) throw new Error(error);

  const state = () => page.evaluate(() => {
    const sim = window.game.sim;
    const p = sim.planes[0];
    return { time: sim.time, score: sim.score, plane: p && { state: p.state, x: p.x, y: p.y, altitude: p.altitude, energy: p.energy, selected: p.selected, landing: p.landing, gone: p.gone, unloaded: p.unloaded, loaded: p.loaded } };
  });
  // Game coordinates -> page coordinates through the canvas rectangle.
  const click = async (gx, gy) => {
    const rect = await page.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    await page.mouse.click(rect.x + (gx / 480) * rect.w, rect.y + (gy / 320) * rect.h);
  };
  const waitFor = async (label, test, timeout = 40000) => {
    const t0 = Date.now();
    for (;;) {
      const s = await state();
      if (test(s)) return s;
      if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${label}: ${JSON.stringify(s)}`);
      await sleep(100);
    }
  };
  const clickPlane = async () => { const s = await state(); await click(s.plane.x, s.plane.y - s.plane.altitude); };
  const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` });
  const log = (label, s) => console.log(label.padEnd(22), `t=${s.time.toFixed(1)} score=${s.score} state=${s.plane?.state} energy=${s.plane?.energy.toFixed(2)}`);

  let s = await waitFor('plane on screen', (s) => s.plane && s.plane.x > 60);
  await clickPlane();
  s = await waitFor('selected', (s) => s.plane.selected); log('selected in flight', s); await shot('1-flying-selected');
  await click(400, 225);                       // runway 1
  s = await waitFor('landing', (s) => s.plane.landing); await sleep(2600); await shot('2-landing');
  // The gate can be queued while the plane is still landing.
  await click(40, 122);                        // gate A
  await sleep(150); await shot('2a-queued');
  s = await waitFor('landed', (s) => s.plane.state !== 0); log('landed', s); await sleep(700); await shot('2b-taxi');
  s = await waitFor('unloading', (s) => s.plane.state === 5); log('unloading at gate A', s); await sleep(2500); await shot('3-unloading');
  // Loading follows on the same gate without a new order.
  s = await waitFor('loading', (s) => s.plane.state === 4); log('loading at gate A', s); await sleep(1500); await shot('4-loading');
  await clickPlane(); await waitFor('selected', (s) => s.plane.selected);
  await click(400, 225);                       // runway 1, queued while loading
  s = await waitFor('take-off', (s) => s.plane.state === 11); log('taking off', s); await sleep(400); await shot('5-takeoff');
  s = await waitFor('departed', (s) => s.plane.gone); log('departed', s);
  // Fast-forward the rest of the level (the other planes are ignored and leave) to see the report.
  await page.evaluate(() => { const sim = window.game.sim; for (let i = 0; i < 60 * 600 && !sim.ended; i++) sim.update(1 / 60); });
  await sleep(600); await shot('6-report');
  s = await state(); console.log('level end'.padEnd(22), `t=${s.time.toFixed(1)} score=${s.score}`);
  console.log(`audio: ${audio.ogg} ogg requests, ${audio.failed} failed`);
  console.log('problems:', problems.length ? problems : 'none');
} finally {
  await browser.close();
}
