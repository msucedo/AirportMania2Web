import { Container, FillGradient, Graphics, NineSliceSprite, type Application, type Sprite } from 'pixi.js';
import type { GameData } from '../data/load';
import type { Strings } from '../data/strings';
import { fontFamily, loadFonts } from '../engine/fonts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../engine/screen';
import type { TextureStore } from '../engine/textures';
import { Label } from './view/effectText';
import { BORDER, MAIN_FILL } from './view/faces';
import { MAIN_FONT } from './view/floatingText';
import { SeaSparkles } from './view/waterEffects';

// The screen shown while a stage or the ending loads (`SceneLoading`: start 0x70ce4, update
// 0x713f8, draw 0x714d8): a sky with the sun or the moon over a glinting sea, clouds going by,
// "Loading" and a bar. See docs/re-notes.md.

const SURFACES = [
  'AMBIENT.SUN',
  'AMBIENT.SUNRAY',
  'AMBIENT.MOON',
  'AMBIENT.WAVE_REFLECT',
  'MAIN_MENU.CLOUD1',
  'MAIN_MENU.CLOUD2',
  'STAGES.CARRIER.OCEAN_BOTTOM',
  'STAGES.CARRIER.OCEAN_TOP',
  'GUI.FINAL_REPORT.TICK_YELLOW',
];

/**
 * The sky's colours at its foot and its head (0x710c0): blue under black by night, red under
 * orange by day. They are kept as four bytes, taken here in the order the graphics library
 * reads them (red first): 0xffe59900 is (0, 0.6, 0.9).
 */
export const SCENE_SKIES = { night: { foot: 0x0099e5, head: 0x000000 }, day: { foot: 0xff4c4c, head: 0xffcc7f } } as const;

/** How the sun stands `time` seconds on (0x71586): it turns 7.5° a second and breathes. */
export function sunPose(time: number): { angle: number; scale: number } {
  return { angle: 300 * 0.025 * time, scale: 1 + 0.025 * Math.sin(200 * 0.025 * time) };
}

/** Where a band of cloud `width` wide starts `time` seconds on, sliding left at `speed` px a second (0x7166a): kept within one width left of the screen's edge. */
export function cloudStart(time: number, speed: number, width: number): number {
  const x = (-speed * time) % width;
  return x > 0 ? x - width : x;
}

/** The bar's width for a share of the loading done (0x718a2). */
export const barWidth = (done: number): number => 95 * done + 5;

/** A step of the veil (0x7142a, 0x7149a): it lifts, or falls, in a third of a second. */
export const veilStep = (veil: number, dt: number, lifting: boolean): number => (lifting ? veil - 3 * dt : veil + 3 * dt);

const NIGHT_KEY = 'am2web.sceneNight';

/** Whether this loading is by night (0x709c0, 0x70f34): chance the first time, then by turns. */
function nextNight(): boolean {
  let night = Math.random() < 0.5;
  try {
    const kept = sessionStorage.getItem(NIGHT_KEY);
    if (kept !== null) night = kept !== '1';
    sessionStorage.setItem(NIGHT_KEY, night ? '1' : '0');
  } catch {
    // Storage is off: chance every time.
  }
  return night;
}

export class SceneLoading {
  readonly root = new Container();
  private readonly sun: Sprite[] = [];
  private readonly clouds: { tiles: Container[]; speed: number; width: number }[] = [];
  private readonly glints: SeaSparkles;
  private readonly bar: NineSliceSprite;
  private readonly veil: Graphics;
  private time = 0;

