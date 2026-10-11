import { Label } from './effectText';
import { BORDER, MAIN_FILL, SCORE_FILL } from './faces';
import { Container, NineSliceSprite, Rectangle, Sprite, Texture, type FederatedPointerEvent, type FillInput } from 'pixi.js';
import type { Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import type { Progress } from '../progress';
import { onSale, type ImprovementOffer } from '../stages/layout';
import { DIALOG_SURFACES, dialogButton, dialogFrame, dialogRule } from './dialog';
import { MAIN_FONT, SCORE_FONT } from './floatingText';

const ROW_FONT = 'FONTS.TEEN_BD';
export const IMPROVEMENTS_FONTS = [MAIN_FONT, SCORE_FONT, ROW_FONT];
export const IMPROVEMENTS_SOUNDS = ['SOUNDS.IMPROVEMENTS_SCREEN', 'SOUNDS.BUY_SOMETHING', 'SOUNDS.CANNOT', 'SOUNDS.CASH', 'SOUNDS.CLICK', 'SOUNDS.ITEM_SELECTION_CHANGE'];

export function improvementsSurfaceIds(offers: readonly ImprovementOffer[]): string[] {
  return [...DIALOG_SURFACES, ...LIST_SURFACES, 'IMPROVEMENTS.BOUGHT', 'IMPROVEMENTS.REMARK', ...offers.flatMap((offer) => [`${offer.icon}.ACTIVE`, `${offer.icon}.GRAYED`])];
}

const BOX = { width: 430, height: 270 };
const LIST_SURFACES = ['GUI.DIALOGS.COMBOBOX.BACK', 'GUI.DIALOGS.COMBOBOX.ARROW', 'GUI.DIALOGS.COMBOBOX.REMARK_UP', 'GUI.DIALOGS.COMBOBOX.REMARK_DOWN'];
/**
 * The list of improvements (`0x4d388`, on the engine's list box `0x2ead0`): made at (−170, 0), 75
 * wide and four and a half rows of 50 px high, in a box 12 px wider and 32 px taller on each
 * side, with an arrow in each of those ends.
 */
const LIST = { x: -170, width: 75, height: 225, pitch: 50 };

/** Where a row's middle is, from the list's (0x4de04), the list being `scroll` rows along. */
export function listRowY(index: number, scroll: number): number {
  return LIST.pitch * (index - scroll) - 135;
}

/** The row at a height of the list (0x4d98e), of `count`. */
export function listRowAt(y: number, scroll: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor((y + 115) / LIST.pitch + 1 + scroll)));
}

/**
 * Where the list comes to rest (0x4d742): where it is, unless that leaves the chosen row too low
 * or too high, or the list past its first or last row; on a whole pixel.
 */
export function listRest(scroll: number, chosen: number, count: number): number {
  let rest = Math.min(scroll, chosen - 1);
  if (scroll < chosen - 4.1) rest = chosen - 4.1;
  if (scroll < -1) rest = -1;
  if (scroll > count - 5.1) rest = count - 5.1;
  return Math.floor(rest * LIST.pitch + 0.5) / LIST.pitch;
}

/** The list a moment later, let alone (0x4d7e0): what is left to its rest falls to 0.03 of itself every second. */
export function listSettle(scroll: number, rest: number, dt: number): number {
  return Math.abs(scroll - rest) < 0.005 ? rest : rest + (scroll - rest) * 0.03 ** dt;
}

/** How far the list can be dragged (0x4d82e). */
export function listLimit(scroll: number, count: number): number {
  return Math.min(count - 1.25, Math.max(-4.75, scroll));
}

/** A value following a switch at `rate` a second, as the engine's do (0xa068 at 5, 0x9dd4 at 8). */
function follow(value: number, on: boolean, rate: number, dt: number): number {
  return Math.max(0, Math.min(1, value + (on ? rate : -rate) * dt));
}

/**
 * The shop of improvements, after the original dialog (`0x4c3c8`): a 430×270 box with the list
 * on the left and, for the chosen one, its title, description and cost, the funds available, and
 * the Buy or Sell and Exit buttons. Positions are from the centre of the box. Buying takes the
 * price from the funds of the level about to be played and selling gives it back (`0x4c020`,
 * `0x4bf08`). The two
 * amounts are drawn 10 px left of the original's x 220 to stay inside the frame.
 */
