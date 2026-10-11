import { gameTipStep } from '../src/game/view/tipsShower';
import { describe, expect, it } from 'vitest';
import { Progress, difficultyAfter, type StageRules } from '../src/game/progress';
import { ARCHES, IMPROVEMENT } from '../src/game/stages/arches';
import { ISLAND } from '../src/game/stages/island';
import { onSale } from '../src/game/stages/layout';

// No localStorage under the test runner: Progress then keeps everything in memory.
const RULES = new Map<number, StageRules>([
  [1, { levels: 3, perStar: 2000, clearBonus: 40000 }],
  [2, { levels: 2, perStar: 3000, clearBonus: 50000 }],
]);

describe('progress', () => {
  it('moves the difficulty with each level, between 0.7 and 1.1', () => {
    expect(difficultyAfter(1, 2)).toBe(1);
    expect(difficultyAfter(1, 0)).toBe(0.75);
    expect(difficultyAfter(0.75, 0)).toBe(0.7);
    expect(difficultyAfter(1, 5)).toBe(1.1);
    expect(difficultyAfter(1, 3)).toBe(1.1);
    expect(difficultyAfter(0.7, 1)).toBeCloseTo(0.7);
    const progress = Progress.load(RULES);
    expect(progress.difficulty).toBe(1);
    progress.settleDifficulty(0);
    expect(progress.difficulty).toBe(0.75);
  });

  it('opens a stage that did not exist yet when the one before it was cleared', () => {
    // Stage 2 cleared with only two stages in the game: nothing to open then.
    const before = Progress.load(RULES);
    for (const level of [1, 2, 3]) before.complete(1, level, 9000, 2);
    for (const level of [1, 2]) before.complete(2, level, 9000, 3);
    const saved = JSON.parse(JSON.stringify({ records: Object.fromEntries([[1, 3], [2, 2]].flatMap(([stage, levels]) => Array.from({ length: levels! }, (_, i) => [`${stage}-${i + 1}`, before.record(stage!, i + 1)]))) }));
    // The same save once a third stage has been added.
    const three = new Map<number, StageRules>([...RULES, [3, { levels: 2, perStar: 4000, clearBonus: 60000 }]]);
    const after = Progress.restore(saved, three);
    expect(after.stageUnlocked(3)).toBe(true);
    expect(after.unlocked(3, 1)).toBe(true);
    // It starts with what clearing stage 2 pays: two levels of two stars each, and the bonus.
    expect(after.funds(3, 1)).toBe(4 * 3000 + 50000);
    expect(after.improvements(3, 1).size).toBe(0);
    // A stage not cleared opens nothing, and one already open is left as it is.
    const partial = Progress.load(three);
    partial.complete(1, 1, 9000, 2);
    expect(Progress.restore({ records: { '1-1': partial.record(1, 1) as never } }, three).stageUnlocked(2)).toBe(false);
    after.complete(3, 1, 5000, 1);
    const again = Progress.restore(saved, three);
    expect(again.funds(3, 1)).toBe(4 * 3000 + 50000);
    expect(again.result(3, 1).stars).toBe(1);
  });

  it('opens the next level only when one is passed, with its funds raised by the score', () => {
    const progress = Progress.load(RULES);
    expect(progress.unlocked(1, 1)).toBe(true);
    expect(progress.unlocked(1, 2)).toBe(false);
    progress.complete(1, 1, 3000, 0);
    expect(progress.unlocked(1, 2)).toBe(false);
    progress.complete(1, 1, 7000, 1);
    expect(progress.unlocked(1, 2)).toBe(true);
    expect(progress.funds(1, 1)).toBe(0);
    expect(progress.funds(1, 2)).toBe(7000);
    progress.complete(1, 2, 5000, 1);
    expect(progress.funds(1, 3)).toBe(12000);
  });

  it('adds a beaten best score to the levels already opened after it', () => {
    const progress = Progress.load(RULES);
    progress.complete(1, 1, 7000, 1);
    progress.complete(1, 2, 5000, 1);
    progress.complete(1, 1, 6000, 1);
    expect(progress.funds(1, 2)).toBe(7000);
    progress.complete(1, 1, 10000, 2);
    expect(progress.result(1, 1)).toEqual({ best: 10000, stars: 2 });
    expect(progress.funds(1, 2)).toBe(10000);
    expect(progress.funds(1, 3)).toBe(15000);
  });

  it('keeps purchases with the level they were made for and carries them to the next one', () => {
    const progress = Progress.load(RULES);
    progress.complete(1, 1, 25000, 5);
    expect(progress.buy(1, 2, IMPROVEMENT.EXTRA_STOP_SPOT, 30000)).toBe(false);
    expect(progress.buy(1, 2, IMPROVEMENT.EXTRA_STOP_SPOT, 10000)).toBe(true);
    expect(progress.buy(1, 2, IMPROVEMENT.EXTRA_STOP_SPOT, 10000)).toBe(false);
    expect(progress.funds(1, 2)).toBe(15000);
    expect(progress.improvements(1, 1).size).toBe(0);
    progress.complete(1, 2, 4000, 1);
    expect(progress.improvements(1, 3).has(IMPROVEMENT.EXTRA_STOP_SPOT)).toBe(true);
    expect(progress.funds(1, 3)).toBe(19000);
    // Selling gives the price back, for that level only.
    expect(progress.sell(1, 3, IMPROVEMENT.EXTRA_STOP_SPOT, 10000)).toBe(true);
    expect(progress.funds(1, 3)).toBe(29000);
    expect(progress.improvements(1, 2).has(IMPROVEMENT.EXTRA_STOP_SPOT)).toBe(true);
  });

  it('opens the next stage with the reward for the one cleared and nothing bought', () => {
    const progress = Progress.load(RULES);
    expect(progress.stageUnlocked(2)).toBe(false);
    expect(progress.complete(1, 1, 9000, 3)).toBe(false);
    progress.buy(1, 2, IMPROVEMENT.EXTRA_STOP_SPOT, 1000);
    expect(progress.complete(1, 2, 9000, 1)).toBe(false);
    expect(progress.complete(1, 3, 9000, 5)).toBe(true);
    // Two stars, none and four: six stars at 2000 plus the bonus.
    expect(progress.stageStars(1)).toBe(6);
    expect(progress.stageReward(1)).toBe(52000);
    expect(progress.stageUnlocked(2)).toBe(true);
    expect(progress.funds(2, 1)).toBe(52000);
    expect(progress.improvements(2, 1).size).toBe(0);
    // A better tier later pays its new stars into the stage that follows.
    expect(progress.complete(1, 2, 20000, 3)).toBe(false);
    expect(progress.funds(2, 1)).toBe(56000);
  });

  it('rebuilds a save of the first format by replaying its results', () => {
    const progress = Progress.fromResults(RULES, { '1-1': { best: 7000, stars: 1 }, '1-2': { best: 5000, stars: 2 }, '2-1': { best: 1, stars: 5 } });
    expect(progress.funds(1, 3)).toBe(12000);
    expect(progress.result(1, 2)).toEqual({ best: 5000, stars: 2 });
    expect(progress.stageUnlocked(2)).toBe(false);
  });

  it('lists the stage improvements with the prices the stage scripts register', () => {
    const prices = (layout: typeof ARCHES) => Object.fromEntries(layout.improvements.map((offer) => [offer.id, offer.price]));
    expect(prices(ARCHES)).toEqual({ 0x01: 10000, 0x0a: 20000, 0x72: 60000, 0x16: 20000, 0x1e: 25000, 0x1f: 30000, 0x20: 35000, 0xcb: 85000 });
    expect(prices(ISLAND)).toEqual({ 0x01: 17000, 0x02: 25000, 0x0a: 40000, 0x72: 95000, 0x16: 35000, 0x1e: 35000, 0x1f: 40000, 0x74: 50000, 0x20: 45000, 0xcc: 120000 });
    // In the order they are registered, which is the order the shop lists them in.
    expect(ARCHES.improvements.map((offer) => offer.id)).toEqual([0x01, 0x0a, 0x72, 0x16, 0x1e, 0x1f, 0xcb, 0x20]);
    expect(ISLAND.improvements.map((offer) => offer.id)).toEqual([0x01, 0x02, 0x0a, 0x72, 0x16, 0x1e, 0x1f, 0x74, 0xcc, 0x20]);
  });
});

