import { Label } from './view/effectText';
import { BORDER, MAIN_FILL } from './view/faces';
import { Container, Matrix, Rectangle, Text, type Application, type Sprite } from 'pixi.js';
import type { GameData } from '../data/load';
import type { Strings } from '../data/strings';
import type { AudioPlayer } from '../engine/audio';
import { fontFamily, loadFonts } from '../engine/fonts';
import type { TextureStore } from '../engine/textures';
import { MAIN_FONT, SCORE_FONT } from './view/floatingText';

const SURFACES = ['MAIN_MENU.BACK', 'MAIN_MENU.TOWER', 'MAIN_MENU.FRONT', 'MAIN_MENU.PANEL', 'MAIN_MENU.TITLE', 'MAIN_MENU.FRANCHISE', 'MAIN_MENU.NUMBER_TWO', 'MAIN_MENU.BUTTON_OVER', 'MAIN_MENU.CLOUD1', 'MAIN_MENU.CLOUD2', 'MAIN_MENU.PLANE_PASSING_IN', 'MAIN_MENU.PLANE_PASSING_OUT'];

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
  /** The menu is being started by the loading screen (0x59740), not come back to. */
  afterLoading: boolean;
}

/** How far everything starts out of place, in px; each piece takes its own share of it. */
export const MENU_SHIFT = 80;

/**
 * A step of the shift (0x59c80): it loses one and a half of itself a second, times the menu's
 * clock, and is dropped under 0.02. The clock (0x59c52) runs up to 1 and nothing is lost while
 * it is not over 0: started by the loading screen it begins at −3, otherwise at 1.
 */
export function menuShiftStep(shift: number, dt: number, clock = 1): number {
  if (clock <= 0) return shift;
  const next = shift - 1.5 * shift * dt * Math.min(1, clock);
  return next < 0.02 ? 0 : next;
}

/** How many of its widths a sky layer slides left each second (0x5d36c): the sky, then the two bands of cloud. */
export const skySpeed = (layer: number): number => 0.0025 + 0.002 * layer * layer;

export type SlideState = { phase: 'waiting' | 'coming' | 'settling' | 'still'; clock: number };

/**
 * A step of the title's or the franchise's entrance (0x5c030, 0x5bc68): it waits, comes across
 * in a third of a second leaning, and rocks upright over half a second. Returns true on the step
 * it starts coming, when its sound plays.
 */
export function slideStep(state: SlideState, dt: number, wait: number): boolean {
  switch (state.phase) {
    case 'waiting':
      state.clock += dt;
      if (state.clock <= wait) return false;
      state.phase = 'coming';
      state.clock = 0;
      return true;
    case 'coming':
      state.clock += 3 * dt;
      if (state.clock > 1) {
        state.phase = 'settling';
        state.clock = 1;
      }
      return false;
    case 'settling':
      state.clock -= 2 * dt;
      if (state.clock < 0) {
        state.phase = 'still';
        state.clock = 0;
      }
      return false;
    case 'still':
      return false;
  }
}

/** Where a sliding piece is from its place and how much it leans, or nothing while it waits; `side` is −1 from the left, 1 from the right. */
export function slidePose(state: SlideState, side: -1 | 1): { dx: number; lean: number } | null {
  switch (state.phase) {
    case 'waiting':
      return null;
    case 'coming':
      return { dx: (1 - Math.min(1, state.clock)) * 480 * side, lean: -0.3 * side };
    case 'settling':
      return { dx: 0, lean: -0.3 * side * state.clock * Math.cos(4 * Math.PI * state.clock * state.clock) };
    case 'still':
      return { dx: 0, lean: 0 };
  }
}

/** The size of the "2" `clock` seconds after it appears (0x5b990): it springs out and settles within a second. */
export function numberPop(clock: number): number {
  if (clock <= 0) return 0;
  if (clock >= 1) return 1;
  return Math.pow(2, -10 * clock) * Math.sin(((clock - 0.0477465) * 2 * Math.PI) / 0.3) + 1;
}

/**
 * A plane flying past `t` seconds on (0x5a228), for the four seconds it lasts: where it is from
 * the middle of the screen's width, how high, and its size. One going in starts close overhead
 * and shrinks towards the skyline; one coming out does the opposite. `drift` is its own random
 * sideways lean, from −240 to 240.
 */
export function passingPlanePose(t: number, inward: boolean, drift: number): { x: number; y: number; scale: number; depth: number } {
  const depth = 2 * (inward ? t + 1 : 5 - t);
  return { x: drift / (depth + 1), y: 340 - 1180 / depth, scale: 3 / depth, depth };
}

