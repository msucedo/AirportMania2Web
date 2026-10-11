import { type Application, Container, type FederatedPointerEvent, NineSliceSprite, Rectangle, type Sprite, Text, type Ticker } from 'pixi.js';
import type { AwardPlace } from '../data/awards';
import type { GameData } from '../data/load';
import type { Strings } from '../data/strings';
import type { AudioPlayer } from '../engine/audio';
import { fontFamily, loadFonts } from '../engine/fonts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../engine/screen';
import type { TextureStore } from '../engine/textures';
import { awardCount, medalLevel, type AwardsData } from './awards';
import { PAGE_WIDTH, SPARKLE_EVERY, curtainEdge, pageNumberPose, pageTouched, slideStep, sparklePose, swipeStep } from './awardsRoomMotion';
import { DIALOG_SURFACES, dialogButton } from './view/dialog';
import { SCORE_FONT } from './view/floatingText';
import { centred, textBox, title, white } from './view/tutorialViews';

// The awards room (images 0x1e114, build 0x1e1b4, draw 0x1ed68): a wall two screens wide with
// shelves, every award at the place the game's table gives it, curtains above and below and
// the user's name on a ribbon. See docs/re-notes.md.

const HEADS = ['AWARDS_ROOM.MEDALS.HEAD_BRONZE', 'AWARDS_ROOM.MEDALS.HEAD_SILVER', 'AWARDS_ROOM.MEDALS.HEAD_GOLD'];
const MATERIALS = ['AWARDS.MEDALS_MATERIALS.0', 'AWARDS.MEDALS_MATERIALS.1', 'AWARDS.MEDALS_MATERIALS.2'];
const ROOM_SURFACES = ['AWARDS_ROOM.BACK', 'AWARDS_ROOM.SHELF', 'AWARDS_ROOM.CURTAIN_TOP', 'AWARDS_ROOM.CURTAIN_BOTTOM', 'AWARDS_ROOM.RIBBON', 'AWARDS_ROOM.BACK_BUTTON', 'AWARDS_ROOM.DIPLOMA', 'AWARDS_ROOM.PIG', 'AWARDS_ROOM.CLOCK', ...HEADS, 'AWARDS_ROOM.1', 'AWARDS_ROOM.2', 'AWARDS_ROOM.3', 'AWARDS_ROOM.SPARKLE'];

/** Where the shelves' top left corners are on the wall (0x1ee00). */
export const SHELVES = [
  { x: 10, y: 285 },
  { x: 490, y: 125 },
  { x: 490, y: 205 },
  { x: 490, y: 285 },
] as const;

/** The wall's pages: the medals and the plane trophies. The original has a third, an online leaderboard. */
export const ROOM_PAGES = 2;

/** The images an award is drawn with: one picture, or for a medal its ribbon, its silhouette and its icon. */
export function awardImages(place: AwardPlace): { picture: string } | { tail: string; silhouette: string; icon: string } {
  switch (place.kind) {
    case 'diploma':
      return { picture: 'AWARDS_ROOM.DIPLOMA' };
    case 'pig':
      return { picture: 'AWARDS_ROOM.PIG' };
    case 'clock':
      return { picture: 'AWARDS_ROOM.CLOCK' };
    case 'plane':
      return { picture: `AWARDS_ROOM.PLANES_TROPHIES.${place.number}` };
    case 'special':
      return { picture: `AWARDS_ROOM.SPECIAL_TROPHIES.${place.number}` };
    case 'medal':
      // 0x1c1b6 on: ribbon and icon by the medal's number less one, silhouette by that modulo three.
      return { tail: `AWARDS_ROOM.MEDALS.TAILS.${place.number - 1}`, silhouette: `AWARDS_ROOM.MEDALS.SILHOUETTE_${((place.number - 1) % 3) + 1}`, icon: `AWARDS_ROOM.MEDALS.ICONS.${place.number - 1}` };
  }
}

