import { Container, Graphics, MeshSimple, type Application, type Sprite } from 'pixi.js';
import type { AudioPlayer } from '../engine/audio';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../engine/screen';
import type { TextureStore } from '../engine/textures';
import { SWG_WIND_ROWS } from './view/swgWindRows';

// The two screens the game opens with: the publisher's (update 0x6c4d0, draw 0x6c5c0) and the
// studio's (update 0x79c60, draw 0x79d74). See docs/re-notes.md.

const PUBLISHER_SURFACES = ['LOGO', 'SEAL', 'PUBLISHED', 'BRIGHT', 'RECTANGLE_BRIGHT', 'STAR'].map((name) => `REFLEXIVE_INTRO.${name}`);
const STUDIO_SURFACES = ['LOGO', 'WIND', 'BACKGROUND'].map((name) => `SWG_INTRO.${name}`);
export const OPENING_SOUNDS = ['REFLEXIVE_INTRO.SOUND', 'SWG_INTRO.SOUND'];

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
/** Up over `1 / rate` seconds from `from` and down the same before `to`. */
const window = (clock: number, from: number, to: number, rate: number): number => clamp(rate * Math.min(clock - from, to - clock));

/** How solid the publisher's three pictures are at its clock (0x6c616): each comes in over two seconds, half a second after the one above, and goes the same way. */
export function publisherFades(clock: number): { published: number; seal: number; logo: number } {
  return { published: window(clock, 1, 5.5, 0.5), seal: window(clock, 1.5, 6, 0.5), logo: window(clock, 2, 6.5, 0.5) };
}

export interface Sweep {
  /** How far from the seal's centre the bar starts, to its left. */
  reach: number;
  /** Degrees it has turned round the seal. */
  turn: number;
  /** How much the turn is flattened, top to bottom. */
  flat: number;
  alpha: number;
}

/**
 * The four bars of light that sweep round the seal (0x6c780, 0x6c8ac): two for half a second from
 * 3.2 s and two wider ones for 0.7 s, each pair from opposite sides.
 */
export function publisherSweeps(clock: number): Sweep[] {
  const sweeps: Sweep[] = [];
  if (clock > 3.2 && clock < 3.7) {
    const u = 2 * (clock - 3.2);
    const alpha = clamp(5 * Math.min(u, 1 - u));
    sweeps.push({ reach: 126, turn: -70 * u, flat: 0.232, alpha }, { reach: 126, turn: -75 * u - 180, flat: 0.232, alpha });
  }
  if (clock > 3.2 && clock < 3.9) {
    const w = (clock - 3.2) / 0.7;
    const alpha = clamp(5 * Math.min(w, 1 - w));
    sweeps.push({ reach: 140, turn: -120 * w, flat: 0.332, alpha }, { reach: 144, turn: -135 * w - 180, flat: 0.332, alpha });
  }
  return sweeps;
}

/**
 * The glint that runs down the seal's left side for a second from 3.7 s (0x6c9d0), or nothing
 * outside it: where it is, how solid its glow is, and its star's turn and opacity.
 */
export function publisherGlint(clock: number): { x: number; y: number; glow: number; turn: number; star: number } | null {
  if (!(clock > 3.7 && clock < 4.7)) return null;
  const q = clock - 3.7;
  const angle = (Math.min(1.5 * q, 1) * Math.PI) / 2;
  const flicker = Math.sin(3 * Math.PI * q);
  return { x: 240 - 144 * Math.sin(angle), y: 136 - 48 * Math.cos(angle), glow: clamp(5 * Math.min(q, 1 - q)), turn: 3000 * q, star: flicker < 0.3 ? 0.3 : Math.min(0.5, flicker) };
}

/** The publisher's screen lasts 6.5 s, or until a touch once 0.7 s have gone (0x6c4f8). */
export const publisherOver = (clock: number, touched: boolean): boolean => clock > 6.5 || (clock > 0.7 && touched);

