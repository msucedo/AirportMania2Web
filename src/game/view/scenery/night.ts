import { Container, MeshSimple, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../../engine/textures';

// What the night skies of the monsters' stage and the Antarctic have: stars that throb and an
// aurora that ripples.

/** How big a star is drawn, as a part of its size, `time` seconds on (0x29402). */
export const starThrob = (time: number, phase: number): number => 0.8 + 0.2 * Math.sin(4 * (phase + time));

/**
 * A star (class 0x292bc, draw 0x293e4): `AMBIENT.STAR` stretched to `size` px across, throbbing
 * from a phase picked at random between 0 and π.
 */
export class StarView extends Container {
  private readonly star: Sprite;
  private readonly phase = Math.random() * Math.PI;
  private time = 0;

  constructor(
    textures: TextureStore,
    position: { x: number; y: number },
    private readonly size: number,
  ) {
    super();
    this.star = textures.sprite('AMBIENT.STAR');
    this.star.position.copyFrom(position);
    this.addChild(this.star);
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    const across = this.size * starThrob(this.time, this.phase);
    this.star.width = across;
    this.star.height = across;
  }
}

/** The aurora is a strip of 75 pairs of points, 800 units long before it is halved. */
const AURORA_PAIRS = 75;

/**
 * The aurora's points `time` seconds on (0x75098), a top and a bottom one for each pair, as
 * x, y, x, y… The top edge is an arch; the bottom one hangs lower in the middle and ripples by
 * three waves that run along it at different paces and come round together every 100 seconds.
 * The clock itself starts again every 495 seconds, which makes the waves jump then.
 */
export function auroraPoints(time: number): Float32Array {
  const points = new Float32Array(AURORA_PAIRS * 4);
  const turn = 0.02 * Math.PI * (time - 495 * Math.floor(time / 495));
  for (let pair = 0; pair < AURORA_PAIRS; pair++) {
    const i = 2 * pair;
    const a = Math.sin(5 * turn + 0.17 * i + 3);
    const b = Math.sin(-11 * turn + 0.27 * i + 5);
    const c = Math.sin(9 * turn + 0.23 * i + 4);
    const x = (i * 800) / 148 + 1.6 * c - 1.1 * b;
    const side = ((x - 400) / 400) ** 2;
    const wave = 2 * c + 2.5 * b + 3 * a;
    points[4 * pair] = x;
    points[4 * pair + 1] = 80 * side - 20;
    points[4 * pair + 2] = x;
    points[4 * pair + 3] = 120 + wave * (1 - 0.8 * side) - 60 * side;
  }
  return points;
}

/** The aurora (class 0x74f44): its image over that strip, drawn at half size from (10, −2), adding its light. */
export class AuroraView extends Container {
  private readonly strip: MeshSimple;
  private time = 0;

  constructor(textures: TextureStore, resource: string) {
    super();
    const uvs = new Float32Array(AURORA_PAIRS * 4);
    const indices = new Uint32Array((AURORA_PAIRS - 1) * 6);
    for (let pair = 0; pair < AURORA_PAIRS; pair++) {
      // 0x75024: across the image along the strip, its top edge above and its bottom edge below.
      const u = (2 * pair) / 148;
      uvs.set([u, 0, u, 1], 4 * pair);
      if (pair === AURORA_PAIRS - 1) break;
      const top = 2 * pair;
      indices.set([top, top + 1, top + 2, top + 1, top + 3, top + 2], 6 * pair);
    }
    this.strip = new MeshSimple({ texture: textures.texture(resource), vertices: auroraPoints(0), uvs, indices });
    this.strip.blendMode = 'add';
    this.strip.scale.set(0.5);
    this.strip.position.set(10, -2);
    this.addChild(this.strip);
  }

  update(dt: number): void {
    this.time += dt;
    this.strip.vertices = auroraPoints(this.time);
  }
}
