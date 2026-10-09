import type { PlaneColor } from '../data/levels';

/** A plane or gate colour: the flat tint and the darker tone the body gradient runs to. */
export interface PaletteColor {
  main: number;
  shade: number;
}

/**
 * The default colour table, filled in by `0xcc6ac` at `airport + 0x300` (main) and `+0x390`
 * (shade). Index 0 is "no colour" and 8 is the president's plane. The binary carries two more
 * tables for the colour-blind options, which are not used here.
 */
const PALETTE: readonly PaletteColor[] = [
  { main: 0xc8c8c8, shade: 0xc8c8c8 },
  { main: 0x70a9ff, shade: 0x5d9eff },
  { main: 0xffb05a, shade: 0xff7b00 },
  { main: 0xbde26c, shade: 0x8db92d },
  { main: 0x8ad8c1, shade: 0x60cdd7 },
  { main: 0xf38fe0, shade: 0xf389bb },
  { main: 0xe3c53a, shade: 0xf9ff31 },
  { main: 0xc789f3, shade: 0x9764f3 },
  { main: 0x646464, shade: 0x646464 },
];

/** Colour names in the order the level files map to table indices (strings at `0x16bfb0`). */
const NAMES = ['BLUE', 'ORANGE', 'GREEN', 'CYAN', 'PINK', 'YELLOW', 'VIOLET'];

export const NEUTRAL_COLOR = PALETTE[0]!;
/** The president's plane has a colour of its own, whatever the level file says (0x4d1c). */
export const PRESIDENT_COLOR = PALETTE[8]!;

export function paletteColor(color: PlaneColor | null): PaletteColor {
  const index = color ? NAMES.indexOf(color) + 1 : 0;
  return PALETTE[index] ?? NEUTRAL_COLOR;
}