describe('what is on sale', () => {
  const listed = (layout: typeof ARCHES, ...owned: number[]): number[] => layout.improvements.filter((offer) => onSale(offer, new Set(owned))).map((offer) => offer.id);

  it('adds what builds on an improvement and withdraws the one built on (Arches)', () => {
    expect(listed(ARCHES)).toEqual([0x01, 0x0a, 0x16, 0x1e, 0x1f, 0xcb]);
    // The painting stop spot needs the extra stop spot, which then cannot be sold.
    expect(listed(ARCHES, 0x01)).toEqual([0x01, 0x0a, 0x72, 0x16, 0x1e, 0x1f, 0xcb]);
    expect(listed(ARCHES, 0x01, 0x72)).toEqual([0x0a, 0x72, 0x16, 0x1e, 0x1f, 0xcb]);
    // The same between gate C and its upgrade.
    expect(listed(ARCHES, 0x16)).toEqual([0x01, 0x0a, 0x16, 0x1e, 0x1f, 0xcb, 0x20]);
    expect(listed(ARCHES, 0x16, 0x20)).toEqual([0x01, 0x0a, 0x1e, 0x1f, 0xcb, 0x20]);
  });

  it('chains the stop spots on the island: first, second, then the painting one', () => {
    expect(listed(ISLAND)).toEqual([0x01, 0x0a, 0x16, 0x1e, 0x1f, 0x74, 0xcc]);
    expect(listed(ISLAND, 0x01)).toEqual([0x01, 0x02, 0x0a, 0x16, 0x1e, 0x1f, 0x74, 0xcc]);
    expect(listed(ISLAND, 0x01, 0x02)).toEqual([0x02, 0x0a, 0x72, 0x16, 0x1e, 0x1f, 0x74, 0xcc]);
    expect(listed(ISLAND, 0x01, 0x02, 0x72)).toEqual([0x0a, 0x72, 0x16, 0x1e, 0x1f, 0x74, 0xcc]);
  });
});

