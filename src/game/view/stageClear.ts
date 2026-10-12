import { Label, ULTRA_EFFECT, titleText } from './effectText';
import { BORDER, SCORE_FILL } from './faces';
import { Container, type FillInput } from 'pixi.js';
import type { Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import { dialogButton, dialogFrame, dialogRule, widgetAppear } from './dialog';
import { SCORE_FONT } from './floatingText';

const BOX = { width: 400, height: 250 };

/**
 * Where star `k` of `n` (counted from 1) stands, from the dialog's centre (0x786b0): a zigzag
 * row ending by the right edge, the stars at most 10 px apart.
 */
export function stageClearStar(k: number, n: number): { x: number; y: number } {
  const step = Math.min(10, Math.trunc(200 / n));
  return { x: 167 - step * (n - 1 - k), y: -8 - 14 * (k % 2) };
}

/**
 * Shown when a stage's last level is passed for the first time (dialog `0x7802c`, update
 * `0x78594`): the bonus for clearing the stage, the stars earned over it, and the funds the two
 * add up to, which the next stage starts with. Positions are from the centre of the 400×250 box.
 * Its clock runs at 2 a second and four times that while the screen is held. After 3 of it the
 * stars come one for each third of it, each with the till's ring and its share added to the
 * funds; three thirds after the last, the button comes.
 */
export class StageClear extends Container {
  constructor(textures: TextureStore, audio: AudioPlayer, strings: Strings, reward: { bonus: number; stars: number; funds: number }, onContinue: () => void) {
    super();
    const { overlay, panel } = dialogFrame(textures, BOX.width, BOX.height);
    const centre = new Container();
    centre.position.set(BOX.width / 2, BOX.height / 2);
    panel.addChild(centre);
    this.addChild(overlay);

    const text = (value: string, x: number, y: number, family: string, size: number, anchorX: number, fill: FillInput = 0xffffff): Label => {
      const node = new Label({ text: value, style: { fontFamily: family, fontSize: size, fill, stroke: BORDER } });
      node.anchor.set(anchorX, 0.85);
      node.position.set(x, y);
      centre.addChild(node);
      return node;
    };
    const white = fontFamily('FONTS.TEEN_BD');
    const money = fontFamily(SCORE_FONT);
    const heading = titleText(strings.t('FINAL_REPORT_DIALOG.STAGE_CLEAR'), 'FONTS.BLUE_STONE', 20, 0.8, ULTRA_EFFECT);
    heading.anchor.set(0.5, 0.85);
    heading.position.set(0, -78);
    centre.addChild(heading);
    dialogRule(textures, centre, 0, -65, 350);
    dialogRule(textures, centre, 0, 16, 350);
    text(strings.t('FINAL_REPORT_DIALOG.AREA_CLEAR_BONUS'), -175, -30, white, 11, 0);
    text(String(reward.bonus), 175, -30, money, 14, 1, SCORE_FILL);
    text(strings.t('FINAL_REPORT_DIALOG.STARS_EARNED'), -175, -10, white, 11, 0);
    text(strings.t('FINAL_REPORT_DIALOG.FUNDS'), -175, 60, white, 11, 0);
    // 0x7820a: the funds start at the bonus alone.
    let funds = reward.bonus;
    const total = text(String(funds), 175, 60, money, 14, 1, SCORE_FILL);
    const perStar = reward.stars > 0 ? (reward.funds - reward.bonus) / reward.stars : 0;

    let held = false;
    const press = (): void => void (held = true);
    const release = (): void => void (held = false);
    window.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    this.on('destroyed', () => {
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    });

    let state = 0;
    let clock = 0;
    let count = 0;
    let last = performance.now();
    centre.onRender = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock += dt * (held ? 8 : 2);
      if (state === 0) {
        if (clock < 3) return;
        state = 1;
        clock = 0;
        return;
      }
      if (state !== 1) return;
      const due = Math.trunc(clock * 3);
      while (count < due) {
        count += 1;
        if (count > reward.stars) continue;
        const star = textures.sprite('GUI.FINAL_REPORT.STAR_SMALL');
        // 0x7871e: it pops in.
        const at = stageClearStar(count, reward.stars);
        widgetAppear(centre, at.x, at.y, true, star);
        audio.play('SOUNDS.CASH');
        funds += perStar;
        total.text = String(Math.round(funds));
      }
      if (count <= reward.stars + 3) return;
      state = 2;
      // 0x787a8: 360 wide at (0, 110).
      dialogButton(textures, audio, widgetAppear(centre, 0, 110, true), { x: 0, y: 0, width: 360, height: 34 }, strings.t('FINAL_REPORT_DIALOG.CONTINUE'), money, onContinue);
    };
  }
}
