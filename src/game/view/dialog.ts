import { MAIN_FONT } from './floatingText';
import { fontFamily } from '../../engine/fonts';
import { BORDER, MAIN_FILL } from './faces';
import { Container, Matrix, NineSliceSprite, Rectangle, Text } from 'pixi.js';
import type { AudioPlayer } from '../../engine/audio';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../engine/screen';
import type { TextureStore } from '../../engine/textures';

export const DIALOG_SURFACES = ['GUI.BLACK_COVER', 'GUI.DIALOGS.SEPARATOR', 'GUI.DIALOGS.BACK.BOX', 'GUI.DIALOGS.BUTTON', 'GUI.DIALOGS.BUTTON_OVER'];

/**
 * A dialog over a dimmed screen, drawn with the original frame. Returns the whole overlay and the
 * panel to fill, whose origin is the frame's corner.
 */
/**
 * How a dialog stands while it opens, its clock running from 0 to 1 at 3 a second (0x2b7da, read
 * off runs of it): it grows a little past its width and back, unfolds from flat, and leans to
 * the right less and less. Closing (0x2b980) it does the same backwards leaning the other way.
 */
export function dialogOpening(clock: number): { a: number; c: number; d: number; alpha: number } {
  const c = Math.max(0, Math.min(1, clock));
  const swell = 0.75 + 1.25 * c - c * c;
  const grow = 0.75 + 0.25 * c;
  return { a: swell * grow, c: 0.75 * (1 - c) * grow, d: c * swell * grow, alpha: c };
}

/** Plays the sound a dialog opens with; the page sets it once it has its sound. */
export const dialogSound: { play(id: string): void } = { play: () => {} };

export function dialogFrame(textures: TextureStore, width: number, height: number): { overlay: Container; panel: Container; blocker: Container } {
  const overlay = new Container();
  // 0x2b77e: opening a dialog switches on the app's cover (0x23140), `GUI.BLACK_COVER` stretched
  // over the screen, which comes in at 5 a second (0xa068); closing it switches it off again.
  const shade = textures.sprite('GUI.BLACK_COVER');
  shade.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
  shade.alpha = 0;
  let cover = 0;
  // 0x2b73c: and it plays its sound.
  dialogSound.play('SOUNDS.DIALOG_ROLL');
  // Keeps touches from reaching what is underneath. It is a node of its own with an explicit
  // area, like the buttons: drawn shapes do not take presses reliably here.
  const blocker = new Container();
  blocker.hitArea = new Rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  blocker.eventMode = 'static';
  blocker.on('pointerdown', (event) => event.stopPropagation());
  // 0x2b7da: a dialog opens about the screen's centre over a third of a second.
  const stand = new Container();
  const panel = new Container();
  panel.position.set(-width / 2, -height / 2);
  stand.addChild(panel);
  let clock = 0;
  let last = performance.now();
  let closing = false;
  const show = (): void => {
    const pose = dialogOpening(clock);
    // 0x2b9f8: it leans the other way as it closes.
    stand.setFromMatrix(new Matrix(pose.a, 0, closing ? -pose.c : pose.c, pose.d, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2));
    stand.alpha = pose.alpha;
  };
  show();
  /** What the dialog hangs from at the top, to stay on it while it closes. */
  let root: Container | null = null;
  const opening = (): void => {
    for (let node: Container | null = overlay.parent; node; node = node.parent) root = node;
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock = Math.min(1, clock + 3 * dt);
    cover = Math.min(1, cover + 5 * dt);
    shade.alpha = cover;
    if (clock >= 1 && cover >= 1) overlay.onRender = null;
    show();
  };
  overlay.onRender = opening;
  // 0x2b980: taken away, it first closes over a third of a second, the way it opened backwards.
  // Whoever made it has already let go of it, so it stays on the screen by itself meanwhile.
  const destroy = overlay.destroy.bind(overlay);
  overlay.destroy = (options) => {
    if (closing || !root || root.destroyed) {
      overlay.onRender = null;
      destroy(options);
      return;
    }
    closing = true;
    overlay.eventMode = 'none';
    overlay.interactiveChildren = false;
    root.addChild(overlay);
    last = performance.now();
    overlay.onRender = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock -= 3 * dt;
      cover = Math.max(0, cover - 5 * dt);
      shade.alpha = cover;
      if (clock <= 0) {
        overlay.onRender = null;
        setTimeout(() => destroy(options));
        return;
      }
      show();
    };
  };
  // 0x2c55e: the frame's picture goes 21 px beyond the dialog's size on every side, its 20 px
  // ends kept and its middle stretched (0xe4704 with 20 and 42 of its 62).
  const frame = new NineSliceSprite({ texture: textures.texture('GUI.DIALOGS.BACK.BOX'), leftWidth: 20, rightWidth: 20, topHeight: 20, bottomHeight: 20 });
  frame.setSize(width + 42, height + 42);
  frame.position.set(-21, -21);
  panel.addChild(frame);
  overlay.addChild(shade, blocker, stand);
  return { overlay, panel, blocker };
}

