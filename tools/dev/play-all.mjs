// Plays every level of stages 1 to 5 in order through the simulation API and checks that each
// can be passed and that progress chains: the next level opens with this one's score as funds,
// and clearing a stage opens the next. Usage: node tools/dev/play-all.mjs <baseUrl>
import { createRequire } from 'node:module';
const require = createRequire(process.env.PUPPETEER_FROM ?? '/Users/msaucedo/Documents/code/node_modules/');
const puppeteer = require('puppeteer-core');

const [base] = process.argv.slice(2);
const LEVELS = [[1, 6], [2, 7], [3, 8], [4, 8], [5, 8]];
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=960,640'],
});
let failures = 0;
const check = (ok, text) => {
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${text}`);
};
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

  await open('?reset&mute');
  let carried = 0;
  for (const [stage, levels] of LEVELS) {
    for (let level = 1; level <= levels; level++) {
      await open(`?stage=${stage}&level=${level}&mute&go&nointro`);
      const before = await page.evaluate(([s, l]) => ({ unlocked: window.progress.unlocked(s, l), funds: window.progress.funds(s, l) }), [stage, level]);
      console.log(`level ${stage}-${level}`);
      check(before.unlocked, `open, with ${before.funds} to spend`);
      if (level > 1) check(before.funds === carried, `funds are the ${carried} carried from the level before`);

      // Every plane is sent wherever it needs to go next.
      const played = await page.evaluate(() => {
        const sim = window.game.sim;
        const free = (place, plane) => !sim.planes.some((q) => q !== plane && !q.gone && (q.place === place || q.queue.includes(place)));
        // A free place if there is one; otherwise the plane queues for a taken one, as a player
        // would, which is what lets planes waiting for each other swap.
        // A runway under fog or ice takes no orders, so a clear one is preferred.
        const clear = (place) => !((place.fog && !place.fog.lifting) || (place.ice && !place.ice.lifting));
        const pick = (places, plane) => {
          const usable = places.filter(clear);
          const pool = usable.length > 0 ? usable : places;
          return pool.find((place) => free(place, plane)) ?? pool[plane.id % Math.max(1, pool.length)];
        };
        for (let i = 0; i < 60 * 900 && !sim.ended; i++) {
          for (const p of sim.planes) {
            if (p.gone || p.queue.length > 0) continue;
            if (!p.landed) {
              if (p.state === 0) sim.addOrder(p, pick(sim.runways, p));
              continue;
            }
            if (p.state !== 2) continue;
            const wanted = p.need === 1 || p.need === 6 ? pick(sim.gates, p) : p.need === 3 ? pick(sim.gasStations, p) : p.need === 2 ? pick(sim.hangars, p) : p.need === 5 ? pick(sim.luggages, p) : p.need === 7 ? pick(sim.runways, p) : undefined;
            if (wanted) sim.addOrder(p, wanted);
          }
          sim.update(1 / 60);
        }
        return { ended: sim.ended, time: Math.round(sim.time), score: sim.score, goal: sim.goals.goal, served: sim.planesServed, lost: sim.planesLost, planes: sim.planes.length };
      });
      // The scene saves the result on its next frame; wait for it rather than a fixed time.
      await page.waitForFunction(([s, l, score]) => window.progress.result(s, l).best === score, { timeout: 5000 }, [stage, level, played.score]).catch(() => {});
      const after = await page.evaluate(([s, l]) => ({ result: window.progress.result(s, l), funds: window.progress.funds(s, l), error: document.body.dataset.error ?? null }), [stage, level]);
      check(played.ended, `ended after ${played.time} s: ${played.served} of ${played.planes} planes served, ${played.lost} lost`);
      check(played.score >= played.goal, `score ${played.score} reaches the goal of ${played.goal}`);
      check(after.result.best === played.score, `best score saved (${after.result.best}, ${after.result.stars} stars)`);
      carried = after.funds + played.score;
    }
    // Clearing a stage opens the next one, paying its reward into the first level.
    const next = stage + 1;
    if (LEVELS.some(([s]) => s === next)) {
      const opened = await page.evaluate((s) => ({ unlocked: window.progress.stageUnlocked(s), funds: window.progress.funds(s, 1), reward: window.progress.stageReward(s - 1) }), next);
      console.log(`stage ${stage} cleared`);
      check(opened.unlocked, `stage ${next} is open`);
      check(opened.funds === opened.reward, `its first level starts with the reward of ${opened.reward}`);
      carried = opened.funds;
    }
  }
  check(problems.length === 0, `no page errors${problems.length ? ': ' + problems.join('; ') : ''}`);
  console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
} finally {
  await browser.close();
}
process.exit(failures === 0 ? 0 : 1);
