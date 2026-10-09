import { Container, Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { ServiceButton } from '../sim/simulation';

// The two tabs that hang behind the top bar (0x12f90): in-flight movies at x 354 and coffee and
// cake at x 395, or a filler in the slot of one that has not been bought. See docs/re-notes.md.

export const SERVICE_SLOTS = { movies: 354, coffee: 395 } as const;
export const SERVICE_TAB_SURFACES = ['GUI.INGAMEGUI.GRIP', 'GUI.INGAMEGUI.COFFEE_AND_CAKE_ON', 'GUI.INGAMEGUI.COFFEE_AND_CAKE_OFF'];

/** The filler of an empty slot (0x1328c). */
export function serviceGrip(textures: TextureStore, x: number): Sprite {
  const grip = textures.sprite('GUI.INGAMEGUI.GRIP');
  grip.position.set(x, 9);
  return grip;
}

/**
 * A service tab (0x24170): tucked up behind the bar while it recharges, it drops down when it
 * is ready and lights up under the finger.
 */
export class ServiceTab extends Container {
  private readonly body = new Container();
  private readonly lit: Sprite;
  private readonly tall: number;
  private out = 0;
  private glow = 0;
  held = false;

  constructor(
    textures: TextureStore,
    private readonly button: ServiceButton,
    private readonly x0: number,
    surfaces: { on: string; off: string },
  ) {
    super();
    const off = textures.sprite(surfaces.off);
    this.lit = textures.sprite(surfaces.on);
    this.tall = off.height;
    this.body.addChild(off, this.lit);
    this.body.x = -Math.trunc(off.width / 2);
    this.addChild(this.body);
    this.position.set(x0, 11);
    this.update(0);
  }

  /** The area that takes touches (0x24054). */
  contains(x: number, y: number): boolean {
    return x >= this.x0 - 20 && x <= this.x0 + 20 && y >= 6 && y <= 47;
  }

  update(dt: number): void {
    const step = (value: number, on: boolean, rate: number): number => (on ? Math.min(1, value + rate * dt) : Math.max(0, value - rate * dt));
    this.out = step(this.out, this.button.ready, 6);
    this.glow = step(this.glow, this.held && this.button.ready, 5);
    // It stretches a little on the way in and out.
    this.body.scale.y = this.button.ready ? 1 : 1 + 0.3 * Math.sin(Math.PI * this.out);
    this.body.y = -10 - (this.tall - 20) * (1 - this.out);
    this.lit.visible = this.glow > 0;
    this.lit.alpha = this.glow;
  }
}
