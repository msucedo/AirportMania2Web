import { Container, Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { Place, Plane } from '../sim/simulation';

const MAX_FLAGS = 8;

export const ORDER_FLAG_SURFACES = ['INDICATORS.FLAGS.COLOR', ...Array.from({ length: 9 }, (_, i) => `INDICATORS.FLAGS.NUMBERS.${i + 1}`)];

/** A step of a flag's showing (0x6b942): up at 3 a second while it stands, down at 3 once taken away. */
export const flagStep = (shown: number, dt: number, standing: boolean): number => Math.max(0, Math.min(1, shown + (standing ? 3 : -3) * dt));

/**
 * Numbered flags on the places queued for the selected plane (0x5ea8, 0x6ba58). Each stands on
 * its place's node, drawn 5 px above it (0x6b9de), and is two objects: one sorted with the
 * planes 11 behind the node, and one over everything at half its strength (depth 1000), so it
 * shows through what stands before it.
 */
export class OrderFlags extends Container {
  private readonly flags: { parts: { root: Container; color: Sprite; number: Sprite; strength: number }[]; place: Place | null; shown: number }[] = [];

  constructor(
    private readonly textures: TextureStore,
    sorted: Container,
  ) {
    super();
    for (let i = 0; i < MAX_FLAGS; i++) {
      const parts = [1, 0.5].map((strength, k) => {
        const root = new Container();
        const color = textures.sprite('INDICATORS.FLAGS.COLOR');
        const number = textures.sprite('INDICATORS.FLAGS.NUMBERS.1');
        root.addChild(color, number);
        root.visible = false;
        (k === 0 ? sorted : this).addChild(root);
        return { root, color, number, strength };
      });
      this.flags.push({ parts, place: null, shown: 0 });
    }
  }

  update(plane: Plane | null, tint: number, dt: number): void {
    // The place the plane is already heading to counts as its first order.
    const moving = plane && plane.place && (plane.landing || plane.path.length > 0) ? [plane.place] : [];
    const places: Place[] = plane ? [...moving, ...plane.queue] : [];
    this.flags.forEach((flag, i) => {
      const place = places[i] ?? null;
      // A flag for another place starts over.
      if (place && place !== flag.place) flag.shown = 0;
      if (place) flag.place = place;
      flag.shown = flagStep(flag.shown, dt, place !== null);
      const at = flag.place;
      for (const part of flag.parts) {
        part.root.visible = flag.shown > 0 && at !== null;
        if (!part.root.visible || !at) continue;
        part.root.position.set(at.node.x, at.node.y - 5);
        part.root.alpha = part.strength * flag.shown;
        if (part.strength === 1) part.root.zIndex = at.node.y - 11;
        if (place) {
          part.color.tint = tint;
          part.number.texture = this.textures.texture(`INDICATORS.FLAGS.NUMBERS.${i + 1}`);
        }
      }
    });
  }
}