describe('settings', () => {
  it('falls back to the defaults for missing or malformed values', async () => {
    const { parseSettings } = await import('../src/game/settings');
    const rest = { autoOrientate: true, showTips: true, bubbleClicking: true, palette: 0 };
    expect(parseSettings(null)).toEqual({ sound: 1, music: 1, language: 'spanish', enlarged: true, ...rest });
    expect(parseSettings('not json')).toEqual({ sound: 1, music: 1, language: 'spanish', enlarged: true, ...rest });
    expect(parseSettings('{"sound":0.25,"music":7,"language":"klingon"}')).toEqual({ sound: 0.25, music: 1, language: 'spanish', enlarged: true, ...rest });
    expect(parseSettings('{"music":0,"language":"german","enlarged":false}')).toEqual({ sound: 1, music: 0, language: 'german', enlarged: false, ...rest });
    expect(parseSettings('{"showTips":false,"bubbleClicking":"no","palette":2}')).toMatchObject({ showTips: false, bubbleClicking: true, palette: 2 });
    expect(parseSettings('{"palette":9}').palette).toBe(0);
  });

  it('counts repairs and washes over all games and posts their medal at the counts read', () => {
    const progress = Progress.load(RULES);
    const earned: number[][] = [];
    for (let n = 1; n <= 100; n++) {
      const got = progress.count('repairs', 1, 1);
      if (got.length > 0) earned.push([n, ...got]);
    }
    // Bronze at fifty, and a better value at a hundred.
    expect(earned).toEqual([[50, 29], [100, 29]]);
    expect(progress.awards[29]!.value).toBe(100);
    for (let n = 1; n <= 24; n++) expect(progress.count('washes', 1, 1)).toEqual([]);
    expect(progress.count('washes', 1, 1)).toEqual([33]);
  });

  it('earns nothing but the diploma in the tutorial', () => {
    const progress = Progress.load(RULES);
    expect(progress.award(1, 0, 0, 1)).toEqual([]);
    expect(progress.award(0, 0, 0, 3)).toEqual([0]);
    expect(progress.award(0, 0, 0, 3)).toEqual([]);
    expect(progress.award(1, 0, 1, 1)).toEqual([1]);
  });

  it('gives the awards of a stage when its last level is passed', () => {
    const progress = Progress.load(RULES);
    const facts = { planes: 5, lost: 0, earlyArrivals: 0, earlyDepartures: 0, gateCombos: [1] };
    progress.complete(1, 1, 9000, 4, 0);
    expect(progress.levelEnd(1, 1, facts)).toEqual([]);
    progress.complete(1, 2, 9000, 5, 1);
    expect(progress.levelEnd(1, 2, { ...facts, lost: 1 })).toEqual([]);
    progress.complete(1, 3, 9000, 4, 0);
    // Supreme or better throughout, nothing bought, but a plane was lost in the second level.
    expect(progress.levelEnd(1, 3, facts)).toEqual([30, 40]);
    // Played again without losing any: the fewest lost is what counts.
    progress.complete(1, 2, 9000, 5, 0);
    expect(progress.levelEnd(1, 2, facts)).toEqual([27]);
  });

  it('is fresh until the game is begun or a level played', () => {
    const progress = Progress.load(RULES);
    expect(progress.fresh).toBe(true);
    progress.begin();
    expect(progress.fresh).toBe(false);
    const played = Progress.load(RULES);
    played.reset();
    expect(played.fresh).toBe(true);
    played.complete(1, 1, 9000, 2);
    expect(played.fresh).toBe(false);
  });

  it('shows the next of the tips at each level start until all have been shown', () => {
    const progress = Progress.load(RULES);
    expect([progress.nextTip(3), progress.nextTip(3), progress.nextTip(3), progress.nextTip(3)]).toEqual([0, 1, 2, null]);
    // It stays eight seconds; a touch after the first second takes four off.
    expect(gameTipStep(8, 0.5, true)).toBe(7.5);
    expect(gameTipStep(6.5, 0.5, true)).toBe(2);
    expect(gameTipStep(6.5, 0.5, false)).toBe(6);
  });
});

