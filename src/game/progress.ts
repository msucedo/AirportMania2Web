// Player progress, kept in the browser. The rules are the original's (profile code around
// 0x821b8, 0x34170, 0x115a0 and 0x78a9c); the storage format is ours.

import { AWARD, COUNTED, awardsThatFollow, levelEndEvents, takeAward, type AwardsData, type LevelFacts, type LevelStanding } from './awards';

export const PROGRESS_KEY = 'am2web.progress.v2';
const OLD_KEY = 'am2web.progress.v1';

/**
 * What the game keeps for one level (0x821b8). Money is the score: the funds a level starts with
 * are those of the level before plus its best score, and each level has its own set of
 * improvements, copied from the level before when it is first reached.
 */
export interface LevelRecord {
  best: number;
  /** 0 not passed, 1 goal … 5 perfect. */
  tier: number;
  funds: number;
  improvements: number[];
  /** Fewest planes lost in any play of it, for the awards; unknown for levels played before they were kept. */
  lost?: number;
}

/** What the rules need to know about a stage. */
export interface StageRules {
  levels: number;
  perStar: number;
  clearBonus: number;
}

export interface ProgressData {
  records: Record<string, LevelRecord>;
  awards?: AwardsData;
  /** Repairs and washes done over all games. */
  counts?: { repairs: number; washes: number };
  /** Set once the game has been begun, with the tutorial or past it (profile `+0x14`). */
  started?: boolean;
  /** How many of the game's tips have been shown at the start of a level (profile `+0x30`). */
  tips?: number;
  /** The player's difficulty (profile `+0x48`); 1 for a new player. */
  difficulty?: number;
  /** Where the map was left (profile `+0x28`, `+0x2c`). */
  mapScroll?: { x: number; y: number };
}

/**
 * The player's difficulty after a level ended at `tier`, 0 for one not passed (0x11ce6): three
 * quarters of what it was and an eighth of the tier, kept from 0.7 to 1.1. It scales the level's
 * clock and the planes' energy drain, so the game eases off after poor levels and tightens
 * after good ones.
 */
export const difficultyAfter = (difficulty: number, tier: number): number => {
  const next = 0.75 * difficulty + 0.25 * (0.5 * tier);
  return next < 0.7 ? 0.7 : Math.min(1.1, next);
};

/** Stars a level is worth: none for the goal up to four for a perfect score (0x78442). */
export const starsOf = (tier: number): number => Math.max(0, tier - 1);

const key = (stage: number, level: number): string => `${stage}-${level}`;

export class Progress {
  private constructor(
    private data: ProgressData,
    private readonly stages: ReadonlyMap<number, StageRules>,
  ) {}

  /** Where it is saved: the current user's place (see users.ts). */
  private key = PROGRESS_KEY;

