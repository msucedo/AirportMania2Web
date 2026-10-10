import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import { RULES } from '../sim/rules';
import type { StopSpot } from '../sim/simulation';

// What a wash and go shows besides its grating (constructor 0x84a8c, start 0x84d60): a shower
// that is always there, and for each wash two rollers, the shower's water, eight splashes and
// three shiny stars, each an object of its own sorted among the planes. Every one runs on a
// clock that counts down. See docs/re-notes.md.

export const WASH_SURFACES = [
  'WASH_AND_GO.SHOWER',
  'WASH_AND_GO.ROLLER_0',
  'WASH_AND_GO.ROLLER_1',
  'WASH_AND_GO.ROLLER_2',
  'WASH_AND_GO.ROLLER_3',
  'WASH_AND_GO.WATER_0',
  'WASH_AND_GO.WATER_1',
  'WASH_AND_GO.WATER_2',
  'WASH_AND_GO.SPLASH_0',
  'WASH_AND_GO.SPLASH_1',
  'WASH_AND_GO.SPLASH_2',
  'AMBIENT.STAR',
];

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

/** The two rollers: where each is from the wash, and what its clock starts at. */
export const ROLLERS = [
  { x: -48, y: -11, clock: 6.5 },
  { x: -30, y: 15, clock: 6 },
] as const;
/** The water's clock starts at 5. */
export const WATER_CLOCK = 5;
/** The stars: where each is, what its clock starts at and how fast it turns, in degrees a second. */
export const STARS = [
  { x: -25, y: -35, clock: 8.75, spin: -300 },
  { x: 5, y: -10, clock: 8.25, spin: 300 },
  { x: 20, y: -20, clock: 8.5, spin: -250 },
] as const;

/**
 * A roller with `clock` seconds left (0x85f28): shown under six, it comes and goes over half a
 * second and, between five and one, slides out 60 px and back once a second. Null when not shown.
 */
export function rollerPose(clock: number): { slide: number; frame: number; alpha: number } | null {
  if (clock <= 0 || clock >= 6) return null;
  const turn = clock < 1 ? 2 * Math.PI : clock > 5 ? 10 * Math.PI : 2 * Math.PI * clock;
  return { slide: 30 * (1 - Math.cos(turn)), frame: Math.trunc(clock * 10) % 4, alpha: clamp(2 * Math.min(clock, 6 - clock)) };
}

/** The water with `clock` seconds left (0x85d60): shown under five, coming and going over a second. */
export function waterPose(clock: number): { frame: number; alpha: number } | null {
  if (clock <= 0 || clock >= 5) return null;
  return { frame: Math.trunc(clock * 10) % 3, alpha: clamp(Math.min(clock, 5 - clock)) };
}

/** A shiny star in the last second of its clock (0x85b90): it swells to full size and back. */
export function starPose(clock: number): { scale: number; alpha: number } | null {
  if (clock <= 0 || clock >= 1) return null;
  const middle = Math.min(clock, 1 - clock);
  return { scale: 2 * middle, alpha: clamp(10 * middle) };
}

/** A splash in the last second of its clock (0x85950): it grows from 0.7 to 1.3 as it fades. */
export function splashPose(clock: number): { scale: number; alpha: number } | null {
  if (clock <= 0 || clock >= 1) return null;
  return { scale: 1.3 - 0.6 * clock, alpha: clock * clamp(6 * Math.min(clock, 1 - clock)) };
}

/** How solid the dirt is `elapsed` seconds into the wash (0x923a); it is gone for good once the plane is clean. */
export const dirtAlpha = (elapsed: number): number => clamp(1 - elapsed / 4);

interface Splash {
  sprite: Sprite;
  clock: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Star {
  sprite: Sprite;
  clock: number;
  spin: number;
}

export class WashView {
  private readonly rollers: Sprite[][];
  private readonly water: Sprite[];
  private splashes: Splash[] = [];
  private stars: Star[] = [];
  /** Seconds since the wash under way began; null when none has, or all it started is over. */
  private elapsed: number | null = null;
  private washing = false;

