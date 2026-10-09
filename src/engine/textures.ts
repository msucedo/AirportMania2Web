import { Assets, Sprite, Texture } from 'pixi.js';
import type { Blending, Resources } from '../data/resources';

const BLEND_MODES: Record<Blending, 'normal' | 'add'> = {
  ALPHA: 'normal',
  ADDITIVE: 'add',
  // DECAL surfaces are opaque; drawing them with normal blending gives the same result.
  DECAL: 'normal',
};

/** Loads surfaces by resource id and builds sprites that honour their anchor and blending. */
export class TextureStore {
  private readonly textures = new Map<string, Texture>();

  constructor(private readonly resources: Resources) {}

  async load(ids: Iterable<string>): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const id of ids) {
      if (this.textures.has(id)) continue;
      const url = this.resources.url(this.resources.surface(id).file);
      pending.push(
        Assets.load<Texture>(url).then((texture) => {
          this.textures.set(id, texture);
        }),
      );
    }
    await Promise.all(pending);
  }

  texture(id: string): Texture {
    const texture = this.textures.get(id);
    if (!texture) throw new Error(`Surface "${id}" has not been loaded`);
    return texture;
  }

  sprite(id: string): Sprite {
    const def = this.resources.surface(id);
    const sprite = new Sprite(this.texture(id));
    if (def.centered) sprite.anchor.set(0.5);
    sprite.blendMode = BLEND_MODES[def.blending];
    return sprite;
  }
}
