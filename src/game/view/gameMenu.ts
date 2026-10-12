import { Label } from './effectText';
import { BORDER, MAIN_FILL } from './faces';
import { Container, NineSliceSprite, Rectangle, type FederatedPointerEvent, type Sprite } from 'pixi.js';
import type { Strings } from '../../data/strings';
import { paletteSamples, usePalette } from '../palette';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import type { Settings } from '../settings';
import { DIALOG_SURFACES, dialogButton, dialogFrame, dialogText } from './dialog';
import { MAIN_FONT, SCORE_FONT } from './floatingText';

export const GAME_MENU_SURFACES = [
  ...DIALOG_SURFACES,
  'GUI.DIALOGS.BAR',
  'GUI.DIALOGS.NIPPLE',
  'GUI.DIALOGS.NIPPLE_OVER',
  'GUI.DIALOGS.CHECKBOX_BACK',
  'GUI.DIALOGS.CHECKBOX_ON',
  'GUI.DIALOGS.CHECKBOX_OVER',
  'GUI.COLOR_HELP.COLOR',
  'GUI.COLOR_HELP.FRONT',
];

export type MenuExit = 'resume' | 'restart' | 'map' | 'mainMenu';
type Page = 'menu' | 'options' | 'gameOptions' | 'advanced' | 'palette' | 'finish' | 'askRestart' | 'askMap';

const WIDTH = 340;
/**
 * Frame heights: the options page, the in-game menu (0x66c00), the finish dialog (0x3773c), the
 * two kinds of the options' own dialog (0x2220) and the colour help (0x265ac).
 */
const HEIGHT: Record<Page, number> = { options: 220, gameOptions: 240, advanced: 220, palette: 250, menu: 240, finish: 260, askRestart: 200, askMap: 200 };
/** The two questions (0x373e8, 0x3710c) and the colour help are 400 wide; the options' own dialog 360. */
const WIDE: Partial<Record<Page, number>> = { askRestart: 400, askMap: 400, palette: 400, gameOptions: 360, advanced: 360 };
const SLIDER = { x: 85, width: 120 };

export interface GameMenuOptions {
  strings: Strings;
  settings: Settings;
  /** True from a level's menu button; false from the main menu, where it opens on the options. */
  inGame: boolean;
  onSettings: (settings: Settings) => void;
  onExit: (how: MenuExit) => void;
  /** Opens the help in place of the menu; without it the entry is greyed. */
  onHelp?: () => void;
}

/**
 * The original's menu dialog (`0x66bbc`), used two ways. From a level's menu button it lists
 * Options, Help, Finish game and Resume, and Finish game asks where to go (`0x376c4`: restart,
 * map, main menu or resume). From the main menu's Options it shows the options page straight
 * away: sound and music, each with a switch and a slider, then Advanced and Back. Positions are
 * from the centre of a 340 px wide frame.
 *
 * The options' own dialog (`0x2220`) comes two ways too. A level's Options (`0x678e8`) opens it
 * with sound and music and the three switches (turn with the device, show tips, tap on
 * bubbles); the options page's Advanced (`0x67b80`) opens it with the three switches and the
 * colour help (`0x265ac`), where one of four colour tables is picked.
 */
export class GameMenu extends Container {
  private settings: Settings;

  constructor(
    private readonly textures: TextureStore,
    private readonly audio: AudioPlayer,
    private readonly options: GameMenuOptions,
  ) {
    super();
    this.settings = { ...options.settings };
    this.show(options.inGame ? 'menu' : 'options');
  }

