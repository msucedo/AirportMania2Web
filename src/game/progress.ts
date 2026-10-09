// Player progress, kept in the browser. The original save format (users.dat / save%d.dat) has not
// been read; this is our own structure.

const KEY = 'am2web.progress.v1';

export interface LevelResult {
  best: number;
  /** Goals reached, 0 to 5. */
  stars: number;
}

export interface ProgressData {
  funds: number;
  improvements: number[];
  levels: Record<string, LevelResult>;
}

const empty = (): ProgressData => ({ funds: 0, improvements: [], levels: {} });

export class Progress {
  private constructor(private data: ProgressData) {}

  static load(): Progress {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ProgressData>;
        return new Progress({ ...empty(), ...parsed });
      }
    } catch {
      // Storage unavailable or corrupt: start fresh for this session.
    }
    return new Progress(empty());
  }

  get funds(): number {
    return this.data.funds;
  }

  get improvements(): ReadonlySet<number> {
    return new Set(this.data.improvements);
  }

  owns(id: number): boolean {
    return this.data.improvements.includes(id);
  }

  result(stage: number, level: number): LevelResult {
    return this.data.levels[`${stage}-${level}`] ?? { best: 0, stars: 0 };
  }

  /** A level opens once the previous one has been passed. */
  unlocked(stage: number, level: number): boolean {
    return level <= 1 || this.result(stage, level - 1).stars > 0;
  }

  /** A stage opens once every level of the previous stage has been passed (our rule). */
  stageUnlocked(stage: number, previousLevels: number): boolean {
    if (stage <= 1) return true;
    for (let level = 1; level <= previousLevels; level++) if (this.result(stage - 1, level).stars === 0) return false;
    return true;
  }

  /** Improvements are bought per stage; ids repeat between stages. */
  static improvementKey(stage: number, id: number): number {
    return stage * 1000 + id;
  }

  /**
   * Stores a finished level and pays for newly earned stars.
   * Paying `perStar` for each new star is an assumption based on the area's `PerStarAmount`.
   */
  record(stage: number, level: number, score: number, stars: number, perStar: number): { newStars: number; earned: number } {
    const previous = this.result(stage, level);
    const newStars = Math.max(0, stars - previous.stars);
    const earned = newStars * perStar;
    this.data.levels[`${stage}-${level}`] = { best: Math.max(previous.best, score), stars: Math.max(previous.stars, stars) };
    this.data.funds += earned;
    this.save();
    return { newStars, earned };
  }

  buy(id: number, price: number): boolean {
    if (this.owns(id) || this.data.funds < price) return false;
    this.data.funds -= price;
    this.data.improvements.push(id);
    this.save();
    return true;
  }

  reset(): void {
    this.data = empty();
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
