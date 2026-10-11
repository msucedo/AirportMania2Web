import { BORDER, MAIN_FILL } from './view/faces';
import { Container, Graphics, Text, type Application, type Sprite, type TextStyleOptions } from 'pixi.js';
import type { GameData } from '../data/load';
import type { Strings } from '../data/strings';
import { fontFamily, loadFonts } from '../engine/fonts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../engine/screen';
import type { TextureStore } from '../engine/textures';
import { MAIN_FONT } from './view/floatingText';

// The loading screen (enter 0x55a38, update 0x55b3c, draw 0x55cc0): a seat belt whose two halves
// come together as the loading goes. See docs/re-notes.md.

const SURFACES = ['LOADING_SCREEN.BACK', 'LOADING_SCREEN.BELT_ROPE', 'LOADING_SCREEN.BELT_PIN_LEFT', 'LOADING_SCREEN.BELT_PIN_RIGHT'];
const WHITE_FONT = 'FONTS.TEEN_BD';
const BELT_Y = 280;

/**
 * The belt with `progress` (0 to 1) of the loading done (0x55d3e): its halves stand 180 px
 * further apart than buckled at the start. Each half is its pin and a strap of pieces 12 px
 * apart running off its side of the screen.
 */
export function beltPose(progress: number): { leftPin: number; rightPin: number; leftStrap: number[]; rightStrap: number[] } {
  const gap = (1 - progress) * 180;
  const leftStrap: number[] = [];
  for (let x = 193 - gap; x > -18; x -= 12) leftStrap.push(x);
  const rightStrap: number[] = [];
  for (let x = 287 + gap; x < 498; x += 12) rightStrap.push(x);
  return { leftPin: 217 - gap, rightPin: 263 + gap, leftStrap, rightStrap };
}

export class LoadingScreen {
  readonly root = new Container();
  private readonly strap = new Container();
  private readonly pins: [Sprite, Sprite];
  private readonly white: Graphics;
  private pieces: Sprite[] = [];

  private constructor(
    private readonly textures: TextureStore,
    strings: Strings,
  ) {
    const label = (key: string, y: number, style: TextStyleOptions): Text => {
      const text = new Text({ text: strings.t(key), style });
      text.anchor.set(0.5);
      text.position.set(240, y);
      return text;
    };
    this.pins = [textures.sprite('LOADING_SCREEN.BELT_PIN_LEFT'), textures.sprite('LOADING_SCREEN.BELT_PIN_RIGHT')];
    this.white = new Graphics().rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill(0xffffff);
    this.root.addChild(
      textures.sprite('LOADING_SCREEN.BACK'),
      // `FONTS.MAIN` and `FONTS.WHITE`, as the dialogs draw them.
      label('LOADING_SCREEN.FASTEN_YOUR_SEAT_BELTS', 210, { fontFamily: fontFamily(MAIN_FONT), fontSize: 14, fill: MAIN_FILL, stroke: BORDER }),
      label('LOADING_SCREEN.LOADING', 238, { fontFamily: fontFamily(WHITE_FONT), fontSize: 11, fill: 0xffffff, stroke: BORDER }),
      this.strap,
      ...this.pins,
      this.white,
    );
    this.root.eventMode = 'static';
    this.root.hitArea = { contains: () => true };
    this.show(0, 1);
  }

  /** Draws the belt at `progress` under a white veil of opacity `veil`. */
  private show(progress: number, veil: number): void {
    const pose = beltPose(progress);
    const places = [...pose.leftStrap, ...pose.rightStrap];
    while (this.pieces.length < places.length) this.pieces.push(this.strap.addChild(this.textures.sprite('LOADING_SCREEN.BELT_ROPE')));
    this.pieces.forEach((piece, i) => {
      piece.visible = i < places.length;
      if (piece.visible) piece.position.set(places[i]!, BELT_Y);
    });
    this.pins[0].position.set(pose.leftPin, BELT_Y);
    this.pins[1].position.set(pose.rightPin, BELT_Y);
    this.white.alpha = Math.max(0, Math.min(1, veil));
  }

  /**
   * Shows the screen while `tasks` are done one after another (0x55b3c): it comes out of white
   * over a second, the belt closes a step for each task, and it stays buckled for a second.
   */
  static async run(app: Application, data: GameData, textures: TextureStore, strings: Strings, tasks: (() => Promise<unknown>)[]): Promise<void> {
    await Promise.all([textures.load(SURFACES), loadFonts(data.resources, [MAIN_FONT, WHITE_FONT])]);
    const screen = new LoadingScreen(textures, strings);
    app.stage.addChild(screen.root);
    const wait = (seconds: number, each: (left: number) => void): Promise<void> =>
      new Promise((done) => {
        let left = seconds;
        const tick = (ticker: { deltaMS: number }): void => {
          left -= ticker.deltaMS / 1000;
          each(Math.max(0, left));
          if (left > 0) return;
          app.ticker.remove(tick);
          done();
        };
        app.ticker.add(tick);
      });
    await wait(1, (left) => screen.show(0, left));
    for (let done = 0; done < tasks.length; done++) {
      await tasks[done]!();
      screen.show((done + 1) / tasks.length, 0);
    }
    screen.show(1, 0);
    await wait(1, () => {});
    screen.root.destroy({ children: true });
  }
}

/** Splits a list into `count` runs of about the same length, for a loading with that many steps. */
export function inRuns<T>(items: readonly T[], count: number): T[][] {
  const runs: T[][] = [];
  const size = Math.max(1, Math.ceil(items.length / count));
  for (let i = 0; i < items.length; i += size) runs.push(items.slice(i, i + size));
  return runs;
}
