import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { Luggage } from '../sim/simulation';

// The luggage conveyor. Its images and their places come from its descriptor; its draw routine
// (0x56dac), with the parcels riding the belt, has not been read yet, so the belt simply runs
// while a plane is being loaded.

export function luggageSurfaceIds(luggage: Luggage): string[] {
  const { surfaces, animation } = luggage.descriptor;
  const frames = Array.from({ length: animation.frames }, (_, i) => animation.resource.replace('%d', String(i)));
  return [surfaces.back, surfaces.spot, ...frames];
}

export class LuggageView extends Container {
  private readonly belt: Sprite;
  private readonly frames: string[];
  private time = 0;

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
    this.addChild(spot, textures.sprite(descriptor.surfaces.back), this.belt);
  }

  update(dt: number): void {
    if (this.luggage.use !== 'loading') return;
    this.time += dt;
    const frame = Math.floor(this.time * this.luggage.descriptor.animation.speed) % this.frames.length;
    this.belt.texture = this.textures.texture(this.frames[frame]!);
  }
}
