import { IMPROVEMENT, offer, runway, type StageLayout } from './layout';

// Stage 8 layout ("Carrier"), from a run of its stage script (0xdc5b8) in the emulator
// (tools/re/stage_layout.py). See docs/re-notes.md.

const I = IMPROVEMENT;

export const CARRIER: StageLayout = {
  stage: 8,
  neutralColor: 0xabcdff,
  gateTypes: [18, 19, 20],
  runwayType: 5,
  gasStationType: 8,
  backdrop: {
    sky: 70,
    horizon: 115,
    // In the order the script creates them, with the clouds after the second: four islands pass
    // along the horizon, a hundred seconds apart, and the sea glints as it slides by.
    layers: [
      { resource: 'STAGES.CARRIER.BACKGROUND_DOWN', position: { x: 0, y: 115 }, scale: { x: 16, y: 19 } },
      { resource: 'STAGES.CARRIER.OCEAN_BOTTOM', position: { x: 0, y: 68 }, scale: { x: 48, y: 4 } },
      { scenery: 'horizon', resource: 'STAGES.CARRIER.ISLANDS.0', y: 37, loop: 400, speed: 8, start: 100 },
      { scenery: 'horizon', resource: 'STAGES.CARRIER.ISLANDS.1', y: 38, loop: 400, speed: 8, start: 200 },
      { scenery: 'horizon', resource: 'STAGES.CARRIER.ISLANDS.2', y: 41, loop: 400, speed: 8, start: 300 },
      { scenery: 'horizon', resource: 'STAGES.CARRIER.ISLANDS.3', y: 37, loop: 400, speed: 8, start: 400 },
      { resource: 'STAGES.CARRIER.OCEAN_TOP', position: { x: 0, y: 45 } },
      // The sea slides by: the carrier is under way.
      { scenery: 'sea', area: { x1: 0, y1: 47, x2: 480, y2: 85, sag: 11, drift: -200 } },
      { resource: 'STAGES.CARRIER.BACKGROUND_TOP', position: { x: 0, y: 85 } },
    ],
  },
  gateDecorations: [],
  stopSpotSurfaces: { normal: ['STOPSPOT'], vip: ['STOPSPOT_VIP'] },
  pontoons: false,
  // Runways are created with flag 0, as on the island; the corner is taken to be the same.
  runwayBalloonCorner: 1,
  water: false,
  // The island of the carrier stands among the planes.
  decorations: [{ resource: 'STAGES.CARRIER.AIRPORT', position: { x: 359, y: 45 }, depth: 100 }],
  gates: [
    { letter: 'A', position: { x: 348, y: 136 }, requires: null, upgradedBy: I.UPGRADED_GATE_A, upgradedAgainBy: I.MORE_UPGRADED_GATE_A },
    { letter: 'B', position: { x: 380, y: 182 }, requires: null, upgradedBy: I.UPGRADED_GATE_B, upgradedAgainBy: I.MORE_UPGRADED_GATE_B },
    { letter: 'C', position: { x: 408, y: 228 }, requires: [I.EXTRA_GATE_C, I.UPGRADED_GATE_C, I.MORE_UPGRADED_GATE_C], upgradedBy: I.UPGRADED_GATE_C, upgradedAgainBy: I.MORE_UPGRADED_GATE_C },
    { letter: 'D', position: { x: 440, y: 274 }, requires: [I.EXTRA_GATE_D, I.UPGRADED_GATE_D, I.MORE_UPGRADED_GATE_D], upgradedBy: I.UPGRADED_GATE_D, upgradedAgainBy: I.MORE_UPGRADED_GATE_D },
  ],
  gasStation: { position: { x: 55, y: 97 }, minLevel: 1, improved: { improvement: I.IMPROVED_GAS_STATION, type: 10 } },
  hangar: { position: { x: 170, y: 75 }, type: 6, minLevel: 1, improved: { improvement: I.IMPROVED_HANGAR, type: 11 } },
  luggage: { position: { x: 340, y: 86 }, type: 5, minLevel: 1 },
  taxiNodes: [
    { x: 225, y: 170 },
    { x: 250, y: 200 },
    { x: 275, y: 230 },
    { x: 300, y: 260 },
    { x: 335, y: 307 },
    { x: 355, y: 307 },
    { x: 345, y: 297 },
  ],
  taxiBarriers: [
    [
      { x: 312, y: 148 },
      { x: 327, y: 169 },
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
    offer(I.EXTRA_STOP_SPOT, 65000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { hiddenBy: [I.EXTRA_STOP_SPOT_2, I.WASH_AND_GO] }),
    offer(I.WASH_AND_GO, 300000, 'WASH_AND_GO', 'WASH_AND_GO', 'WASH_AND_GO', { needs: [I.EXTRA_STOP_SPOT] }),
    offer(I.EXTRA_STOP_SPOT_2, 100000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { needs: [I.EXTRA_STOP_SPOT], hiddenBy: [I.PAINTING_STOP_SPOT] }),
    offer(I.UPGRADED_STOP_SPOT, 195000, 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE'),
    offer(I.PAINTING_STOP_SPOT, 440000, 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', { needs: [I.EXTRA_STOP_SPOT_2] }),
    offer(I.EXTRA_GATE_C, 240000, 'EXTRA_GATE_C', 'EXTRA_GATE', 'GATE_18', { hiddenBy: [I.UPGRADED_GATE_C, I.MORE_UPGRADED_GATE_C] }),
    offer(I.EXTRA_GATE_D, 250000, 'EXTRA_GATE_D', 'EXTRA_GATE', 'GATE_18', { hiddenBy: [I.UPGRADED_GATE_D, I.MORE_UPGRADED_GATE_D] }),
    offer(I.UPGRADED_GATE_A, 190000, 'IMPROVED_GATE_A', 'IMPROVED_GATE', 'GATE_19', { hiddenBy: [I.MORE_UPGRADED_GATE_A] }),
    offer(I.UPGRADED_GATE_B, 200000, 'IMPROVED_GATE_B', 'IMPROVED_GATE', 'GATE_19', { hiddenBy: [I.MORE_UPGRADED_GATE_B] }),
    offer(I.UPGRADED_GATE_C, 210000, 'IMPROVED_GATE_C', 'IMPROVED_GATE', 'GATE_19', { needs: [I.EXTRA_GATE_C], hiddenBy: [I.MORE_UPGRADED_GATE_C] }),
    offer(I.UPGRADED_GATE_D, 220000, 'IMPROVED_GATE_D', 'IMPROVED_GATE', 'GATE_19', { needs: [I.EXTRA_GATE_D], hiddenBy: [I.MORE_UPGRADED_GATE_D] }),
    offer(I.MORE_UPGRADED_GATE_A, 140000, 'MORE_IMPROVED_GATE_A', 'MORE_IMPROVED_GATE', 'GATE_20', { needs: [I.UPGRADED_GATE_A] }),
    offer(I.MORE_UPGRADED_GATE_B, 150000, 'MORE_IMPROVED_GATE_B', 'MORE_IMPROVED_GATE', 'GATE_20', { needs: [I.UPGRADED_GATE_B] }),
    offer(I.MORE_UPGRADED_GATE_C, 160000, 'MORE_IMPROVED_GATE_C', 'MORE_IMPROVED_GATE', 'GATE_20', { needs: [I.UPGRADED_GATE_C] }),
    offer(I.EXTRA_RUNWAY_4, 690000, 'EXTRA_RUNWAY_4', 'EXTRA_RUNWAY', 'RUNWAY'),
    offer(I.VIP_RUNWAY, 410000, 'VIP_RUNWAY', 'VIP_RUNWAY', 'VIP_RUNWAY'),
    offer(I.IMPROVED_HANGAR, 390000, 'IMPROVED_HANGAR', 'IMPROVED_HANGAR', 'HANGAR_8'),
    offer(I.IMPROVED_GAS_STATION, 390000, 'IMPROVED_GAS_STATION', 'IMPROVED_GAS_STATION', 'GAS_STATION_8'),
    offer(I.COFFEE_AND_CAKE, 220000, 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE'),
    offer(I.IN_FLIGHT_MOVIES, 220000, 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES'),
    offer(I.ANTI_FOG, 220000, 'ANTI_FOG', 'ANTI_FOG', 'ANTI_FOG'),
    offer(I.DEICER, 250000, 'DEICER', 'DEICER', 'DEICER'),
    offer(I.PLANE_15_LICENCE, 530000, 'PLANE_15_LICENCE', 'PLANE_15_LICENCE', 'PLANE_15'),
    offer(I.MORE_UPGRADED_GATE_D, 170000, 'MORE_IMPROVED_GATE_D', 'MORE_IMPROVED_GATE', 'GATE_20', { needs: [I.UPGRADED_GATE_D] }),
  ],
  extraPlaneLicence: I.PLANE_15_LICENCE,
  bonuses: {
    2: { kind: 'helicopter', delay: 65.2972, amount: 4000, speed: 1, fromLeft: true },
    6: { kind: 'balloons', delay: 67.7602, amount: 4500 },
    8: { kind: 'helicopter', delay: 148.879, amount: 4500, speed: 1, fromLeft: true },
    11: { kind: 'balloons', delay: 50.8548, amount: 5000 },
  },
};
