import { Container, NineSliceSprite, Text } from 'pixi.js';
import type { Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import { HELP_PAGES, helpPictures, nextTip } from '../help';
import { dialogButton } from './dialog';
import { SCORE_FONT } from './floatingText';
import { centred, textBox, white } from './tutorialViews';

// The help dialog (0x49c80): a 400×250 frame. Pages 1 to 7 have a picture at (−150, −70) with
// its text in (−100, −110)–(190, −10) and another at (148, 30) with its text in
// (−190, −18)–(94, 98). Page 8 has a text in (−190, −110)–(190, −80) and the tips shower
// (0x79e98): a character with a speech bubble holding one of the game's tips. Along the bottom,
// at y 110: an arrow back at −150 from page 2 on, Close 100 wide in the middle, and an arrow on
// at 150 up to page 7 or, on page 8, Next 85 wide. See docs/re-notes.md.

export const HELP_SURFACES = ['GUI.DIALOGS.ARROW', 'GUI.TIPS_SHOWER.SURFACE', 'GUI.TIPS_SHOWER.SPEECH_BUBBLE'];
export const HELP_FONTS = ['FONTS.TEEN_BD'];

/** The tips shower is 400 wide; its tips are 120 narrower, and their text 68 narrower still. */
const TIP_WIDTH = 400 - 120;

export class HelpDialog extends Container {
  private page = 1;
  private tip = 0;

  constructor(
    private readonly textures: TextureStore,
    private readonly audio: AudioPlayer,
    private readonly strings: Strings,
    private readonly stage: number,
    private readonly onClose: () => void,
  ) {
    super();
    this.show();
  }

  private show(): void {
    const old = this.removeChildren();
    // Destroyed once the touch that changed the page has been dispatched.
    setTimeout(() => old.forEach((child) => child.destroy({ children: true })));
    const { textures, audio, strings, page } = this;
    const { overlay, centre } = centred(textures, 400, 250);
    const family = fontFamily(SCORE_FONT);

    if (page < HELP_PAGES) {
      const [first, second] = helpPictures(page, this.stage);
      const one = textures.sprite(first);
      one.position.set(-150, -70);
      const two = textures.sprite(second);
      two.position.set(148, 30);
      centre.addChild(one, two);
      textBox(centre, strings.t(`HELP_DIALOG.${page}.1`), { x1: -100, y1: -110, x2: 190, y2: -10 }, white(), false);
      textBox(centre, strings.t(`HELP_DIALOG.${page}.2`), { x1: -190, y1: -18, x2: 94, y2: 98 }, white(), false);
    } else {
      textBox(centre, strings.t('HELP_DIALOG.TIPS'), { x1: -190, y1: -110, x2: 190, y2: -80 }, white(), false);
      centre.addChild(this.tipsShower());
      dialogButton(textures, audio, centre, { x: 150, y: 110, width: 85, height: 30 }, strings.t('HELP_DIALOG.NEXT_TIP_SHORT'), family, () => {
        this.tip = nextTip(this.tip, Number.parseInt(strings.t('GAME_TIP.COUNT'), 10));
        this.show();
      });
    }

    const arrow = (x: number, to: number, mirrored: boolean): void => {
      dialogButton(textures, audio, centre, { x, y: 110, width: 40, height: 30 }, '', family, () => {
        this.page = to;
        this.show();
      });
      const picture = textures.sprite('GUI.DIALOGS.ARROW');
      picture.position.set(x, 110);
      // Drawn over the button, it must not take the button's presses.
      picture.eventMode = 'none';
      if (mirrored) picture.scale.x = -1;
      centre.addChild(picture);
    };
    if (page > 1) arrow(-150, page - 1, false);
    dialogButton(textures, audio, centre, { x: 0, y: 110, width: 100, height: 30 }, strings.t('CLOSE'), family, this.onClose);
    if (page < HELP_PAGES) arrow(150, page + 1, true);
    this.addChild(overlay);
  }

  /**
   * The shower sits at (0, 5): the character 140 px left of it and the tip 60 px right. The tip
   * is a bubble 280 wide and 23 taller than its text, its top 11 above the text's, with the
   * text 34 px in from its left edge.
   */
  private tipsShower(): Container {
    const shower = new Container();
    shower.position.set(0, 5);
    const character = this.textures.sprite('GUI.TIPS_SHOWER.SURFACE');
    character.position.set(-(TIP_WIDTH / 2), 0);

    // `FONTS.TEEN` (Teen Bold at 10, 0.9 of its width) drawn at 0.8 of its size.
    const text = new Text({
      text: this.strings.t(`GAME_TIP.${this.tip}`),
      style: { fontFamily: fontFamily('FONTS.TEEN_BD'), fontSize: 10, fill: 0x000000, wordWrap: true, wordWrapWidth: (TIP_WIDTH - 68) / (0.8 * 0.9) },
    });
    text.scale.set(0.8 * 0.9, 0.8);
    text.anchor.set(0, 0.5);
    text.position.set(60 - TIP_WIDTH / 2 + 34, 0);

    // The bubble's picture is cut 34 px in from its left and 23 from its top, the tail staying
    // in the bottom left corner.
    const bubble = new NineSliceSprite({ texture: this.textures.texture('GUI.TIPS_SHOWER.SPEECH_BUBBLE'), leftWidth: 34, rightWidth: 17, topHeight: 23, bottomHeight: 22 });
    bubble.setSize(TIP_WIDTH, Math.round(text.height) + 23);
    bubble.position.set(60 - TIP_WIDTH / 2, Math.floor(-text.height / 2 - 11));
    shower.addChild(character, bubble, text);
    return shower;
  }
}
