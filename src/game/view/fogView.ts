import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { Runway } from '../sim/simulation';

// Fog over a runway (draw 0x3a5a0) and the anti-fog machine that clears it (draw 0x19c40).
// See docs/re-notes.md.

export const FOG_SURFACES = ['FOG', 'ANTI_FOG.BASE', 'ANTI_FOG.NOSE', 'ANTI_FOG.PROPELLER'];

/** Where the five puffs sit along the runway, from its centre. */
const PUFFS = [-128, -64, 0, 64, 128];

/** How far puff `index` leans, in radians, after `age` seconds. */
export const puffLean = (index: number, age: number): number => 0.1 * Math.sin(0.75 * age + ((index * 7) % 11));

/** Where the machine is from the runway's centre after working `time` seconds: it sweeps along it. */
export const machineOffset = (time: number): { x: number; y: number } => ({ x: 170 - 35 * time, y: -30 });

export class FogView extends Container {
  private readonly puffs: Sprite[];
  private readonly machine = new Container();
  private readonly propeller: Sprite;
  private machineFade = 0;

  constructor(
    textures: TextureStore,
    private readonly runway: Runway,
  ) {
    super();
    this.position.copyFrom(runway.position);
    // Sorted among the planes just in front of the runway's line, so it covers one standing there.
    this.zIndex = runway.position.y + 4;
    this.puffs = PUFFS.map((x) => {
      const puff = textures.sprite('FOG');
      // Each puff leans about a point 30 px below its centre.
      puff.pivot.set(0, 30);
      puff.position.set(x, -20 + 30);
      this.addChild(puff);
      return puff;
    });
    this.propeller = textures.sprite('ANTI_FOG.PROPELLER');
    this.propeller.scale.set(0.8, 1);
    this.machine.addChild(textures.sprite('ANTI_FOG.BASE'), this.propeller, textures.sprite('ANTI_FOG.NOSE'));
    this.addChild(this.machine);
    this.visible = false;
  }

  update(dt: number): void {
    const fog = this.runway.fog;
    this.visible = fog !== null;
    if (!fog) {
      this.machineFade = 0;
      return;
    }
    this.puffs.forEach((puff, index) => {
      puff.alpha = Math.max(0, Math.min(1, fog.fade));
      puff.skew.x = puffLean(index, fog.age);
    });
    // The machine comes in and, once the fog lifts, goes again (0x19b90).
    const working = fog.machine !== null && !fog.lifting;
    this.machineFade = working ? Math.min(1, this.machineFade + 2 * dt) : Math.max(0, this.machineFade - 2 * dt);
    this.machine.visible = fog.machine !== null && this.machineFade > 0;
    if (fog.machine === null) return;
    const at = machineOffset(fog.machine);
    this.machine.position.set(at.x, at.y);
    this.machine.alpha = Math.min(1, 2 * this.machineFade);
    // Three turns a second.
    this.propeller.angle = -360 * 3 * fog.machine;
  }
}
