import type { Point } from '../../data/xml';

// Stage 1 layout, read from the original stage builder (see docs/re-notes.md).
// Coordinates are screen pixels at 480×320.

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
  /** Node offset from the centre and plane heading there, as computed by the runway constructor. */
  node: Point;
  /** Degrees; 0 faces left, 180 right. */
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

export interface StageLayout {
  /** Gate descriptor types: [normal, upgraded]. */
  gateTypes: [number, number];
  runwayType: number;
  gasStationType: number;
  backgroundDown: { resource: string; position: Point; scale: Point };
  backgroundTop: { resource: string; position: Point };
  decorations: { resource: string; position: Point }[];
  gates: GateSlot[];
  gasStation: { position: Point; minLevel: number };
  taxiNodes: Point[];
  runways: RunwaySlot[];
  stopSpots: { position: Point; requires: number | null; upgradedBy?: number; replacedBy?: number }[];
  improvements: ImprovementOffer[];
  /** Improvement that switches levels to their extra-plane variant. */
  extraPlaneLicence: number;
}

const RUNWAY_NODE_OFFSET = 144;
const runway = (number: number, x: number, y: number): RunwaySlot => ({
  number,
  position: { x, y },
  node: { x: x - RUNWAY_NODE_OFFSET, y },
  heading: 0,
});

export const IMPROVEMENT = {
  EXTRA_STOP_SPOT: 0x01,
  UPGRADED_STOP_SPOT: 0x0a,
  EXTRA_GATE_C: 0x16,
  UPGRADED_GATE_A: 0x1e,
  UPGRADED_GATE_B: 0x1f,
  UPGRADED_GATE_C: 0x20,
  PAINTING_STOP_SPOT: 0x72,
  PLANE_4_LICENCE: 0xcb,
} as const;

export const ARCHES: StageLayout = {
  gateTypes: [0, 1],
  runwayType: 1,
  gasStationType: 1,
  backgroundDown: { resource: 'STAGES.ARCHES.BACKGROUND_DOWN', position: { x: 0, y: 160 }, scale: { x: 16, y: 16 } },
  backgroundTop: { resource: 'STAGES.ARCHES.BACKGROUND_TOP', position: { x: 0, y: 34 } },
  decorations: [{ resource: 'STAGES.ARCHES.ARCH', position: { x: 403, y: 50 } }],
  gates: [
    { letter: 'A', position: { x: 40, y: 122 }, requires: null, upgradedBy: IMPROVEMENT.UPGRADED_GATE_A },
    { letter: 'B', position: { x: 120, y: 122 }, requires: null, upgradedBy: IMPROVEMENT.UPGRADED_GATE_B },
    {
      letter: 'C',
      position: { x: 200, y: 122 },
      requires: [IMPROVEMENT.EXTRA_GATE_C, IMPROVEMENT.UPGRADED_GATE_C],
      upgradedBy: IMPROVEMENT.UPGRADED_GATE_C,
    },
  ],
  gasStation: { position: { x: 280, y: 120 }, minLevel: 3 },
  taxiNodes: [80, 110, 140, 170, 200].map((x) => ({ x, y: 220 })),
  runways: [runway(1, 450, 225), runway(2, 495, 270)],
  stopSpots: [
    { position: { x: 180, y: 300 }, requires: null, upgradedBy: IMPROVEMENT.UPGRADED_STOP_SPOT },
    { position: { x: 60, y: 300 }, requires: IMPROVEMENT.EXTRA_STOP_SPOT, replacedBy: IMPROVEMENT.PAINTING_STOP_SPOT },
  ],
  // Ids and prices are the ones the stage script registers (0x13458). The painting stop spot
  // (0x72, 60000) is left out until that place is implemented. Which title goes with 0x20 and the
  // prerequisites are inferred.
  improvements: [
    { id: IMPROVEMENT.EXTRA_STOP_SPOT, price: 10000, titleId: 'IMPROVEMENTS.TITLES.EXTRA_STORAGE_PLACE', descriptionId: 'IMPROVEMENTS.DESCRIPTIONS.EXTRA_STORAGE_PLACE', icon: 'IMPROVEMENTS.STORAGE_PLACE' },
    { id: IMPROVEMENT.UPGRADED_STOP_SPOT, price: 20000, titleId: 'IMPROVEMENTS.TITLES.VIP_STORAGE_PLACE', descriptionId: 'IMPROVEMENTS.DESCRIPTIONS.VIP_STORAGE_PLACE', icon: 'IMPROVEMENTS.VIP_STORAGE_PLACE' },
    { id: IMPROVEMENT.EXTRA_GATE_C, price: 20000, titleId: 'IMPROVEMENTS.TITLES.EXTRA_GATE_C', descriptionId: 'IMPROVEMENTS.DESCRIPTIONS.EXTRA_GATE', icon: 'IMPROVEMENTS.GATE_0' },
    { id: IMPROVEMENT.UPGRADED_GATE_A, price: 25000, titleId: 'IMPROVEMENTS.TITLES.IMPROVED_GATE_A', descriptionId: 'IMPROVEMENTS.DESCRIPTIONS.IMPROVED_GATE', icon: 'IMPROVEMENTS.GATE_1' },
    { id: IMPROVEMENT.UPGRADED_GATE_B, price: 30000, titleId: 'IMPROVEMENTS.TITLES.IMPROVED_GATE_B', descriptionId: 'IMPROVEMENTS.DESCRIPTIONS.IMPROVED_GATE', icon: 'IMPROVEMENTS.GATE_1' },
    { id: IMPROVEMENT.UPGRADED_GATE_C, price: 35000, titleId: 'IMPROVEMENTS.TITLES.IMPROVED_GATE_C', descriptionId: 'IMPROVEMENTS.DESCRIPTIONS.IMPROVED_GATE', icon: 'IMPROVEMENTS.GATE_1', requires: IMPROVEMENT.EXTRA_GATE_C },
    { id: IMPROVEMENT.PLANE_4_LICENCE, price: 85000, titleId: 'IMPROVEMENTS.TITLES.PLANE_4_LICENCE', descriptionId: 'IMPROVEMENTS.DESCRIPTIONS.PLANE_4_LICENCE', icon: 'IMPROVEMENTS.PLANE_4' },
  ],
  extraPlaneLicence: IMPROVEMENT.PLANE_4_LICENCE,
};
