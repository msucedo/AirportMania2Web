import { ULTRA_EFFECT, titleText } from './effectText';
import { BORDER, SCORE_FILL, SCORE_NEGATIVE_FILL } from './faces';
import { Container, Graphics, Text, TilingSprite, type Sprite, type FillInput } from 'pixi.js';
import type { LevelGoals } from '../../data/levels';
import type { Strings } from '../../data/strings';
import type { AudioPlayer } from '../../engine/audio';
import { fontFamily } from '../../engine/fonts';
import type { TextureStore } from '../../engine/textures';
import type { Simulation } from '../sim/simulation';
import { dialogButton, dialogFrame } from './dialog';
import { SCORE_FONT } from './floatingText';

export const FINAL_REPORT_SURFACES = [
  'GUI.FINAL_REPORT.STAR',
  'GUI.FINAL_REPORT.BACK_STAR',
  'GUI.FINAL_REPORT.SPIRAL',
  'GUI.FINAL_REPORT.TICK_GREEN',
  'GUI.FINAL_REPORT.TICK_YELLOW',
  'GUI.FINAL_REPORT.TICK_RED',
];
/** `FONTS.ULTRA` and `FONTS.WHITE` are these faces with a colour effect; the score uses `FONTS.SCORE`. */
const TITLE_FONT = 'FONTS.BLUE_STONE';
const ROW_FONT = 'FONTS.TEEN_BD';
export const FINAL_REPORT_FONTS = [TITLE_FONT, ROW_FONT, SCORE_FONT];

export type Tier = 'FAIL' | 'GOAL' | 'EXPERT' | 'MASTER' | 'SUPREME' | 'PERFECT';
const TIERS: Exclude<Tier, 'FAIL'>[] = ['GOAL', 'EXPERT', 'MASTER', 'SUPREME', 'PERFECT'];

export function tierFor(score: number, goals: LevelGoals): Tier {
  const values: Record<Exclude<Tier, 'FAIL'>, number> = { GOAL: goals.goal, EXPERT: goals.expert, MASTER: goals.master, SUPREME: goals.supreme, PERFECT: goals.perfect };
  let reached: Tier = 'FAIL';
  for (const tier of TIERS) if (score >= values[tier]) reached = tier;
  return reached;
}

/** Where the stars go for one to four of them, from the dialog's centre (0x32a80). */
const STAR_PLACES: readonly (readonly (readonly [number, number])[])[] = [
  [],
  [[124, -69]],
  [[111, -74], [137, -65]],
  [[124, -61], [105, -80], [143, -80]],
  [[124, -61], [98, -74], [150, -74], [124, -87]],
];

const BOX = { width: 400, height: 250 };
const PUNCTUALITY = [
  { key: 'EARLY', text: 'PLANES_EARLY', tick: 'TICK_GREEN', y: 0 },
  { key: 'ON_TIME', text: 'PLANES_ON_TIME', tick: 'TICK_YELLOW', y: 20 },
  { key: 'LATE', text: 'PLANES_LATE', tick: 'TICK_RED', y: 40 },
] as const;

/** Share of the level's planes, as the whole percentage the bars grow to (0x33040). */
export function reportPercent(count: number, total: number): number {
  return total > 0 ? Math.floor((count / total) * 100) : 0;
}

/**
 * The end-of-level report as the original builds it (dialog `0x3241c`, steps in `0x328d4`): a
 * 400×250 box in which the result, the stars and each row appear in turn, half a unit of its
 * clock apart; the clock runs at double speed and four times faster while the screen is held.
 * The punctuality rows grow a bar of ticks to the share of planes for arrivals and departures.
 * Last comes the score and, a full unit later, the Continue button. Coordinates are from the
 * dialog's centre. The star's pop, the turning backdrop's speed and the font colour effects are
 * approximations.
 */
export class FinalReport extends Container {
  onContinue: (() => void) | null = null;

  private readonly panel: Container;
  private readonly backdrop: Sprite;
  private readonly steps: (() => boolean | void)[] = [];
  private clock = 0;
  private held = false;
  private growing: { bar: TilingSprite; target: number; leftward: boolean }[] = [];
  private pops: { sprite: Sprite; age: number }[] = [];

