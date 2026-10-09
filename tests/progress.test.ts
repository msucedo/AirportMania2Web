import { describe, expect, it } from 'vitest';
import { Progress, type StageRules } from '../src/game/progress';
import { ARCHES, IMPROVEMENT } from '../src/game/stages/arches';
import { ISLAND } from '../src/game/stages/island';

// No localStorage under the test runner: Progress then keeps everything in memory.
const RULES = new Map<number, StageRules>([
  [1, { levels: 3, perStar: 2000, clearBonus: 40000 }],
  [2, { levels: 2, perStar: 3000, clearBonus: 50000 }],
]);

describe('progress', () => {
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
    expect(prices(ARCHES)).toEqual({ 0x01: 10000, 0x0a: 20000, 0x16: 20000, 0x1e: 25000, 0x1f: 30000, 0x20: 35000, 0xcb: 85000 });
    expect(prices(ISLAND)).toEqual({ 0x01: 17000, 0x02: 25000, 0x0a: 40000, 0x16: 35000, 0x1e: 35000, 0x1f: 40000, 0x20: 45000, 0xcc: 120000 });
  });
});

describe('settings', () => {
  it('falls back to the defaults for missing or malformed values', async () => {
    const { parseSettings } = await import('../src/game/settings');
    expect(parseSettings(null)).toEqual({ sound: 1, music: 1, language: 'spanish', enlarged: true });
    expect(parseSettings('not json')).toEqual({ sound: 1, music: 1, language: 'spanish', enlarged: true });
    expect(parseSettings('{"sound":0.25,"music":7,"language":"klingon"}')).toEqual({ sound: 0.25, music: 1, language: 'spanish', enlarged: true });
    expect(parseSettings('{"music":0,"language":"german","enlarged":false}')).toEqual({ sound: 1, music: 0, language: 'german', enlarged: false });
  });
});
