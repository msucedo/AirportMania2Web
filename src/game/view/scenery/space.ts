import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../../engine/textures';

// The Moon's sky (class 0x664fc, set up by 0x65f88, drawn by 0x665d4): the image of space with a
// fixed field of stars and five bodies rising slowly through the strip of sky at the top.

/**
 * The generator the star field comes from (0x36fd4, WELL512), seeded as 0x66270 does. Where its
 * state starts being read from is a word the original never sets; 0 is assumed.
 */
export function starGenerator(seed: number): () => number {
  const state = new Uint32Array(16);
  state[0] = (seed ^ 0x075bcd15) >>> 0;
  state[1] = (state[0]! ^ (seed << 1)) >>> 0;
  for (let k = 2; k < 16; k++) state[k] = (state[k - 1]! ^ (seed << k)) >>> 0;
  let index = 0;
  return () => {
    let a = state[index]!;
    let c = state[(index + 13) & 15]!;
    const b = (a ^ c ^ (a << 16) ^ (c << 15)) >>> 0;
    c = state[(index + 9) & 15]!;
    c = (c ^ (c >>> 11)) >>> 0;
    a = (b ^ c) >>> 0;
    state[index] = a;
    const d = (a ^ ((a << 5) & 0xda442d20)) >>> 0;
    index = (index + 15) & 15;
    a = state[index]!;
    state[index] = (a ^ b ^ d ^ (a << 2) ^ (b << 18) ^ (c << 28)) >>> 0;
    return state[index]!;
  };
}

export interface SpaceStar {
  x: number;
  y: number;
  size: number;
  phase: number;
}

/** The 150 stars of a sky `height` px tall: the seed is 0x1234567 plus the height, added as floats. */
export function spaceStars(height: number): SpaceStar[] {
  const next = starGenerator(Math.fround(Math.fround(0x1234567) + height) >>> 0);
  const unit = (): number => Math.fround(next()) * 2.3283064365386963e-10;
  const stars: SpaceStar[] = [];
  for (let i = 0; i < 150; i++) {
    const x = unit() * 550 - 50;
    const y = unit() * 600;
    const size = unit() * 0.1 + 0.2;
    stars.push({ x, y, size, phase: unit() * 2 * Math.PI });
  }
  return stars;
}

/**
 * Where something at (x, y) of the field is `time` seconds on, in a sky `height` px tall: the
 * field climbs 620 px and slides 100 px left every 333 seconds or so, and what has gone 620 px
 * above the strip comes back in from below.
 */
export function spaceDrift(time: number, x: number, y: number, height: number): { x: number; y: number } {
  const turn = 0.003 * time;
  const part = turn - Math.floor(turn);
  const moved = { x: x - 100 * part, y: y - 620 * part };
  return moved.y < height - 620 ? { x: moved.x + 100, y: moved.y + 620 } : moved;
}

/** How big a star is drawn, as a part of its own size (0x666da). */
export const spaceTwinkle = (time: number, phase: number): number => {
  const turn = 0.003 * time;
  return 0.8 + 0.2 * Math.sin(300 * Math.PI * (turn - Math.floor(turn)) + phase);
};

/** The five bodies: where they are in the field, how far they reach (to know when they show) and how they are turned. */
const BODIES: readonly { resource: string; x: number; y: number; reach: number; angle: number }[] = [
  { resource: 'STAGES.MOON.EARTH', x: 46, y: 108, reach: 90, angle: 0 },
  { resource: 'STAGES.MOON.GALAXY_0', x: 100, y: 192, reach: 150, angle: -47 },
  { resource: 'STAGES.MOON.NEBULA', x: 330, y: 300, reach: 150, angle: 300 },
  { resource: 'STAGES.MOON.SATURN', x: 241, y: 420, reach: 80, angle: 225 },
  { resource: 'STAGES.MOON.GALAXY_1', x: 450, y: 540, reach: 150, angle: 120 },
];

export const SPACE_SURFACES = ['STAGES.MOON.SPACE', 'AMBIENT.STAR', ...BODIES.map((body) => body.resource)];

export class SpaceView extends Container {
  private readonly stars: { star: SpaceStar; sprite: Sprite }[];
  private readonly bodies: { body: (typeof BODIES)[number]; sprite: Sprite }[];
  private time = 0;

  constructor(
    textures: TextureStore,
    private readonly height_: number,
  ) {
    super();
    const space = textures.sprite('STAGES.MOON.SPACE');
    space.scale.set(4);
    this.addChild(space);
    this.stars = spaceStars(height_).map((star) => {
      const sprite = textures.sprite('AMBIENT.STAR');
      this.addChild(sprite);
      return { star, sprite };
    });
    this.bodies = BODIES.map((body) => {
      const sprite = textures.sprite(body.resource);
      sprite.angle = body.angle;
      this.addChild(sprite);
      return { body, sprite };
    });
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    const height = this.height_;
    for (const { star, sprite } of this.stars) {
      const at = spaceDrift(this.time, star.x, star.y, height);
      // Only the strip of sky, and 30 px around it, is drawn.
      sprite.visible = at.y > -30 && at.y < height + 30 && at.x > -30 && at.x < 500;
      if (!sprite.visible) continue;
      sprite.position.set(at.x, at.y);
      sprite.scale.set(spaceTwinkle(this.time, star.phase) * star.size);
    }
    for (const { body, sprite } of this.bodies) {
      const at = spaceDrift(this.time, body.x, body.y, height);
      sprite.visible = at.y > -body.reach && at.y < height + body.reach;
      if (sprite.visible) sprite.position.set(at.x, at.y);
    }
  }
}