  constructor(
    private readonly textures: TextureStore,
    private readonly audio: AudioPlayer,
    strings: Strings,
    sim: Simulation,
  ) {
    super();
    const tier = tierFor(sim.score, sim.goals);
    const { overlay, panel } = dialogFrame(textures, BOX.width, BOX.height);
    // Everything below is placed from the centre of the box.
    this.panel = new Container();
    this.panel.position.set(BOX.width / 2, BOX.height / 2);
    panel.addChild(this.panel);
    this.addChild(overlay);
    // Holding anywhere hurries the report. Listened for on the window: the frame's artwork lies
    // over the dialog's own touch area and takes the presses meant for it.
    const press = (): void => void (this.held = true);
    const release = (): void => void (this.held = false);
    window.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    this.on('destroyed', () => {
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    });

    this.backdrop = textures.sprite(tier === 'FAIL' ? 'GUI.FINAL_REPORT.SPIRAL' : 'GUI.FINAL_REPORT.BACK_STAR');
    this.backdrop.scale.set(4);
    this.backdrop.alpha = 0.18;
    this.panel.addChild(this.backdrop);
    const lines = new Graphics();
    lines.rect(-190, -40.5, 380, 1).rect(-190, 53.5, 380, 1).rect(41.5, -78, 1, 36).rect(41.5, -31, 1, 82).fill({ color: 0xffffff, alpha: 0.5 });
    this.panel.addChild(lines);

    const white = fontFamily(ROW_FONT);
    const row = (text: string, x: number, y: number, align: 0 | 2, family = white, size = 11, fill: FillInput = 0xffffff): Text => {
      const node = new Text({ text, style: { fontFamily: family, fontSize: size, fill, stroke: BORDER } });
      // Rows are placed by their baseline: each sits just above the rule drawn under it.
      node.anchor.set(align === 2 ? 1 : 0, 0.85);
      node.position.set(x, y);
      this.panel.addChild(node);
      return node;
    };
    const total = sim.planes.length;

    this.steps.push(() => {
      const title = titleText(strings.t(tier === 'FAIL' ? 'SCORE.FAILED_SCORE' : `SCORE.${tier}_SCORE`), TITLE_FONT, 20, 0.8, ULTRA_EFFECT);
      title.anchor.set(0.5);
      title.position.set(0, -97);
      this.panel.addChild(title);
    });
    this.steps.push(() => {
      // One star for an expert score up to four for a perfect one (0x32a76).
      const stars = Math.max(0, ['FAIL', 'GOAL', 'EXPERT', 'MASTER', 'SUPREME', 'PERFECT'].indexOf(tier) - 1);
      for (const [x, y] of STAR_PLACES[stars] ?? []) {
        const star = textures.sprite('GUI.FINAL_REPORT.STAR');
        star.position.set(x, y);
        this.panel.addChild(star);
        this.pops.push({ sprite: star, age: 0 });
      }
    });
    this.steps.push(() => {
      row(strings.t('FINAL_REPORT_DIALOG.PLANES_SERVED'), -190, -65, 0);
      row(String(sim.planesServed), 34, -65, 2);
    });
    this.steps.push(() => {
      row(strings.t('FINAL_REPORT_DIALOG.PLANES_LOST'), -190, -45, 0);
      row(String(sim.planesLost), 34, -45, 2);
    });
    this.steps.push(() => {
      row(strings.t('FINAL_REPORT_DIALOG.ARRIVALS'), 12, -20, 2);
      row(strings.t('FINAL_REPORT_DIALOG.DEPARTURES'), 72, -20, 0);
    });
    for (const line of PUNCTUALITY) {
      this.steps.push(() => {
        row(strings.t(`FINAL_REPORT_DIALOG.${line.text}`), -190, line.y, 0);
        row(String(sim.counts.unload[line.key]), 34, line.y, 2);
        row(String(sim.counts.takeOff[line.key]), 50, line.y, 0);
        this.bar(line.tick, 12, line.y, reportPercent(sim.counts.unload[line.key], total), true);
        this.bar(line.tick, 72, line.y, reportPercent(sim.counts.takeOff[line.key], total), false);
      });
      // The next row waits for both bars.
      this.steps.push(() => this.growing.length === 0);
    }
    this.steps.push(() => {
      row(strings.t('FINAL_REPORT_DIALOG.LEVEL_SCORE'), -190, 82, 0);
      row(String(sim.score), 190, 82, 2, fontFamily(SCORE_FONT), 14, sim.score < 0 ? SCORE_NEGATIVE_FILL : SCORE_FILL);
    });
    // The button comes a full unit after the score.
    this.steps.push(() => this.clock >= 1);
    this.steps.push(() => {
      dialogButton(textures, audio, this.panel, { x: 0, y: 110, width: 200, height: 34 }, strings.t('FINAL_REPORT_DIALOG.CONTINUE'), fontFamily(SCORE_FONT), () => this.onContinue?.());
    });
  }

  /** A bar of ticks that grows from the centre column: leftwards for arrivals, rightwards for departures. */
  private bar(tick: string, x: number, y: number, target: number, leftward: boolean): void {
    if (target <= 0) return;
    const bar = new TilingSprite({ texture: this.textures.texture(`GUI.FINAL_REPORT.${tick}`), width: 0, height: 18 });
    bar.position.set(x, y - 15);
    this.panel.addChild(bar);
    this.growing.push({ bar, target, leftward });
  }

  update(seconds: number): void {
    this.backdrop.rotation += seconds * 0.4;
    for (const pop of this.pops) {
      pop.age += seconds;
      const t = Math.min(1, pop.age / 0.25);
      pop.sprite.scale.set(t < 1 ? 1.6 - 0.6 * t : 1);
      pop.sprite.alpha = t;
    }
    this.clock += seconds * (this.held ? 8 : 2);
    // Bars grow 20 px per unit of the clock, with a tick of sound as they go (0x33086).
    for (const growing of this.growing) {
      const width = Math.min(growing.target, growing.bar.width + seconds * (this.held ? 160 : 40));
      growing.bar.width = width;
      if (growing.leftward) growing.bar.x = 12 - width - 2;
    }
    if (this.growing.some((g) => g.bar.width < g.target) && Math.floor(this.clock * 10) !== Math.floor((this.clock - seconds * 2) * 10)) {
      this.audio.play('SOUNDS.FINAL_REPORT.COUNTING_TICK');
    }
    this.growing = this.growing.filter((g) => g.bar.width < g.target);

    const next = this.steps[0];
    if (!next || this.clock < 0.5) return;
    if (next() === false) return;
    this.steps.shift();
    this.clock = 0;
  }
}
