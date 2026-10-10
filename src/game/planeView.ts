import { Container, Sprite } from 'pixi.js';
import { PERSPECTIVES, type Perspective, type PlaneDescriptor } from '../data/planes';
import type { TextureStore } from '../engine/textures';
import type { PaletteColor } from './palette';

const ENERGY_FRAMES = 8;
const NEED_ICONS = 9;
const MOUTHS = 18;
const GEAR_FRAMES = 3;
/** The thought cloud and its trail, largest first, and where each sits from the cloud (0x9950). */
const THOUGHT = ['INDICATORS.THOUGHT_A', 'INDICATORS.THOUGHT_B', 'INDICATORS.THOUGHT_C', 'INDICATORS.THOUGHT_D'];
const THOUGHT_OFFSETS: readonly (readonly [number, number])[] = [[0, 0], [-7, 15], [-13, 19], [-19, 18]];
/** Images for the thought cloud, one per kind of place (`INDICATORS.THOUGHT_ICONS.<n>`). */
const THOUGHT_ICONS = 16;
const SPEECH = ['INDICATORS.GLOBE', 'INDICATORS.GLOBE_NAG'];

/**
 * Which way a plane's balloons hang (`plane+0x260`, taken from the place it is at): the balloon
 * is mirrored to the left for 0 and 2 and hangs below the plane for 2 and 3. A plane that is
 * nowhere yet uses 3.
 */
export type BalloonCorner = 0 | 1 | 2 | 3;

/** Where the speech balloon goes from the plane's position (0x9764), and how it is mirrored. */
export function speechPlace(bubble: { x: number; y: number }, bodyOffsetY: number, perspective: number, corner: BalloonCorner): { x: number; y: number; flipX: boolean; flipY: boolean } {
  const left = corner === 0 || corner === 2;
  const below = corner >= 2;
  const reach = bubble.x + (perspective === 0 ? 5 : 0) - (left ? 10 : 0);
  return { x: left ? -reach : reach, y: (below ? bubble.y : -5 - bubble.y) - (28 - bodyOffsetY), flipX: left, flipY: below };
}

/** Where the thought cloud goes (0x99b4): 50 px to one side, 80 above or 15 below. */
export function thoughtPlace(corner: BalloonCorner): { x: number; y: number; flipX: boolean; flipY: boolean } {
  const left = corner === 0 || corner === 2;
  const below = corner >= 2;
  return { x: left ? -50 : 50, y: below ? 15 : -80, flipX: left, flipY: below };
}

/** Mouth animations (`0x13d798`, `0x13d848`, `0x13d7f0`): frames per second and the mouth shown on each frame. */
const MOUTH_SEQUENCES = {
  talk: { fps: 16, frames: [9, 10, 11, 7, 8, 7, 10, 9, 10, 11, 7, 8, 7, 10] },
  cheer: { fps: 14, frames: [5, 6, 6, 6, 6, 6, 6, 6, 6, 5] },
  whistle: { fps: 6, frames: [12, 13, 14, 15, 16, 17] },
} as const;

/** Surface ids a plane needs, for all three perspectives. */
/** The icon a plane shows for a special passenger (0x4cc8). */
export const PASSENGER_ICONS = { PRESIDENT: 'PRESIDENT', PREGNANT: 'PREGNANT', ORGAN: 'ORGANBAG' } as const;
export type Passenger = keyof typeof PASSENGER_ICONS;

