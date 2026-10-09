// Captures a level's backdrop at several moments of the sky's day cycle.
// Usage: node tools/dev/shoot-sky.mjs <url> <outDir> <name> <seconds>[,<seconds>...]
import { createRequire } from 'node:module';
const require = createRequire(process.env.PUPPETEER_FROM ?? '/Users/msaucedo/Documents/code/node_modules/');
const puppeteer = require('puppeteer-core');

const [url, outDir, name, times = '0'] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=960,640'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 320, deviceScaleFactor: 2 });
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction('document.body.dataset.ready || document.body.dataset.error', { timeout: 20000 });
  let at = 0;
  for (const t of times.split(',').map(Number)) {
    await page.evaluate((dt) => { window.game.paused = true; for (let left = dt; left > 0; left -= 0.5) window.game.sky.update(Math.min(0.5, left)); }, t - at);
    at = t;
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: `${outDir}/${name}-${t}.png`, clip: { x: 0, y: 0, width: 480, height: 200 } });
  }
  console.log('problems:', problems.length ? problems : 'none');
} finally {
  await browser.close();
}
