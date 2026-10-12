import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';

export const YES_NO_SURFACES = ['INDICATORS.YES', 'INDICATORS.NO'];

/**
 * How a mark stands `age` seconds after it is made (0x87718, read off runs of it): it wobbles
 * for half a second about 0.8 of its size and is whole until its last half second, over which
 * it goes.
 */
export function yesNoPose(age: number): { scaleX: number; scaleY: number; alpha: number } {
  const u = Math.min(1, 2 * age);
  return {
    scaleX: 0.8 * (1 + 0.3 * (1 - u) * Math.sin(Math.PI * u)),
    scaleY: 0.8 * (1 + 0.25 * (1 - u) * Math.sin(2 * Math.PI * u)),
    alpha: Math.max(0, Math.min(1, 2 * (1 - age))),
  };
}

/**
 * The marks a touch leaves on the airport (`YesNoMessage`, 0x875d0; update 0x876cc): a tick where
 * an order was taken, a cross where it was not or a plane could not be picked. Each lasts a
 * second and rises 20 px in it.
 */
export class YesNoMarks extends Container {
  private readonly marks: { sprite: Sprite; x: number; y: number; age: number }[] = [];

  constructor(private readonly textures: TextureStore) {
    super();
    this.eventMode = 'none';
  }

  show(yes: boolean, x: number, y: number): void {
    const sprite = this.textures.sprite(yes ? 'INDICATORS.YES' : 'INDICATORS.NO');
    this.addChild(sprite);
    this.marks.push({ sprite, x, y, age: 0 });
    this.update(0);
  }

  update(dt: number): void {
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const mark = this.marks[i]!;
      mark.age += dt;
      if (mark.age >= 1) {
        mark.sprite.destroy();
        this.marks.splice(i, 1);
        continue;
      }
      const pose = yesNoPose(mark.age);
      mark.sprite.position.set(mark.x, mark.y - 20 * mark.age);
      mark.sprite.scale.set(pose.scaleX, pose.scaleY);
      mark.sprite.alpha = pose.alpha;
    }
  }
}
