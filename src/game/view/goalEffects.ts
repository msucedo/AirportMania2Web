import { TITLE_ROOM, ULTRA_EFFECT, titleText } from './effectText';
import { Container, type Sprite } from 'pixi.js';
import { } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import { comboStar, comboStarPose, type Star } from './comboExplosion';

// What the level throws when the goal bar reaches a score tier (0x11f74): the tier's name, stars
// and sparks from along the bar. The hangar throws the same sparks from the plane it works on
// (0x474a6). See docs/re-notes.md.

export const GOAL_EFFECT_SURFACES = ['EFFECTS.BONUS_STAR', 'EFFECTS.SPARK'];
export const GOAL_EFFECT_FONT = 'FONTS.BLUE_STONE';

/** The names shown, by tier reached (table at `0x17971c`). */
export const TIER_NAMES = ['SCORE.FAILED_SCORE', 'SCORE.GOAL_SCORE', 'SCORE.EXPERT_SCORE', 'SCORE.MASTER_SCORE', 'SCORE.SUPREME_SCORE', 'SCORE.PERFECT_SCORE'];

const STAR_LIFE = 2;
const SPARK_LIFE = 1;
const TEXT_LIFE = 3;

/** Tier `tier` throws ten stars and thirteen sparks for each tier reached so far. */
export const tierBurst = (tier: number): { stars: number; sparks: number } => ({ stars: 10 * tier, sparks: 13 * tier });

/** A point along the goal bar: x 195 to 315, y 10 to 15. */
const onBar = (random: () => number): { x: number; y: number } => ({ x: 195 + 120 * random(), y: 10 + 5 * random() });

/** A star off the bar (0x12054, 0x69650): to either side at up to 60 px/s and up at up to 100. */
export function barStar(random: () => number): Star {
  const at = onBar(random);
  const vx = 120 * random() - 60;
  const vy = -100 * random();
  return comboStar(at.x, at.y, vx, vy, random);
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** A spark off the bar (0x120dc): to either side at up to 60 px/s and up at up to 70. */
export function barSpark(random: () => number): Spark {
  const at = onBar(random);
  return { ...at, vx: 120 * random() - 60, vy: -70 * random() };
}

/** A spark off the plane a hangar works on (0x474ce): from around 35 px over it, up at 100 px/s. */
export function hangarSpark(plane: { x: number; y: number }, random: () => number): Spark {
  const x = plane.x + 20 * random() - 10;
  const y = plane.y + 20 * random() - 35;
  return { x, y, vx: 100 * random() - 50, vy: -100 };
}

/** Seconds of the hangar's work to its next spark (0x4756a). */
export const hangarSparkWait = (random: () => number): number => 0.1 + 0.5 * random();

/** A spark `t` seconds on (0x69d24, 0x69d5c): it falls at 150 px/s² and goes over its second half second. */
export function sparkPose(spark: Spark, t: number): { x: number; y: number; alpha: number } {
  return { x: spark.x + spark.vx * t, y: spark.y + spark.vy * t + 75 * t * t, alpha: Math.max(0, Math.min(1, 2 * (SPARK_LIFE - t))) };
}

/**
 * The tier's name `age` seconds on (0x71b58): centred under the bar, sinking 20 px a second and
 * growing from 0.6; it comes in half a second and goes over its third second.
 */
export function tierTextPose(age: number): { x: number; y: number; scale: number; alpha: number } {
  return { x: 253, y: 16 + 20 * age, scale: 0.6 + 0.1 * age, alpha: Math.min(1, 2 * age) * (age > 2 ? Math.max(0, 3 - age) : 1) };
}

export class GoalEffects extends Container {
  private stars: { sprite: Sprite; star: Star; age: number }[] = [];
  private sparks: { sprite: Sprite; spark: Spark; age: number }[] = [];
  private texts: { text: Sprite; age: number }[] = [];

  constructor(
    private readonly textures: TextureStore,
    private readonly random: () => number = Math.random,
  ) {
    super();
    this.eventMode = 'none';
  }

  /** The bar reached `tier`, whose name is `name`. */
  reach(tier: number, name: string): void {
    // `FONTS.ULTRA`: this face at 20 and 0.8 of its width, with its effect. The picture keeps
    // some room over the text, which is taken off its place.
    const text = titleText(name, GOAL_EFFECT_FONT, 20, 0.8, ULTRA_EFFECT);
    text.anchor.set(0.5, 0);
    text.pivot.y = TITLE_ROOM;
    this.addChild(text);
    this.texts.push({ text, age: 0 });
    const burst = tierBurst(tier);
    for (let i = 0; i < burst.stars; i++) {
      const sprite = this.textures.sprite('EFFECTS.BONUS_STAR');
      this.addChild(sprite);
      this.stars.push({ sprite, star: barStar(this.random), age: 0 });
    }
    for (let i = 0; i < burst.sparks; i++) this.spark(barSpark(this.random));
    this.update(0);
  }

  spark(spark: Spark): void {
    const sprite = this.textures.sprite('EFFECTS.SPARK');
    this.addChild(sprite);
    const entry = { sprite, spark, age: 0 };
    this.sparks.push(entry);
    sprite.position.copyFrom(sparkPose(spark, 0));
  }

  update(dt: number): void {
    for (const entry of this.stars) {
      entry.age += dt;
      if (entry.age >= STAR_LIFE) {
        entry.sprite.destroy();
        continue;
      }
      const pose = comboStarPose(entry.star, entry.age);
      entry.sprite.position.set(pose.x, pose.y);
      entry.sprite.angle = pose.angle;
      entry.sprite.scale.set(pose.scale);
      entry.sprite.tint = pose.tint;
    }
    this.stars = this.stars.filter((entry) => entry.age < STAR_LIFE);
    for (const entry of this.sparks) {
      entry.age += dt;
      if (entry.age >= SPARK_LIFE) {
        entry.sprite.destroy();
        continue;
      }
      const pose = sparkPose(entry.spark, entry.age);
      entry.sprite.position.set(pose.x, pose.y);
      entry.sprite.alpha = pose.alpha;
    }
    this.sparks = this.sparks.filter((entry) => entry.age < SPARK_LIFE);
    for (const entry of this.texts) {
      entry.age += dt;
      if (entry.age >= TEXT_LIFE) {
        entry.text.destroy();
        continue;
      }
      const pose = tierTextPose(entry.age);
      entry.text.position.set(pose.x, pose.y);
      entry.text.scale.set(pose.scale);
      entry.text.alpha = pose.alpha;
    }
    this.texts = this.texts.filter((entry) => entry.age < TEXT_LIFE);
  }
}
