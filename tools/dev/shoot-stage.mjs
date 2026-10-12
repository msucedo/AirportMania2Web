// Captures a level after its opening, with improvements bought first.
// Usage: node tools/dev/shoot-stage.mjs <baseUrl> <outDir> <stage> <level> [ids,comma,separated]   (NODES=1 draws the taxi nodes)
import { createRequire } from 'node:module';
const require = createRequire(process.env.PUPPETEER_FROM ?? '/Users/msaucedo/Documents/code/node_modules/');
const puppeteer = require('puppeteer-core');
const [base, outDir, stage, level, ids = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=960,640'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 640 });
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  const open = async (query) => {
    await page.goto(`${base}${query}`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForFunction('document.body.dataset.ready || document.body.dataset.error', { timeout: 20000 });
    const error = await page.evaluate('document.body.dataset.error');
    if (error) throw new Error(error);
  };
  const owned = ids ? ids.split(',').map((id) => Number(id)) : [];
  await open('?reset&mute');
  await page.evaluate(([s, l, owned]) => owned.map((id) => window.progress.buy(s, l, id, 0)), [Number(stage), Number(level), owned]);
  await open(`?stage=${stage}&level=${level}&mute&go&nointro${process.env.NODES ? '&nodes' : ''}`);
  await page.waitForFunction('window.game && window.game.sim', { timeout: 20000 });
  await page.evaluate(() => { const sim = window.game.sim; for (let i = 0; i < 60 * 25; i++) sim.update(1 / 60); });
  await sleep(1200);
  await page.screenshot({ path: `${outDir}/stage${stage}-${level}${owned.length ? '-full' : ''}${process.env.NODES ? '-nodes' : ''}.png` });
  console.log(problems.length ? problems.join('\n') : 'no page errors');
} finally { await browser.close(); }
