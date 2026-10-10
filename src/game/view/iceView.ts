import { Container, type Sprite, TilingSprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';
import type { Runway } from '../sim/simulation';

// Ice on a runway (draw 0x4b9d4) and the deicer that melts it (update 0x2ad80, draw 0x2ae50).
// See docs/re-notes.md.

export const ICE_SURFACES = ['RUNWAY.FROZEN', 'DEICER', 'AIR'];

/**
 * The deicer `time` seconds after it came, `fade` (0 to 1) of the way in: where it is from the
 * runway, its tilt in degrees, its stretch (it wobbles as it comes and goes), its opacity, and
 * how far along its picture the strip of air under it has run.
 */
export function deicerPose(time: number, fade: number): { x: number; y: number; angle: number; scaleX: number; scaleY: number; alpha: number; air: number } {
  const wobble = (1 - fade) * fade;
  return {
    x: 80 + 90 * Math.cos(0.5 * time),
    y: -15,
    angle: 20 * Math.sin(5 * time) - 13,
    scaleX: 1 + Math.sin(2 * Math.PI * fade) * wobble,
    scaleY: 1 + Math.sin(3 * Math.PI * fade) * wobble,
    alpha: Math.min(1, 2 * fade),
    // The air runs 40 px a second through a window that starts between 10 and 30 px along.
    air: 10 + ((((40 * time - 10) % 20) + 20) % 20),
  };
}

export class IceView extends Container {
  private readonly sheet: Sprite;
  private readonly deicer = new Container();
  private readonly air: TilingSprite;
  private deicerFade = 0;

  constructor(
    textures: TextureStore,
    private readonly runway: Runway,
    /** The deicer is an object of its own, sorted among the planes at the runway's height. */
    layer: Container,
  ) {
    super();
    this.position.copyFrom(runway.position);
    // The frozen sheet lies over the strip, with the fade as its opacity.
    this.sheet = textures.sprite('RUNWAY.FROZEN');
    this.addChild(this.sheet);
    this.visible = false;

    // Under the machine, a 40 by 30 window of the air's picture at half size, from (−42, −8).
    this.air = new TilingSprite({ texture: textures.texture('AIR'), width: 40, height: 30 });
    this.air.scale.set(0.5);
    this.air.position.set(-42, -8);
    this.deicer.addChild(textures.sprite('DEICER'), this.air);
    this.deicer.zIndex = runway.position.y;
    this.deicer.visible = false;
    layer.addChild(this.deicer);
  }

  update(dt: number): void {
    const ice = this.runway.ice;
    this.visible = ice !== null;
    if (!ice || ice.machine === null) {
      this.deicerFade = 0;
      this.deicer.visible = false;
      if (ice) this.sheet.alpha = Math.max(0, Math.min(1, ice.fade));
      return;
    }
    this.sheet.alpha = Math.max(0, Math.min(1, ice.fade));
    // It comes in half a second, and goes in as long once the ice is melting.
    this.deicerFade = ice.lifting ? Math.max(0, this.deicerFade - 2 * dt) : Math.min(1, this.deicerFade + 2 * dt);
    this.deicer.visible = this.deicerFade > 0;
    const pose = deicerPose(ice.machine, this.deicerFade);
    this.deicer.position.set(this.runway.position.x + pose.x, this.runway.position.y + pose.y);
    this.deicer.angle = pose.angle;
    this.deicer.scale.set(pose.scaleX, pose.scaleY);
    this.deicer.alpha = pose.alpha;
    this.air.tilePosition.x = -pose.air;
  }
}
