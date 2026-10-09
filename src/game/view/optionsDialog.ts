import { Container, Graphics, NineSliceSprite, Rectangle, Text, type FederatedPointerEvent, type Sprite } from 'pixi.js';
import { LANGUAGES, type Language, type Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../engine/screen';
import type { TextureStore } from '../../engine/textures';
import type { Settings } from '../settings';
import { MAIN_FONT, SCORE_FONT } from './floatingText';

export const OPTIONS_SURFACES = [
  'GUI.DIALOGS.BACK.BOX',
  'GUI.DIALOGS.BUTTON',
  'GUI.DIALOGS.BUTTON_OVER',
  'GUI.DIALOGS.BAR',
  'GUI.DIALOGS.NIPPLE',
  'GUI.DIALOGS.NIPPLE_OVER',
  'GUI.DIALOGS.ARROW',
  ...LANGUAGES.map((language) => `FLAGS.${language.toUpperCase()}`),
];

const BOX = { width: 300, height: 232 };
const SLIDER = { x: 150, width: 120 };

/**
 * Options: sound and music volume and the language. It is built from the original dialog pieces
 * (frame, sliders, buttons, language flags) and texts, in a layout of our own; the original
 * dialog (0x2220) has more entries that mean nothing in a browser.
 */
export class OptionsDialog extends Container {
  private readonly draft: Settings;
  private readonly flag: Sprite;

  constructor(
    private readonly textures: TextureStore,
    private readonly audio: AudioPlayer,
    strings: Strings,
    settings: Settings,
    onClose: (chosen: Settings) => void,
  ) {
    super();
    this.draft = { ...settings };
    // Dims the screen and keeps touches from reaching it.
    const shade = new Graphics().rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill({ color: 0x000000, alpha: 0.6 });
    shade.eventMode = 'static';
    const panel = new Container();
    panel.position.set((SCREEN_WIDTH - BOX.width) / 2, (SCREEN_HEIGHT - BOX.height) / 2);
    const frame = new NineSliceSprite({ texture: textures.texture('GUI.DIALOGS.BACK.BOX'), leftWidth: 24, rightWidth: 24, topHeight: 24, bottomHeight: 24 });
    frame.setSize(BOX.width, BOX.height);
    // The frame's own filling is translucent; a solid backing keeps the texts readable over the menu.
    panel.addChild(new Graphics().roundRect(4, 4, BOX.width - 8, BOX.height - 8, 20).fill({ color: 0x3b1d4d, alpha: 0.92 }), frame);
    this.addChild(shade, panel);

    const main = fontFamily(MAIN_FONT);
    const small = fontFamily(SCORE_FONT);
    const text = (value: string, x: number, y: number, size: number, family: string, anchorX = 0): Text => {
      const node = new Text({ text: value, style: { fontFamily: family, fontSize: size, fill: 0xffffff, stroke: { color: 0x2a1030, width: 3 } } });
      node.anchor.set(anchorX, 0.5);
      node.position.set(x, y);
      panel.addChild(node);
      return node;
    };
    text(strings.t('OPTIONS_DIALOG.OPTIONS'), BOX.width / 2, 26, 18, main, 0.5);

    text(strings.t('OPTIONS_DIALOG.SOUND_FX'), 24, 68, 13, small);
    this.slider(panel, 68, this.draft.sound, (value, released) => {
      this.draft.sound = value;
      audio.setVolumes(this.draft.sound, this.draft.music);
      if (released) audio.play('SOUNDS.CLICK');
    });
    text(strings.t('OPTIONS_DIALOG.MUSIC'), 24, 104, 13, small);
    this.slider(panel, 104, this.draft.music, (value) => {
      this.draft.music = value;
      audio.setVolumes(this.draft.sound, this.draft.music);
    });

    text(strings.t('OPTIONS_DIALOG.LANGUAGE'), 24, 144, 13, small);
    this.flag = textures.sprite(`FLAGS.${this.draft.language.toUpperCase()}`);
    this.flag.scale.set(0.62);
    this.flag.position.set(SLIDER.x + SLIDER.width / 2, 144);
    panel.addChild(this.flag);
    for (const step of [-1, 1]) {
      const arrow = textures.sprite('GUI.DIALOGS.ARROW');
      arrow.position.set(SLIDER.x + SLIDER.width / 2 + step * 74, 144);
      // The art points left.
      arrow.scale.set(-step * 0.8, 0.8);
      arrow.eventMode = 'static';
      arrow.cursor = 'pointer';
      arrow.hitArea = new Rectangle(-18, -18, 36, 36);
      arrow.on('pointertap', () => {
        audio.play('SOUNDS.CLICK');
        this.stepLanguage(step);
      });
      panel.addChild(arrow);
    }

    this.button(panel, BOX.width / 2, 194, strings.t('LANGUAGE_SELECTION_DIALOG.CHANGE_LANGUAGE'), small, () => onClose(this.draft));
  }

  private stepLanguage(step: number): void {
    const index = (LANGUAGES.indexOf(this.draft.language) + step + LANGUAGES.length) % LANGUAGES.length;
    this.draft.language = LANGUAGES[index] as Language;
    this.flag.texture = this.textures.texture(`FLAGS.${this.draft.language.toUpperCase()}`);
  }

  private slider(panel: Container, y: number, initial: number, onChange: (value: number, released: boolean) => void): void {
    const bar = new NineSliceSprite({ texture: this.textures.texture('GUI.DIALOGS.BAR'), leftWidth: 8, rightWidth: 8, topHeight: 5, bottomHeight: 5 });
    bar.setSize(SLIDER.width + 12, 12);
    bar.position.set(SLIDER.x - 6, y - 6);
    const knob = this.textures.sprite('GUI.DIALOGS.NIPPLE');
    knob.position.set(SLIDER.x + SLIDER.width * initial, y);
    const zone = new Container();
    zone.hitArea = new Rectangle(SLIDER.x - 14, y - 18, SLIDER.width + 28, 36);
    zone.eventMode = 'static';
    zone.cursor = 'pointer';
    let held = false;
    const move = (event: FederatedPointerEvent, released: boolean): void => {
      const value = Math.max(0, Math.min(1, (panel.toLocal(event.global).x - SLIDER.x) / SLIDER.width));
      knob.x = SLIDER.x + SLIDER.width * value;
      onChange(value, released);
    };
    zone.on('pointerdown', (event: FederatedPointerEvent) => {
      held = true;
      knob.texture = this.textures.texture('GUI.DIALOGS.NIPPLE_OVER');
      move(event, false);
    });
    zone.on('globalpointermove', (event: FederatedPointerEvent) => {
      if (held) move(event, false);
    });
    const release = (event: FederatedPointerEvent): void => {
      if (!held) return;
      held = false;
      knob.texture = this.textures.texture('GUI.DIALOGS.NIPPLE');
      move(event, true);
    };
    zone.on('pointerup', release);
    zone.on('pointerupoutside', release);
    panel.addChild(bar, knob, zone);
  }

  private button(panel: Container, x: number, y: number, label: string, family: string, onPress: () => void): void {
    const width = 110;
    const face = new NineSliceSprite({ texture: this.textures.texture('GUI.DIALOGS.BUTTON'), leftWidth: 18, rightWidth: 18, topHeight: 18, bottomHeight: 18 });
    face.setSize(width, 40);
    face.position.set(x - width / 2, y - 20);
    const zone = new Container();
    zone.hitArea = new Rectangle(x - width / 2, y - 20, width, 40);
    zone.eventMode = 'static';
    zone.cursor = 'pointer';
    zone.on('pointerover', () => (face.texture = this.textures.texture('GUI.DIALOGS.BUTTON_OVER')));
    zone.on('pointerout', () => (face.texture = this.textures.texture('GUI.DIALOGS.BUTTON')));
    zone.on('pointerdown', () => {
      this.audio.play('SOUNDS.CLICK');
      onPress();
    });
    const text = new Text({ text: label, style: { fontFamily: family, fontSize: 14, fill: 0xffffff } });
    text.anchor.set(0.5);
    text.position.set(x, y);
    panel.addChild(face, text, zone);
  }
}
