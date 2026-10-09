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

  /** Pixels of a loaded surface, read back through a canvas. */
  private pixels(id: string): ImageData {
    const texture = this.texture(id);
    const canvas = document.createElement('canvas');
    canvas.width = texture.width;
    canvas.height = texture.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(texture.source.resource as CanvasImageSource, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }

  /**
   * A white texture whose opacity is the brightness of a greyscale surface. The game ships a few
   * 8-bit grey images (`.cgf`) that act as silhouettes to be drawn in a colour.
   */
  alphaMask(id: string): Texture {
    const key = `${id}#mask`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    const image = this.pixels(id);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i + 3] = data[i]!;
      data[i] = data[i + 1] = data[i + 2] = 255;
    }
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.putImageData(image, 0, 0);
    const texture = Texture.from(canvas);
    this.textures.set(key, texture);
    return texture;
  }

  /**
   * A surface multiplied by a colour that runs from `main` at the top-left corner to `shade` at
   * the bottom-right one, as the engine's two-colour draw does with per-vertex colours (0x84440).
   */
  gradient(id: string, main: number, shade: number): Texture {
    const key = `${id}#${main.toString(16)}-${shade.toString(16)}`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    const image = this.pixels(id);
    const data = image.data;
    const from = [main >> 16, (main >> 8) & 0xff, main & 0xff];
    const to = [shade >> 16, (shade >> 8) & 0xff, shade & 0xff];
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const t = (x / image.width + y / image.height) / 2;
        const i = (y * image.width + x) * 4;
        for (let c = 0; c < 3; c++) data[i + c] = (data[i + c]! * (from[c]! + (to[c]! - from[c]!) * t)) / 255;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.putImageData(image, 0, 0);
    const texture = Texture.from(canvas);
    this.textures.set(key, texture);
    return texture;
  }

  /** Average colour of one pixel row of a surface, as 0xRRGGBB. */
  rowColor(id: string, row: number): number {
    const image = this.pixels(id);
    let r = 0;
    let g = 0;
    let b = 0;
    for (let x = 0; x < image.width; x++) {
      const i = (row * image.width + x) * 4;
      r += image.data[i]!;
      g += image.data[i + 1]!;
      b += image.data[i + 2]!;
    }
    const n = image.width;
    return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
  }

  sprite(id: string): Sprite {
    const def = this.resources.surface(id);
    const sprite = new Sprite(this.texture(id));
    if (def.centered) sprite.anchor.set(0.5);
    sprite.blendMode = BLEND_MODES[def.blending];
    return sprite;
  }
}
