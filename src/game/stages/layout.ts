import type { SparkleArea } from '../view/waterEffects';
import type { Point } from '../../data/xml';

// What a compiled stage script sets up: where each place goes, which improvements gate it and
// how the backdrop is built. Coordinates are screen pixels at 480×320.

export interface GateSlot {
  letter: 'A' | 'B' | 'C' | 'D';
  position: Point;
  /** Improvement that must be owned for the gate to exist; null when it always exists. */
  requires: number[] | null;
  /** Improvement that switches the gate to its upgraded descriptor. */
  upgradedBy: number;
  /** Improvement that switches it to the stage's third gate descriptor, where there is one. */
  upgradedAgainBy?: number;
  /** Where the upgraded gate goes, when the stage script puts it somewhere else. */
  upgradedPosition?: Point;
}

export interface RunwaySlot {
  number: number;
  /** Centre of the runway. */
  position: Point;
  /** Node where planes stop after landing and line up to take off (centre ± 144). */
  node: Point;
  /** Heading of a plane standing on the node, in degrees; 0 faces left, 180 right. */
  heading: number;
}

/** Something the player can buy for the stage between levels. */
export interface ImprovementOffer {
  id: number;
  price: number;
  titleId: string;
  descriptionId: string;
  /** Icon resource prefix; `.ACTIVE` and `.GRAYED` variants exist. */
  icon: string;
  /**
   * Level from which the shop marks it as worth trying, when it can be paid for and has not
   * been bought in an earlier level of the stage (0x4cbaa). Absent for those never marked.
   */
  tryFrom?: number;
  /**
   * The stage script only puts it on sale while all of `needs` are owned and none of `hiddenBy`
   * is: what builds on another improvement needs it, and the one built on is withdrawn meanwhile,
   * so it cannot be sold from under the other (tools/re/stage_layout.py --offers).
   */
  needs?: readonly number[];
  hiddenBy?: readonly number[];
}

export interface BackdropLayer {
  resource: string;
  position: Point;
  scale?: Point;
}

/**
 * A piece of animated scenery, with the arguments the stage script gives its builder:
 * - `sea`: the glints on a distant sea (0x13c3c);
 * - `flag`: an image that sways where it stands (0x1503c);
 * - `horizon`: an image passing along the horizon, `start` seconds into a loop of `loop` seconds
 *   at `speed` px a second (0x14c3c and its like);
 * - `star`: a star `size` px across that throbs (0x13b8c);
 * - `aurora`: the Antarctic's aurora (0x13808);
 * - `moving`: an image that crosses for the first `span` seconds of every `loop` (0x14b5c);
 * - `cloudBand`: a band of cloud sliding left, one image width every `period` seconds, cut off
 *   at `left` (0x14858);
 * - `propeller`: a spinning propeller squeezed by `scale` (0x14928);
 * - `scaryCloud`: a cloud that drifts at `speed` and swells (0x14aa8);
 * - `fogPatch`: a patch of fog that slides for `span` seconds of every `loop`, `start` seconds
 *   in at first (0x149d4);
 * - `bat`: a bat that swoops for `span` seconds of every `loop` (0x14f6c).
 */
export type SceneryItem =
  | { scenery: 'sea'; area: SparkleArea }
  | { scenery: 'flag'; resource: string; position: Point }
  | { scenery: 'horizon'; resource: string; y: number; loop: number; speed: number; start: number }
  | { scenery: 'star'; position: Point; size: number }
  | { scenery: 'aurora'; resource: string }
  | { scenery: 'moving'; resource: string; x: number; y: number; loop: number; span: number; speed: number; offset: number }
  | { scenery: 'cloudBand'; resource: string; period: number; y: number; left: number; right: number }
  | { scenery: 'propeller'; resource: string; position: Point; scale: Point }
  | { scenery: 'scaryCloud'; resource: string; position: Point; speed: number }
  | { scenery: 'fogPatch'; resource: string; position: Point; flipped: boolean; loop: number; span: number; speed: number; start: number }
  | { scenery: 'bat'; position: Point; loop: number; span: number; start: number; phase: number };

