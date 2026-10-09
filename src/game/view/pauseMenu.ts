import { Container } from 'pixi.js';
import type { Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import { dialogButton, dialogFrame, dialogText } from './dialog';
import { MAIN_FONT, SCORE_FONT } from './floatingText';

export type PauseChoice = 'resume' | 'options' | 'restart' | 'map';

const BOX = { width: 220, height: 236 };

/**
 * What the menu button shows during a level: the game stops and offers to go on, change the
 * options, start the level again or leave for the map. Original pieces and texts, our layout.
 */
export class PauseMenu extends Container {
  constructor(textures: TextureStore, audio: AudioPlayer, strings: Strings, onChoice: (choice: PauseChoice) => void) {
    super();
    const { overlay, panel } = dialogFrame(textures, BOX.width, BOX.height);
    this.addChild(overlay);
    dialogText(panel, strings.t('PAUSE.PAUSED'), BOX.width / 2, 28, 18, fontFamily(MAIN_FONT), 0.5);
    const entries: readonly (readonly [PauseChoice, string])[] = [
      ['resume', 'RESUME'],
      ['options', 'OPTIONS_DIALOG.OPTIONS'],
      ['restart', 'FINISH_GAME_DIALOG.RESTART_LEVEL'],
      ['map', 'FINISH_GAME_DIALOG.MAP'],
    ];
    entries.forEach(([choice, text], i) => {
      dialogButton(textures, audio, panel, { x: BOX.width / 2, y: 70 + i * 42, width: 170, height: 36 }, strings.t(text), fontFamily(SCORE_FONT), () => onChoice(choice));
    });
  }
}
