import { Container, type FederatedPointerEvent, NineSliceSprite, Rectangle, type Sprite, Text } from 'pixi.js';
import type { Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import { Users } from '../users';
import { dialogButton } from './dialog';
import { SCORE_FONT } from './floatingText';
import { centred, textBox, white } from './tutorialViews';

// The users' dialogs: the list of users (0x80cd8), the name asked for a new or renamed one
// (0x805ac), the note that a name will not do (0x803cc) and the question before deleting
// (0x7fe40). Sizes and positions are the original's, from each dialog's centre; how the list
// and the text field behave inside is ours where noted. See docs/re-notes.md.

export const USERS_SURFACES = ['GUI.DIALOGS.EDITBOX', 'GUI.DIALOGS.COMBOBOX.BACK', 'GUI.DIALOGS.COMBOBOX.ARROW', 'GUI.DIALOGS.COMBOBOX.TEXT_REMARK'];
export const USERS_FONTS = ['FONTS.TEEN_BD'];
export const USERS_SOUNDS = ['SOUNDS.USER_CONFIRM_DELETE'];

const ROW = 36;
const CAP = 32;

interface Common {
  textures: TextureStore;
  audio: AudioPlayer;
  strings: Strings;
  users: Users;
}

const label = (value: string): Text => new Text({ text: value, style: { fontFamily: white().family, fontSize: white().size, fill: white().fill } });

/** The row a list shows first so the picked one is in view (0x2e678). */
export function firstRowShown(first: number, picked: number, rows: number): number {
  if (picked < 0) return first;
  if (picked >= first + rows) return picked - rows + 1;
  return picked < first ? picked : first;
}

/** How solid the text field's caret is `time` seconds on (0x2ddac): it blinks 8 radians a second. */
export const caretAlpha = (time: number): number => Math.max(0, Math.min(1, 4 * (Math.sin(8 * time) + 0.5)));

/**
 * The list box (0x2f0e8 over 0x2ead0; update 0x2e6ec, draw 0x2e478): `rows` rows of 36 px,
 * `width` wide, in a frame 24 px wider with a 32 px cap above and below. The picked row lies on
 * a yellow band 12 px wider than the rows. The caps' arrows pick the row before and the row
 * after, the rows shown following; an arrow that leads nowhere is drawn at 0.7.
 */
class ListBox extends Container {
  private first = 0;
  private readonly rows = new Container();
  private readonly arrows: Sprite[] = [];

  constructor(
    private readonly textures: TextureStore,
    private readonly width_: number,
    private readonly count: number,
    private readonly names: () => readonly string[],
    private readonly selected: () => number,
    private readonly onSelect: (index: number) => void,
  ) {
    super();
    const height = count * ROW;
    const frame = new NineSliceSprite({ texture: textures.texture('GUI.DIALOGS.COMBOBOX.BACK'), leftWidth: 12, rightWidth: 12, topHeight: CAP, bottomHeight: CAP });
    frame.setSize(width_ + 24, height + 2 * CAP);
    frame.position.set(-width_ / 2 - 12, -height / 2 - CAP);
    this.addChild(frame, this.rows);
    const cap = (edge: number, by: number, flipped: boolean): void => {
      // The arrow fills the 30 px beyond the rows; the lower one is the upper one turned over.
      const arrow = textures.sprite('GUI.DIALOGS.COMBOBOX.ARROW');
      arrow.anchor.set(0.5, 1);
      arrow.position.set(0, edge);
      if (flipped) arrow.scale.y = -1;
      arrow.eventMode = 'none';
      this.arrows.push(arrow);
      const zone = new Container();
      zone.hitArea = new Rectangle(-width_ / 2, flipped ? edge : edge - 30, width_, 30);
      zone.eventMode = 'static';
      zone.on('pointerdown', (event: FederatedPointerEvent) => {
        event.stopPropagation();
        const next = this.selected() + by;
        if (next < 0 || next >= this.names().length) return;
        this.onSelect(next);
        this.draw();
      });
      this.addChild(zone, arrow);
    };
    cap(-height / 2, -1, false);
    cap(height / 2, 1, true);
    this.draw();
  }

  private draw(): void {
    const names = this.names();
    const picked = this.selected();
    this.first = Math.max(0, firstRowShown(this.first, picked, this.count));
    this.arrows[0]!.alpha = picked > 0 ? 1 : 0.7;
    this.arrows[1]!.alpha = picked >= 0 && picked < names.length - 1 ? 1 : 0.7;
    for (const child of this.rows.removeChildren()) child.destroy({ children: true });
    const top = (-this.count * ROW) / 2;
    for (let row = 0; row < this.count; row++) {
      const index = this.first + row;
      const name = names[index];
      if (name === undefined) break;
      const y = top + row * ROW + ROW / 2;
      if (index === picked) {
        const band = new NineSliceSprite({ texture: this.textures.texture('GUI.DIALOGS.COMBOBOX.TEXT_REMARK'), leftWidth: 12, rightWidth: 12, topHeight: 0, bottomHeight: 0 });
        band.setSize(this.width_ + 12, 38);
        band.position.set(-this.width_ / 2 - 6, y - 19);
        this.rows.addChild(band);
      }
      const text = label(name);
      text.anchor.set(0.5);
      text.position.set(0, y);
      if (text.width > this.width_) text.scale.x = this.width_ / text.width;
      this.rows.addChild(text);
    }
  }
}

/** The users (0x80cd8): 340×250, the list at (−80, −30), New, Rename and Delete 120 wide at x 100, Load Profile 320 wide at (0, 100). */
export class UsersDialog extends Container {
  constructor(
    private readonly common: Common,
    private readonly onClose: () => void,
  ) {
    super();
    this.show();
  }

  private show(): void {
    const old = this.removeChildren();
    setTimeout(() => old.forEach((child) => child.destroy({ children: true })));
    const { textures, audio, strings, users } = this.common;
    const { overlay, centre } = centred(textures, 340, 250);
    const family = fontFamily(SCORE_FONT);
    const list = new ListBox(
      textures,
      160,
      3,
      () => users.list.map((user) => user.name),
      () => users.currentIndex,
      (index) => users.select(index),
    );
    list.position.set(-80, -30);
    centre.addChild(list);

    // Rename, Delete and Load Profile are greyed while there is no user (0x8120c).
    const button = (x: number, y: number, width: number, text: string, onPress: () => void, needsUser: boolean): void => {
      if (!needsUser || users.list.length > 0) return dialogButton(textures, audio, centre, { x, y, width, height: 30 }, text, family, onPress);
      const greyed = new Text({ text, style: { fontFamily: family, fontSize: 14, fill: 0xffffff } });
      greyed.anchor.set(0.5);
      greyed.position.set(x, y);
      greyed.alpha = 0.35;
      centre.addChild(greyed);
    };
    const ask = (mode: 'new' | 'rename'): void => this.open(new NameDialog(this.common, mode, () => this.shut()));
    button(100, -90, 120, strings.t('USERS_DIALOG.NEW_USER_BUTTON'), () => ask('new'), false);
    button(100, -30, 120, strings.t('USERS_DIALOG.RENAME_USER_BUTTON'), () => ask('rename'), true);
    button(100, 30, 120, strings.t('USERS_DIALOG.DELETE_USER_BUTTON'), () => this.open(new DeleteDialog(this.common, () => this.shut())), true);
    button(0, 100, 320, strings.t('USERS_DIALOG.LOAD_PROFILE'), this.onClose, true);
    this.addChild(overlay);
  }

  private open(dialog: Container): void {
    this.addChild(dialog);
  }

  /** A dialog over this one has closed: the list is drawn again with what it changed. */
  private shut(): void {
    this.show();
  }
}

/**
 * The name of a new or renamed user (0x805ac): 340×200, what is asked at y −80, the field 170
 * wide at (0, −20), OK at (−90, 70) and Cancel at (90, 70), 130 wide. Enter accepts too.
 */
export class NameDialog extends Container {
  private readonly input: HTMLInputElement;
  private readonly shown: Text;
  private readonly caret: Text;
  private note: Container | null = null;
  private readonly blink: ReturnType<typeof setInterval>;

  constructor(
    private readonly common: Common,
    /** `first` is the one asked when the game has no user yet. */
    private readonly mode: 'first' | 'new' | 'rename',
    private readonly onClose: () => void,
  ) {
    super();
    const { textures, audio, strings, users } = common;
    const { overlay, centre } = centred(textures, 340, 200);
    const asked = label(strings.t(mode === 'rename' ? 'USER_NAME_DIALOG.RENAME_THE_USER' : 'USER_NAME_DIALOG.ENTER_YOUR_NAME'));
    asked.anchor.set(0.5);
    asked.position.set(0, -80);

    // The field's picture is stretched to 36 px wider than the text's room and is 62 px tall.
    const field = new NineSliceSprite({ texture: textures.texture('GUI.DIALOGS.EDITBOX'), leftWidth: 18, rightWidth: 18, topHeight: 0, bottomHeight: 0 });
    field.setSize(170 + 36, 62);
    field.position.set(-85 - 18, -20 - 31);
    // 0x2dc58: the text is centred in the field, the caret 3 px after it.
    this.shown = label('');
    this.shown.anchor.set(0.5);
    this.shown.position.set(0, -20);
    this.caret = label('|');
    this.caret.anchor.set(0, 0.5);
    centre.addChild(asked, field, this.shown, this.caret);

    const family = fontFamily(SCORE_FONT);
    dialogButton(textures, audio, centre, { x: -90, y: 70, width: 130, height: 30 }, strings.t('OK'), family, () => this.accept());
    dialogButton(textures, audio, centre, { x: 90, y: 70, width: 130, height: 30 }, strings.t('CANCEL'), family, () => this.close());
    this.addChild(overlay);

    // The keyboard is the browser's: an input kept out of sight holds what is typed.
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.autocomplete = 'off';
    this.input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;';
    this.input.value = mode === 'rename' ? (users.current?.name ?? '') : users.defaultName(strings.t('USER_NAME_DIALOG.DEFAULT_USER_NAME'));
    this.input.addEventListener('input', () => this.typed());
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.accept();
    });
    document.body.appendChild(this.input);
    this.input.focus();
    this.eventMode = 'static';
    this.on('pointerdown', () => this.input.focus());
    const since = performance.now();
    this.blink = setInterval(() => (this.caret.alpha = caretAlpha((performance.now() - since) / 1000)), 33);
    this.typed();
  }

  /** The text is cut back until it fits the field (0x2e3d0). */
  private typed(): void {
    this.shown.text = this.input.value;
    while (this.shown.width > 170 && this.input.value.length > 0) {
      this.input.value = this.input.value.slice(0, -1);
      this.shown.text = this.input.value;
    }
    this.caret.position.set(this.shown.x + this.shown.width / 2 + 3, -20);
  }

  /** 0x80124: an empty name or one already in use is turned down with a note. */
  private accept(): void {
    if (this.note) return;
    const { users } = this.common;
    const problem = users.problem(this.input.value);
    if (problem) {
      this.note = new NagDialog(this.common, problem === 'null' ? 'USER_NAME_NAG_DIALOG.NAME_NULL' : 'USER_NAME_NAG_DIALOG.NAME_REPEATED', () => {
        const note = this.note;
        this.note = null;
        setTimeout(() => note?.destroy({ children: true }));
        this.input.focus();
      });
      this.addChild(this.note);
      return;
    }
    if (this.mode === 'rename') users.rename(this.input.value);
    else users.create(this.input.value);
    this.close();
  }

  private close(): void {
    setTimeout(() => this.destroy({ children: true }));
    this.onClose();
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    clearInterval(this.blink);
    this.input.remove();
    super.destroy(options);
  }
}