export class ImprovementsDialog extends Container {
  private readonly panel = new Container();
  private readonly rows = new Container();
  private readonly detail = new Container();
  private chosen: ImprovementOffer;
  /** How far along the list is, in rows; it starts one row back (0x4d41a). */
  private scroll = -1;
  /** The drag holding the list: where it and the touch were, in rows. */
  private drag: { scroll: number; at: number } | null = null;
  /** The touch on the list, from the list's middle. */
  private touch: { x: number; y: number } | null = null;
  /** Time left for a second touch on a row to count as two (0x4d9e4). */
  private again = 0;
  /** Each row's highlight, by offer (`item+8`). */
  private readonly lit = new Map<number, number>();
  private readonly shown: { offer: ImprovementOffer; row: Container; remark: Sprite }[] = [];
  private readonly ends: { arrow: Sprite; remark: NineSliceSprite; value: number }[] = [];
  /** True once something was bought or sold, so the airport has to be built again. */
  changed = false;

  constructor(
    private readonly textures: TextureStore,
    private readonly audio: AudioPlayer,
    private readonly strings: Strings,
    private readonly progress: Progress,
    private readonly stage: number,
    private readonly level: number,
    private readonly all: readonly ImprovementOffer[],
    private readonly onExit: () => void,
  ) {
    super();
    const { overlay, panel } = dialogFrame(textures, BOX.width, BOX.height);
    this.panel.position.set(BOX.width / 2, BOX.height / 2);
    panel.addChild(this.panel);
    this.addChild(overlay);
    this.chosen = this.offers[0]!;

    const heading = new Label({ text: strings.t('IMPROVEMENTS_DIALOG.TEXT_SHORT'), style: { fontFamily: fontFamily(MAIN_FONT), fontSize: 14, fill: MAIN_FILL, stroke: BORDER } });
    heading.anchor.set(0.5, 0.85);
    heading.position.set(55, -116);
    this.panel.addChild(heading);
    dialogRule(textures, this.panel, 55, -115, 325);
    dialogRule(textures, this.panel, 55, 65, 325);
    this.panel.addChild(this.detail);

    this.buildList();
    this.refresh();
    audio.play('SOUNDS.IMPROVEMENTS_SCREEN');
    let last = performance.now();
    this.onRender = () => {
      const now = performance.now();
      this.step(Math.min(0.1, (now - last) / 1000));
      last = now;
    };
  }

  /** The list's box, arrows and touch area (0x2eb58). */
  private buildList(): void {
    const { textures } = this;
    const list = new Container();
    list.position.set(LIST.x, 0);
    const half = LIST.height / 2;
    const across = LIST.width + 24;
    // 0x2ebd4: the box's picture keeps 12 px of its left, what is past 24 of its right, and its
    // top and bottom thirds.
    const back = new NineSliceSprite({ texture: textures.texture('GUI.DIALOGS.COMBOBOX.BACK'), leftWidth: 12, rightWidth: 14, topHeight: 32, bottomHeight: 32 });
    back.setSize(across, LIST.height + 64);
    back.position.set(-across / 2, -half - 32);
    list.addChild(back);
    for (const down of [false, true]) {
      // 0x2ec1e, 0x2ec70: each end's highlight, shown while its arrow is pressed.
      const remark = new NineSliceSprite({ texture: textures.texture(`GUI.DIALOGS.COMBOBOX.REMARK_${down ? 'DOWN' : 'UP'}`), leftWidth: 12, rightWidth: 14, topHeight: 0, bottomHeight: 0 });
      remark.setSize(across, 32);
      remark.position.set(-across / 2, down ? half : -half - 32);
      remark.alpha = 0;
      // 0x2e50c, 0x2e572: the arrow in the end, the lower one upside down.
      const arrow = textures.sprite('GUI.DIALOGS.COMBOBOX.ARROW');
      arrow.position.set(-arrow.width / 2, down ? half + arrow.height : -half - arrow.height);
      if (down) arrow.scale.y = -1;
      list.addChild(remark, arrow);
      this.ends.push({ arrow, remark, value: 0 });
    }
    // 0x4dd80: a row's pictures are drawn between −115 and 115 only, fading over the last 10 px
    // either way (the fade is taken as even).
    const fade = document.createElement('canvas');
    fade.width = 1;
    fade.height = 230;
    const paint = fade.getContext('2d')!;
    const shade = paint.createLinearGradient(0, 0, 0, 230);
    for (const [at, grey] of [[0, '#000'], [10 / 230, '#fff'], [220 / 230, '#fff'], [1, '#000']] as const) shade.addColorStop(at, grey);
    paint.fillStyle = shade;
    paint.fillRect(0, 0, 1, 230);
    const clip = new Sprite(Texture.from(fade));
    clip.setSize(across, 230);
    clip.position.set(-across / 2, -115);
    this.rows.mask = clip;

    const zone = new Container();
    zone.hitArea = new Rectangle(-across / 2, -half - 32, across, LIST.height + 64);
    zone.eventMode = 'static';
    const place = (event: FederatedPointerEvent): { x: number; y: number } => list.toLocal(event.global);
    zone.on('pointerdown', (event: FederatedPointerEvent) => {
      this.touch = place(event);
      // 0x4d87c: a touch within 55 px across and 115 px up or down of the middle picks its row
      // and takes hold of the list.
      if (Math.abs(this.touch.x) > 55 || Math.abs(this.touch.y) > 115) return;
      this.pick(listRowAt(this.touch.y, this.scroll, this.offers.length), true);
      this.drag = { scroll: this.scroll, at: this.touch.y / LIST.pitch };
    });
    zone.on('globalpointermove', (event: FederatedPointerEvent) => {
      if (this.touch) this.touch = place(event);
    });
    const release = (): void => {
      // 0x2efb6, 0x2f062: let go on an arrow that can be used, the choice moves one row.
      const end = this.touch ? this.endAt(this.touch) : -1;
      this.touch = null;
      this.drag = null;
      if (end >= 0) this.pick(this.offers.indexOf(this.chosen) + (end === 0 ? -1 : 1), false);
    };
    zone.on('pointerup', release);
    zone.on('pointerupoutside', release);
    list.addChild(clip, this.rows, zone);
    this.panel.addChild(list);
  }

