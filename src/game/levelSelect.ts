import { Container, Graphics, Sprite, Text, type Application } from 'pixi.js';
import type { GameData } from '../data/load';
import type { Strings } from '../data/strings';
import { fontFamily, loadFonts } from '../engine/fonts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../engine/screen';
import type { TextureStore } from '../engine/textures';
import { Progress } from './progress';
import type { ImprovementOffer, StageLayout } from './stages/layout';
import { MAIN_FONT, SCORE_FONT } from './view/floatingText';

export interface LevelSelectOptions {
  stage: number;
  layout: StageLayout;
  strings: Strings;
  progress: Progress;
  /** Stage numbers that can be shown, with whether each is open. */
  stages: { stage: number; open: boolean }[];
  onPlay: (level: number) => void;
  onStage: (stage: number) => void;
}

const STAR = 'GUI.FINAL_REPORT.STAR_SMALL';

/**
 * Stage screen: the levels with their stars and best scores, and the shop of improvements.
 * Texts, fonts, star and improvement icons are the original ones; the layout is ours (the original
 * world map and improvements screen have not been reconstructed).
 */
export class LevelSelect {
  readonly root = new Container();
  private readonly main = fontFamily(MAIN_FONT);
  private readonly small = fontFamily(SCORE_FONT);
  private readonly shop = new Container();
  private readonly funds: Text;
  private readonly hint: Text;

  private constructor(
    private readonly textures: TextureStore,
    data: GameData,
    private readonly options: LevelSelectOptions,
  ) {
    const { strings, stage } = options;
    this.root.addChild(new Graphics().rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill(0x1d2c3f));
    this.text(`${strings.t(`STAGES.${stage}.TITLE`)} - ${strings.t(`STAGES.${stage}.NAME`)}`, SCREEN_WIDTH / 2, 16, 15, this.main, 0xffb52e, 0.5, SCREEN_WIDTH - 110);
    // Arrows to the neighbouring stages.
    for (const [delta, x, glyph] of [[-1, 22, '\u25c0'], [1, SCREEN_WIDTH - 22, '\u25b6']] as const) {
      const target = options.stages.find((s) => s.stage === stage + delta);
      if (!target) continue;
      const arrow = new Text({ text: glyph, style: { fontFamily: 'sans-serif', fontSize: 18, fill: target.open ? 0xffe45c : 0x4a5562 } });
      arrow.anchor.set(0.5);
      arrow.position.set(x, 16);
      if (target.open) {
        arrow.eventMode = 'static';
        arrow.cursor = 'pointer';
        arrow.on('pointerdown', () => options.onStage(target.stage));
      }
      this.root.addChild(arrow);
    }

    const area = data.areas.get(stage)!;
    const width = Math.min(72, Math.floor((SCREEN_WIDTH - 16) / area.levelsCount));
    const left = (SCREEN_WIDTH - area.levelsCount * width) / 2;
    for (let level = 1; level <= area.levelsCount; level++) this.levelTile(level, left + (level - 1) * width, 34, width - 6);

    this.funds = this.text('', 12, 116, 13, this.main, 0xffe45c, 0);
    this.root.addChild(this.shop);
    this.hint = this.text('', SCREEN_WIDTH / 2, 292, 10, this.small, 0xcfd8e3, 0.5, SCREEN_WIDTH - 24);
    this.hint.style.wordWrap = true;
    this.hint.style.wordWrapWidth = SCREEN_WIDTH - 24;
    this.hint.style.align = 'center';
    this.drawShop();
  }

  static async create(app: Application, data: GameData, textures: TextureStore, options: LevelSelectOptions): Promise<LevelSelect> {
    const ids = [STAR, ...options.layout.improvements.flatMap((offer) => [`${offer.icon}.ACTIVE`, `${offer.icon}.GRAYED`])];
    await Promise.all([textures.load(ids), loadFonts(data.resources, [MAIN_FONT, SCORE_FONT])]);
    const screen = new LevelSelect(textures, data, options);
    app.stage.addChild(screen.root);
    return screen;
  }

  private text(value: string, x: number, y: number, size: number, family: string, fill: number, anchorX: number, maxWidth?: number): Text {
    const node = new Text({ text: value, style: { fontFamily: family, fontSize: size, fill, stroke: { color: 0x101820, width: 3 } } });
    node.anchor.set(anchorX, 0.5);
    node.position.set(x, y);
    if (maxWidth && node.width > maxWidth) node.scale.set(maxWidth / node.width);
    this.root.addChild(node);
    return node;
  }