/** A name will not do (0x803cc): 340×240, the reason in (−150, −105)–(150, 95) and Back, 200 wide, at (0, 90). */
class NagDialog extends Container {
  constructor(common: Common, text: string, onClose: () => void) {
    super();
    const { overlay, centre } = centred(common.textures, 340, 240);
    textBox(centre, common.strings.t(text), { x1: -150, y1: -105, x2: 150, y2: 95 }, white(), true);
    dialogButton(common.textures, common.audio, centre, { x: 0, y: 90, width: 200, height: 30 }, common.strings.t('BACK'), fontFamily(SCORE_FONT), onClose);
    this.addChild(overlay);
  }
}

/** Before deleting the current user (0x7fe40): 400×200, the question in (−190, −90)–(190, 40), Yes at (−90, 65) and No, 100 wide, at (90, 65). */
class DeleteDialog extends Container {
  constructor(common: Common, onClose: () => void) {
    super();
    const { textures, audio, strings, users } = common;
    const { overlay, centre } = centred(textures, 400, 200);
    const question = strings.t('DELETE_USER_DIALOG.TEXT', users.current?.name ?? '').replace(/&quot;/g, '"');
    textBox(centre, question, { x1: -190, y1: -90, x2: 190, y2: 40 }, white(), true);
    const family = fontFamily(SCORE_FONT);
    const close = (): void => {
      setTimeout(() => this.destroy({ children: true }));
      onClose();
    };
    dialogButton(textures, audio, centre, { x: -90, y: 65, width: 100, height: 30 }, strings.t('YES'), family, () => {
      users.remove();
      close();
    });
    dialogButton(textures, audio, centre, { x: 90, y: 65, width: 100, height: 30 }, strings.t('NO'), family, close);
    this.addChild(overlay);
    audio.play('SOUNDS.USER_CONFIRM_DELETE');
  }
}
