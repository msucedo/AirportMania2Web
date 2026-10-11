import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';

// The fireworks that go up as an award is announced (0x31648): rockets that are not seen
// themselves, only the sparks they trail and the sixty they burst into (rocket 0x38bcc, update
// 0x38d50; spark update 0x393e0, draw 0x393ac). See docs/re-notes.md.

export const FIREWORK_SURFACES = ['EFFECTS.FIREWORKS.SPARK'];

/** How many rockets an award gets (0x1b798): a plane's trophy one more for every three, six at most. */
export function rocketsFor(award: number): number {
  if (award >= 1 && award <= 20) return Math.min(6, Math.trunc(award / 3) + 1);
  if ((award >= 24 && award <= 29) || award === 32 || award === 33) return 3;
  if (award === 30 || award === 34 || award === 35) return 5;
  if (award === 31 || award === 36) return 6;
  return 2;
}

export interface FireSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/** A step of a spark (0x393e0): it falls at 60 px/s² and its speed drops to 0.3 of itself each second. */
export function fireSparkStep(spark: FireSpark, dt: number): void {
  spark.life -= dt;
  // 0x9f18: the place moves by the speed at the middle of the step.
  spark.x += spark.vx * dt;
  spark.y += (spark.vy + 30 * dt) * dt;
  spark.vy += 60 * dt;
  const keep = Math.pow(0.3, dt);
  spark.vx *= keep;
  spark.vy *= keep;
}

export interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  clock: number;
  /** Seconds to its next trailing spark; the first comes after 0.1 s. */
  trail: number;
  burst: boolean;
  sparks: FireSpark[];
}

/** A rocket (0x316ea): from the bottom of the screen, x 120 to 360, up at 200 to 250 px/s and up to 80 sideways. */
export function rocket(random: () => number): Rocket {
  const x = 120 + 240 * random();
  const vx = 160 * random() - 80;
  const vy = -(200 + 50 * random());
  // 0x31754: a fourth number picks one of four burst pictures, which are never drawn.
  random();
  return { x, y: 300, vx, vy, clock: 0, trail: 0.1, burst: false, sparks: [] };
}

/**
 * A step of a rocket (0x38d50). For two seconds it rises against 100 px/s², leaving a spark
 * every 0.015 s that barely moves and lasts half a second to one, never longer than the rocket
 * has flown. Then it bursts into sixty sparks, thrown evenly round at up to 100 px/s on top of
 * its own speed, that last two seconds to two and a half. It is done when its sparks are.
 */
export function rocketStep(r: Rocket, dt: number, random: () => number): boolean {
  for (const spark of r.sparks) fireSparkStep(spark, dt);
  r.sparks = r.sparks.filter((spark) => spark.life > 0);
  if (r.burst) return r.sparks.length > 0;
  r.x += r.vx * dt;
  r.y += (r.vy + 50 * dt) * dt;
  r.vy += 100 * dt;
  r.clock += dt;
  if (r.clock > 2) {
    r.burst = true;
    for (let i = 0; i < 60; i++) {
      const angle = (i * 2 * Math.PI) / 60;
      const speed = 100 * random();
      const vx = r.vx + Math.cos(angle) * speed + 20 * random() - 10;
      const vy = r.vy + Math.sin(angle) * speed + 20 * random() - 10;
      r.sparks.push({ x: r.x, y: r.y, vx, vy, life: 2 + 0.5 * random() });
    }
  }
  r.trail -= dt;
  while (r.trail < 0) {
    const vx = 6 * random() - 3;
    const vy = 6 * random() - 3;
    const spark = { x: r.x, y: r.y, vx, vy, life: Math.min(r.clock, 0.5 + 0.5 * random()) };
    // It is already as old as the wait has overrun.
    fireSparkStep(spark, -r.trail);
    if (spark.life > 0) r.sparks.push(spark);
    r.trail += 0.015;
  }
  return true;
}

export class Fireworks extends Container {
  private rockets: Rocket[] = [];
  private pool: Sprite[] = [];

  constructor(
    private readonly textures: TextureStore,
    private readonly random: () => number = Math.random,
  ) {
    super();
    this.eventMode = 'none';
  }

  /** The rockets for an award being announced. */
  launch(award: number): void {
    for (let i = rocketsFor(award); i > 0; i--) this.rockets.push(rocket(this.random));
  }

  update(dt: number): void {
    this.rockets = this.rockets.filter((r) => rocketStep(r, dt, this.random));
    let used = 0;
    for (const r of this.rockets) {
      for (const spark of r.sparks) {
        const sprite = (this.pool[used] ??= this.addChild(this.textures.sprite('EFFECTS.FIREWORKS.SPARK')));
        used++;
        sprite.visible = true;
        sprite.position.set(spark.x, spark.y);
        // 0x393ac: its opacity is the time it has left; the image is added to what is under it.
        sprite.alpha = Math.min(1, spark.life);
      }
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }
}
