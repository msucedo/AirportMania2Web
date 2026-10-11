import { BORDER, SCORE_FILL, ULTRA_FILL } from './faces';
import { Container, Graphics, Text, type FillInput } from 'pixi.js';
import type { Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import { dialogButton, dialogFrame } from './dialog';
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
      const node = new Text({ text: value, style: { fontFamily: family, fontSize: size, fill, stroke: BORDER } });
      node.anchor.set(anchorX, 0.85);
      node.position.set(x, y);
      centre.addChild(node);
    };
    const white = fontFamily('FONTS.TEEN_BD');
    const money = fontFamily(SCORE_FONT);
    text(strings.t('FINAL_REPORT_DIALOG.STAGE_CLEAR'), 0, -78, fontFamily('FONTS.BLUE_STONE'), 20, 0.5, ULTRA_FILL);
    centre.addChild(new Graphics().rect(-175, -65.5, 350, 1).rect(-175, 15.5, 350, 1).fill({ color: 0xffffff, alpha: 0.5 }));
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
