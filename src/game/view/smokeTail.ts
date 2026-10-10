import type { Container, Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import { PlaneState } from '../sim/rules';
import type { Plane } from '../sim/simulation';

// The smoke a plane leaves on the runway (0x6870 → tail 0x758b0 → puff 0x75b1c): as it touches
// down and brakes, and as it starts its take-off run. See docs/re-notes.md.

export const SMOKE_SURFACES = ['EFFECTS.SMOKE'];

/**
 * Whether the plane's update lets smoke go this frame: through the quarter second after touching
 * down (0x8234), the first second of braking (0x82da) and the first 100 px of the take-off run
 * (0x7cac), which at 200 px/s² is until it reaches 200 px/s.
 */
export function smokes(plane: Pick<Plane, 'approach' | 'state' | 'speed'>): boolean {
  if (plane.approach) return plane.approach.phase === 3 || (plane.approach.phase === 4 && plane.approach.time < 1);
  return (plane.state === PlaneState.TAKING_OFF || plane.state === PlaneState.AIRBORNE) && plane.speed ** 2 / 400 < 100;
}

/** Seconds between puffs at a speed: 20 a second and one more for every 10 px/s, never under 5 ms. */
export const puffPeriod = (speed: number): number => Math.max(0.005, 1 / (20 + 0.1 * speed));

/** A puff's opacity by its clock, which runs from 0 to 1 in half a second (0x75d74): it comes over the first half and is whole until it goes. */
export const smokeAlpha = (life: number): number => Math.min(1, life < 0.5 ? 2 * life : 2 - life);

interface Puff {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  life: number;
}

interface Tail {
  x: number;
  y: number;
  /** Seconds to the next puff. */
  timer: number;
}

export class SmokeTails {
  private readonly tails = new Map<number, Tail>();
  private puffs: Puff[] = [];

  constructor(
    private readonly textures: TextureStore,
    private readonly layer: Container,
  ) {}

  update(dt: number, planes: readonly Plane[]): void {
    for (const plane of planes) {
      // Where the plane is on screen, its height above the ground taken off.
      const at = { x: plane.x, y: plane.y - plane.altitude };
      const tail = this.tails.get(plane.id) ?? { ...at, timer: 0 };
      this.tails.set(plane.id, tail);
      if (dt > 0 && !plane.gone && smokes(plane)) {
        const vx = (at.x - tail.x) / dt;
        const vy = (at.y - tail.y) / dt;
        const period = puffPeriod(Math.hypot(vx, vy));
        // 0x7596c: a puff whenever the clock runs out, each a period further along the way and
        // already as old as the clock has overrun; they are sorted just behind the plane.
        let x = plane.x;
        let y = plane.y;
        tail.timer -= dt;
        while (tail.timer < 0) {
          this.puff(x, y, plane.y - 1, -tail.timer);
          x += vx * period;
          y += vy * period;
          tail.timer += period;
        }
      }
      tail.x = at.x;
      tail.y = at.y;
      if (plane.gone) this.tails.delete(plane.id);
    }
    for (const puff of this.puffs) this.advance(puff, dt);
    this.puffs = this.puffs.filter((puff) => {
      if (puff.life < 1) return true;
      puff.sprite.destroy();
      return false;
    });
  }

  /** 0x75b1c: it drifts at up to 7 px/s, upwards if at all, from a random angle turning at up to 45°/s, half size and growing. */
  private puff(x: number, y: number, depth: number, age: number): void {
    const sprite = this.textures.sprite('EFFECTS.SMOKE');
    sprite.zIndex = depth;
    sprite.angle = Math.random() * 360;
    sprite.scale.set(0.5);
    this.layer.addChild(sprite);
    const puff: Puff = { sprite, x, y, vx: Math.random() * 14 - 7, vy: -Math.random() * 7, spin: Math.random() * 90 - 45, life: 0 };
    this.puffs.push(puff);
    this.advance(puff, age);
  }

  private advance(puff: Puff, dt: number): void {
    puff.x += puff.vx * dt;
    puff.y += puff.vy * dt;
    puff.sprite.angle += puff.spin * dt;
    puff.sprite.scale.set(puff.sprite.scale.x + 0.3 * dt);
    puff.life += 2 * dt;
    puff.sprite.position.set(puff.x, puff.y);
    puff.sprite.alpha = smokeAlpha(puff.life);
  }
}