/** How far down its image the studio's wind is taken from at a row `along` its way (0x79c9e, 0x908f8), with its clock from 0 to 1. */
export const studioWindV = (clock: number, along: number): number => 4 * clock - 3 * along;

type Phase = 'publisher' | 'publisherOut' | 'studioIn' | 'studio' | 'studioOut' | 'done';

export class Opening {
  readonly root = new Container();
  private phase: Phase = 'publisher';
  /** The publisher's clock, then each fade's and the studio's wait. */
  private clock = 0;
  private wind = -1000;
  private touched = false;
  private readonly publisher = new Container();
  private readonly studio = new Container();
  private readonly white: Graphics;
  private readonly pictures: { published: Sprite; seal: Sprite; logo: Sprite };
  private readonly sweeps: { tilt: Container; arm: Container; bar: Sprite }[] = [];
  private readonly glow: Sprite;
  private readonly star: Sprite;
  private readonly strips: MeshSimple[] = [];
  private sound: { stop(fade?: number): void } | null = null;

  private constructor(
    textures: TextureStore,
    private readonly audio: AudioPlayer,
    private readonly onDone: () => void,
  ) {
    const black = new Graphics().rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill(0x000000);
    const at = (id: string, x: number, y: number): Sprite => {
      const sprite = textures.sprite(id);
      sprite.position.set(x, y);
      return sprite;
    };
    this.pictures = { published: at('REFLEXIVE_INTRO.PUBLISHED', 240, 70), seal: at('REFLEXIVE_INTRO.SEAL', 240, 136), logo: at('REFLEXIVE_INTRO.LOGO', 240, 220) };
    this.publisher.addChild(black, this.pictures.published, this.pictures.seal, this.pictures.logo);
    for (let i = 0; i < 4; i++) {
      // A bar is put out to the left, turned round the seal, and the turn then flattened.
      const tilt = new Container();
      tilt.position.set(240, 136);
      const arm = new Container();
      const bar = textures.sprite('REFLEXIVE_INTRO.RECTANGLE_BRIGHT');
      arm.addChild(bar);
      tilt.addChild(arm);
      this.publisher.addChild(tilt);
      this.sweeps.push({ tilt, arm, bar });
    }
    this.glow = textures.sprite('REFLEXIVE_INTRO.BRIGHT');
    this.star = textures.sprite('REFLEXIVE_INTRO.STAR');
    this.publisher.addChild(this.glow, this.star);

    const back = textures.sprite('SWG_INTRO.BACKGROUND');
    back.width = SCREEN_WIDTH;
    back.height = SCREEN_HEIGHT;
    this.studio.addChild(back, at('SWG_INTRO.LOGO', 240, 160));
    const wind = textures.texture('SWG_INTRO.WIND');
    for (let i = 0; i + 1 < SWG_WIND_ROWS.length; i++) {
      const [near, far] = [SWG_WIND_ROWS[i]!, SWG_WIND_ROWS[i + 1]!];
      const strip = new MeshSimple({ texture: wind, vertices: new Float32Array([...near.slice(0, 4), ...far.slice(0, 4)]), uvs: new Float32Array(8), indices: new Uint32Array([0, 1, 2, 1, 3, 2]) });
      this.strips.push(strip);
      this.studio.addChild(strip);
    }
    this.studio.visible = false;
    this.white = new Graphics().rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill(0xffffff);
    this.white.alpha = 0;
    this.root.addChild(this.publisher, this.studio, this.white);
    this.root.eventMode = 'static';
    this.root.hitArea = { contains: () => true };
    this.root.on('pointerdown', () => (this.touched = true));
    this.sound = this.audio.loop('REFLEXIVE_INTRO.SOUND', 1, false);
    this.update(0);
  }