/** The two build numbers shown small in the corner (0x23250, 0xcac18). */
export const BUILD_LABEL = 'G495.L498';

const TITLE = { x: 213, y: 43, share: 0.8, wait: 0.1, side: -1 as const, sound: 'SOUNDS.TITLE' };
const FRANCHISE = { x: 270, y: 96, share: 0.7, wait: 0.6, side: 1 as const, sound: 'SOUNDS.FRANCHISE' };
const NUMBER = { x: 411, y: 46, share: 0.7, delay: 2.9 };
const PLANE_EVERY = 18;
const PLANE_LIFE = 4;
const PLANES_KEY = 'am2web.menuPlanes';

/**
 * The main menu (enter 0x597b0, update 0x59bf0): three layers of sky sliding by, the control
 * tower at (36, 77), the terminal at (−48, 152), the sign with its four entries at (240, 118),
 * the title, "Wild Trips" and the "2", and a plane flying past every 18 seconds. Everything
 * starts shifted to the right and eases into place. Started by the loading screen (0x59740)
 * it holds still for 3 s first, its first plane comes after 8 s going in, and the build label
 * shows later; come back to, the planes go on from where they were. The promotional pieces (a "try the PC
 * version" badge, more games, Facebook) are left out.
 */
export class MainMenu {
  readonly root = new Container();
  private shift = MENU_SHIFT;
  private time = 0;
  private readonly sky: { tiles: Sprite[]; width: number; offset: number }[] = [];
  private readonly planes = new Container();
  private readonly flying: { sprite: Sprite; t: number; inward: boolean; drift: number }[] = [];
  private clock = 1;
  private labelAt = 5.8;
  private nextPlane = 8;
  private nextInward = true;
  private readonly tower: Sprite;
  private readonly front: Sprite;
  private readonly panel = new Container();
  private readonly title: { sprite: Sprite; state: SlideState };
  private readonly franchise: { sprite: Sprite; state: SlideState };
  private readonly two: Sprite;
  private readonly label: Text;

