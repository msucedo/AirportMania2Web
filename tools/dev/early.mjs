// Screenshots at given times after the page starts loading.
// Usage: node tools/dev/early.mjs <url> <outDir> <name> <ms>...   (NIGHT=0|1 fixes the loading screen's sky)
import { createRequire } from 'node:module';
const require = createRequire(process.env.PUPPETEER_FROM ?? '/Users/msaucedo/Documents/code/node_modules/');
const puppeteer = require('puppeteer-core');
const [url, out, name, ...times] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=960,640'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 640 });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  if (process.env.NIGHT) await page.evaluateOnNewDocument((v) => sessionStorage.setItem('am2web.sceneNight', v), process.env.NIGHT);
  const started = Date.now();
  page.goto(url, { waitUntil: 'load' }).catch(() => {});
  for (const t of times.map(Number)) {
    await new Promise((r) => setTimeout(r, Math.max(0, t - (Date.now() - started))));
    await page.screenshot({ path: `${out}/${name}-${t}.png` });
  }
  console.log(await page.evaluate(() => document.body.dataset.error || document.body.dataset.ready || 'not ready'));
} finally { await browser.close(); }
