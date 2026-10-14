import { Container, Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { GasStation } from '../sim/simulation';

export function gasStationSurfaceIds(station: GasStation): string[] {
  return [station.descriptor.surfaces.back, station.descriptor.surfaces.spot, 'INDICATORS.FUELING_MARK', 'INDICATORS.FUELING_MARK_TICK'];
}

/** How visible the gauge is `fraction` of the way through a fill-up: it fades at both ends (0x40fa4). */
export function gaugeOpacity(fraction: number): number {
  return Math.max(0, Math.min(1, 20 * Math.min(fraction, 1 - fraction)));
}

/** The needle's angle in degrees: it sweeps from −80 to 80 over most of the fill-up (0x40fd2). */
export function needleAngle(fraction: number): number {
  return -80 + 160 * Math.max(0, Math.min(1, (fraction * 12 - 1) / 10));
}

/**
 * A gas station as its draw routine (0x40ed4) shows it: the mark on the ground where the plane
 * stands, the pump, and while a plane fills up a gauge 80 px above that mark.
 */
export class GasStationView extends Container {
  /** What swells under the pointer. */
  readonly body = new Container();
  private readonly mark: Sprite;
  private readonly needle: Sprite;

  constructor(
    textures: TextureStore,
    private readonly station: GasStation,
  ) {
    super();
    this.position.copyFrom(station.position);
    const node = { x: station.node.x - station.position.x, y: station.node.y - station.position.y };
    const spot = textures.sprite(station.descriptor.surfaces.spot);
    spot.position.copyFrom(node);
    // 0x40f36: the pump, and the remark over it, take the station's scale; the mark on the
    // ground (0x40f2a) and the gauge (0x41028) do not.
    this.body.addChild(textures.sprite(station.descriptor.surfaces.back));
    this.addChild(spot, this.body);

    this.mark = textures.sprite('INDICATORS.FUELING_MARK');
    // 0x41028: the needle turns about its hot spot, the foot of the needle.
    this.needle = textures.pinned('INDICATORS.FUELING_MARK_TICK');
    for (const part of [this.mark, this.needle]) {
      part.position.set(node.x, node.y - 80);
      this.addChild(part);
    }
  }

  update(): void {
    const { station } = this;
    const plane = station.plane;
    const shown = station.use === 'fueling' && plane !== null;
    this.mark.visible = this.needle.visible = shown;
    if (!shown) return;
    const fraction = station.progress / plane.descriptor.times.fueling;
    const opacity = gaugeOpacity(fraction);
    this.mark.alpha = this.needle.alpha = opacity;
    this.mark.scale.set(0.5 + 0.5 * opacity);
    this.needle.scale.set(0.7 + 0.3 * opacity);
    this.needle.angle = needleAngle(fraction);
  }
}
