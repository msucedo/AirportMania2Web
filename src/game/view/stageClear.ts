import { Label, ULTRA_EFFECT, titleText } from './effectText';
import { BORDER, SCORE_FILL } from './faces';
import { Container, type FillInput } from 'pixi.js';
import type { Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import { dialogButton, dialogFrame, dialogRule } from './dialog';
import { SCORE_FONT } from './floatingText';

const BOX = { width: 400, height: 250 };

/**
 * Shown when a stage's last level is passed for the first time (dialog `0x7802c`): the bonus for
 * clearing the stage, the stars earned over it, and the funds the two add up to, which the next
 * stage starts with. Positions are from the centre of the 400×250 box; how the stars are drawn
 * and where the button sits have not been read.
 */
export class StageClear extends Container {
  constructor(textures: TextureStore, audio: AudioPlayer, strings: Strings, reward: { bonus: number; stars: number; funds: number }, onContinue: () => void) {
    super();
    const { overlay, panel } = dialogFrame(textures, BOX.width, BOX.height);
    const centre = new Container();
    centre.position.set(BOX.width / 2, BOX.height / 2);
    panel.addChild(centre);
    this.addChild(overlay);

    const text = (value: string, x: number, y: number, family: string, size: number, anchorX: number, fill: FillInput = 0xffffff): void => {
      const node = new Label({ text: value, style: { fontFamily: family, fontSize: size, fill, stroke: BORDER } });
      node.anchor.set(anchorX, 0.85);
      node.position.set(x, y);
      centre.addChild(node);
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
    const star = textures.sprite('GUI.FINAL_REPORT.STAR_SMALL');
    star.position.set(150, -18);
    star.scale.set(0.7);
    centre.addChild(star);
    text(String(reward.stars), 136, -10, money, 14, 1, SCORE_FILL);
    text(strings.t('FINAL_REPORT_DIALOG.FUNDS'), -175, 60, white, 11, 0);
    text(String(reward.funds), 175, 60, money, 14, 1, SCORE_FILL);
    dialogButton(textures, audio, centre, { x: 0, y: 110, width: 200, height: 34 }, strings.t('FINAL_REPORT_DIALOG.CONTINUE'), money, onContinue);
  }
}