  private levelTile(level: number, x: number, y: number, width: number): void {
    const { progress, stage, strings } = this.options;
    const open = progress.unlocked(stage, level);
    const result = progress.result(stage, level);
    const tile = new Container();
    tile.position.set(x, y);
    tile.addChild(new Graphics().roundRect(0, 0, width, 64, 8).fill(open ? 0x2f4a68 : 0x26313d).stroke({ color: open ? 0xf2f2f2 : 0x4a5562, width: 1 }));

    const label = new Text({ text: strings.t('MAP.LEVEL_STAGE_NUMBER', stage, level), style: { fontFamily: this.main, fontSize: 11, fill: open ? 0xffffff : 0x7d8894 } });
    label.anchor.set(0.5);
    label.position.set(width / 2, 14);
    if (label.width > width - 6) label.scale.set((width - 6) / label.width);
    tile.addChild(label);

    for (let i = 0; i < 5; i++) {
      const star = this.textures.sprite(STAR);
      star.anchor.set(0.5);
      star.scale.set(0.44);
      star.position.set(width / 2 + (i - 2) * 12, 34);
      star.tint = i < result.stars ? 0xffffff : 0x4c5661;
      tile.addChild(star);
    }
    const best = new Text({ text: result.best > 0 ? String(result.best) : '-', style: { fontFamily: this.small, fontSize: 12, fill: open ? 0xffe45c : 0x7d8894 } });
    best.anchor.set(0.5);
    best.position.set(width / 2, 52);
    tile.addChild(best);

    if (open) {
      tile.eventMode = 'static';
      tile.cursor = 'pointer';
      tile.on('pointerdown', () => this.options.onPlay(level));
    }
    this.root.addChild(tile);
  }

  private available(offer: ImprovementOffer): boolean {
    return offer.requires === undefined || this.options.progress.owns(Progress.improvementKey(this.options.stage, offer.requires));
  }

  private drawShop(): void {
    const { progress, strings, layout } = this.options;
    this.funds.text = `${strings.t('IMPROVEMENTS_DIALOG.AVAILABLE')} ${progress.funds}`;
    this.shop.removeChildren().forEach((child) => child.destroy({ children: true }));

    const columns = 4;
    const width = 114;
    const height = 74;
    layout.improvements.forEach((offer, i) => {
      const key = Progress.improvementKey(this.options.stage, offer.id);
      const owned = progress.owns(key);
      const buyable = !owned && this.available(offer) && progress.funds >= offer.price;
      const tile = new Container();
      tile.position.set(12 + (i % columns) * width, 130 + Math.floor(i / columns) * height);
      tile.addChild(new Graphics().roundRect(0, 0, width - 6, height - 6, 8).fill(owned ? 0x2e5a3c : 0x2a3a4d).stroke({ color: buyable ? 0xffe45c : 0x4a5562, width: buyable ? 2 : 1 }));

      const icon: Sprite = this.textures.sprite(`${offer.icon}.${owned || buyable ? 'ACTIVE' : 'GRAYED'}`);
      icon.anchor.set(0.5);
      icon.position.set(24, 26);
      const room = 40 / Math.max(icon.texture.width, icon.texture.height);
      if (room < 1) icon.scale.set(room);
      tile.addChild(icon);

      const title = new Text({ text: strings.t(offer.titleId), style: { fontFamily: this.small, fontSize: 10, fill: 0xffffff, wordWrap: true, wordWrapWidth: 58, lineHeight: 11 } });
      title.position.set(47, 6);
      tile.addChild(title);
      // The game has no "bought" caption (its dialog offers Buy and Sell), so owned items get a tick.
      const price = new Text({ text: owned ? '\u2713' : `${strings.t('IMPROVEMENTS_DIALOG.COST')} ${offer.price}`, style: { fontFamily: owned ? 'sans-serif' : this.small, fontSize: owned ? 16 : 11, fill: owned ? 0x9be37a : buyable ? 0xffe45c : 0x9aa5b1 } });
      price.anchor.set(0.5);
      price.position.set((width - 6) / 2, height - 18);
      if (price.width > width - 14) price.scale.set((width - 14) / price.width);
      tile.addChild(price);

      tile.eventMode = 'static';
      tile.cursor = buyable ? 'pointer' : 'default';
      tile.on('pointerover', () => (this.hint.text = strings.t(offer.descriptionId).split('\n\n')[0]!.replace(/\n/g, '  ')));
      tile.on('pointerdown', () => {
        this.hint.text = strings.t(offer.descriptionId).split('\n\n')[0]!.replace(/\n/g, '  ');
        // Redraw after the event has finished: rebuilding the tiles destroys the one being pressed.
        if (buyable && progress.buy(key, offer.price)) setTimeout(() => this.drawShop(), 0);
      });
      this.shop.addChild(tile);
    });
  }
}
