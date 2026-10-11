import { describe, expect, it } from 'vitest';
import { parseAwardShines } from '../src/data/awards';
import type { XmlNode } from '../src/data/xml';
import table from '../src/data/generated/data/descriptors/awards_room_descriptor_table.json';
import { curtainEdge, pageNumberPose, pageTouched, slideStep, sparklePose, swipeStep } from '../src/game/awardsRoomMotion';

describe('awards room', () => {
  it('raises the curtain as the room opens, after a third of the second spent shut', () => {
    expect(curtainEdge(0)).toBe(327);
    expect(curtainEdge(1 / 3)).toBeCloseTo(327, 5);
    expect(curtainEdge(2 / 3)).toBeCloseTo(27 + 150, 5);
    expect(curtainEdge(1)).toBe(27);
  });

  it('slides the wall to a page, speeding up and braking, and stops on it', () => {
    let state = { scroll: 0, speed: 0 };
    let fastest = 0;
    let steps = 0;
    for (; steps < 600 && (state.scroll !== -480 || state.speed !== 0); steps++) {
      state = slideStep(state.scroll, state.speed, -480, 1 / 60);
      fastest = Math.max(fastest, Math.abs(state.speed));
      expect(state.scroll).toBeGreaterThanOrEqual(-480);
    }
    expect(state).toEqual({ scroll: -480, speed: 0 });
    // Well under a second, and it does get going.
    expect(steps).toBeLessThan(45);
    expect(fastest).toBeGreaterThan(1000);
    // On the page already, it stays.
    expect(slideStep(-480, 0, -480, 1 / 60)).toEqual({ scroll: -480, speed: 0 });
    expect(slideStep(-479.5, 300, -480, 1 / 60)).toEqual({ scroll: -479.5, speed: 0 });
  });

  it('shows the current page number whole and the others smaller and nudged away', () => {
    expect(pageNumberPose(0, 0)).toEqual({ x: 30, y: 24, scale: 1 });
    expect(pageNumberPose(1, 0)).toEqual({ x: 56 + 8, y: 24, scale: 0.625 });
    expect(pageNumberPose(0, -480)).toEqual({ x: 30 - 8, y: 24, scale: 0.625 });
    const half = pageNumberPose(1, -240);
    expect(half.x).toBeCloseTo(60, 5);
    expect(half.scale).toBeCloseTo(0.75, 5);
  });

  it('turns the page for a touch on a number or a sideways swipe', () => {
    expect(pageTouched(10, 10, 2)).toBe(0);
    expect(pageTouched(40, 40, 2)).toBe(1);
    expect(pageTouched(100, 10, 2)).toBe(1);
    expect(pageTouched(111, 10, 2)).toBeNull();
    expect(pageTouched(10, 49, 2)).toBeNull();
    // A small move is only kept; a long one to the left goes on a page, to the right back.
    expect(swipeStep({ x: 0, y: 0 }, -5, 0)).toEqual({ kept: { x: -1.5, y: 0 }, turn: 0 });
    expect(swipeStep({ x: -1.5, y: 0 }, -10, 0).turn).toBe(1);
    expect(swipeStep({ x: 2, y: 0 }, 10, 1).turn).toBe(-1);
    // Up and down turns nothing.
    expect(swipeStep({ x: 0, y: 3 }, 1, 10)).toEqual({ kept: { x: 0, y: 0 }, turn: 0 });
  });

  it('makes a sparkle come and go over two seconds, turning', () => {
    expect(sparklePose(2, 0.8, 30).alpha).toBe(0);
    expect(sparklePose(1.75, 0.8, 30).alpha).toBe(0.5);
    expect(sparklePose(1, 0.8, 30)).toEqual({ scale: 0.8 + 0.2 * Math.sin(2), angle: 230, alpha: 1 });
    expect(sparklePose(0.25, 0.8, 30).alpha).toBe(0.5);
  });

  it("reads three sparkle points for each award from the game's table", () => {
    const shines = parseAwardShines(table as XmlNode[]);
    expect(shines.get(0)).toEqual([{ x: 408, y: 58 }, { x: 396, y: 135 }, { x: 427, y: 69 }]);
    expect(shines.get(20)).toHaveLength(3);
    expect(shines.size).toBeGreaterThan(40);
  });
});
