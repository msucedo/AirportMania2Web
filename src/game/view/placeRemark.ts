import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';

// The flash a place gives when a plane is ordered to it (0x6aea0): its remark image, six times
// over in hues around the plane's colour, spreading as it fades (update 0x6aee0, draw 0x6af20 and
// 0x6b20c). See docs/re-notes.md.

const RINGS = 6;
/** It goes at 3 a second. */
const FADE = 3;

/** Hue (degrees), saturation and value of a colour (0x6b620). */
export function hsv(color: number): { h: number; s: number; v: number } {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (max <= 0 || delta <= 0) return { h: 0, s: 0, v: max };
  let h = max === r ? (60 * (g - b)) / delta : max === g ? 120 + (60 * (b - r)) / delta : 240 + (60 * (r - g)) / delta;
  if (h < 0) h += 360;
  return { h, s: delta / max, v: max };
}

/** The colour of a hue, saturation and value (0x1fed8). */
export function rgb(h: number, s: number, v: number): number {
  const sector = (h / 60) % 6;
  const whole = Math.floor(sector);
  const f = sector - whole;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][whole]!;
  return (Math.round(r! * 255) << 16) | (Math.round(g! * 255) << 8) | Math.round(b! * 255);
}

/**
 * The six copies when the flash is at `alpha`: copy `i` is `i` times 15 px wider and 10 px taller
 * for what the flash has faded, and its hue 10° on from the one before, from 25° under the
 * plane's.
 */
export function remarkRings(alpha: number, width: number, height: number, color: number): { scaleX: number; scaleY: number; tint: number }[] {
  const { h, s, v } = hsv(color);
  return Array.from({ length: RINGS }, (_, i) => {
    const spread = (1 - alpha) * i;
    return { scaleX: 1 + (15 * spread) / width, scaleY: 1 + (10 * spread) / height, tint: rgb((((h + 10 * i - 25) % 360) + 360) % 360, s, v) };
  });
}

export class PlaceRemark extends Container {
  private readonly rings: Sprite[];
  private level = 0;
  private color = 0xffffff;

  constructor(textures: TextureStore, image: string) {
    super();
    this.rings = Array.from({ length: RINGS }, () => textures.sprite(image));
    this.addChild(...this.rings);
    this.eventMode = 'none';
    this.visible = false;
  }

  flash(color: number): void {
    this.level = 1;
    this.color = color;
  }

  update(dt: number): void {
    this.level = this.level > 0 ? Math.max(0, this.level - FADE * dt) : 0;
    this.visible = this.level > 0;
    if (!this.visible) return;
    const texture = this.rings[0]!.texture;
    remarkRings(this.level, texture.width, texture.height, this.color).forEach((ring, i) => {
      const sprite = this.rings[i]!;
      sprite.scale.set(ring.scaleX, ring.scaleY);
      sprite.tint = ring.tint;
      sprite.alpha = this.level;
    });
  }
}

/**
 * The remark image of a stop spot drawn with `surface` (0x78b74): by its kind, plain, VIP, the
 * island's or the island's VIP. The plain and the VIP one share theirs; `STOPSPOT_UP_REMARK` is
 * for a spot built facing up, which no stage script does.
 */
export function stopSpotRemark(surface: string, vip: boolean): string {
  if (surface.startsWith('STOPSPOT_ISLAND')) return vip ? 'STOPSPOT_ISLAND_VIP_REMARK' : 'STOPSPOT_ISLAND_REMARK';
  return 'STOPSPOT_REMARK';
}
