import { Container, Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { Place, Plane } from '../sim/simulation';

const MAX_FLAGS = 8;

export const ORDER_FLAG_SURFACES = ['INDICATORS.FLAGS.COLOR', ...Array.from({ length: 9 }, (_, i) => `INDICATORS.FLAGS.NUMBERS.${i + 1}`)];

/**
 * Numbered flags over the places queued for the selected plane (original sprites; the flags are
 * created by 0x6b720 and placed by 0x6ba58, whose exact offsets have not been read).
 */
export class OrderFlags extends Container {
  private readonly flags: { root: Container; color: Sprite; number: Sprite }[] = [];

  constructor(private readonly textures: TextureStore) {
    super();
    for (let i = 0; i < MAX_FLAGS; i++) {
      const root = new Container();
      const color = textures.sprite('INDICATORS.FLAGS.COLOR');
      const number = textures.sprite('INDICATORS.FLAGS.NUMBERS.1');
      root.addChild(color, number);
      root.visible = false;
      this.flags.push({ root, color, number });
      this.addChild(root);
    }
  }

  update(plane: Plane | null, tint: number): void {
    // The place the plane is already heading to counts as its first order.
    const moving = plane && plane.place && (plane.landing || plane.path.length > 0) ? [plane.place] : [];
    const places: Place[] = plane ? [...moving, ...plane.queue] : [];
    this.flags.forEach((flag, i) => {
      const place = places[i];
      flag.root.visible = place !== undefined;
      if (!place) return;
      const anchor = place.kind === 'runway' ? { x: place.node.x + 40, y: place.node.y - 26 } : { x: place.position.x, y: place.position.y - 46 };
      flag.root.position.set(anchor.x, anchor.y);
      flag.color.tint = tint;
      flag.number.texture = this.textures.texture(`INDICATORS.FLAGS.NUMBERS.${i + 1}`);
    });
  }
}
