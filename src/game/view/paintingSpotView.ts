import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { PlaneColor } from '../../data/levels';
import { paletteColor } from '../palette';
import type { Plane, StopSpot } from '../sim/simulation';

// What a painting stop spot draws besides the stop spot itself: the sign with its charge gauge
// (0x68584), the colour chooser (0x68854) and the spray can that repaints the plane (0x77b78).
// See docs/re-notes.md.

export const PAINTING_SURFACES = [
  'PAINTING_STOPSPOT.RIGHT',
  'PAINTING_STOPSPOT.RIGHT_OFF',
  'PAINTING_STOPSPOT.RIGHT_OFF_ISLAND',
  'PAINTING_STOPSPOT.CHARGING',
  'PAINTING_STOPSPOT.COLOR',
  'PAINTING_STOPSPOT.COLOR_SHADING',
  'PAINTING_STOPSPOT.READY',
  'SPRAY_TOP',
  'SPRAY_COLOR',
  'SPRAY_RAY',
];

/** Moves a 0..1 value towards 1 or 0 at `rate` per second (0xa068 and its siblings). */
const fade = (value: number, on: boolean, rate: number, dt: number): number => (on ? Math.min(1, value + rate * dt) : Math.max(0, value - rate * dt));

/** The sign beside the spot: lit while it can paint, with a gauge that fills as it charges. */
export class PaintingSign extends Container {
  private readonly lit: Sprite;
  private readonly gauge: Sprite;
  private readonly gaugeTexture: Texture;
  private glow = 0;
  private time = 0;

  constructor(
    textures: TextureStore,
    private readonly spot: StopSpot,
    island: boolean,
  ) {
    super();
    this.position.copyFrom(spot.position);
    // Sorted among the planes as if it stood 15 px above the spot (0x690e0).
    this.zIndex = spot.position.y - 15;
    const off = textures.sprite(island ? 'PAINTING_STOPSPOT.RIGHT_OFF_ISLAND' : 'PAINTING_STOPSPOT.RIGHT_OFF');
    this.lit = textures.sprite('PAINTING_STOPSPOT.RIGHT');
    off.position.set(7, -33);
    this.lit.position.set(7, -33);
    this.gaugeTexture = textures.sprite('PAINTING_STOPSPOT.CHARGING').texture;
    this.gauge = new Sprite(this.gaugeTexture);
    this.addChild(off, this.lit, this.gauge);
  }

  update(dt: number): void {
    const booth = this.spot.painting!;
    this.time += dt;
    this.glow = fade(this.glow, booth.ready, 3, dt);
    this.lit.alpha = this.glow;
    // The gauge shows the part of the image below the charge still missing.
    const { frame } = this.gaugeTexture;
    const top = Math.trunc(frame.height * (booth.left / booth.recharge));
    this.gauge.visible = top < frame.height;
    if (this.gauge.visible) {
      this.gauge.texture = new Texture({ source: this.gaugeTexture.source, frame: new Rectangle(frame.x, frame.y + top, frame.width, frame.height - top) });
      this.gauge.position.set(50, -52 + top);
    }
    // Lit, it pulses between 60% and full brightness.
    const level = this.glow === 0 ? 1 : 0.8 + 0.2 * Math.sin(this.time * 5);
    const channel = Math.round(255 * Math.min(1, level));
    this.gauge.tint = (channel << 16) | (channel << 8) | channel;
  }
}

/** Row of the open chooser the finger is on: rows stack upwards from the chooser (0x68cf0). */
export function chooserRow(count: number, dy: number): number {
  return Math.floor((-dy * count) / (30 + 30 * count));
}

/**
 * The colour chooser that appears beside a plane parked on a charged painting spot. Closed, it
 * is a spinning ring of the colours on offer; held down, it opens into a column of colours and
 * the one under the finger on release is used.
 */
export class PaintChooser extends Container {
  private readonly ring = new Container();
  private readonly column = new Container();
  private readonly rows: { box: Container; fill: Sprite }[] = [];
  private held = false;
  private opening = false;
  private open = 0;
  private shown = 0;
  private wanted = 0;
  private marked = 0;
  private time = 0;
  /** Set once it has been dismissed: it fades out and is then removed. */
  closing = false;

  constructor(
    textures: TextureStore,
    readonly spot: StopSpot,
    readonly colors: readonly PlaneColor[],
    private readonly onPick: (color: PlaneColor) => void,
  ) {
    super();
    // 0x67f66: 55 px right of the spot and 20 px above it.
    this.position.set(spot.position.x + 55, spot.position.y - 20);
    this.zIndex = 20000;

    // Closed: discs 10 px off the centre, evenly spread; one or two colours are repeated to
    // make three or four discs. The first disc is drawn in halves, under and over the rest, so
    // the ring overlaps all the way round.
    const count = colors.length;
    const discs = count === 1 ? 3 : count === 2 ? 4 : count;
    const base = textures.sprite('PAINTING_STOPSPOT.READY').texture;
    const half = (right: boolean): Texture => {
      const { frame } = base;
      const middle = Math.trunc(frame.width / 2);
      return new Texture({ source: base.source, frame: right ? new Rectangle(frame.x + middle, frame.y, frame.width - middle, frame.height) : new Rectangle(frame.x, frame.y, middle, frame.height) });
    };
    const disc = (texture: Texture, color: PlaneColor, turn: number, anchorX: number): Container => {
      const arm = new Container();
      const sprite = new Sprite(texture);
      sprite.anchor.set(anchorX, 0.5);
      sprite.position.set(0, 10);
      sprite.tint = paletteColor(color).main;
      arm.addChild(sprite);
      arm.rotation = turn * Math.PI * 2;
      return arm;
    };
    this.ring.addChild(disc(half(false), colors[0]!, 0, 1));
    let next = count === 1 ? 0 : 1;
    for (let k = 1; k < discs; k++) {
      this.ring.addChild(disc(base, colors[next]!, k / discs, 0.5));
      next = next + 1 >= count ? 0 : next + 1;
    }
    this.ring.addChild(disc(half(true), colors[0]!, 0, 0));

    for (const color of colors) {
      const box = new Container();
      const fill = textures.sprite('PAINTING_STOPSPOT.COLOR');
      fill.tint = paletteColor(color).main;
      box.addChild(fill, textures.sprite('PAINTING_STOPSPOT.COLOR_SHADING'));
      this.rows.push({ box, fill });
      this.column.addChild(box);
    }
    this.addChild(this.column, this.ring);
    this.update(0);
  }