/** What a stage script puts behind the airport, in the order it makes it: images and scenery. */
export type BackdropEntry = BackdropLayer | SceneryItem;

export const isScenery = (entry: BackdropEntry): entry is SceneryItem => 'scenery' in entry;

/**
 * A bonus event a level has: balloons to pop or a helicopter to tap, each releasing coins worth
 * `amount`. The stage script decides the level, the amount and, with the level's own random
 * generator, the second it starts and the side the helicopter comes from, so they are the same
 * every time (tools/re/stage_layout.py).
 */
export type BonusEvent =
  | { kind: 'balloons'; delay: number; amount: number }
  | { kind: 'helicopter'; delay: number; amount: number; speed: number; fromLeft: boolean };

export interface StageLayout {
  stage: number;
  /** Colour of a gate nobody has used yet: each stage script overwrites entry 0 of the colour table. */
  neutralColor: number;
  /** Gate descriptor types: normal, upgraded and, in later stages, upgraded again. */
  gateTypes: [number, number] | [number, number, number];
  runwayType: number;
  gasStationType: number;
  backdrop: {
    /**
     * Height given to the original `Sky` object: its gradient and clouds fit in it. Null for a
     * stage that paints its own sky as one of the layers.
     */
    sky: number | null;
    /** Screen y down to which the sky's bottom colour is kept painted, behind the backdrop layers. */
    horizon: number;
    /**
     * In the order the script makes them. The airport's own objects (runways, places, planes) are
     * drawn after all of these, whenever the script made them: it hands them over, sorted by
     * depth, when it ends (0x12fce).
     */
    layers: BackdropEntry[];
  };
  /** The balloon corner the stage script gives its runways (see `BalloonCorner`). */
  runwayBalloonCorner: 0 | 1 | 2 | 3;
  /**
   * The corner the script gives its stop spots, painting stop spot and wash and go (the last
   * argument of 0x144e4 and 0x145a8, the fourth of 0x14678): 0 when left out.
   */
  stopSpotBalloonCorner?: 0 | 1;
  /** The corner the script gives its gates, gas station, hangar and luggage conveyor: 1 when left out. */
  placeBalloonCorner?: 0 | 1;
  /** Water stage: planes leave rings and each runway is marked by two lines of buoys. */
  water: boolean;
  /** Images the stage adds with a depth (0x1404c). Without one here it is drawn over everything; with one, sorted among the planes at that height. */
  decorations: { resource: string; position: Point; depth?: number }[];
  /**
   * Extra sprites drawn with every gate, relative to it. One with a `depth` is sorted among the
   * planes as if it stood that far below the gate, so it covers a plane docked there.
   */
  gateDecorations: { resource: string; offset: Point; depth?: number }[];
  gates: GateSlot[];
  gasStation: { position: Point; minLevel: number; improved?: { improvement: number; type: number } };
  /** Repair hangar, when the stage has one. */
  hangar: { position: Point; type: number; minLevel: number; improved?: { improvement: number; type: number } } | null;
  /** Luggage conveyor, when the stage has one. */
  luggage?: { position: Point; type: number; minLevel: number; improved?: { improvement: number; type: number } } | null;
  /**
   * The stage's fog is space gas (`airport+0x7c`, the first argument of 0x12f90): it is drawn
   * green and it is the anti space gas, not the anti-fog, that clears it.
   */
  spaceGas?: boolean;
  taxiNodes: Point[];
  /**
   * Pairs of terminal nodes the stage links by hand (0x14808). No plane can pass through them, so
   * all they do is keep the automatic links from crossing the line between them.
   */
  taxiBarriers?: [Point, Point][];
  runways: RunwaySlot[];
  /** An improvement that gives runway 1 another descriptor (the VIP runway). */
  vipRunway?: { improvement: number; type: number };
  /** The runways the stage builds instead once an improvement that adds one is owned. */
  runwaysWith?: { improvement: number; runways: RunwaySlot[] };
  /**
   * Stop spots. One is replaced by the painting stop spot when `replacedBy` is owned, or by the
   * wash and go, built at `position`, when `washedBy.improvement` is.
   */
  stopSpots: { position: Point; requires: number | null; upgradedBy?: number; replacedBy?: number; washedBy?: { improvement: number; position: Point } }[];
  /** Sprites of a stop spot, bottom to top, for the plain and the VIP version. */
  stopSpotSurfaces: { normal: string[]; vip: string[] };
  /** Planes land on water here and show their pontoons (`PlanesUsePantoons` in the levels db). */
  pontoons: boolean;
  improvements: ImprovementOffer[];
  /** Improvement that switches levels to their extra-plane variant. */
  extraPlaneLicence: number;
  /** Bonus events, by level number. */
  bonuses?: Readonly<Record<number, BonusEvent>>;
}

