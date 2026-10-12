import { Container, NineSliceSprite, Text } from 'pixi.js';
import type { Strings } from '../../data/strings';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';

// The tips shower (0x79e98, draw 0x7a0e0; tip 0x7a188, draw 0x7a72c): a character with a speech
// bubble holding a text. `width` is the shower's; the tip is 120 narrower and its text 68
// narrower still. The character stands half a tip left of the shower's place and the tip 60 px
// right of it.

export const TIPS_SHOWER_SURFACES = ['GUI.TIPS_SHOWER.SURFACE', 'GUI.TIPS_SHOWER.SPEECH_BUBBLE'];

/** The shower, with a way to have it say something else. */
export type TipsShower = Container & { say(text: string): void };

export function tipsShower(textures: TextureStore, strings: Strings, text: string, width: number): TipsShower {
  const tip = width - 120;
  const shower = new Container() as TipsShower;
  const character = textures.sprite('GUI.TIPS_SHOWER.SURFACE');
  character.position.set(-(tip / 2), 0);
  shower.addChild(character);

  const balloon = (key: string): Container => {
    // `FONTS.TEEN` (Teen Bold at 10, 0.9 of its width), at its own size: the 0.8 its layout is
    // given (0x7a268) is the share of the width a line must fill to be spread out (0x94d70),
    // not a size.
    const words = new Text({
      text: strings.t(key),
      style: { fontFamily: fontFamily('FONTS.TEEN_BD'), fontSize: 10, fill: 0x000000, wordWrap: true, wordWrapWidth: (tip - 68) / 0.9 },
    });
    words.scale.set(0.9, 1);
    words.anchor.set(0, 0.5);
    words.position.set(60 - tip / 2 + 34, 0);
    // 0x7a81e: the words are black at 0.9.
    words.alpha = 0.9;
    // The bubble's picture is cut 34 px in from its left and 23 from its top, the tail staying
    // in the bottom left corner.
    const bubble = new NineSliceSprite({ texture: textures.texture('GUI.TIPS_SHOWER.SPEECH_BUBBLE'), leftWidth: 34, rightWidth: 17, topHeight: 23, bottomHeight: 22 });
    bubble.setSize(tip, Math.round(words.height) + 23);
    bubble.position.set(60 - tip / 2, Math.floor(-words.height / 2 - 11));
    const holder = new Container();
    holder.pivot.set(60, 0);
    holder.position.set(60, 0);
    holder.addChild(bubble, words);
    return holder;
  };

  // 0x7a0ce, 0x7a760–0x7a7a8: the shower comes in at 5 a second and a tip at 3, growing from half
  // its size about its middle as it clears. A tip that is replaced goes the same way (0x7a044).
  const tips: { node: Container; shown: number; staying: boolean }[] = [];
  const add = (key: string): void => {
    for (const old of tips) old.staying = false;
    const node = balloon(key);
    tips.push({ node, shown: 0, staying: true });
    shower.addChild(node);
  };
  add(text);
  shower.say = add;
  let whole = 0;
  let last = performance.now();
  const show = (): void => {
    shower.alpha = Math.max(0.001, whole);
    for (const one of tips) {
      one.node.alpha = one.shown;
      one.node.scale.set(0.5 + 0.5 * one.shown);
    }
  };
  show();
  shower.onRender = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    whole = Math.min(1, whole + 5 * dt);
    for (let i = tips.length - 1; i >= 0; i--) {
      const one = tips[i]!;
      one.shown = Math.max(0, Math.min(1, one.shown + (one.staying ? 3 : -3) * dt));
      if (one.staying || one.shown > 0) continue;
      one.node.destroy({ children: true });
      tips.splice(i, 1);
    }
    show();
  };
  return shower;
}

/**
 * The tip a level starts with (0x40314, update 0x40408): it stays 8 seconds; a touch after the
 * first one takes 4 off.
 */
export function gameTipStep(clock: number, dt: number, touched: boolean): number {
  const left = clock - dt;
  return touched && left < 7 ? left - 4 : left;
}
