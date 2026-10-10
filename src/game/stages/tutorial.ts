import { runway, type StageLayout } from './layout';

// The tutorial's layout ("Airport Academy", stage 0), from a run of its script (0xcde40) in the
// emulator (tools/re/stage_layout.py). See docs/re-notes.md.

export const TUTORIAL: StageLayout = {
  stage: 0,
  neutralColor: 0xc499ff,
  // One type of gate and nothing to buy.
  gateTypes: [24, 24],
  runwayType: 1,
  gasStationType: 12,
  backdrop: {
    sky: 60,
    horizon: 158,
    // In the order the script creates them, after the clouds. Between the two it also makes the
    // sea (0x13c3c) and, after the second, a flag at (245, 56) (0x1503c); neither is drawn yet.
    layers: [
      { resource: 'STAGES.TUTORIAL.BACKGROUND_TOP', position: { x: 0, y: 38 } },
      { resource: 'STAGES.TUTORIAL.BACKGROUND_DOWN', position: { x: 0, y: 158 }, scale: { x: 16, y: 17 } },
    ],
  },
  gateDecorations: [],
  stopSpotSurfaces: { normal: ['STOPSPOT'], vip: ['STOPSPOT_VIP'] },
  pontoons: false,
  // Its runway is created with flag 0, like the island's.
  runwayBalloonCorner: 1,
  // Every place here is given corner 0, the gates, the pump and the hangar included.
  placeBalloonCorner: 0,
  water: false,
  decorations: [],
  gates: [
    { letter: 'A', position: { x: 320, y: 133 }, requires: null, upgradedBy: -1 },
    { letter: 'B', position: { x: 400, y: 133 }, requires: null, upgradedBy: -1 },
  ],
  // The pump, the hangar and the luggage conveyor are only built on the third day.
  gasStation: { position: { x: 185, y: 125 }, minLevel: 3 },
  hangar: { position: { x: 45, y: 118 }, type: 13, minLevel: 3 },
  luggage: { position: { x: 464, y: 245 }, type: 0, minLevel: 3 },
  taxiNodes: [{ x: 4, y: 240 }],
  runways: [runway(1, 95, 205, 0)],
  stopSpots: [{ position: { x: 330, y: 290 }, requires: null, upgradedBy: -1 }],
  improvements: [],
  extraPlaneLicence: -1,
  bonuses: {},
};
