import { ULTRA_EFFECT, titleText } from './effectText';
import { BORDER, MAIN_FILL, SCORE_FILL } from './faces';
import { Container, Text } from 'pixi.js';
import type { LevelGoals } from '../../data/levels';
import type { Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import { dialogButton, dialogFrame, dialogRule, dialogText } from './dialog';
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

    const title = titleText(strings.t('MAP.LEVEL_STAGE_NUMBER', level.stage, level.level), 'FONTS.BLUE_STONE', 20, 0.8, ULTRA_EFFECT);
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

/** Where the stage dialog's parts go, from the frame's centre (0x63d28–0x642e8); `roomy` is whether the stage is cleared or has awards. */
export function stageDialogLayout(roomy: boolean): {
  height: number;
  name: number;
  description: { top: number; bottom: number };
  cleared: number;
  stars: number;
  rule: number;
  total: number;
  close: number;
} {
  const extra = roomy ? 20 : 0;
  const cleared = 26 - extra;
  return {
    height: 220 + 2 * extra,
    // Centred in a box from −110 − 2·extra to −40.
    name: -75 - extra,
    description: { top: -40 - 2 * extra, bottom: 60 - extra },
    cleared,
    stars: cleared + 28,
    rule: cleared + 46,
    total: cleared + 64,
    close: 90 + extra,
  };
}

/** Where a stage's awards go in its dialog (0x64562): a row centred on (−110, 35), 40 px apart, or more for a few of them. */
export function stageAwardPlaces(count: number): { x: number; y: number }[] {
  const step = Math.max(40, 70 - 7 * count);
  const start = Math.floor(-0.5 * step * (count - 1));
  return Array.from({ length: count }, (_, i) => ({ x: -110 + start + i * step, y: 35 }));
}

/**
 * What the map shows for a stage (dialog `0x63c60`): its name and description and, once it is
 * cleared, the prize on the right half: the bonus for clearing it, the stars earned times the
 * stage's rate, a rule and the total. Labels start at x 5 (the stars' count at 30, after a small
 * star at 15) and amounts end at x 200, and the stage's awards in a row on the left half. The description's box is the frame's whole width; the 10 px
 * kept clear on each side here are ours.
 */
export class StageDialog extends Container {
  constructor(
    textures: TextureStore,
    audio: AudioPlayer,
    strings: Strings,
    stage: { number: number; prize: { stars: number; perStar: number; clearBonus: number } | null; awards: Container[] },
    onClose: () => void,
  ) {
    super();
    const layout = stageDialogLayout(stage.prize !== null || stage.awards.length > 0);
    const size = { width: 420, height: layout.height };
    const { overlay, panel } = dialogFrame(textures, size.width, size.height);
    const centre = new Container();
    centre.position.set(size.width / 2, size.height / 2);
    panel.addChild(centre);
    this.addChild(overlay);

    const name = dialogText(centre, strings.t(`STAGES.${stage.number}.NAME`), 0, layout.name, 14, fontFamily(MAIN_FONT), 0.5);
    name.style.fill = MAIN_FILL;
    if (name.width > 400) name.scale.set(400 / name.width);
    const description = new Text({
      text: strings.t(`STAGES.${stage.number}.DESCRIPTION`),
      style: { fontFamily: fontFamily('FONTS.TEEN_BD'), fontSize: 11, fill: 0xffffff, stroke: BORDER, wordWrap: true, wordWrapWidth: 400, lineHeight: 13 },
    });
    description.position.set(-200, layout.description.top);
    centre.addChild(description);

    if (stage.prize) {
      const money = fontFamily(SCORE_FONT);
      const main = fontFamily(MAIN_FONT);
      const { stars, perStar, clearBonus } = stage.prize;
      const amount = (value: number, y: number): void => void (dialogText(centre, String(value), 200, y, 14, money, 1).style.fill = SCORE_FILL);
      dialogText(centre, strings.t('MAP_INFO_DIALOG.STAGE_CLEARED'), 5, layout.cleared, 14, main, 0).style.fill = MAIN_FILL;
      amount(clearBonus, layout.cleared);
      const star = textures.sprite('GUI.FINAL_REPORT.STAR_SMALL');
      star.position.set(15, layout.stars);
      centre.addChild(star);
      dialogText(centre, `x ${stars}`, 30, layout.stars, 14, main, 0).style.fill = MAIN_FILL;
      amount(stars * perStar, layout.stars);
      // 0x2c26c: a rule 210 wide centred at x 100.
      dialogRule(textures, centre, 100, layout.rule, 210);
      dialogText(centre, strings.t('MAP_INFO_DIALOG.TOTAL'), 5, layout.total, 14, main, 0).style.fill = MAIN_FILL;
      amount(stars * perStar + clearBonus, layout.total);
    }
    stageAwardPlaces(stage.awards.length).forEach((at, i) => {
      stage.awards[i]!.position.set(at.x, at.y);
      centre.addChild(stage.awards[i]!);
    });
    dialogButton(textures, audio, centre, { x: 0, y: layout.close, width: 380, height: 36 }, strings.t('CLOSE'), fontFamily(SCORE_FONT), onClose);
  }
}
