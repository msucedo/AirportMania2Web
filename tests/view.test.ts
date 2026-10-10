import { describe, expect, it } from 'vitest';
import { paletteColor } from '../src/game/palette';
import { energyBar, moodFor, orientationFor, speechPlace, thoughtPlace } from '../src/game/planeView';
import { markerImage } from '../src/game/worldMap';
import { reportPercent } from '../src/game/view/finalReport';
import { clockDigits, goalBarFraction } from '../src/game/view/hud';
import { comboArrows, usingArrow } from '../src/game/view/runwayView';
import { cloudX, skyColorsAt, skyPhaseAt } from '../src/game/view/sky';
import { ringInterval } from '../src/game/view/waterEffects';

describe('plane drawing rules', () => {
  it('picks the perspective and mirroring from the heading', () => {
    expect(orientationFor(0)).toEqual({ perspective: 0, flipped: false });
    expect(orientationFor(180)).toEqual({ perspective: 0, flipped: true });
    expect(orientationFor(90)).toEqual({ perspective: 1, flipped: false });
    expect(orientationFor(270)).toEqual({ perspective: 2, flipped: false });
    expect(orientationFor(200)).toEqual({ perspective: 0, flipped: true });
  });

  it('shows eight energy frames and flickers the top one in the lower half of each', () => {
    expect(energyBar(1.3)).toEqual({ solid: 7, flicker: null, flickerAlpha: 0 });
    expect(energyBar(0.95)).toEqual({ solid: 7, flicker: null, flickerAlpha: 0 });
    const fading = energyBar(0.9)!;
    expect(fading.solid).toBe(6);
    expect(fading.flicker).toBe(7);
    expect(fading.flickerAlpha).toBeGreaterThanOrEqual(0);
    expect(fading.flickerAlpha).toBeLessThanOrEqual(1);
    expect(energyBar(0.05)).toMatchObject({ solid: 0, flicker: 0 });
    expect(energyBar(0)).toBeNull();
    expect(energyBar(-0.2)).toBeNull();
  });

  it('turns the mood sour as energy drops', () => {
    expect(moodFor(1)).toEqual({ mouth: 0, browAngle: 0 });
    expect(moodFor(0.6)).toEqual({ mouth: 1, browAngle: 0 });
    expect(moodFor(0.4)).toEqual({ mouth: 2, browAngle: 10 });
    expect(moodFor(0.1)).toEqual({ mouth: 4, browAngle: 25 });
  });

  it('maps level colour names onto the original table', () => {
    expect(paletteColor('BLUE')).toEqual({ main: 0x70a9ff, shade: 0x5d9eff });
    expect(paletteColor('VIOLET').main).toBe(0xc789f3);
    expect(paletteColor(null).main).toBe(0xc8c8c8);
    expect(paletteColor('NOPE')).toEqual(paletteColor(null));
  });
});

describe('sky', () => {
  it('runs from day through sunset to night and back in 220 seconds', () => {
    expect(skyPhaseAt(0)).toEqual({ phase: 0, blend: 0 });
    expect(skyPhaseAt(30)).toEqual({ phase: 0, blend: 0.5 });
    expect(skyPhaseAt(65)).toEqual({ phase: 1, blend: 0.5 });
    expect(skyPhaseAt(110).phase).toBe(4);
    expect(skyPhaseAt(220)).toEqual({ phase: 0, blend: 0 });
    expect(skyColorsAt(0)).toEqual(['rgb(153,229,255)', 'rgb(178,229,255)', 'rgb(229,229,255)']);
    expect(skyColorsAt(110)[0]).toBe('rgb(0,0,0)');
  });

  it('drifts each cloud across during half of its loop', () => {
    expect(cloudX(0, 0.3)).toBeCloseTo(290);
    expect(cloudX(10, 0.3)).toBeCloseTo(340);
    expect(cloudX(0, 1)).toBeNull();
    expect(cloudX(260, 1)).toBeCloseTo(-100);
  });
});

