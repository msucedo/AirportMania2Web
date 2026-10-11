import { Container, Matrix, Graphics, NineSliceSprite, Rectangle, Text } from 'pixi.js';
import type { AudioPlayer } from '../../engine/audio';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../engine/screen';
import type { TextureStore } from '../../engine/textures';

export const DIALOG_SURFACES = ['GUI.DIALOGS.BACK.BOX', 'GUI.DIALOGS.BUTTON', 'GUI.DIALOGS.BUTTON_OVER'];

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

export function dialogFrame(textures: TextureStore, width: number, height: number): { overlay: Container; panel: Container; blocker: Container } {
  const overlay = new Container();
  const shade = new Graphics().rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill({ color: 0x000000, alpha: 0.6 });
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
  const show = (): void => {
    const pose = dialogOpening(clock);
    stand.setFromMatrix(new Matrix(pose.a, 0, pose.c, pose.d, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2));
    stand.alpha = pose.alpha;
  };
  show();
  overlay.onRender = () => {
    const now = performance.now();
    clock += 3 * Math.min(0.1, (now - last) / 1000);
    last = now;
    if (clock >= 1) {
      clock = 1;
      overlay.onRender = null;
    }
    show();
  };
  const frame = new NineSliceSprite({ texture: textures.texture('GUI.DIALOGS.BACK.BOX'), leftWidth: 24, rightWidth: 24, topHeight: 24, bottomHeight: 24 });
  frame.setSize(width, height);
  // The frame's own filling is translucent; a solid backing keeps the texts readable.
  panel.addChild(new Graphics().roundRect(4, 4, width - 8, height - 8, 20).fill({ color: 0x3b1d4d, alpha: 0.92 }), frame);
  overlay.addChild(shade, blocker, stand);
  return { overlay, panel, blocker };
}

export function dialogText(panel: Container, value: string, x: number, y: number, size: number, family: string, anchorX = 0): Text {
  const node = new Text({ text: value, style: { fontFamily: family, fontSize: size, fill: 0xffffff, stroke: { color: 0x2a1030, width: 3 } } });
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
  const { x, y, width, height = 40 } = at;
  const face = new NineSliceSprite({ texture: textures.texture('GUI.DIALOGS.BUTTON'), leftWidth: 18, rightWidth: 18, topHeight: 18, bottomHeight: 18 });
  face.setSize(width, height);
  face.position.set(x - width / 2, y - height / 2);
  // The touch area is its own node: the stretched sprite does not take presses reliably.
  const zone = new Container();
  zone.hitArea = new Rectangle(x - width / 2, y - height / 2, width, height);
  zone.eventMode = 'static';
  zone.cursor = 'pointer';
  zone.on('pointerover', () => (face.texture = textures.texture('GUI.DIALOGS.BUTTON_OVER')));
  zone.on('pointerout', () => (face.texture = textures.texture('GUI.DIALOGS.BUTTON')));
  zone.on('pointerdown', (event) => {
    event.stopPropagation();
    if (sound) audio.play(sound);
    onPress();
  });
  const text = new Text({ text: label, style: { fontFamily: family, fontSize: 14, fill: 0xffffff } });
  text.anchor.set(0.5);
  text.position.set(x, y);
  if (text.width > width - 16) text.scale.set((width - 16) / text.width);
  panel.addChild(face, text, zone);
}