export function planeSurfaceIds(plane: PlaneDescriptor, female: boolean, pontoons = false, passenger: Passenger | null = null, dirty = false): string[] {
  const ids = [plane.shadow, 'PLANE.EYELASH', 'PLANE.EYELASH_REMARK'];
  if (passenger) ids.push(PASSENGER_ICONS[passenger]);
  const suffix = female ? '_FEMALE' : '';
  for (const side of ['LEFT', 'RIGHT']) ids.push(`PLANE.${side}_EYEBROW${suffix}`, `PLANE.${side}_EYEBROW${suffix}_REMARK`);
  for (let i = 0; i < MOUTHS; i++) ids.push(`PLANE.MOUTH.${i}`);
  for (const p of PERSPECTIVES) {
    if (dirty) ids.push(`${plane.body.dirt}.${p}`);
    ids.push(`${plane.body.color}.${p}`, `${plane.body.front}.${p}`, `${plane.body.remark}.${p}`, `${plane.eyes.opened}.${p}`, `${plane.eyes.closed}.${p}`);
    const attached = pontoons ? plane.pantoons[p] : plane.rail?.parts[p];
    if (attached) {
      ids.push(attached.remarkResource);
      if (pontoons) ids.push(attached.resource);
      else for (let i = 0; i < GEAR_FRAMES; i++) ids.push(`${attached.resource}.${i}`);
    }
    for (const propeller of plane.propellers[p] ?? []) ids.push(`PLANE.PROPELLERS.TYPE${propeller.type}.0`, `PLANE.PROPELLERS.TYPE${propeller.type}.1`);
  }
  for (let i = 0; i < ENERGY_FRAMES; i++) ids.push(`INDICATORS.ENERGY.${i}`);
  for (let i = 0; i < NEED_ICONS; i++) ids.push(`INDICATORS.ICONS.${i}`);
  for (let i = 0; i < THOUGHT_ICONS; i++) ids.push(`INDICATORS.THOUGHT_ICONS.${i}`);
  return [...ids, ...THOUGHT, ...SPEECH];
}

/**
 * `Plane::setOrientation` (0x5c8c): which of the three drawings to use for a heading, and whether
 * to mirror it. Headings are in degrees with 0 facing left (the way the art is drawn), 90 towards
 * the viewer, 180 right and 270 away.
 */
export function orientationFor(heading: number): { perspective: Perspective; flipped: boolean } {
  const angle = ((heading % 360) + 360) % 360;
  let perspective: Perspective;
  if (angle <= 25 || angle >= 335 || (angle > 155 && angle < 205)) perspective = 0;
  else if (angle > 25 && angle < 155) perspective = 1;
  else perspective = 2;
  return { perspective, flipped: angle > 90 && angle < 270 };
}

/**
 * Energy bar (end of 0x89e0): eight frames over the 0..1 range. In the lower half of a segment
 * the frame below is drawn solid and the current one flickers over it, more slowly as it runs out.
 */
export function energyBar(energy: number): { solid: number; flicker: number | null; flickerAlpha: number } | null {
  const value = Math.min(7.99, energy * ENERGY_FRAMES);
  if (!(value > 0)) return null;
  const frame = Math.floor(value);
  const fraction = value - frame;
  if (fraction >= 0.5) return { solid: frame, flicker: null, flickerAlpha: 0 };
  return { solid: Math.max(0, frame - 1), flicker: frame, flickerAlpha: triangle(fraction * 14) };
}

/** Mood from energy (0x869a): which mouth to show and how far the eyebrows tilt, in degrees. */
export function moodFor(energy: number): { mouth: number; browAngle: number } {
  if (energy < 0.3) return { mouth: 4, browAngle: 25 };
  if (energy < 0.5) return { mouth: 2, browAngle: 10 };
  if (energy < 0.7) return { mouth: 1, browAngle: 0 };
  return { mouth: 0, browAngle: 0 };
}

/**
 * The flash over the speech balloon just after the plane speaks (0x9892): with `left` seconds of
 * the two the balloon stays up, a copy shrinks from one and a half times its size while it fades.
 * Null outside that half second.
 */
export function nagFlash(left: number): { scale: number; opacity: number } | null {
  if (left >= 1.8 || left <= 1.3) return null;
  return { scale: left - 0.3, opacity: (left - 1.3) * 2 };
}

/** How much of the old colour shows `left` seconds before a repaint settles (0x90d2). */
export function repaintMix(left: number): number {
  return left <= 0 ? 0 : triangle(left * 7);
}

/** 0 → 1 → 0 with period 2. */
function triangle(t: number): number {
  const phase = t - 2 * Math.floor(t / 2);
  return phase > 1 ? 2 - phase : phase;
}

/** A value that slides between 0 and 1 at a fixed rate, like the engine's small toggles (0xa0bc). */
function slide(value: number, on: boolean, rate: number, dt: number): number {
  return on ? Math.min(1, value + rate * dt) : Math.max(0, value - rate * dt);
}

