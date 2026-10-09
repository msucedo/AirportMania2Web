import { IMPROVEMENT, offer, runway, type StageLayout } from './layout';

// Stage 1 layout, read from the original stage builder (see docs/re-notes.md).

export { IMPROVEMENT } from './layout';
export type { StageLayout, ImprovementOffer } from './layout';

export const ARCHES: StageLayout = {
  stage: 1,
  gateTypes: [0, 1],
  runwayType: 1,
  gasStationType: 1,
  backdrop: {
    horizon: 160,
    layers: [
      // The silhouette borrows the ground tile's top colour so the two join. The stage script
      // passes a sand colour (0.87, 0.77, 0.60) to the stage start, which may be the real tint.
      { resource: 'STAGES.ARCHES.BACKGROUND_TOP', position: { x: 0, y: 34 }, silhouette: { topRowOf: 'STAGES.ARCHES.BACKGROUND_DOWN' } },
      { resource: 'STAGES.ARCHES.BACKGROUND_DOWN', position: { x: 0, y: 160 }, scale: { x: 16, y: 16 } },
    ],
  },
  gateDecorations: [],
  stopSpotSurfaces: { normal: ['STOPSPOT'], vip: ['STOPSPOT_VIP'] },
  pontoons: false,
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
  runways: [runway(1, 450, 225, 1), runway(2, 495, 270, 1)],
  stopSpots: [
    { position: { x: 180, y: 300 }, requires: null, upgradedBy: IMPROVEMENT.UPGRADED_STOP_SPOT },
    { position: { x: 60, y: 300 }, requires: IMPROVEMENT.EXTRA_STOP_SPOT, replacedBy: IMPROVEMENT.PAINTING_STOP_SPOT },
  ],
  // Ids and prices are the ones the stage script registers (0x13458). The painting stop spot
  // (0x72, 60000) is left out until that place is implemented. Which title goes with 0x20 and the
  // prerequisites are inferred.
  improvements: [
    offer(IMPROVEMENT.EXTRA_STOP_SPOT, 10000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE'),
    offer(IMPROVEMENT.UPGRADED_STOP_SPOT, 20000, 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE'),
    offer(IMPROVEMENT.EXTRA_GATE_C, 20000, 'EXTRA_GATE_C', 'EXTRA_GATE', 'GATE_0'),
    offer(IMPROVEMENT.UPGRADED_GATE_A, 25000, 'IMPROVED_GATE_A', 'IMPROVED_GATE', 'GATE_1'),
    offer(IMPROVEMENT.UPGRADED_GATE_B, 30000, 'IMPROVED_GATE_B', 'IMPROVED_GATE', 'GATE_1'),
    offer(IMPROVEMENT.UPGRADED_GATE_C, 35000, 'IMPROVED_GATE_C', 'IMPROVED_GATE', 'GATE_1', IMPROVEMENT.EXTRA_GATE_C),
    offer(IMPROVEMENT.PLANE_4_LICENCE, 85000, 'PLANE_4_LICENCE', 'PLANE_4_LICENCE', 'PLANE_4'),
  ],
  extraPlaneLicence: IMPROVEMENT.PLANE_4_LICENCE,
};
