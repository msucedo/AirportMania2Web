import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { Runway } from '../sim/simulation';

// Ice on a runway (draw 0x4b9d4) and the deicer that melts it. See docs/re-notes.md.

export const ICE_SURFACES = ['RUNWAY.FROZEN', 'DEICER'];

export class IceView extends Container {
  private readonly sheet: Sprite;
  private readonly deicer: Sprite;
  private deicerFade = 0;

  constructor(
    textures: TextureStore,
    private readonly runway: Runway,
  ) {
    super();
    this.position.copyFrom(runway.position);
    // The frozen sheet lies over the strip, with the fade as its opacity.
    this.sheet = textures.sprite('RUNWAY.FROZEN');
    this.deicer = textures.sprite('DEICER');
    this.addChild(this.sheet, this.deicer);
    this.visible = false;
  }

  update(dt: number): void {
    const ice = this.runway.ice;
    this.visible = ice !== null;
    if (!ice) {
      this.deicerFade = 0;
      return;
    }
    this.sheet.alpha = Math.max(0, Math.min(1, ice.fade));
    // The deicer's own draw (0x2ae50) has only been read in part: it is shown over the runway,
    // rocking, while it works.
    const working = ice.machine !== null && !ice.lifting;
    this.deicerFade = working ? Math.min(1, this.deicerFade + 2 * dt) : Math.max(0, this.deicerFade - 2 * dt);
    this.deicer.visible = ice.machine !== null && this.deicerFade > 0;
    if (ice.machine === null) return;
    this.deicer.alpha = Math.min(1, 2 * this.deicerFade);
    this.deicer.position.set(15 * Math.cos(0.5 * ice.machine), -15);
    this.deicer.angle = 10 * Math.sin(5 * ice.machine);
  }
}
