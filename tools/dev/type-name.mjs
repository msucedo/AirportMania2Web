// Types into the name field of a fresh profile and prints what the field holds.
// Usage: node tools/dev/type-name.mjs <url> <outDir>
import { createRequire } from 'node:module';
const require = createRequire(process.env.PUPPETEER_FROM ?? '/Users/msaucedo/Documents/code/node_modules/');
const puppeteer = require('puppeteer-core');
const [url, out] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 640 });
  page.on('console', (m) => { if (m.text().startsWith('caret')) console.log(m.text()); }); page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(url, { waitUntil: 'load' });
  await sleep(7000);
  await page.mouse.click(720, 324); await sleep(1500);
  await page.screenshot({ path: `${out}/name0.png` });
  console.log('start', await page.evaluate(() => document.querySelector('input')?.value));
  await page.keyboard.type(' '); console.log('space', await page.evaluate(() => document.querySelector('input')?.value));
  await page.keyboard.type('Ana'); console.log('typed', await page.evaluate(() => document.querySelector('input')?.value));
  await page.keyboard.press('ArrowLeft'); await sleep(300);
  await page.keyboard.type('WWWWWWWWWWWWWWWWWWWWWWWWWWWW'); console.log('long', await page.evaluate(() => document.querySelector('input')?.value));
  console.log("sel", await page.evaluate(() => [document.querySelector("input").selectionStart, document.activeElement?.tagName])); await sleep(300); await page.screenshot({ path: `${out}/name1.png` });
} finally { await browser.close(); }
