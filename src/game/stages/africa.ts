import { IMPROVEMENT, offer, runway, type StageLayout } from './layout';

// Stage 6 layout ("Africa"), from a run of its stage script (0xd77ac) in the emulator
// (tools/re/stage_layout.py). See docs/re-notes.md.

const I = IMPROVEMENT;

export const AFRICA: StageLayout = {
  stage: 6,
  neutralColor: 0xe597ff,
  gateTypes: [12, 13, 14],
  runwayType: 4,
  gasStationType: 6,
  backdrop: {
    sky: 70,
    horizon: 120,
    // In the order the script creates them, with the clouds between the first and the second.
    layers: [
      { resource: 'STAGES.AFRICA.BACKGROUND_DOWN', position: { x: 0, y: 120 }, scale: { x: 16, y: 16 } },
      { resource: 'STAGES.AFRICA.BACKGROUND_TOP', position: { x: 0, y: 40 } },
      { resource: 'STAGES.AFRICA.AIRPORT', position: { x: 370, y: 57 } },
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
    { letter: 'A', position: { x: 350, y: 125 }, requires: null, upgradedBy: I.UPGRADED_GATE_A, upgradedAgainBy: I.MORE_UPGRADED_GATE_A },
    { letter: 'B', position: { x: 375, y: 175 }, requires: null, upgradedBy: I.UPGRADED_GATE_B, upgradedAgainBy: I.MORE_UPGRADED_GATE_B },
    { letter: 'C', position: { x: 404, y: 225 }, requires: [I.EXTRA_GATE_C, I.UPGRADED_GATE_C, I.MORE_UPGRADED_GATE_C], upgradedBy: I.UPGRADED_GATE_C, upgradedAgainBy: I.MORE_UPGRADED_GATE_C },
    { letter: 'D', position: { x: 430, y: 275 }, requires: [I.EXTRA_GATE_D, I.UPGRADED_GATE_D, I.MORE_UPGRADED_GATE_D], upgradedBy: I.UPGRADED_GATE_D, upgradedAgainBy: I.MORE_UPGRADED_GATE_D },
  ],
  gasStation: { position: { x: 245, y: 78 }, minLevel: 1 },
  hangar: { position: { x: 135, y: 68 }, type: 4, minLevel: 1, improved: { improvement: I.IMPROVED_HANGAR, type: 9 } },
  luggage: { position: { x: 21, y: 98 }, type: 3, minLevel: 1 },
  taxiNodes: [
    { x: 270, y: 180 },
    { x: 290, y: 210 },
    { x: 310, y: 240 },
    { x: 360, y: 312 },
    { x: 375, y: 312 },
    { x: 355, y: 290 },
  ],
  // Three runways from the start, the first stage to have them, and a fourth on sale.
  runways: [runway(1, -5, 175, 0), runway(2, 20, 210, 0), runway(3, 45, 245, 0)],
  runwaysWith: { improvement: I.EXTRA_RUNWAY_4, runways: [runway(1, 0, 170, 0), runway(2, 25, 200, 0), runway(3, 50, 230, 0), runway(4, 75, 260, 0)] },
  vipRunway: { improvement: I.VIP_RUNWAY, type: 7 },
  stopSpots: [
    { position: { x: 270, y: 300 }, requires: null, upgradedBy: I.UPGRADED_STOP_SPOT },
    { position: { x: 170, y: 300 }, requires: I.EXTRA_STOP_SPOT, washedBy: { improvement: I.WASH_AND_GO, position: { x: 169, y: 301 } } },
    { position: { x: 50, y: 300 }, requires: I.EXTRA_STOP_SPOT_2, replacedBy: I.PAINTING_STOP_SPOT },
  ],
  // Ids, prices, the level each is first recommended at and the order are what the stage script
  // registers (0x13458). When each is on sale follows the pattern confirmed for stages 1 to 3 and
  // what a run with each single improvement shows.
  improvements: [
    offer(I.EXTRA_STOP_SPOT, 50000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { tryFrom: 4, hiddenBy: [I.EXTRA_STOP_SPOT_2, I.WASH_AND_GO] }),
    offer(I.WASH_AND_GO, 320000, 'WASH_AND_GO', 'WASH_AND_GO', 'WASH_AND_GO', { needs: [I.EXTRA_STOP_SPOT] }),
    offer(I.EXTRA_STOP_SPOT_2, 75000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { tryFrom: 6, needs: [I.EXTRA_STOP_SPOT], hiddenBy: [I.PAINTING_STOP_SPOT] }),
    offer(I.UPGRADED_STOP_SPOT, 135000, 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE'),
    offer(I.PAINTING_STOP_SPOT, 320000, 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', { needs: [I.EXTRA_STOP_SPOT_2] }),
    offer(I.EXTRA_GATE_C, 200000, 'EXTRA_GATE_C', 'EXTRA_GATE', 'GATE_12', { hiddenBy: [I.UPGRADED_GATE_C, I.MORE_UPGRADED_GATE_C] }),
    offer(I.EXTRA_GATE_D, 210000, 'EXTRA_GATE_D', 'EXTRA_GATE', 'GATE_12', { hiddenBy: [I.UPGRADED_GATE_D, I.MORE_UPGRADED_GATE_D] }),
    offer(I.UPGRADED_GATE_A, 160000, 'IMPROVED_GATE_A', 'IMPROVED_GATE', 'GATE_13', { hiddenBy: [I.MORE_UPGRADED_GATE_A] }),
    offer(I.UPGRADED_GATE_B, 170000, 'IMPROVED_GATE_B', 'IMPROVED_GATE', 'GATE_13', { hiddenBy: [I.MORE_UPGRADED_GATE_B] }),
    offer(I.UPGRADED_GATE_C, 180000, 'IMPROVED_GATE_C', 'IMPROVED_GATE', 'GATE_13', { needs: [I.EXTRA_GATE_C] }),
    offer(I.UPGRADED_GATE_D, 190000, 'IMPROVED_GATE_D', 'IMPROVED_GATE', 'GATE_13', { needs: [I.EXTRA_GATE_D] }),
    offer(I.MORE_UPGRADED_GATE_A, 120000, 'MORE_IMPROVED_GATE_A', 'MORE_IMPROVED_GATE', 'GATE_14', { needs: [I.UPGRADED_GATE_A] }),
    offer(I.MORE_UPGRADED_GATE_B, 130000, 'MORE_IMPROVED_GATE_B', 'MORE_IMPROVED_GATE', 'GATE_14', { needs: [I.UPGRADED_GATE_B] }),
    offer(I.MORE_UPGRADED_GATE_C, 140000, 'MORE_IMPROVED_GATE_C', 'MORE_IMPROVED_GATE', 'GATE_14', { needs: [I.UPGRADED_GATE_C] }),
    offer(I.EXTRA_RUNWAY_4, 250000, 'EXTRA_RUNWAY_4', 'EXTRA_RUNWAY', 'RUNWAY'),
    offer(I.VIP_RUNWAY, 150000, 'VIP_RUNWAY', 'VIP_RUNWAY', 'VIP_RUNWAY'),
    offer(I.IMPROVED_HANGAR, 260000, 'IMPROVED_HANGAR', 'IMPROVED_HANGAR', 'HANGAR_6'),
    offer(I.COFFEE_AND_CAKE, 170000, 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE'),
    offer(I.IN_FLIGHT_MOVIES, 170000, 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES'),
    offer(I.ANTI_FOG, 170000, 'ANTI_FOG', 'ANTI_FOG', 'ANTI_FOG'),
    offer(I.ANTI_SAND, 230000, 'ANTI_SAND', 'ANTI_SAND', 'ANTI_SAND', { tryFrom: 6 }),
    offer(I.PLANE_8_LICENCE, 430000, 'PLANE_8_LICENCE', 'PLANE_8_LICENCE', 'PLANE_8'),
    offer(I.MORE_UPGRADED_GATE_D, 150000, 'MORE_IMPROVED_GATE_D', 'MORE_IMPROVED_GATE', 'GATE_14', { needs: [I.UPGRADED_GATE_D] }),
  ],
  extraPlaneLicence: I.PLANE_8_LICENCE,
  bonuses: {
    2: { kind: 'helicopter', delay: 63.2791, amount: 2000, speed: 1, fromLeft: false },
    5: { kind: 'balloons', delay: 108.49, amount: 2500 },
    7: { kind: 'helicopter', delay: 152.109, amount: 2500, speed: 1, fromLeft: true },
    9: { kind: 'balloons', delay: 101.918, amount: 3000 },
  },
};
