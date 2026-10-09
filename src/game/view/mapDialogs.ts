import { Container, Text } from 'pixi.js';
import type { LevelGoals } from '../../data/levels';
import type { Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import { dialogButton, dialogFrame, dialogText } from './dialog';
import { MAIN_FONT, SCORE_FONT } from './floatingText';
import { goalRows } from './levelIntro';

export const MAP_DIALOG_FONTS = ['FONTS.BLUE_STONE', 'FONTS.TEEN_BD', MAIN_FONT, SCORE_FONT];

/**
 * What the map shows for a level before playing it (dialog `0x64824`): "Stage S-L", the five
 * scores to aim for, the best score so far if there is one, and Cancel and Play, 160 wide at
 * x −100 and 100 on the frame's bottom row. The frame is 420 wide; its height and how the
 * scores are laid out come from a draw routine that has not been read.
 */
export class LevelDialog extends Container {
  constructor(
    textures: TextureStore,
    audio: AudioPlayer,
    strings: Strings,
    level: { stage: number; level: number; goals: LevelGoals; best: number },
    onPlay: () => void,
    onCancel: () => void,
  ) {
    super();
    const size = { width: 420, height: 270 };
    const { overlay, panel } = dialogFrame(textures, size.width, size.height);
    const centre = new Container();
    centre.position.set(size.width / 2, size.height / 2);
    panel.addChild(centre);
    this.addChild(overlay);

    const title = new Text({
      text: strings.t('MAP.LEVEL_STAGE_NUMBER', level.stage, level.level),
      style: { fontFamily: fontFamily('FONTS.BLUE_STONE'), fontSize: 20, fill: 0xffd75a, stroke: { color: 0x5a2a00, width: 3 } },
    });
    title.anchor.set(0.5);
    title.position.set(0, -108);
    centre.addChild(title);

    const money = fontFamily(SCORE_FONT);
    // The same score rows the level opens with; their place in this dialog is assumed.
    const rows = goalRows(textures, strings, level.goals, level.best);
    rows.y = -66;
    centre.addChild(rows);
    const y = size.height / 2 - 20;
    dialogButton(textures, audio, centre, { x: -100, y, width: 160, height: 36 }, strings.t('CANCEL'), money, onCancel);
    dialogButton(textures, audio, centre, { x: 100, y, width: 160, height: 36 }, strings.t('MAP.PLAY'), money, onPlay);
  }
}

/**
 * What the map shows for a stage (dialog `0x63c60`): its name and description and, once it is
 * cleared, the prize: the stars earned and the total paid. The layout is ours; only the texts,
 * their fonts and the Close button are taken from the original.
 */
export class StageDialog extends Container {
  constructor(
    textures: TextureStore,
    audio: AudioPlayer,
    strings: Strings,
    stage: { number: number; prize: { stars: number; total: number } | null },
    onClose: () => void,
  ) {
    super();
    const size = { width: 420, height: 240 };
    const { overlay, panel } = dialogFrame(textures, size.width, size.height);
    const centre = new Container();
    centre.position.set(size.width / 2, size.height / 2);
    panel.addChild(centre);
    this.addChild(overlay);

    const name = dialogText(centre, strings.t(`STAGES.${stage.number}.NAME`), 0, -92, 14, fontFamily(MAIN_FONT), 0.5);
    name.style.fill = 0xffc23a;
    if (name.width > 390) name.scale.set(390 / name.width);
    const description = new Text({
      text: strings.t(`STAGES.${stage.number}.DESCRIPTION`),
      style: { fontFamily: fontFamily('FONTS.TEEN_BD'), fontSize: 10, fill: 0xffffff, wordWrap: true, wordWrapWidth: 380, align: 'center', lineHeight: 13 },
    });
    description.anchor.set(0.5, 0);
    description.position.set(0, -76);
    centre.addChild(description);

    if (stage.prize) {
      const money = fontFamily(SCORE_FONT);
      dialogText(centre, strings.t('MAP_INFO_DIALOG.STAGE_CLEARED'), -150, 30, 13, fontFamily(MAIN_FONT), 0).style.fill = 0xffc23a;
      const star = textures.sprite('GUI.FINAL_REPORT.STAR_SMALL');
      star.position.set(96, 22);
      star.scale.set(0.7);
      centre.addChild(star);
      dialogText(centre, `x ${stage.prize.stars}`, 150, 30, 14, money, 1).style.fill = 0xffe45c;
      dialogText(centre, strings.t('MAP_INFO_DIALOG.TOTAL'), -150, 54, 13, fontFamily(MAIN_FONT), 0).style.fill = 0xffc23a;
      dialogText(centre, String(stage.prize.total), 150, 54, 14, money, 1).style.fill = 0xffe45c;
    }
    dialogButton(textures, audio, centre, { x: 0, y: size.height / 2 - 20, width: 160, height: 36 }, strings.t('CLOSE'), fontFamily(SCORE_FONT), onClose);
  }
}
