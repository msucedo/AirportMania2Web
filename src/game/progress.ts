// Player progress, kept in the browser. The rules are the original's (profile code around
// 0x821b8, 0x34170, 0x115a0 and 0x78a9c); the storage format is ours.

const KEY = 'am2web.progress.v2';
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
}

/** What the rules need to know about a stage. */
export interface StageRules {
  levels: number;
  perStar: number;
  clearBonus: number;
}

interface ProgressData {
  records: Record<string, LevelRecord>;
}

/** Stars a level is worth: none for the goal up to four for a perfect score (0x78442). */
export const starsOf = (tier: number): number => Math.max(0, tier - 1);

const key = (stage: number, level: number): string => `${stage}-${level}`;

export class Progress {
  private constructor(
    private data: ProgressData,
    private readonly stages: ReadonlyMap<number, StageRules>,
  ) {}

  static load(stages: ReadonlyMap<number, StageRules>): Progress {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return new Progress(JSON.parse(raw) as ProgressData, stages);
      const old = localStorage.getItem(OLD_KEY);
      if (old) {
        const progress = Progress.fromResults(stages, (JSON.parse(old) as { levels?: Record<string, { best: number; stars: number }> }).levels ?? {});
        progress.save();
        return progress;
      }
    } catch {
      // Storage unavailable or corrupt: start fresh for this session.
    }
    return new Progress({ records: {} }, stages);
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
  complete(stage: number, level: number, score: number, tier: number): boolean {
    const rules = this.stages.get(stage);
    if (!rules || tier < 1) return false;
    const current = this.ensure(stage, level);
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

  reset(): void {
    this.data = { records: {} };
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Ignore: progress simply will not persist.
    }
  }
}
