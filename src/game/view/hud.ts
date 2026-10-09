import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { LevelGoals } from '../../data/levels';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';

// In-game HUD built from the original sprites. The progress bar rectangle comes from the binary
// (InGameGUI draw, 0x4f476: x 194..313, y 4..15); the score window and slot positions are measured
// on the background image. Digit colours, the fill colour and the clock placement are approximations.

export const HUD_SURFACES = [
  'GUI.INGAMEGUI.BACK',
  'GUI.INGAMEGUI.BLACK_NUMBERS',
  'GUI.INGAMEGUI.RED_NUMBERS',
  'GUI.INGAMEGUI.BAR_SEPARATOR',
  'GUI.INGAMEGUI.PROGRESS_BAR_EFFECT',
  'GUI.INGAMEGUI.MENU_BUTTON',
  'GUI.INGAMEGUI.MENU_BUTTON_OVER',
];
export const HUD_FONT = 'FONTS.KENYAN_COFFEE_BD';
export const HUD_HEIGHT = 34;

/** Score window: eight cells, 11 px apart, each 10×10 inside. */
const SCORE = { x: 82, y: 6, cells: 8, pitch: 11, size: 10 };
/** Digit strips: 13 px wide, one glyph every 20 px; "0" is centred on y = 28. */
const STRIP = { width: 13, glyph: 13, pitch: 20, zeroTop: 22, minusTop: 3 };
/** Inside of the progress slot. */
const BAR = { x: 196, y: 6, width: 117, height: 9 };
const MENU = { x: 425, y: 0, width: 55, height: 30 };

export class Hud extends Container {
  private readonly digits: Sprite[] = [];
  private readonly glyphs: { black: Texture[]; red: Texture[]; minus: { black: Texture; red: Texture } };
  private readonly fill = new Graphics();
  private readonly glow: Sprite;
  private readonly clock: Text;
  private readonly menu: Sprite;
  /** Value on the reels, which rolls towards the real score. */
  private shown = 0;
  onPause: (() => void) | null = null;

  constructor(
    private readonly textures: TextureStore,
    private readonly goals: LevelGoals,
  ) {
    super();
    // The score window is a hole in the background image and the digit strips are opaque, so the
    // reels close it; cells with no digit are backed with the strips' own paper colour.
    const paper = new Graphics();
    paper.rect(SCORE.x - 3, SCORE.y - 2, SCORE.cells * SCORE.pitch + 4, SCORE.size + 4).fill(textures.rowColor('GUI.INGAMEGUI.BLACK_NUMBERS', 18));
    this.addChild(paper, textures.sprite('GUI.INGAMEGUI.BACK'));

    this.glyphs = {
      black: this.digitTextures('GUI.INGAMEGUI.BLACK_NUMBERS'),
      red: this.digitTextures('GUI.INGAMEGUI.RED_NUMBERS'),
      minus: {
        black: this.frame('GUI.INGAMEGUI.BLACK_NUMBERS', STRIP.minusTop),
        red: this.frame('GUI.INGAMEGUI.RED_NUMBERS', STRIP.minusTop),
      },
    };
    for (let i = 0; i < SCORE.cells; i++) {
      const digit = new Sprite(this.glyphs.black[0]!);
      digit.position.set(SCORE.x + i * SCORE.pitch, SCORE.y);
      digit.setSize(SCORE.size, SCORE.size);
      this.digits.push(digit);
      this.addChild(digit);
    }

    this.addChild(this.fill);
    this.glow = textures.sprite('GUI.INGAMEGUI.PROGRESS_BAR_EFFECT');
    this.glow.anchor.set(1, 0.5);
    this.glow.blendMode = 'add';
    this.glow.height = BAR.height;
    this.addChild(this.glow);
    for (const value of [goals.goal, goals.expert, goals.master, goals.supreme]) {
      const separator = textures.sprite('GUI.INGAMEGUI.BAR_SEPARATOR');
      separator.anchor.set(0.5, 0);
      separator.position.set(BAR.x + BAR.width * (value / goals.perfect), 0);
      this.addChild(separator);
    }

    this.clock = new Text({ text: '', style: { fontFamily: fontFamily(HUD_FONT), fontSize: 13, fill: 0xffffff, stroke: { color: 0x202020, width: 2 } } });
    this.clock.anchor.set(0.5);
    this.clock.position.set(372, 11);
    this.addChild(this.clock);

    this.menu = textures.sprite('GUI.INGAMEGUI.MENU_BUTTON');
    this.menu.position.set(MENU.x, MENU.y);
    this.menu.eventMode = 'static';
    this.menu.cursor = 'pointer';
    this.menu.on('pointerover', () => (this.menu.texture = textures.texture('GUI.INGAMEGUI.MENU_BUTTON_OVER')));
    this.menu.on('pointerout', () => (this.menu.texture = textures.texture('GUI.INGAMEGUI.MENU_BUTTON')));
    this.menu.on('pointerdown', (event) => {
      event.stopPropagation();
      this.onPause?.();
    });
    this.addChild(this.menu);
  }

  /** True when the point belongs to the HUD and must not reach the airport. */
  contains(y: number): boolean {
    return y < HUD_HEIGHT;
  }

  update(score: number, secondsLeft: number, dt: number): void {
    // Roll the reels towards the score, faster the further away they are.
    const gap = score - this.shown;
    if (gap !== 0) {
      const step = Math.max(5, Math.ceil(Math.abs(gap) * 6 * dt));
      this.shown = Math.abs(gap) <= step ? score : this.shown + Math.sign(gap) * step;
    }
    this.drawScore(Math.round(this.shown));

    const fraction = Math.max(0, Math.min(1, score / this.goals.perfect));
    this.fill.clear();
    if (fraction > 0) {
      const color = score >= this.goals.goal ? 0x6cc04a : 0xf2a33a;
      this.fill.rect(BAR.x, BAR.y, BAR.width * fraction, BAR.height).fill(color);
    }
    this.glow.visible = fraction > 0;
    this.glow.position.set(BAR.x + BAR.width * fraction, BAR.y + BAR.height / 2);
    this.glow.width = Math.min(64, BAR.width * fraction);

    const minutes = Math.floor(secondsLeft / 60);
    this.clock.text = `${minutes}:${String(secondsLeft % 60).padStart(2, '0')}`;
  }

  private drawScore(value: number): void {
    const negative = value < 0;
    const set = negative ? this.glyphs.red : this.glyphs.black;
    const text = String(Math.abs(value)).slice(-SCORE.cells);
    const first = SCORE.cells - text.length;
    this.digits.forEach((sprite, i) => {
      if (i >= first) {
        sprite.texture = set[Number(text[i - first])]!;
        sprite.visible = true;
      } else if (negative && i === first - 1) {
        sprite.texture = this.glyphs.minus.red;
        sprite.visible = true;
      } else {
        sprite.visible = false;
      }
    });
  }

  private digitTextures(id: string): Texture[] {
    return Array.from({ length: 10 }, (_, digit) => this.frame(id, STRIP.zeroTop + digit * STRIP.pitch));
  }

  private frame(id: string, top: number): Texture {
    const strip = this.textures.texture(id);
    return new Texture({ source: strip.source, frame: new Rectangle(0, top, STRIP.width, STRIP.glyph) });
  }
}
