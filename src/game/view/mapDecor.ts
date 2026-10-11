import { Container, type Sprite } from 'pixi.js';
import type { TextureStore } from '../../engine/textures';

// What moves on the world map (script 0xccc8c): clouds, birds and the satellite. The aurora,
// the snow and the stars are the levels' classes. See docs/re-notes.md.

export const BIRD_FRAMES = 11;
export const MAP_DECOR_SURFACES = [
  'MAP.ISLAND_FRONT',
  'MAP.CLOUDS.SMALL',
  'MAP.CLOUDS.MEDIUM',
  'MAP.CLOUDS.BIG',
  'MAP.SATELLITE',
  'MAP.SATELLITE_BRIGHT',
  'MAP.AIRBORNE_PROPELLER',
  'SNOW_FLAKES.3',
  'SNOW_FLAKES.4',
  'AMBIENT.STAR',
  'STAGES.ANTARCTIC.AURORA_BOREALIS',
  ...Array.from({ length: BIRD_FRAMES }, (_, frame) => `BIRD.${frame}`),
];

export interface Decoration {
  readonly view: Container;
  update(dt: number): void;
}

const fraction = (value: number): number => value - Math.floor(value);

/** How far a cloud hangs under its place (0x634dc): it bobs by `swing` px every ten seconds, `phase` of a turn on. */
export const cloudBob = (time: number, phase: number, swing: number): number => swing * Math.sin(2 * Math.PI * (fraction(0.1 * time) + phase));

export class MapCloud implements Decoration {
  readonly view: Sprite;
  private time = 0;

  constructor(textures: TextureStore, resource: string, private readonly at: { x: number; y: number }, private readonly phase: number, private readonly swing: number) {
    this.view = textures.sprite(resource);
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    this.view.position.set(this.at.x, this.at.y + cloudBob(this.time, this.phase, this.swing));
  }
}

/**
 * A bird's place from where it was put and its frame, by its clock and phase (0x5e34c): round
 * an oval 50 px wide and 30 tall, shaken by three faster waves, through eleven frames.
 */
export function birdPose(clock: number, phase: number): { x: number; y: number; frame: number } {
  const round = 0.06 * Math.PI * clock + phase;
  const shake = Math.cos(2 * Math.PI * clock + phase) + Math.cos(11 * Math.PI * clock + 0.13) + Math.cos(20 * Math.PI * clock + 0.15);
  return { x: 50 * Math.sin(round), y: shake + 30 * Math.cos(round), frame: Math.trunc(9 * clock) % BIRD_FRAMES };
}

/** A bird (class 0x5e168): its clock runs at 10 to 14 a second from anywhere up to 2000 and starts again at 22000. */
export class MapBird implements Decoration {
  readonly view = new Container();
  private readonly frames: Sprite[];
  private readonly rate = 10 + 4 * Math.random();
  private readonly phase = Math.random();
  private clock = 2000 * Math.random();

  constructor(textures: TextureStore, private readonly at: { x: number; y: number }) {
    this.frames = Array.from({ length: BIRD_FRAMES }, (_, frame) => textures.sprite(`BIRD.${frame}`));
    this.view.addChild(...this.frames);
    this.update(0);
  }

  update(dt: number): void {
    this.clock = (this.clock + this.rate * dt) % 22000;
    const pose = birdPose(this.clock, this.phase);
    this.view.position.set(this.at.x + pose.x, this.at.y + pose.y);
    this.frames.forEach((sprite, frame) => (sprite.visible = frame === pose.frame));
  }
}

/** The satellite's clock (0x5ec24): 0.02 a second, round every 4, seen while under 0.75; it starts at 2. */
export const SATELLITE = { rate: 0.02, round: 4, seen: 0.75, start: 2 } as const;

/**
 * The satellite at its clock (0x5ec60), or nothing while it is out of sight: it swings round
 * its place, 380 px to the left and 350 below at the ends, turning and swelling to full size
 * half way, and its bright image flashes over it.
 */
