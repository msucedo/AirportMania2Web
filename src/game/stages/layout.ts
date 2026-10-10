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
    layers: BackdropLayer[];
    /** Glints on the distant sea, drawn right after the layer with this index. */
    sparkles?: { afterLayer: number; area: SparkleArea };
  };
  /** The balloon corner the stage script gives its runways (see `BalloonCorner`). */
  runwayBalloonCorner: 0 | 1 | 2 | 3;
  /** Water stage: planes leave rings and each runway is marked by two lines of buoys. */
  water: boolean;
  decorations: { resource: string; position: Point }[];
  /**
   * Extra sprites drawn with every gate, relative to it. One with a `depth` is sorted among the
   * planes as if it stood that far below the gate, so it covers a plane docked there.
   */
  gateDecorations: { resource: string; offset: Point; depth?: number }[];
  gates: GateSlot[];
  gasStation: { position: Point; minLevel: number };
  /** Repair hangar, when the stage has one. */
  hangar: { position: Point; type: number; minLevel: number } | null;
  /** Luggage conveyor, when the stage has one. */
  luggage?: { position: Point; type: number; minLevel: number } | null;
  taxiNodes: Point[];
  runways: RunwaySlot[];
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
  DEICER: 0x6e,
  ANTI_FOG: 0x6f,
  PAINTING_STOP_SPOT: 0x72,
  IN_FLIGHT_MOVIES: 0x73,
  COFFEE_AND_CAKE: 0x74,
  WASH_AND_GO: 0x77,
  PLANE_4_LICENCE: 0xcb,
  PLANE_5_LICENCE: 0xcc,
  PLANE_6_LICENCE: 0xcd,
  PLANE_7_LICENCE: 0xce,
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