  /** Which arrow a touch is on, if it can be used: 0 the upper, 1 the lower (0x2ef48, 0x2eff4). */
  private endAt(touch: { x: number; y: number }): number {
    const index = this.offers.indexOf(this.chosen);
    const half = LIST.height / 2;
    if (Math.abs(touch.x) > LIST.width / 2) return -1;
    if (index > 0 && touch.y > -half - 30 && touch.y < -half) return 0;
    if (index + 1 < this.offers.length && touch.y > half && touch.y < half + 30) return 1;
    return -1;
  }

  /**
   * Chooses a row (0x4d9d4, 0x4c218). Touched again within 0.4 s, the engine's time for it
   * (0xaf332), a row is bought or sold as its button would (0x4bee0).
   */
  private pick(index: number, touched: boolean): void {
    const offers = this.offers;
    const offer = offers[Math.max(0, Math.min(offers.length - 1, index))]!;
    const same = offer === this.chosen;
    this.chosen = offer;
    this.audio.play('SOUNDS.ITEM_SELECTION_CHANGE');
    this.refresh();
    if (!touched) return;
    if (same && this.again > 0) {
      this.again = 0;
      this.trade(offer);
    } else this.again = 0.4;
  }

  /** The list's own life (0x4d688, 0x2ee44). */
  private step(dt: number): void {
    const offers = this.offers;
    const chosen = offers.indexOf(this.chosen);
    this.again -= dt;
    if (this.drag && this.touch) this.scroll = this.drag.scroll - (this.touch.y / LIST.pitch - this.drag.at);
    else this.scroll = listSettle(this.scroll, listRest(this.scroll, chosen, offers.length), dt);
    this.scroll = listLimit(this.scroll, offers.length);
    this.shown.forEach(({ offer, row, remark }, i) => {
      row.y = listRowY(i, this.scroll);
      const value = follow(this.lit.get(offer.id) ?? 0, offer === this.chosen, 5, dt);
      this.lit.set(offer.id, value);
      remark.alpha = value;
    });
    const pressed = this.touch ? this.endAt(this.touch) : -1;
    this.ends.forEach((end, i) => {
      end.value = follow(end.value, pressed === i, 8, dt);
      end.remark.alpha = end.value;
      // 0x2e4f4: an arrow that leads nowhere is drawn at 0.7.
      end.arrow.alpha = (i === 0 ? chosen > 0 : chosen + 1 < offers.length) ? 1 : 0.7;
    });
  }

  /** What is on sale right now: the stage withdraws and adds offers as others are bought. */
  private get offers(): ImprovementOffer[] {
    const owned = this.progress.improvements(this.stage, this.level);
    return this.all.filter((offer) => onSale(offer, owned));
  }

  private owned(offer: ImprovementOffer): boolean {
    return this.progress.improvements(this.stage, this.level).has(offer.id);
  }

  /** The level's funds cover it (0x4cb44). */
  private affordable(offer: ImprovementOffer): boolean {
    return offer.price <= this.progress.funds(this.stage, this.level);
  }

  /**
   * Whether an item is marked "try me" (0x4ca54): not owned, within the funds, the level at or
   * past the one it is first suggested at, and not owned in any earlier level of the stage.
   */
  private tryMe(offer: ImprovementOffer): boolean {
    if (this.owned(offer) || !this.affordable(offer) || offer.tryFrom === undefined || this.level < offer.tryFrom) return false;
    for (let level = 1; level < this.level; level++) if (this.progress.improvements(this.stage, level).has(offer.id)) return false;
    return true;
  }

