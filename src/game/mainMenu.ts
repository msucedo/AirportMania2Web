import { Container, Rectangle, Text, type Application } from 'pixi.js';
import type { GameData } from '../data/load';
import type { Strings } from '../data/strings';
import type { AudioPlayer } from '../engine/audio';
import { fontFamily, loadFonts } from '../engine/fonts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../engine/screen';
import type { TextureStore } from '../engine/textures';
import { MAIN_FONT } from './view/floatingText';

const SURFACES = ['MAIN_MENU.BACK', 'MAIN_MENU.TOWER', 'MAIN_MENU.FRONT', 'MAIN_MENU.PANEL', 'MAIN_MENU.TITLE', 'MAIN_MENU.FRANCHISE', 'MAIN_MENU.NUMBER_TWO', 'MAIN_MENU.BUTTON_OVER'];

export type MenuEntry = 'PLAY' | 'USERS' | 'OPTIONS' | 'CREDITS';

/** Rows of the panel, top to bottom, with the y of each relative to the panel (0x5c2ec–0x5c382). */
const ENTRIES: readonly (readonly [MenuEntry, number])[] = [
  ['PLAY', 43],
  ['USERS', 81],
  ['OPTIONS', 119],
  ['CREDITS', 157],
];
const PANEL = { x: 240, y: 118 };
const BUTTON = { x: 119, halfWidth: 80, halfHeight: 15 };

export interface MainMenuOptions {
  strings: Strings;
  /** Entries that do something; the rest are shown dimmed. */
  enabled: readonly MenuEntry[];
  onSelect: (entry: MenuEntry) => void;
}

/**
 * The original main menu, laid out with the positions of its builder (0x597b0): sky, control
 * tower at (36, 77), terminal at (−48, 152), the sign with its four entries at (240, 118), and
 * the title, "Wild Trips" and the "2" at 0.8, 0.7 and 0.7 of their size. The original slides and
 * drops these in and flies a plane past; here they are in place from the start. The promotional
 * buttons (more games, Facebook) are left out.
 */
export class MainMenu {
  readonly root = new Container();

  private constructor(textures: TextureStore, audio: AudioPlayer, options: MainMenuOptions) {
    const back = textures.sprite('MAIN_MENU.BACK');
    back.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
    const tower = textures.sprite('MAIN_MENU.TOWER');
    tower.position.set(36, 77);
    const front = textures.sprite('MAIN_MENU.FRONT');
    front.position.set(-48, 152);
    const title = textures.sprite('MAIN_MENU.TITLE');
    title.position.set(213, 43);
    title.scale.set(0.8);
    const franchise = textures.sprite('MAIN_MENU.FRANCHISE');
    franchise.position.set(270, 96);
    franchise.scale.set(0.7);
    const two = textures.sprite('MAIN_MENU.NUMBER_TWO');
    two.position.set(411, 46);
    two.scale.set(0.7);

    const panel = new Container();
    panel.position.set(PANEL.x, PANEL.y);
    panel.addChild(textures.sprite('MAIN_MENU.PANEL'));
    for (const [entry, y] of ENTRIES) {
      const enabled = options.enabled.includes(entry);
      const highlight = textures.sprite('MAIN_MENU.BUTTON_OVER');
      highlight.position.set(BUTTON.x, y);
      highlight.visible = false;
      const label = new Text({ text: options.strings.t(`MAIN_MENU.${entry}`), style: { fontFamily: fontFamily(MAIN_FONT), fontSize: 15, fill: 0xf9e27d } });
      label.anchor.set(0.5);
      label.position.set(BUTTON.x, y);
      label.alpha = enabled ? 1 : 0.4;
      panel.addChild(highlight, label);
      if (!enabled) continue;

      const button = new Container();
      button.hitArea = new Rectangle(BUTTON.x - BUTTON.halfWidth, y - BUTTON.halfHeight, BUTTON.halfWidth * 2, BUTTON.halfHeight * 2);
      button.eventMode = 'static';
      button.cursor = 'pointer';
      const over = (on: boolean): void => {
        highlight.visible = on;
        label.style.fill = on ? 0x4a4450 : 0xf9e27d;
      };
      button.on('pointerover', () => over(true));
      button.on('pointerout', () => over(false));
      button.on('pointerdown', () => {
        over(true);
        audio.play('SOUNDS.CLICK');
        options.onSelect(entry);
      });
      panel.addChild(button);
    }
    this.root.addChild(back, tower, front, panel, title, franchise, two);
  }

  static async create(app: Application, data: GameData, textures: TextureStore, audio: AudioPlayer, options: MainMenuOptions): Promise<MainMenu> {
    await Promise.all([textures.load(SURFACES), loadFonts(data.resources, [MAIN_FONT])]);
    const menu = new MainMenu(textures, audio, options);
    app.stage.addChild(menu.root);
    // Browsers only allow sound after a gesture, so the music starts with the first touch.
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.once('pointerdown', () => audio.playMusic('MUSICS.MAIN'));
    audio.preload(['SOUNDS.CLICK']);
    return menu;
  }
}
