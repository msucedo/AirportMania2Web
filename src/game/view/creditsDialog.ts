import { Container, type FederatedPointerEvent, Text, type Ticker } from 'pixi.js';
import type { Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import { COLUMNS_APART, CreditsRoll, creditsItemAlpha, parseCredits, type RollTouch } from '../credits';
import { SCORE_FONT } from './floatingText';
import { dialogButton } from './dialog';
import { centred, type Face, title, white } from './tutorialViews';

// The credits (dialog 0x28f40): a 438×280 frame with the roll at (0, −25) from its centre and
// Close, 380 wide, at (0, 120). See src/game/credits.ts and docs/re-notes.md.

export const CREDITS_SURFACES = ['MAIN_MENU.CREDITS.REFLEXIVE_LOGO', 'MAIN_MENU.CREDITS.REFLEXIVE_TEXT', 'MAIN_MENU.CREDITS.SWG_LOGO', 'MAIN_MENU.CREDITS.SWG_TEXT'];
export const CREDITS_FONTS = ['FONTS.TEEN_BD'];

const face = (font: string): Face => (font === 'FONTS.WHITE' ? white() : title());

export class CreditsDialog extends Container {
  private readonly roll: CreditsRoll;
  private readonly rolled = new Container();
  private readonly shown: { node: Container; y: number; height: number }[] = [];
  private touch: RollTouch | null = null;

  constructor(
    textures: TextureStore,
    audio: AudioPlayer,
    strings: Strings,
    private readonly ticker: Ticker,
    onClose: () => void,
  ) {
    super();
    const { overlay, centre } = centred(textures, 438, 280);
    // The cached font's height is taken for the line's; what the original keeps there is not read.
    const layout = parseCredits(strings.t('CREDITS_DIALOG.TEXT'), (font) => face(font).size, (resource) => textures.sprite(resource).height);
    this.roll = new CreditsRoll(layout.total);
    const write = (value: string, font: string, x: number): Text => {
      const style = face(font);
      const node = new Text({ text: value, style: { fontFamily: style.family, fontSize: style.size, fill: style.fill, ...(style.stroke === undefined ? {} : { stroke: { color: style.stroke, width: 3 } }) } });
      node.anchor.set(0.5, 0);
      node.x = x;
      return node;
    };
    for (const item of layout.items) {
      const node = new Container();
      if (item.kind === 'image') node.addChild(textures.sprite(item.resource));
      else if (item.kind === 'line') node.addChild(write(item.text, item.font, 0));
      else node.addChild(write(item.left, item.font, -COLUMNS_APART / 2), write(item.right, item.font, COLUMNS_APART / 2));
      node.y = item.y;
      this.rolled.addChild(node);
      this.shown.push({ node, y: item.y, height: item.height });
    }
    centre.addChild(this.rolled);
    dialogButton(textures, audio, centre, { x: 0, y: 120, width: 380, height: 30 }, strings.t('CLOSE'), fontFamily(SCORE_FONT), onClose);
    this.addChild(overlay);

    // A finger anywhere on the screen drags the roll.
    this.eventMode = 'static';
    this.on('pointerdown', (event: FederatedPointerEvent) => (this.touch = { began: true, y: event.getLocalPosition(this).y }));
    this.on('globalpointermove', (event: FederatedPointerEvent) => {
      if (this.touch) this.touch.y = event.getLocalPosition(this).y;
    });
    const release = (): void => void (this.touch = null);
    this.on('pointerup', release);
    this.on('pointerupoutside', release);

    this.ticker.add(this.step, this);
    this.place();
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.ticker.remove(this.step, this);
    super.destroy(options);
  }

  private step(ticker: Ticker): void {
    this.roll.update(ticker.deltaMS / 1000, this.touch);
    if (this.touch) this.touch.began = false;
    this.place();
  }

  private place(): void {
    this.rolled.position.set(0, -25 - this.roll.offset);
    for (const item of this.shown) {
      const alpha = creditsItemAlpha(item, this.roll.offset) * this.roll.alpha;
      item.node.visible = alpha > 0;
      item.node.alpha = alpha;
    }
  }
}
