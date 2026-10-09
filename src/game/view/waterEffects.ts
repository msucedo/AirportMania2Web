import { Container, Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';

export const WATER_SURFACES = ['AMBIENT.WAVE_REFLECT', 'STAGES.ISLAND.WATER_RING', 'STAGES.ISLAND.BUOY', 'STAGES.ISLAND.BUOY_MASK'];

export interface SparkleArea {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** How many pixels the band sags at the screen edges, following the curve of the horizon. */
  sag: number;
}

/**
 * Glints on the distant sea (`0x729b8`, generator `0x72740`, draw `0x72ab8`): one per 80 px² of
 * the area, crowded towards its top, each swelling and fading on a two second beat.
 */
export class SeaSparkles extends Container {
  private readonly glints: { sprite: Sprite; size: number; phase: number }[] = [];
  private time = 0;

  constructor(textures: TextureStore, area: SparkleArea) {
    super();
    const count = Math.floor(((area.x2 - area.x1) * (area.y2 - area.y1)) / 80);
    for (let i = 0; i < count; i++) {
      const depth = Math.pow(Math.random(), 3.5);
      const x = area.x1 - 15 + Math.random() * (area.x2 - area.x1 + 30);
      const sprite = textures.sprite('AMBIENT.WAVE_REFLECT');
      sprite.position.set(x, area.y1 + 4 + (area.y2 - area.y1) * depth + area.sag * Math.abs(x / 240 - 1));
      this.glints.push({ sprite, size: (depth * 0.4 + 0.2) * 0.5, phase: Math.random() });
      this.addChild(sprite);
    }
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    for (const glint of this.glints) {
      const strength = Math.sin(2 * Math.PI * (this.time * 0.5 + glint.phase)) - 0.3;
      glint.sprite.visible = strength > 0;
      if (strength > 0) {
        glint.sprite.scale.set(strength * glint.size);
        glint.sprite.alpha = strength * 0.7;
      }
    }
  }
}

/** Seconds until a plane moving at `speed` px/s leaves its next ring (`0x6cc4`). */
export function ringInterval(speed: number, random = Math.random()): number {
  return Math.max(0.07, Math.min(1, 5 / Math.max(5, speed))) * (0.7 + 0.3 * random);
}

/** Rings left on the water by planes (`0x86770`): each lives one second, spreading and fading. */
export class WaterRings extends Container {
  private readonly rings: { sprite: Sprite; left: number; size: number }[] = [];

  constructor(private readonly textures: TextureStore) {
    super();
  }

  add(x: number, y: number): void {
    const sprite = this.textures.sprite('STAGES.ISLAND.WATER_RING');
    sprite.position.set(x, y);
    this.rings.push({ sprite, left: 1, size: 0.2 + Math.random() * 0.9 });
    this.addChild(sprite);
  }

  update(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i]!;
      ring.left -= dt;
      if (ring.left < 0) {
        ring.sprite.destroy();
        this.rings.splice(i, 1);
        continue;
      }
      ring.sprite.alpha = Math.max(0, Math.min(1, 2 * Math.min(ring.left, 1 - ring.left)));
      ring.sprite.scale.set(0.25 + 0.75 * ring.size * (1 - ring.left));
    }
  }
}

const BUOYS = 9;
const BUOY_SPACING = 41;

/**
 * A line of buoys marking a water runway (`0x23274`, draw `0x233e8`): each bobs on two sine
 * waves of its own, and a mask redraws the water over its foot.
 */
export class BuoyLine extends Container {
  private readonly buoys: { sprite: Sprite; x: number; fast: number; slow: number }[] = [];
  private time = 0;

  constructor(textures: TextureStore, x: number, private readonly baseY: number) {
    super();
    for (let i = 0; i < BUOYS; i++) {
      const at = x + i * BUOY_SPACING;
      const sprite = textures.sprite('STAGES.ISLAND.BUOY');
      sprite.x = at;
      const mask = textures.sprite('STAGES.ISLAND.BUOY_MASK');
      mask.position.set(at, baseY);
      this.buoys.push({ sprite, x: at, fast: 4.5 + Math.random() * 3.8, slow: 1.5 + Math.random() * 2.8 });
      this.addChild(sprite, mask);
    }
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    for (const buoy of this.buoys) {
      buoy.sprite.y = this.baseY - 0.5 * (Math.sin(this.time * buoy.fast + buoy.x) + Math.sin(this.time * buoy.slow + buoy.x) + 2);
    }
  }
}
