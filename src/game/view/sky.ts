import { Container, Sprite, Texture } from 'pixi.js';
import { SCREEN_WIDTH } from '../../engine/screen';
import type { TextureStore } from '../../engine/textures';

export const SKY_SURFACES = ['AMBIENT.STAR', 'AMBIENT.SUN', 'AMBIENT.SUNRAY', 'AMBIENT.CLOUD_1', 'AMBIENT.CLOUD_2', 'AMBIENT.CLOUD_3'];

type Rgb = readonly [number, number, number];

/**
 * The sky's keyframes (`0x74358`): colours at the top, middle and bottom of the sky and how many
 * seconds the blend towards the next keyframe takes. A level starts at the first one, so it goes
 * from day through sunset into night, and the cycle closes with a dawn.
 */
export const SKY_PHASES: readonly { top: Rgb; middle: Rgb; bottom: Rgb; seconds: number }[] = [
  { top: [0.6, 0.9, 1], middle: [0.7, 0.9, 1], bottom: [0.9, 0.9, 1], seconds: 60 },
  { top: [0.5, 0.7, 0.9], middle: [0.6, 0.75, 0.9], bottom: [0.9, 0.8, 0.9], seconds: 10 },
  { top: [1, 0.8, 0.5], middle: [1, 0.55, 0.4], bottom: [1, 0.3, 0.3], seconds: 30 },
  { top: [1, 0.8, 0.5], middle: [1, 0.55, 0.4], bottom: [1, 0.3, 0.3], seconds: 10 },
  { top: [0, 0, 0], middle: [0, 0, 0.3], bottom: [0, 0.6, 0.9], seconds: 60 },
  { top: [0, 0, 0], middle: [0, 0, 0.3], bottom: [0, 0.7, 1], seconds: 20 },
  { top: [0.5, 0.7, 0.9], middle: [0.65, 0.75, 0.9], bottom: [0.9, 0.8, 0.9], seconds: 30 },
];

/** Stars (`0x74678`): x, y as a fraction of the sky height, and size in pixels. Three lie beyond a 480 px screen. */
const STARS: readonly (readonly [number, number, number])[] = [
  [26, 0.15, 9],
  [93, 0.22, 9],
  [195, 0.375, 12],
  [240, 0.12, 14],
  [362, 0.295, 13],
  [523, 0.305, 15],
  [699, 0.385, 10],
  [767, 0.215, 11],
];

/** Clouds (`0xcda08`): surface, y as a fraction of the sky height, and start offset in loop lengths. */
const CLOUDS: readonly (readonly [string, number, number])[] = [
  ['AMBIENT.CLOUD_1', 0.275, 0.3],
  ['AMBIENT.CLOUD_2', 0.325, 0.65],
  ['AMBIENT.CLOUD_3', 0.175, 1],
  ['AMBIENT.CLOUD_1', 0.275, 1.3],
  ['AMBIENT.CLOUD_2', 0.225, 1.55],
  ['AMBIENT.CLOUD_3', 0.325, 1.92],
];
const CLOUD_SPEED = 5;
const CLOUD_LOOP = 1300 / CLOUD_SPEED;
const CLOUD_START_X = -100;

/** Phase index and blend towards the next phase after `time` seconds. */
export function skyPhaseAt(time: number): { phase: number; blend: number } {
  const cycle = SKY_PHASES.reduce((sum, p) => sum + p.seconds, 0);
  let left = ((time % cycle) + cycle) % cycle;
  for (let phase = 0; phase < SKY_PHASES.length; phase++) {
    const seconds = SKY_PHASES[phase]!.seconds;
    if (left < seconds) return { phase, blend: left / seconds };
    left -= seconds;
  }
  return { phase: 0, blend: 0 };
}

/** Sky colours after `time` seconds, as CSS colours for the top, middle and bottom. */
export function skyColorsAt(time: number): [string, string, string] {
  const { phase, blend } = skyPhaseAt(time);
  const from = SKY_PHASES[phase]!;
  const to = SKY_PHASES[(phase + 1) % SKY_PHASES.length]!;
  const mix = (a: Rgb, b: Rgb): string => `rgb(${a.map((v, i) => Math.floor((v * (1 - blend) + b[i]! * blend) * 255)).join(',')})`;
  return [mix(from.top, to.top), mix(from.middle, to.middle), mix(from.bottom, to.bottom)];
}