describe('water', () => {
  it('spaces a plane\'s rings by its speed', () => {
    expect(ringInterval(0, 1)).toBeCloseTo(1);
    expect(ringInterval(0, 0)).toBeCloseTo(0.7);
    expect(ringInterval(50, 1)).toBeCloseTo(0.1);
    expect(ringInterval(200, 1)).toBeCloseTo(0.07);
  });
});

describe('runway combo arrows', () => {
  it('shows up to one arrow per second of combo time, falling with the square of the timer', () => {
    expect(comboArrows(1, 5)).toBe(5);
    expect(comboArrows(0.5, 5)).toBeCloseTo(1.25);
    expect(comboArrows(0, 5)).toBe(0);
  });
});

describe('world map markers', () => {
  it('shows a level as not reached, next to play, or by the score tier it was passed with', () => {
    expect(markerImage(0, false)).toBe(0);
    expect(markerImage(0, true)).toBe(1);
    expect(markerImage(1, false)).toBe(2);
    expect(markerImage(5, false)).toBe(6);
  });
});

describe('final report', () => {
  it('grows each punctuality bar to the whole percentage of the level\'s planes', () => {
    expect(reportPercent(5, 5)).toBe(100);
    expect(reportPercent(1, 3)).toBe(33);
    expect(reportPercent(0, 7)).toBe(0);
    expect(reportPercent(2, 0)).toBe(0);
  });
});

describe('plane balloons', () => {
  const bubble = { x: 45, y: 45 };
  it('hangs the speech balloon up and to the right by default, mirrored for the other corners', () => {
    expect(speechPlace(bubble, 5, 1, 1)).toEqual({ x: 45, y: -73, flipX: false, flipY: false });
    expect(speechPlace(bubble, 5, 0, 1).x).toBe(50);
    expect(speechPlace(bubble, 5, 1, 0)).toEqual({ x: -35, y: -73, flipX: true, flipY: false });
    expect(speechPlace(bubble, 5, 1, 3)).toEqual({ x: 45, y: 22, flipX: false, flipY: true });
  });

  it('puts the thought cloud 50 px aside, above or below', () => {
    expect(thoughtPlace(1)).toEqual({ x: 50, y: -80, flipX: false, flipY: false });
    expect(thoughtPlace(2)).toEqual({ x: -50, y: 15, flipX: true, flipY: true });
  });
});

describe('in-game bar', () => {
  const goals = { number: 1, extraPlane: false, fogs: 0, ices: 0, sands: 0, goal: 1000, expert: 2000, master: 3000, supreme: 4000, perfect: 5000 };
  it('fills the goal bar tier by tier, quickly at first within each', () => {
    expect(goalBarFraction(0, goals)).toBe(0);
    expect(goalBarFraction(1000, goals)).toBeCloseTo(0.2);
    expect(goalBarFraction(500, goals)).toBeCloseTo(0.2 * Math.pow(0.5, 0.6));
    expect(goalBarFraction(1500, goals)).toBeCloseTo(0.2 + 0.2 * Math.pow(0.5, 0.6));
    expect(goalBarFraction(9000, goals)).toBe(1);
    expect(goalBarFraction(-300, goals)).toBe(0);
  });

  it('reads the time left as three base-9 digits', () => {
    expect(clockDigits(1)).toEqual([9, 9, 9]);
    expect(clockDigits(0.5)).toEqual([4, 4, 4]);
    expect(clockDigits(1 / 9)).toEqual([1, 0, 0]);
    expect(clockDigits(0)).toEqual([0, 0, 0]);
  });
});

describe('runway in-use arrows', () => {
  it('run towards the node for a landing and away from it for a take-off', () => {
    expect(usingArrow(0, true)).toEqual({ along: 260, opacity: 0 });
    expect(usingArrow(0.5, true)).toEqual({ along: 150, opacity: 1 });
    expect(usingArrow(1, true).along).toBe(40);
    expect(usingArrow(0, false).along).toBe(40);
    expect(usingArrow(1, false).along).toBe(260);
    // They fade over the first and last tenth of the run.
    expect(usingArrow(0.05, false).opacity).toBeCloseTo(0.5, 5);
    expect(usingArrow(0.95, false).opacity).toBeCloseTo(0.5, 5);
  });
});
