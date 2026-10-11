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

/** Where the awards won on a level go in its dialog, from the frame's centre, by how many there are (0x64ed6). */
export function levelAwardPlaces(count: number): { x: number; y: number }[] {
  const row = (xs: number[], y: number): { x: number; y: number }[] => xs.map((x) => ({ x: x + 5, y: y - 10 }));
  switch (Math.min(count, 6)) {
    case 1:
      return row([140], 0);
    case 2:
      return row([120, 160], 0);
    case 3:
      return row([100, 140, 180], 0);
    case 4:
      return [...row([120, 160], -40), ...row([120, 160], 40)];
    case 5:
      return [...row([100, 140, 180], -40), ...row([120, 160], 40)];
    case 6:
      return [...row([100, 140, 180], -40), ...row([100, 140, 180], 40)];
    default:
      return [];
  }
}

/** The dialog's height (0x64a94): 200, 25 more with a best score and 25 more for the five scores. */
export const levelDialogHeight = (hasBest: boolean): number => 225 + (hasBest ? 25 : 0);

/**
 * What the map shows for a level before playing it (dialog `0x64824`, draw `0x64d38`): "Stage
 * S-L" 10 px under the frame's top, the five scores to aim for from 50 px under it, the best
 * score so far 10 px under those, the awards won on that level to the right (the scores then
 * stand 60 px to the left), and Cancel and Play, 160 wide at x −100 and 100, 20 px over the
 * frame's bottom. The frame is 420 wide.
 */
export class LevelDialog extends Container {
  constructor(
    textures: TextureStore,
    audio: AudioPlayer,
    strings: Strings,
    level: { stage: number; level: number; goals: LevelGoals; best: number; awards: Container[] },
    onPlay: () => void,
    onCancel: () => void,
  ) {
    super();
    const size = { width: 420, height: levelDialogHeight(level.best > 0) };
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
    title.position.set(0, (20 - size.height) / 2);
    centre.addChild(title);

    const money = fontFamily(SCORE_FONT);
    const rows = goalRows(textures, strings, level.goals, level.best, 10);
    rows.position.set(level.awards.length > 0 ? -60 : 0, Math.floor(50 - size.height / 2));
    centre.addChild(rows);
    levelAwardPlaces(level.awards.length).forEach((at, i) => {
      const picture = level.awards[i]!;
      picture.position.set(at.x, at.y);
      centre.addChild(picture);
    });
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
