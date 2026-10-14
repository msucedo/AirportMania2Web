import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { Simulation } from '../sim/simulation';

// The bonus events as the original draws them: balloons (0x21ee8), the coins they and the
// helicopter release (0x260d4) and the helicopter (0x498d8). See docs/re-notes.md.

export const BONUS_SURFACES = {
  balloons: ['BALLOON.0', 'BALLOON.1', 'BALLOON.2', 'BALLOON.THREAD', 'BALLOON.SPLASH', 'COIN_BONUS'],
  helicopter: ['HELICOPTER.0', 'HELICOPTER.1', 'HELICOPTER.2', 'HELICOPTER.3', 'COIN_BONUS'],
} as const;

/** A balloon's lean in degrees at height `y`: it sways as it rises (0x21ef8). */
export const balloonLean = (y: number): number => 3 * Math.sin(0.05 * y);

/** A coin's swing in degrees after `time` seconds (0x261aa). */
export const coinSwing = (time: number): number => 35 * Math.sin(2.3 * time);

/** The helicopter's rotor frame for how far along it is (0x4990c). */
export const helicopterFrame = (progress: number): number => ((Math.trunc(progress * 30) % 4) + 4) % 4;

/**
 * A popped balloon's burst with `clock` left (0x255ac, 0x255e4), which runs from 1 to nothing in
 * half a second: it grows from half its size to all of it with a wobble that dies away, and
 * comes and goes. Null once it is over.
 */
export function burstPose(clock: number): { scale: number; alpha: number } | null {
  if (clock <= 0) return null;
  return {
    scale: 0.5 + 0.5 * (1 - clock) + 0.1 * Math.sin(10 * clock * Math.PI) * clock,
    alpha: Math.max(0, Math.min(1, 2 * clock, 4 * (1 - clock))),
  };
}

export class BonusView extends Container {
  private readonly balloons = new Map<number, { holder: Container; thread: Sprite; body: Sprite; swell: number }>();
  private readonly coins = new Map<number, Sprite>();
  private readonly splashes: { sprite: Sprite; age: number }[] = [];
  private helicopter: Sprite | null = null;

  constructor(
    private readonly textures: TextureStore,
    private readonly sim: Simulation,
  ) {
    super();
  }

  /** The burst where a balloon was popped. */
  splash(x: number, y: number): void {
    const sprite = this.textures.sprite('BALLOON.SPLASH');
    sprite.position.set(x, y);
    this.addChild(sprite);
    this.splashes.push({ sprite, age: 0 });
  }

  update(dt: number, finger: { x: number; y: number } | null = null): void {
    const { sim, textures } = this;

    const alive = new Set(sim.balloons.map((b) => b.id));
    for (const [id, view] of this.balloons) {
      if (alive.has(id)) continue;
      view.holder.destroy({ children: true });
      this.balloons.delete(id);
    }
    for (const balloon of sim.balloons) {
      let view = this.balloons.get(balloon.id);
      if (!view) {
        const holder = new Container();
        // The thread leans about its hot spot, the top of the string (2, 0).
        const thread = textures.pinned('BALLOON.THREAD');
        const body = textures.sprite(`BALLOON.${balloon.image}`);
        // The balloon turns the other way about a point 20 px above, so it stays upright over
        // its leaning thread.
        body.pivot.set(0, 20);
        body.position.set(0, 20);
        holder.addChild(thread, body);
        this.addChild(holder);
        view = { holder, thread, body, swell: 0 };
        this.balloons.set(balloon.id, view);
      }
      const lean = balloonLean(balloon.y);
      view.holder.position.set(balloon.x, balloon.y);
      view.thread.angle = lean;
      view.body.angle = -lean;
      // 0x21fc8, 0x21f70: under a finger (30 px about it) its value rises at 3 a second, and the
      // balloon is drawn that share of 0.3 larger.
      const held = finger !== null && Math.abs(finger.x - balloon.x) <= 30 && Math.abs(finger.y - balloon.y) <= 30;
      view.swell = Math.max(0, Math.min(1, view.swell + (held ? 3 : -3) * dt));
      view.body.scale.set(1 + 0.3 * view.swell);
    }

    const coins = new Set(sim.coins.map((c) => c.id));
    for (const [id, sprite] of this.coins) {
      if (coins.has(id)) continue;
      sprite.destroy();
      this.coins.delete(id);
    }
    for (const coin of sim.coins) {
      let sprite = this.coins.get(coin.id);
      if (!sprite) {
        sprite = textures.sprite('COIN_BONUS');
        this.addChild(sprite);
        this.coins.set(coin.id, sprite);
      }
      sprite.position.set(coin.x, coin.y);
      sprite.scale.set(Math.max(0, Math.min(1, coin.scale)));
      sprite.angle = coinSwing(coin.time);
    }

    const helicopter = sim.helicopter;
    if (!helicopter && this.helicopter) {
      this.helicopter.destroy();
      this.helicopter = null;
    }
    if (helicopter) {
      this.helicopter ??= this.addChild(textures.sprite('HELICOPTER.0'));
      this.helicopter.texture = textures.texture(`HELICOPTER.${helicopterFrame(helicopter.progress)}`);
      this.helicopter.position.set(helicopter.x, helicopter.y);
      this.helicopter.scale.x = helicopter.fromLeft ? -1 : 1;
    }

    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const splash = this.splashes[i]!;
      splash.age += dt;
      const pose = burstPose(1 - 2 * splash.age);
      if (pose) {
        splash.sprite.scale.set(pose.scale);
        splash.sprite.alpha = pose.alpha;
      }
      if (!pose) {
        splash.sprite.destroy();
        this.splashes.splice(i, 1);
      }
    }
  }
}
