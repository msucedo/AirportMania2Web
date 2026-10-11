import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../../engine/textures';

// The North Pole's sky: Santa's sleigh crossing now and then, and snow on its overcast days.

/** The clock of something that comes round every `loop` seconds, `offset` ahead (0x398dc, as in 0x72440). */
export function loopClock(time: number, loop: number, offset: number): number {
  const clock = (time / loop - Math.floor(time / loop)) * loop + offset;
  return clock > loop ? clock - Math.floor(loop) : clock;
}

/**
 * The sleigh and its five reindeer `clock` seconds into their loop (0x398c8), rear first, or
 * null out of sight. They are 18 px apart on a path that arches 20 px up over the middle of the
 * screen, each bobbing 3 px in turn and turned the way the path runs; the sleigh, half as much
 * as the reindeer ahead of it.
 */
export function sleighPoses(clock: number, position: { x: number; y: number }, speed: number): { x: number; y: number; angle: number }[] | null {
  const lead = position.x + speed * clock;
  if (lead <= -200 || lead >= 1000) return null;
  const points = [0, 1, 2, 3, 4, 5].map((i) => {
    const x = lead + 18 * i;
    return { x, y: position.y + 3 * Math.sin(2 * Math.PI * (0.2 * clock + 0.1 * i)) - 20 * Math.cos((Math.PI * (x - 400)) / 600) };
  });
  const angles = points.map((point, i) => (i === 0 ? 0 : (Math.atan2(point.y - points[i - 1]!.y, point.x - points[i - 1]!.x) * 180) / Math.PI));
  angles[0] = angles[1]! * 0.5;
  return points.map((point, i) => ({ ...point, angle: angles[i]! }));
}

/** Santa's sleigh (class 0x397f4). */
export class SleighView extends Container {
  private readonly pieces: Sprite[];
  private time = 0;

  constructor(
    textures: TextureStore,
    private readonly item: { position: { x: number; y: number }; loop: number; speed: number; offset: number },
  ) {
    super();
    this.pieces = SLEIGH_SURFACES.flatMap((id, kind) => (kind === 0 ? [textures.sprite(id)] : [1, 2, 3, 4, 5].map(() => textures.sprite(id))));
    this.addChild(...this.pieces);
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    const poses = sleighPoses(loopClock(this.time, this.item.loop, this.item.offset), this.item.position, this.item.speed);
    this.pieces.forEach((piece, i) => {
      const pose = poses?.[i];
      piece.visible = pose !== undefined;
      if (!pose) return;
      piece.position.set(pose.x, pose.y);
      piece.angle = pose.angle;
    });
  }
}

/** The sleigh at the rear, then the reindeer. */
export const SLEIGH_SURFACES = ['STAGES.NORTH_POLE.SANTA', 'STAGES.NORTH_POLE.REINDEER'];

/** How solid a flake is at height y (0x76aaa): it fades in over the first tenth of its fall and out over the last. */
export function flakeAlpha(y: number, top: number, bottom: number): number {
  const fallen = (y - top) / (bottom - top);
  return Math.max(0, Math.min(1, Math.min(fallen, 1 - fallen) * 10));
}

interface Flake {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  ax: number;
  angle: number;
  spin: number;
  spinPush: number;
  /** Seconds until the wind on it changes. */
  gust: number;
}

/**
 * A fall of snow (class 0x765d8, update 0x76748, draw 0x76a5c). Flakes come in at `top`, across
 * the screen and a little beyond, one every half to one `interval`; they fall at `fall` px a
 * second, pushed sideways by gusts of up to half `drift` that change every 0.3 to 0.6 s,
 * turning as they go, and are gone at `bottom`.
 */
export class SnowView extends Container {
  private readonly flakes: Flake[] = [];
  /** Seconds until the next flake. */
  private next = 0;

  constructor(
    private readonly textures: TextureStore,
    /** With `left` and `right` it is the world map's fall (class 0x5e570), kept between two sides. */
    private readonly item: { resource: string; top: number; bottom: number; drift: number; fall: number; interval: number; left?: number; right?: number },
  ) {
    super();
  }

  update(dt: number): void {
    const { top, bottom, drift, fall, interval } = this.item;
    for (let i = this.flakes.length - 1; i >= 0; i--) {
      const flake = this.flakes[i]!;
      flake.gust -= dt;
      if (flake.gust < 0) {
        flake.gust = 0.3 + Math.random() * 0.3;
        flake.ax = (Math.random() * 2 - 1) * drift * 0.5;
        flake.spinPush = Math.random() * 120 - 60;
      }
      this.move(flake, dt, fall);
      // 0x5e7da: the map's flakes are also gone once outside its sides.
      const outside = this.item.left !== undefined && this.item.right !== undefined && !(flake.x > this.item.left && flake.x < this.item.right);
      if (flake.y >= bottom || outside) {
        flake.sprite.destroy();
        this.flakes.splice(i, 1);
        continue;
      }
      this.place(flake, top, bottom);
    }

    this.next -= dt;
    while (this.next < 0) {
      const sprite = this.textures.sprite(this.item.resource);
      sprite.scale.set(0.75 + Math.random() * 0.25);
      // Its wind is picked on its first step (the gust clock starts below zero).
      const flake: Flake = { sprite, x: this.spawnX(), y: top, vx: (Math.random() * 2 - 1) * drift, ax: 0, angle: Math.random() * 360, spin: Math.random() * 120 - 60, spinPush: 0, gust: -1 };
      // It has already been falling for as long as it was due.
      this.move(flake, -this.next, fall);
      this.place(flake, top, bottom);
      this.addChild(sprite);
      this.flakes.push(flake);
      this.next += (0.5 + Math.random() * 0.5) * interval;
    }
  }

  /**
   * Where a flake comes in. The map's (0x5e8c0) is picked over the two sides added together, less
   * the left one, so most come in outside them and go on their first step.
   */
  private spawnX(): number {
    const { left, right } = this.item;
    return left !== undefined && right !== undefined ? Math.random() * (right + left) - left : Math.random() * 520 - 20;
  }

  /** 0x9f18 and 0x76810: position and turn move by their speed at the middle of the step. */
  private move(flake: Flake, dt: number, fall: number): void {
    flake.x += (flake.vx + 0.5 * flake.ax * dt) * dt;
    flake.vx += flake.ax * dt;
    flake.y += fall * dt;
    flake.angle += (flake.spin + 0.5 * flake.spinPush * dt) * dt;
    flake.spin += flake.spinPush * dt;
  }

  private place(flake: Flake, top: number, bottom: number): void {
    flake.sprite.position.set(flake.x, flake.y);
    flake.sprite.angle = flake.angle;
    flake.sprite.alpha = flakeAlpha(flake.y, top, bottom);
  }
}
