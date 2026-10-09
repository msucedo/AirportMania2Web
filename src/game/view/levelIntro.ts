import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { LevelGoals } from '../../data/levels';
import type { Strings } from '../../data/strings';
import { fontFamily } from '../../engine/fonts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../engine/screen';
import type { TextureStore } from '../../engine/textures';
import { MAIN_FONT, SCORE_FONT } from './floatingText';

export const LEVEL_INTRO_SURFACES = ['GUI.INGAMEGUI.SCORE_GOAL_BACK'];
export const LEVEL_INTRO_FONTS = ['FONTS.BLUE_STONE', 'FONTS.TEEN_BD', MAIN_FONT, SCORE_FONT];

const TIERS = ['GOAL', 'EXPERT', 'MASTER', 'SUPREME', 'PERFECT'] as const;
/**
 * Plate colours per tier. The original takes them from a table filled at run time
 * (`0x181314`), which has not been read; these are ours.
 */
const PLATE_TINTS = [0xfff2c2, 0xffe08a, 0xffc861, 0xffab52, 0xff8f6b];
const BEST_TINT = 0x4d4d4d;

/** One score row (0x51b18): the plate, the name 125 px left of its centre and the amount 115 px right. */
export function goalRow(textures: TextureStore, name: string, amount: string, tint: number, dark = true): Container {
  const row = new Container();
  const plate = textures.sprite('GUI.INGAMEGUI.SCORE_GOAL_BACK');
  plate.tint = tint;
  const label = new Text({ text: name, style: { fontFamily: fontFamily('FONTS.TEEN_BD'), fontSize: 11, fill: dark ? 0x30243a : 0xffffff } });
  label.anchor.set(0, 0.5);
  label.position.set(-125, -2);
  const value = new Text({ text: amount, style: { fontFamily: fontFamily(SCORE_FONT), fontSize: 14, fill: dark ? 0x2d6a1f : 0xffe45c } });
  value.anchor.set(1, 0.5);
  value.position.set(115, 0);
  row.addChild(plate, label, value);
  return row;
}

/** The five score rows, 26 px apart, and the best score 20 px further down when there is one. */
export function goalRows(textures: TextureStore, strings: Strings, goals: LevelGoals, best: number): Container {
  const rows = new Container();
  const amounts = [goals.goal, goals.expert, goals.master, goals.supreme, goals.perfect];
  TIERS.forEach((tier, i) => {
    const row = goalRow(textures, strings.t(`SCORE.${tier}_SCORE`), String(amounts[i]), PLATE_TINTS[i]!);
    row.y = i * 26;
    rows.addChild(row);
  });
  if (best > 0) {
    const row = goalRow(textures, strings.t('SCORE.BEST_SCORE'), String(best), BEST_TINT, false);
    row.y = TIERS.length * 26 + 20;
    rows.addChild(row);
  }
  return rows;
}

/**
 * What a level opens with (panel `0x514cc`, drawn by `0x51be8`): "Stage – Level N", the
 * airport's name, the five scores to aim for and the best one so far. Heights are from the
 * screen's centre: the title at −100 (−80 with no best score), 20 higher when five scores are
 * listed; the name 45 below it and the first row 50 below that. The original can also list what
 * the level introduces, which is not drawn. It is dismissed here with a touch, over a dimmed
 * airport; how the original dismisses it has not been read.
 */
export class LevelIntro extends Container {
  constructor(textures: TextureStore, strings: Strings, level: { stage: number; number: number; goals: LevelGoals; best: number }, onStart: () => void) {
    super();
    const shade = new Graphics().rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill({ color: 0x000000, alpha: 0.5 });
    // The touch area is its own node, as with the dialog buttons.
    const zone = new Container();
    zone.hitArea = new Rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    zone.eventMode = 'static';
    zone.cursor = 'pointer';
    zone.on('pointerdown', (event) => {
      event.stopPropagation();
      onStart();
    });
    const centre = new Container();
    centre.position.set(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    this.addChild(shade, centre, zone);

    const top = (level.best > 0 ? -100 : -80) - 20;
    const title = new Text({
      text: `${strings.t(`STAGES.${level.stage}.TITLE`)} - ${strings.t('LEVEL_NUMBER', level.number)}`,
      style: { fontFamily: fontFamily('FONTS.BLUE_STONE'), fontSize: 20, fill: 0xffd75a, stroke: { color: 0x5a2a00, width: 3 } },
    });
    title.anchor.set(0.5);
    title.position.set(0, top);
    const name = new Text({
      text: strings.t(`STAGES.${level.stage}.NAME`),
      style: { fontFamily: fontFamily(MAIN_FONT), fontSize: 14, fill: 0xffc23a, stroke: { color: 0x5a2a00, width: 3 }, align: 'center', wordWrap: true, wordWrapWidth: 420 },
    });
    name.anchor.set(0.5);
    name.position.set(0, top + 45);
    const rows = goalRows(textures, strings, level.goals, level.best);
    rows.y = top + 95;
    centre.addChild(title, name, rows);
  }
}