  private constructor(textures: TextureStore, strings: Strings, night: boolean) {
    const colours = night ? SCENE_SKIES.night : SCENE_SKIES.day;
    // 0x71096: the sky is the band from y 20 to y 245, one colour at its head and one at its foot.
    const sky = new Graphics().rect(0, 20, SCREEN_WIDTH, 225).fill(
      new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: 'local', colorStops: [{ offset: 0, color: colours.head }, { offset: 1, color: colours.foot }] }),
    );
    this.root.addChild(new Graphics().rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill(0x000000), sky);
    // 0x71568: the moon by night; by day the rays and then the sun, both at (80, 175).
    for (const id of night ? ['AMBIENT.MOON'] : ['AMBIENT.SUNRAY', 'AMBIENT.SUN']) {
      const sprite = textures.sprite(id);
      sprite.position.set(80, 175);
      if (!night) this.sun.push(sprite);
      this.root.addChild(sprite);
    }
    // 0x71614: the sea's body, stretched over the last 60 px, and its edge at y 237.
    const body = textures.sprite('STAGES.CARRIER.OCEAN_BOTTOM');
    body.position.set(0, 260);
    body.scale.set(48, 6);
    const edge = textures.sprite('STAGES.CARRIER.OCEAN_TOP');
    edge.position.set(0, 237);
    // 0x7112a: glints over (0, 236)–(480, 320), as a stage's sea has them.
    this.glints = new SeaSparkles(textures, { x1: 0, y1: 236, x2: 480, y2: 320, sag: 11 });
    this.root.addChild(body, edge, this.glints);
    // 0x7166a, 0x71740: two bands of cloud upside down from y 180 and y 170, three of each side by side.
    for (const [id, y, speed] of [['MAIN_MENU.CLOUD1', 180, 15], ['MAIN_MENU.CLOUD2', 170, 20]] as const) {
      const tiles = [0, 1, 2].map(() => {
        const band = new Container();
        band.addChild(textures.pinned(id));
        band.scale.y = -1;
        band.y = y;
        return band;
      });
      this.root.addChild(...tiles);
      this.clouds.push({ tiles, speed, width: textures.texture(id).width });
    }
    // 0x7181c: the text in `FONTS.MAIN`, its middle at the screen's.
    const text = new Label({ text: strings.t('LOADING_SCREEN.LOADING'), style: { fontFamily: fontFamily(MAIN_FONT), fontSize: 14, fill: MAIN_FILL, stroke: BORDER } });
    text.anchor.set(0.5);
    text.position.set(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    // 0x711c4, 0x7188e: the bar, 50 px left of that and 31 px under it, its picture's two halves as ends.
    this.bar = new NineSliceSprite({ texture: textures.texture('GUI.FINAL_REPORT.TICK_YELLOW'), leftWidth: 2.5, rightWidth: 2.5, topHeight: 0, bottomHeight: 0 });
    this.bar.position.set(SCREEN_WIDTH / 2 - 50, SCREEN_HEIGHT / 2 + 40 - 9);
    this.bar.visible = false;
    this.veil = new Graphics().rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill(0xffffff);
    this.root.addChild(text, this.bar, this.veil);
    this.root.eventMode = 'static';
    this.root.hitArea = { contains: () => true };
    this.animate(0);
  }

  private animate(dt: number): void {
    this.time += dt;
    const pose = sunPose(this.time);
    for (const sprite of this.sun) {
      sprite.angle = pose.angle;
      sprite.scale.set(pose.scale);
    }
    for (const band of this.clouds) {
      const start = cloudStart(this.time, band.speed, band.width);
      band.tiles.forEach((tile, k) => (tile.x = start + k * band.width));
    }
    this.glints.update(dt);
  }

  /**
   * Shows the screen while `work` is done (0x713f8): the veil lifts in a third of a second, the
   * bar follows what `work` reports, and the veil falls again before the screen goes.
   */
  static async run<T>(app: Application, data: GameData, textures: TextureStore, strings: Strings, work: (report: (done: number) => void) => Promise<T>): Promise<T> {
    await Promise.all([textures.load(SURFACES), loadFonts(data.resources, [MAIN_FONT])]);
    const screen = new SceneLoading(textures, strings, nextNight());
    app.stage.addChild(screen.root);
    let veil = 1;
    let step: (dt: number) => void = () => {};
    const tick = (ticker: { deltaMS: number }): void => {
      const dt = Math.min(0.1, ticker.deltaMS / 1000);
      screen.animate(dt);
      step(dt);
      screen.veil.alpha = Math.max(0, Math.min(1, veil));
    };
    app.ticker.add(tick);
    const until = (lifting: boolean): Promise<void> =>
      new Promise((done) => {
        step = (dt) => {
          veil = veilStep(veil, dt, lifting);
          if (lifting ? veil >= 0 : veil < 1) return;
          step = () => {};
          done();
        };
      });
    await until(true);
    veil = 0;
    // 0x71858: the bar is there once the veil is off.
    screen.bar.visible = true;
    const show = (done: number): void => screen.bar.setSize(barWidth(Math.max(0, Math.min(1, done))), screen.bar.texture.height);
    show(0);
    const result = await work(show);
    show(1);
    // What was made meanwhile is under the screen.
    app.stage.addChild(screen.root);
    await until(false);
    app.ticker.remove(tick);
    screen.root.destroy({ children: true });
    return result;
  }
}
