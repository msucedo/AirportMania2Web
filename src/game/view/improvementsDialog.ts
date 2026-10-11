import { Container, Graphics, Rectangle, Text, type FederatedPointerEvent, type Sprite } from 'pixi.js';
import type { Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import type { Progress } from '../progress';
import { onSale, type ImprovementOffer } from '../stages/layout';
import { DIALOG_SURFACES, dialogButton, dialogFrame } from './dialog';
import { MAIN_FONT, SCORE_FONT } from './floatingText';

const ROW_FONT = 'FONTS.TEEN_BD';
export const IMPROVEMENTS_FONTS = [MAIN_FONT, SCORE_FONT, ROW_FONT];
export const IMPROVEMENTS_SOUNDS = ['SOUNDS.IMPROVEMENTS_SCREEN', 'SOUNDS.BUY_SOMETHING', 'SOUNDS.CANNOT', 'SOUNDS.CASH', 'SOUNDS.CLICK'];

export function improvementsSurfaceIds(offers: readonly ImprovementOffer[]): string[] {
  return [...DIALOG_SURFACES, 'IMPROVEMENTS.BOUGHT', 'IMPROVEMENTS.REMARK', ...offers.flatMap((offer) => [`${offer.icon}.ACTIVE`, `${offer.icon}.GRAYED`])];
}

const BOX = { width: 430, height: 270 };
/** The list of improvements: a scrolling column on the left. Its exact place has not been read. */
const LIST = { x: -165, top: -122, bottom: 122, pitch: 44 };

/**
 * The shop of improvements, after the original dialog (`0x4c3c8`): a 430×270 box with the list
 * on the left and, for the chosen one, its title, description and cost, the funds available, and
 * the Buy or Sell and Exit buttons. Positions are from the centre of the box. Buying takes the
 * price from the funds of the level about to be played and selling gives it back (`0x4c020`,
 * `0x4bf08`). The list's place and pitch are approximations, and the two
 * amounts are drawn 10 px left of the original's x 220 to stay inside the frame.
 */
export class ImprovementsDialog extends Container {
  private readonly panel = new Container();
  private readonly rows = new Container();
  private readonly detail = new Container();
  private chosen: ImprovementOffer;
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

    const heading = new Text({ text: strings.t('IMPROVEMENTS_DIALOG.TEXT_SHORT'), style: { fontFamily: fontFamily(MAIN_FONT), fontSize: 14, fill: 0xffc23a, stroke: { color: 0x5a2a00, width: 3 } } });
    heading.anchor.set(0.5, 0.85);
    heading.position.set(55, -116);
    const rules = new Graphics();
    rules.rect(55 - 162.5, -115.5, 325, 1).rect(55 - 162.5, 64.5, 325, 1).fill({ color: 0xffffff, alpha: 0.5 });
    this.panel.addChild(heading, rules, this.detail);

    // The list scrolls by dragging when it does not fit.
    const clip = new Graphics().rect(LIST.x - 44, LIST.top, 88, LIST.bottom - LIST.top).fill(0xffffff);
    this.rows.mask = clip;
    const zone = new Container();
    zone.hitArea = new Rectangle(LIST.x - 44, LIST.top, 88, LIST.bottom - LIST.top);
    zone.eventMode = 'static';
    let grab: { pointer: number; start: number; moved: boolean } | null = null;
    zone.on('pointerdown', (event: FederatedPointerEvent) => (grab = { pointer: event.global.y, start: this.rows.y, moved: false }));
    zone.on('globalpointermove', (event: FederatedPointerEvent) => {
      if (!grab) return;
      const by = event.global.y - grab.pointer;
      if (Math.abs(by) > 4) grab.moved = true;
      const limit = Math.min(0, LIST.bottom - LIST.top - this.offers.length * LIST.pitch);
      if (grab.moved) this.rows.y = Math.max(limit, Math.min(0, grab.start + by));
    });
    const release = (event: FederatedPointerEvent): void => {
      const held = grab;
      grab = null;
      if (!held || held.moved) return;
      // A touch without dragging picks the row under it.
      const index = Math.floor((this.panel.toLocal(event.global).y - LIST.top - this.rows.y) / LIST.pitch);
      const offer = this.offers[index];
      if (!offer) return;
      this.chosen = offer;
      audio.play('SOUNDS.CLICK');
      this.refresh();
    };
    zone.on('pointerup', release);
    zone.on('pointerupoutside', () => (grab = null));
    this.panel.addChild(clip, this.rows, zone);

    this.refresh();
    audio.play('SOUNDS.IMPROVEMENTS_SCREEN');
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
    this.rows.y = Math.max(Math.min(0, LIST.bottom - LIST.top - offers.length * LIST.pitch), this.rows.y);
    offers.forEach((offer, i) => {
      // 0x4e08c: the full-colour icon when it is owned or can be paid for, the grey one otherwise.
      const lit = this.owned(offer) || this.affordable(offer);
      const icon: Sprite = textures.sprite(`${offer.icon}.${lit ? 'ACTIVE' : 'GRAYED'}`);
      icon.position.set(LIST.x, LIST.top + LIST.pitch * (i + 0.5));
      // 0x4db2a: the grey one is also darkened, a little less in its blue.
      if (!lit) icon.tint = 0xb3b3e6;
      if (offer === this.chosen) {
        // 0x4dab4: the list's own highlight behind the item. The original brings it in and out
        // (`item+8`); how fast is not read, so it is simply there for the chosen one.
        const remark = textures.sprite('IMPROVEMENTS.REMARK');
        remark.position.copyFrom(icon.position);
        this.rows.addChild(remark);
      }
      this.rows.addChild(icon);
      if (this.owned(offer)) {
        // 0x4db70: the mark for what has been bought, over the icon.
        const bought = textures.sprite('IMPROVEMENTS.BOUGHT');
        bought.position.copyFrom(icon.position);
        this.rows.addChild(bought);
      } else if (this.tryMe(offer)) {
        // 0x4dc8a: "try me" in `FONTS.MAIN` at 0.8, ending 40 px right of the icon and 10 px under its middle.
        const mark = new Text({ text: strings.t('IMPROVEMENTS_DIALOG.TRY_ME'), style: { fontFamily: fontFamily(MAIN_FONT), fontSize: 14, fill: 0xffc23a, stroke: { color: 0x5a2a00, width: 3 } } });
        mark.anchor.set(1, 0.5);
        mark.scale.set(0.8);
        mark.position.set(icon.x + 40, icon.y + 10);
        this.rows.addChild(mark);
      }
    });

    for (const child of this.detail.removeChildren()) child.destroy({ children: true });
    const offer = this.chosen;
    const text = (value: string, x: number, y: number, family: string, size: number, anchorX: number, fill = 0xffffff): Text => {
      const node = new Text({ text: value, style: { fontFamily: family, fontSize: size, fill, stroke: { color: 0x2a1030, width: 2 } } });
      node.anchor.set(anchorX, 0.85);
      node.position.set(x, y);
      this.detail.addChild(node);
      return node;
    };
    const title = text(strings.t(offer.titleId), 60, -86, fontFamily(MAIN_FONT), 14, 0.5, 0xffe9a8);
    if (title.width > 310) title.scale.set(310 / title.width);
    const description = new Text({
      text: strings.t(offer.descriptionId),
      style: { fontFamily: fontFamily(ROW_FONT), fontSize: 10, fill: 0xffffff, wordWrap: true, wordWrapWidth: 325, lineHeight: 13 },
    });
    // 0x4c59e: in the box (−105, −80)–(220, 40), from its left and its top.
    description.position.set(-105, -80);
    // Long texts shrink to stay in the box.
    if (description.height > 120) description.scale.set(120 / description.height);
    this.detail.addChild(description);

    const money = fontFamily(SCORE_FONT);
    text(strings.t('IMPROVEMENTS_DIALOG.COST'), -110, 63, fontFamily(MAIN_FONT), 13, 0, 0xffc23a);
    text(String(offer.price), 210, 63, money, 14, 1, 0xffe45c);
    text(strings.t('IMPROVEMENTS_DIALOG.AVAILABLE'), -110, 95, fontFamily(MAIN_FONT), 13, 0, 0xffc23a);
    text(String(this.progress.funds(this.stage, this.level)), 210, 95, money, 14, 1, 0xffe45c);

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
