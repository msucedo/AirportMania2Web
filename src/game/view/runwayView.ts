import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { Runway } from '../sim/simulation';

const ARROWS = 5;
const MULTIPLIERS = ['INDICATORS.ARROWS.X2', 'INDICATORS.ARROWS.X3', 'INDICATORS.ARROWS.X4'];
const LEFT = 'INDICATORS.ARROWS.RUNWAY_COMBO_LEFT';
const RIGHT = 'INDICATORS.ARROWS.RUNWAY_COMBO_RIGHT';

export function runwaySurfaceIds(runway: Runway): string[] {
  return [runway.descriptor.backSurface, `RUNWAY.NUMBER_${runway.number}`, LEFT, RIGHT, ...MULTIPLIERS];
}

/** How many combo arrows to show for a timer value, the last one possibly partial (0x6dee2). */
export function comboArrows(value: number, comboTime: number): number {
  return value > 0 ? value * value * comboTime : 0;
}

interface Track {
  arrows: Sprite[];
  multiplier: Sprite;
}

/**
 * A runway as the original draws it (0x6dd44): the strip, its number at both ends, and for each
 * running combo a row of arrows from the runway's node that shortens as the time runs out, with
 * the multiplier over the first one.
 */
export class RunwayView extends Container {
  private readonly takeOffs: Track;
  private readonly landings: Track;

  constructor(
    private readonly textures: TextureStore,
    private readonly runway: Runway,
  ) {
    super();
    const strip = textures.sprite(runway.descriptor.backSurface);
    strip.position.copyFrom(runway.position);
    const near = textures.sprite(`RUNWAY.NUMBER_${runway.number}`);
    near.position.set(runway.position.x - 152, runway.position.y - 1);
    const far = textures.sprite(`RUNWAY.NUMBER_${runway.number}`);
    far.position.set(runway.position.x + 152, runway.position.y + 1);
    far.angle = 180;
    this.addChild(strip, near, far);

    // Take-off arrows point the way the run goes, landing arrows the other way.
    const forward = runway.direction > 0 ? RIGHT : LEFT;
    const backward = runway.direction > 0 ? LEFT : RIGHT;
    this.takeOffs = this.track(forward);
    this.landings = this.track(backward);
  }

  private track(surface: string): Track {
    const { node, direction } = this.runway;
    const arrows = Array.from({ length: ARROWS }, (_, i) => {
      const arrow = this.textures.sprite(surface);
      arrow.position.set(node.x + direction * (35 + 25 * i), node.y);
      this.addChild(arrow);
      return arrow;
    });
    const multiplier = this.textures.sprite(MULTIPLIERS[0]!);
    multiplier.position.set(node.x + direction * 35, node.y);
    this.addChild(multiplier);
    return { arrows, multiplier };
  }

  update(): void {
    this.show(this.takeOffs, this.runway.takeOffs);
    this.show(this.landings, this.runway.landings);
  }

  private show(track: Track, combo: { count: number; value: number }): void {
    const shown = comboArrows(combo.value, this.runway.descriptor.comboTime);
    track.arrows.forEach((arrow, i) => {
      arrow.visible = shown > i;
      arrow.alpha = Math.min(1, shown - i);
    });
    track.multiplier.visible = shown > 0 && combo.count >= 2;
    if (track.multiplier.visible) {
      track.multiplier.texture = this.textures.texture(MULTIPLIERS[Math.min(combo.count, 4) - 2]!);
      track.multiplier.alpha = Math.min(1, shown);
    }
  }
}