  constructor(
    private readonly textures: TextureStore,
    private readonly spot: StopSpot,
    private readonly layer: Container,
  ) {
    const { x, y } = spot.position;
    const add = (id: string, at: { x: number; y: number }, depth: number, shown: boolean): Sprite => {
      const sprite = textures.pinned(id);
      sprite.position.set(at.x, at.y);
      sprite.zIndex = depth;
      sprite.visible = shown;
      layer.addChild(sprite);
      return sprite;
    };
    // The shower stands at the wash's place, sorted 15 px behind it.
    add('WASH_AND_GO.SHOWER', { x, y }, y - 15, true);
    // A roller is sorted 10 px behind where it stands; the water 2 px in front of the wash.
    this.rollers = ROLLERS.map((roller) => [0, 1, 2, 3].map((frame) => add(`WASH_AND_GO.ROLLER_${frame}`, { x: x + roller.x, y: y + roller.y }, y + roller.y - 10, false)));
    this.water = [0, 1, 2].map((frame) => add(`WASH_AND_GO.WATER_${frame}`, { x, y }, y + 2, false));
  }

  update(dt: number): void {
    const now = this.spot.wash?.left ?? null;
    if (now !== null && !this.washing) this.start();
    this.washing = now !== null;
    if (this.elapsed === null) return;
    this.elapsed += dt;
    const elapsed = this.elapsed;

    this.rollers.forEach((frames, index) => {
      const pose = rollerPose(ROLLERS[index]!.clock - elapsed);
      frames.forEach((sprite, frame) => {
        sprite.visible = pose?.frame === frame;
        if (!sprite.visible || !pose) return;
        sprite.x = this.spot.position.x + ROLLERS[index]!.x + pose.slide;
        sprite.alpha = pose.alpha;
      });
    });
    const water = waterPose(WATER_CLOCK - elapsed);
    this.water.forEach((sprite, frame) => {
      sprite.visible = water?.frame === frame;
      if (water) sprite.alpha = water.alpha;
    });

    for (const star of this.stars) {
      star.clock -= dt;
      star.sprite.angle += star.spin * dt;
      const pose = starPose(star.clock);
      star.sprite.visible = pose !== null;
      if (pose) {
        star.sprite.scale.set(pose.scale);
        star.sprite.alpha = pose.alpha;
      }
    }
    for (const splash of this.splashes) {
      splash.clock -= dt;
      const pose = splashPose(splash.clock);
      splash.sprite.visible = pose !== null;
      if (!pose) continue;
      // It only moves once it shows, falling at 150 px/s² (0x9f18).
      splash.y += (splash.vy + 0.5 * 150 * dt) * dt;
      splash.x += splash.vx * dt;
      splash.vy += 150 * dt;
      splash.sprite.position.set(splash.x, splash.y);
      splash.sprite.scale.set(pose.scale);
      splash.sprite.alpha = pose.alpha;
    }
    if (elapsed > 10) this.clear();
  }

  /** 0x84d60: the clocks are set, and the splashes and stars of this wash made. */
  private start(): void {
    this.clear();
    this.elapsed = 0;
    const { x, y } = this.spot.position;
    for (const star of STARS) {
      const sprite = this.textures.sprite('AMBIENT.STAR');
      sprite.position.set(x + star.x, y + star.y);
      sprite.angle = Math.random() * 360;
      sprite.zIndex = y + 50;
      sprite.visible = false;
      this.layer.addChild(sprite);
      this.stars.push({ sprite, clock: star.clock, spin: star.spin });
    }
    // Four pairs a tenth of a second apart, one thrown to the left and one to the right.
    for (let pair = 0; pair < 4; pair++) {
      for (const side of [-1, 1]) {
        const sprite = this.textures.sprite(`WASH_AND_GO.SPLASH_${pair % 3}`);
        sprite.zIndex = y + 100;
        sprite.visible = false;
        this.layer.addChild(sprite);
        this.splashes.push({
          sprite,
          clock: 0.1 * pair + (side < 0 ? 8 : 8.05),
          x: x + 10 * side,
          y: y - 35 + Math.random() * 25,
          vx: side * (90 - Math.random() * 50),
          vy: -90 + Math.random() * 50,
        });
      }
    }
  }

  private clear(): void {
    for (const { sprite } of [...this.stars, ...this.splashes]) sprite.destroy();
    this.stars = [];
    this.splashes = [];
    this.elapsed = null;
  }
}

/** Seconds into the wash a plane on a wash and go is, or null when it is not being washed. */
export const washElapsed = (left: number | null | undefined): number | null => (left === null || left === undefined ? null : RULES.wash.time - left);
