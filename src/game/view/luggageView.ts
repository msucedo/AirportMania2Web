import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { Luggage } from '../sim/simulation';

// The luggage conveyor (draw 0x56dac). From the back: its spot on the ground, its back image,
// the belt, a parcel thrown along it every second of loading, its front image, and a pile of
// marks, one for each second of loading left. Images and places are its descriptor's.

export function luggageSurfaceIds(luggage: Luggage): string[] {
  const { surfaces, animation } = luggage.descriptor;
  const frames = Array.from({ length: animation.frames }, (_, i) => animation.resource.replace('%d', String(i)));
  return [surfaces.back, surfaces.front, surfaces.spot, 'LUGGAGES.PARCEL', 'LUGGAGES.PARCEL_MARK', ...frames];
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * The parcel `progress` seconds into the loading, from the belt's place: each second one goes
 * 120 px along it (the other way when flipped), dropping over the last fifth and vanishing
 * over the last tenth, shrinking to half as it does.
 */
export function parcelPose(progress: number, flipped: boolean): { x: number; y: number; scale: number; alpha: number } {
  const t = progress - Math.floor(progress);
  const alpha = Math.min(1, (1 - t) * 10);
  const drop = Math.max(0, t - 0.8) * 20;
  return { x: flipped ? 120 * t - 100 : 100 - 120 * t, y: drop * drop, scale: 0.5 + 0.5 * alpha, alpha };
}

/** The marks for `left` seconds of loading: each 10 px above the last, the top one fading in its second's last half. */
export function parcelMarks(left: number): { y: number; alpha: number }[] {
  const marks: { y: number; alpha: number }[] = [];
  for (let rest = left, y = 0; rest > 0; rest -= 1, y -= 10) marks.push({ y, alpha: rest < 1 ? clamp(2 * rest - 1) : 1 });
  return marks;
}

export class LuggageView extends Container {
  private readonly belt: Sprite;
  private readonly frames: string[];
  private readonly parcel: Sprite;
  private readonly marks = new Container();

  constructor(
    private readonly textures: TextureStore,
    private readonly luggage: Luggage,
  ) {
    super();
    const { descriptor } = luggage;
    this.position.copyFrom(luggage.position);
    const spot = textures.sprite(descriptor.surfaces.spot);
    spot.position.set(luggage.node.x - luggage.position.x, luggage.node.y - luggage.position.y);
    this.frames = Array.from({ length: descriptor.animation.frames }, (_, i) => descriptor.animation.resource.replace('%d', String(i)));
    this.belt = textures.sprite(this.frames[0]!);
    this.belt.position.copyFrom(descriptor.animation.position);
    this.parcel = textures.sprite('LUGGAGES.PARCEL');
    this.parcel.visible = false;
    this.marks.position.copyFrom(descriptor.parcelMarks);
    this.addChild(spot, textures.sprite(descriptor.surfaces.back), this.belt, this.parcel, textures.sprite(descriptor.surfaces.front), this.marks);
  }

  update(): void {
    const { luggage } = this;
    const { animation } = luggage.descriptor;
    const loading = luggage.use === 'loading' && luggage.plane !== null;
    // The belt runs with the loading's clock and stands on its first frame otherwise.
    const frame = loading ? Math.trunc(animation.speed * luggage.progress) % this.frames.length : 0;
    this.belt.texture = this.textures.texture(this.frames[frame]!);

    this.parcel.visible = loading && animation.parcels;
    if (this.parcel.visible) {
      const pose = parcelPose(luggage.progress, animation.parcelsFlip);
      this.parcel.position.set(animation.position.x + pose.x, animation.position.y + pose.y);
      this.parcel.scale.set(pose.scale);
      this.parcel.alpha = pose.alpha;
    }

    for (const child of this.marks.removeChildren()) child.destroy();
    if (!loading) return;
    for (const mark of parcelMarks(luggage.plane!.descriptor.times.luggageLoading - luggage.progress)) {
      const sprite = this.textures.sprite('LUGGAGES.PARCEL_MARK');
      sprite.y = mark.y;
      sprite.alpha = mark.alpha;
      this.marks.addChild(sprite);
    }
  }
}
