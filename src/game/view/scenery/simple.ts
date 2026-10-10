import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../../engine/textures';

// The simplest pieces of scenery: one image each, moved by a formula of the time.

/** How far the tutorial's flag leans after `time` seconds (0x39558): a sway every five seconds. */
export const flagLean = (time: number): number => 0.05 * Math.sin(2 * Math.PI * (0.2 * time - Math.floor(0.2 * time)));

/** A flag (class 0x39484): its image sheared from side to side where it stands. */
export class FlagView extends Container {
  private readonly flag: Sprite;
  private time = 0;

  constructor(textures: TextureStore, resource: string, position: { x: number; y: number }) {
    super();
    this.flag = textures.sprite(resource);
    this.flag.position.copyFrom(position);
    this.addChild(this.flag);
  }

  update(dt: number): void {
    this.time += dt;
    this.flag.skew.x = flagLean(this.time);
  }
}

/**
 * Where something on the horizon is `clock` seconds into its loop (0x4b384): it comes in from
 * far to the right and leaves 100 px past the left edge when the loop ends.
 */
export const horizonX = (clock: number, loop: number, speed: number): number => speed * (loop - clock) - 100;

/** How it is drawn at x (0x4b3d0), or null out of sight: tilted and sunk a little with the horizon's curve. */
export function horizonPose(x: number, y: number): { x: number; y: number; angle: number } | null {
  if (x <= -40 || x >= 520) return null;
  return { x, y: y + 7 * Math.abs(x / 240 - 1), angle: 3 * (x / 120 - 1) };
}

/** Something passing along the horizon (class `HorizonObject`, 0x4b278), such as the carrier's islands. */
export class HorizonObjectView extends Container {
  private readonly image: Sprite;
  private clock: number;

  constructor(
    textures: TextureStore,
    private readonly item: { resource: string; y: number; loop: number; speed: number; start: number },
  ) {
    super();
    this.image = textures.sprite(item.resource);
    this.addChild(this.image);
    this.clock = item.start % item.loop;
    this.update(0);
  }

  update(dt: number): void {
    const { loop, speed, y } = this.item;
    const pose = horizonPose(horizonX(this.clock, loop, speed), y);
    this.clock += dt;
    if (this.clock >= loop) this.clock -= loop;
    this.image.visible = pose !== null;
    if (!pose) return;
    this.image.position.set(pose.x, pose.y);
    this.image.angle = pose.angle;
  }
}