interface Brow {
  holder: Container;
  sprite: Sprite;
  /** +1 for the left eyebrow, −1 for the right one, which tilts the other way. */
  side: number;
}

interface Pose {
  root: Container;
  remarks: Container;
  remarkSprites: Sprite[];
  brows: Brow[];
  propellers: { sprite: Sprite; frames: [string, string]; number: number }[];
  gear: Sprite | null;
  gearRemark: Sprite | null;
  gearFrames: string[];
  mouth: Sprite | null;
  opened: Sprite | null;
  closed: Sprite | null;
  eyeX: number;
  /** The coloured body, and over it the colour it had before a repaint while that fades. */
  color: Sprite | null;
  oldColor: Sprite | null;
  colorId: string;
}

export interface PlaneLook {
  heading: number;
  /** Height above the ground; the shadow stays down while the body rises. */
  altitude: number;
  scale: number;
  selected: boolean;
  energy: number;
  /** What the plane asks for while it waits with nothing to do, shown in its speech balloon; null for nothing. */
  need: number | null;
  /** Icon of where it goes next, shown in its thought cloud while orders are queued; null for none. */
  thought: number | null;
  corner: BalloonCorner;
  /** Special passenger still aboard, shown beside the energy bar. */
  passenger: Passenger | null;
  /** Still needing its wash. */
  dirty?: boolean;
  /** Waiting with nothing to do: the eyes turn aside. */
  idle: boolean;
  gearDown: boolean;
}

/**
 * A plane drawn from its parts in the order of the original routine (0x89e0): shadow, selection
 * highlight, rear propellers, landing gear, coloured body, line art, eyebrows, eyelashes, mouth,
 * eyes, front propellers and pontoons, then the balloons (0x9740) and the energy bar.
 */
export class PlaneView extends Container {
  private readonly shadow: Sprite;
  private readonly body = new Container();
  private readonly poses: Pose[] = [];
  private readonly dirt: Sprite[] = [];
  private readonly energySolid: Sprite;
  private readonly energyFlicker: Sprite;
  private passengerIcon: Sprite | null = null;
  private readonly speech: Sprite;
  private readonly nag: Sprite;
  private readonly needIcon: Sprite;
  private readonly puffs: Sprite[] = [];
  private readonly thoughtIcon: Sprite;
  private speechFade = 0;
  private thoughtFade = 0;
  private shownNeed = 0;
  private shownThought = 0;
  private spoken: { need: number; left: number } | null = null;
  /** Runs from 1 to 0 in the second after a repaint (`plane+0x350`). */
  private repainted = 0;

