import { BORDER, MAIN_FILL, SCORE_FILL, SCORE_NEGATIVE_FILL } from './faces';
import { Container, Text, type TextStyleOptions } from 'pixi.js';
import { fontFamily } from '../../engine/fonts';

/** Fonts behind the original cached fonts `FONTS.SCORE` and `FONTS.MAIN`. */
export const SCORE_FONT = 'FONTS.KENYAN_COFFEE_BD';
export const MAIN_FONT = 'FONTS.BRADY_BUNCH';

// 0x5280: every list of floating texts is set up with these (0x655bc): a text stays 3 s and
// rises 15 px a second, and one pushed more than 100 px up is aged half a second.
const LIFETIME = 3;
const RISE = 15;
const LIMIT = 100;

/**
 * A text's stretch `age` seconds after it appears (0x65998): for two thirds of a second it
 * wobbles, a tenth across and a fifth down, less and less.
 */
export function floatingStretch(age: number): { x: number; y: number } {
  const t = 1.5 * age;
  if (t >= 1) return { x: 1, y: 1 };
  return { x: 1 + 0.1 * (1 - t) * Math.sin(2 * Math.PI * t), y: 1 + 0.2 * (1 - t) * Math.sin(3 * Math.PI * t) };
}

/** Its opacity: whole until its last second, over which it goes (0x65a3e). */
export const floatingAlpha = (age: number, lifetime: number): number => (age > lifetime - 1 ? Math.max(0, lifetime - age) : 1);

/**
 * How far the texts already up must be pushed for a new one `height` tall (0x657f0): by what the
 * newest lacks to have risen that far, each in turn from the newest while it is within 5 px of
 * the new one's place.
 */
export function floatingPush(existing: readonly { x: number; y: number; offset: number }[], at: { x: number; y: number }, height: number): number[] {
  const pushes = existing.map(() => 0);
  const newest = existing.at(-1);
  if (!newest || newest.offset >= height) return pushes;
  const push = height - newest.offset;
  for (let i = existing.length - 1; i >= 0; i--) {
    const item = existing[i]!;
    if (Math.hypot(item.x - at.x, item.y - at.y) > 5) break;
    pushes[i] = push;
  }
  return pushes;
}

// The originals are pre-rendered with "MoneyEffect" and "GoldOrangeEffect" gradients, which have not
// been read from the binary; these fills and outlines approximate them.
const STYLES = {
  score: { fontFamily: fontFamily(SCORE_FONT), fontSize: 16, fill: SCORE_FILL, stroke: BORDER },
  penalty: { fontFamily: fontFamily(SCORE_FONT), fontSize: 16, fill: SCORE_NEGATIVE_FILL, stroke: BORDER },
  message: { fontFamily: fontFamily(MAIN_FONT), fontSize: 15, fill: MAIN_FILL, stroke: BORDER, letterSpacing: 1 },
} satisfies Record<string, TextStyleOptions>;

export type FloatingStyle = keyof typeof STYLES;

/** Short texts that rise and fade over the airport: points, bonuses and punctuality. */
export class FloatingTexts extends Container {
  private readonly items: { text: Text; x: number; y: number; offset: number; age: number }[] = [];

  show(label: string, x: number, y: number, style: FloatingStyle): void {
    const text = new Text({ text: label, style: STYLES[style] });
    text.anchor.set(0.5);
    // 0x657d4: the place is taken in whole pixels; a text is 2 px taller than its font.
    const at = { x: Math.floor(x), y: Math.floor(y) };
    const pushes = floatingPush(this.items, at, text.height + 2);
    this.items.forEach((item, index) => {
      if (pushes[index] === 0) return;
      item.offset += pushes[index]!;
      // 0x65862: past the list's limit it is brought nearer its end.
      if (item.offset > LIMIT) item.age += 0.5;
    });
    this.addChild(text);
    this.items.push({ text, ...at, offset: 0, age: 0 });
    this.place();
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      item.age += dt;
      item.offset += RISE * dt;
      if (item.age >= LIFETIME) {
        item.text.destroy();
        this.items.splice(i, 1);
      }
    }
    this.place();
  }

  private place(): void {
    for (const item of this.items) {
      const stretch = floatingStretch(item.age);
      item.text.position.set(item.x, item.y - item.offset);
      item.text.scale.set(stretch.x, stretch.y);
      item.text.alpha = floatingAlpha(item.age, LIFETIME);
    }
  }
}