  private constructor(
    private readonly textures: TextureStore,
    private readonly audio: AudioPlayer,
    options: MainMenuOptions,
  ) {
    if (options.afterLoading) {
      // 0x59750: the loading screen starts the menu with these.
      this.clock = -3;
      this.labelAt = 6.9;
    } else {
      // The original keeps one menu for the whole run, so its planes' wait and turn go on.
      // This one is made anew with each visit and keeps them with the visit instead.
      try {
        const kept = /^(-?[\d.]+),([01])$/.exec(sessionStorage.getItem(PLANES_KEY) ?? '');
        if (kept) [this.nextPlane, this.nextInward] = [Number(kept[1]), kept[2] === '1'];
      } catch {
        // Storage is off: they start as after the loading.
      }
    }
    window.addEventListener('pagehide', () => {
      try {
        sessionStorage.setItem(PLANES_KEY, `${this.nextPlane.toFixed(2)},${this.nextInward ? 1 : 0}`);
      } catch {
        // Storage is off.
      }
    });
    const skies = new Container();
    for (const id of ['MAIN_MENU.BACK', 'MAIN_MENU.CLOUD1', 'MAIN_MENU.CLOUD2']) {
      // 0x5d2c8: each layer is drawn three times side by side, at the height its image names.
      const tiles = [0, 1, 2].map(() => textures.pinned(id));
      skies.addChild(...tiles);
      this.sky.push({ tiles, width: tiles[0]!.texture.width, offset: 0 });
    }
    this.tower = textures.sprite('MAIN_MENU.TOWER');
    this.tower.y = 77;
    this.front = textures.sprite('MAIN_MENU.FRONT');
    this.front.y = 152;
    const slider = (id: string): { sprite: Sprite; state: SlideState } => ({ sprite: textures.sprite(id), state: { phase: 'waiting', clock: 0 } });
    this.title = slider('MAIN_MENU.TITLE');
    this.franchise = slider('MAIN_MENU.FRANCHISE');
    this.two = textures.sprite('MAIN_MENU.NUMBER_TWO');
    // 0x5a574: `FONTS.TEEN` at half strength, its right end and its middle at (455, 302).
    this.label = new Text({ text: BUILD_LABEL, style: { fontFamily: fontFamily('FONTS.TEEN_BD'), fontSize: 10, fill: 0x808080 } });
    this.label.anchor.set(1, 0.5);
    this.label.scale.x = 0.9;
    this.label.position.set(455, 302);

    const panel = this.panel;
    panel.y = PANEL.y;
    panel.addChild(textures.sprite('MAIN_MENU.PANEL'));
    for (const [entry, y] of ENTRIES) {
      const enabled = options.enabled.includes(entry);
      const highlight = textures.sprite('MAIN_MENU.BUTTON_OVER');
      highlight.position.set(BUTTON.x, y);
      highlight.visible = false;
      const label = new Label({ text: options.strings.t(`MAIN_MENU.${entry}`), style: { fontFamily: fontFamily(MAIN_FONT), fontSize: 14, fill: MAIN_FILL, stroke: BORDER } });
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
        label.style.fill = on ? 0x4a4450 : MAIN_FILL;
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
    this.root.addChild(skies, this.planes, this.tower, this.front, panel, this.title.sprite, this.franchise.sprite, this.two, this.label);
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    this.clock = Math.min(1, this.clock + dt);
    this.shift = menuShiftStep(this.shift, dt, this.clock);
    const shift = this.shift;
    this.sky.forEach((layer, i) => {
      layer.offset -= skySpeed(i) * dt * layer.width;
      if (layer.offset < -layer.width) layer.offset += layer.width;
      layer.tiles.forEach((tile, k) => (tile.x = layer.offset + k * layer.width));
    });
    // 0x5c700: a piece stands its share of the shift to the right of its place.
    this.tower.x = 36 + 0.4 * shift;
    this.front.x = -48 + 0.6 * shift;
    this.panel.x = PANEL.x + 5 * shift;
    for (const [piece, at] of [[this.title, TITLE], [this.franchise, FRANCHISE]] as const) {
      if (slideStep(piece.state, dt, at.wait)) this.audio.play(at.sound);
      const pose = slidePose(piece.state, at.side);
      piece.sprite.visible = pose !== null;
      // Moved across, then leant, then put at its place.
      if (pose) piece.sprite.setFromMatrix(new Matrix(1, 0, pose.lean, 1, pose.dx + at.x + at.share * shift, at.y));
    }
    // 0x5b8ee: the "2" comes 2.9 s in, with its sound.
    const since = this.time - NUMBER.delay;
    if (since >= 0 && since - dt < 0) this.audio.play('SOUNDS.NUMBER_TWO');
    this.two.visible = since >= 0;
    this.two.scale.set(numberPop(since));
    this.two.position.set(NUMBER.x + NUMBER.share * shift, NUMBER.y);
    // 0x5a5d4: the build numbers show after 5.8 s (6.9 s after the loading), over half a second.
    this.label.alpha = Math.max(0, Math.min(1, 2 * (this.time - this.labelAt)));

    // 0x59cca: a plane every 18 s, one going in and the next coming out.
    this.nextPlane -= dt;
    if (this.nextPlane < 0) {
      const sprite = this.textures.sprite(this.nextInward ? 'MAIN_MENU.PLANE_PASSING_IN' : 'MAIN_MENU.PLANE_PASSING_OUT');
      this.planes.addChild(sprite);
      this.flying.push({ sprite, t: 0, inward: this.nextInward, drift: 480 * Math.random() - 240 });
      this.audio.play('SOUNDS.PLANE_PASSBY');
      this.nextPlane = PLANE_EVERY;
      this.nextInward = !this.nextInward;
    }
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const plane = this.flying[i]!;
      plane.t += dt;
      if (plane.t >= PLANE_LIFE) {
        plane.sprite.destroy();
        this.flying.splice(i, 1);
        continue;
      }
      const pose = passingPlanePose(plane.t, plane.inward, plane.drift);
      plane.sprite.position.set(240 + shift / pose.depth + pose.x, pose.y);
      plane.sprite.scale.set(pose.scale);
    }
  }

  static async create(app: Application, data: GameData, textures: TextureStore, audio: AudioPlayer, options: MainMenuOptions): Promise<MainMenu> {
    await Promise.all([textures.load(SURFACES), loadFonts(data.resources, [MAIN_FONT, SCORE_FONT, 'FONTS.TEEN_BD'])]);
    const menu = new MainMenu(textures, audio, options);
    app.stage.addChild(menu.root);
    app.ticker.add((ticker) => menu.update(ticker.deltaMS / 1000));
    // Browsers only allow sound after a gesture, so the music starts with the first touch.
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.once('pointerdown', () => audio.playMusic('MUSICS.MAIN'));
    audio.preload(['SOUNDS.CLICK', 'SOUNDS.TITLE', 'SOUNDS.FRANCHISE', 'SOUNDS.NUMBER_TWO', 'SOUNDS.PLANE_PASSBY']);
    return menu;
  }
}