  private time = 0;
  /** Seconds until the next blink; the eyes are shut for its last 0.1 s (0x6e94). */
  private blink = 5 + Math.random() * 5;
  private look = 0;
  private lookTimer = 0;
  private browAngle = 0;
  private browRaise = 0;
  private browRaising = false;
  private gear: number;
  private gearFrame = 0;
  private selectedFor = 0;
  private sequence: { fps: number; frames: readonly number[] } | null = null;
  private sequenceAt = 0;
  private lastEnergy: number | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private readonly textures: TextureStore,
    private readonly plane: PlaneDescriptor,
    private color: PaletteColor,
    female: boolean,
    /** Water stages draw the plane's pontoons instead of its landing gear. */
    pontoons = false,
    /** The plane arrives needing a wash: its dirt is drawn over the body until it has had one (0x9220). */
    dirty = false,
  ) {
    super();
    this.shadow = textures.sprite(plane.shadow);
    this.addChild(this.shadow, this.body);
    this.gear = 1;
    const browSuffix = female ? '_FEMALE' : '';

    for (const p of PERSPECTIVES) {
      const root = new Container();
      root.y = plane.body.offsetY;
      const pose: Pose = { root, remarks: new Container(), remarkSprites: [], brows: [], propellers: [], gear: null, gearRemark: null, gearFrames: [], mouth: null, opened: null, closed: null, eyeX: 0, color: null, oldColor: null, colorId: `${plane.body.color}.${p}` };
      const remark = (sprite: Sprite): Sprite => {
        pose.remarkSprites.push(sprite);
        return sprite;
      };

      const brows = (ids: [string, string], isRemark: boolean): Container[] => {
        const placement = plane.eyebrows[p];
        if (!placement) return [];
        return [placement.left, placement.right].map((at, i) => {
          const holder = new Container();
          holder.position.set(at.x, at.y);
          if (placement.flip) holder.scale.x = -1;
          const sprite = textures.sprite(ids[i]!);
          if (isRemark) remark(sprite);
          holder.addChild(sprite);
          pose.brows.push({ holder, sprite, side: i === 0 ? 1 : -1 });
          return holder;
        });
      };
      const lashes = (id: string, isRemark: boolean): Sprite[] => {
        const placement = female ? plane.eyelashes[p] : undefined;
        if (!placement) return [];
        return [placement.left, placement.right].map((at, i) => {
          const sprite = textures.sprite(id);
          sprite.position.set(at.x, at.y);
          if (i === 1) sprite.scale.x = -1;
          return isRemark ? remark(sprite) : sprite;
        });
      };
      const propellers = (back: boolean): Sprite[] =>
        (plane.propellers[p] ?? [])
          .filter((propeller) => propeller.back === back)
          .map((propeller) => {
            const frames: [string, string] = [`PLANE.PROPELLERS.TYPE${propeller.type}.0`, `PLANE.PROPELLERS.TYPE${propeller.type}.1`];
            const sprite = textures.sprite(frames[0]);
            sprite.position.set(propeller.x, propeller.y);
            pose.propellers.push({ sprite, frames, number: propeller.number });
            return sprite;
          });

      // Selection highlight: every part's outline, drawn under the plane.
      pose.remarks.addChild(remark(textures.sprite(`${plane.body.remark}.${p}`)));
      for (const part of brows([`PLANE.LEFT_EYEBROW${browSuffix}_REMARK`, `PLANE.RIGHT_EYEBROW${browSuffix}_REMARK`], true)) pose.remarks.addChild(part);
      for (const lash of lashes('PLANE.EYELASH_REMARK', true)) pose.remarks.addChild(lash);
      const attached = pontoons ? plane.pantoons[p] : plane.rail?.parts[p];
      if (attached) {
        pose.gearRemark = remark(textures.sprite(attached.remarkResource));
        pose.gearRemark.position.set(attached.x, attached.y);
        pose.remarks.addChild(pose.gearRemark);
      }
      root.addChild(pose.remarks);

      for (const part of propellers(true)) root.addChild(part);
      if (attached && !pontoons) {
        pose.gearFrames = Array.from({ length: GEAR_FRAMES }, (_, i) => `${attached.resource}.${i}`);
        pose.gear = textures.sprite(pose.gearFrames[0]!);
        pose.gear.position.set(attached.x, attached.y);
        root.addChild(pose.gear);
      }

      const browIds: [string, string] = [`PLANE.LEFT_EYEBROW${browSuffix}`, `PLANE.RIGHT_EYEBROW${browSuffix}`];
      // Seen from behind, eyelashes (and for some planes the eyebrows) stick out from under the body.
      const back = p === 2;
      const browsBehind = back && plane.eyebrowsBehindWhenBack;
      if (back) for (const lash of lashes('PLANE.EYELASH', false)) root.addChild(lash);
      if (browsBehind) for (const part of brows(browIds, false)) root.addChild(part);

      const color = new Sprite(textures.gradient(`${plane.body.color}.${p}`, this.color.main, this.color.shade));
      color.anchor.copyFrom(textures.sprite(`${plane.body.color}.${p}`).anchor);
      const oldColor = new Sprite(color.texture);
      oldColor.anchor.copyFrom(color.anchor);
      oldColor.visible = false;
      pose.color = color;
      pose.oldColor = oldColor;
      root.addChild(color, oldColor, textures.sprite(`${plane.body.front}.${p}`));
      if (dirty) {
        const dirt = textures.sprite(`${plane.body.dirt}.${p}`);
        this.dirt.push(dirt);
        root.addChild(dirt);
      }

      if (!browsBehind) for (const part of brows(browIds, false)) root.addChild(part);
      if (!back) for (const lash of lashes('PLANE.EYELASH', false)) root.addChild(lash);

      const mouth = plane.mouth[p];
      if (mouth?.visible) {
        pose.mouth = textures.sprite('PLANE.MOUTH.0');
        pose.mouth.position.set(mouth.x, mouth.y);
        root.addChild(pose.mouth);
      }
      const eyes = plane.eyes.placement[p];
      if (eyes?.visible) {
        pose.opened = textures.sprite(`${plane.eyes.opened}.${p}`);
        pose.closed = textures.sprite(`${plane.eyes.closed}.${p}`);
        pose.opened.y = pose.closed.y = eyes.y;
        pose.eyeX = eyes.x;
        root.addChild(pose.opened, pose.closed);
      }
      for (const part of propellers(false)) root.addChild(part);
      if (attached && pontoons) {
        const float = textures.sprite(attached.resource);
        float.position.set(attached.x, attached.y);
        root.addChild(float);
      }

      this.poses.push(pose);
      this.body.addChild(root);
    }

    this.energySolid = textures.sprite('INDICATORS.ENERGY.7');
    this.energyFlicker = textures.sprite('INDICATORS.ENERGY.7');
    this.addChild(this.energySolid, this.energyFlicker);

    // Speech balloon with what the plane asks for, and thought cloud with where it goes next.
    this.speech = textures.sprite(SPEECH[0]!);
    this.nag = textures.sprite(SPEECH[1]!);
    this.nag.visible = false;
    this.needIcon = textures.sprite('INDICATORS.ICONS.0');
    this.thoughtIcon = textures.sprite('INDICATORS.THOUGHT_ICONS.0');
    // Drawn smallest first, so the cloud ends on top.
    for (const id of [...THOUGHT].reverse()) this.puffs.push(textures.sprite(id));
    this.addChild(this.speech, this.nag, this.needIcon, ...this.puffs, this.thoughtIcon);
  }

  /**
   * The plane says what it needs (0x5bd4): the icon shows in its speech balloon for two seconds
   * while it talks.
   */
  speak(need: number): void {
    this.spoken = { need, left: 2 };
    this.talk();
  }

  /**
   * The plane takes a new colour (0x5a5c). For a second it flickers between the old one and
   * the new, three and a half times, ending on the new (0x90d2).
   */
  repaint(color: PaletteColor): void {
    for (const pose of this.poses) {
      if (!pose.color || !pose.oldColor) continue;
      pose.oldColor.texture = pose.color.texture;
      pose.color.texture = this.textures.gradient(pose.colorId, color.main, color.shade);
    }
    this.color = color;
    this.repainted = 1;
  }

  /** The plane speaks: its mouth runs the talking animation and the eyes turn aside (0x5bd4). */
  talk(): void {
    this.sequence = MOUTH_SEQUENCES.talk;
    this.sequenceAt = 0;
    this.lookTimer = 1;
  }

  /** No mouth animation is running (`plane+0x40` clear). */
  get mouthFree(): boolean {
    return this.sequence === null;
  }

  /** The plane whistles while it fills up (0x5fd0). */
  whistle(): void {
    this.sequence = MOUTH_SEQUENCES.whistle;
    this.sequenceAt = 0;
  }

  /** `Plane::addEnergy` (0x9b18): a cheer, raised eyebrows, a glance aside and a blink soon after. */
  private cheer(): void {
    this.sequence = MOUTH_SEQUENCES.cheer;
    this.sequenceAt = 0;
    this.browRaising = true;
    this.lookTimer = 1;
    this.blink = Math.random() * 0.5;
  }

  update(dt: number, look: PlaneLook): void {
    const { altitude, scale, energy } = look;
    this.time += dt;
    if (this.lastEnergy !== null && energy > this.lastEnergy + 0.01) this.cheer();
    this.lastEnergy = energy;

    for (const sprite of this.dirt) sprite.visible = look.dirty === true;
    if (this.repainted > 0) this.repainted = Math.max(0, this.repainted - dt);
    for (const pose of this.poses) {
      if (!pose.oldColor) continue;
      pose.oldColor.visible = this.repainted > 0;
      pose.oldColor.alpha = repaintMix(this.repainted);
    }

    this.blink -= dt;
    if (this.blink < 0) this.blink = 5 + Math.random() * 5;
    const eyesShut = this.blink <= 0.1;

    this.lookTimer = Math.max(0, this.lookTimer - dt);
    this.look = slide(this.look, look.idle || this.lookTimer > 0, 4, dt);

    // Eyebrows (0x8768–0x88f4): a raise that goes up and comes back, and a tilt that follows the
    // mood at 50° per second.
    this.browRaise = slide(this.browRaise, this.browRaising, 3, dt);
    if (this.browRaise >= 1) this.browRaising = false;
    const mood = moodFor(energy);
    const lift = Math.pow(this.browRaise, 0.7);
    const targetAngle = this.browRaise > 0 ? mood.browAngle * Math.min(0.5, lift) : mood.browAngle;
    const step = 50 * dt;
    this.browAngle += Math.max(-step, Math.min(step, targetAngle - this.browAngle));
    const browY = this.browRaise > 0 ? (lift < 0.5 ? -6 * lift : -3) : 0;

    let mouth: number = mood.mouth;
    if (this.sequence) {
      const frame = this.sequence.frames[Math.floor(this.sequenceAt)];
      if (frame === undefined) this.sequence = null;
      else {
        mouth = frame;
        this.sequenceAt += this.sequence.fps * dt;
      }
    }

    // Landing gear (0x6bc6): folds away in the air and rolls with the distance covered on the ground.
    this.gear = this.plane.rail?.alwaysDown ? 1 : slide(this.gear, look.gearDown, 4, dt);
    if (altitude < 1) {
      this.gearFrame = (this.gearFrame + Math.hypot(this.x - this.lastX, this.y - this.lastY) * 0.2) % GEAR_FRAMES;
    }
    this.lastX = this.x;
    this.lastY = this.y;

    // Selection highlight: the plane's colour pulsing towards white (0x8cc0).
    this.selectedFor = look.selected ? this.selectedFor + dt : 0;
    const pulse = Math.max(0, Math.min(1, Math.sin(this.selectedFor * 12) + 0.5));
    const mix = (shift: number): number => {
      const c = (this.color.main >> shift) & 0xff;
      return Math.round(c + (255 - c) * pulse);
    };
    const remarkTint = (mix(16) << 16) | (mix(8) << 8) | mix(0);
    const propellerFrame = Math.floor(this.time * 15);

    const { perspective, flipped } = orientationFor(look.heading);
    this.poses.forEach((pose, p) => {
      pose.root.visible = p === perspective;
      if (!pose.root.visible) return;
      pose.remarks.visible = look.selected;
      for (const sprite of pose.remarkSprites) sprite.tint = remarkTint;
      for (const brow of pose.brows) {
        brow.holder.rotation = (brow.side * this.browAngle * Math.PI) / 180;
        brow.sprite.y = browY;
      }
      for (const propeller of pose.propellers) {
        propeller.sprite.texture = this.textures.texture(propeller.frames[(propellerFrame + propeller.number) % 2]!);
      }
      const gearShown = this.gear > 0;
      if (pose.gear) {
        pose.gear.visible = gearShown;
        pose.gear.scale.y = this.gear * (2 - this.gear);
        pose.gear.texture = this.textures.texture(pose.gearFrames[Math.floor(this.gearFrame)]!);
        if (pose.gearRemark) {
          pose.gearRemark.visible = gearShown;
          pose.gearRemark.scale.y = pose.gear.scale.y;
        }
      }
      if (pose.mouth) pose.mouth.texture = this.textures.texture(`PLANE.MOUTH.${mouth}`);
      if (pose.opened && pose.closed) {
        pose.opened.visible = !eyesShut;
        pose.closed.visible = eyesShut;
        pose.opened.x = pose.closed.x = pose.eyeX + this.look * this.plane.eyes.movement;
      }
    });
    this.body.scale.set(flipped ? -scale : scale, scale);
    this.body.y = -altitude;
    // The shadow is gone 50 px up (0x8c06).
    this.shadow.alpha = Math.max(0, Math.min(1, 1 - altitude / 50));

    const bar = energyBar(energy);
    this.energySolid.visible = bar !== null;
    this.energyFlicker.visible = bar !== null && bar.flicker !== null;
    // A special passenger's icon sits 36 px left of the bar's place, and the bar moves 16 px
    // right to make room (0x94bc). The icon throbs for a quarter of a second every two.
    const barY = -altitude + this.plane.body.energyBarOffsetY * scale;
    if (look.passenger && !this.passengerIcon) {
      this.passengerIcon = this.textures.sprite(PASSENGER_ICONS[look.passenger]);
      this.addChild(this.passengerIcon);
    }
    if (this.passengerIcon) {
      this.passengerIcon.visible = look.passenger !== null;
      this.passengerIcon.position.set(-36, barY);
      const beat = (this.time % 2) - 1.75;
      const swell = beat > 0 ? (beat * 2 > 0.25 ? 0.5 - beat * 2 : beat * 2) : 0;
      this.passengerIcon.scale.set(scale * (1 + swell));
    }
    this.energySolid.x = this.energyFlicker.x = look.passenger ? 16 : 0;
    if (bar) {
      const y = barY;
      this.energySolid.texture = this.textures.texture(`INDICATORS.ENERGY.${bar.solid}`);
      this.energySolid.y = y;
      if (bar.flicker !== null) {
        this.energyFlicker.texture = this.textures.texture(`INDICATORS.ENERGY.${bar.flicker}`);
        this.energyFlicker.alpha = bar.flickerAlpha;
        this.energyFlicker.y = y;
      }
    }

    // Both balloons fade at 4 per second and show once past a quarter (0x9758, 0x9922).
    if (this.spoken && (this.spoken.left -= dt) <= 0) this.spoken = null;
    const need = this.spoken?.need ?? look.need;
    const asks = need !== null && need < NEED_ICONS;
    if (asks) this.shownNeed = need;
    this.speechFade = slide(this.speechFade, asks, 4, dt);
    const speechAlpha = (this.speechFade - 0.25) / 0.75;
    this.speech.visible = this.needIcon.visible = speechAlpha > 0;
    if (speechAlpha > 0) {
      const place = speechPlace(this.plane.bubble, this.plane.body.offsetY, perspective, look.corner);
      this.speech.position.set(place.x, place.y - altitude);
      this.speech.scale.set(place.flipX ? -1 : 1, place.flipY ? -1 : 1);
      this.needIcon.position.copyFrom(this.speech.position);
      this.needIcon.texture = this.textures.texture(`INDICATORS.ICONS.${this.shownNeed}`);
      this.speech.alpha = this.needIcon.alpha = speechAlpha;
    }
    const flash = speechAlpha > 0 && this.spoken ? nagFlash(this.spoken.left) : null;
    this.nag.visible = flash !== null;
    if (flash) {
      this.nag.position.copyFrom(this.speech.position);
      this.nag.scale.set(this.speech.scale.x * flash.scale, this.speech.scale.y * flash.scale);
      this.nag.alpha = flash.opacity * speechAlpha;
    }

    const thinks = look.thought !== null;
    if (thinks) this.shownThought = look.thought!;
    this.thoughtFade = slide(this.thoughtFade, thinks, 4, dt);
    const showing = this.thoughtFade > 0.25;
    const cloud = thoughtPlace(look.corner);
    // The trail appears puff by puff towards the cloud, then the icon inside it.
    this.puffs.forEach((puff, i) => {
      const alpha = Math.min(1, this.thoughtFade * 5 - (i + 1));
      puff.visible = showing && alpha > 0;
      const [x, y] = THOUGHT_OFFSETS[THOUGHT_OFFSETS.length - 1 - i]!;
      puff.position.set(cloud.x + (cloud.flipX ? -x : x), cloud.y - altitude + (cloud.flipY ? -y : y));
      puff.scale.set(cloud.flipX ? -1 : 1, cloud.flipY ? -1 : 1);
      puff.alpha = Math.max(0, alpha);
    });
    const iconAlpha = this.thoughtFade * 4 - 3;
    this.thoughtIcon.visible = showing && iconAlpha > 0;
    this.thoughtIcon.position.set(cloud.x, cloud.y - altitude);
    this.thoughtIcon.texture = this.textures.texture(`INDICATORS.THOUGHT_ICONS.${this.shownThought}`);
    this.thoughtIcon.alpha = Math.max(0, iconAlpha);
  }
}