const RUNWAY_NODE_OFFSET = 144;

/**
 * A runway as its constructor (0x6cf14) sets it up. With `flag` 1 the node is at the left end and
 * planes stand there facing left; with 0 it is at the right end and they face right.
 */
export function runway(number: number, x: number, y: number, flag: 0 | 1): RunwaySlot {
  return {
    number,
    position: { x, y },
    node: { x: flag === 1 ? x - RUNWAY_NODE_OFFSET : x + RUNWAY_NODE_OFFSET, y },
    heading: flag === 1 ? 0 : 180,
  };
}

/** Improvement ids shared by the stage scripts. */
export const IMPROVEMENT = {
  EXTRA_STOP_SPOT: 0x01,
  EXTRA_STOP_SPOT_2: 0x02,
  UPGRADED_STOP_SPOT: 0x0a,
  EXTRA_GATE_C: 0x16,
  EXTRA_GATE_D: 0x17,
  UPGRADED_GATE_A: 0x1e,
  UPGRADED_GATE_B: 0x1f,
  UPGRADED_GATE_C: 0x20,
  UPGRADED_GATE_D: 0x21,
  MORE_UPGRADED_GATE_A: 0x28,
  MORE_UPGRADED_GATE_B: 0x29,
  MORE_UPGRADED_GATE_C: 0x2a,
  MORE_UPGRADED_GATE_D: 0x2b,
  EXTRA_RUNWAY_3: 0x34,
  EXTRA_RUNWAY_4: 0x35,
  VIP_RUNWAY: 0x3c,
  IMPROVED_HANGAR: 0x50,
  IMPROVED_GAS_STATION: 0x5a,
  IMPROVED_LUGGAGE: 0x64,
  DEICER: 0x6e,
  ANTI_FOG: 0x6f,
  ANTI_SAND: 0x70,
  ANTI_SPACE_GAS: 0x71,
  PAINTING_STOP_SPOT: 0x72,
  IN_FLIGHT_MOVIES: 0x73,
  COFFEE_AND_CAKE: 0x74,
  WASH_AND_GO: 0x77,
  PLANE_4_LICENCE: 0xcb,
  PLANE_5_LICENCE: 0xcc,
  PLANE_6_LICENCE: 0xcd,
  PLANE_7_LICENCE: 0xce,
  PLANE_8_LICENCE: 0xcf,
  PLANE_9_LICENCE: 0xd0,
  PLANE_14_LICENCE: 0xd5,
  PLANE_15_LICENCE: 0xd6,
  PLANE_19_LICENCE: 0xda,
  PLANE_20_LICENCE: 0xdb,
} as const;

const offer = (
  id: number,
  price: number,
  title: string,
  description: string,
  icon: string,
  rules: { tryFrom?: number; needs?: readonly number[]; hiddenBy?: readonly number[] } = {},
): ImprovementOffer => ({
  id,
  price,
  titleId: `IMPROVEMENTS.TITLES.${title}`,
  descriptionId: `IMPROVEMENTS.DESCRIPTIONS.${description}`,
  icon: `IMPROVEMENTS.${icon}`,
  ...rules,
});

/** Whether an improvement is on sale, given what the level already owns. */
export function onSale(offer: ImprovementOffer, owned: ReadonlySet<number>): boolean {
  return (offer.needs ?? []).every((id) => owned.has(id)) && !(offer.hiddenBy ?? []).some((id) => owned.has(id));
}
export { offer };
