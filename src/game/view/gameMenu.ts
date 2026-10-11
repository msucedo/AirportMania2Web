import { BORDER } from './faces';
import { Container, NineSliceSprite, Rectangle, Text, type FederatedPointerEvent, type Sprite } from 'pixi.js';
import { LANGUAGES, type Language, type Strings } from '../../data/strings';
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
  'GUI.DIALOGS.ARROW',
  ...LANGUAGES.map((language) => `FLAGS.${language.toUpperCase()}`),
];

export type MenuExit = 'resume' | 'restart' | 'map' | 'mainMenu';
type Page = 'menu' | 'options' | 'finish' | 'language' | 'askRestart' | 'askMap';

const WIDTH = 340;
/** Frame heights: the options page, the in-game menu (0x66c00) and the finish dialog (0x3773c). */
const HEIGHT: Record<Page, number> = { options: 220, menu: 240, finish: 260, language: 220, askRestart: 200, askMap: 200 };
/** The two questions (0x373e8, 0x3710c) are 400 wide. */
const ASK_WIDTH = 400;
const SLIDER = { x: 85, width: 150 };

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
 * Help is not available. Advanced leads, instead of the original's device switches (`0x2220`),
 * to a choice of language, which the original takes from the device; it is offered outside a
 * level only, since a new language reloads the page. Slider width and button height are assumed.
 */
export class GameMenu extends Container {
  private settings: Settings;
  private readonly startLanguage: Language;

  constructor(
    private readonly textures: TextureStore,
    private readonly audio: AudioPlayer,
    private readonly options: GameMenuOptions,
  ) {
    super();
    this.settings = { ...options.settings };
    this.startLanguage = options.settings.language;
    this.show(options.inGame ? 'menu' : 'options');
  }

  private show(page: Page): void {
    const old = this.removeChildren();
    // Destroyed once the touch that changed the page has been dispatched.
    setTimeout(() => old.forEach((child) => child.destroy({ children: true })));
    const height = HEIGHT[page];
    const width = page === 'askRestart' || page === 'askMap' ? ASK_WIDTH : WIDTH;
    const { overlay, panel } = dialogFrame(this.textures, width, height);
    const centre = new Container();
    centre.position.set(width / 2, height / 2);
    panel.addChild(centre);
    this.addChild(overlay);
    const { strings, inGame } = this.options;
    const family = fontFamily(SCORE_FONT);
    const bottom = height / 2 - 20;
    const button = (y: number, text: string, onPress: (() => void) | null, width = 280): void => {
      if (onPress) return dialogButton(this.textures, this.audio, centre, { x: 0, y, width, height: 38 }, text, family, onPress);
      dialogText(centre, text, 0, y + 6, 14, family, 0.5).alpha = 0.35;
    };

    if (page === 'menu') {
      button(bottom - 190, strings.t('OPTIONS_DIALOG.OPTIONS'), () => this.show('options'));
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
      const question = new Text({
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
      this.volume(centre, top + 15, strings.t('OPTIONS_DIALOG.SOUND_FX'), 'sound');
      this.volume(centre, top + 65, strings.t('OPTIONS_DIALOG.MUSIC'), 'music');
      button(bottom - 60, strings.t('OPTIONS_DIALOG.ADVANCED_OPTIONS'), inGame ? null : () => this.show('language'));
      button(bottom, strings.t('BACK'), () => (inGame ? this.show('menu') : this.options.onExit('resume')));
    } else {
      dialogText(centre, strings.t('OPTIONS_DIALOG.LANGUAGE'), 0, -70, 16, fontFamily(MAIN_FONT), 0.5);
      const flag = this.textures.sprite(`FLAGS.${this.settings.language.toUpperCase()}`);
      flag.position.set(0, -20);
      centre.addChild(flag);
      for (const step of [-1, 1]) {
        const arrow = this.textures.sprite('GUI.DIALOGS.ARROW');
        arrow.position.set(step * 130, -20);
        // The art points left.
        arrow.scale.x = -step;
        arrow.eventMode = 'static';
        arrow.cursor = 'pointer';
        arrow.hitArea = new Rectangle(-20, -20, 40, 40);
        arrow.on('pointerdown', (event: FederatedPointerEvent) => {
          event.stopPropagation();
          this.audio.play('SOUNDS.CLICK');
          const index = (LANGUAGES.indexOf(this.settings.language) + step + LANGUAGES.length) % LANGUAGES.length;
          this.change({ language: LANGUAGES[index] as Language });
          flag.texture = this.textures.texture(`FLAGS.${this.settings.language.toUpperCase()}`);
        });
        centre.addChild(arrow);
      }
      button(bottom, strings.t('BACK'), () => {
        // Texts are loaded once per page, so a new language needs the page again.
        if (this.settings.language !== this.startLanguage) location.reload();
        else this.show('options');
      });
    }
  }

  private change(part: Partial<Settings>): void {
    this.settings = { ...this.settings, ...part };
    this.audio.setVolumes(this.settings.sound, this.settings.music);
    this.options.onSettings(this.settings);
  }

  /** One row of the options (0x66cf8–0x66e1a): switch at x −145, label at −115, slider centred on x 85. */
  private volume(centre: Container, y: number, label: string, channel: 'sound' | 'music'): void {
    dialogText(centre, label, -115, y + 5, 13, fontFamily(MAIN_FONT), 0);
    const left = SLIDER.x - SLIDER.width / 2;
    const bar = new NineSliceSprite({ texture: this.textures.texture('GUI.DIALOGS.BAR'), leftWidth: 8, rightWidth: 8, topHeight: 5, bottomHeight: 5 });
    bar.setSize(SLIDER.width + 12, 12);
    bar.position.set(left - 6, y - 6);
    const knob: Sprite = this.textures.sprite('GUI.DIALOGS.NIPPLE');
    const box = this.textures.sprite('GUI.DIALOGS.CHECKBOX_BACK');
    box.position.set(-145, y);
    box.scale.set(0.6);
    const tick = this.textures.sprite('GUI.DIALOGS.CHECKBOX_ON');
    tick.position.set(-145, y);
    tick.scale.set(0.6);
    // The switch turns the channel off and back to where the slider was.
    let remembered = this.settings[channel] > 0 ? this.settings[channel] : 1;
    const draw = (): void => {
      knob.position.set(left + SLIDER.width * this.settings[channel], y);
      tick.visible = this.settings[channel] > 0;
    };
    box.eventMode = 'static';
    box.cursor = 'pointer';
    box.hitArea = new Rectangle(-24, -24, 48, 48);
    box.on('pointerdown', (event: FederatedPointerEvent) => {
      event.stopPropagation();
      if (this.settings[channel] > 0) remembered = this.settings[channel];
      this.change({ [channel]: this.settings[channel] > 0 ? 0 : remembered });
      draw();
      this.audio.play('SOUNDS.CLICK');
    });

    const zone = new Container();
    zone.hitArea = new Rectangle(left - 14, y - 18, SLIDER.width + 28, 36);
    zone.eventMode = 'static';
    zone.cursor = 'pointer';
    let held = false;
    const move = (event: FederatedPointerEvent): void => {
      this.change({ [channel]: Math.max(0, Math.min(1, (centre.toLocal(event.global).x - left) / SLIDER.width)) });
      draw();
    };
    zone.on('pointerdown', (event: FederatedPointerEvent) => {
      event.stopPropagation();
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
    centre.addChild(box, tick, bar, knob, zone);
    draw();
  }
}
