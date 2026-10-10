import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import { RULES } from '../sim/rules';
import type { Runway } from '../sim/simulation';

// Sand on a runway (draw 0x6f8e0), the brush that sweeps it (update 0x1a230, draw 0x1a4b0) and
// the puffs of sand the brush throws up (0x1a8ec, 0x1a88c, 0x1a804). See docs/re-notes.md.

export const SAND_SURFACES = ['RUNWAY.SAND.0', 'RUNWAY.SAND.1', 'RUNWAY.SAND.2', 'RUNWAY.SAND.3', 'BRUSH.0', 'BRUSH.1', 'BRUSH.2', 'BRUSH.3', 'BRUSH.4', 'BRUSH.5', 'BRUSH.6', 'BRUSH.7', 'SAND_PUFF'];

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

/** The six patches lie 56 px apart along the runway, 2 px above its line. */
const PATCHES = 6;
const patchX = (index: number): number => -140 + 56 * index;

/** Opacity of patch `index`: they come one after another from the left, and go the other way. */
export const patchAlpha = (index: number, fade: number): number => (fade < 1 ? clamp(4 * fade - index / 3 - 1) : 1);

/** The brush after `progress` (0 to 1) of its way: where it is from the runway's centre, how solid, and its frame. */
export function brushPose(progress: number): { x: number; y: number; alpha: number; frame: number } {
  const alpha = clamp(20 * Math.min(progress, 1 - progress));
  return {
    x: 180 - 190 * progress,
    // It drops 20 px onto the runway as it appears and lifts again as it goes.
    y: 20 * alpha * alpha - 25,
    alpha,
    // Eight frames, twelve turns over the way; it ends on a still frame.
    frame: progress >= 0.94 ? 2 : Math.trunc(progress * 96) % 8,
  };
}

/** Opacity of a puff with `life` seconds left: it shows once below one second, and fades at the end. */
export const puffAlpha = (life: number): number => clamp(Math.min(2 * life, 5 * (1 - life)));

interface Puff {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ay: number;
  spin: number;
  life: number;
}

/** The sand itself, sorted among the planes just in front of the runway's line (`runway.y + 4`). */
export class SandView extends Container {
  private readonly patches: Sprite[] = [];

  constructor(
    textures: TextureStore,
    private readonly runway: Runway,
  ) {
    super();
    this.position.copyFrom(runway.position);
    this.zIndex = runway.position.y + 4;
    for (let index = 0; index < PATCHES; index++) {
      const patch = textures.sprite(`RUNWAY.SAND.${(index + 2) % 4}`);
      patch.position.set(patchX(index), -2);
      this.patches.push(patch);
      this.addChild(patch);
    }
    this.visible = false;
  }

  update(): void {
    const sand = this.runway.sand;
    this.visible = sand !== null;
    if (!sand) return;
    this.patches.forEach((patch, index) => {
      patch.alpha = patchAlpha(index, sand.fade);
    });
  }
}

/**
 * The brush and its puffs. They are objects of their own in the original, sorted among the
 * planes: the brush at `runway.y + 5` and each puff at the height it appeared at.
 */
export class SandBrush {
  private readonly brush: Sprite[];
  private readonly puffs: Puff[] = [];
  /** Seconds to the next puff; the first comes after 0.06 s. */
  private next = 0.06;
  private working = false;

  constructor(
    private readonly textures: TextureStore,
    private readonly runway: Runway,
    private readonly layer: Container,
  ) {
    this.brush = [0, 1, 2, 3, 4, 5, 6, 7].map((frame) => {
      const sprite = textures.sprite(`BRUSH.${frame}`);
      sprite.zIndex = runway.position.y + 5;
      sprite.visible = false;
      layer.addChild(sprite);
      return sprite;
    });
  }

  update(dt: number): void {
    const time = this.runway.sand?.machine ?? null;
    const progress = time === null ? 1 : time / RULES.sand.brushTime;
    for (const sprite of this.brush) sprite.visible = false;
    if (progress < 1) {
      if (!this.working) this.next = 0.06;
      this.working = true;
      const pose = brushPose(progress);
      const sprite = this.brush[pose.frame]!;
      sprite.visible = true;
      sprite.alpha = pose.alpha;
      sprite.position.set(this.runway.position.x + pose.x, this.runway.position.y + pose.y);
      // It throws up puffs until the last tenth of its way, one every 0.05 to 0.1 s.
      if (progress < 0.9) {
        this.next -= dt;
        while (this.next < 0) {
          this.throwPuff(this.runway.position.x + pose.x, this.runway.position.y - 25);
          this.next += 0.05 + Math.random() * 0.05;
        }
      }
    } else this.working = false;

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i]!;
      // 0x9f18: the position moves by the speed at the middle of the step.
      puff.y += (puff.vy + 0.5 * puff.ay * dt) * dt;
      puff.x += puff.vx * dt;
      puff.vy += puff.ay * dt;
      puff.sprite.angle += puff.spin * dt;
      puff.sprite.scale.set(puff.sprite.scale.x + 0.6 * dt);
      puff.life -= dt;
      if (puff.life <= 0) {
        puff.sprite.destroy();
        this.puffs.splice(i, 1);
        continue;
      }
      puff.sprite.position.set(puff.x, puff.y);
      puff.sprite.alpha = puffAlpha(puff.life);
    }
  }

  /** 0x1a350: a puff leaves the brush up and to one side, half a second of its flight away. */
  private throwPuff(x: number, y: number): void {
    let vx = Math.random() * 10 - 25;
    let vy = Math.random() * 15 - 20;
    const ay = Math.random() * 10 - 20;
    if (Math.random() < 0.5) {
      vx = -vx;
      vy = -vy;
    }
    const sprite = this.textures.sprite('SAND_PUFF');
    const puff: Puff = { sprite, x: x + 0.5 * vx, y: y + 0.5 * vy, vx, vy, ay, spin: Math.random() * 60 - 30, life: 1 + Math.random() * 0.2 };
    sprite.angle = Math.random() * 20 - 10;
    sprite.scale.set(0.5 + Math.random() * 0.3);
    sprite.position.set(puff.x, puff.y);
    sprite.zIndex = puff.y;
    sprite.alpha = puffAlpha(puff.life);
    this.layer.addChild(sprite);
    this.puffs.push(puff);
  }
}
