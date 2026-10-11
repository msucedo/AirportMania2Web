import { type Application, Container, type FederatedPointerEvent, Rectangle, type Sprite, Text, type Ticker } from 'pixi.js';
import type { GameData } from '../data/load';
import type { Strings } from '../data/strings';
import type { AudioPlayer } from '../engine/audio';
import { fontFamily, loadFonts } from '../engine/fonts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../engine/screen';
import type { TextureStore } from '../engine/textures';
import type { RollTouch } from './credits';
import { CLOUD_DEPTH, FLOATERS, GROUND_DEPTH, cloudPose, floaterPose, groundItems, groundPose, letterPose, propellerTurn, type GroundItem } from './ending';
import { CREDITS_FONTS, CREDITS_SURFACES, CreditsRollView } from './view/creditsDialog';

// The ending (scene 0x3473c, update 0x34ad8, draw 0x34c18), shown when the last stage's clear
// screen is left (0x78b02): a sky with clouds and ground going by, the planes and the main
// character floating in, "Congratulations!" letter by letter, then the credits, and a way back.

const SURFACES = [
  'FINAL_VICTORY.SKY',
  'FINAL_VICTORY.RETURN',
  'FINAL_VICTORY.LITTLE_PLANE_PROPELLER',
  ...FLOATERS.map((floater) => floater.resource),
  ...[0, 1, 2, 3].map((n) => `FINAL_VICTORY.CLOUDS.${n}`),
  ...[0, 1, 2, 3, 4].map((n) => `FINAL_VICTORY.BUILDINGS.${n}`),
  ...[0, 1, 2, 3].map((n) => `FINAL_VICTORY.CANION.${n}`),
  ...[0, 1, 2, 3, 4, 5].map((n) => `FINAL_VICTORY.MOUNTAIN.${n}`),
  ...[0, 1, 2].map((n) => `FINAL_VICTORY.PALM_TREE.${n}`),
];

/** Seconds before the credits are made; they then wait 20 more before they appear (0x34b46). */
const CREDITS_AFTER = 10;

export interface EndingOptions {
  strings: Strings;
  onReturn: () => void;
}

export class EndingScene {
  readonly root = new Container();
  private readonly ground: { item: GroundItem; sprite: Sprite }[] = [];
  private readonly clouds: { x: number; z: number; sprite: Sprite }[] = [];
  private readonly floaters: { sprite: Sprite; propeller: Sprite | null; clock: number; index: number }[] = [];
  private readonly letters: Text[] = [];
  private readonly front = new Container();
  private readonly back: Sprite;
  private textClock = -1;
  private wait = CREDITS_AFTER;
  private credits: CreditsRollView | null = null;
  private touch: RollTouch | null = null;

  private constructor(
    private readonly textures: TextureStore,
    private readonly options: EndingOptions,
    private readonly ticker: Ticker,
  ) {
    // 0x34c30: the sky is stretched over the screen.
    const sky = textures.sprite('FINAL_VICTORY.SKY');
    sky.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
    const cloudLayer = new Container();
    cloudLayer.sortableChildren = true;
    const groundLayer = new Container();
    this.root.addChild(sky, cloudLayer, groundLayer, this.front);

    // 0x36c4a: fifty clouds 0.4 apart in depth, their places across, 48 px apart from −1200, dealt at random.
    const places = Array.from({ length: 50 }, (_, i) => 48 * i - 1200);
    for (let i = places.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [places[i], places[j]] = [places[j]!, places[i]!];
    }
    for (let i = 0; i < 50; i++) {
      const sprite = textures.sprite(`FINAL_VICTORY.CLOUDS.${Math.floor(Math.random() * 4)}`);
      sprite.anchor.set(0.5, 1);
      cloudLayer.addChild(sprite);
      this.clouds.push({ x: places[i]!, z: 0.4 * i, sprite });
    }
    // The ground's things are drawn from the last made to the first.
    for (const item of groundItems().reverse()) {
      const sprite = textures.sprite(item.resource);
      sprite.anchor.set(0.5, 1);
      groundLayer.addChild(sprite);
      this.ground.push({ item, sprite });
    }

    FLOATERS.forEach((floater, index) => {
      const sprite = textures.pinned(floater.resource);
      sprite.scale.set(floater.scale);
      this.front.addChild(sprite);
      let propeller: Sprite | null = null;
      if (floater.propeller) {
        propeller = textures.sprite('FINAL_VICTORY.LITTLE_PLANE_PROPELLER');
        propeller.scale.set(floater.scale);
        this.front.addChild(propeller);
      }
      this.floaters.push({ sprite, propeller, clock: -floater.delay, index });
    });

    // 0x35382: the letters, side by side and centred on (240, 160). `FINAL_VICTORY.GIANT_FONT` is
    // Blue Stone at 22 and 0.8 of its width; its effect's colours are not read.
    const text = options.strings.t('FINAL_VICTORY.CONGRATULATIONS');
    const style = { fontFamily: fontFamily('FONTS.BLUE_STONE'), fontSize: 22, fill: 0xffd75a, stroke: { color: 0x5a2a00, width: 3 } };
    let width = 0;
    for (const letter of text) {
      const node = new Text({ text: letter, style });
      node.anchor.set(0.5);
      node.scale.x = 0.8;
      this.letters.push(node);
      width += node.width + 2;
    }
    let x = 240 - Math.floor(width / 2);
    for (const node of this.letters) {
      node.position.set(x + node.width / 2, 160);
      x += node.width + 2;
      node.visible = false;
      this.front.addChild(node);
    }

    // 0x34ee6: the way back, shown once the credits have run.
    this.back = textures.sprite('FINAL_VICTORY.RETURN');
    this.back.position.set(20, 305);
    this.back.visible = false;
    this.back.eventMode = 'static';
    this.back.cursor = 'pointer';
    this.back.hitArea = new Rectangle(-30, -30, 60, 60);
    this.back.on('pointerdown', (event: FederatedPointerEvent) => {
      event.stopPropagation();
      this.ticker.remove(this.step, this);
      options.onReturn();
    });
    this.root.addChild(this.back);

    this.root.eventMode = 'static';
    this.root.hitArea = new Rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.root.on('pointerdown', (event: FederatedPointerEvent) => (this.touch = { began: true, y: event.getLocalPosition(this.root).y }));
    this.root.on('globalpointermove', (event: FederatedPointerEvent) => {
      if (this.touch) this.touch.y = event.getLocalPosition(this.root).y;
    });
    const release = (): void => void (this.touch = null);
    this.root.on('pointerup', release);
    this.root.on('pointerupoutside', release);

    this.ticker.add(this.step, this);
    this.place();
  }

