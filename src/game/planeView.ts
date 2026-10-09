import { Container, Sprite } from 'pixi.js';
import { PERSPECTIVES, type Perspective, type PlaneDescriptor } from '../data/planes';
import type { TextureStore } from '../engine/textures';
import type { PaletteColor } from './palette';

const ENERGY_FRAMES = 8;
const NEED_ICONS = 9;
const MOUTHS = 18;
const GEAR_FRAMES = 3;
const BUBBLE = ['INDICATORS.THOUGHT_A', 'INDICATORS.THOUGHT_B', 'INDICATORS.THOUGHT_C', 'INDICATORS.THOUGHT_D'];

/** Mouth animations (`0x13d798`, `0x13d848`): frames per second and the mouth shown on each frame. */
const MOUTH_SEQUENCES = {
  talk: { fps: 16, frames: [9, 10, 11, 7, 8, 7, 10, 9, 10, 11, 7, 8, 7, 10] },
  cheer: { fps: 14, frames: [5, 6, 6, 6, 6, 6, 6, 6, 6, 5] },
} as const;

/** Surface ids a plane needs, for all three perspectives. */
export function planeSurfaceIds(plane: PlaneDescriptor, female: boolean, pontoons = false): string[] {
  const ids = [plane.shadow, 'PLANE.EYELASH', 'PLANE.EYELASH_REMARK'];
  const suffix = female ? '_FEMALE' : '';
  for (const side of ['LEFT', 'RIGHT']) ids.push(`PLANE.${side}_EYEBROW${suffix}`, `PLANE.${side}_EYEBROW${suffix}_REMARK`);
  for (let i = 0; i < MOUTHS; i++) ids.push(`PLANE.MOUTH.${i}`);
  for (const p of PERSPECTIVES) {
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
  return [...ids, ...BUBBLE];
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
}

export interface PlaneLook {
  heading: number;
  /** Height above the ground; the shadow stays down while the body rises. */
  altitude: number;
  scale: number;
  selected: boolean;
  energy: number;
  /** Need code to show in the thought bubble, or null to hide it. */
  need: number | null;
  /** Waiting with nothing to do: the eyes turn aside. */
  idle: boolean;
  gearDown: boolean;
}

/**
 * A plane drawn from its parts in the order of the original routine (0x89e0): shadow, selection
 * highlight, rear propellers, landing gear, coloured body, line art, eyebrows, eyelashes, mouth,
 * eyes, front propellers and pontoons, then the energy bar and the thought bubble.
 */
export class PlaneView extends Container {
  private readonly shadow: Sprite;
  private readonly body = new Container();
  private readonly poses: Pose[] = [];
  private readonly energySolid: Sprite;
  private readonly energyFlicker: Sprite;
  private readonly bubble = new Container();
  private readonly needIcon: Sprite;

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
    private readonly color: PaletteColor,
    female: boolean,
    /** Water stages draw the plane's pontoons instead of its landing gear. */
    pontoons = false,
  ) {
    super();
    this.shadow = textures.sprite(plane.shadow);
    this.addChild(this.shadow, this.body);
    this.gear = 1;
    const browSuffix = female ? '_FEMALE' : '';

    for (const p of PERSPECTIVES) {
      const root = new Container();
      root.y = plane.body.offsetY;
      const pose: Pose = { root, remarks: new Container(), remarkSprites: [], brows: [], propellers: [], gear: null, gearRemark: null, gearFrames: [], mouth: null, opened: null, closed: null, eyeX: 0 };
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
      root.addChild(color, textures.sprite(`${plane.body.front}.${p}`));

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

    // Thought bubble: a cloud holding the need icon, trailed by three shrinking puffs towards the
    // plane. The cloud sits at the descriptor's BubblePosition; the puff spacing is assumed.
    const { x, y } = plane.bubble;
    const cloud = textures.sprite(BUBBLE[0]!);
    cloud.position.set(x, -y);
    this.needIcon = textures.sprite('INDICATORS.ICONS.0');
    this.needIcon.position.set(x, -y);
    this.needIcon.scale.set(0.8);
    this.bubble.addChild(cloud, this.needIcon);
    BUBBLE.slice(1).forEach((id, i) => {
      const puff = textures.sprite(id);
      const t = 0.62 - i * 0.2;
      puff.position.set(x * t, -y * t);
      this.bubble.addChild(puff);
    });
    this.addChild(this.bubble);
  }

  /** The plane speaks: its mouth runs the talking animation and the eyes turn aside (0x5bd4). */
  talk(): void {
    this.sequence = MOUTH_SEQUENCES.talk;
    this.sequenceAt = 0;
    this.lookTimer = 1;
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
    if (bar) {
      const y = -altitude + this.plane.body.energyBarOffsetY * scale;
      this.energySolid.texture = this.textures.texture(`INDICATORS.ENERGY.${bar.solid}`);
      this.energySolid.y = y;
      if (bar.flicker !== null) {
        this.energyFlicker.texture = this.textures.texture(`INDICATORS.ENERGY.${bar.flicker}`);
        this.energyFlicker.alpha = bar.flickerAlpha;
        this.energyFlicker.y = y;
      }
    }

    this.bubble.visible = look.need !== null && look.need < NEED_ICONS;
    if (look.need !== null && this.bubble.visible) {
      this.needIcon.texture = this.textures.texture(`INDICATORS.ICONS.${look.need}`);
      this.bubble.y = -altitude;
      this.bubble.scale.set(scale);
    }
  }
}