  private refresh(): void {
    const { strings, textures } = this;
    for (const child of this.rows.removeChildren()) child.destroy({ children: true });
    const offers = this.offers;
    // A purchase or sale can take the chosen one off the list.
    if (!offers.includes(this.chosen)) this.chosen = offers[0]!;
    this.shown.length = 0;
    offers.forEach((offer, i) => {
      const row = new Container();
      row.y = listRowY(i, this.scroll);
      // 0x4e08c: the full-colour icon when it is owned or can be paid for, the grey one otherwise.
      const lit = this.owned(offer) || this.affordable(offer);
      const icon: Sprite = textures.sprite(`${offer.icon}.${lit ? 'ACTIVE' : 'GRAYED'}`);
      // 0x4db2a: the grey one is also darkened, a little less in its blue.
      if (!lit) icon.tint = 0xb3b3e6;
      // 0x4dab4: the list's own highlight behind the item, as strong as the row's is (`item+8`).
      const remark = textures.sprite('IMPROVEMENTS.REMARK');
      remark.alpha = this.lit.get(offer.id) ?? 0;
      row.addChild(remark, icon);
      if (this.owned(offer)) {
        // 0x4db70: the mark for what has been bought, over the icon.
        row.addChild(textures.sprite('IMPROVEMENTS.BOUGHT'));
      } else if (this.tryMe(offer)) {
        // 0x4dc8a: "try me" in `FONTS.MAIN` at 0.8, ending 40 px right of the icon and 10 px under its middle.
        const mark = new Label({ text: strings.t('IMPROVEMENTS_DIALOG.TRY_ME'), style: { fontFamily: fontFamily(MAIN_FONT), fontSize: 14, fill: MAIN_FILL, stroke: BORDER } });
        mark.anchor.set(1, 0.5);
        mark.scale.set(0.8);
        mark.position.set(40, 10);
        row.addChild(mark);
      }
      this.rows.addChild(row);
      this.shown.push({ offer, row, remark });
    });

    for (const child of this.detail.removeChildren()) child.destroy({ children: true });
    const offer = this.chosen;
    const text = (value: string, x: number, y: number, family: string, size: number, anchorX: number, fill: FillInput = 0xffffff): Label => {
      const node = new Label({ text: value, style: { fontFamily: family, fontSize: size, fill, stroke: BORDER } });
      node.anchor.set(anchorX, 0.85);
      node.position.set(x, y);
      this.detail.addChild(node);
      return node;
    };
    const title = text(strings.t(offer.titleId), 60, -86, fontFamily(MAIN_FONT), 14, 0.5, MAIN_FILL);
    if (title.width > 310) title.scale.set(310 / title.width);
    const description = new Label({
      text: strings.t(offer.descriptionId),
      style: { fontFamily: fontFamily(ROW_FONT), fontSize: 11, fill: 0xffffff, stroke: BORDER, wordWrap: true, wordWrapWidth: 325, lineHeight: 13 },
    });
    // 0x4c59e: in the box (−105, −80)–(220, 40), from its left and its top.
    description.position.set(-105, -80);
    // Long texts shrink to stay in the box.
    if (description.height > 120) description.scale.set(120 / description.height);
    this.detail.addChild(description);

    const money = fontFamily(SCORE_FONT);
    text(strings.t('IMPROVEMENTS_DIALOG.COST'), -110, 63, fontFamily(MAIN_FONT), 13, 0, MAIN_FILL);
    text(String(offer.price), 210, 63, money, 14, 1, SCORE_FILL);
    text(strings.t('IMPROVEMENTS_DIALOG.AVAILABLE'), -110, 95, fontFamily(MAIN_FONT), 13, 0, MAIN_FILL);
    text(String(this.progress.funds(this.stage, this.level)), 210, 95, money, 14, 1, SCORE_FILL);

    const owned = this.owned(offer);
    dialogButton(textures, this.audio, this.detail, { x: -20, y: 120, width: 125, height: 30 }, strings.t(owned ? 'IMPROVEMENTS_DIALOG.SELL' : 'IMPROVEMENTS_DIALOG.BUY'), money, () => this.trade(offer), null);
    dialogButton(textures, this.audio, this.detail, { x: 140, y: 120, width: 125, height: 30 }, strings.t('IMPROVEMENTS_DIALOG.FINISH'), money, () => this.onExit());
  }

  private trade(offer: ImprovementOffer): void {
    const { progress, stage, level } = this;
    if (this.owned(offer)) {
      progress.sell(stage, level, offer.id, offer.price);
      this.audio.play('SOUNDS.CASH');
    } else if (progress.buy(stage, level, offer.id, offer.price)) {
      this.audio.play('SOUNDS.BUY_SOMETHING');
    } else {
      this.audio.play('SOUNDS.CANNOT');
      return;
    }
    this.changed = true;
    // Rebuilt after the touch that caused it has been dispatched.
    setTimeout(() => this.refresh());
  }
}