  /** Loads what the scene needs, so that it can be done behind the loading screen. */
  static async preload(data: GameData, textures: TextureStore): Promise<void> {
    await Promise.all([textures.load([...SURFACES, ...CREDITS_SURFACES]), loadFonts(data.resources, ['FONTS.BLUE_STONE', 'FONTS.BRADY_BUNCH', ...CREDITS_FONTS])]);
  }

  static async create(app: Application, data: GameData, textures: TextureStore, audio: AudioPlayer, options: EndingOptions): Promise<EndingScene> {
    await EndingScene.preload(data, textures);
    const scene = new EndingScene(textures, options, app.ticker);
    app.stage.addChild(scene.root);
    // Browsers only allow sound after a gesture; the page was reached by one, but a reload is not.
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    const play = (): void => audio.playMusic('MUSICS.FINAL_VICTORY.LOOP', 'MUSICS.FINAL_VICTORY.INTRO');
    if (audio.unlocked) play();
    else app.stage.once('pointerdown', play);
    return scene;
  }

  private step(ticker: Ticker): void {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    for (const cloud of this.clouds) {
      cloud.z += dt;
      if (cloud.z > CLOUD_DEPTH) cloud.z -= CLOUD_DEPTH;
    }
    for (const { item } of this.ground) {
      item.z += dt;
      if (item.z > GROUND_DEPTH) item.z -= GROUND_DEPTH;
    }
    for (const floater of this.floaters) floater.clock += dt;
    this.textClock += dt;

    // 0x34b2c: after a wait the credits are made, in the middle of the screen, to appear 20 s on.
    if (!this.credits) {
      this.wait -= dt;
      if (this.wait < 0) {
        this.credits = new CreditsRollView(this.textures, this.options.strings, 20);
        this.credits.position.set(240, 160);
        this.front.addChild(this.credits);
      }
    } else {
      this.credits.step(dt, this.touch);
      if (this.touch) this.touch.began = false;
      // 0x34bcc: once they have run to their end, the way back shows.
      if (this.credits.roll.offset >= this.credits.roll.total) this.back.visible = true;
    }
    this.place();
  }

  private place(): void {
    for (const cloud of this.clouds) {
      const pose = cloudPose(cloud.z, cloud.x);
      cloud.sprite.visible = pose !== null;
      if (!pose) continue;
      cloud.sprite.position.set(pose.x, pose.y);
      cloud.sprite.scale.set(pose.scale);
      // The farther are drawn first.
      cloud.sprite.zIndex = -cloud.z;
    }
    for (const { item, sprite } of this.ground) {
      const pose = groundPose(item.z, item.side);
      sprite.visible = pose !== null;
      if (!pose) continue;
      sprite.position.set(pose.x, pose.y);
      sprite.scale.set(item.mirrored ? -pose.scale : pose.scale, pose.scale);
    }
    for (const floater of this.floaters) {
      const spec = FLOATERS[floater.index]!;
      const pose = floaterPose(floater.clock, spec.scale);
      floater.sprite.position.set(spec.x + pose.x, spec.y + pose.y);
      floater.sprite.angle = pose.angle;
      if (floater.propeller) {
        floater.propeller.position.copyFrom(floater.sprite.position);
        floater.propeller.angle = pose.angle + propellerTurn(floater.clock);
      }
    }
    this.letters.forEach((letter, index) => {
      const pose = letterPose(this.textClock, index, this.letters.length);
      letter.visible = pose !== null && pose.alpha > 0;
      if (!pose) return;
      letter.scale.set(0.8 * pose.scale, pose.scale);
      letter.alpha = pose.alpha;
    });
  }
}