export interface AwardsRoomOptions {
  strings: Strings;
  awards: Readonly<AwardsData>;
  /** The user's name, for the ribbon; null when there is no user. */
  user: string | null;
  onBack: () => void;
}

export class AwardsRoom {
  readonly root = new Container();
  private readonly wall = new Container();
  private readonly sparkles = new Container();
  private readonly curtain: Sprite;
  private readonly fringe: Sprite;
  private readonly numbers: Sprite[] = [];
  /** 0 shut to 1 open; it opens over a second and shuts as long before leaving. */
  private open = 0;
  private leaving = false;
  private page = 0;
  private scroll = 0;
  private speed = 0;
  private sparkleIn = 0;
  private live: { sprite: Sprite; clock: number; size: number; angle: number }[] = [];
  private drag: { x: number; y: number; kept: { x: number; y: number }; moved: boolean } | null = null;
  private dialog: Container | null = null;

  private constructor(
    private readonly textures: TextureStore,
    private readonly audio: AudioPlayer,
    private readonly options: AwardsRoomOptions,
    private readonly places: AwardPlace[],
    private readonly shines: Map<number, { x: number; y: number }[]>,
    private readonly ticker: Ticker,
  ) {
    const { strings, awards } = options;
    // The wall's picture is stretched 16 times across and 10 down, starting 48 px to the left.
    const back = textures.sprite('AWARDS_ROOM.BACK');
    back.scale.set(16, 10);
    back.position.set(-48, 0);
    this.wall.addChild(back);
    for (const shelf of SHELVES) {
      const sprite = textures.sprite('AWARDS_ROOM.SHELF');
      sprite.position.set(shelf.x, shelf.y);
      this.wall.addChild(sprite);
    }
    for (const place of places) this.wall.addChild(this.award(place, awards));
    this.wall.addChild(this.sparkles);

    // The curtain is its picture stretched 13 times down, its edge hanging at `curtainEdge`,
    // with the fringe below it.
    this.curtain = textures.sprite('AWARDS_ROOM.CURTAIN_TOP');
    this.curtain.scale.y = 13;
    this.fringe = textures.sprite('AWARDS_ROOM.CURTAIN_BOTTOM');

    // The ribbon is centred at (240, 25) with the user's name in dark brown.
    const name = new Text({ text: strings.t('AWARDS_ROOM.USERS_AWARDS', options.user ?? ''), style: { fontFamily: fontFamily('FONTS.TEEN_BD'), fontSize: 10, fill: 0x46280c } });
    name.anchor.set(0.5);
    name.position.set(240, 25);
    const ribbon = new NineSliceSprite({ texture: textures.texture('AWARDS_ROOM.RIBBON'), leftWidth: 50, rightWidth: 50, topHeight: 0, bottomHeight: 0 });
    ribbon.setSize(Math.max(186, name.width + 100), 35);
    ribbon.position.set(240 - ribbon.width / 2, 25 - 35 / 2);

    // 0x1e2b6: the way back, 50 by 40 at (430, 20).
    const backButton = textures.sprite('AWARDS_ROOM.BACK_BUTTON');
    backButton.position.set(430, 20);
    backButton.eventMode = 'static';
    backButton.cursor = 'pointer';
    backButton.hitArea = new Rectangle(-25, -20, 50, 40);
    backButton.on('pointerdown', (event: FederatedPointerEvent) => {
      event.stopPropagation();
      if (this.leaving) return;
      audio.play('SOUNDS.CLICK');
      this.leaving = true;
    });

    this.root.addChild(this.wall, this.curtain, this.fringe, ribbon, name, backButton);
    for (let index = 0; index < ROOM_PAGES; index++) {
      const number = textures.sprite(`AWARDS_ROOM.${index + 1}`);
      number.eventMode = 'none';
      this.numbers.push(number);
      this.root.addChild(number);
    }

    this.root.eventMode = 'static';
    this.root.hitArea = new Rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.root.on('pointerdown', (event: FederatedPointerEvent) => {
      if (this.dialog) return;
      const at = event.getLocalPosition(this.root);
      // 0x1e944: a touch on the strip of numbers goes to that page.
      const picked = pageTouched(at.x, at.y, ROOM_PAGES);
      if (picked !== null) this.page = picked;
      this.drag = { x: at.x, y: at.y, kept: { x: 0, y: 0 }, moved: false };
    });
    this.root.on('globalpointermove', (event: FederatedPointerEvent) => {
      if (!this.drag || this.dialog) return;
      const at = event.getLocalPosition(this.root);
      const swipe = swipeStep(this.drag.kept, at.x - this.drag.x, at.y - this.drag.y);
      if (Math.hypot(at.x - this.drag.x, at.y - this.drag.y) > 0) this.drag.moved = true;
      this.drag.x = at.x;
      this.drag.y = at.y;
      this.drag.kept = swipe.kept;
      this.page = Math.max(0, Math.min(ROOM_PAGES - 1, this.page + swipe.turn));
    });
    const release = (): void => void (this.drag = null);
    this.root.on('pointerup', release);
    this.root.on('pointerupoutside', release);

    this.ticker.add(this.step, this);
    this.place();
  }

