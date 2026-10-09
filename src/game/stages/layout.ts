import type { Point } from '../../data/xml';

// What a compiled stage script sets up: where each place goes, which improvements gate it and
// how the backdrop is built. Coordinates are screen pixels at 480×320.

export interface GateSlot {
  letter: 'A' | 'B' | 'C';
  position: Point;
  /** Improvement that must be owned for the gate to exist; null when it always exists. */
  requires: number[] | null;
  /** Improvement that switches the gate to its upgraded descriptor. */
  upgradedBy: number;
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
  /** Improvement that has to be owned first. */
  requires?: number;
}

export interface BackdropLayer {
  resource: string;
  position: Point;
  scale?: Point;
  /**
   * Draw an 8-bit grey image as a silhouette in this colour. `groundTop` borrows the colour of
   * the top row of another surface.
   */
  silhouette?: number | { topRowOf: string };
}

export interface StageLayout {
  stage: number;
  /** Gate descriptor types: [normal, upgraded]. */
  gateTypes: [number, number];
  runwayType: number;
  gasStationType: number;
  backdrop: {
    /** Height given to the original `Sky` object: its gradient and clouds fit in it. */
    sky: number;
    /** Screen y down to which the sky's bottom colour is kept painted, behind the backdrop layers. */
    horizon: number;
    layers: BackdropLayer[];
  };
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
  taxiNodes: Point[];
  runways: RunwaySlot[];
  stopSpots: { position: Point; requires: number | null; upgradedBy?: number; replacedBy?: number }[];
  /** Sprites of a stop spot, bottom to top, for the plain and the VIP version. */
  stopSpotSurfaces: { normal: string[]; vip: string[] };
  /** Planes land on water here and show their pontoons (`PlanesUsePantoons` in the levels db). */
  pontoons: boolean;
  improvements: ImprovementOffer[];
  /** Improvement that switches levels to their extra-plane variant. */
  extraPlaneLicence: number;
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
  UPGRADED_GATE_A: 0x1e,
  UPGRADED_GATE_B: 0x1f,
  UPGRADED_GATE_C: 0x20,
  PAINTING_STOP_SPOT: 0x72,
  COFFEE_AND_CAKE: 0x74,
  PLANE_4_LICENCE: 0xcb,
  PLANE_5_LICENCE: 0xcc,
} as const;

const offer = (id: number, price: number, title: string, description: string, icon: string, requires?: number): ImprovementOffer => ({
  id,
  price,
  titleId: `IMPROVEMENTS.TITLES.${title}`,
  descriptionId: `IMPROVEMENTS.DESCRIPTIONS.${description}`,
  icon: `IMPROVEMENTS.${icon}`,
  ...(requires === undefined ? {} : { requires }),
});
export { offer };
