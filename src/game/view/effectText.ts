import { CanvasTextMetrics, Container, ObservablePoint, Sprite, TextStyle, Texture, type FillInput, type StrokeInput, type TextStyleOptions } from 'pixi.js';
import { fontFamily } from '../../engine/fonts';
import { MAIN_FILL, SCORE_FILL, SCORE_NEGATIVE_FILL } from './faces';

// The two title fonts, drawn the way the engine renders their letters (`UltraFontEffect` 0xbb89c
// and `GiantFontEffect` 0xbbbd0): a gradient down each letter, a light rim on its lower left, a
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

/**
 * The six places whose emptiness lights a point (0xbb9b0): to its left and, in the engine's
 * pictures, in the rows before it. Those rows are the lower ones: the gradient's first colour
 * is the foot's, as the game's own picture of this font shows (`HINTS.HIGHER_SCORES`). So the
 * light falls on a letter's lower left.
 */
const RIM: readonly (readonly [number, number])[] = [[-3, 1], [-2, 2], [-1, 3], [-2, 1], [-1, 1], [-1, 2]];

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
      // 0xbb9b0: lit by how empty those six places are.
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

// The plain fonts (`MoneyEffect` 0xbbfa4, `MoneyNegativeEffect` 0xbbefc, `GoldOrangeEffect`
// 0xbb808, `WhiteSilverEffect` 0xbb7a8): a gradient down each letter (0x91cec) and a black copy
// of it, blurred by 1.5, under it (0x91dc8).

export interface PlainEffect {
  /** The gradient's colour at the foot of a letter and at its head. */
  foot: Rgb;
  head: Rgb;
  /** The border's colour, when the letter has one. */
  border: Rgb | null;
}

export const MONEY_EFFECT: PlainEffect = { foot: [0.5216, 0.7882, 0.0353], head: [1, 0.9725, 0], border: [0, 0, 0] };
export const MONEY_NEGATIVE_EFFECT: PlainEffect = { foot: [0.7882, 0.3529, 0.0353], head: [1, 0.098, 0], border: [0, 0, 0] };
export const GOLD_ORANGE_EFFECT: PlainEffect = { foot: [1, 0.75, 0.5], head: [1, 1, 0.9], border: [0, 0, 0] };
export const WHITE_SILVER_EFFECT: PlainEffect = { foot: [1, 1, 1], head: [1, 1, 1], border: [0, 0, 0] };

/**
 * The border of a letter (0x91dc8 with 1.5), as strong at each point as the engine makes it. The
 * engine blurs its own pixels, and its blur hardens what it spreads at every pass, so the border
 * is worked out on the engine's pixels (the coverage averaged over each) and then spread smoothly
 * over ours; blurring ours directly would harden it many times more and close the letters up.
 */
export function letterBorder(cover: Float32Array, width: number, height: number, unit: number): Float32Array {
  if (unit === 1) return blur(cover, width, height, 1.5);
  const across = Math.ceil(width / unit);
  const down = Math.ceil(height / unit);
  const coarse = new Float32Array(across * down);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) coarse[Math.floor(y / unit) * across + Math.floor(x / unit)]! += cover[y * width + x]! / (unit * unit);
  }
  const soft = blur(coarse, across, down, 1.5);
  const at = (x: number, y: number): number => soft[Math.max(0, Math.min(down - 1, y)) * across + Math.max(0, Math.min(across - 1, x))]!;
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / unit - 0.5;
    const y0 = Math.floor(v);
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / unit - 0.5;
      const x0 = Math.floor(u);
      const [fx, fy] = [u - x0, v - y0];
      out[y * width + x] = (1 - fy) * ((1 - fx) * at(x0, y0) + fx * at(x0 + 1, y0)) + fy * ((1 - fx) * at(x0, y0 + 1) + fx * at(x0 + 1, y0 + 1));
    }
  }
  return out;
}

/**
 * A letter in a plain effect, from its coverage, as two pictures like `titleLetter`'s: the letter
 * with its gradient, and the border that goes under it.
 */
