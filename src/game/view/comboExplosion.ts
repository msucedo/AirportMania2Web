import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';

// What a combo throws at the plane that earned it (0x26bd8): a fan of light just behind the
// plane and, from a multiplier of 2, stars over the whole airport. See docs/re-notes.md.

export const COMBO_SURFACES = ['EFFECTS.LIGHT_FAN', 'EFFECTS.BONUS_STAR'];

const RAYS = 9;
/** The fan's clock runs from 0 to 1 at 0.6 a second (0x692b4). */
const FAN_RATE = 0.6;
/** A star lasts two seconds (0x6989c). */
const STAR_LIFE = 2;

/** `1.5·(1 − ((over − t) / over)⁴)` until `over`, 1.5 from then on. */
const swell = (t: number, over: number): number => (t < over ? 1.5 * (1 - ((over - t) / over) ** 4) : 1.5);

/** The whole fan at its clock `t`: it comes in a tenth, swells sideways faster than upwards, and goes over the second half. */
export function fanPose(t: number): { scaleX: number; scaleY: number; alpha: number } {
  return { scaleX: swell(t, 0.4), scaleY: swell(t, 0.3), alpha: Math.max(0, Math.min(1, 10 * t, 2 * (1 - t))) };
}

/**
 * The nine rays at the fan's clock `t` (0x6942a–0x695c8): each one's length, angle, turning speed,
 * yellow and place come from its number through whole-number remainders.
 */
export function fanRays(t: number): { x: number; y: number; scaleX: number; angle: number; tint: number }[] {
  return Array.from({ length: RAYS }, (_, i) => ({
    x: (((171 * i) % 23) - 11) * 0.7,
    y: (((131 * i) % 29) - 14) * 0.2,
    scaleX: 1 + (((3 + 123 * i) % 13) - 3) / 30,
    angle: (((3 + 119 * i) % 13) - 6) * 3 + (((1 + 117 * i) % 19) - 8) * 1.5 * t,
    tint: 0xffff00 | Math.trunc(255 * (1 - ((7 * i) % 5) / 15)),
  }));
}

/** The speeds of the stars a combo of `multiplier` throws (0x26cb6–0x26ec0). */
export function starThrows(multiplier: number): { x: number; y: number }[] {
  const throws: { x: number; y: number }[] = [];
  if (multiplier >= 2) throws.push({ x: -45, y: -270 }, { x: 45, y: -270 });
  if (multiplier >= 3) throws.push({ x: 60, y: -260 }, { x: -60, y: -260 });
  if (multiplier >= 4) throws.push({ x: -40, y: -250 }, { x: 40, y: -250 }, { x: 70, y: -220 }, { x: -70, y: -220 });
  return throws;
}

export interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

/** A star thrown from a place at a speed (0x6989c); `random` gives numbers from 0 to 1, taken in the original's order. */
export function comboStar(x: number, y: number, vx: number, vy: number, random: () => number): Star {
  const angle = 360 * random();
  const spin = 360 * random() - 180;
  const red = 0.3 * random();
  const green = 0.3 * random();
  const blue = 0.3 * random();
  return { x, y, vx, vy, angle, spin, red, green, blue, alpha: 3 + random() };
}

/**
 * A star `t` seconds on (0x69a88, 0x69b40): it falls at 150 px/s², turns, grows from 0.7 by 0.3
 * a second, and its opacity drops 2 a second. Its image is added to what is under it, so the
 * engine multiplies the colour by the opacity and only then keeps each part within 0 and 1
 * (0x9c148): the star is bright for a second or more and then dims to nothing.
 */
export function comboStarPose(star: Star, t: number): { x: number; y: number; angle: number; scale: number; tint: number } {
  const alpha = star.alpha - 2 * t;
  const part = (value: number): number => Math.trunc(255 * Math.max(0, Math.min(1, value * alpha)));
  return {
    x: star.x + star.vx * t,
    y: star.y + star.vy * t + 75 * t * t,
    angle: star.angle + star.spin * t,
    scale: 0.7 + 0.3 * t,
    tint: (part(star.red) << 16) | (part(star.green) << 8) | part(star.blue),
  };
}

export class ComboExplosions {
  private fans: { view: Container; rays: Sprite[]; clock: number }[] = [];
  private stars: { sprite: Sprite; star: Star; age: number }[] = [];

  /** `behind` is the layer sorted by depth, `over` the one above everything on the airport. */
  constructor(
    private readonly textures: TextureStore,
    private readonly behind: Container,
    private readonly over: Container,
    private readonly random: () => number = Math.random,
  ) {}

  /** A combo of `multiplier` at a plane's place and depth (0x4340a, 0x6d6ac, 0x6d814). */
  explode(x: number, y: number, depth: number, multiplier: number): void {
    const view = new Container();
    view.position.set(x, y);
    // Three behind the plane.
    view.zIndex = depth - 3;
    view.eventMode = 'none';
    const rays = Array.from({ length: RAYS }, () => this.textures.pinned('EFFECTS.LIGHT_FAN'));
    view.addChild(...rays);
    this.behind.addChild(view);
    const fan = { view, rays, clock: 0 };
    this.fans.push(fan);
    this.poseFan(fan);
    for (const speed of starThrows(multiplier)) {
      const sprite = this.textures.sprite('EFFECTS.BONUS_STAR');
      sprite.eventMode = 'none';
      this.over.addChild(sprite);
      const star = { sprite, star: comboStar(x, y, speed.x, speed.y, this.random), age: 0 };
      this.stars.push(star);
      this.poseStar(star);
    }
  }

  update(dt: number): void {
    for (const fan of this.fans) {
      fan.clock += FAN_RATE * dt;
      if (fan.clock < 1) this.poseFan(fan);
      else fan.view.destroy({ children: true });
    }
    this.fans = this.fans.filter((fan) => fan.clock < 1);
    for (const star of this.stars) {
      star.age += dt;
      if (star.age < STAR_LIFE) this.poseStar(star);
      else star.sprite.destroy();
    }
    this.stars = this.stars.filter((star) => star.age < STAR_LIFE);
  }

  private poseFan(fan: { view: Container; rays: Sprite[]; clock: number }): void {
    const pose = fanPose(fan.clock);
    fan.view.scale.set(pose.scaleX, pose.scaleY);
    fan.view.alpha = pose.alpha;
    fanRays(fan.clock).forEach((ray, i) => {
      const sprite = fan.rays[i]!;
      sprite.position.set(ray.x, ray.y);
      sprite.scale.set(ray.scaleX, 1);
      sprite.angle = ray.angle;
      sprite.tint = ray.tint;
    });
  }

  private poseStar(entry: { sprite: Sprite; star: Star; age: number }): void {
    const pose = comboStarPose(entry.star, entry.age);
    entry.sprite.position.set(pose.x, pose.y);
    entry.sprite.angle = pose.angle;
    entry.sprite.scale.set(pose.scale);
    entry.sprite.tint = pose.tint;
  }
}
