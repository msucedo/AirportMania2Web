import { Container, MeshSimple } from 'pixi.js';
import type { TextureStore } from '../../../engine/textures';

// The sky of Mars (class "MarsSky", 0xcbffc): its image over a fixed grid of points, the part of
// the image each point shows sliding sideways and rippling (grid 0xcbea4, draw 0xcc0bc).

const COLUMNS = 30;
const ROWS = 20;

/** Where the grid's points are on screen: across 480 px and down `height`. */
export function marsSkyPoints(height: number): Float32Array {
  const points = new Float32Array(COLUMNS * ROWS * 2);
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      points[2 * (row * COLUMNS + column)] = (column * 480) / 29;
      points[2 * (row * COLUMNS + column) + 1] = (row * height) / 19;
    }
  }
  return points;
}

/**
 * The part of the image each point shows `time` seconds on, as u, v from 0 to 1. Across, the
 * grid spans half the image and slides along it, starting again every 125 seconds: the image
 * holds the same sky twice over, so the step back does not show. Each point is also pushed
 * about by six waves, a little sideways and more up and down.
 */
export function marsSkyTexture(time: number): Float32Array {
  const uvs = new Float32Array(COLUMNS * ROWS * 2);
  const turn = 0.004 * time;
  const part = turn - Math.floor(turn);
  const slide = part > 0.5 ? part - 0.5 : part;
  const w = 20 * Math.PI * part;
  for (let i = 0; i < ROWS; i++) {
    for (let j = 0; j < COLUMNS; j++) {
      const up = 0.5 * Math.sin(7 * w + 0.2 * i + 0.62 * j + 16) + 0.2 * Math.sin(4 * w + 0.6 * i + 0.32 * j + 49) + 0.2 * Math.sin(17 * w + 0.13 * j + 0.46 * i + 3);
      const across = 0.1 * Math.sin(3 * w + 0.37 * i + 0.22 * j + 17) + 0.4 * Math.sin(9 * w + 0.3 * i + 0.52 * j + 10) + 0.4 * Math.sin(18 * w + 0.15 * j + 0.56 * i);
      uvs[2 * (i * COLUMNS + j)] = slide + (0.5 * (j + 1 + 0.07 * across)) / 31;
      uvs[2 * (i * COLUMNS + j) + 1] = (i + 1 + 0.3 * up) / 21;
    }
  }
  return uvs;
}

export class MarsSkyView extends Container {
  private readonly sky: MeshSimple;
  private time = 0;

  constructor(textures: TextureStore, resource: string, height: number) {
    super();
    const indices = new Uint32Array((COLUMNS - 1) * (ROWS - 1) * 6);
    let at = 0;
    for (let row = 0; row < ROWS - 1; row++) {
      for (let column = 0; column < COLUMNS - 1; column++) {
        const corner = row * COLUMNS + column;
        indices.set([corner, corner + 1, corner + COLUMNS, corner + 1, corner + COLUMNS + 1, corner + COLUMNS], at);
        at += 6;
      }
    }
    this.sky = new MeshSimple({ texture: textures.texture(resource), vertices: marsSkyPoints(height), uvs: marsSkyTexture(0), indices });
    this.addChild(this.sky);
  }

  update(dt: number): void {
    this.time += dt;
    this.sky.geometry.uvs = marsSkyTexture(this.time);
  }
}
