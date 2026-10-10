import { Assets, CanvasSource, Sprite, Texture } from 'pixi.js';
import type { Blending, Resources } from '../data/resources';

const BLEND_MODES: Record<Blending, 'normal' | 'add'> = {
  ALPHA: 'normal',
  ADDITIVE: 'add',
  // DECAL surfaces are opaque; drawing them with normal blending gives the same result.
  DECAL: 'normal',
};

/**
 * An optional set of enlarged images (see tools/upscale-assets.py): the files that have one, and
 * how many times larger they are. They are drawn at the original's size, with more pixels.
 */
export interface EnlargedImages {
  baseUrl: string;
  scale: number;
  files: ReadonlySet<string>;
}

/** A texture made from a canvas that holds `resolution` pixels per unit of the game's layout. */
function fromCanvas(canvas: HTMLCanvasElement, resolution: number): Texture {
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution }) });
}

/** Joins a colour image with the greyscale image that holds its opacity. */
function withOpacity(color: Texture, opacity: Texture): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = color.source.pixelWidth;
  canvas.height = color.source.pixelHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(opacity.source.resource as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  const mask = context.getImageData(0, 0, canvas.width, canvas.height).data;
  context.drawImage(color.source.resource as CanvasImageSource, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < mask.length; i += 4) image.data[i + 3] = mask[i]!;
  context.putImageData(image, 0, 0);
  return fromCanvas(canvas, color.source.resolution);
}

/** Loads surfaces by resource id and builds sprites that honour their anchor and blending. */
export class TextureStore {
  private readonly textures = new Map<string, Texture>();

  constructor(
    private readonly resources: Resources,
    private readonly enlarged: EnlargedImages | null = null,
  ) {}

  /** Loads one image file, in its enlarged version when there is one. */
  private file(file: string): Promise<Texture> {
    const { enlarged } = this;
    if (enlarged?.files.has(file)) return Assets.load<Texture>({ src: enlarged.baseUrl + file, data: { resolution: enlarged.scale } });
    return Assets.load<Texture>(this.resources.url(file));
  }

  async load(ids: Iterable<string>): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const id of ids) {
      if (this.textures.has(id)) continue;
      const def = this.resources.surface(id);
      const color = this.file(def.file);
      const loaded = def.alpha ? Promise.all([color, this.file(def.alpha)]).then(([c, a]) => withOpacity(c, a)) : color;
      pending.push(
        loaded.then((texture) => {
          this.textures.set(id, texture);
        }),
      );
    }
    await Promise.all(pending);
  }

  /** Whether a surface has been loaded. */
  has(id: string): boolean {
    return this.textures.has(id);
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
    canvas.width = texture.source.pixelWidth;
    canvas.height = texture.source.pixelHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(texture.source.resource as CanvasImageSource, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
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
    const texture = fromCanvas(canvas, this.texture(id).source.resolution);
    this.textures.set(key, texture);
    return texture;
  }

  /** Average colour of one row of a surface, counted in the original's pixels, as 0xRRGGBB. */
  rowColor(id: string, originalRow: number): number {
    const image = this.pixels(id);
    const row = Math.min(image.height - 1, Math.round(originalRow * this.texture(id).source.resolution));
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

  /** A sprite placed by the point its resource names (`x`, `y` in the image), for those that have one. */
  pinned(id: string): Sprite {
    const sprite = this.sprite(id);
    const def = this.resources.surface(id);
    if (!def.centered) sprite.pivot.set(def.x ?? 0, def.y ?? 0);
    return sprite;
  }
}
