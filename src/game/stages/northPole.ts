import { IMPROVEMENT, offer, runway, type StageLayout } from './layout';

// Stage 4 layout ("North Pole"), from a run of its stage script (0xd2958) in the emulator
// (tools/re/stage_layout.py). See docs/re-notes.md.

const I = IMPROVEMENT;

export const NORTH_POLE: StageLayout = {
  stage: 4,
  neutralColor: 0x8c58ff,
  // Plain, improved and, new in this stage, improved again.
  gateTypes: [6, 7, 8],
  runwayType: 3,
  gasStationType: 4,
  backdrop: {
    sky: 70,
    horizon: 162,
    // In the order the script creates them; a flying Santa (0x13f84) follows and is not drawn yet.
    layers: [
      { resource: 'STAGES.NORTH_POLE.BACKGROUND_DOWN', position: { x: 0, y: 162 }, scale: { x: 16, y: 14.5 } },
      { resource: 'STAGES.NORTH_POLE.BACKGROUND_TOP', position: { x: 0, y: 45 } },
    ],
  },
  gateDecorations: [],
  stopSpotSurfaces: { normal: ['STOPSPOT'], vip: ['STOPSPOT_VIP'] },
  pontoons: false,
  // Runways are created with flag 0, as on the island; the corner is taken to be the same.
  runwayBalloonCorner: 1,
  water: false,
  decorations: [],
  gates: [
    { letter: 'A', position: { x: 40, y: 105 }, requires: null, upgradedBy: I.UPGRADED_GATE_A, upgradedAgainBy: I.MORE_UPGRADED_GATE_A },
    { letter: 'B', position: { x: 110, y: 105 }, requires: null, upgradedBy: I.UPGRADED_GATE_B, upgradedAgainBy: I.MORE_UPGRADED_GATE_B },
    { letter: 'C', position: { x: 180, y: 105 }, requires: [I.EXTRA_GATE_C, I.UPGRADED_GATE_C, I.MORE_UPGRADED_GATE_C], upgradedBy: I.UPGRADED_GATE_C, upgradedAgainBy: I.MORE_UPGRADED_GATE_C },
    { letter: 'D', position: { x: 250, y: 105 }, requires: [I.EXTRA_GATE_D, I.UPGRADED_GATE_D, I.MORE_UPGRADED_GATE_D], upgradedBy: I.UPGRADED_GATE_D, upgradedAgainBy: I.MORE_UPGRADED_GATE_D },
  ],
  gasStation: { position: { x: 420, y: 255 }, minLevel: 1 },
  hangar: { position: { x: 340, y: 85 }, type: 2, minLevel: 1 },
  luggage: { position: { x: 440, y: 120 }, type: 1, minLevel: 1 },
  taxiNodes: [
    { x: 250, y: 225 },
    { x: 290, y: 225 },
    { x: 265, y: 245 },
    { x: 305, y: 245 },
    { x: 280, y: 265 },
    { x: 320, y: 265 },
    { x: 360, y: 300 },
    { x: 380, y: 300 },
    { x: 380, y: 312 },
  ],
  runways: [runway(1, -5, 217, 0), runway(2, 30, 257, 0)],
  runwaysWith: { improvement: I.EXTRA_RUNWAY_3, runways: [runway(1, -5, 202, 0), runway(2, 30, 232, 0), runway(3, 65, 262, 0)] },
  stopSpots: [
    { position: { x: 270, y: 300 }, requires: null, upgradedBy: I.UPGRADED_STOP_SPOT },
    { position: { x: 170, y: 300 }, requires: I.EXTRA_STOP_SPOT, washedBy: { improvement: I.WASH_AND_GO, position: { x: 169, y: 301 } } },
    { position: { x: 50, y: 300 }, requires: I.EXTRA_STOP_SPOT_2, replacedBy: I.PAINTING_STOP_SPOT },
  ],
  // Ids, prices, the level each is first recommended at and the order are what the stage script
  // registers (0x13458). When each is on sale comes from running the script with every
  // combination of the improvements that matter (tools/re/stage_layout.py --offers).
  improvements: [
    offer(I.EXTRA_STOP_SPOT, 25000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { tryFrom: 2, hiddenBy: [I.EXTRA_STOP_SPOT_2, I.WASH_AND_GO] }),
    offer(I.WASH_AND_GO, 160000, 'WASH_AND_GO', 'WASH_AND_GO', 'WASH_AND_GO', { needs: [I.EXTRA_STOP_SPOT] }),
    offer(I.EXTRA_STOP_SPOT_2, 35000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { needs: [I.EXTRA_STOP_SPOT], hiddenBy: [I.PAINTING_STOP_SPOT] }),
    offer(I.UPGRADED_STOP_SPOT, 60000, 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE'),
    offer(I.PAINTING_STOP_SPOT, 160000, 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', { needs: [I.EXTRA_STOP_SPOT_2] }),
    offer(I.EXTRA_GATE_C, 60000, 'EXTRA_GATE_C', 'EXTRA_GATE', 'GATE_6', { tryFrom: 4, hiddenBy: [I.UPGRADED_GATE_C, I.MORE_UPGRADED_GATE_C] }),
    offer(I.EXTRA_GATE_D, 70000, 'EXTRA_GATE_D', 'EXTRA_GATE', 'GATE_6', { tryFrom: 6, hiddenBy: [I.UPGRADED_GATE_D, I.MORE_UPGRADED_GATE_D] }),
    offer(I.UPGRADED_GATE_A, 55000, 'IMPROVED_GATE_A', 'IMPROVED_GATE', 'GATE_7', { tryFrom: 7, hiddenBy: [I.MORE_UPGRADED_GATE_A] }),
    offer(I.UPGRADED_GATE_B, 65000, 'IMPROVED_GATE_B', 'IMPROVED_GATE', 'GATE_7', { tryFrom: 7, hiddenBy: [I.MORE_UPGRADED_GATE_B] }),
    offer(I.UPGRADED_GATE_C, 75000, 'IMPROVED_GATE_C', 'IMPROVED_GATE', 'GATE_7', { needs: [I.EXTRA_GATE_C], hiddenBy: [I.MORE_UPGRADED_GATE_C] }),
    offer(I.UPGRADED_GATE_D, 85000, 'IMPROVED_GATE_D', 'IMPROVED_GATE', 'GATE_7', { needs: [I.EXTRA_GATE_D], hiddenBy: [I.MORE_UPGRADED_GATE_D] }),
    offer(I.MORE_UPGRADED_GATE_A, 50000, 'MORE_IMPROVED_GATE_A', 'MORE_IMPROVED_GATE', 'GATE_8', { tryFrom: 8, needs: [I.UPGRADED_GATE_A] }),
    offer(I.MORE_UPGRADED_GATE_B, 60000, 'MORE_IMPROVED_GATE_B', 'MORE_IMPROVED_GATE', 'GATE_8', { tryFrom: 8, needs: [I.UPGRADED_GATE_B] }),
    offer(I.MORE_UPGRADED_GATE_C, 70000, 'MORE_IMPROVED_GATE_C', 'MORE_IMPROVED_GATE', 'GATE_8', { needs: [I.UPGRADED_GATE_C] }),
    offer(I.EXTRA_RUNWAY_3, 120000, 'EXTRA_RUNWAY_3', 'EXTRA_RUNWAY', 'RUNWAY'),
    offer(I.DEICER, 100000, 'DEICER', 'DEICER', 'DEICER', { tryFrom: 5 }),
    offer(I.COFFEE_AND_CAKE, 80000, 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE'),
    offer(I.IN_FLIGHT_MOVIES, 80000, 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES'),
    offer(I.PLANE_7_LICENCE, 200000, 'PLANE_7_LICENCE', 'PLANE_7_LICENCE', 'PLANE_7'),
    offer(I.MORE_UPGRADED_GATE_D, 80000, 'MORE_IMPROVED_GATE_D', 'MORE_IMPROVED_GATE', 'GATE_8', { needs: [I.UPGRADED_GATE_D] }),
  ],
  extraPlaneLicence: I.PLANE_7_LICENCE,
  bonuses: {
    2: { kind: 'helicopter', delay: 25.2187, amount: 1000, speed: 1, fromLeft: false },
    6: { kind: 'balloons', delay: 132.081, amount: 1000 },
    8: { kind: 'helicopter', delay: 64.8514, amount: 1500, speed: 1, fromLeft: false },
  },
};
