// The awards' rules: which there are, what each counts and how an event of the game earns one
// (0x1b3f8, 0x1b6cc, 0x1c404 and the events posted through 0x9db0). See docs/re-notes.md.

/** Award ids, as the game's events name them. Ids 1 to 20 are the plane of that type. */
export const AWARD = {
  DIPLOMA: 0,
  BABY_DELIVERY_ASSISTANCE: 21,
  TRANSPLANT_EMERGENCY: 22,
  PRESIDENTIAL_DISTINGUISHED_SERVICE: 23,
  SWITCH_A_ROO: 24,
  SUPER_RUNWAY_COORDINATOR: 25,
  SMILING_HAPPY_PEOPLE: 26,
  FRIENDLY_SKIES: 27,
  MASTER_MATCHER: 28,
  ROCKIN_REPAIR_SHOP: 29,
  EXCEPTIONAL_SERVICE: 30,
  PERFECT_SERVICE: 31,
  BONUS_SEIZING: 32,
  WASHER_DASHER: 33,
  GAME_FINISHED: 34,
  MILLION_POINTS: 35,
  HEAVENLY_ASSISTANCE: 36,
  PERFECT_PLAY: 37,
  GAME_MASTER: 38,
  GOLD_MASTER: 39,
  STINGY_MANIAC: 40,
  FLYING_TIME: 41,
} as const;

export const FIRST_MEDAL = 21;
export const LAST_MEDAL = 33;

/**
 * How an award takes its events:
 * 0 once only; 1 once per stage; 2 once per level of a stage; 3 whenever the value is beaten.
 */
export type AwardKind = 0 | 1 | 2 | 3;

const PER_LEVEL = new Set<number>([21, 22, 23, 26, 28, 32]);
const BEST_VALUE = new Set<number>([24, 25, 29, 33]);

export function awardKind(id: number): AwardKind {
  if (id === AWARD.STINGY_MANIAC) return 1;
  if (id === AWARD.FLYING_TIME) return 3;
  if (id < FIRST_MEDAL || id > LAST_MEDAL) return 0;
  return PER_LEVEL.has(id) ? 2 : BEST_VALUE.has(id) ? 3 : 1;
}

/** What a medal must count to turn silver and gold; bronze is having it at all. */
export const MEDAL_THRESHOLDS: Readonly<Record<number, readonly [number, number]>> = {
  21: [3, 6],
  22: [3, 7],
  23: [2, 3],
  24: [4, 6],
  25: [10, 15],
  26: [20, 48],
  27: [4, 9],
  28: [8, 16],
  29: [100, 250],
  30: [4, 9],
  31: [4, 9],
  32: [8, 24],
  33: [50, 100],
};

/** What the profile keeps for an award: whether it is had, a value, and where it was earned. */
export interface AwardRecord {
  earned: boolean;
  value: number;
  /** `level-stage` pairs; the level is 0 for awards given once per stage. */
  pairs: string[];
}

export type AwardsData = Record<number, AwardRecord>;

const blank = (): AwardRecord => ({ earned: false, value: 0, pairs: [] });

/**
 * An event `{id, value}` of the game reaching the award with that id (0x1b3f8), in a level of a
 * stage. Returns true when it earned something, which the game then announces.
 */
export function takeAward(data: AwardsData, id: number, value: number, stage: number, level: number): boolean {
  const record = (data[id] ??= blank());
  switch (awardKind(id)) {
    case 0:
      if (record.earned) return false;
      break;
    case 1:
    case 2: {
      const pair = `${awardKind(id) === 1 ? 0 : level}-${stage}`;
      if (record.pairs.includes(pair)) return false;
      record.pairs.push(pair);
      break;
    }
    case 3:
      if (record.earned && record.value >= value) return false;
      record.pairs.push(`${level}-${stage}`);
      break;
  }
  record.earned = true;
  record.value = value;
  return true;
}

/** What an award counts (0x1b6cc): the places it was earned at, or its value for the fourth kind. */
export function awardCount(data: AwardsData, id: number): number {
  const record = data[id];
  if (!record) return 0;
  const kind = awardKind(id);
  return kind === 3 ? record.value : kind === 0 ? 0 : record.pairs.length;
}

/** A medal's material (0x1c404): −1 not earned, 0 bronze, 1 silver, 2 gold. */
export function medalLevel(data: AwardsData, id: number): -1 | 0 | 1 | 2 {
  if (!data[id]?.earned) return -1;
  const [silver, gold] = MEDAL_THRESHOLDS[id]!;
  const count = awardCount(data, id);
  return count >= gold ? 2 : count >= silver ? 1 : 0;
}

/**
 * The awards that follow from others (0x114e4): Gold Master when every medal is gold, and
 * Perfect Play when Perfect Service has been earned in every stage.
 */
