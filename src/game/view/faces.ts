import { FillGradient, type FillInput, type StrokeInput } from 'pixi.js';

// The colour effects of the game's cached fonts, as the engine renders them into each letter
// (effects registered by 0xbc03c): a gradient between two colours down the letter (0x91cec) and
// a black border (0x91dc8). The gradient's first colour is the foot's: the game's own picture of
// a title (`HINTS.HIGHER_SCORES`) shows white over blue. See docs/re-notes.md.

const downwards = (stops: readonly [number, number | string][]): FillGradient =>
  new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local', colorStops: stops.map(([offset, color]) => ({ offset, color })) });

/** `GoldOrangeEffect` (0xbb808), of `FONTS.MAIN`: (1, 1, 0.9) over (1, 0.75, 0.5). */
export const MAIN_FILL: FillInput = downwards([[0, 0xffffe6], [1, 0xffbf80]]);
/** `MoneyEffect` (0xbbfa4), of `FONTS.SCORE`: (1, 0.9725, 0) over (0.5216, 0.7882, 0.0353). */
export const SCORE_FILL: FillInput = downwards([[0, 0xfff800], [1, 0x85c909]]);
/** `MoneyNegativeEffect` (0xbbefc), of `FONTS.SCORE_NEGATIVE`: (1, 0.098, 0) over (0.7882, 0.3529, 0.0353). */
export const SCORE_NEGATIVE_FILL: FillInput = downwards([[0, 0xff1900], [1, 0xc95a09]]);
/**
 * `UltraFontEffect` (0xbb89c), of `FONTS.ULTRA`: white over (0.85, 0.93, 1), then every colour
 * raised to the power 2.2 (0x97d70), which is why the middle is given too. The original also
 * embosses the letters, which is not done here.
 */
export const ULTRA_FILL: FillInput = downwards([[0, 0xffffff], [0.5, 0xd3eaff], [1, 0xb2d9ff]]);
/** `GiantFontEffect` (0xbbbd0), of `FONTS.GIANT_FONT`: white over (1, 0.682, 0), raised to 2.2 likewise. */
export const GIANT_FILL: FillInput = downwards([[0, 0xffffff], [0.5, 0xffb237], [1, 0xff6e00]]);

/**
 * The border of the plain effects (0x91dc8 with 1.5): a black copy of the letter, blurred, under
 * it. The engine's blur makes opacity more solid at each pass (runs of it give 1 − (1 − a)⁴), so
 * next to an edge the border is all but solid one pixel out and about 0.43 two out: an outline
 * a pixel and a half wide stands in for it here. `WhiteSilverEffect` (0xbb7a8) is this alone,
 * over white.
 */
export const BORDER: StrokeInput = { color: 0x000000, width: 3, join: 'round' };