  private show(page: Page): void {
    const old = this.removeChildren();
    // Destroyed once the touch that changed the page has been dispatched.
    setTimeout(() => old.forEach((child) => child.destroy({ children: true })));
    const height = HEIGHT[page];
    const width = WIDE[page] ?? WIDTH;
    const { overlay, panel } = dialogFrame(this.textures, width, height);
    const centre = new Container();
    centre.position.set(width / 2, height / 2);
    panel.addChild(centre);
    this.addChild(overlay);
    const { strings } = this.options;
    const family = fontFamily(SCORE_FONT);
    const bottom = height / 2 - 20;
    const button = (y: number, text: string, onPress: (() => void) | null, width = 280): void => {
      if (onPress) return dialogButton(this.textures, this.audio, centre, { x: 0, y, width, height: 38 }, text, family, onPress);
      dialogText(centre, text, 0, y + 6, 14, family, 0.5).alpha = 0.35;
    };

    if (page === 'menu') {
      button(bottom - 190, strings.t('OPTIONS_DIALOG.OPTIONS'), () => this.show('gameOptions'));
      button(bottom - 130, strings.t('IN_GAME_MENU_DIALOG.HELP'), this.options.onHelp ?? null);
      button(bottom - 70, strings.t('IN_GAME_MENU_DIALOG.FINISH_GAME'), () => this.show('finish'));
      button(bottom, strings.t('RESUME'), () => this.options.onExit('resume'));
    } else if (page === 'finish') {
      // 0x380e4, 0x37e44: restarting and going to the map are asked about first; the main menu is not.
      button(-100, strings.t('FINISH_GAME_DIALOG.RESTART_LEVEL'), () => this.show('askRestart'), 310);
      button(-40, strings.t('FINISH_GAME_DIALOG.MAP'), () => this.show('askMap'), 310);
      button(20, strings.t('FINISH_GAME_DIALOG.MAIN_MENU'), () => this.options.onExit('mainMenu'), 310);
      button(110, strings.t('RESUME'), () => this.options.onExit('resume'), 310);
    } else if (page === 'askRestart' || page === 'askMap') {
      // The question in (−200, −100)–(200, 40), Yes at (−105, 80) and No at (105, 80), 170 wide.
      // No goes back to the finish dialog (0x38384, 0x388c4).
      const restart = page === 'askRestart';
      const question = new Label({
        text: strings.t(restart ? 'RESTART_LEVEL_DIALOG.TEXT' : 'GO_TO_MAP_LEVEL_DIALOG.TEXT'),
        style: { fontFamily: fontFamily('FONTS.TEEN_BD'), fontSize: 11, fill: 0xffffff, stroke: BORDER, align: 'center', wordWrap: true, wordWrapWidth: 400 },
      });
      question.anchor.set(0.5);
      question.position.set(0, -30);
      centre.addChild(question);
      dialogButton(this.textures, this.audio, centre, { x: -105, y: 80, width: 170, height: 30 }, strings.t('YES'), family, () => this.options.onExit(restart ? 'restart' : 'map'));
      dialogButton(this.textures, this.audio, centre, { x: 105, y: 80, width: 170, height: 30 }, strings.t('NO'), family, () => this.show('finish'));
    } else if (page === 'options') {
      const top = -height / 2 + 10;
      this.volume(centre, top + 15, strings.t('OPTIONS_DIALOG.SOUND_FX'), 'sound', { box: -145, label: -115, slider: SLIDER.x });
      this.volume(centre, top + 65, strings.t('OPTIONS_DIALOG.MUSIC'), 'music', { box: -145, label: -115, slider: SLIDER.x });
      button(bottom - 60, strings.t('OPTIONS_DIALOG.ADVANCED_OPTIONS'), () => this.show('advanced'));
      button(bottom, strings.t('BACK'), () => this.options.onExit('resume'));
    } else if (page === 'gameOptions') {
      // 0x2510: sound at y −105 and music at −65, switch at x −160, label from −130, slider on
      // x 100; the three switches' labels from x −160 at y −25, 15 and 55; Back at y 100.
      this.volume(centre, -105, strings.t('OPTIONS_DIALOG.SOUND_FX'), 'sound', { box: -160, label: -130, slider: 100 });
      this.volume(centre, -65, strings.t('OPTIONS_DIALOG.MUSIC'), 'music', { box: -160, label: -130, slider: 100 });
      this.switches(centre, -160, [-25, 15, 55]);
      button(100, strings.t('BACK'), () => this.show('menu'), 310);
    } else if (page === 'advanced') {
      // 0x22ee: labels from x −155 at y −95, −55 and −15; the colour help at y 35; Back at y 90.
      this.switches(centre, -155, [-95, -55, -15]);
      button(35, strings.t('OPTIONS_DIALOG.COLOR_HELP'), () => this.show('palette'), 310);
      button(90, strings.t('BACK'), () => this.show('options'), 310);
    } else {
      // 0x265ac: the text in (−180, −120)–(180, −90); four rows from x −170 at y −75, −30, 15
      // and 60; Back at y 110, 380 wide.
      const text = new Label({ text: strings.t('PALETTE_SELECTION_DIALOG.TEXT'), style: { fontFamily: fontFamily('FONTS.TEEN_BD'), fontSize: 11, fill: 0xffffff, stroke: BORDER } });
      text.anchor.set(0.5);
      text.position.set(0, -105);
      if (text.width > 360) text.scale.set(360 / text.width);
      centre.addChild(text);
      const draws: (() => void)[] = [];
      [-75, -30, 15, 60].forEach((y, index) => {
        draws.push(
          this.checkBox(centre, -170, y, () => this.settings.palette === index, () => {
            // 0x26488: picking one puts its colours in use.
            this.change({ palette: index });
            usePalette(index);
            for (const draw of draws) draw();
          }),
        );
        // 0x26abc: its seven colours, 40 px apart from 60 px right of the box.
        paletteSamples(index).forEach((colour, k) => {
          const tinted = this.textures.sprite('GUI.COLOR_HELP.COLOR');
          tinted.tint = colour;
          const front = this.textures.sprite('GUI.COLOR_HELP.FRONT');
          tinted.position.set(-170 + 60 + 40 * k, y);
          front.position.copyFrom(tinted.position);
          centre.addChild(tinted, front);
        });
      });
      button(110, strings.t('BACK'), () => this.show('advanced'), 380);
    }
  }