export function plainLetter(cover: Float32Array, width: number, height: number, effect: PlainEffect, unit = 1): { face: Float32Array; border: Float32Array } {
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
  const face = new Float32Array(4 * width * height);
  const border = new Float32Array(4 * width * height);
  if (bottom < 0) return { face, border };
  const spread = effect.border ? letterBorder(cover, width, height, unit) : null;
  for (let y = 0; y < height; y++) {
    // 0x91cec: the gradient runs over the rows the letter covers.
    const down = bottom === top ? 1 : Math.max(0, Math.min(1, (y - top) / (bottom - top)));
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      for (let c = 0; c < 3; c++) {
        face[4 * i + c] = effect.head[c]! + (effect.foot[c]! - effect.head[c]!) * down;
        border[4 * i + c] = effect.border?.[c] ?? 0;
      }
      face[4 * i + 3] = cover[i]!;
      border[4 * i + 3] = spread ? spread[i]! : 0;
    }
  }
  return { face, border };
}

const rgb = (colour: number): Rgb => [((colour >> 16) & 255) / 255, ((colour >> 8) & 255) / 255, (colour & 255) / 255];

/** The effect a text's fill and outline stand for: the faces' gradients are the game's effects, a plain colour is itself. */
function effectOf(fill: FillInput | undefined, stroke: StrokeInput | undefined): PlainEffect {
  const edge = stroke === undefined ? null : rgb(typeof stroke === 'object' && 'color' in stroke && typeof stroke.color === 'number' ? stroke.color : 0);
  if (fill === MAIN_FILL) return { ...GOLD_ORANGE_EFFECT, border: edge };
  if (fill === SCORE_FILL) return { ...MONEY_EFFECT, border: edge };
  if (fill === SCORE_NEGATIVE_FILL) return { ...MONEY_NEGATIVE_EFFECT, border: edge };
  const colour = rgb(typeof fill === 'number' ? fill : 0xffffff);
  return { foot: colour, head: colour, border: edge };
}

/** Letters already rendered, by font, effect and letter. */
const letters = new Map<string, { face: HTMLCanvasElement; border: HTMLCanvasElement }>();
const pens = new Map<string, CanvasRenderingContext2D>();

function penFor(font: string): CanvasRenderingContext2D {
  let pen = pens.get(font);
  if (!pen) {
    pen = document.createElement('canvas').getContext('2d')!;
    pen.font = font;
    pens.set(font, pen);
  }
  return pen;
}

/** One letter in an effect and its border, with `ROOM` round them; the baseline is `ROOM` and the font's ascent down. */
function letterPicture(font: string, letter: string, effect: PlainEffect): { face: HTMLCanvasElement; border: HTMLCanvasElement } {
  const key = `${font}|${effect.foot}|${effect.head}|${effect.border}|${letter}`;
  const kept = letters.get(key);
  if (kept) return kept;
  const measure = penFor(font);
  const size = measure.measureText(letter);
  const room = ROOM * UNIT;
  // Whole pixels of the engine's, so that its pixels are whole groups of ours.
  const whole = (length: number): number => UNIT * Math.ceil(length / UNIT);
  const width = whole(size.width) + 2 * room;
  const height = whole(Math.ceil(size.fontBoundingBoxAscent) + Math.ceil(size.fontBoundingBoxDescent)) + 2 * room;
  const sheet = (): { canvas: HTMLCanvasElement; pen: CanvasRenderingContext2D } => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return { canvas, pen: canvas.getContext('2d', { willReadFrequently: true })! };
  };
  const face = sheet();
  face.pen.font = font;
  face.pen.fillStyle = '#fff';
  face.pen.fillText(letter, room, room + Math.ceil(size.fontBoundingBoxAscent));
  const image = face.pen.getImageData(0, 0, width, height);
  const cover = new Float32Array(width * height);
  for (let i = 0; i < cover.length; i++) cover[i] = image.data[4 * i + 3]! / 255;
  const done = plainLetter(cover, width, height, effect, UNIT);
  const put = (values: Float32Array, to: CanvasRenderingContext2D): void => {
    for (let i = 0; i < values.length; i++) image.data[i] = Math.round(255 * values[i]!);
    to.putImageData(image, 0, 0);
  };
  put(done.face, face.pen);
  const border = sheet();
  put(done.border, border.pen);
  const made = { face: face.canvas, border: border.canvas };
  letters.set(key, made);
  return made;
}

/**
 * A text in one of the plain fonts, its letters rendered as the engine renders them. It stands
 * where a text of the browser's with the same style would, and is used the same way: the lines,
 * their places and the box the anchor works on are that text's.
 */
