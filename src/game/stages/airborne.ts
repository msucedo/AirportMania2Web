import { IMPROVEMENT, offer, runway, type StageLayout } from './layout';

// Stage 5 layout ("Airborne"), from a run of its stage script (0xd4f54) in the emulator
// (tools/re/stage_layout.py). See docs/re-notes.md.

const I = IMPROVEMENT;

export const AIRBORNE: StageLayout = {
  stage: 5,
  neutralColor: 0xcdd0ff,
  gateTypes: [9, 10, 11],
  runwayType: 3,
  gasStationType: 5,
  backdrop: {
    sky: 140,
    horizon: 155,
    // In the order the script creates them: under the airport five bands of cloud slide by,
    // the nearer the faster, with four mountain tops passing between them, and two propellers turn.
    layers: [
      { resource: 'STAGES.AIRBORNE.BACKGROUND_DOWN', position: { x: 0, y: 155 }, scale: { x: 16, y: 16 } },
      { scenery: 'cloudBand', resource: 'STAGES.AIRBORNE.CLOUDS.0', period: 50, y: 82, left: 270, right: 480 },
      { scenery: 'moving', resource: 'STAGES.AIRBORNE.MOUNTAINS.0', x: 500, y: 81, loop: 250, span: 45, speed: -6.5, offset: 50 },
      { scenery: 'moving', resource: 'STAGES.AIRBORNE.MOUNTAINS.1', x: 500, y: 81, loop: 250, span: 45, speed: -6.5, offset: 175 },
      { scenery: 'cloudBand', resource: 'STAGES.AIRBORNE.CLOUDS.1', period: 30, y: 85, left: 270, right: 480 },
      { scenery: 'moving', resource: 'STAGES.AIRBORNE.MOUNTAINS.2', x: 500, y: 90, loop: 150, span: 33, speed: -9, offset: 25 },
      { scenery: 'cloudBand', resource: 'STAGES.AIRBORNE.CLOUDS.2', period: 20, y: 89, left: 270, right: 480 },
      { scenery: 'moving', resource: 'STAGES.AIRBORNE.MOUNTAINS.3', x: 500, y: 92, loop: 150, span: 21, speed: -16, offset: 100 },
      { scenery: 'cloudBand', resource: 'STAGES.AIRBORNE.CLOUDS.3', period: 12, y: 96, left: 300, right: 480 },
      { scenery: 'cloudBand', resource: 'STAGES.AIRBORNE.CLOUDS.4', period: 12, y: 106, left: 400, right: 480 },
      { scenery: 'propeller', resource: 'STAGES.AIRBORNE.PROPELLER', position: { x: 89, y: 65 }, scale: { x: 0.4, y: 1 } },
      { scenery: 'propeller', resource: 'STAGES.AIRBORNE.PROPELLER', position: { x: 274, y: 76 }, scale: { x: 0.6, y: 1.4 } },
      { resource: 'STAGES.AIRBORNE.BACKGROUND_TOP', position: { x: 0, y: 44 } },
      { resource: 'STAGES.AIRBORNE.HANGAR_BACK', position: { x: 0, y: 56 } },
      { resource: 'STAGES.AIRBORNE.AIRPORT', position: { x: 360, y: 90 } },
    ],
  },
  gateDecorations: [],
  stopSpotSurfaces: { normal: ['STOPSPOT'], vip: ['STOPSPOT_VIP'] },
  pontoons: false,
  // Runways are created with flag 0, as on the island; the corner is taken to be the same.
  runwayBalloonCorner: 1,
  stopSpotBalloonCorner: 1,
  water: false,
  decorations: [],
  gates: [
    { letter: 'A', position: { x: 345, y: 147 }, requires: null, upgradedBy: I.UPGRADED_GATE_A, upgradedAgainBy: I.MORE_UPGRADED_GATE_A },
    { letter: 'B', position: { x: 375, y: 192 }, requires: null, upgradedBy: I.UPGRADED_GATE_B, upgradedAgainBy: I.MORE_UPGRADED_GATE_B },
    { letter: 'C', position: { x: 405, y: 237 }, requires: [I.EXTRA_GATE_C, I.UPGRADED_GATE_C, I.MORE_UPGRADED_GATE_C], upgradedBy: I.UPGRADED_GATE_C, upgradedAgainBy: I.MORE_UPGRADED_GATE_C },
    { letter: 'D', position: { x: 435, y: 282 }, requires: [I.EXTRA_GATE_D, I.UPGRADED_GATE_D, I.MORE_UPGRADED_GATE_D], upgradedBy: I.UPGRADED_GATE_D, upgradedAgainBy: I.MORE_UPGRADED_GATE_D },
  ],
  gasStation: { position: { x: 137, y: 115 }, minLevel: 1 },
  hangar: { position: { x: 48, y: 115 }, type: 3, minLevel: 1, improved: { improvement: I.IMPROVED_HANGAR, type: 8 } },
  luggage: { position: { x: 240, y: 115 }, type: 2, minLevel: 1 },
  taxiNodes: [
    { x: 250, y: 185 },
    { x: 265, y: 205 },
    { x: 280, y: 225 },
    { x: 295, y: 245 },
    { x: 355, y: 312 },
    { x: 370, y: 312 },
    { x: 355, y: 300 },
  ],
  runways: [runway(1, -5, 200, 0), runway(2, 35, 240, 0)],
  runwaysWith: { improvement: I.EXTRA_RUNWAY_3, runways: [runway(1, -5, 190, 0), runway(2, 25, 220, 0), runway(3, 55, 250, 0)] },
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
    offer(I.EXTRA_STOP_SPOT, 40000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { tryFrom: 4, hiddenBy: [I.EXTRA_STOP_SPOT_2, I.WASH_AND_GO] }),
    offer(I.WASH_AND_GO, 300000, 'WASH_AND_GO', 'WASH_AND_GO', 'WASH_AND_GO', { needs: [I.EXTRA_STOP_SPOT] }),
    offer(I.EXTRA_STOP_SPOT_2, 60000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { tryFrom: 6, needs: [I.EXTRA_STOP_SPOT], hiddenBy: [I.PAINTING_STOP_SPOT] }),
    offer(I.UPGRADED_STOP_SPOT, 120000, 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE'),
    offer(I.PAINTING_STOP_SPOT, 300000, 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', { needs: [I.EXTRA_STOP_SPOT_2] }),
    offer(I.EXTRA_GATE_C, 120000, 'EXTRA_GATE_C', 'EXTRA_GATE', 'GATE_9', { hiddenBy: [I.UPGRADED_GATE_C, I.MORE_UPGRADED_GATE_C] }),
    offer(I.EXTRA_GATE_D, 135000, 'EXTRA_GATE_D', 'EXTRA_GATE', 'GATE_9', { hiddenBy: [I.UPGRADED_GATE_D, I.MORE_UPGRADED_GATE_D] }),
    offer(I.UPGRADED_GATE_A, 110000, 'IMPROVED_GATE_A', 'IMPROVED_GATE', 'GATE_10', { hiddenBy: [I.MORE_UPGRADED_GATE_A] }),
    offer(I.UPGRADED_GATE_B, 125000, 'IMPROVED_GATE_B', 'IMPROVED_GATE', 'GATE_10', { hiddenBy: [I.MORE_UPGRADED_GATE_B] }),
    offer(I.UPGRADED_GATE_C, 145000, 'IMPROVED_GATE_C', 'IMPROVED_GATE', 'GATE_10', { needs: [I.EXTRA_GATE_C], hiddenBy: [I.MORE_UPGRADED_GATE_C] }),
    offer(I.UPGRADED_GATE_D, 165000, 'IMPROVED_GATE_D', 'IMPROVED_GATE', 'GATE_10', { needs: [I.EXTRA_GATE_D], hiddenBy: [I.MORE_UPGRADED_GATE_D] }),
    offer(I.MORE_UPGRADED_GATE_A, 100000, 'MORE_IMPROVED_GATE_A', 'MORE_IMPROVED_GATE', 'GATE_11', { needs: [I.UPGRADED_GATE_A] }),
    offer(I.MORE_UPGRADED_GATE_B, 110000, 'MORE_IMPROVED_GATE_B', 'MORE_IMPROVED_GATE', 'GATE_11', { needs: [I.UPGRADED_GATE_B] }),
    offer(I.MORE_UPGRADED_GATE_C, 130000, 'MORE_IMPROVED_GATE_C', 'MORE_IMPROVED_GATE', 'GATE_11', { needs: [I.UPGRADED_GATE_C] }),
    offer(I.EXTRA_RUNWAY_3, 200000, 'EXTRA_RUNWAY_3', 'EXTRA_RUNWAY', 'RUNWAY', { tryFrom: 5 }),
    offer(I.VIP_RUNWAY, 220000, 'VIP_RUNWAY', 'VIP_RUNWAY', 'VIP_RUNWAY'),
    offer(I.IMPROVED_HANGAR, 250000, 'IMPROVED_HANGAR', 'IMPROVED_HANGAR', 'HANGAR_5'),
    offer(I.COFFEE_AND_CAKE, 150000, 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE'),
    offer(I.IN_FLIGHT_MOVIES, 150000, 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES'),
    offer(I.ANTI_FOG, 150000, 'ANTI_FOG', 'ANTI_FOG', 'ANTI_FOG'),
    offer(I.PLANE_14_LICENCE, 400000, 'PLANE_14_LICENCE', 'PLANE_14_LICENCE', 'PLANE_14'),
    offer(I.MORE_UPGRADED_GATE_D, 150000, 'MORE_IMPROVED_GATE_D', 'MORE_IMPROVED_GATE', 'GATE_11', { needs: [I.UPGRADED_GATE_D] }),
  ],
  extraPlaneLicence: I.PLANE_14_LICENCE,
  bonuses: {
    2: { kind: 'balloons', delay: 39.9462, amount: 1500 },
    6: { kind: 'helicopter', delay: 134.308, amount: 1500, speed: 1, fromLeft: true },
    8: { kind: 'balloons', delay: 118.284, amount: 2000 },
  },
};