  /** The three switches of the options' own dialog (0x2f60c, 0x2f688, 0x2f704), each at x 145 on its label's line. */
  private switches(centre: Container, labelX: number, rows: readonly [number, number, number]): void {
    const { strings } = this.options;
    const row = (y: number, text: string, key: 'autoOrientate' | 'showTips' | 'bubbleClicking'): void => {
      dialogText(centre, text, labelX, y, 14, fontFamily(MAIN_FONT), 0).style.fill = MAIN_FILL;
      this.checkBox(centre, 145, y, () => this.settings[key], () => this.change({ [key]: !this.settings[key] }));
    };
    row(rows[0], strings.t('OPTIONS_DIALOG.AUTO_ORIENTATE'), 'autoOrientate');
    row(rows[1], strings.t('OPTIONS_DIALOG.SHOW_TIPS'), 'showTips');
    row(rows[2], strings.t('OPTIONS_DIALOG.BUBBLE_CLICKING'), 'bubbleClicking');
  }

  /**
   * A check box (0x2dad8; update 0x2d9ec, draw 0x2d944): its back, its pressed picture coming in
   * at 8 a second while it is held, and its mark while it is on. It changes as it is let go.
   * Returns what redraws it.
   */
  private checkBox(centre: Container, x: number, y: number, on: () => boolean, toggle: () => void): () => void {
    const box = this.textures.sprite('GUI.DIALOGS.CHECKBOX_BACK');
    const over = this.textures.sprite('GUI.DIALOGS.CHECKBOX_OVER');
    const mark = this.textures.sprite('GUI.DIALOGS.CHECKBOX_ON');
    for (const part of [box, over, mark]) part.position.set(x, y);
    over.alpha = 0;
    const draw = (): void => void (mark.visible = on());
    let held = false;
    let pressed = 0;
    let last = performance.now();
    box.onRender = () => {
      const now = performance.now();
      pressed = Math.max(0, Math.min(1, pressed + (held ? 8 : -8) * Math.min(0.1, (now - last) / 1000)));
      last = now;
      over.alpha = pressed;
    };
    // The touch area is its own node, like a button's: the picture does not take presses reliably.
    const zone = new Container();
    zone.hitArea = new Rectangle(x - 20, y - 20, 40, 40);
    zone.eventMode = 'static';
    zone.cursor = 'pointer';
    zone.on('pointerdown', (event: FederatedPointerEvent) => {
      event.stopPropagation();
      held = true;
    });
    const release = (): void => void (held = false);
    zone.on('pointerout', release);
    zone.on('pointerupoutside', release);
    zone.on('pointerup', () => {
      if (!held) return;
      held = false;
      toggle();
      draw();
      this.audio.play('SOUNDS.CLICK');
    });
    centre.addChild(box, over, mark, zone);
    draw();
    return draw;
  }