export class Label extends Container {
  readonly anchor: ObservablePoint;
  /** The parts of the style that can be changed afterwards. */
  readonly style: { fill: FillInput | undefined };
  private readonly picture = new Sprite();
  private readonly look: TextStyle;
  private readonly stroke: StrokeInput | undefined;
  private value: string;
  private fill: FillInput | undefined;
  private box = { width: 0, height: 0 };

  constructor(options: { text: string; style: TextStyleOptions }) {
    super();
    this.value = options.text;
    this.fill = options.style.fill as FillInput | undefined;
    this.stroke = options.style.stroke as StrokeInput | undefined;
    // The browser's text is only measured: its fill does not matter to that.
    this.look = new TextStyle({ ...options.style, fill: 0xffffff });
    this.anchor = new ObservablePoint({ _onUpdate: () => this.place() }, 0, 0);
    const setFill = (fill: FillInput | undefined): void => {
      this.fill = fill;
      this.render();
    };
    const getFill = (): FillInput | undefined => this.fill;
    this.style = {
      get fill() {
        return getFill();
      },
      set fill(fill: FillInput | undefined) {
        setFill(fill);
      },
    };
    this.addChild(this.picture);
    this.render();
  }

  get text(): string {
    return this.value;
  }

  set text(value: string) {
    if (value === this.value) return;
    this.value = value;
    this.render();
  }

  override get width(): number {
    return Math.abs(this.scale.x) * this.box.width;
  }

  override set width(value: number) {
    if (this.box.width > 0) this.scale.x = value / this.box.width;
  }

  override get height(): number {
    return Math.abs(this.scale.y) * this.box.height;
  }

  override set height(value: number) {
    if (this.box.height > 0) this.scale.y = value / this.box.height;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    const texture = this.picture.texture;
    super.destroy(options);
    if (texture !== Texture.EMPTY) texture.destroy(true);
  }

  private place(): void {
    this.picture.position.set(-this.anchor.x * this.box.width - ROOM, -this.anchor.y * this.box.height - ROOM);
  }

  private render(): void {
    const { look } = this;
    const metrics = CanvasTextMetrics.measureText(this.value, look);
    this.box = { width: metrics.width, height: metrics.height };
    const effect = effectOf(this.fill, this.stroke);
    const font = `${look.fontStyle} ${look.fontVariant} ${look.fontWeight} ${look.fontSize * UNIT}px ${look.fontFamily}`;
    const measure = penFor(font);
    const room = ROOM * UNIT;
    const sheet = document.createElement('canvas');
    sheet.width = Math.max(1, Math.ceil(metrics.width * UNIT) + 2 * room);
    sheet.height = Math.max(1, Math.ceil(metrics.height * UNIT) + 2 * room);
    const target = sheet.getContext('2d')!;
    const half = (look._stroke?.width ?? 0) / 2;
    const shift = Math.max(0, (metrics.lineHeight - metrics.fontProperties.fontSize) / 2);
    // Each letter is rendered by itself, as the engine does when it builds a font. All the
    // borders are laid before any letter, so that a letter's border does not cover its
    // neighbour: how the engine keeps bordered letters apart is not read.
    for (const layer of ['border', 'face'] as const) {
      metrics.lines.forEach((line, row) => {
        const spare = metrics.maxLineWidth - metrics.lineWidths[row]!;
        const x = half + (look.align === 'center' ? spare / 2 : look.align === 'right' ? spare : 0);
        const baseline = half + row * metrics.lineHeight + metrics.fontProperties.ascent + shift;
        let before = '';
        [...line].forEach((letter, index) => {
          const along = measure.measureText(before).width + index * look.letterSpacing * UNIT;
          before += letter;
          if (letter.trim() === '') return;
          const ascent = Math.ceil(measure.measureText(letter).fontBoundingBoxAscent);
          target.drawImage(letterPicture(font, letter, effect)[layer], Math.round(x * UNIT + along), Math.round(baseline * UNIT) - ascent);
        });
      });
    }
    const old = this.picture.texture;
    this.picture.texture = Texture.from({ resource: sheet, resolution: UNIT });
    if (old !== Texture.EMPTY) old.destroy(true);
    this.place();
  }
}
