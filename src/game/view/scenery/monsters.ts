import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../../engine/textures';

// The night of the monsters' stage: clouds that drift and swell, patches of fog creeping by the
// gas station, and bats swooping in at the right edge.

/**
 * A scary cloud `time` seconds on (0x70164): it drifts `speed` px a second, round and round
 * between x −300 and 880, and swells as it goes, once every 37 px or so.
 */
export function scaryCloudPose(time: number, x0: number, speed: number): { x: number; scaleX: number; scaleY: number } {
  const turn = (time * speed) / 1190;
  const part = turn - Math.floor(turn);
  let x = x0 + part * 1190;
  if (x >= 880) x -= Math.trunc((x + 300) / 1180) * 1180;
  else if (x < -300) x += (Math.trunc((-300 - x) / 1180) + 1) * 1180;
  return { x: Math.min(880, x), scaleX: 1 + 0.04 * Math.sin(200 * part), scaleY: 1 + 0.06 * Math.cos(200 * part) };
}

/** A scary cloud (class 0x70098). */
export class ScaryCloudView extends Container {
  private readonly cloud: Sprite;
  private time = 0;

  constructor(
    textures: TextureStore,
    private readonly item: { resource: string; position: { x: number; y: number }; speed: number },
  ) {
    super();
    this.cloud = textures.sprite(item.resource);
    this.cloud.y = item.position.y;
    this.addChild(this.cloud);
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    const pose = scaryCloudPose(this.time, this.item.position.x, this.item.speed);
    this.cloud.x = pose.x;
    this.cloud.scale.set(pose.scaleX, pose.scaleY);
  }
}

/**
 * A patch of fog `clock` seconds into its loop (0x7069c), or null while it is not drawn: it
 * slides at `speed` for `span` seconds, fading in and out over two seconds.
 */
export function fogPatchPose(clock: number, span: number, speed: number): { dx: number; alpha: number } | null {
  if (clock >= span) return null;
  return { dx: clock * speed, alpha: Math.max(0, Math.min(1, Math.min(clock, span - clock) * 0.5)) };
}

/** A patch of fog (class 0x70580, update 0x70668): one of three images, some mirrored. */
export class FogPatchView extends Container {
  private readonly patch: Sprite;
  private clock: number;

  constructor(
    textures: TextureStore,
    private readonly item: { resource: string; position: { x: number; y: number }; flipped: boolean; loop: number; span: number; speed: number; start: number },
  ) {
    super();
    this.patch = textures.sprite(item.resource);
    this.patch.y = item.position.y;
    if (item.flipped) this.patch.scale.x = -1;
    this.addChild(this.patch);
    this.clock = item.start;
    this.update(0);
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock > this.item.loop) this.clock -= this.item.loop;
    const pose = fogPatchPose(this.clock, this.item.span, this.item.speed);
    this.patch.visible = pose !== null;
    if (!pose) return;
    this.patch.x = this.item.position.x + pose.dx;
    this.patch.alpha = pose.alpha;
  }
}

/**
 * Where a bat is `clock` seconds into its swoop (0x22868), from the point it turns about: a wide
 * arc, 150 px across and 120 high, with a flutter on top.
 */
export function batOffset(clock: number, phase: number): { x: number; y: number } {
  const c = Math.PI * clock;
  return {
    x: 10 * Math.sin(2 * c + phase) - 150 * Math.sin(0.3 * c),
    y: 1.1 * (Math.cos(2 * c) + Math.cos(11 * c + 0.13) + Math.cos(20 * c + 0.15)) - 120 * Math.cos(0.3 * c),
  };
}

/** Which of its six images a bat shows (0x229d2): two beats of the wings a second, each bat from its own. */
export const batFrame = (time: number, phase: number): number => Math.trunc((2 * time - Math.floor(2 * time)) * 6 + phase) % 6;

/** A bat (class 0x2275c, update 0x22834): it swoops for `span` seconds of every `loop`. */
export class BatView extends Container {
  private readonly frames: Sprite[];
  private clock: number;
  private time = 0;

  constructor(
    textures: TextureStore,
    private readonly item: { position: { x: number; y: number }; loop: number; span: number; start: number; phase: number },
  ) {
    super();
    this.frames = BAT_SURFACES.map((id) => {
      const sprite = textures.sprite(id);
      sprite.visible = false;
      this.addChild(sprite);
      return sprite;
    });
    this.clock = item.start;
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    this.clock += dt;
    if (this.clock >= this.item.loop) this.clock -= this.item.loop;
    for (const frame of this.frames) frame.visible = false;
    if (this.clock >= this.item.span) return;
    const offset = batOffset(this.clock, this.item.phase);
    const frame = this.frames[batFrame(this.time, this.item.phase)]!;
    frame.visible = true;
    frame.position.set(this.item.position.x + offset.x, this.item.position.y + offset.y);
  }
}

export const BAT_SURFACES = [0, 1, 2, 3, 4, 5].map((frame) => `STAGES.MONSTERS.BAT.${frame}`);
