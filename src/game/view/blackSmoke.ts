import type { Container, Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { Plane } from '../sim/simulation';

// The black smoke of a plane that still needs the hangar (plane update 0x6da8 → puff 0x75ee8,
// update 0x76058, draw 0x7615c). See docs/re-notes.md.

export const BLACK_SMOKE_SURFACES = ['EFFECTS.SMOKE_BLACK'];

/** A puff lasts a second. */
const LIFE = 1;
/** The speed a puff settles to: straight up at 50 px/s (static at 0x76096). */
const RISE = -50;

/** Seconds to a plane's next puff (0x6de0). */
export const blackSmokeWait = (random: () => number): number => 1.2 + 0.25 * random();

export interface BlackPuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  scale: number;
  clock: number;
}

/**
 * A puff from a plane at a place and speed (0x6e20, 0x75ee8): from 10 px over it, with the
 * plane's speed and 50 px/s more the way it faces and 50 up; turned up to 15° either way and
 * turning as much a second. `random` gives numbers from 0 to 1, taken in the original's order.
 */
export function blackPuff(plane: { x: number; y: number; vx: number; vy: number; facingRight: boolean }, random: () => number): BlackPuff {
  const angle = 30 * random() - 15;
  const spin = 30 * random() - 15;
  return { x: plane.x, y: plane.y - 10, vx: plane.vx + (plane.facingRight ? 50 : -50), vy: plane.vy + RISE, angle, spin, scale: 0.5, clock: 0 };
}

/**
 * A step of a puff (0x76058): it moves, turns and swells 0.8 a second. Its speed is moved towards
 * the rise by `0.2^dt` of the gap between them, which at any usual frame rate is nearly all of it:
 * after a frame or two the puff just rises.
 */
export function blackPuffStep(puff: BlackPuff, dt: number): void {
  puff.x += puff.vx * dt;
  puff.y += puff.vy * dt;
  puff.angle += puff.spin * dt;
  const close = Math.pow(0.2, dt);
  puff.vx += (0 - puff.vx) * close;
  puff.vy += (RISE - puff.vy) * close;
  puff.scale += 0.8 * dt;
  puff.clock += dt;
}

/** A puff's opacity by its clock (0x7618c): it comes over a quarter of a second and goes over the second half. */
export const blackPuffAlpha = (clock: number): number => Math.max(0, Math.min(1, clock < 0.25 ? 4 * clock : 2 - 2 * clock));

export class BlackSmoke {
  private readonly planes = new Map<number, { x: number; y: number; wait: number }>();
  private puffs: { sprite: Sprite; puff: BlackPuff }[] = [];

  constructor(
    private readonly textures: TextureStore,
    private readonly layer: Container,
    private readonly random: () => number = Math.random,
  ) {}

  update(dt: number, planes: readonly Plane[]): void {
    for (const plane of planes) {
      // Where the plane is on screen, its height above the ground taken off.
      const at = { x: plane.x, y: plane.y - plane.altitude };
      // 0x572e: the wait starts at 1.2 s.
      const state = this.planes.get(plane.id) ?? { ...at, wait: 1.2 };
      this.planes.set(plane.id, state);
      if (dt > 0 && !plane.gone && !plane.serviceDone) {
        state.wait -= dt;
        if (state.wait < 0) {
          state.wait += blackSmokeWait(this.random);
          const puff = blackPuff({ ...at, vx: (at.x - state.x) / dt, vy: (at.y - state.y) / dt, facingRight: plane.heading > 90 && plane.heading < 270 }, this.random);
          const sprite = this.textures.sprite('EFFECTS.SMOKE_BLACK');
          sprite.eventMode = 'none';
          // 0x6e70: sorted one behind the plane.
          sprite.zIndex = plane.y - 1;
          this.layer.addChild(sprite);
          this.puffs.push({ sprite, puff });
        }
      }
      state.x = at.x;
      state.y = at.y;
    }
    for (const { sprite, puff } of this.puffs) {
      blackPuffStep(puff, dt);
      if (puff.clock >= LIFE) {
        sprite.destroy();
        continue;
      }
      sprite.position.set(puff.x, puff.y);
      sprite.angle = puff.angle;
      sprite.scale.set(puff.scale);
      sprite.alpha = blackPuffAlpha(puff.clock);
    }
    this.puffs = this.puffs.filter(({ puff }) => puff.clock < LIFE);
  }
}
