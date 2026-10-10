import { IMPROVEMENT, offer, runway, type StageLayout } from './layout';

// Stage 2 layout ("Tiki-Taka" island), read from the stage script 0xcf414 and its helpers
// 0xcf1c0 (gate with its dock) and 0xcf370 (water runway). See docs/re-notes.md.

export const ISLAND: StageLayout = {
  stage: 2,
  neutralColor: 0xc28f36,
  gateTypes: [2, 3],
  runwayType: 2,
  gasStationType: 2,
  backdrop: {
    sky: 65,
    horizon: 159,
    // In the order the script creates them.
    layers: [
      { resource: 'STAGES.ISLAND.WATER', position: { x: 0, y: 159 }, scale: { x: 16, y: 15 } },
      { resource: 'STAGES.ISLAND.SEA', position: { x: 0, y: 55 } },
      { resource: 'STAGES.ISLAND.BACKGROUND_TOP', position: { x: 0, y: 40 } },
      { resource: 'STAGES.ISLAND.BACKGROUND_DOWN', position: { x: 335, y: 160 } },
    ],
    sparkles: { afterLayer: 1, area: { x1: 0, y1: 55, x2: 480, y2: 80, sag: 11 } },
  },
  decorations: [],
  gateDecorations: [
    { resource: 'GATES.STOPSPOT_ISLAND_BACK', offset: { x: -25, y: 30 } },
    { resource: 'GATES.STOPSPOT_ISLAND_FRONT', offset: { x: -25, y: 30 }, depth: 35 },
  ],
  gates: [
    { letter: 'A', position: { x: 135, y: 135 }, requires: null, upgradedBy: IMPROVEMENT.UPGRADED_GATE_A },
    { letter: 'B', position: { x: 385, y: 195 }, requires: null, upgradedBy: IMPROVEMENT.UPGRADED_GATE_B },
    {
      letter: 'C',
      position: { x: 435, y: 255 },
      requires: [IMPROVEMENT.EXTRA_GATE_C, IMPROVEMENT.UPGRADED_GATE_C],
      upgradedBy: IMPROVEMENT.UPGRADED_GATE_C,
    },
  ],
  gasStation: { position: { x: 52, y: 105 }, minLevel: 1 },
  hangar: { position: { x: 180, y: 90 }, type: 0, minLevel: 3 },
  taxiNodes: [{ x: 280, y: 195 }],
  // Water runways are created with flag 0: the node is at the right end and planes leave leftwards.
  runways: [runway(1, 50, 195, 0), runway(2, 85, 250, 0)],
  // 0xd0100: the spot at 60 needs the second extra place, or is the painting spot when that is
  // owned; the one at 170 needs the first extra place; the one at 280 is always there.
  stopSpots: [
    { position: { x: 280, y: 300 }, requires: null, upgradedBy: IMPROVEMENT.UPGRADED_STOP_SPOT },
    { position: { x: 170, y: 300 }, requires: IMPROVEMENT.EXTRA_STOP_SPOT },
    { position: { x: 60, y: 300 }, requires: IMPROVEMENT.EXTRA_STOP_SPOT_2, replacedBy: IMPROVEMENT.PAINTING_STOP_SPOT },
  ],
  stopSpotSurfaces: {
    normal: ['STOPSPOT_ISLAND_BACK', 'STOPSPOT_ISLAND_FRONT'],
    vip: ['STOPSPOT_ISLAND_VIP_BACK', 'STOPSPOT_ISLAND_VIP_FRONT'],
  },
  pontoons: true,
  runwayBalloonCorner: 1,
  water: true,
  // Ids, prices and order as registered by the script.
  improvements: [
    offer(IMPROVEMENT.EXTRA_STOP_SPOT, 17000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'ISLAND_STORAGE_PLACE', 2),
    offer(IMPROVEMENT.EXTRA_STOP_SPOT_2, 25000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'ISLAND_STORAGE_PLACE'),
    offer(IMPROVEMENT.UPGRADED_STOP_SPOT, 40000, 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE', 'ISLAND_VIP_STORAGE_PLACE'),
    offer(IMPROVEMENT.PAINTING_STOP_SPOT, 95000, 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT'),
    offer(IMPROVEMENT.EXTRA_GATE_C, 35000, 'EXTRA_GATE_C', 'EXTRA_GATE', 'GATE_2', 4),
    offer(IMPROVEMENT.UPGRADED_GATE_A, 35000, 'IMPROVED_GATE_A', 'IMPROVED_GATE', 'GATE_3', 3),
    offer(IMPROVEMENT.UPGRADED_GATE_B, 40000, 'IMPROVED_GATE_B', 'IMPROVED_GATE', 'GATE_3'),
    offer(IMPROVEMENT.COFFEE_AND_CAKE, 50000, 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE'),
    offer(IMPROVEMENT.PLANE_5_LICENCE, 120000, 'PLANE_5_LICENCE', 'PLANE_5_LICENCE', 'PLANE_5'),
    offer(IMPROVEMENT.UPGRADED_GATE_C, 45000, 'IMPROVED_GATE_C', 'IMPROVED_GATE', 'GATE_3'),
  ],
  extraPlaneLicence: IMPROVEMENT.PLANE_5_LICENCE,
};
