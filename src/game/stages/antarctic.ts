import { IMPROVEMENT, offer, runway, type StageLayout } from './layout';

// Stage 7 layout ("Antarctic"), from a run of its stage script (0xd9e00) in the emulator
// (tools/re/stage_layout.py). See docs/re-notes.md.

const I = IMPROVEMENT;

export const ANTARCTIC: StageLayout = {
  stage: 7,
  neutralColor: 0xeda5ff,
  gateTypes: [15, 16, 17],
  runwayType: 4,
  gasStationType: 7,
  backdrop: {
    // The script makes no sky: the first layer is the night sky, stretched over the top.
    sky: null,
    horizon: 123,
    // In the order the script creates them. Between the second and the third it also makes
    // eight stars (0x13b8c) and the aurora (0x13808), not drawn yet.
    layers: [
      { resource: 'STAGES.ANTARCTIC.BACKGROUND_BOTTOM_TOP', position: { x: 0, y: 0 }, scale: { x: 16, y: 3.5 } },
      { resource: 'STAGES.ANTARCTIC.BACKGROUND_DOWN', position: { x: 0, y: 123 }, scale: { x: 16, y: 18 } },
      { resource: 'STAGES.ANTARCTIC.BACKGROUND_TOP', position: { x: 0, y: 41 } },
    ],
  },
  gateDecorations: [],
  stopSpotSurfaces: { normal: ['STOPSPOT'], vip: ['STOPSPOT_VIP'] },
  pontoons: false,
  // Runways are created with flag 0, as on the island; the corner is taken to be the same.
  runwayBalloonCorner: 1,
  stopSpotBalloonCorner: 1,
  water: false,
  // The building stands among the planes: one taxiing behind it is covered.
  decorations: [{ resource: 'STAGES.ANTARCTIC.AIRPORT', position: { x: 365, y: 65 }, depth: 120 }],
  gates: [
    { letter: 'A', position: { x: 345, y: 145 }, requires: null, upgradedBy: I.UPGRADED_GATE_A, upgradedAgainBy: I.MORE_UPGRADED_GATE_A },
    { letter: 'B', position: { x: 377, y: 190 }, requires: null, upgradedBy: I.UPGRADED_GATE_B, upgradedAgainBy: I.MORE_UPGRADED_GATE_B },
    { letter: 'C', position: { x: 409, y: 235 }, requires: [I.EXTRA_GATE_C, I.UPGRADED_GATE_C, I.MORE_UPGRADED_GATE_C], upgradedBy: I.UPGRADED_GATE_C, upgradedAgainBy: I.MORE_UPGRADED_GATE_C },
    { letter: 'D', position: { x: 441, y: 280 }, requires: [I.EXTRA_GATE_D, I.UPGRADED_GATE_D, I.MORE_UPGRADED_GATE_D], upgradedBy: I.UPGRADED_GATE_D, upgradedAgainBy: I.MORE_UPGRADED_GATE_D },
  ],
  gasStation: { position: { x: 48, y: 92 }, minLevel: 1 },
  hangar: { position: { x: 163, y: 85 }, type: 5, minLevel: 1, improved: { improvement: I.IMPROVED_HANGAR, type: 10 } },
  luggage: { position: { x: 340, y: 87 }, type: 4, minLevel: 1 },
  taxiNodes: [
    { x: 225, y: 175 },
    { x: 252, y: 205 },
    { x: 279, y: 235 },
    { x: 306, y: 265 },
    { x: 345, y: 312 },
    { x: 360, y: 312 },
    { x: 345, y: 300 },
  ],
  taxiBarriers: [
    [
      { x: 310, y: 160 },
      { x: 330, y: 190 },
    ],
  ],
  runways: [runway(1, -5, 180, 0), runway(2, 20, 210, 0), runway(3, 45, 240, 0)],
  runwaysWith: { improvement: I.EXTRA_RUNWAY_4, runways: [runway(1, 0, 170, 0), runway(2, 25, 200, 0), runway(3, 50, 230, 0), runway(4, 75, 260, 0)] },
  vipRunway: { improvement: I.VIP_RUNWAY, type: 7 },
  stopSpots: [
    { position: { x: 270, y: 300 }, requires: null, upgradedBy: I.UPGRADED_STOP_SPOT },
    { position: { x: 170, y: 300 }, requires: I.EXTRA_STOP_SPOT, washedBy: { improvement: I.WASH_AND_GO, position: { x: 169, y: 301 } } },
    { position: { x: 50, y: 300 }, requires: I.EXTRA_STOP_SPOT_2, replacedBy: I.PAINTING_STOP_SPOT },
  ],
  // Ids, prices and the order are what the stage script registers (0x13458); none has a level
  // it is first recommended at. When each is on sale follows the pattern confirmed for stages
  // 1 to 3 and what a run with each single improvement shows.
  improvements: [
    offer(I.EXTRA_STOP_SPOT, 55000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { hiddenBy: [I.EXTRA_STOP_SPOT_2, I.WASH_AND_GO] }),
    offer(I.WASH_AND_GO, 200000, 'WASH_AND_GO', 'WASH_AND_GO', 'WASH_AND_GO', { needs: [I.EXTRA_STOP_SPOT] }),
    offer(I.EXTRA_STOP_SPOT_2, 80000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { needs: [I.EXTRA_STOP_SPOT], hiddenBy: [I.PAINTING_STOP_SPOT] }),
    offer(I.UPGRADED_STOP_SPOT, 165000, 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE'),
    offer(I.PAINTING_STOP_SPOT, 410000, 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', { needs: [I.EXTRA_STOP_SPOT_2] }),
    offer(I.EXTRA_GATE_C, 210000, 'EXTRA_GATE_C', 'EXTRA_GATE', 'GATE_15', { hiddenBy: [I.UPGRADED_GATE_C, I.MORE_UPGRADED_GATE_C] }),
    offer(I.EXTRA_GATE_D, 220000, 'EXTRA_GATE_D', 'EXTRA_GATE', 'GATE_15', { hiddenBy: [I.UPGRADED_GATE_D, I.MORE_UPGRADED_GATE_D] }),
    offer(I.UPGRADED_GATE_A, 170000, 'IMPROVED_GATE_A', 'IMPROVED_GATE', 'GATE_16', { hiddenBy: [I.MORE_UPGRADED_GATE_A] }),
    offer(I.UPGRADED_GATE_B, 180000, 'IMPROVED_GATE_B', 'IMPROVED_GATE', 'GATE_16', { hiddenBy: [I.MORE_UPGRADED_GATE_B] }),
    offer(I.UPGRADED_GATE_C, 190000, 'IMPROVED_GATE_C', 'IMPROVED_GATE', 'GATE_16', { needs: [I.EXTRA_GATE_C], hiddenBy: [I.MORE_UPGRADED_GATE_C] }),
    offer(I.UPGRADED_GATE_D, 200000, 'IMPROVED_GATE_D', 'IMPROVED_GATE', 'GATE_16', { needs: [I.EXTRA_GATE_D], hiddenBy: [I.MORE_UPGRADED_GATE_D] }),
    offer(I.MORE_UPGRADED_GATE_A, 130000, 'MORE_IMPROVED_GATE_A', 'MORE_IMPROVED_GATE', 'GATE_17', { needs: [I.UPGRADED_GATE_A] }),
    offer(I.MORE_UPGRADED_GATE_B, 140000, 'MORE_IMPROVED_GATE_B', 'MORE_IMPROVED_GATE', 'GATE_17', { needs: [I.UPGRADED_GATE_B] }),
    offer(I.MORE_UPGRADED_GATE_C, 150000, 'MORE_IMPROVED_GATE_C', 'MORE_IMPROVED_GATE', 'GATE_17', { needs: [I.UPGRADED_GATE_C] }),
    offer(I.EXTRA_RUNWAY_4, 525000, 'EXTRA_RUNWAY_4', 'EXTRA_RUNWAY', 'RUNWAY'),
    offer(I.VIP_RUNWAY, 380000, 'VIP_RUNWAY', 'VIP_RUNWAY', 'VIP_RUNWAY'),
    offer(I.IMPROVED_HANGAR, 330000, 'IMPROVED_HANGAR', 'IMPROVED_HANGAR', 'HANGAR_7'),
    offer(I.COFFEE_AND_CAKE, 200000, 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE'),
    offer(I.IN_FLIGHT_MOVIES, 200000, 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES'),
    offer(I.ANTI_FOG, 170000, 'ANTI_FOG', 'ANTI_FOG', 'ANTI_FOG'),
    offer(I.DEICER, 225000, 'DEICER', 'DEICER', 'DEICER'),
    offer(I.PLANE_9_LICENCE, 430000, 'PLANE_9_LICENCE', 'PLANE_9_LICENCE', 'PLANE_9'),
    offer(I.MORE_UPGRADED_GATE_D, 160000, 'MORE_IMPROVED_GATE_D', 'MORE_IMPROVED_GATE', 'GATE_17', { needs: [I.UPGRADED_GATE_D] }),
  ],
  extraPlaneLicence: I.PLANE_9_LICENCE,
  bonuses: {
    2: { kind: 'helicopter', delay: 42.9753, amount: 3000, speed: 1, fromLeft: false },
    4: { kind: 'balloons', delay: 80.0787, amount: 3500 },
    6: { kind: 'helicopter', delay: 70.6953, amount: 3500, speed: 1, fromLeft: true },
    9: { kind: 'balloons', delay: 104.63, amount: 4000 },
  },
};
