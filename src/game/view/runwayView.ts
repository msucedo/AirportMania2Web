import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { Runway } from '../sim/simulation';

const ARROWS = 5;
const MULTIPLIERS = ['INDICATORS.ARROWS.X2', 'INDICATORS.ARROWS.X3', 'INDICATORS.ARROWS.X4'];
const LEFT = 'INDICATORS.ARROWS.RUNWAY_COMBO_LEFT';
const RIGHT = 'INDICATORS.ARROWS.RUNWAY_COMBO_RIGHT';
const USING_LEFT = 'INDICATORS.ARROWS.RUNWAY_USING_LEFT';
const USING_RIGHT = 'INDICATORS.ARROWS.RUNWAY_USING_RIGHT';
const USING_ARROWS = 4;

export function runwaySurfaceIds(runway: Runway): string[] {
  return [runway.descriptor.backSurface, `RUNWAY.NUMBER_${runway.number}`, LEFT, RIGHT, USING_LEFT, USING_RIGHT, ...MULTIPLIERS];
}

/**
 * Where an in-use arrow is at `t` (0 to 1) of its run, in px from the runway node towards the
 * runway's centre, and how visible: it fades in and out over the first and last tenth (0x6e1f4).
 */
export function usingArrow(t: number, landing: boolean): { along: number; opacity: number } {
  const along = landing ? 260 - 220 * t : 40 + 220 * t;
  const opacity = t > 0.9 ? (1 - t) * 10 : t < 0.1 ? t * 10 : 1;
  return { along, opacity };
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
  private readonly using: Sprite[] = [];
  /** Shown while a plane is on its way to use the runway (`+0xa4`, faded at 3/s into `+0xa8`). */
  private usingFade = 0;
  /** What swells under the pointer. */
  readonly body = new Container();
  private usingPhase = 0;
  private usingLanding = false;

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
    // 0x6dd60–0x6de00: the strip and both numbers take the runway's scale; the arrows do not.
    this.body.pivot.copyFrom(runway.position);
    this.body.position.copyFrom(runway.position);
    this.body.addChild(strip, near, far);
    this.addChild(this.body);
    for (let i = 0; i < USING_ARROWS; i++) {
      const arrow = textures.sprite(USING_LEFT);
      arrow.visible = false;
      this.using.push(arrow);
      this.addChild(arrow);
    }

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

  update(dt = 0): void {
    this.flow(dt);
    this.show(this.takeOffs, this.runway.takeOffs);
    this.show(this.landings, this.runway.landings);
  }

  /**
   * Arrows running along the strip while a plane is coming in to land or taxiing over to take
   * off, in the direction it will move (0x6de06). They go when the plane gets there.
   */
  private flow(dt: number): void {
    const { runway } = this;
    const landing = runway.use === 'landing' && runway.plane !== null && !runway.plane.landed;
    const on = landing || runway.use === 'takeOffReserved';
    if (on && this.usingFade === 0) this.usingPhase = 0;
    if (on) this.usingLanding = landing;
    this.usingFade = on ? Math.min(1, this.usingFade + 3 * dt) : Math.max(0, this.usingFade - 3 * dt);
    this.usingPhase = (this.usingPhase + 0.3 * dt) % 1;
    // Towards the node when landing: left on a runway whose strip lies to the right of it.
    const towardsNode = runway.direction > 0 ? USING_LEFT : USING_RIGHT;
    const awayFromNode = runway.direction > 0 ? USING_RIGHT : USING_LEFT;
    const texture = this.textures.texture(this.usingLanding ? towardsNode : awayFromNode);
    this.using.forEach((arrow, i) => {
      arrow.visible = this.usingFade > 0;
      if (!arrow.visible) return;
      const { along, opacity } = usingArrow((this.usingPhase + i * 0.25) % 1, this.usingLanding);
      arrow.texture = texture;
      arrow.position.set(runway.node.x + runway.direction * along, runway.node.y);
      arrow.alpha = this.usingFade * opacity;
    });
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
