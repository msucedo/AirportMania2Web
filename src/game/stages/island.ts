import { IMPROVEMENT, offer, runway, type StageLayout } from './layout';

// Stage 2 layout ("Tiki-Taka" island), read from the stage script 0xcf414 and its helpers
// 0xcf1c0 (gate with its dock) and 0xcf370 (water runway). See docs/re-notes.md.

export const ISLAND: StageLayout = {
  stage: 2,
  gateTypes: [2, 3],
  runwayType: 2,
  gasStationType: 2,
  backdrop: {
    horizon: 159,
    // The script creates, in this order: the water tile at y 159 (scale 16×15), the sea strip at
    // y 55, the grey upper background at y 40 and the land image at (335, 160). How the engine
    // composites the grey image is not known. Drawing it as solid land hides the sea strip and puts
    // sand under the stilted gate and pump, so here it is kept as the hills on the horizon and the
    // water is extended up to the sea strip. That arrangement is our approximation.
    layers: [
      // The stage script passes (0.76, 0.56, 0.21) to the stage start; used as the hill colour.
      { resource: 'STAGES.ISLAND.BACKGROUND_TOP', position: { x: 0, y: 40 }, silhouette: 0xc28f36 },
      { resource: 'STAGES.ISLAND.WATER', position: { x: 0, y: 78 }, scale: { x: 16, y: 7.4 } },
      { resource: 'STAGES.ISLAND.WATER', position: { x: 0, y: 159 }, scale: { x: 16, y: 15 } },
      { resource: 'STAGES.ISLAND.SEA', position: { x: 0, y: 55 } },
      { resource: 'STAGES.ISLAND.BACKGROUND_DOWN', position: { x: 335, y: 160 } },
    ],
  },
  decorations: [],
  gateDecorations: [
    { resource: 'GATES.STOPSPOT_ISLAND_BACK', offset: { x: -25, y: 30 }, front: false },
    { resource: 'GATES.STOPSPOT_ISLAND_FRONT', offset: { x: -25, y: 30 }, front: true },
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
  taxiNodes: [{ x: 280, y: 195 }],
  // Water runways are created with flag 0: the node is at the right end and planes leave leftwards.
  runways: [runway(1, 50, 195, 0), runway(2, 85, 250, 0)],
  // Which improvement adds which spot mirrors Arches and is inferred from the order of the calls.
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
  // Ids and prices as registered by the script. Coffee and cake (0x74, 50000) and the painting
  // stop spot (0x72, 95000) are left out until they are implemented.
  improvements: [
    offer(IMPROVEMENT.EXTRA_STOP_SPOT, 17000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'ISLAND_STORAGE_PLACE'),
    offer(IMPROVEMENT.EXTRA_STOP_SPOT_2, 25000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'ISLAND_STORAGE_PLACE', IMPROVEMENT.EXTRA_STOP_SPOT),
    offer(IMPROVEMENT.UPGRADED_STOP_SPOT, 40000, 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE', 'ISLAND_VIP_STORAGE_PLACE'),
    offer(IMPROVEMENT.EXTRA_GATE_C, 35000, 'EXTRA_GATE_C', 'EXTRA_GATE', 'GATE_2'),
    offer(IMPROVEMENT.UPGRADED_GATE_A, 35000, 'IMPROVED_GATE_A', 'IMPROVED_GATE', 'GATE_3'),
    offer(IMPROVEMENT.UPGRADED_GATE_B, 40000, 'IMPROVED_GATE_B', 'IMPROVED_GATE', 'GATE_3'),
    offer(IMPROVEMENT.UPGRADED_GATE_C, 45000, 'IMPROVED_GATE_C', 'IMPROVED_GATE', 'GATE_3', IMPROVEMENT.EXTRA_GATE_C),
    offer(IMPROVEMENT.PLANE_5_LICENCE, 120000, 'PLANE_5_LICENCE', 'PLANE_5_LICENCE', 'PLANE_5'),
  ],
  extraPlaneLicence: IMPROVEMENT.PLANE_5_LICENCE,
};
