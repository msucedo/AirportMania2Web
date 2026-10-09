// Game rules recovered from the original binary. See docs/re-notes.md for addresses.
// Everything under PROVISIONAL has not been read from the binary yet and is a placeholder.

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
  TAKING_OFF: 11,
  /** In the air after the take-off run. */
  AIRBORNE: 12,
  LANDED: 13,
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
  emergencyDrainFactor: 2,

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
  landingSpeed: 250,
  /** A landing plane starts this far from the runway node. */
  landingApproachDistance: 750,
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

  /** Taxiing accelerates towards the next node, is capped, and brakes for the final target. */
  taxiAcceleration: 200,
  taxiMaxSpeed: 200,

  runwayHalfWidth: 190,
  runwayHalfHeight: 18,
} as const;

export const PROVISIONAL = {
  /** Stop spot click area, around its position. The original rectangle has not been read. */
  stopSpotClick: { x1: -34, y1: -20, x2: 34, y2: 20 },
  /** The router skips nodes another plane is using; the simulation does not track that yet. */
  taxiIgnoresNodeOccupancy: true,
  /** How far past the screen edge a flying plane goes before turning back. */
  flightTurnMargin: 60,
  /** Seconds after the last scheduled arrival before an empty airport ends the level. */
  endGrace: 2,
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