  /** The area that takes touches: a small square when closed, the whole column when open (0x68c40). */
  private area(): { x1: number; y1: number; x2: number; y2: number } {
    const { x, y } = this.position;
    if (!this.opening) return { x1: x - 30, y1: y - 30, x2: x + 30, y2: y + 40 };
    return { x1: x - 90, y1: y - (30 + 30 * this.colors.length), x2: x + 90, y2: y + 40 };
  }

  contains(x: number, y: number): boolean {
    if (this.closing) return false;
    const area = this.area();
    return x >= area.x1 && x <= area.x2 && y >= area.y1 && y <= area.y2;
  }

  press(y: number): void {
    this.held = true;
    this.move(y);
  }

  move(y: number): void {
    if (this.held && this.opening) this.wanted = chooserRow(this.colors.length, y - this.position.y);
  }

  /** Letting go picks the colour under the finger, if there is one (0x68e28). */
  release(y: number): void {
    if (!this.held) return;
    this.move(y);
    this.held = false;
    const color = this.opening ? this.colors[this.wanted] : undefined;
    if (color !== undefined) this.onPick(color);
  }

  /** Returns false once it has faded out and can be removed. */
  update(dt: number): boolean {
    this.time += dt;
    this.shown = fade(this.shown, !this.closing, 5, dt);
    if (this.closing) this.opening = false;
    // It opens while held and closes when let go, each once the last change has finished.
    else if (this.open > 0.9 && !this.held) this.opening = false;
    else if (this.open < 0.1 && this.held) this.opening = true;
    this.open = fade(this.open, this.opening, 5, dt);

    // The mark slides towards the row under the finger, faster the further it has to go.
    const gap = this.wanted - this.marked;
    if (gap !== 0) {
      const step = (Math.floor(Math.abs(gap)) + 1) * 6 * dt;
      this.marked = Math.abs(gap) <= step ? this.wanted : this.marked + Math.sign(gap) * step;
    }

    const closed = (1 - this.open) * this.shown;
    this.ring.visible = this.open < 1;
    this.ring.alpha = closed;
    this.ring.scale.set(0.5 + 0.5 * closed);
    // Two turns a second.
    this.ring.rotation = ((this.time * 2) % 1) * Math.PI * 2;

    const opened = this.open * this.shown;
    this.column.visible = this.open > 0;
    this.column.alpha = opened;
    this.column.scale.set(0.5 + 0.5 * opened);
    this.rows.forEach((row, i) => {
      const distance = this.marked - i;
      // The marked row is full size and the others half, pushed 10 px away from it.
      row.box.scale.set((2 - Math.min(1, Math.abs(distance))) * 0.5);
      row.box.position.set(0, -30 * (i + 1) + Math.max(-1, Math.min(1, distance)) * 10);
    });
    return !this.closing || this.shown > 0;
  }
}

/** The spray can that hovers beside the plane while it is repainted. */
export class SprayCan extends Container {
  private readonly can = new Container();
  private readonly ray: Sprite;
  private time = 0;
  private shown = 0;

  constructor(
    textures: TextureStore,
    private readonly plane: Plane,
    color: PlaneColor,
    private readonly island: boolean,
    private readonly duration: number,
  ) {
    super();
    const tint = paletteColor(color).main;
    const fill = textures.sprite('SPRAY_COLOR');
    fill.tint = tint;
    this.ray = textures.sprite('SPRAY_RAY');
    this.ray.tint = tint;
    this.ray.position.set(-6, -17);
    this.can.addChild(fill, textures.sprite('SPRAY_TOP'), this.ray);
    this.addChild(this.can);
    // The whole can is mirrored after being placed, so it ends up on the plane's left.
    this.scale.x = -1;
    this.update(0);
  }

  /** Returns false when the can has gone. */
  update(dt: number): boolean {
    this.time += dt;
    const t = this.time;
    // It fades in over half a second and out again over the last half second (0x77a80).
    this.shown = fade(this.shown, t <= this.duration - 0.5, 2, dt);
    const a = this.shown;
    this.position.set(this.plane.x - (this.island ? 15 : 0), this.plane.y);
    this.zIndex = this.plane.y + 4 * Math.cos(t) - 8;
    this.alpha = Math.min(1, 2 * a);

    const { can } = this;
    can.angle = 20 * Math.sin(t * 5) - 13;
    // A wobble while it appears and goes.
    can.scale.set(1 + Math.sin(2 * a * Math.PI) * (1 - a) * a, 1 + Math.sin(3 * a * Math.PI) * (1 - a) * a);
    can.position.set(4 * Math.sin(t) + 45, 15 * Math.cos(t) - 20);
    this.ray.scale.set(1 + 0.2 * Math.sin(t * 7), 1 + 0.2 * Math.cos(t * 9));
    this.ray.alpha = Math.max(0, Math.min(1, 1 + Math.sin(t * 127.94)));
    return t < this.duration || a > 0;
  }
}