  static load(stages: ReadonlyMap<number, StageRules>, key = PROGRESS_KEY): Progress {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const progress = Progress.restore(JSON.parse(raw) as ProgressData, stages);
        progress.key = key;
        progress.save();
        return progress;
      }
      const old = key === PROGRESS_KEY ? localStorage.getItem(OLD_KEY) : null;
      if (old) {
        const progress = Progress.fromResults(stages, (JSON.parse(old) as { levels?: Record<string, { best: number; stars: number }> }).levels ?? {});
        progress.save();
        return progress;
      }
    } catch {
      // Storage unavailable or corrupt: start fresh for this session.
    }
    const progress = new Progress({ records: {} }, stages);
    progress.key = key;
    return progress;
  }

  /**
   * A save as it was stored, brought up to the stages there are now. A stage is opened at the
   * moment the one before is cleared, so a stage cleared while the next did not exist yet left
   * it shut for good: here every cleared stage opens the next if it is still shut.
   */
  static restore(data: ProgressData, stages: ReadonlyMap<number, StageRules>): Progress {
    const progress = new Progress(data, stages);
    for (const [stage, rules] of [...stages].sort((a, b) => a[0] - b[0])) {
      if (progress.record(stage, rules.levels).tier > 0) progress.openNextStage(stage);
    }
    return progress;
  }

  /** Rebuilds a save from bare results (the first save format) by replaying them through the rules. */
  static fromResults(stages: ReadonlyMap<number, StageRules>, results: Record<string, { best: number; stars: number }>): Progress {
    const progress = new Progress({ records: {} }, stages);
    for (const [stage, rules] of [...stages].sort((a, b) => a[0] - b[0])) {
      for (let level = 1; level <= rules.levels; level++) {
        const result = results[key(stage, level)];
        if (!result || result.stars < 1 || !progress.unlocked(stage, level)) break;
        progress.complete(stage, level, result.best, result.stars);
      }
    }
    return progress;
  }

  private stored(stage: number, level: number): LevelRecord | undefined {
    return this.data.records[key(stage, level)];
  }

  /** Where the map was left (profile `+0x28`, `+0x2c`): its top left corner for a new player. */
  get mapScroll(): { x: number; y: number } {
    return this.data.mapScroll ?? { x: 0, y: 0 };
  }

  set mapScroll(at: { x: number; y: number }) {
    this.data.mapScroll = { x: at.x, y: at.y };
    this.save();
  }

  /** The player's difficulty (profile `+0x48`). */
  get difficulty(): number {
    return this.data.difficulty ?? 1;
  }

  /** Moves the difficulty for a level ended at `tier` (0x11ce6), and keeps it. */
  settleDifficulty(tier: number): void {
    this.data.difficulty = difficultyAfter(this.difficulty, tier);
    this.save();
  }

  /** The record of a level, without creating it. */
  record(stage: number, level: number): Readonly<LevelRecord> {
    return this.stored(stage, level) ?? { best: 0, tier: 0, funds: 0, improvements: [] };
  }

  result(stage: number, level: number): { best: number; stars: number } {
    const record = this.record(stage, level);
    return { best: record.best, stars: record.tier };
  }

  funds(stage: number, level: number): number {
    return this.record(stage, level).funds;
  }

  improvements(stage: number, level: number): ReadonlySet<number> {
    return new Set(this.record(stage, level).improvements);
  }

  /** A stage opens when the one before is cleared; the first is always open. */
  stageUnlocked(stage: number): boolean {
    const first = Math.min(...this.stages.keys());
    return stage === first || this.stored(stage, 1) !== undefined;
  }

  /** The furthest stage the player has reached (profile `+0x14`). */
  get stageReached(): number {
    return Math.max(...[...this.stages.keys()].filter((stage) => this.stageUnlocked(stage)));
  }

  /** A level opens once the previous one has been passed. */
  unlocked(stage: number, level: number): boolean {
    if (!this.stageUnlocked(stage)) return false;
    return level <= 1 || this.record(stage, level - 1).tier > 0;
  }

  private ensure(stage: number, level: number): LevelRecord {
    return (this.data.records[key(stage, level)] ??= { best: 0, tier: 0, funds: 0, improvements: [] });
  }

  /**
   * A finished level (0x34170 and 0x119c2). Passing it for the first time opens the next level
   * with this one's improvements and its funds plus the score. Beating the best score later adds
   * the difference to the levels already opened after it. Reaching a better tier pays the stars
   * gained, at this stage's rate, into every opened level of the next stage (0x115a0).
   * Returns true when this pass cleared the stage for the first time.
   */
  complete(stage: number, level: number, score: number, tier: number, lost = 0): boolean {
    const rules = this.stages.get(stage);
    if (!rules || tier < 1) return false;
    const current = this.ensure(stage, level);
    current.lost = Math.min(current.lost ?? lost, lost);
    const firstPass = current.tier === 0;
    const gained = Math.max(0, score - current.best);
    current.best = Math.max(current.best, score);

    if (firstPass && level < rules.levels) {
      const next = this.ensure(stage, level + 1);
      next.improvements = [...current.improvements];
      next.funds = current.funds + current.best;
    } else if (gained > 0) {
      for (let later = level + 1; later <= rules.levels; later++) {
        const record = this.stored(stage, later);
        if (record) record.funds += gained;
      }
    }

    const newStars = Math.max(tier, 1) - Math.max(current.tier, 1);
    current.tier = Math.max(current.tier, tier);
    const cleared = firstPass && level === rules.levels;
    if (cleared) this.openNextStage(stage);
    else if (newStars > 0) {
      const following = this.stages.get(stage + 1);
      for (let l = 1; following && l <= following.levels; l++) {
        const record = this.stored(stage + 1, l);
        if (record) record.funds += newStars * rules.perStar;
      }
    }
    this.save();
    return cleared;
  }

  /** What the user has of each award. */
  get awards(): Readonly<AwardsData> {
    return this.data.awards ?? {};
  }

  /**
   * An event of the game for the awards, in a level of a stage. Returns the awards it earned,
   * those that follow from them included. In the tutorial only the diploma can be earned.
   */
  award(id: number, value: number, stage: number, level: number): number[] {
    if (stage === 0 && id !== AWARD.DIPLOMA) return [];
    const data = (this.data.awards ??= {});
    if (!takeAward(data, id, value, stage, level)) return [];
    const earned = [id];
    for (const next of awardsThatFollow(data, Math.max(...this.stages.keys()))) if (takeAward(data, next, 0, stage, level)) earned.push(next);
    this.save();
    return earned;
  }

  /** A repair or a wash done: counted over all games, with an event for its medal at the counts read. */
  count(what: 'repairs' | 'washes', stage: number, level: number): number[] {
    const counts = (this.data.counts ??= { repairs: 0, washes: 0 });
    const count = ++counts[what];
    this.save();
    return (COUNTED[what].at as readonly number[]).includes(count) ? this.award(COUNTED[what].award, count, stage, level) : [];
  }

  /** The awards the end of a passed level gives (0x11654). Call it after `complete`. */
  levelEnd(stage: number, level: number, facts: LevelFacts): number[] {
    const rules = this.stages.get(stage);
    if (!rules) return [];
    const levels: LevelStanding[] = [];
    for (let l = 1; l <= rules.levels; l++) {
      const record = this.record(stage, l);
      levels.push({ tier: record.tier, lost: record.lost ?? 1, improvements: record.improvements.length });
    }
    const stages = Math.max(...this.stages.keys());
    const earned: number[] = [];
    for (const id of levelEndEvents(facts, { stage, level, stages }, levels, this.awards)) earned.push(...this.award(id, 0, stage, level));
    return earned;
  }

  /** Stars earned over a whole stage. */
  stageStars(stage: number): number {
    let stars = 0;
    for (let level = 1; level <= (this.stages.get(stage)?.levels ?? 0); level++) stars += starsOf(this.record(stage, level).tier);
    return stars;
  }

  /** What clearing a stage pays into the next one: its stars at the stage's rate plus the bonus (0x78406). */
  stageReward(stage: number): number {
    const rules = this.stages.get(stage);
    return rules ? this.stageStars(stage) * rules.perStar + rules.clearBonus : 0;
  }

  /** What a stage pays for each star and for clearing it. */
  stageRates(stage: number): { perStar: number; clearBonus: number } {
    const rules = this.stages.get(stage);
    return { perStar: rules?.perStar ?? 0, clearBonus: rules?.clearBonus ?? 0 };
  }

  /** Opens the next stage with no improvements and the stage's reward as funds (0x78a9c). */
  private openNextStage(stage: number): void {
    if (!this.stages.has(stage + 1) || this.stored(stage + 1, 1)) return;
    this.ensure(stage + 1, 1).funds = this.stageReward(stage);
  }

  /** Buys an improvement for one level with that level's funds (0x4c020). */
  buy(stage: number, level: number, id: number, price: number): boolean {
    const record = this.ensure(stage, level);
    if (record.improvements.includes(id) || record.funds < price) return false;
    record.funds -= price;
    record.improvements.push(id);
    this.save();
    return true;
  }

  /** Sells it back for what it cost (0x4bf08). */
  sell(stage: number, level: number, id: number, price: number): boolean {
    const record = this.stored(stage, level);
    if (!record || !record.improvements.includes(id)) return false;
    record.improvements = record.improvements.filter((owned) => owned !== id);
    record.funds += price;
    this.save();
    return true;
  }

  /** Whether a level starting now would show a tip (0x10630). */
  tipDue(count: number): boolean {
    return (this.data.tips ?? 0) < count;
  }

  /** The tip the next level starts with, or null once all `count` have been shown (0xf514). Showing it counts it. */
  nextTip(count: number): number | null {
    const shown = this.data.tips ?? 0;
    if (shown >= count) return null;
    this.data.tips = shown + 1;
    this.save();
    return shown;
  }

  /** Nothing played yet: the game then asks about the tutorial before going to the map (0x5d060). */
  get fresh(): boolean {
    return this.data.started !== true && Object.keys(this.data.records).length === 0;
  }

  /** The answer to that question, either way, begins the game (0x7ea58). */
  begin(): void {
    this.data.started = true;
    this.save();
  }

  reset(): void {
    this.data = { records: {} };
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch {
      // Ignore: progress simply will not persist.
    }
  }
}
