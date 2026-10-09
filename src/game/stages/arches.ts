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
  heading: number;
}

export interface StageLayout {
  /** Gate descriptor types: [normal, upgraded]. */
  gateTypes: [number, number];
  runwayType: number;
  backgroundDown: { resource: string; position: Point; scale: Point };
  backgroundTop: { resource: string; position: Point };
  decorations: { resource: string; position: Point }[];
  gates: GateSlot[];
  gasStation: { position: Point; minLevel: number };
  taxiNodes: Point[];
  runways: RunwaySlot[];
  stopSpots: { position: Point; requires: number | null; upgradedBy?: number; replacedBy?: number }[];
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
} as const;

export const ARCHES: StageLayout = {
  gateTypes: [0, 1],
  runwayType: 1,
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
};
