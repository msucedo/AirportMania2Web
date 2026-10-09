import { Container, Sprite } from 'pixi.js';
import { PERSPECTIVES, type Perspective, type PlaneDescriptor } from '../data/planes';
import type { TextureStore } from '../engine/textures';

const ENERGY_FRAMES = 8;
const NEED_ICONS = 9;
const BUBBLE = ['INDICATORS.THOUGHT_A', 'INDICATORS.THOUGHT_B', 'INDICATORS.THOUGHT_C', 'INDICATORS.THOUGHT_D'];

/** Surface ids a plane needs, for all three perspectives. */
export function planeSurfaceIds(plane: PlaneDescriptor, pontoons = false): string[] {
  const ids = [plane.shadow];
  if (pontoons) for (const part of plane.pantoons) if (part) ids.push(part.resource);
  for (const p of PERSPECTIVES) {
    ids.push(`${plane.body.color}.${p}`, `${plane.body.front}.${p}`, `${plane.body.remark}.${p}`, `${plane.eyes.opened}.${p}`, `${plane.eyes.closed}.${p}`);
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

/** Energy bar frame: empty, one red, yellows, greens. The thresholds are an approximation. */
export function energyFrame(energy: number): number {
  if (energy >= 0.9) return 7;
  if (energy >= 0.6) return 6;
  if (energy >= 0.5) return 5;
  if (energy >= 0.4) return 4;
  if (energy >= 0.3) return 2;
  if (energy >= 0) return 1;
  return 0;
}

interface Pose {
  root: Container;
  remark: Sprite;
  color: Sprite;
  opened: Sprite | null;
  closed: Sprite | null;
}

/**
 * A plane drawn from its layers: shadow on the ground, selection highlight, tinted colour layer,
 * line art and eyes, in the three perspectives of the descriptor. The layer order is still the
 * one assumed here; the original draw routine (0x89e0) has not been read in full.
 */
export class PlaneView extends Container {
  private readonly shadow: Sprite;
  private readonly body = new Container();
  private readonly poses: Pose[] = [];
  private readonly energy: Sprite;
  private readonly bubble = new Container();
  private readonly needIcon: Sprite;
  private blink = 2 + Math.random() * 3;
  private closedFor = 0;

  constructor(
    private readonly textures: TextureStore,
    private readonly plane: PlaneDescriptor,
    tint: number,
    /** Water stages draw the plane's pontoons, placed by the descriptor for each perspective. */
    pontoons = false,
  ) {
    super();
    this.shadow = textures.sprite(plane.shadow);
    this.addChild(this.shadow, this.body);

    for (const p of PERSPECTIVES) {
      const root = new Container();
      root.y = plane.body.offsetY;
      const remark = textures.sprite(`${plane.body.remark}.${p}`);
      const color = textures.sprite(`${plane.body.color}.${p}`);
      color.tint = tint;
      const pontoon = pontoons ? plane.pantoons[p] : undefined;
      if (pontoon) {
        const float = textures.sprite(pontoon.resource);
        float.position.set(pontoon.x, pontoon.y);
        root.addChild(float);
      }
      root.addChild(remark, color, textures.sprite(`${plane.body.front}.${p}`));

      const placement = plane.eyes.placement[p];
      let opened: Sprite | null = null;
      let closed: Sprite | null = null;
      if (placement?.visible) {
        opened = textures.sprite(`${plane.eyes.opened}.${p}`);
        closed = textures.sprite(`${plane.eyes.closed}.${p}`);
        opened.position.set(placement.x, placement.y);
        closed.position.set(placement.x, placement.y);
        root.addChild(opened, closed);
      }
      this.poses.push({ root, remark, color, opened, closed });
      this.body.addChild(root);
    }

    this.energy = textures.sprite('INDICATORS.ENERGY.7');
    this.energy.y = plane.body.energyBarOffsetY;
    this.addChild(this.energy);

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

  /**
   * @param altitude height above the ground; the shadow stays down while the body rises
   * @param energy   energy to show on the bar, or null to hide it
   * @param need     need code to show in the thought bubble, or null to hide it
   */
  update(dt: number, heading: number, altitude: number, scale: number, selected: boolean, energy: number | null, need: number | null): void {
    const { perspective, flipped } = orientationFor(heading);
    const eyesShut = this.updateBlink(dt);
    this.poses.forEach((pose, p) => {
      pose.root.visible = p === perspective;
      pose.remark.visible = selected;
      if (pose.opened) pose.opened.visible = !eyesShut;
      if (pose.closed) pose.closed.visible = eyesShut;
    });
    this.body.scale.set(flipped ? -scale : scale, scale);
    this.body.y = -altitude;
    this.shadow.scale.set(scale);
    // The shadow fades as the plane climbs.
    this.shadow.alpha = Math.max(0.25, 1 - altitude / 700);

    this.energy.visible = energy !== null;
    if (energy !== null) {
      this.energy.texture = this.textures.texture(`INDICATORS.ENERGY.${energyFrame(energy)}`);
      this.energy.y = -altitude + this.plane.body.energyBarOffsetY * scale;
    }

    this.bubble.visible = need !== null && need < NEED_ICONS;
    if (this.bubble.visible) {
      this.needIcon.texture = this.textures.texture(`INDICATORS.ICONS.${need}`);
      this.bubble.y = -altitude;
      this.bubble.scale.set(scale);
    }
  }

  private updateBlink(dt: number): boolean {
    if (this.closedFor > 0) {
      this.closedFor -= dt;
      return this.closedFor > 0;
    }
    this.blink -= dt;
    if (this.blink <= 0) {
      this.blink = 2 + Math.random() * 4;
      this.closedFor = 0.12;
      return true;
    }
    return false;
  }
}
