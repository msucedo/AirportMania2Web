import { Sprite, Texture } from 'pixi.js';
import { fontFamily } from '../../engine/fonts';

// The two title fonts, drawn the way the engine renders their letters (`UltraFontEffect` 0xbb89c
// and `GiantFontEffect` 0xbbbd0): a gradient down each letter, a light rim on its upper left, a
// soft tinted base under it, a black border, and every colour raised to the power 2.2. See
// docs/re-notes.md.

type Rgb = readonly [number, number, number];

export interface TitleEffect {
  /** The gradient's colour at the foot of a letter and at its head. */
  foot: Rgb;
  head: Rgb;
  /** The colour of the soft base under the letter. */
  base: Rgb;
}

export const ULTRA_EFFECT: TitleEffect = { foot: [0.85, 0.93, 1], head: [1, 1, 1], base: [0.76, 0.83, 1] };
export const GIANT_EFFECT: TitleEffect = { foot: [1, 0.682353, 0], head: [1, 1, 1], base: [1, 0.76, 0.83] };

/** The six places up and to the left whose emptiness lights a point (0xbb9b0). */
const RIM: readonly (readonly [number, number])[] = [[-3, -1], [-2, -2], [-1, -3], [-2, -1], [-1, -1], [-1, -2]];

/**
 * The engine's blur (0x98b78), as it treats opacity: each whole unit of the radius is one pass of a 3×3 average, and
 * what is left over mixes one more pass in by that much. `unit` is how many of our pixels one
 * of the engine's is; the average is then taken over as many of ours as cover those three.
 */
export function blur(values: Float32Array, width: number, height: number, radius: number, unit = 1): Float32Array {
  // Three of the engine's pixels across, in ours.
  const reach = Math.floor((3 * unit) / 2);
  const count = (2 * reach + 1) ** 2;
  let current = values;
  for (let left = radius; left > 0; left -= 1) {
    const mix = Math.min(1, left);
    const next = new Float32Array(current.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let sy = Math.max(0, y - reach); sy <= Math.min(height - 1, y + reach); sy++) {
          for (let sx = Math.max(0, x - reach); sx <= Math.min(width - 1, x + reach); sx++) sum += current[sy * width + sx]!;
        }
        // What the average leaves is then made more solid: 1 − (1 − a)⁴, as runs of the routine show.
        next[y * width + x] = 1 - (1 - ((1 - mix) * current[y * width + x]! + (mix * sum) / count)) ** 4;
      }
    }
    current = next;
  }
  return current;
}

/**
 * A letter's picture from its coverage (0 to 1 for each point), as red, green, blue and opacity
 * from 0 to 1. `unit` is how many of our pixels one of the engine's is.
 */
export function titleLetter(cover: Float32Array, width: number, height: number, effect: TitleEffect, unit = 1): Float32Array {
  const at = (x: number, y: number): number => (x >= 0 && y >= 0 && x < width && y < height ? cover[y * width + x]! : 0);
  // 0x91cec: the gradient runs over the rows the letter covers.
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cover[y * width + x]! > 0) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  const out = new Float32Array(4 * width * height);
  if (bottom < 0) return out;
  // 0x997ec then 0x98b78 with 0.75: the base is the letter in one colour, softened.
  const base = blur(cover, width, height, 0.75, unit);
  const face = new Float32Array(3 * width * height);
  for (let y = top; y <= bottom; y++) {
    const down = bottom === top ? 1 : (y - top) / (bottom - top);
    for (let x = 0; x < width; x++) {
      const a = cover[y * width + x]!;
      if (a <= 0) continue;
      // 0xbb9b0: lit by how empty the six places up and to its left are.
      let empty = 0;
      for (const [dx, dy] of RIM) empty += 1 - at(x + dx * unit, y + dy * unit);
      const lit = (a * empty) / 9;
      for (let c = 0; c < 3; c++) {
        const colour = effect.head[c]! + (effect.foot[c]! - effect.head[c]!) * down;
        face[3 * (y * width + x) + c] = colour + (1 - colour) * lit;
      }
    }
  }
  // 0x9891c: the letter over its base.
  const solid = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const a = cover[i]!;
    const under = base[i]! * (1 - a);
    const total = a + under;
    solid[i] = total;
    for (let c = 0; c < 3; c++) out[4 * i + c] = total > 0 ? (face[3 * i + c]! * a + effect.base[c]! * under) / total : 0;
  }
  // 0x91dc8 with 2: a black copy, blurred, goes under all of it.
  const border = blur(solid, width, height, 2, unit);
  for (let i = 0; i < width * height; i++) {
    const a = solid[i]!;
    const total = a + border[i]! * (1 - a);
    for (let c = 0; c < 3; c++) {
      const colour = total > 0 ? (out[4 * i + c]! * a) / total : 0;
      // 0x97d70: every colour to the power 2.2.
      out[4 * i + c] = Math.pow(colour, 2.2);
    }
    out[4 * i + 3] = Math.min(1, total);
  }
  return out;
}

/** How many of our pixels stand for one of the engine's, and the room kept round each letter for its border. */
const UNIT = 3;
const ROOM = 5;

/**
 * A line of text in one of the title fonts, as a picture. It is `ROOM` px larger on every side
 * than the text itself, for the borders.
 */
export function titleText(text: string, font: string, size: number, widthScale: number, effect: TitleEffect): Sprite {
  const family = fontFamily(font);
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `${size * UNIT}px ${family}`;
  const whole = measure.measureText(text);
  const ascent = Math.ceil(whole.fontBoundingBoxAscent);
  const descent = Math.ceil(whole.fontBoundingBoxDescent);
  const room = ROOM * UNIT;
  const line = document.createElement('canvas');
  line.width = Math.max(1, Math.ceil(whole.width * widthScale) + 2 * room);
  line.height = ascent + descent + 2 * room;
  const target = line.getContext('2d')!;
  const letters = [...text];
  let before = '';
  for (const letter of letters) {
    const x = measure.measureText(before).width * widthScale;
    before += letter;
    const across = Math.ceil(measure.measureText(letter).width * widthScale) + 2 * room;
    if (letter.trim() === '') continue;
    // Each letter is rendered by itself, as the engine does when it builds a font.
    const cell = document.createElement('canvas');
    cell.width = across;
    cell.height = line.height;
    const pen = cell.getContext('2d', { willReadFrequently: true })!;
    pen.font = measure.font;
    pen.fillStyle = '#fff';
    pen.setTransform(widthScale, 0, 0, 1, room, room + ascent);
    pen.fillText(letter, 0, 0);
    pen.setTransform(1, 0, 0, 1, 0, 0);
    const image = pen.getImageData(0, 0, cell.width, cell.height);
    const cover = new Float32Array(cell.width * cell.height);
    for (let i = 0; i < cover.length; i++) cover[i] = image.data[4 * i + 3]! / 255;
    const done = titleLetter(cover, cell.width, cell.height, effect, UNIT);
    for (let i = 0; i < cover.length; i++) {
      for (let c = 0; c < 3; c++) image.data[4 * i + c] = Math.round(255 * done[4 * i + c]!);
      image.data[4 * i + 3] = Math.round(255 * done[4 * i + 3]!);
    }
    pen.putImageData(image, 0, 0);
    target.drawImage(cell, Math.round(x), 0);
  }
  const texture = Texture.from({ resource: line, resolution: UNIT });
  return new Sprite(texture);
}

/** The room a title's picture keeps round its text, in screen px. */
export const TITLE_ROOM = ROOM;
