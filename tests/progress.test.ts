import { describe, expect, it } from 'vitest';
import { Progress } from '../src/game/progress';
import { ARCHES, IMPROVEMENT } from '../src/game/stages/arches';

// No localStorage under the test runner: Progress then keeps everything in memory.
describe('progress', () => {
  it('unlocks the next level once the previous one is passed', () => {
    const progress = Progress.load();
    expect(progress.unlocked(1, 1)).toBe(true);
    expect(progress.unlocked(1, 2)).toBe(false);
    progress.record(1, 1, 3000, 0, 2000);
    expect(progress.unlocked(1, 2)).toBe(false);
    progress.record(1, 1, 7000, 1, 2000);
    expect(progress.unlocked(1, 2)).toBe(true);
  });

  it('pays only for newly earned stars and keeps the best result', () => {
    const progress = Progress.load();
    expect(progress.record(1, 1, 16000, 3, 2000)).toEqual({ newStars: 3, earned: 6000 });
    expect(progress.record(1, 1, 9000, 1, 2000)).toEqual({ newStars: 0, earned: 0 });
    expect(progress.record(1, 1, 25000, 5, 2000)).toEqual({ newStars: 2, earned: 4000 });
    expect(progress.result(1, 1)).toEqual({ best: 25000, stars: 5 });
    expect(progress.funds).toBe(10000);
  });

  it('buys an improvement once, and only when it can be afforded', () => {
    const progress = Progress.load();
    expect(progress.buy(IMPROVEMENT.EXTRA_STOP_SPOT, 10000)).toBe(false);
    progress.record(1, 1, 25000, 5, 2000);
    expect(progress.buy(IMPROVEMENT.EXTRA_STOP_SPOT, 10000)).toBe(true);
    expect(progress.buy(IMPROVEMENT.EXTRA_STOP_SPOT, 10000)).toBe(false);
    expect(progress.funds).toBe(0);
    expect(progress.improvements.has(IMPROVEMENT.EXTRA_STOP_SPOT)).toBe(true);
  });

  it('lists the stage improvements with the prices the stage script registers', () => {
    const prices = Object.fromEntries(ARCHES.improvements.map((offer) => [offer.id, offer.price]));
    expect(prices).toEqual({ 0x01: 10000, 0x0a: 20000, 0x16: 20000, 0x1e: 25000, 0x1f: 30000, 0x20: 35000, 0xcb: 85000 });
  });
});