export function awardsThatFollow(data: AwardsData, stages: number): number[] {
  const follow: number[] = [];
  let allGold = true;
  for (let id = FIRST_MEDAL; id <= LAST_MEDAL; id++) allGold &&= medalLevel(data, id) === 2;
  if (allGold) follow.push(AWARD.GOLD_MASTER);
  if ((data[AWARD.PERFECT_SERVICE]?.pairs.length ?? 0) === stages) follow.push(AWARD.PERFECT_PLAY);
  return follow;
}

/** The counts at which the repairs and the washes done over all games post their event (0x671e, 0x67fe). */
export const COUNTED = {
  repairs: { award: AWARD.ROCKIN_REPAIR_SHOP, at: [50, 100, 250] },
  washes: { award: AWARD.WASHER_DASHER, at: [25, 50, 100] },
} as const;

/** What the end of a passed level looks at (0x11654). */
export interface LevelFacts {
  planes: number;
  lost: number;
  earlyArrivals: number;
  earlyDepartures: number;
  /** Each gate's colour combo as the level ends. */
  gateCombos: readonly number[];
}

/** What is kept of each level of a stage, for the awards given for a whole stage. */
export interface LevelStanding {
  /** 0 not passed, 1 goal … 5 perfect. */
  tier: number;
  /** Fewest planes lost in any play of it. */
  lost: number;
  improvements: number;
}

/**
 * The events the end of a passed level posts (0x11a30–0x11c86), in order. `levels` are the
 * stage's, this one included; the awards for a whole stage are looked at once it has all been
 * played.
 */
export function levelEndEvents(facts: LevelFacts, at: { stage: number; level: number; stages: number }, levels: readonly LevelStanding[], data: AwardsData): number[] {
  const events: number[] = [];
  if (facts.gateCombos.every((combo) => combo === 4)) events.push(AWARD.MASTER_MATCHER);
  if (facts.lost === 0 && facts.planes === facts.earlyArrivals && facts.planes === facts.earlyDepartures) events.push(AWARD.SMILING_HAPPY_PEOPLE);
  const last = at.level === levels.length;
  if (last && at.stage === at.stages) events.push(AWARD.GAME_FINISHED);
  if (last || levels.every((level) => level.tier > 0)) {
    if (levels.every((level) => level.tier >= 4)) events.push(AWARD.EXCEPTIONAL_SERVICE);
    if (levels.every((level) => level.tier >= 5)) events.push(AWARD.PERFECT_SERVICE);
    if (levels.every((level) => level.lost === 0)) events.push(AWARD.FRIENDLY_SKIES);
    if (levels.every((level) => level.improvements === 0)) events.push(AWARD.STINGY_MANIAC);
  }
  // With the game finished: Exceptional Service in every stage. The events above are taken
  // before this is looked at, so the stage just finished counts.
  const finished = data[AWARD.GAME_FINISHED]?.earned || events.includes(AWARD.GAME_FINISHED);
  if (finished) {
    const exceptional = new Set(data[AWARD.EXCEPTIONAL_SERVICE]?.pairs ?? []);
    if (events.includes(AWARD.EXCEPTIONAL_SERVICE)) exceptional.add(`0-${at.stage}`);
    let all = true;
    for (let stage = 1; stage <= at.stages; stage++) all &&= exceptional.has(`0-${stage}`);
    if (all) events.push(AWARD.HEAVENLY_ASSISTANCE);
  }
  return events;
}

/** The sound an award is announced with (0x1b70c). */
export function awardSound(id: number): string {
  if (id >= 1 && id <= 20) return 'SOUNDS.AWARD_NEW_PLANE';
  switch (id) {
    case AWARD.BABY_DELIVERY_ASSISTANCE:
      return 'SOUNDS.AWARD_BABY_CRY';
    case AWARD.TRANSPLANT_EMERGENCY:
      return 'SOUNDS.AWARD_EMERGENCY_SIREN';
    case AWARD.PRESIDENTIAL_DISTINGUISHED_SERVICE:
      return 'SOUNDS.AWARD_PRESIDENT_MARCH';
    case AWARD.SWITCH_A_ROO:
      return 'SOUNDS.AWARD_SWITCH_A_ROO';
    case AWARD.SUPER_RUNWAY_COORDINATOR:
      return 'SOUNDS.AWARD_SUPER_RUNWAY_COORDINATOR';
    case AWARD.GAME_FINISHED:
      return 'SOUNDS.AWARD_FINISH_ALL_LEVELS';
    default:
      return 'SOUNDS.AWARD_GENERIC';
  }
}

const NAMES: Readonly<Record<number, string>> = Object.fromEntries(Object.entries(AWARD).map(([name, id]) => [id, name]));

/** Prefix of an award's texts: `.NAME`, `.EARN`, `.PRE_DESCRIPTION`, `.DESCRIPTION`. */
export function awardText(id: number): string {
  if (id >= 1 && id <= 20) return `AWARDS.PLANE_${id}`;
  return `AWARDS.${NAMES[id] ?? 'DIPLOMA'}`;
}
