import { describe, expect, it } from 'vitest';
import { HELP_PAGES, helpPictures, helpSurfaces, nextTip } from '../src/game/help';

describe('help', () => {
  it('has seven pages of two pictures before the tips', () => {
    expect(HELP_PAGES).toBe(8);
    expect(helpPictures(1, 4)).toEqual(['HINTS.PLANE', 'HINTS.RUNWAY']);
    expect(helpPictures(7, 4)).toEqual(['HINTS.SWAPPING_PLACES', 'HINTS.HIGHER_SCORES']);
  });

  it('shows the gate and the gas station of the stage being played', () => {
    expect(helpPictures(3, 4)).toEqual(['HINTS.GATE_4', 'HINTS.GAS_STATION_4']);
    expect(helpPictures(3, 0)).toEqual(['HINTS.GATE_0', 'HINTS.GAS_STATION_0']);
    // The runway is on two pages; it is loaded once.
    expect(helpSurfaces(2)).toHaveLength(13);
    expect(helpSurfaces(2)).toContain('HINTS.GATE_2');
  });

  it('goes round the tips', () => {
    expect(nextTip(0, 43)).toBe(1);
    expect(nextTip(41, 43)).toBe(42);
    expect(nextTip(42, 43)).toBe(0);
  });
});
