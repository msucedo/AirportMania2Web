// Captures the stage-cleared dialog at three moments, made on top of a level.
// Usage: node tools/dev/shoot-clear.mjs <baseUrl> <outDir> <stars>
import { createRequire } from 'node:module';
const require = createRequire(process.env.PUPPETEER_FROM ?? '/Users/msaucedo/Documents/code/node_modules/');
const puppeteer = require('puppeteer-core');
const [base, out, stars] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 640 });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${base}?stage=1&level=1&mute&go&nointro`, { waitUntil: 'load' });
  await page.waitForFunction('window.game && window.game.sim', { timeout: 30000 });
  await page.evaluate(async (n) => {
    const { StageClear } = await import('/src/game/view/stageClear.ts');
    const g = window.game;
    await g.textures.load(['GUI.FINAL_REPORT.STAR_SMALL', 'GUI.DIALOGS.SEPARATOR', 'GUI.DIALOGS.BACK.BOX', 'GUI.DIALOGS.BUTTON', 'GUI.DIALOGS.BUTTON_OVER', 'GUI.BLACK_COVER']);
    g.root.addChild(new StageClear(g.textures, g.audio, g.strings, { bonus: 50000, stars: n, funds: 50000 + 2500 * n }, () => {}));
  }, Number(stars));
  for (const t of [2500, 4500, 9000]) {
    await new Promise((r) => setTimeout(r, t === 2500 ? 2500 : t === 4500 ? 2000 : 4500));
    await page.screenshot({ path: `${out}/clear-${stars}-${t}.png` });
  }
  console.log('done');
} finally { await browser.close(); }
