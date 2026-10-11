import type { PlaneColor } from '../data/levels';

/** A plane or gate colour: the flat tint and the darker tone the body gradient runs to. */
export interface PaletteColor {
  main: number;
  shade: number;
}

/**
 * The four colour tables, filled in by `0xcc6ac` at `airport + 0x300 + palette · 0x120` (main,
 * and the shade 0x90 further). Index 0 is "no colour" and 8 is the president's plane. The first
 * is the game's own; the others are the flat sets the options' colour help offers (`Prota`,
 * `Deute`, `Tritan`), whose shade is their main colour.
 */
const flat = (colours: readonly number[]): PaletteColor[] => colours.map((main) => ({ main, shade: main }));
const PALETTES: readonly (readonly PaletteColor[])[] = [
  [
    { main: 0xc8c8c8, shade: 0xc8c8c8 },
    { main: 0x70a9ff, shade: 0x5d9eff },
    { main: 0xffb05a, shade: 0xff7b00 },
    { main: 0xbde26c, shade: 0x8db92d },
    { main: 0x8ad8c1, shade: 0x60cdd7 },
    { main: 0xf38fe0, shade: 0xf389bb },
    { main: 0xe3c53a, shade: 0xf9ff31 },
    { main: 0xc789f3, shade: 0x9764f3 },
    { main: 0x646464, shade: 0x646464 },
  ],
  flat([0xc8c8c8, 0x00006c, 0xff5c5a, 0x008200, 0x00d6de, 0x008dff, 0xffff00, 0x0000ff, 0x646464]),
  flat([0xc8c8c8, 0x00006c, 0x30ff30, 0x5cde00, 0x8dff00, 0x8dffff, 0xff0000, 0x0000ff, 0x646464]),
  flat([0xc8c8c8, 0x00d600, 0x5cde00, 0x820000, 0xc789f3, 0x8dff00, 0xff0000, 0x00ff00, 0x646464]),
];
export const PALETTE_COUNT = PALETTES.length;

/** The table in use (0x12ddc copies the chosen one over the airport's). */
let PALETTE: readonly PaletteColor[] = PALETTES[0]!;

/** Chooses the table every colour is taken from, from now on. */
export function usePalette(index: number): void {
  PALETTE = PALETTES[index] ?? PALETTES[0]!;
}

/** The seven plane colours of a table, as the colour help shows them (0x26abc). */
export const paletteSamples = (index: number): number[] => (PALETTES[index] ?? PALETTES[0]!).slice(1, 8).map((colour) => colour.main);

/** Colour names in the order the level files map to table indices (strings at `0x16bfb0`). */
export const COLOR_NAMES: readonly string[] = ['BLUE', 'ORANGE', 'GREEN', 'CYAN', 'PINK', 'YELLOW', 'VIOLET'];

export const NEUTRAL_COLOR = PALETTES[0]![0]!;
/** The president's plane has a colour of its own, whatever the level file says (0x4d1c). */
export const PRESIDENT_COLOR = PALETTES[0]![8]!;

export function paletteColor(color: PlaneColor | null): PaletteColor {
  const index = color ? COLOR_NAMES.indexOf(color) + 1 : 0;
  return PALETTE[index] ?? NEUTRAL_COLOR;
}

/**
 * The colour of each score tier, from the goal up to a perfect score: the table at `0x181314`,
 * filled by the static initialiser `0x4f788`. The goal bar and the score plates use it.
 */
export const TIER_COLORS: readonly number[] = [0xffac32, 0xe6e530, 0x6fe546, 0x50afff, 0xa055cc];
