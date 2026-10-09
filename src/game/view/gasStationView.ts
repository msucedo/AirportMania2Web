import { Container, Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { GasStation } from '../sim/simulation';

export function gasStationSurfaceIds(station: GasStation): string[] {
  return [station.descriptor.surfaces.back, 'INDICATORS.FUELING_MARK', 'INDICATORS.FUELING_MARK_TICK'];
}

/**
 * A gas station with the fuel gauge shown while a plane fills up. Sprites are the original ones;
 * the gauge placement and needle sweep are assumptions (resources loaded by 0x40680).
 */
export class GasStationView extends Container {
  private readonly gauge = new Container();
  private readonly needle: Sprite;

  constructor(
    textures: TextureStore,
    private readonly station: GasStation,
  ) {
    super();
    this.position.copyFrom(station.position);
    this.addChild(textures.sprite(station.descriptor.surfaces.back));

    this.needle = textures.sprite('INDICATORS.FUELING_MARK_TICK');
    this.needle.anchor.set(0.5, 1);
    this.needle.position.set(0, 12);
    this.gauge.addChild(textures.sprite('INDICATORS.FUELING_MARK'), this.needle);
    this.gauge.position.set(0, -46);
    this.addChild(this.gauge);
  }

  update(): void {
    const { station } = this;
    const plane = station.plane;
    this.gauge.visible = station.use === 'fueling' && plane !== null;
    if (!plane) return;
    const fraction = Math.min(1, station.progress / plane.descriptor.times.fueling);
    this.needle.rotation = (-0.5 + fraction) * Math.PI * 0.8;
  }
}
