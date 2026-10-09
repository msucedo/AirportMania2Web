import { Container, Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { Gate } from '../sim/simulation';

const ARROW_FRAMES = 4;
const ARROW_FRAME_TIME = 0.12;

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

/**
 * A gate with its letter, service icon and bar, moving arrows and colour multiplier.
 * The sprites and the descriptor positions are the original ones; how the bar is filled and the
 * arrow timing are assumptions (gate draw 0x436e4 not read).
 */
export class GateView extends Container {
  private readonly color: Sprite;
  private readonly icon: Sprite;
  private readonly bar: Sprite;
  private readonly arrows: Sprite;
  private readonly bonus: Sprite;
  private clock = 0;

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

    this.arrows = textures.sprite(`${d.arrows[0]!.unloading}.0`);
    this.arrows.position.copyFrom(d.arrowsPosition);
    this.icon = textures.sprite('INDICATORS.UNLOADING_ICON');
    this.icon.position.copyFrom(d.iconBar);
    this.bar = textures.sprite('INDICATORS.UNLOADING_BAR');
    this.bar.anchor.set(0, 0.5);
    this.bar.position.set(d.iconBar.x - 10, d.iconBar.y + 17);
    this.bonus = textures.sprite('INDICATORS.X2');
    this.bonus.position.copyFrom(d.bonus);
    this.addChild(this.arrows, this.icon, this.bar, this.bonus);
  }

  update(dt: number, tint: number): void {
    const { gate } = this;
    this.color.tint = tint;
    const service = gate.service === 'unloading' || gate.service === 'loading' ? gate.service : null;
    const plane = gate.plane;
    this.icon.visible = this.bar.visible = this.arrows.visible = service !== null && plane !== null;
    this.bonus.visible = service !== null && gate.combo >= 2;
    if (!service || !plane) return;

    this.clock += dt;
    const kind = service === 'unloading' ? 'UNLOADING' : 'LOADING';
    this.icon.texture = this.textures.texture(`INDICATORS.${kind}_ICON`);
    this.bar.texture = this.textures.texture(`INDICATORS.${kind}_BAR`);
    this.bar.width = 20 * Math.min(1, gate.progress / plane.descriptor.times.loading);
    const set = gate.descriptor.arrows[0]!;
    const frame = Math.floor(this.clock / ARROW_FRAME_TIME) % ARROW_FRAMES;
    this.arrows.texture = this.textures.texture(`${service === 'unloading' ? set.unloading : set.loading}.${frame}`);
    if (gate.combo >= 2) this.bonus.texture = this.textures.texture(`INDICATORS.X${Math.min(gate.combo, 4)}`);
  }
}