/** Where a cloud is after `time` seconds, or null while it is out of its visible half of the loop. */
export function cloudX(time: number, offset: number): number | null {
  const at = (time + offset * CLOUD_LOOP) % (2 * CLOUD_LOOP);
  return at < CLOUD_LOOP ? CLOUD_START_X + CLOUD_SPEED * at : null;
}

/**
 * The original `Sky` (constructor `0x74558`): a three-colour gradient that runs through a day and
 * night cycle, the sun setting as evening comes, stars at night, and drifting clouds. The moon is
 * left out: its path (`0x29e08`) stays to the right of a 480 px screen.
 */
export class SkyView extends Container {
  private readonly canvas = document.createElement('canvas');
  private readonly gradient: Sprite;
  private readonly stars: { sprite: Sprite; size: number; phase: number }[] = [];
  private readonly rays: Sprite;
  private readonly sun: Sprite;
  private readonly clouds: { sprite: Sprite; offset: number }[] = [];
  private time = 0;
  private starFade = 0;
  private sunAt: number | null = null;
  private lastPhase = 0;
  private painted = '';

  /**
   * @param height the sky's own height, where the bottom colour is reached
   * @param fill   how far down to keep painting the bottom colour, for backdrops that leave a gap
   */
  constructor(textures: TextureStore, private readonly skyHeight: number, fill: number) {
    super();
    this.canvas.width = 1;
    this.canvas.height = Math.max(skyHeight, fill);
    this.gradient = new Sprite(Texture.from(this.canvas));
    this.gradient.width = SCREEN_WIDTH;
    this.addChild(this.gradient);

    for (const [x, y, size] of STARS) {
      const sprite = textures.sprite('AMBIENT.STAR');
      sprite.position.set(x, y * skyHeight);
      this.stars.push({ sprite, size, phase: Math.random() });
      this.addChild(sprite);
    }
    this.rays = textures.sprite('AMBIENT.SUNRAY');
    this.sun = textures.sprite('AMBIENT.SUN');
    this.addChild(this.rays, this.sun);
    for (const [id, y, offset] of CLOUDS) {
      const sprite = textures.sprite(id);
      sprite.y = Math.floor(y * skyHeight);
      this.clouds.push({ sprite, offset });
      this.addChild(sprite);
    }
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    const { phase } = skyPhaseAt(this.time);
    // Entering a phase (0x74b90): the sun starts down as the afternoon ends, the stars come out
    // with the night and go at its end.
    if (phase !== this.lastPhase) {
      if (this.lastPhase === 0) this.sunAt = 0;
      this.lastPhase = phase;
    }
    const starsOut = phase === 3 || phase === 4;

    const colors = skyColorsAt(this.time);
    const key = colors.join();
    if (key !== this.painted) {
      this.painted = key;
      const context = this.canvas.getContext('2d')!;
      const gradient = context.createLinearGradient(0, 0, 0, this.skyHeight);
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(0.5, colors[1]);
      gradient.addColorStop(1, colors[2]);
      context.fillStyle = gradient;
      context.fillRect(0, 0, 1, this.canvas.height);
      this.gradient.texture.source.update();
    }

    // Stars fade over ten seconds and throb in size every two (0x29968).
    this.starFade = Math.max(0, Math.min(1, this.starFade + (starsOut ? 0.1 : -0.1) * dt));
    for (const star of this.stars) {
      star.sprite.visible = this.starFade > 0;
      const throb = 0.8 + 0.2 * Math.sin(2 * Math.PI * (this.time * 0.5 + star.phase));
      star.sprite.scale.set((throb * star.size * this.starFade) / star.sprite.texture.width);
    }

    // The sun crosses in forty seconds, its rays turning behind it (0x29c10).
    if (this.sunAt !== null) {
      this.sunAt += dt * 0.025;
      if (this.sunAt > 1) this.sunAt = null;
    }
    this.sun.visible = this.rays.visible = this.sunAt !== null;
    if (this.sunAt !== null) {
      const x = 400 - 300 * Math.pow(this.sunAt, 0.25);
      const y = 450 * this.sunAt - 200;
      this.sun.position.set(x, y);
      this.rays.position.set(x, y);
      this.rays.angle = 300 * this.sunAt;
      this.rays.scale.set(1 + 0.025 * Math.sin(200 * this.sunAt));
    }

    for (const cloud of this.clouds) {
      const x = cloudX(this.time, cloud.offset);
      cloud.sprite.visible = x !== null && x > -200 && x < 1000;
      if (x !== null) cloud.sprite.x = x;
    }
  }
}
