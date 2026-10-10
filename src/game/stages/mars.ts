import { IMPROVEMENT, offer, runway, type StageLayout } from './layout';

// Stage 10 layout ("Mars"), from a run of its stage script (0xe18c4) in the emulator
// (tools/re/stage_layout.py). See docs/re-notes.md.

const I = IMPROVEMENT;

/** One piece of the ground: two images laid side by side, some of them mirrored. */
const ground = (piece: 1 | 2, x: number, mirrored: boolean) => ({ resource: `STAGES.MARS.BACKGROUND_DOWN_${piece}`, position: { x, y: 130 }, scale: { x: mirrored ? -1 : 1, y: 2 } });

export const MARS: StageLayout = {
  stage: 10,
  neutralColor: 0xe6eeff,
  gateTypes: [25, 26, 27],
  runwayType: 6,
  gasStationType: 13,
  backdrop: {
    // No sky object: the script makes a sky of its own (0x13758, "MarsSky"), which draws `SKY`
    // over a grid 480 px wide and 70 high and makes it ripple. It is drawn here stretched over
    // that rectangle, without the ripple or its changing colours.
    sky: null,
    horizon: 130,
    // The rest in the order the script creates them.
    layers: [
      { resource: 'STAGES.MARS.SKY', position: { x: 0, y: 0 }, scale: { x: 480 / 202, y: 70 / 98 } },
      { resource: 'STAGES.MARS.BACKGROUND_TOP', position: { x: 0, y: 51 } },
      ground(1, 0, false),
      ground(2, 62, false),
      ground(1, 186, true),
      ground(2, 248, true),
      ground(1, 248, false),
      ground(2, 310, false),
      ground(1, 434, true),
      ground(2, 496, true),
      { resource: 'STAGES.MARS.TOWER', position: { x: 300, y: 10 } },
      { resource: 'STAGES.MARS.AIRPORT', position: { x: 347, y: 65 } },
    ],
  },
  gateDecorations: [],
  stopSpotSurfaces: { normal: ['STOPSPOT'], vip: ['STOPSPOT_VIP'] },
  pontoons: false,
  // Runways are created with flag 0, as on the island; the corner is taken to be the same.
  runwayBalloonCorner: 1,
  stopSpotBalloonCorner: 1,
  water: false,
  spaceGas: true,
  decorations: [],
  gates: [
    { letter: 'A', position: { x: 333, y: 125 }, requires: null, upgradedBy: I.UPGRADED_GATE_A, upgradedAgainBy: I.MORE_UPGRADED_GATE_A },
    { letter: 'B', position: { x: 370, y: 170 }, requires: null, upgradedBy: I.UPGRADED_GATE_B, upgradedAgainBy: I.MORE_UPGRADED_GATE_B },
    { letter: 'C', position: { x: 407, y: 215 }, requires: [I.EXTRA_GATE_C, I.UPGRADED_GATE_C, I.MORE_UPGRADED_GATE_C], upgradedBy: I.UPGRADED_GATE_C, upgradedAgainBy: I.MORE_UPGRADED_GATE_C },
    { letter: 'D', position: { x: 444, y: 260 }, requires: [I.EXTRA_GATE_D, I.UPGRADED_GATE_D, I.MORE_UPGRADED_GATE_D], upgradedBy: I.UPGRADED_GATE_D, upgradedAgainBy: I.MORE_UPGRADED_GATE_D },
  ],
  gasStation: { position: { x: 143, y: 97 }, minLevel: 1, improved: { improvement: I.IMPROVED_GAS_STATION, type: 14 } },
  hangar: { position: { x: 238, y: 80 }, type: 14, minLevel: 1, improved: { improvement: I.IMPROVED_HANGAR, type: 15 } },
  luggage: { position: { x: 50, y: 93 }, type: 8, minLevel: 1, improved: { improvement: I.IMPROVED_LUGGAGE, type: 9 } },
  taxiNodes: [
    { x: 220, y: 165 },
    { x: 240, y: 190 },
    { x: 260, y: 215 },
    { x: 280, y: 240 },
    { x: 300, y: 265 },
    { x: 345, y: 300 },
    { x: 355, y: 315 },
    { x: 335, y: 315 },
  ],
  runways: [runway(1, 20, 185, 0), runway(2, 45, 220, 0), runway(3, 70, 255, 0)],
  runwaysWith: { improvement: I.EXTRA_RUNWAY_4, runways: [runway(1, 15, 175, 0), runway(2, 35, 205, 0), runway(3, 55, 235, 0), runway(4, 75, 265, 0)] },
  // The VIP runway is of another type here than in the stages before (9, not 7).
  vipRunway: { improvement: I.VIP_RUNWAY, type: 9 },
  stopSpots: [
    { position: { x: 270, y: 300 }, requires: null, upgradedBy: I.UPGRADED_STOP_SPOT },
    { position: { x: 170, y: 300 }, requires: I.EXTRA_STOP_SPOT, washedBy: { improvement: I.WASH_AND_GO, position: { x: 169, y: 301 } } },
    { position: { x: 50, y: 300 }, requires: I.EXTRA_STOP_SPOT_2, replacedBy: I.PAINTING_STOP_SPOT },
  ],
  // Ids, prices and the order are what the stage script registers (0x13458); none has a level
  // it is first recommended at. When each is on sale follows the conditions run in full for
  // stage 4.
  improvements: [
    offer(I.EXTRA_STOP_SPOT, 95000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { hiddenBy: [I.EXTRA_STOP_SPOT_2, I.WASH_AND_GO] }),
    offer(I.WASH_AND_GO, 310000, 'WASH_AND_GO', 'WASH_AND_GO', 'WASH_AND_GO', { needs: [I.EXTRA_STOP_SPOT] }),
    offer(I.EXTRA_STOP_SPOT_2, 140000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { needs: [I.EXTRA_STOP_SPOT], hiddenBy: [I.PAINTING_STOP_SPOT] }),
    offer(I.UPGRADED_STOP_SPOT, 280000, 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE'),
    offer(I.PAINTING_STOP_SPOT, 610000, 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', { needs: [I.EXTRA_STOP_SPOT_2] }),
    offer(I.EXTRA_GATE_C, 330000, 'EXTRA_GATE_C', 'EXTRA_GATE', 'GATE_25', { hiddenBy: [I.UPGRADED_GATE_C, I.MORE_UPGRADED_GATE_C] }),
    offer(I.EXTRA_GATE_D, 340000, 'EXTRA_GATE_D', 'EXTRA_GATE', 'GATE_25', { hiddenBy: [I.UPGRADED_GATE_D, I.MORE_UPGRADED_GATE_D] }),
    offer(I.UPGRADED_GATE_A, 280000, 'IMPROVED_GATE_A', 'IMPROVED_GATE', 'GATE_26', { hiddenBy: [I.MORE_UPGRADED_GATE_A] }),
    offer(I.UPGRADED_GATE_B, 290000, 'IMPROVED_GATE_B', 'IMPROVED_GATE', 'GATE_26', { hiddenBy: [I.MORE_UPGRADED_GATE_B] }),
    offer(I.UPGRADED_GATE_C, 300000, 'IMPROVED_GATE_C', 'IMPROVED_GATE', 'GATE_26', { needs: [I.EXTRA_GATE_C], hiddenBy: [I.MORE_UPGRADED_GATE_C] }),
    offer(I.UPGRADED_GATE_D, 310000, 'IMPROVED_GATE_D', 'IMPROVED_GATE', 'GATE_26', { needs: [I.EXTRA_GATE_D], hiddenBy: [I.MORE_UPGRADED_GATE_D] }),
    offer(I.MORE_UPGRADED_GATE_A, 230000, 'MORE_IMPROVED_GATE_A', 'MORE_IMPROVED_GATE', 'GATE_27', { needs: [I.UPGRADED_GATE_A] }),
    offer(I.MORE_UPGRADED_GATE_B, 240000, 'MORE_IMPROVED_GATE_B', 'MORE_IMPROVED_GATE', 'GATE_27', { needs: [I.UPGRADED_GATE_B] }),
    offer(I.MORE_UPGRADED_GATE_C, 250000, 'MORE_IMPROVED_GATE_C', 'MORE_IMPROVED_GATE', 'GATE_27', { needs: [I.UPGRADED_GATE_C] }),
    offer(I.EXTRA_RUNWAY_4, 570000, 'EXTRA_RUNWAY_4', 'EXTRA_RUNWAY', 'RUNWAY'),
    offer(I.VIP_RUNWAY, 410000, 'VIP_RUNWAY', 'VIP_RUNWAY', 'VIP_RUNWAY'),
    offer(I.IMPROVED_HANGAR, 500000, 'IMPROVED_HANGAR', 'IMPROVED_HANGAR', 'HANGAR_10'),
    offer(I.IMPROVED_GAS_STATION, 500000, 'IMPROVED_GAS_STATION', 'IMPROVED_GAS_STATION', 'GAS_STATION_10'),
    offer(I.IMPROVED_LUGGAGE, 500000, 'IMPROVED_LUGGAGE', 'IMPROVED_LUGGAGE', 'IMPROVED_LUGGAGE_10'),
    offer(I.COFFEE_AND_CAKE, 305000, 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE'),
    offer(I.IN_FLIGHT_MOVIES, 305000, 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES'),
    offer(I.ANTI_SPACE_GAS, 355000, 'ANTI_SPACE_GAS', 'ANTI_SPACE_GAS', 'ANTI_SPACE_GAS'),
    offer(I.DEICER, 425000, 'DEICER', 'DEICER', 'DEICER'),
    offer(I.ANTI_SAND, 510000, 'ANTI_SAND', 'ANTI_SAND', 'ANTI_SAND'),
    offer(I.PLANE_20_LICENCE, 720000, 'PLANE_20_LICENCE', 'PLANE_20_LICENCE', 'PLANE_20'),
    offer(I.MORE_UPGRADED_GATE_D, 260000, 'MORE_IMPROVED_GATE_D', 'MORE_IMPROVED_GATE', 'GATE_27', { needs: [I.UPGRADED_GATE_D] }),
  ],
  extraPlaneLicence: I.PLANE_20_LICENCE,
  // The script gives this stage no balloons and no helicopter.
  bonuses: {},
};