  private change(part: Partial<Settings>): void {
    this.settings = { ...this.settings, ...part };
    this.audio.setVolumes(this.settings.sound, this.settings.music);
    this.options.onSettings(this.settings);
  }

  /** One row of sound or music (0x66cf8–0x66e1a, 0x2576): a switch, a label and a slider centred on its x. */
  private volume(centre: Container, y: number, label: string, channel: 'sound' | 'music', at: { box: number; label: number; slider: number }): void {
    dialogText(centre, label, at.label, y, 14, fontFamily(MAIN_FONT), 0).style.fill = MAIN_FILL;
    const left = at.slider - SLIDER.width / 2;
    // 0x2d864: the bar's picture, its 10 px ends kept, drawn out to the slider's 120 px (0x2f3da)
    // and 10 more, from 5 px left of it and 5 above.
    const bar = new NineSliceSprite({ texture: this.textures.texture('GUI.DIALOGS.BAR'), leftWidth: 10, rightWidth: 10, topHeight: 0, bottomHeight: 0 });
    bar.setSize(SLIDER.width + 10, bar.texture.height);
    bar.position.set(left - 5, y - 5);
    const knob: Sprite = this.textures.sprite('GUI.DIALOGS.NIPPLE');
    // The switch turns the channel off and back to where the slider was.
    let remembered = this.settings[channel] > 0 ? this.settings[channel] : 1;
    const redraw = this.checkBox(centre, at.box, y, () => this.settings[channel] > 0, () => {
      if (this.settings[channel] > 0) remembered = this.settings[channel];
      this.change({ [channel]: this.settings[channel] > 0 ? 0 : remembered });
      draw();
    });
    const draw = (): void => {
      knob.position.set(left + SLIDER.width * this.settings[channel], y);
      redraw();
    };

    const zone = new Container();
    // 0x2d6c6: it takes the finger from 13 px before to 13 after, and 22 above and below.
    zone.hitArea = new Rectangle(left - 13, y - 22, SLIDER.width + 26, 44);
    zone.eventMode = 'static';
    zone.cursor = 'pointer';
    let held = false;
    const move = (event: FederatedPointerEvent): void => {
      this.change({ [channel]: Math.max(0, Math.min(1, (centre.toLocal(event.global).x - left) / SLIDER.width)) });
      draw();
    };
    zone.on('pointerdown', (event: FederatedPointerEvent) => {
      event.stopPropagation();
      console.log('box down');
      held = true;
      knob.texture = this.textures.texture('GUI.DIALOGS.NIPPLE_OVER');
      move(event);
    });
    zone.on('globalpointermove', (event: FederatedPointerEvent) => {
      if (held) move(event);
    });
    const release = (): void => {
      if (!held) return;
      held = false;
      knob.texture = this.textures.texture('GUI.DIALOGS.NIPPLE');
      if (channel === 'sound') this.audio.play('SOUNDS.CLICK');
    };
    zone.on('pointerup', release);
    zone.on('pointerupoutside', release);
    centre.addChild(bar, knob, zone);
    draw();
  }
}
