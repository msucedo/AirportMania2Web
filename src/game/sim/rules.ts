// Game rules recovered from the original binary. See docs/re-notes.md for addresses.

/** Plane states, numbered as in the original (`plane+0x32c`). */
export const PlaneState = {
  FLYING: 0,
  LEAVING_ANGRY: 1,
  WAITING: 2,
  TAXIING: 3,
  LOADING: 4,
  UNLOADING: 5,
  IN_HANGAR: 6,
  FUELING: 7,
  /** Being repainted on a painting stop spot (0x6354). */
  PAINTING: 8,
  /** Being washed on a wash and go (0x67b8). */
  WASHING: 9,
  /** Taking its luggage on at the conveyor (0x6820). */
  LUGGAGE: 10,
  TAKING_OFF: 11,
  /** In the air after the take-off run. */
  AIRBORNE: 12,
  /** Landing, from the order to the stop on the runway (0x73c6); it costs no energy. */
  LANDING: 13,
} as const;
export type PlaneState = (typeof PlaneState)[keyof typeof PlaneState];

/** States in which a plane cannot be selected (mask 0x1822 in `Plane::isSelectable`). */
export const UNSELECTABLE_STATES: ReadonlySet<number> = new Set([1, 5, 11, 12]);

/**
 * Pending need codes (`plane+0x264`), chosen after unloading and after each service:
 * hangar service, fuel, luggage, then load at a gate, then take off. The codes are also the
 * indices of the need icons (`INDICATORS.ICONS.%d`) shown in the plane's thought bubble.
 */
export const Need = { LAND: 0, UNLOAD: 1, SERVICE: 2, GAS: 3, WASH: 4, LUGGAGE: 5, LOAD: 6, TAKE_OFF: 7 } as const;

