import { describe, expect, it } from 'vitest';
import { paletteColor } from '../src/game/palette';
import { energyBar, moodFor, orientationFor } from '../src/game/planeView';
import { markerImage } from '../src/game/worldMap';
import { comboArrows } from '../src/game/view/runwayView';
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