export function dialogText(panel: Container, value: string, x: number, y: number, size: number, family: string, anchorX = 0): Text {
  const node = new Text({ text: value, style: { fontFamily: family, fontSize: size, fill: 0xffffff, stroke: BORDER } });
  node.anchor.set(anchorX, 0.5);
  node.position.set(x, y);
  panel.addChild(node);
  return node;
}

/** A button of the original dialogs, centred on (x, y). */
export function dialogButton(
  textures: TextureStore,
  audio: AudioPlayer,
  panel: Container,
  at: { x: number; y: number; width: number; height?: number },
  label: string,
  family: string,
  onPress: () => void,
  /** Sound to play on a press; null when the action plays its own. */
  sound: string | null = 'SOUNDS.CLICK',
): void {
  const { x, y, width } = at;
  // 0x2ccea: the button's picture, 46 px square, is drawn at its own height with its two halves
  // as ends and stretched between them to the width and 28 px more, centred on the button.
  const across = width + 28;
  const face = new NineSliceSprite({ texture: textures.texture('GUI.DIALOGS.BUTTON'), leftWidth: 23, rightWidth: 23, topHeight: 0, bottomHeight: 0 });
  face.setSize(across, 46);
  face.position.set(x - across / 2, y - 23);
  // The touch area is its own node: the stretched sprite does not take presses reliably.
  const zone = new Container();
  zone.hitArea = new Rectangle(x - across / 2, y - 23, across, 46);
  zone.eventMode = 'static';
  zone.cursor = 'pointer';
  zone.on('pointerover', () => (face.texture = textures.texture('GUI.DIALOGS.BUTTON_OVER')));
  zone.on('pointerout', () => (face.texture = textures.texture('GUI.DIALOGS.BUTTON')));
  zone.on('pointerdown', (event) => {
    event.stopPropagation();
    if (sound) audio.play(sound);
    onPress();
  });
  // 0x2cda0: the label is in `FONTS.MAIN`, whatever the caller's face.
  void family;
  const text = new Text({ text: label, style: { fontFamily: fontFamily(MAIN_FONT), fontSize: 14, fill: MAIN_FILL, stroke: BORDER } });
  text.anchor.set(0.5);
  text.position.set(x, y);
  if (text.width > width - 16) text.scale.set((width - 16) / text.width);
  panel.addChild(face, text, zone);
}

/**
 * A rule across a dialog (0x2c26c) or down it (0x2c3c0): `GUI.DIALOGS.SEPARATOR` drawn out to
 * `length`, centred on (x, y), turned a quarter for the upright one. Its ends are kept as they
 * are and its middle stretched (0xe4a28); how much of the picture is an end is taken as 6 px.
 */
export function dialogRule(textures: TextureStore, parent: Container, x: number, y: number, length: number, upright = false): void {
  const texture = textures.texture('GUI.DIALOGS.SEPARATOR');
  const rule = new NineSliceSprite({ texture, leftWidth: 6, rightWidth: 6, topHeight: 0, bottomHeight: 0 });
  rule.setSize(length, texture.height);
  rule.pivot.set(length / 2, texture.height / 2);
  rule.position.set(x, y);
  if (upright) rule.angle = 90;
  rule.eventMode = 'none';
  parent.addChild(rule);
}
