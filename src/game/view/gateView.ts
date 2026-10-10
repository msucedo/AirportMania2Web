import { Container, Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { Gate } from '../sim/simulation';

const ARROW_FRAMES = 4;

/** Surface ids a gate needs. */
export function gateSurfaceIds(gate: Gate, index: number): string[] {
  const { surfaces, arrows } = gate.descriptor;
  const ids = [
    surfaces.color,
    surfaces.front,
    surfaces.letterPattern.replace('%d', String(index)),
    'INDICATORS.UNLOADING_ICON',
    'INDICATORS.UNLOADING_BAR',
    'INDICATORS.LOADING_ICON',
    'INDICATORS.LOADING_BAR',
    'INDICATORS.X2',
    'INDICATORS.X3',
    'INDICATORS.X4',
  ];
  const set = arrows[0];
  if (set) {
    for (let i = 0; i < ARROW_FRAMES; i++) ids.push(`${set.loading}.${i}`, `${set.unloading}.${i}`);
  }
  return ids;
}

/** Segments in a full service bar for a plane with this loading time (0x43aca). */
export function serviceBarSegments(loadingTime: number, elapsed: number): number {
  const remaining = (loadingTime - elapsed) / loadingTime;
  return remaining * ((loadingTime - 8) * 0.5 + 8) * 0.5;
}

/** Opacity of arrow frame `frame` (0 to 3) after `elapsed` seconds of service (0x43a00). */
export function arrowOpacity(frame: number, elapsed: number): number {
  return Math.max(0, Math.sin(Math.PI * (1 + 2 * elapsed + frame * 0.25)));
}

/**
 * A gate with its letter and, while it serves a plane, the indicator the original draws
 * (0x439b0): the four arrow frames fading in turn, the service icon, and above it a column of
 * bar segments for the time still to go, the top one fading out. The colour multiplier shows
 * for as long as the gate holds a combo.
 */
export class GateView extends Container {
  private readonly color: Sprite;
  private readonly icon: Sprite;
  private readonly segments: Sprite[] = [];
  private readonly arrows: Sprite[] = [];
  private readonly bonus: Sprite;

  constructor(
    private readonly textures: TextureStore,
    private readonly gate: Gate,
    index: number,
  ) {
    super();
    const d = gate.descriptor;
    this.position.copyFrom(gate.position);
    this.color = textures.sprite(d.surfaces.color);
    this.addChild(this.color, textures.sprite(d.surfaces.front), textures.sprite(d.surfaces.letterPattern.replace('%d', String(index))));

    // Frame 3 is drawn first.
    for (let frame = ARROW_FRAMES - 1; frame >= 0; frame--) {
      const arrow = textures.sprite(`${d.arrows[0]!.unloading}.${frame}`);
      arrow.position.copyFrom(d.arrowsPosition);
      this.arrows[frame] = arrow;
      this.addChild(arrow);
    }
    this.icon = textures.sprite('INDICATORS.UNLOADING_ICON');
    this.icon.position.copyFrom(d.iconBar);
    this.addChild(this.icon);
    this.bonus = textures.sprite('INDICATORS.X2');
    this.bonus.position.copyFrom(d.bonus);
    this.addChild(this.bonus);
  }

  /** The bar segment `index` places above the icon, created on demand. */
  private segment(index: number): Sprite {
    let sprite = this.segments[index];
    if (!sprite) {
      sprite = this.textures.sprite('INDICATORS.UNLOADING_BAR');
      const { x, y } = this.gate.descriptor.iconBar;
      sprite.position.set(x, y - 12 - 7 * index);
      this.segments[index] = sprite;
      this.addChildAt(sprite, this.getChildIndex(this.bonus));
    }
    return sprite;
  }

  update(_dt: number, tint: number): void {
    const { gate } = this;
    this.color.tint = tint;
    const service = gate.service === 'unloading' || gate.service === 'loading' ? gate.service : null;
    const plane = gate.plane;
    const shown = service !== null && plane !== null;
    this.icon.visible = shown;
    for (const arrow of this.arrows) arrow.visible = shown;
    for (const segment of this.segments) segment.visible = false;
    this.bonus.visible = gate.combo >= 2;
    if (gate.combo >= 2) this.bonus.texture = this.textures.texture(`INDICATORS.X${Math.min(gate.combo, 4)}`);
    if (!service || !plane) return;

    const kind = service === 'unloading' ? 'UNLOADING' : 'LOADING';
    this.icon.texture = this.textures.texture(`INDICATORS.${kind}_ICON`);
    const set = gate.descriptor.arrows[0]!;
    this.arrows.forEach((arrow, frame) => {
      arrow.texture = this.textures.texture(`${service === 'unloading' ? set.unloading : set.loading}.${frame}`);
      arrow.alpha = arrowOpacity(frame, gate.progress);
    });
    const bar = this.textures.texture(`INDICATORS.${kind}_BAR`);
    const count = serviceBarSegments(plane.descriptor.times.loading, gate.progress);
    const whole = Math.trunc(count);
    for (let i = 0; i < whole; i++) {
      const segment = this.segment(i);
      segment.texture = bar;
      segment.alpha = 1;
      segment.visible = true;
    }
    if (count > 0) {
      const top = this.segment(whole);
      top.texture = bar;
      top.alpha = count - whole;
      top.visible = true;
    }
  }
}
