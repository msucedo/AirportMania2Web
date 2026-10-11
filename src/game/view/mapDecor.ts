import { Container, Matrix, MeshSimple, type Sprite } from 'pixi.js';
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
  'MAP.CARRIER_WAVES',
  'AMBIENT.WAVE_REFLECT',
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

/** The carrier's wake is 32 rows of four points: two bands that open out behind it. */
const WAKE_ROWS = 32;

/** Row `row` of the wake (0x62c36): its four x and its y, before the wake is skewed and turned. */
export function wakeRow(row: number): { x: [number, number, number, number]; y: number; alpha: number } {
  const t = row / (WAKE_ROWS - 1);
  const spread = Math.sin(2.19911 * t);
  return { x: [-65 * spread, -10 * spread, 10 * spread, 55 * spread], y: 45 * (3.2 * Math.pow(t, 1.3) - 1.1), alpha: 0.8 * Math.min(1, 5 * (1 - t)) };
}

/** How far down its image a row is taken from `time` seconds on (0x63036): two thirds of the image over the rows, sliding a third every five seconds. */
export const wakeV = (time: number, row: number): number => (1 - fraction(0.2 * time)) / 3 + (row * 2) / 93;

/**
 * The carrier's waves (class 0x62a24, draw 0x63024): `MAP.CARRIER_WAVES` over those two bands,
 * the image running along them. The original fades the last rows point by point; here each
 * strip between two rows has one opacity, the mean of theirs.
 */
export class MapCarrierWaves implements Decoration {
  readonly view = new Container();
  private readonly strips: MeshSimple[] = [];
  private time = 0;

  constructor(textures: TextureStore, at: { x: number; y: number }) {
    // 0x630b0: skewed by −0.5, turned 35° and moved, as the emulator gives it.
    this.view.setFromMatrix(new Matrix(0.819152, 0.573576, -0.983153, 0.532364, at.x, at.y));
    const texture = textures.texture('MAP.CARRIER_WAVES');
    for (let row = 0; row < WAKE_ROWS - 1; row++) {
      const [near, far] = [wakeRow(row), wakeRow(row + 1)];
      const vertices = new Float32Array([...near.x.flatMap((x) => [x, near.y]), ...far.x.flatMap((x) => [x, far.y])]);
      // Points 0 and 1 with 4 and 5 are one band, 2 and 3 with 6 and 7 the other.
      const strip = new MeshSimple({ texture, vertices, uvs: new Float32Array(16), indices: new Uint32Array([0, 1, 4, 1, 4, 5, 2, 3, 7, 2, 7, 6]) });
      strip.alpha = (near.alpha + far.alpha) / 2;
      this.strips.push(strip);
      this.view.addChild(strip);
    }
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    this.strips.forEach((strip, row) => {
      const [near, far] = [wakeV(this.time, row), wakeV(this.time, row + 1)];
      strip.geometry.uvs = new Float32Array([1, near, 0, near, 0, near, 1, near, 1, far, 0, far, 0, far, 1, far]);
    });
  }
}

/**
 * The sea's glints on the map (0x60d84 → class 0x5ee18), as its constructor leaves them: it picks
 * them with a generator of its own that always starts the same, so they are the same every
 * time. Each is x, y, phase and size; a patch's glints are all turned alike.
 */
export const MAP_GLINTS: readonly { turn: number; glints: readonly (readonly [number, number, number, number])[] }[] = [
  {
    turn: 0,
    glints: [
      [824.385, 374.043, 0.845902, 0.214937],
      [719.073, 403.531, 0.166993, 0.216321],
      [706.558, 373.075, 0.402404, 0.198179],
      [818.995, 385.245, 0.945747, 0.212365],
      [772.403, 373.892, 0.217559, 0.188989],
      [725.922, 427.436, 0.635239, 0.186279],
      [780.743, 379.766, 0.126696, 0.208777],
      [702.691, 379.228, 0.188907, 0.204519],
    ],
  },
  {
    turn: 0,
    glints: [
      [113.562, 34.8046, 0.845903, 0.232848],
      [25.0753, 88.4203, 0.166994, 0.234221],
      [14.8126, 32.8195, 0.402405, 0.214567],
      [123.921, 53.0553, 0.961379, 0.231204],
      [53.7257, 34.7633, 0.213629, 0.20512],
      [27.1182, 132.126, 0.650873, 0.200022],
      [115.692, 75.3276, 0.00121497, 0.217923],
      [26.3149, 58.802, 0.328454, 0.205372],
      [118.098, 111.308, 0.637766, 0.218326],
      [61.8666, 128.006, 0.818001, 0.217256],
      [111.099, 36.4087, 0.890084, 0.224962],
      [72.1522, 77.0335, 0.0129934, 0.196256],
      [122.109, 100.335, 0.685437, 0.207438],
      [64.0347, 48.8109, 0.530904, 0.25555],
      [47.4853, 129.632, 0.0410831, 0.245532],
      [91.9384, 100.345, 0.42735, 0.212416],
      [36.1038, 84.9816, 0.141877, 0.227302],
    ],
  },
  {
    turn: 40,
    glints: [
      [1492.57, 389.469, 0.845903, 0.232848],
      [1290.79, 420.745, 0.166994, 0.234157],
      [1267.67, 388.382, 0.402404, 0.21463],
      [1499.22, 399.503, 0.953562, 0.230759],
      [1336.72, 389.651, 0.21168, 0.204929],
      [1299.67, 446.17, 0.643064, 0.200905],
      [1486.99, 404.392, 0.0639629, 0.213797],
      [1309.9, 416.543, 0.900655, 0.197249],
      [1378.72, 428.949, 0.0891185, 0.226128],
      [1479.53, 447.324, 0.777043, 0.216183],
      [1400.72, 407.97, 0.764914, 0.22128],
      [1456.49, 396.268, 0.0937654, 0.215493],
      [1493.1, 418.146, 0.460799, 0.220883],
      [1453.02, 431.506, 0.570932, 0.215427],
      [1366.67, 431.763, 0.659413, 0.227151],
      [1391.05, 392.359, 0.456066, 0.237312],
    ],
  },
];

/** A glint `time` seconds on (0x5f0bc): on a two second beat, seen while this is over 0; its size is this times its own and its opacity 0.7 of this. */
export const glintShow = (time: number, phase: number): number => Math.sin(2 * Math.PI * (fraction(0.5 * time) + phase)) - 0.3;

export class MapGlints implements Decoration {
  readonly view = new Container();
  private readonly sprites: Sprite[];
  private time = 0;

  constructor(textures: TextureStore, private readonly patch: (typeof MAP_GLINTS)[number]) {
    this.sprites = patch.glints.map(([x, y]) => {
      const sprite = textures.sprite('AMBIENT.WAVE_REFLECT');
      sprite.position.set(x, y);
      sprite.angle = patch.turn;
      return sprite;
    });
    if (this.sprites.length > 0) this.view.addChild(...this.sprites);
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    this.sprites.forEach((sprite, i) => {
      const [, , phase, size] = this.patch.glints[i]!;
      const show = glintShow(this.time, phase);
      sprite.visible = show > 0;
      sprite.scale.set(show * size);
      sprite.alpha = 0.7 * show;
    });
  }
}
