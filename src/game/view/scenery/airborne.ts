import { Container, type Sprite, TilingSprite } from 'pixi.js';
import type { TextureStore } from '../../../engine/textures';

// What goes by under the Airborne stage: mountains between bands of cloud, and its propellers.

/**
 * Where a moving image is `time` seconds on (class `MovingImage`, 0x7232c, draw 0x72440), or
 * null while it is not drawn. Its clock runs round every `loop` seconds, `offset` ahead; it
 * moves `speed` px a second from `x` and shows only for the first `span` seconds of each loop.
 */
export function movingImageX(time: number, item: { x: number; loop: number; span: number; speed: number; offset: number }): number | null {
  let clock = (time / item.loop - Math.floor(time / item.loop)) * item.loop + item.offset;
  if (clock > item.loop) clock -= Math.floor(item.loop);
  const x = item.x + item.speed * clock;
  return x > -200 && x < 1000 && clock < item.span ? x : null;
}

export class MovingImageView extends Container {
  private readonly image: Sprite;
  private time = 0;

  constructor(
    textures: TextureStore,
    private readonly item: { resource: string; x: number; y: number; loop: number; span: number; speed: number; offset: number },
  ) {
    super();
    this.image = textures.sprite(item.resource);
    this.image.y = item.y;
    this.addChild(this.image);
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    const x = movingImageX(this.time, this.item);
    this.image.visible = x !== null;
    if (x !== null) this.image.x = x;
  }
}

/** How far a band of cloud has slid, in px of its 240 px image, and how far it has sunk (0x72038). */
export function cloudBandPose(time: number, period: number, width: number): { slide: number; sink: number } {
  const turn = time / period;
  return { slide: (turn - Math.floor(turn)) * width, sink: (24 / period) * 5 * (1 + Math.sin(0.2 * time)) };
}

/**
 * A band of cloud (class 0x71e50): its image repeated side by side and sliding left, one image
 * width every `period` seconds, cut off at `left`, and bobbing: the faster the band, the more.
 */
export class CloudBandView extends Container {
  private readonly band: TilingSprite;
  private time = 0;

  constructor(
    textures: TextureStore,
    private readonly item: { resource: string; period: number; y: number; left: number; right: number },
  ) {
    super();
    const texture = textures.texture(item.resource);
    this.band = new TilingSprite({ texture, width: item.right - item.left, height: texture.height });
    this.band.x = item.left;
    this.addChild(this.band);
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    const pose = cloudBandPose(this.time, this.item.period, this.band.texture.width);
    this.band.tilePosition.x = -pose.slide;
    this.band.y = this.item.y + pose.sink;
  }
}

/** A propeller's turn, in degrees, `time` seconds on (0x34f8): ten turns a second. */
export const propellerAngle = (time: number): number => 360 * (10 * time - Math.floor(10 * time));

/** A propeller (class 0x3418): its image spinning, then squeezed to look seen from the side. */
export class PropellerView extends Container {
  private readonly blades: Sprite;
  private time = 0;

  constructor(textures: TextureStore, resource: string, position: { x: number; y: number }, scale: { x: number; y: number }) {
    super();
    this.blades = textures.sprite(resource);
    this.position.copyFrom(position);
    this.scale.copyFrom(scale);
    this.addChild(this.blades);
  }

  update(dt: number): void {
    this.time += dt;
    this.blades.angle = propellerAngle(this.time);
  }
}
