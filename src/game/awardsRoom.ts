import { type Application, Container, type FederatedPointerEvent, NineSliceSprite, Rectangle, type Sprite, Text } from 'pixi.js';
import type { AwardPlace } from '../data/awards';
import type { GameData } from '../data/load';
import type { Strings } from '../data/strings';
import type { AudioPlayer } from '../engine/audio';
import { fontFamily, loadFonts } from '../engine/fonts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../engine/screen';
import type { TextureStore } from '../engine/textures';
import { awardCount, medalLevel, type AwardsData } from './awards';
import { DIALOG_SURFACES, dialogButton } from './view/dialog';
import { SCORE_FONT } from './view/floatingText';
import { centred, textBox, title, white } from './view/tutorialViews';

// The awards room (images 0x1e114, build 0x1e1b4, draw 0x1ed68): a wall two screens wide with
// shelves, every award at the place the game's table gives it, curtains above and below and
// the user's name on a ribbon. See docs/re-notes.md.

const HEADS = ['AWARDS_ROOM.MEDALS.HEAD_BRONZE', 'AWARDS_ROOM.MEDALS.HEAD_SILVER', 'AWARDS_ROOM.MEDALS.HEAD_GOLD'];
const MATERIALS = ['AWARDS.MEDALS_MATERIALS.0', 'AWARDS.MEDALS_MATERIALS.1', 'AWARDS.MEDALS_MATERIALS.2'];
const ROOM_SURFACES = ['AWARDS_ROOM.BACK', 'AWARDS_ROOM.SHELF', 'AWARDS_ROOM.CURTAIN_TOP', 'AWARDS_ROOM.CURTAIN_BOTTOM', 'AWARDS_ROOM.RIBBON', 'AWARDS_ROOM.BACK_BUTTON', 'AWARDS_ROOM.DIPLOMA', 'AWARDS_ROOM.PIG', 'AWARDS_ROOM.CLOCK', ...HEADS];

/** Where the shelves' top left corners are on the wall (0x1ee00). */
export const SHELVES = [
  { x: 10, y: 285 },
  { x: 490, y: 125 },
  { x: 490, y: 205 },
  { x: 490, y: 285 },
] as const;

/** The wall is two screens wide: it can be pulled 480 px to the left. */
export const ROOM_SCROLL = 480;

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
  private scroll = 0;
  private drag: { x: number; scroll: number; moved: boolean } | null = null;
  private dialog: Container | null = null;

  private constructor(
    private readonly textures: TextureStore,
    private readonly audio: AudioPlayer,
    private readonly options: AwardsRoomOptions,
    places: AwardPlace[],
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

    const top = textures.sprite('AWARDS_ROOM.CURTAIN_TOP');
    const bottom = textures.sprite('AWARDS_ROOM.CURTAIN_BOTTOM');
    bottom.position.set(0, SCREEN_HEIGHT - bottom.height);

    // The ribbon is centred at (240, 25) with the user's name in dark brown.
    const name = new Text({ text: strings.t('AWARDS_ROOM.USERS_AWARDS', options.user ?? ''), style: { fontFamily: fontFamily('FONTS.TEEN_BD'), fontSize: 10, fill: 0x46280c } });
    name.anchor.set(0.5);
    name.position.set(240, 25);
    const ribbon = new NineSliceSprite({ texture: textures.texture('AWARDS_ROOM.RIBBON'), leftWidth: 50, rightWidth: 50, topHeight: 0, bottomHeight: 0 });
    ribbon.setSize(Math.max(186, name.width + 100), 35);
    ribbon.position.set(240 - ribbon.width / 2, 25 - 35 / 2);

    const backButton = textures.sprite('AWARDS_ROOM.BACK_BUTTON');
    backButton.position.set(50, 40);
    backButton.eventMode = 'static';
    backButton.cursor = 'pointer';
    backButton.on('pointerdown', (event: FederatedPointerEvent) => {
      event.stopPropagation();
      audio.play('SOUNDS.CLICK');
      options.onBack();
    });

    this.root.addChild(this.wall, top, bottom, ribbon, name, backButton);

    // The wall is pulled sideways with a finger.
    this.root.eventMode = 'static';
    this.root.hitArea = new Rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    this.root.on('pointerdown', (event: FederatedPointerEvent) => (this.drag = { x: event.getLocalPosition(this.root).x, scroll: this.scroll, moved: false }));
    this.root.on('globalpointermove', (event: FederatedPointerEvent) => {
      if (!this.drag || this.dialog) return;
      const by = event.getLocalPosition(this.root).x - this.drag.x;
      if (Math.abs(by) > 4) this.drag.moved = true;
      this.scroll = Math.max(-ROOM_SCROLL, Math.min(0, this.drag.scroll + by));
      this.wall.x = this.scroll;
    });
    const release = (): void => void (this.drag = null);
    this.root.on('pointerup', release);
    this.root.on('pointerupoutside', release);
  }

  static async create(app: Application, data: GameData, textures: TextureStore, audio: AudioPlayer, options: AwardsRoomOptions): Promise<AwardsRoom> {
    const places = await data.awards();
    const surfaces = new Set<string>([...ROOM_SURFACES, ...DIALOG_SURFACES]);
    for (const place of places) for (const id of Object.values(awardImages(place))) surfaces.add(id);
    await Promise.all([textures.load(surfaces), loadFonts(data.resources, ['FONTS.TEEN_BD', 'FONTS.BRADY_BUNCH', SCORE_FONT])]);
    const room = new AwardsRoom(textures, audio, options, places);
    app.stage.addChild(room.root);
    audio.preload(['SOUNDS.CLICK']);
    return room;
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

  /** What an award is: its name, and how to earn it or what it was given for. The original's dialog (0x1aaf4) has not been read. */
  private describe(place: AwardPlace, awards: Readonly<AwardsData>): void {
    const { strings } = this.options;
    const earned = awards[place.id]?.earned === true;
    const { overlay, centre } = centred(this.textures, 400, 200);
    const material = place.kind === 'medal' && earned ? ` ${strings.t(MATERIALS[medalLevel(awards, place.id)]!)}` : '';
    textBox(centre, strings.t(`${place.text}.NAME`) + material, { x1: -187, y1: -90, x2: 187, y2: -60 }, title(), true);
    // A plane trophy's description is "N/A": what was said when it was earned stands in for it.
    const told = strings.t(`${place.text}.DESCRIPTION`);
    const text = !earned ? strings.t(`${place.text}.PRE_DESCRIPTION`) : told === 'N/A' ? strings.t(`${place.text}.EARN`) : told;
    textBox(centre, text, { x1: -187, y1: -50, x2: 187, y2: 50 }, white(), true);
    const dialog = new Container();
    dialogButton(this.textures, this.audio, centre, { x: 0, y: 75, width: 380, height: 30 }, strings.t('CLOSE'), fontFamily(SCORE_FONT), () => {
      this.dialog = null;
      setTimeout(() => dialog.destroy({ children: true }));
    });
    dialog.addChild(overlay);
    this.dialog = dialog;
    this.root.addChild(dialog);
  }
}
