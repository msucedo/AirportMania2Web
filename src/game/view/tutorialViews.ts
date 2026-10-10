import { Container, Graphics, type Sprite, Text } from 'pixi.js';
import type { Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import type { Tutorial, TutorialGoal, TutorialHint } from '../sim/tutorial';
import { dialogButton, dialogFrame } from './dialog';
import { MAIN_FONT, SCORE_FONT } from './floatingText';

// What the tutorial shows: the hint dialog every hint of the game uses (0x4aedc), the dialogs a
// day opens and closes with (0x7d650, 0x7dfe0, 0x7efb4) and the panel of goals kept on screen
// while it is played (0x7b2cc, rows 0x7aac0). Positions are from each dialog's centre. See
// docs/re-notes.md.

export const TUTORIAL_SURFACES = ['GUI.TUTORIAL_BACK_TOP', 'GUI.TUTORIAL_BACK_RIGHT', 'GUI.TUTORIAL_BACK_CORNER', 'GUI.TUTORIAL_BACK_COLOR', 'GUI.TUTORIAL_FASTENER', 'GUI.GOAL_CHECKBOX', 'INDICATORS.YES', 'INDICATORS.NO', 'GUI.FINAL_REPORT.BACK_STAR', 'GUI.FINAL_REPORT.SPIRAL'];
export const TUTORIAL_FONTS = ['FONTS.BLUE_STONE', 'FONTS.TEEN_BD', MAIN_FONT, SCORE_FONT];
export const TUTORIAL_SOUNDS = ['SOUNDS.FINAL_REPORT.SUPREME', 'SOUNDS.FINAL_REPORT.FAIL'];

/** The pictures the tutorial's hints use, to load with the level. */
export const TUTORIAL_HINT_SURFACES = [
  'HINTS.PLANE',
  'HINTS.RUNWAY',
  'HINTS.GATE_0',
  'HINTS.UNLOADING',
  'HINTS.LOADING',
  'HINTS.TUTORIAL_GATE_COMBO',
  'HINTS.TUTORIAL_GATE_COMBO_X2',
  'HINTS.TUTORIAL_LANDING_COMBO',
  'HINTS.TUTORIAL_LANDING_COMBO_X2',
  'HINTS.TUTORIAL_LAUNCHING_COMBO',
  'HINTS.TUTORIAL_LAUNCHING_COMBO_X2',
  'HINTS.HANGAR_0',
  'HINTS.GAS_STATION_0',
  'HINTS.LUGGAGE_0',
];

type Box = { x1: number; y1: number; x2: number; y2: number };

/** A dialog frame with a container at its centre, where the original's positions are measured from. */
export function centred(textures: TextureStore, width: number, height: number): { overlay: Container; centre: Container } {
  const { overlay, panel } = dialogFrame(textures, width, height);
  const centre = new Container();
  centre.position.set(width / 2, height / 2);
  panel.addChild(centre);
  return { overlay, centre };
}

/** A text box (0x2d14c): the text wrapped to the box's width, centred in it or set at its top left. */
function textBox(parent: Container, value: string, box: Box, style: Face, centredIn: boolean): Text {
  const node = new Text({
    text: value,
    style: {
      fontFamily: style.family,
      fontSize: style.size,
      fill: style.fill,
      ...(style.stroke === undefined ? {} : { stroke: { color: style.stroke, width: 3 } }),
      align: centredIn ? 'center' : 'left',
      wordWrap: true,
      wordWrapWidth: (box.x2 - box.x1) / (style.widthScale ?? 1),
    },
  });
  node.scale.x = style.widthScale ?? 1;
  if (centredIn) {
    node.anchor.set(0.5);
    node.position.set((box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2);
  } else node.position.set(box.x1, box.y1);
  // A long text is shrunk to the box rather than left to run out of the frame.
  const room = box.y2 - box.y1;
  if (!centredIn && node.height > room && room > 0) node.scale.set(Math.max(0.6, room / node.height));

  parent.addChild(node);
  return node;
}

// The dialogs name cached fonts, each a face at a fixed size with an effect: `FONTS.MAIN` is
// Brady Bunch at 14 in gold, `FONTS.ULTRA` Blue Stone at 20 and 0.8 of its width, `FONTS.WHITE`
// Teen Bold at 11 and `FONTS.TEEN` Teen Bold at 10 and 0.9 of its width with no effect.
export type Face = { family: string; size: number; fill: number; stroke?: number; widthScale?: number };
export const title = (): Face => ({ family: fontFamily(MAIN_FONT), size: 14, fill: 0xffc23a, stroke: 0x5a2a00 });
const ultra = (): Face => ({ family: fontFamily('FONTS.BLUE_STONE'), size: 20, fill: 0xffd75a, stroke: 0x5a2a00, widthScale: 0.8 });
export const white = (): Face => ({ family: fontFamily('FONTS.TEEN_BD'), size: 11, fill: 0xffffff });

/**
 * The rule the dialogs draw under their title (0x2c26c), `width` wide and centred at height `y`.
 * Where it is and how wide are read; what it is drawn with is not, so it is a thin light line.
 */
function rule(parent: Container, y: number, width: number): void {
  parent.addChild(new Graphics().rect(-width / 2, y, width, 1).fill({ color: 0xffffff, alpha: 0.5 }));
}

/**
 * A hint (0x4aedc): a 400×200 frame with its picture at (−160, −30), its text in the box
 * (−104, −80)–(200, 40) and Close at (0, 80). The game stops while it is up.
 */
export class HintDialog extends Container {
  constructor(textures: TextureStore, audio: AudioPlayer, strings: Strings, hint: TutorialHint, onClose: () => void) {
    super();
    const { overlay, centre } = centred(textures, 400, 200);
    const picture = textures.sprite(hint.image);
    picture.position.set(-160, -30);
    centre.addChild(picture);
    textBox(centre, strings.t(hint.text), { x1: -104, y1: -80, x2: 200, y2: 40 }, white(), false);
    dialogButton(textures, audio, centre, { x: 0, y: 80, width: 380, height: 30 }, strings.t('CLOSE'), fontFamily(SCORE_FONT), onClose);
    this.addChild(overlay);
  }
}

/**
 * What a day opens with (0x7d650): a 400×250 frame with the day's title in the box
 * (−187, −110)–(187, −80), its text in (−187, −65)–(187, 80), and Main Menu and Continue, 160
 * wide, at (−100, 105) and (100, 105).
 */
export class TutorialIntro extends Container {
  constructor(textures: TextureStore, audio: AudioPlayer, strings: Strings, day: number, onContinue: () => void, onMainMenu: () => void) {
    super();
    const { overlay, centre } = centred(textures, 400, 250);
    textBox(centre, strings.t(`TUTORIAL_DIALOG.LEVEL${day}.TITLE`), { x1: -187, y1: -110, x2: 187, y2: -80 }, title(), true);
    rule(centre, -80, 381);
    textBox(centre, strings.t(`TUTORIAL_DIALOG.LEVEL${day}.TEXT`), { x1: -187, y1: -65, x2: 187, y2: 80 }, white(), false);
    dialogButton(textures, audio, centre, { x: -100, y: 105, width: 160, height: 30 }, strings.t('TUTORIAL_DIALOG.MAIN_MENU'), fontFamily(SCORE_FONT), onMainMenu);
    dialogButton(textures, audio, centre, { x: 100, y: 105, width: 160, height: 30 }, strings.t('TUTORIAL_DIALOG.CONTINUE'), fontFamily(SCORE_FONT), onContinue);
    this.addChild(overlay);
  }
}

/**
 * What the day asks for (0x7dfe0): "Airport Academy - Day N" in the box (−187, −110)–(187, −80),
 * "To pass this day, you must:" in (−172, −70)–(172, −60), the day's goals in
 * (−170, −50)–(200, 60) and Continue, 260 wide, at (0, 105).
 */
export class TutorialGoalsDialog extends Container {
  constructor(textures: TextureStore, audio: AudioPlayer, strings: Strings, day: number, onContinue: () => void) {
    super();
    const { overlay, centre } = centred(textures, 400, 250);
    textBox(centre, strings.t('TUTORIAL_DIALOG.GOAL_TITLE', day), { x1: -187, y1: -110, x2: 187, y2: -80 }, title(), true);
    rule(centre, -85, 345);
    textBox(centre, strings.t('TUTORIAL_DIALOG.TO_PASS'), { x1: -172, y1: -70, x2: 172, y2: -60 }, white(), false);
    textBox(centre, strings.t(`TUTORIAL_DIALOG.LEVEL${day}.GOAL`), { x1: -170, y1: -50, x2: 200, y2: 60 }, white(), false);
    dialogButton(textures, audio, centre, { x: 0, y: 105, width: 260, height: 30 }, strings.t('TUTORIAL_DIALOG.CONTINUE'), fontFamily(SCORE_FONT), onContinue);
    this.addChild(overlay);
  }
}

/**
 * How the day went (0x7efb4): a 400×250 frame over the final report's star, or its spiral for a
 * fail (390×240); "Success" or "Failed" in the box (−150, −110)–(150, −80); the day's words for
 * it in (−185, −70)–(185, 60); and either Continue at (0, 105), or Try again at (0, 50) and Main
 * Menu at (0, 105), each 380 wide. It plays the final report's music and sound for the best
 * result or for a fail.
 */
export class TutorialReport extends Container {
  constructor(textures: TextureStore, audio: AudioPlayer, strings: Strings, day: number, passed: boolean, actions: { onContinue: () => void; onRetry: () => void; onMainMenu: () => void }) {
    super();
    const tier = passed ? 'SUPREME' : 'FAIL';
    audio.playMusic(`MUSICS.FINAL_REPORT.${tier}`);
    audio.play(`SOUNDS.FINAL_REPORT.${tier}`);
    const { overlay, centre } = centred(textures, 400, 250);
    const back = textures.sprite(passed ? 'GUI.FINAL_REPORT.BACK_STAR' : 'GUI.FINAL_REPORT.SPIRAL');
    back.anchor.set(0.5);
    back.setSize(390, 240);
    centre.addChild(back);
    textBox(centre, strings.t(passed ? 'TUTORIAL_REPORT.SUCCESS' : 'TUTORIAL_REPORT.FAILED'), { x1: -150, y1: -110, x2: 150, y2: -80 }, ultra(), true);
    rule(centre, -85, 380);
    textBox(centre, strings.t(`TUTORIAL_DIALOG.LEVEL${day}.${passed ? 'SUCCESS' : 'FAILED'}`), { x1: -185, y1: -70, x2: 185, y2: 60 }, white(), false);
    const family = fontFamily(SCORE_FONT);
    if (passed) dialogButton(textures, audio, centre, { x: 0, y: 105, width: 380, height: 30 }, strings.t('TUTORIAL_REPORT.CONTINUE'), family, actions.onContinue);
    else {
      dialogButton(textures, audio, centre, { x: 0, y: 50, width: 380, height: 30 }, strings.t('TUTORIAL_REPORT.TRY_AGAIN'), family, actions.onRetry);
      dialogButton(textures, audio, centre, { x: 0, y: 105, width: 380, height: 30 }, strings.t('TUTORIAL_REPORT.MAIN_MENU'), family, actions.onMainMenu);
    }
    this.addChild(overlay);
  }
}

/** How big a goal's mark is `clock` after it changed (0x7ab32): it pops in over a second. */
export const markPop = (clock: number): number => (clock < 1 ? (1 + Math.sin(4 * Math.PI * clock)) * clock * (1 - clock) + clock : 1);

/** Where the panel's top is with `shown` of its way up, its goals being `height` tall (0x7b312). */
export const panelTop = (height: number, shown: number): number => 350 - (height + 40) * shown * shown;

/** The text of a goal: the ones that count show how many of the two are done. */
export const goalText = (strings: Strings, g: TutorialGoal): string => (g.count === null ? strings.t(g.text) : strings.t(g.text, g.count));

/**
 * The goals kept on screen while a day is played. A row is 22 px tall, its box 12 px in and its
 * text 12 px further, in black `FONTS.TEEN` (Teen Bold at 10); done or failed, `INDICATORS.YES` or `INDICATORS.NO`
 * pops over the box at 0.45 of its size. The panel is as wide as its longest row and slides up
 * from under the screen, three times a second, when it is shown, and back down at five.
 */
export class GoalsPanel extends Container {
  private readonly rows: { goal: TutorialGoal; label: Text; yes: Sprite; no: Sprite; shown: string }[] = [];
  private readonly body = new Container();
  private readonly height_: number;
  private shown = 0;
  /** Set once the day has begun (0x7b49c), cleared when it ends. */
  visibleNow = false;

  constructor(
    textures: TextureStore,
    private readonly strings: Strings,
    tutorial: Tutorial,
  ) {
    super();
    let height = 0;
    let width = 0;
    const family = fontFamily('FONTS.TEEN_BD');
    for (const goal of tutorial.goals) {
      const y = height + 12;
      const box = textures.sprite('GUI.GOAL_CHECKBOX');
      box.position.set(12, y);
      const mark = (id: string): Sprite => {
        const sprite = textures.sprite(id);
        sprite.position.set(12, y + 6);
        sprite.visible = false;
        return sprite;
      };
      const yes = mark('INDICATORS.YES');
      const no = mark('INDICATORS.NO');
      const label = new Text({ text: goalText(strings, goal), style: { fontFamily: family, fontSize: 10, fill: 0x000000 } });
      label.anchor.set(0, 0.5);
      label.scale.x = 0.9;
      label.position.set(24, y);
      this.body.addChild(box, yes, no, label);
      this.rows.push({ goal, label, yes, no, shown: label.text });
      height += 22;
      width = Math.max(width, label.width + 20);
    }
    this.height_ = height;

    // 0x7b2cc: the top edge stretched nine times across, the corner after it, the right edge
    // stretched three times down under the corner, and the colour filling the rest.
    const top = textures.sprite('GUI.TUTORIAL_BACK_TOP');
    const corner = textures.sprite('GUI.TUTORIAL_BACK_CORNER');
    const right = textures.sprite('GUI.TUTORIAL_BACK_RIGHT');
    const fill = textures.sprite('GUI.TUTORIAL_BACK_COLOR');
    const fastener = textures.sprite('GUI.TUTORIAL_FASTENER');
    const across = 9 * top.texture.width;
    const left = width - across + 5;
    top.position.set(left, 0);
    top.scale.set(9, 1);
    corner.position.set(left + across, 0);
    right.position.set(left + across, corner.texture.height);
    right.scale.set(1, 3);
    fill.position.set(left, corner.texture.height);
    fill.setSize(across, 3 * right.texture.height);
    fastener.position.set(36, -16);
    this.body.position.set(0, 10);
    this.addChild(top, corner, right, fill, fastener, this.body);
    this.y = panelTop(height, 0);
  }

  update(dt: number): void {
    this.shown = this.visibleNow ? Math.min(1, this.shown + 3 * dt) : Math.max(0, this.shown - 5 * dt);
    this.y = panelTop(this.height_, this.shown);
    this.visible = this.shown > 0;
    for (const row of this.rows) {
      const text = goalText(this.strings, row.goal);
      if (text !== row.shown) {
        row.label.text = text;
        row.shown = text;
      }
      const mark = row.goal.state === 'done' ? row.yes : row.goal.state === 'failed' ? row.no : null;
      row.yes.visible = mark === row.yes;
      row.no.visible = mark === row.no;
      mark?.scale.set(0.45 * markPop(row.goal.clock));
    }
  }
}
