import { IMPROVEMENT, offer, runway, type StageLayout } from './layout';

// Stage 9 layout ("Moon"), from a run of its stage script (0xdef50) in the emulator
// (tools/re/stage_layout.py). See docs/re-notes.md.

const I = IMPROVEMENT;

export const MOON: StageLayout = {
  stage: 9,
  neutralColor: 0xe6eeff,
  gateTypes: [21, 22, 23],
  runwayType: 6,
  gasStationType: 9,
  backdrop: {
    // No sky object: the script makes a backdrop of space of its own (0x136a8), the image of
    // space with stars, the Earth, Saturn, two galaxies and a nebula rising slowly through it.
    sky: null,
    horizon: 173,
    layers: [
      { scenery: 'space', height: 70 },
      { resource: 'STAGES.MOON.BACKGROUND_DOWN', position: { x: 0, y: 173 }, scale: { x: 16, y: 19 } },
      { resource: 'STAGES.MOON.BACKGROUND_TOP', position: { x: 0, y: 45 } },
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
  decorations: [{ resource: 'STAGES.MOON.AIRPORT', position: { x: 327, y: 45 }, depth: 100 }],
  gates: [
    { letter: 'A', position: { x: 345, y: 150 }, requires: null, upgradedBy: I.UPGRADED_GATE_A, upgradedAgainBy: I.MORE_UPGRADED_GATE_A },
    { letter: 'B', position: { x: 380, y: 190 }, requires: null, upgradedBy: I.UPGRADED_GATE_B, upgradedAgainBy: I.MORE_UPGRADED_GATE_B },
    { letter: 'C', position: { x: 415, y: 230 }, requires: [I.EXTRA_GATE_C, I.UPGRADED_GATE_C, I.MORE_UPGRADED_GATE_C], upgradedBy: I.UPGRADED_GATE_C, upgradedAgainBy: I.MORE_UPGRADED_GATE_C },
    { letter: 'D', position: { x: 450, y: 270 }, requires: [I.EXTRA_GATE_D, I.UPGRADED_GATE_D, I.MORE_UPGRADED_GATE_D], upgradedBy: I.UPGRADED_GATE_D, upgradedAgainBy: I.MORE_UPGRADED_GATE_D },
  ],
  gasStation: { position: { x: 35, y: 110 }, minLevel: 1, improved: { improvement: I.IMPROVED_GAS_STATION, type: 11 } },
  hangar: { position: { x: 120, y: 95 }, type: 7, minLevel: 1, improved: { improvement: I.IMPROVED_HANGAR, type: 12 } },
  luggage: { position: { x: 343, y: 90 }, type: 6, minLevel: 1, improved: { improvement: I.IMPROVED_LUGGAGE, type: 7 } },
  taxiNodes: [
    { x: 205, y: 160 },
    { x: 235, y: 190 },
    { x: 265, y: 220 },
    { x: 295, y: 250 },
    { x: 250, y: 156 },
    { x: 240, y: 140 },
    { x: 365, y: 300 },
    { x: 375, y: 315 },
    { x: 355, y: 315 },
  ],
  runways: [runway(1, -5, 195, 0), runway(2, 20, 230, 0), runway(3, 45, 265, 0)],
  runwaysWith: { improvement: I.EXTRA_RUNWAY_4, runways: [runway(1, 0, 180, 0), runway(2, 25, 210, 0), runway(3, 50, 240, 0), runway(4, 75, 270, 0)] },
  vipRunway: { improvement: I.VIP_RUNWAY, type: 7 },
  stopSpots: [
    { position: { x: 270, y: 300 }, requires: null, upgradedBy: I.UPGRADED_STOP_SPOT },
    { position: { x: 170, y: 300 }, requires: I.EXTRA_STOP_SPOT, washedBy: { improvement: I.WASH_AND_GO, position: { x: 169, y: 301 } } },
    { position: { x: 50, y: 300 }, requires: I.EXTRA_STOP_SPOT_2, replacedBy: I.PAINTING_STOP_SPOT },
  ],
  // Ids, prices, the level each is first recommended at and the order are what the stage script
  // registers (0x13458). When each is on sale follows the conditions run in full for stage 4.
  improvements: [
    offer(I.EXTRA_STOP_SPOT, 95000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { tryFrom: 2, hiddenBy: [I.EXTRA_STOP_SPOT_2, I.WASH_AND_GO] }),
    offer(I.WASH_AND_GO, 610000, 'WASH_AND_GO', 'WASH_AND_GO', 'WASH_AND_GO', { needs: [I.EXTRA_STOP_SPOT] }),
    offer(I.EXTRA_STOP_SPOT_2, 140000, 'EXTRA_STORAGE_PLACE', 'EXTRA_STORAGE_PLACE', 'STORAGE_PLACE', { needs: [I.EXTRA_STOP_SPOT], hiddenBy: [I.PAINTING_STOP_SPOT] }),
    offer(I.UPGRADED_STOP_SPOT, 280000, 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE', 'VIP_STORAGE_PLACE'),
    offer(I.PAINTING_STOP_SPOT, 610000, 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', 'PAINTING_STOPSPOT', { needs: [I.EXTRA_STOP_SPOT_2] }),
    offer(I.EXTRA_GATE_C, 285000, 'EXTRA_GATE_C', 'EXTRA_GATE', 'GATE_21', { hiddenBy: [I.UPGRADED_GATE_C, I.MORE_UPGRADED_GATE_C] }),
    offer(I.EXTRA_GATE_D, 315000, 'EXTRA_GATE_D', 'EXTRA_GATE', 'GATE_21', { hiddenBy: [I.UPGRADED_GATE_D, I.MORE_UPGRADED_GATE_D] }),
    offer(I.UPGRADED_GATE_A, 260000, 'IMPROVED_GATE_A', 'IMPROVED_GATE', 'GATE_22', { hiddenBy: [I.MORE_UPGRADED_GATE_A] }),
    offer(I.UPGRADED_GATE_B, 290000, 'IMPROVED_GATE_B', 'IMPROVED_GATE', 'GATE_22', { hiddenBy: [I.MORE_UPGRADED_GATE_B] }),
    offer(I.UPGRADED_GATE_C, 300000, 'IMPROVED_GATE_C', 'IMPROVED_GATE', 'GATE_22', { needs: [I.EXTRA_GATE_C], hiddenBy: [I.MORE_UPGRADED_GATE_C] }),
    offer(I.UPGRADED_GATE_D, 310000, 'IMPROVED_GATE_D', 'IMPROVED_GATE', 'GATE_22', { needs: [I.EXTRA_GATE_D], hiddenBy: [I.MORE_UPGRADED_GATE_D] }),
    offer(I.MORE_UPGRADED_GATE_A, 250000, 'MORE_IMPROVED_GATE_A', 'MORE_IMPROVED_GATE', 'GATE_23', { needs: [I.UPGRADED_GATE_A] }),
    offer(I.MORE_UPGRADED_GATE_B, 260000, 'MORE_IMPROVED_GATE_B', 'MORE_IMPROVED_GATE', 'GATE_23', { needs: [I.UPGRADED_GATE_B] }),
    offer(I.MORE_UPGRADED_GATE_C, 260000, 'MORE_IMPROVED_GATE_C', 'MORE_IMPROVED_GATE', 'GATE_23', { needs: [I.UPGRADED_GATE_C] }),
    offer(I.EXTRA_RUNWAY_4, 570000, 'EXTRA_RUNWAY_4', 'EXTRA_RUNWAY', 'RUNWAY'),
    offer(I.VIP_RUNWAY, 620000, 'VIP_RUNWAY', 'VIP_RUNWAY', 'VIP_RUNWAY'),
    offer(I.IMPROVED_HANGAR, 565000, 'IMPROVED_HANGAR', 'IMPROVED_HANGAR', 'HANGAR_9'),
    offer(I.IMPROVED_GAS_STATION, 565000, 'IMPROVED_GAS_STATION', 'IMPROVED_GAS_STATION', 'GAS_STATION_9'),
    offer(I.IMPROVED_LUGGAGE, 565000, 'IMPROVED_LUGGAGE', 'IMPROVED_LUGGAGE', 'IMPROVED_LUGGAGE_9'),
    offer(I.COFFEE_AND_CAKE, 305000, 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE', 'COFFEE_AND_CAKE'),
    offer(I.IN_FLIGHT_MOVIES, 305000, 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES', 'IN_FLIGHT_MOVIES'),
    offer(I.ANTI_SPACE_GAS, 305000, 'ANTI_SPACE_GAS', 'ANTI_SPACE_GAS', 'ANTI_SPACE_GAS'),
    offer(I.DEICER, 455000, 'DEICER', 'DEICER', 'DEICER'),
    offer(I.ANTI_SAND, 410000, 'ANTI_SAND', 'ANTI_SAND', 'ANTI_SAND'),
    offer(I.PLANE_19_LICENCE, 920000, 'PLANE_19_LICENCE', 'PLANE_19_LICENCE', 'PLANE_19'),
    offer(I.MORE_UPGRADED_GATE_D, 270000, 'MORE_IMPROVED_GATE_D', 'MORE_IMPROVED_GATE', 'GATE_23', { needs: [I.UPGRADED_GATE_D] }),
  ],
  extraPlaneLicence: I.PLANE_19_LICENCE,
  // The script gives this stage no balloons and no helicopter.
  bonuses: {},
};