export function satellitePose(clock: number): { x: number; y: number; angle: number; scale: number; bright: number } | null {
  if (clock >= SATELLITE.seen) return null;
  return {
    x: -380 * Math.sin(Math.PI * clock),
    y: 350 * Math.cos(Math.PI * clock),
    angle: 15 * clock - 15,
    scale: 0.5 + 0.5 * Math.sin((Math.PI * clock) / SATELLITE.seen),
    bright: Math.max(0, Math.min(1, 2 * Math.sin(250 * clock) - 1)),
  };
}

export class MapSatellite implements Decoration {
  readonly view = new Container();
  private readonly bright: Sprite;
  private clock: number = SATELLITE.start;

  constructor(textures: TextureStore, private readonly at: { x: number; y: number }) {
    this.bright = textures.sprite('MAP.SATELLITE_BRIGHT');
    this.view.addChild(textures.sprite('MAP.SATELLITE'), this.bright);
    this.update(0);
  }

  update(dt: number): void {
    this.clock += SATELLITE.rate * dt;
    if (this.clock > SATELLITE.round) this.clock -= SATELLITE.round;
    const pose = satellitePose(this.clock);
    this.view.visible = pose !== null;
    if (!pose) return;
    this.view.position.set(this.at.x + pose.x, this.at.y + pose.y);
    this.view.angle = pose.angle;
    this.view.scale.set(pose.scale);
    this.bright.alpha = pose.bright;
  }
}

/** The stars on the map (0x60cc4): where and how many px across. */
export const MAP_STARS: readonly [number, number, number][] = [
  [1202, 30, 8], [1336, 93, 7], [1399, 30, 10], [1485, 38, 9], [1415, 135, 14], [1448, 229, 8], [1605, 356, 12],
  [1678, 379, 8], [1932, 30, 18], [1844, 74, 7], [1980, 115, 10], [1902, 208, 13], [1875, 147, 13],
];

/** The four propellers of stage 5's icon (0x5d886): turn they start at, squeeze, tilt and place from the icon. */
export const ICON_PROPELLERS: readonly { turn: number; scaleX: number; scaleY: number; tilt: number; x: number; y: number }[] = [
  { turn: 0, scaleX: 0.5, scaleY: 0.9, tilt: 38, x: -30, y: 30 },
  { turn: 135, scaleX: 0.53, scaleY: 0.95, tilt: 34, x: -2, y: 25 },
  { turn: 90, scaleX: 0.5, scaleY: 0.9, tilt: 28, x: 49, y: -1 },
  { turn: 45, scaleX: 0.4, scaleY: 0.8, tilt: 16, x: 61, y: -17 },
];

/** Stage 5's icon `time` seconds on (0x5d7ac): it hangs up to 5 px off its place, round every ten seconds, and its propellers make forty turns in that time. */
export function airborneIconPose(time: number): { drop: number; spin: number } {
  const round = fraction(0.1 * time);
  return { drop: 5 * Math.sin(2 * Math.PI * round), spin: 14400 * round };
}

/** Puts the propellers on stage 5's icon and keeps it moving; `icon` must already be at its place. */
export class MapAirborneIcon implements Decoration {
  readonly view: Container;
  private readonly blades: Sprite[] = [];
  private readonly y: number;
  private time = 0;

  constructor(textures: TextureStore, icon: Container) {
    this.view = icon;
    this.y = icon.y;
    for (const propeller of ICON_PROPELLERS) {
      // The blades turn, then are squeezed and tilted, then put in place.
      const mount = new Container();
      mount.position.set(propeller.x, propeller.y);
      mount.angle = propeller.tilt;
      mount.scale.set(propeller.scaleX, propeller.scaleY);
      const blades = textures.sprite('MAP.AIRBORNE_PROPELLER');
      mount.addChild(blades);
      icon.addChild(mount);
      this.blades.push(blades);
    }
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    const pose = airborneIconPose(this.time);
    this.view.y = this.y + pose.drop;
    this.blades.forEach((blades, i) => (blades.angle = pose.spin + ICON_PROPELLERS[i]!.turn));
  }
}
