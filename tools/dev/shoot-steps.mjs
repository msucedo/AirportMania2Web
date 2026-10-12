// Runs a list of steps on a page and captures where asked.
// Usage: node tools/dev/shoot-steps.mjs <url> <outDir> <step>...   steps: click:x,y (logical px)  wait:ms  shot:name  drag:x1,y1,x2,y2  eval:js
import { createRequire } from 'node:module';
const require = createRequire(process.env.PUPPETEER_FROM ?? '/Users/msaucedo/Documents/code/node_modules/');
const puppeteer = require('puppeteer-core');
const [url, outDir, ...steps] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=960,640'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 640 });
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('box')) problems.push('console: ' + m.text()); });
  await page.goto(url, { waitUntil: "load" }); if (process.env.SEED) { await page.evaluate(process.env.SEED); await page.reload({ waitUntil: "load" }); }
  await page.waitForFunction('document.body.dataset.ready || document.body.dataset.error', { timeout: 20000 });
  for (const step of steps) {
    const [kind, value] = [step.slice(0, step.indexOf(':')), step.slice(step.indexOf(':') + 1)];
    if (kind === 'wait') await sleep(+value);
    else if (kind === 'click') { const [x, y] = value.split(',').map(Number); await page.mouse.click(2 * x, 2 * y); await sleep(300); }
    else if (kind === 'drag') { const [a, b, c, d] = value.split(',').map(Number); await page.mouse.move(2 * a, 2 * b); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await page.mouse.move(2 * (a + (c - a) * i / 10), 2 * (b + (d - b) * i / 10)); await sleep(30); } await page.mouse.up(); }
    else if (kind === 'shot') await page.screenshot({ path: `${outDir}/${value}.png` });
    else if (kind === 'eval') console.log(JSON.stringify(await page.evaluate(value)));
  }
  console.log(problems.length ? problems.join('\n') : 'no page errors');
} finally { await browser.close(); }