  static async create(app: Application, data: GameData, textures: TextureStore, audio: AudioPlayer, options: AwardsRoomOptions): Promise<AwardsRoom> {
    const [places, shines] = await Promise.all([data.awards(), data.awardShines()]);
    const surfaces = new Set<string>([...ROOM_SURFACES, ...DIALOG_SURFACES]);
    for (const place of places) for (const id of Object.values(awardImages(place))) surfaces.add(id);
    await Promise.all([textures.load(surfaces), loadFonts(data.resources, ['FONTS.TEEN_BD', 'FONTS.BRADY_BUNCH', SCORE_FONT])]);
    const room = new AwardsRoom(textures, audio, options, places, shines, app.ticker);
    app.stage.addChild(room.root);
    audio.preload(['SOUNDS.CLICK']);
    return room;
  }

  private step(ticker: Ticker): void {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    if (this.leaving) {
      this.open -= dt;
      if (this.open <= 0) {
        this.ticker.remove(this.step, this);
        this.options.onBack();
        return;
      }
    } else if (this.open < 1) this.open = Math.min(1, this.open + dt);
    else this.sparkle(dt);

    const slid = slideStep(this.scroll, this.speed, -this.page * PAGE_WIDTH, dt);
    this.scroll = slid.scroll;
    this.speed = slid.speed;
    this.live = this.live.filter((sparkle) => {
      sparkle.clock -= dt;
      if (sparkle.clock > 0) return true;
      sparkle.sprite.destroy();
      return false;
    });
    this.place();
  }

  /** 0x1e766: every 0.15 s one of the 42 award ids is drawn; if that award is had, a sparkle shows on one of its three points. */
  private sparkle(dt: number): void {
    this.sparkleIn -= dt;
    if (this.sparkleIn >= 0) return;
    this.sparkleIn += SPARKLE_EVERY;
    const id = Math.floor(Math.random() * 42);
    const points = this.shines.get(id);
    if (!points || points.length === 0 || this.options.awards[id]?.earned !== true || !this.places.some((place) => place.id === id)) return;
    const at = points[Math.floor(Math.random() * 3) % points.length]!;
    const sprite = this.textures.sprite('AWARDS_ROOM.SPARKLE');
    sprite.position.set(at.x, at.y);
    sprite.eventMode = 'none';
    this.sparkles.addChild(sprite);
    this.live.push({ sprite, clock: 2, size: 0.5 + 0.5 * Math.random(), angle: 360 * Math.random() });
  }

