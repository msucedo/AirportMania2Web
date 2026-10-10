import { IMPROVEMENT, offer, runway, type StageLayout } from './layout';

// Stage 3 layout ("Monsters"), from a run of its stage script (0xd07bc) in the emulator
// (tools/re/stage_layout.py). See docs/re-notes.md.

export const MONSTERS: StageLayout = {
  stage: 3,
  neutralColor: 0xffccb3,
  gateTypes: [4, 5],
  runwayType: 1,
  gasStationType: 3,
  backdrop: {
    // The night sky is an image here; the stage does not create the usual sky object.
    sky: null,
    horizon: 153,
    // In the order the script creates them: six stars, four clouds and a witch that crosses now
    // and then in the sky; five patches of fog by the gas station once the buildings are up.
    layers: [
      { resource: 'STAGES.MONSTERS.SKY', position: { x: 0, y: 0 }, scale: { x: 24, y: 24 } },
      { resource: 'STAGES.MONSTERS.BACKGROUND_DOWN', position: { x: 0, y: 153 }, scale: { x: 16, y: 17 } },
      { resource: 'AMBIENT.MOON', position: { x: 428, y: 31 } },
      { scenery: 'star', position: { x: 26, y: 55 }, size: 9 },
      { scenery: 'star', position: { x: 93, y: 33 }, size: 9 },
      { scenery: 'star', position: { x: 195, y: 38 }, size: 7 },
      { scenery: 'star', position: { x: 240, y: 17 }, size: 8 },
      { scenery: 'star', position: { x: 260, y: 61 }, size: 11 },
      { scenery: 'star', position: { x: 323, y: 34 }, size: 9 },
      { scenery: 'scaryCloud', resource: 'STAGES.MONSTERS.SCARY_CLOUD_1', position: { x: 100, y: 19.5 }, speed: 15 },
      { scenery: 'scaryCloud', resource: 'STAGES.MONSTERS.SCARY_CLOUD_3', position: { x: 700, y: 33 }, speed: -12 },
      { scenery: 'moving', resource: 'STAGES.MONSTERS.WITCH', x: 900, y: 40, loop: 100, span: 12, speed: -80, offset: 67.456 },
      { scenery: 'scaryCloud', resource: 'STAGES.MONSTERS.SCARY_CLOUD_2', position: { x: 400, y: 30 }, speed: -8 },
      { scenery: 'scaryCloud', resource: 'STAGES.MONSTERS.SCARY_CLOUD_0', position: { x: 1000, y: 48 }, speed: 9.5 },
      { resource: 'STAGES.MONSTERS.BACKGROUND_TOP', position: { x: 0, y: 45 } },
      { resource: 'STAGES.MONSTERS.TOWER', position: { x: 260, y: 45 } },
      { resource: 'STAGES.MONSTERS.AIRPORT_BUILDING', position: { x: 385, y: 60 } },
      { scenery: 'fogPatch', resource: 'STAGES.MONSTERS.FOG_2', position: { x: 60, y: 94 }, flipped: true, loop: 19, span: 13, speed: -2.5, start: 3 },
      { scenery: 'fogPatch', resource: 'STAGES.MONSTERS.FOG_1', position: { x: 70, y: 105 }, flipped: false, loop: 17, span: 14, speed: 3, start: 0 },
      { scenery: 'fogPatch', resource: 'STAGES.MONSTERS.FOG_0', position: { x: 35, y: 98 }, flipped: false, loop: 16.3, span: 8, speed: -4.1, start: 1.7 },
      { scenery: 'fogPatch', resource: 'STAGES.MONSTERS.FOG_1', position: { x: 96, y: 93 }, flipped: true, loop: 16.3, span: 8, speed: 3.3, start: 10.7 },
      { scenery: 'fogPatch', resource: 'STAGES.MONSTERS.FOG_2', position: { x: 43, y: 100 }, flipped: false, loop: 19, span: 14, speed: 3.5, start: 7 },
      // Five bats, made once the airport's places are: they swoop in at the right edge, each on
      // its own beat. Like all scenery they are drawn under the runways, the gates and the planes.
      { scenery: 'bat', position: { x: 520, y: 190 }, loop: 25, span: 10, start: 0, phase: 15 },
      { scenery: 'bat', position: { x: 510, y: 190 }, loop: 25, span: 10, start: 0.37, phase: 5 },
      { scenery: 'bat', position: { x: 540, y: 190 }, loop: 25, span: 10, start: 10.1, phase: 7 },
      { scenery: 'bat', position: { x: 540, y: 190 }, loop: 25, span: 10, start: 11.1, phase: 0 },
      { scenery: 'bat', position: { x: 530, y: 190 }, loop: 25, span: 10, start: 1.27, phase: 11 },
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
    { letter: 'A', position: { x: 365, y: 145 }, requires: null, upgradedBy: IMPROVEMENT.UPGRADED_GATE_A },
    { letter: 'B', position: { x: 395, y: 188 }, requires: null, upgradedBy: IMPROVEMENT.UPGRADED_GATE_B },
    { letter: 'C', position: { x: 425, y: 231 }, requires: [IMPROVEMENT.EXTRA_GATE_C, IMPROVEMENT.UPGRADED_GATE_C], upgradedBy: IMPROVEMENT.UPGRADED_GATE_C },
    { letter: 'D', position: { x: 455, y: 274 }, requires: [IMPROVEMENT.EXTRA_GATE_D, IMPROVEMENT.UPGRADED_GATE_D], upgradedBy: IMPROVEMENT.UPGRADED_GATE_D },
  ],
  gasStation: { position: { x: 60, y: 107 }, minLevel: 1 },
  hangar: { position: { x: 170, y: 107 }, type: 1, minLevel: 1 },
  taxiNodes: [
    { x: 250, y: 195 },
    { x: 270, y: 225 },
    { x: 290, y: 255 },
    { x: 355, y: 315 },
    { x: 370, y: 315 },
    { x: 355, y: 300 },
  ],
  runways: [runway(1, -5, 210, 0), runway(2, 30, 250, 0)],
  // With the third runway the script lays all three out afresh.
  runwaysWith: { improvement: IMPROVEMENT.EXTRA_RUNWAY_3, runways: [runway(1, -5, 195, 0), runway(2, 30, 225, 0), runway(3, 65, 255, 0)] },
  stopSpots: [
    { position: { x: 270, y: 300 }, requires: null, upgradedBy: IMPROVEMENT.UPGRADED_STOP_SPOT },
    { position: { x: 170, y: 300 }, requires: IMPROVEMENT.EXTRA_STOP_SPOT, washedBy: { improvement: IMPROVEMENT.WASH_AND_GO, position: { x: 169, y: 301 } } },
    { position: { x: 50, y: 300 }, requires: IMPROVEMENT.EXTRA_STOP_SPOT_2, replacedBy: IMPROVEMENT.PAINTING_STOP_SPOT },
  ],
  // Ids, prices, order, the level each is first recommended at and when each is on sale are what
  // the stage script registers (0x13458), as run by tools/re/stage_layout.py --offers.
  improvements: [
    offer(IMPROVEMENT.EXTRA_STOP_SPOT, 20000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { tryFrom: 2, hiddenBy: [IMPROVEMENT.EXTRA_STOP_SPOT_2, IMPROVEMENT.WASH_AND_GO] }),
    offer(IMPROVEMENT.WASH_AND_GO, 150000, 'WASH_AND_GO', 'WASH_AND_GO', 'WASH_AND_GO', { tryFrom: 3, needs: [IMPROVEMENT.EXTRA_STOP_SPOT] }),
    offer(IMPROVEMENT.EXTRA_STOP_SPOT_2, 30000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { needs: [IMPROVEMENT.EXTRA_STOP_SPOT], hiddenBy: [IMPROVEMENT.PAINTING_STOP_SPOT] }),
    offer(IMPROVEMENT.UPGRADED_STOP_SPOT, 60000, 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE'),
    offer(IMPROVEMENT.PAINTING_STOP_SPOT, 150000, 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', { needs: [IMPROVEMENT.EXTRA_STOP_SPOT_2] }),
    offer(IMPROVEMENT.EXTRA_GATE_C, 60000, 'EXTRA_GATE_C', 'EXTRA_GATE', 'GATE_4', { tryFrom: 4, hiddenBy: [IMPROVEMENT.UPGRADED_GATE_C] }),
    offer(IMPROVEMENT.EXTRA_GATE_D, 70000, 'EXTRA_GATE_D', 'EXTRA_GATE', 'GATE_4', { tryFrom: 6, hiddenBy: [IMPROVEMENT.UPGRADED_GATE_D] }),
    offer(IMPROVEMENT.UPGRADED_GATE_A, 55000, 'IMPROVED_GATE_A', 'IMPROVED_GATE', 'GATE_5', { tryFrom: 7 }),
    offer(IMPROVEMENT.UPGRADED_GATE_B, 60000, 'IMPROVED_GATE_B', 'IMPROVED_GATE', 'GATE_5', { tryFrom: 7 }),
    offer(IMPROVEMENT.UPGRADED_GATE_C, 70000, 'IMPROVED_GATE_C', 'IMPROVED_GATE', 'GATE_5', { needs: [IMPROVEMENT.EXTRA_GATE_C] }),
    offer(IMPROVEMENT.EXTRA_RUNWAY_3, 110000, 'EXTRA_RUNWAY_3', 'EXTRA_RUNWAY', 'RUNWAY'),
    offer(IMPROVEMENT.ANTI_FOG, 80000, 'ANTI_FOG', 'ANTI_FOG', 'ANTI_FOG', { tryFrom: 5 }),
    offer(IMPROVEMENT.COFFEE_AND_CAKE, 80000, 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE'),
    offer(IMPROVEMENT.IN_FLIGHT_MOVIES, 80000, 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES'),
    offer(IMPROVEMENT.PLANE_6_LICENCE, 200000, 'PLANE_6_LICENCE', 'PLANE_6_LICENCE', 'PLANE_6'),
    offer(IMPROVEMENT.UPGRADED_GATE_D, 80000, 'IMPROVED_GATE_D', 'IMPROVED_GATE', 'GATE_5', { needs: [IMPROVEMENT.EXTRA_GATE_D] }),
  ],
  extraPlaneLicence: IMPROVEMENT.PLANE_6_LICENCE,
  bonuses: {
    2: { kind: 'balloons', delay: 37.9891, amount: 750 },
    6: { kind: 'helicopter', delay: 102.65, amount: 1000, speed: 1, fromLeft: true },
    8: { kind: 'balloons', delay: 109.89, amount: 1000 },
  },
};