export const RULES = {
  maxQueuedOrders: 8,

  initialEnergy: 1.3,
  maxEnergy: 1.2,
  minEnergy: -0.3,
  /** Energy granted on every gate arrival and on landing. */
  energyBoost: 0.25,
  /** Energy only drains while flying or waiting for orders. */
  drainingStates: new Set<number>([PlaneState.FLYING, PlaneState.WAITING]) as ReadonlySet<number>,
  specialPassengerDrainFactor: 2,

  /** Punctuality thresholds on the energy fraction. */
  lateBelow: 0.3,
  onTimeBelow: 0.6,

  /** Scores are rounded down to a multiple of this. */
  scoreStep: 5,
  maxComboMultiplier: 4,
  /** Plane colour value that never builds a gate colour combo. */
  neutralColor: 8,

  flightSpeed: 80,
  flightAltitude: 600,
  /** Ground-plane spawn points; the drawn y is `y - altitude`. */
  spawn: {
    RIGHT: { x: 540, y: 705, scale: 1.0 },
    LEFT: { x: -60, y: 680, scale: 0.8 },
  },
  /**
   * The holding pattern (state 0, 0x6f90). Planes fly right along the far lane and left along
   * the near one, turning between them at `rightTurn` and `leftTurn`: a turn takes `turnTime`
   * seconds and swings `speed / turnWidth` px beyond the turning point.
   */
  holding: { rightTurn: 380, leftTurn: 100, turnTime: 2, turnWidth: 1.5 },
  /** Stop spot touch area around its position (0x7921e). */
  stopSpotClick: { x1: -35, y1: -20, x2: 35, y2: 20 },
  landingSpeed: 250,
  /** A landing plane starts this far from the runway node. */
  landingApproachDistance: 750,
  /**
   * The landing (state 13, 0x7eb2). The plane first flies off the screen, accelerating at
   * `leaveAcceleration` and dipping for `dipTime` seconds, until it is `leaveMargin` beyond an
   * edge. It comes back `landingApproachDistance` from the runway node at `landingSpeed`,
   * `approachAltitude` up, and comes down over `glideDistance`; from there it brakes to stop on
   * the node. The scale grows to 1 at `scaleRate` per second on the way out.
   */
  landing: { leaveAcceleration: 150, dipTime: 1.5, dipFactor: 50, leaveMargin: 500, scaleRate: 0.2, approachAltitude: 200, glideDistance: 600, bounceSpeed: 10, bounceTime: 0.25, gearTime: 0.6 },
  /**
   * Nose-up angle of the body in degrees (`plane+0x2fc`). It starts the glide at `glide`, rises
   * at `flare` a second, and falls back to level at `settle` a second while braking; after
   * lift-off it is `climb` times the square of the seconds in the air.
   */
  pitch: { glide: -5, flare: 5, settle: 40, climb: 10 },
  /** Take-off run: constant acceleration from standstill, in px/s². */
  takeOffAcceleration: 200,
  /** Run length after which the plane leaves the ground. */
  liftOffDistance: 100,
  climbRate: 140,
  /** Seconds in the air before the plane counts as served. */
  airborneTime: 2,

  /**
   * Runway combo timers hold a value in 0..1. While active they charge at `charge` per normalised
   * second and switch off at 1; then they decay. Time is normalised by the runway's ComboTimeTotal.
   * A combo continues while the value is above 0.
   */
  combo: {
    charge: 15,
    takeOffDecay: 0.6,
    landingDecay: 0.4,
    /** Extra un-normalised step applied to the other kind's timer while an operation is incoming. */
    crossFactor: 6,
  },

  /**
   * Energy drain multiplier while parked on a stop spot (`spot+0x6c`). The constructor holds 0.5
   * and 0.25; which belongs to the plain spot and which to the VIP one is inferred.
   */
  stopSpotDrain: { normal: 0.5, vip: 0.25 },

  /**
   * Painting stop spot. It recharges for `recharge` seconds (the stage scripts pass 42 to
   * 0x145a8); the spray appears, changes the plane's colour after `colorAt` seconds and has gone
   * after `duration` (0x77a80). The plane then gains `energy` (0x67df8).
   */
  painting: { recharge: 42, colorAt: 4, duration: 5.5, energy: 0.4 },

  /**
   * Things that close a runway for a while: fog and ice. The schedule (0x102d8) leaves `margin`
   * seconds free at the end of the level and keeps two on one runway `apart` seconds from each
   * other. One that is due (0x1094c) waits for its runway to have been idle `idle` seconds, for
   * at most `patience`. It fades in and out at `fade` a second, and with its improvement a
   * machine comes `machineAt` seconds in. Per kind: the attempts made to place it, how long it
   * lasts, and how long the machine takes to end it (fog 0x3a41c and 0x19b78, ice 0x4b850 and
   * 0x2ad80).
   */
  /**
   * Hints (0x10890): once one of a kind has been shown, the next `quiet` occasions for it pass in
   * silence: the furthest stage the player has reached (profile `+0x14`, 0x108d6), kept between
   * `least` and `most`.
   */
  hints: { least: 3, most: 5 },
  hazards: { margin: 30, idle: 3, patience: 25, fade: 2, machineAt: 2 },
  fog: { tries: 30, apart: 30, time: 15, machineTime: 5 },
  ice: { tries: 20, apart: 40, time: 30, machineTime: 7 },
  /**
   * Sand (0x6f6dc): it takes `appear` seconds to come; `machineAt` seconds after it appeared the
   * brush comes if the anti-sand is owned, and the sand goes at `sweep` per second, freeing the
   * runway below `clearAt`. Without it the sand lies `time` seconds more and the runway is free
   * `settle` seconds later. The brush crosses the runway in `brushTime` seconds (0x1a230).
   */
  sand: { tries: 20, apart: 40, appear: 1, machineAt: 2, time: 15, settle: 1, sweep: 0.2, clearAt: 0.3, brushTime: 4 },

  /**
   * Wash and go (0x84d60, 0x852b0): a wash takes `time` seconds, the plane is clean with `rinse`
   * left, and at the end it gains `energy` and scores its WashingPoints.
   */
  wash: { time: 8, rinse: 6, energy: 0.4 },

  /**
   * Coffee and cake: the button recharges for 50 seconds (0x243d8) and gives 0.5 energy to every
   * plane on the ground that has not finished loading (0x107d4).
   */
  coffee: { recharge: 50, energy: 0.5 },
  /**
   * In-flight movies: the button recharges for 40 seconds (0x24634) and gives 0.6 energy to every
   * plane that has not landed yet (0x1080a).
   */
  movies: { recharge: 40, energy: 0.6 },

  /**
   * Seconds before the end of the level is considered: after the time runs out (longer when a
   * plane is on the ground) and after finding a plane that still holds the level (0x11864).
   */
  levelEnd: { afterTimeOver: 3, afterTimeOverLanded: 10, retry: 6, retryLanded: 10 },

  /**
   * Bonus events. Balloons (0x21a48, 0x21fc0): ten of them, one every 1 to 2 s, rise from y 350
   * at 100 px/s at a random x from 10 to 470 and can be popped within 30 px. The helicopter
   * (0x49518): crosses at 60 px/s times its speed, bobbing around y 200, and can be tapped within
   * 40 × 30 px; a tap adds 0.25 to its speed and a burst that fades. A coin (0x260d4) grows in a
   * quarter of a second, falls at 50 px/s (0x177d64) and pays on reaching y 290.
   */
  bonus: {
    balloons: { count: 10, startY: 350, rise: 100, minX: 10, spanX: 460, reach: 30, images: 3, minGap: 1, gapSpan: 1, goneY: -30 },
    helicopter: { pace: 60, leftEdge: -40, rightEdge: 520, y: 200, reachX: 40, reachY: 30, burst: 0.4, burstWeight: 8, faster: 0.25 },
    coin: { dropBelow: 20, grow: 4, fall: 50, payY: 290 },
  },

  /** Taxiing accelerates towards the next node, is capped, and brakes for the final target. */
  taxiAcceleration: 200,
  taxiMaxSpeed: 200,

  runwayHalfWidth: 190,
  runwayHalfHeight: 18,
} as const;

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** `floor(value / 5) * 5`, as done with integer division in the original. */
export function roundScore(value: number): number {
  return Math.trunc(Math.trunc(value) / RULES.scoreStep) * RULES.scoreStep;
}

export type Punctuality = 'EARLY' | 'ON_TIME' | 'LATE';

export function punctuality(energy: number): Punctuality {
  if (energy < RULES.lateBelow) return 'LATE';
  if (energy < RULES.onTimeBelow) return 'ON_TIME';
  return 'EARLY';
}