  update(dt: number): void {
    const touched = this.touched;
    this.touched = false;
    this.clock += dt;
    switch (this.phase) {
      case 'publisher':
        if (publisherOver(this.clock, touched)) {
          // 0x6c53e: the sound is let go over half a second.
          this.sound?.stop(0.5);
          this.sound = null;
          this.enter('publisherOut');
        }
        break;
      case 'publisherOut':
        if (this.clock > 1) {
          this.publisher.visible = false;
          this.studio.visible = true;
          this.audio.play('SWG_INTRO.SOUND');
          this.enter('studioIn');
        }
        break;
      case 'studioIn':
        if (this.clock > 1) {
          this.wind = 0;
          this.enter('studio');
        }
        break;
      case 'studio':
        // 0x79d00: a touch ends the wait, which is 1.7 s otherwise.
        if (touched || this.clock > 1.7) this.enter('studioOut');
        break;
      case 'studioOut':
        if (this.clock > 1) {
          this.phase = 'done';
          this.onDone();
        }
        break;
      case 'done':
        return;
    }
    // 0x79c6e: the wind's clock runs at three quarters of the time.
    this.wind += 0.75 * dt;
    this.draw();
  }

  private enter(phase: Phase): void {
    this.phase = phase;
    this.clock = 0;
  }

  private draw(): void {
    if (this.publisher.visible) {
      // The pictures stay as they were when the screen was left.
      if (this.phase === 'publisher') this.drawPublisher(this.clock);
      this.white.alpha = this.phase === 'publisherOut' ? clamp(this.clock) : 0;
      return;
    }
    const blowing = this.wind > 0 && this.wind < 1;
    this.strips.forEach((strip, i) => {
      const [near, far] = [studioWindV(this.wind, SWG_WIND_ROWS[i]![4]), studioWindV(this.wind, SWG_WIND_ROWS[i + 1]![4])];
      strip.visible = blowing && !(near >= 1 && far >= 1) && !(near <= 0 && far <= 0);
      if (strip.visible) strip.geometry.uvs = new Float32Array([0, clamp(near), 1, clamp(near), 0, clamp(far), 1, clamp(far)]);
    });
    // 0x79e1e: it comes out of white and goes back into it.
    this.white.alpha = this.phase === 'studioIn' ? clamp(1 - this.clock) : this.phase === 'studioOut' || this.phase === 'done' ? clamp(this.clock) : 0;
  }

  private drawPublisher(clock: number): void {
    const fades = publisherFades(clock);
    this.pictures.published.alpha = fades.published;
    this.pictures.seal.alpha = fades.seal;
    this.pictures.logo.alpha = fades.logo;
    const sweeps = publisherSweeps(clock);
    // The second pair uses the last two bars even while the first pair is over.
    const first = clock > 3.2 && clock < 3.7 ? 0 : 2;
    this.sweeps.forEach((bar) => (bar.tilt.visible = false));
    sweeps.forEach((sweep, i) => {
      const { tilt, arm, bar } = this.sweeps[first + i]!;
      tilt.visible = true;
      tilt.scale.set(1, sweep.flat);
      arm.angle = sweep.turn;
      bar.position.set(-sweep.reach, 0);
      bar.alpha = sweep.alpha;
    });
    const glint = publisherGlint(clock);
    this.glow.visible = this.star.visible = glint !== null;
    if (glint) {
      this.glow.position.set(glint.x, glint.y);
      this.glow.alpha = glint.glow;
      this.star.position.set(glint.x, glint.y);
      this.star.angle = glint.turn;
      this.star.alpha = glint.star;
    }
  }

  static async create(app: Application, textures: TextureStore, audio: AudioPlayer, onDone: () => void): Promise<Opening> {
    await textures.load([...PUBLISHER_SURFACES, ...STUDIO_SURFACES]);
    audio.preload(OPENING_SOUNDS);
    const opening = new Opening(textures, audio, () => {
      app.ticker.remove(tick);
      onDone();
    });
    const tick = (ticker: { deltaMS: number }): void => opening.update(ticker.deltaMS / 1000);
    app.stage.addChild(opening.root);
    app.ticker.add(tick);
    return opening;
  }
}