  private place(): void {
    this.wall.x = this.scroll;
    const edge = curtainEdge(this.open);
    this.curtain.y = edge - 13 * this.curtain.texture.height;
    this.fringe.y = edge;
    this.numbers.forEach((number, index) => {
      const pose = pageNumberPose(index, this.scroll);
      number.position.set(pose.x, pose.y);
      number.scale.set(pose.scale);
    });
    for (const sparkle of this.live) {
      const pose = sparklePose(sparkle.clock, sparkle.size, sparkle.angle);
      sparkle.sprite.scale.set(pose.scale);
      sparkle.sprite.angle = pose.angle;
      sparkle.sprite.alpha = pose.alpha;
      // 0x1eefe: only those on screen are drawn.
      const x = sparkle.sprite.x + this.scroll;
      sparkle.sprite.visible = x > -40 && x < 520;
    }
  }

  /**
   * An award on the wall (0x1b588). Earned, its picture, or for a medal its ribbon, the head of
   * its material and its icon, with what it counts below when that is two or more (0x1b65c).
   * Not earned, its picture (a medal's silhouette) in black, a quarter solid (a fifth for a medal).
   */
  private award(place: AwardPlace, awards: Readonly<AwardsData>): Container {
    const node = new Container();
    node.position.set(place.x, place.y);
    const images = awardImages(place);
    const earned = awards[place.id]?.earned === true;
    const shade = (sprite: Sprite, alpha: number): Sprite => {
      sprite.tint = 0x000000;
      sprite.alpha = alpha;
      return sprite;
    };
    if ('picture' in images) node.addChild(earned ? this.textures.sprite(images.picture) : shade(this.textures.sprite(images.picture), 0.25));
    else if (!earned) node.addChild(shade(this.textures.sprite(images.silhouette), 0.2));
    else node.addChild(this.textures.sprite(images.tail), this.textures.sprite(HEADS[medalLevel(awards, place.id)]!), this.textures.sprite(images.icon));

    const count = awardCount(awards, place.id);
    if (earned && count >= 2 && (place.kind === 'medal' || place.kind === 'pig' || place.kind === 'clock')) {
      // `FONTS.SMALL_WHITE`: Teen Bold at 7.
      const label = new Text({ text: String(count), style: { fontFamily: fontFamily('FONTS.TEEN_BD'), fontSize: 7, fill: 0xffffff } });
      label.anchor.set(0.5);
      label.position.set(1, 23);
      node.addChild(label);
    }

    const bounds = node.getLocalBounds();
    node.hitArea = new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height);
    node.eventMode = 'static';
    node.cursor = 'pointer';
    node.on('pointerup', () => {
      if (this.drag?.moved || this.dialog) return;
      this.describe(place, awards);
    });
    return node;
  }

  /**
   * What a touched award opens (0x1aaf4): a 400×250 frame with its name in
   * (−190, −110)–(190, −80), a medal's with its material, and below, in (−180, −70)–(180, 70),
   * how to earn it or, once earned, what it was given for, with what it counts.
   */
  private describe(place: AwardPlace, awards: Readonly<AwardsData>): void {
    const { strings } = this.options;
    const earned = awards[place.id]?.earned === true;
    const { overlay, centre } = centred(this.textures, 400, 250);
    const material = place.kind === 'medal' && earned ? strings.t(MATERIALS[medalLevel(awards, place.id)]!) : '';
    textBox(centre, strings.t(`${place.text}.NAME`, material).trim(), { x1: -190, y1: -110, x2: 190, y2: -80 }, title(), true);
    const text = earned ? strings.t(`${place.text}.DESCRIPTION`, String(awardCount(awards, place.id))) : strings.t(`${place.text}.PRE_DESCRIPTION`);
    textBox(centre, text, { x1: -180, y1: -70, x2: 180, y2: 70 }, white(), false);
    const dialog = new Container();
    dialogButton(this.textures, this.audio, centre, { x: 0, y: 105, width: 340, height: 30 }, strings.t('CLOSE'), fontFamily(SCORE_FONT), () => {
      this.dialog = null;
      setTimeout(() => dialog.destroy({ children: true }));
    });
    dialog.addChild(overlay);
    this.dialog = dialog;
    this.root.addChild(dialog);
  }
}
