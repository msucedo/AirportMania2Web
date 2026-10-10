import { describe, expect, it } from 'vitest';
import { CreditsRoll, creditsItemAlpha, parseCredits } from '../src/game/credits';

const TEXT = `#FONT#FONTS.WHITE#
      #LINE#A game by#
      #IMAGE#LOGO#
      #SEPARATION#50#
      #INTERLINING#20#
      #LINE#Someone#
      #TWO_COLUMNS_LINE#Left#Right#`;

describe('credits', () => {
  const layout = parseCredits(TEXT, () => 11, () => 91);

  it('lays the marked text out from 30 down, with 30 between lines until told otherwise', () => {
    expect(layout.items).toEqual([
      { kind: 'line', y: 30, height: 11, font: 'FONTS.WHITE', text: 'A game by' },
      // A picture is centred half its height (in whole pixels) below the cursor and leaves no gap.
      { kind: 'image', y: 71 + 45, height: 91, resource: 'LOGO' },
      { kind: 'line', y: 71 + 91 + 50, height: 11, font: 'FONTS.WHITE', text: 'Someone' },
      { kind: 'columns', y: 212 + 31, height: 11, font: 'FONTS.WHITE', left: 'Left', right: 'Right' },
    ]);
    // The roll ends where the cursor is left, less the last gap between lines.
    expect(layout.total).toBe(243 + 31 - 20);
  });

  it('fades each item over 50 px at the edges of a window 265 px tall', () => {
    const item = { y: 30, height: 10 };
    expect(creditsItemAlpha(item, 0)).toBe(1);
    // 135 px on, the item is at the window's top edge.
    expect(creditsItemAlpha(item, 165)).toBe(0);
    expect(creditsItemAlpha(item, 165 - 30)).toBeCloseTo(0.5, 5);
    // Still below the window.
    expect(creditsItemAlpha({ y: 300, height: 10 }, 0)).toBe(0);
    expect(creditsItemAlpha({ y: 130 + 30, height: 10 }, 60)).toBeCloseTo(0.5, 5);
  });

  it('appears over half a second and then rolls at 40 px a second, slowing at the end', () => {
    const roll = new CreditsRoll(1000);
    roll.update(0.25, null);
    expect(roll.alpha).toBeCloseTo(0.25, 5);
    expect(roll.offset).toBeCloseTo(10, 5);
    roll.update(0.5, null);
    expect(roll.alpha).toBe(1);
    for (let i = 0; i < 100; i++) roll.update(0.1, null);
    expect(roll.offset).toBeCloseTo(40 * 10.75, 3);
    // Within 200 px of the end it slows in proportion to what is left, and never passes it.
    roll.offset = 910;
    roll.update(0.1, null);
    expect(roll.offset).toBeCloseTo(910 + 40 * 0.1 * 0.5, 5);
    for (let i = 0; i < 5000; i++) roll.update(0.1, null);
    expect(roll.offset).toBeLessThanOrEqual(1000);
    expect(roll.offset).toBeGreaterThan(990);
  });

  it('is dragged by a finger and keeps its speed when let go', () => {
    const roll = new CreditsRoll(1000);
    roll.update(1, null);
    roll.offset = 500;
    roll.update(0.1, { began: true, y: 200 });
    expect(roll.offset).toBe(500);
    expect(roll.speed).toBe(0);
    // Dragging up by 20 px takes the roll 20 px on.
    roll.update(0.1, { began: false, y: 180 });
    expect(roll.offset).toBeCloseTo(520, 5);
    for (let i = 0; i < 50; i++) roll.update(0.1, { began: false, y: 180 - 20 * (i + 1) });
    roll.offset = 500;
    roll.update(0.1, null);
    // The finger moved at 200 px a second; the roll goes on at nearly that.
    expect(roll.speed).toBeGreaterThan(190);
    expect(roll.speed).toBeLessThanOrEqual(200);
    expect(roll.offset).toBeCloseTo(500 + roll.speed * 0.1, 3);
    // Dragged down, it rolls back, and stops at the start.
    roll.speed = -300;
    for (let i = 0; i < 1000; i++) roll.update(0.1, null);
    expect(roll.offset).toBeGreaterThanOrEqual(0);
    expect(roll.offset).toBeLessThan(1);
  });
});
