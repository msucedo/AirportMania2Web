import { Container } from 'pixi.js';
import type { Strings } from '../../data/strings';
import { fontFamily } from '../../engine/fonts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../engine/screen';
import { Label, ULTRA_EFFECT, titleText } from './effectText';
import { BORDER, MAIN_FILL } from './faces';
import { MAIN_FONT } from './floatingText';
import { GOAL_EFFECT_FONT } from './goalEffects';

/**
 * How the pause screen's two texts stand with its clock at `clock` (0x6a34a, read off runs of
 * its update): as clear as the clock, from half their size to whole, and that share of 30 px
 * above and below the screen's middle.
 */
export function pausePose(clock: number): { alpha: number; scale: number; offset: number } {
  const c = Math.max(0, Math.min(1, clock));
  const scale = 0.5 + 0.5 * c;
  return { alpha: c, scale, offset: 30 * scale };
}

/**
 * The pause screen (kept at `app+0x148`; enter 0x6a53c, update 0x6a328, draw 0x6a5d4):
 * `PAUSE.PAUSED` in `FONTS.ULTRA` and `PAUSE.TEXT` in `FONTS.MAIN` over the stopped game. It
 * comes in half a second, waits for a touch, and goes in half a second.
 */
export class PauseScreen extends Container {
  constructor(strings: Strings, onGone: () => void) {
    super();
    const title = titleText(strings.t('PAUSE.PAUSED'), GOAL_EFFECT_FONT, 20, 0.8, ULTRA_EFFECT);
    title.anchor.set(0.5);
    const text = new Label({ text: strings.t('PAUSE.TEXT'), style: { fontFamily: fontFamily(MAIN_FONT), fontSize: 14, fill: MAIN_FILL, stroke: BORDER } });
    text.anchor.set(0.5);
    this.addChild(title, text);
    this.eventMode = 'static';
    this.hitArea = { contains: () => true };
    let clock = 0;
    let state: 'coming' | 'shown' | 'going' = 'coming';
    let last = performance.now();
    const show = (): void => {
      const pose = pausePose(clock);
      for (const [node, side] of [[title, -1], [text, 1]] as const) {
        node.alpha = pose.alpha;
        node.scale.set(pose.scale);
        node.position.set(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + side * pose.offset);
      }
    };
    show();
    this.onRender = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (state === 'coming') {
        clock += 2 * dt;
        if (clock >= 1) [clock, state] = [1, 'shown'];
      } else if (state === 'going') {
        clock -= 2 * dt;
        if (clock <= 0) {
          this.onRender = null;
          // Taken away once this frame is done.
          setTimeout(() => {
            this.destroy({ children: true });
            onGone();
          });
          return;
        }
      }
      show();
    };
    // 0x6a464: a touch let go while it is shown sends it away.
    this.on('pointerdown', (event) => event.stopPropagation());
    this.on('pointerup', () => {
      if (state === 'shown') state = 'going';
    });
  }
}
