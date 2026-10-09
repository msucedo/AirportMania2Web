import { Container, Sprite } from 'pixi.js';
import type { Perspective, PlaneDescriptor } from '../data/planes';
import type { TextureStore } from '../engine/textures';

/** Surface ids a plane needs for one perspective. */
export function planeSurfaceIds(plane: PlaneDescriptor, perspective: Perspective): string[] {
  return [
    plane.shadow,
    `${plane.body.color}.${perspective}`,
    `${plane.body.front}.${perspective}`,
    `${plane.eyes.opened}.${perspective}`,
    `${plane.eyes.closed}.${perspective}`,
  ];
}

/**
 * A plane drawn from its layers: shadow, tinted colour layer, line-art front and eyes.
 * Layer order and the tint are provisional until confirmed against the original renderer.
 */
export class PlaneView extends Container {
  private readonly color: Sprite;

  constructor(textures: TextureStore, plane: PlaneDescriptor, perspective: Perspective, tint: number) {
    super();

    const shadow = textures.sprite(plane.shadow);
    this.color = textures.sprite(`${plane.body.color}.${perspective}`);
    this.color.tint = tint;
    const front = textures.sprite(`${plane.body.front}.${perspective}`);

    const body = new Container();
    body.y = plane.body.offsetY;
    body.addChild(this.color, front);

    const eyes = plane.eyes.placement[perspective];
    if (eyes?.visible) {
      const sprite = textures.sprite(`${plane.eyes.opened}.${perspective}`);
      sprite.position.set(eyes.x, eyes.y);
      body.addChild(sprite);
    }

    this.addChild(shadow, body);
  }
}
