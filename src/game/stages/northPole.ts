import { IMPROVEMENT, offer, runway, type SceneryItem, type StageLayout } from './layout';

// Stage 4 layout ("North Pole"), from a run of its stage script (0xd2958) in the emulator
// (tools/re/stage_layout.py). See docs/re-notes.md.

const I = IMPROVEMENT;

/** Where Santa is in his loop when each level starts: the script takes it from the level's own random numbers. */
const SLEIGH_OFFSETS: Record<number, number> = { 1: 4.58405, 2: 9.53402, 3: 3.64747, 4: 3.3765, 5: 4.03167, 6: 9.37971, 7: 7.04744, 8: 6.64197 };

/** The clouds every sky has (0xcda08), as the six moving images they are, for a day without a sky object. */
const CLOUDS: SceneryItem[] = (
  [
    ['AMBIENT.CLOUD_1', 0.275, 0.3],
    ['AMBIENT.CLOUD_2', 0.325, 0.65],
    ['AMBIENT.CLOUD_3', 0.175, 1],
    ['AMBIENT.CLOUD_1', 0.275, 1.3],
    ['AMBIENT.CLOUD_2', 0.225, 1.55],
    ['AMBIENT.CLOUD_3', 0.325, 1.92],
  ] as const
).map(([resource, height, start]) => ({ scenery: 'moving', resource, x: -100, y: Math.floor(height * 70), loop: 520, span: 260, speed: 5, offset: start * 260 }));

const snow = (image: number, bottom: number, drift: number, fall: number, interval: number): SceneryItem => ({ scenery: 'snow', resource: `SNOW_FLAKES.${image}`, top: 30, bottom, drift, fall, interval });

/**
 * The backdrop of a level, in the order the script makes it. Even levels have the usual sky; on
 * odd ones it is overcast, an image stretched over the top, and it snows: five falls, the
 * farthest first, each with bigger flakes that fall faster, lower and fewer than the one before.
 * Santa's sleigh crosses on every level.
 */
function backdrop(level: number): StageLayout['backdrop'] {
  const overcast = level % 2 === 1;
  const sleigh: SceneryItem = { scenery: 'sleigh', position: { x: -100, y: 50 }, loop: 380, speed: 50, offset: SLEIGH_OFFSETS[level] ?? 0 };
  return {
    sky: overcast ? null : 70,
    horizon: 162,
    layers: [
      ...(overcast ? [{ resource: 'STAGES.NORTH_POLE.COVERED_SKY', position: { x: 0, y: 0 }, scale: { x: 16, y: 23 } }] : []),
      { resource: 'STAGES.NORTH_POLE.BACKGROUND_DOWN', position: { x: 0, y: 162 }, scale: { x: 16, y: 14.5 } },
      ...(overcast ? CLOUDS : []),
      { resource: 'STAGES.NORTH_POLE.BACKGROUND_TOP', position: { x: 0, y: 45 } },
      sleigh,
      ...(overcast ? [snow(4, 150, 5, 10, 0.2), snow(3, 180, 5, 15, 0.25), snow(2, 280, 10, 25, 0.5), snow(1, 320, 20, 50, 4), snow(0, 320, 40, 100, 15)] : []),
    ],
  };
}

export const NORTH_POLE: StageLayout = {
  stage: 4,
  neutralColor: 0x8c58ff,
  // Plain, improved and, new in this stage, improved again.
  gateTypes: [6, 7, 8],
  runwayType: 3,
  gasStationType: 4,
  // An even day: a clear sky. See `backdropFor` for the overcast odd days.
  backdrop: backdrop(2),
  backdropFor: backdrop,
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
