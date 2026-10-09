import { Container, Text, type TextStyleOptions } from 'pixi.js';
import { fontFamily } from '../../engine/fonts';

/** Fonts behind the original cached fonts `FONTS.SCORE` and `FONTS.MAIN`. */
export const SCORE_FONT = 'FONTS.KENYAN_COFFEE_BD';
export const MAIN_FONT = 'FONTS.BRADY_BUNCH';

const LIFETIME = 1.4;
const RISE = 18;

// The originals are pre-rendered with "MoneyEffect" and "GoldOrangeEffect" gradients, which have not
// been read from the binary; these fills and outlines approximate them.
const STYLES = {
  score: { fontFamily: fontFamily(SCORE_FONT), fontSize: 16, fill: 0xffe45c, stroke: { color: 0x3a2a00, width: 3 } },
  penalty: { fontFamily: fontFamily(SCORE_FONT), fontSize: 16, fill: 0xff6b5c, stroke: { color: 0x3a0000, width: 3 } },
  message: { fontFamily: fontFamily(MAIN_FONT), fontSize: 15, fill: 0xffb52e, stroke: { color: 0x4a2200, width: 3 }, letterSpacing: 1 },
} satisfies Record<string, TextStyleOptions>;

export type FloatingStyle = keyof typeof STYLES;

/** Short texts that rise and fade over the airport: points, bonuses and punctuality. */
export class FloatingTexts extends Container {
  private readonly items: { text: Text; age: number }[] = [];

  show(label: string, x: number, y: number, style: FloatingStyle): void {
    const text = new Text({ text: label, style: STYLES[style] });
    text.anchor.set(0.5);
    text.position.set(x, y);
    this.addChild(text);
    this.items.push({ text, age: 0 });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      item.age += dt;
      item.text.y -= RISE * dt;
      item.text.alpha = Math.max(0, 1 - item.age / LIFETIME);
      if (item.age >= LIFETIME) {
        item.text.destroy();
        this.items.splice(i, 1);
      }
    }
  }
}
