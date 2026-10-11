import { Container, Rectangle, Text } from 'pixi.js';
import type { LevelGoals } from '../../data/levels';
import type { Strings } from '../../data/strings';
import { fontFamily } from '../../engine/fonts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../engine/screen';
import type { TextureStore } from '../../engine/textures';
import { MAIN_FONT, SCORE_FONT } from './floatingText';
import { TIER_COLORS } from '../palette';

export const LEVEL_INTRO_SURFACES = ['GUI.INGAMEGUI.SCORE_GOAL_BACK'];
export const LEVEL_INTRO_FONTS = ['FONTS.BLUE_STONE', 'FONTS.TEEN_BD', MAIN_FONT, SCORE_FONT];

const TIERS = ['GOAL', 'EXPERT', 'MASTER', 'SUPREME', 'PERFECT'] as const;
const BEST_TINT = 0x4d4d4d;

/** One score row (0x51b18): the plate, the name 125 px left of its centre and the amount 115 px right. */
export function goalRow(textures: TextureStore, name: string, amount: string, tint: number, dark = true): Container {
  const row = new Container();
  const plate = textures.sprite('GUI.INGAMEGUI.SCORE_GOAL_BACK');
  plate.tint = tint;
  const label = new Text({ text: name, style: { fontFamily: fontFamily('FONTS.TEEN_BD'), fontSize: 11, fill: dark ? 0x30243a : 0xffffff } });
  label.anchor.set(0, 0.5);
  label.position.set(-125, -2);
  const value = new Text({ text: amount, style: { fontFamily: fontFamily(SCORE_FONT), fontSize: 14, fill: dark ? 0x2d6a1f : 0xffe45c } });
  value.anchor.set(1, 0.5);
  value.position.set(115, 0);
  row.addChild(plate, label, value);
  return row;
}

/** The five score rows, 26 px apart, and the best score `bestGap` px further down when there is one. */
export function goalRows(textures: TextureStore, strings: Strings, goals: LevelGoals, best: number, bestGap = 20): Container {
  const rows = new Container();
  const amounts = [goals.goal, goals.expert, goals.master, goals.supreme, goals.perfect];
  TIERS.forEach((tier, i) => {
    const row = goalRow(textures, strings.t(`SCORE.${tier}_SCORE`), String(amounts[i]), TIER_COLORS[i]!);
    row.y = i * 26;
    rows.addChild(row);
  });
  if (best > 0) {
    const row = goalRow(textures, strings.t('SCORE.BEST_SCORE'), String(best), BEST_TINT, false);
    row.y = TIERS.length * 26 + bestGap;
    rows.addChild(row);
  }
  return rows;
}

export type IntroState = { phase: 'coming' | 'shown' | 'going'; clock: number };

/** A step of the announcement (0x519f0); false once it has gone. */
export function introStep(state: IntroState, dt: number, touched: boolean): boolean {
  switch (state.phase) {
    case 'coming':
      state.clock += 2 * dt;
      if (state.clock >= 1) {
        state.phase = 'shown';
        state.clock = 0;
      }
      return true;
    case 'shown':
      state.clock += dt;
      if (state.clock > 5.5 || touched) {
        state.phase = 'going';
        state.clock = 1;
      }
      return true;
    case 'going':
      state.clock -= 2 * dt;
      return state.clock > 0;
  }
}

/** Its size and opacity: half size and clear at the ends of its coming and going. */
export function introPose(state: IntroState): { scale: number; alpha: number } {
  if (state.phase === 'shown') return { scale: 1, alpha: 1 };
  const c = Math.max(0, Math.min(1, state.clock));
  return { scale: 0.5 + 0.5 * c, alpha: c };
}

/** Where the awards won on the level go, from the screen's centre, by how many there are (0x51e5e): one row of up to three, or two. */
export function introAwardPlaces(count: number): { x: number; y: number }[] {
  const row = (xs: number[], y: number): { x: number; y: number }[] => xs.map((x) => ({ x, y }));
  switch (Math.min(count, 6)) {
    case 1:
      return row([140], 40);
    case 2:
      return row([120, 160], 40);
    case 3:
      return row([100, 140, 180], 40);
    case 4:
      return [...row([120, 160], 0), ...row([120, 160], 80)];
    case 5:
      return [...row([100, 140, 180], 0), ...row([120, 160], 80)];
    case 6:
      return [...row([100, 140, 180], 0), ...row([100, 140, 180], 80)];
    default:
      return [];
  }
}

/**
 * What a level opens with (panel `0x514cc`, drawn by `0x51be8`): "Stage – Level N", the
 * airport's name, the five scores to aim for and the best one so far. Heights are from the
 * screen's centre: the title at −100 (−80 with no best score), 20 higher when five scores are
 * listed; the name 45 below it and the first row 50 below that; the awards already won on the
 * level to the right, the scores then 60 px to the left.
 */
export class LevelIntro extends Container {
  constructor(textures: TextureStore, strings: Strings, level: { stage: number; number: number; goals: LevelGoals; best: number; awards?: Container[] }, onStart: () => void) {
    super();
    // The touch area is its own node, as with the dialog buttons.
    const zone = new Container();
    zone.hitArea = new Rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    zone.eventMode = 'static';
    zone.cursor = 'pointer';
    zone.on('pointerdown', (event) => {
      event.stopPropagation();
      touched = true;
    });
    const centre = new Container();
    centre.position.set(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    this.addChild(centre, zone);

    // 0x519f0: it swells in over half a second, stays 5.5 s or until a touch, and goes the way
    // it came while the level is already running.
    const state: IntroState = { phase: 'coming', clock: 0 };
    let touched = false;
    let last = performance.now();
    const show = (): void => {
      const pose = introPose(state);
      centre.scale.set(pose.scale);
      centre.alpha = pose.alpha;
    };
    show();
    this.onRender = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const was = state.phase;
      const alive = introStep(state, dt, touched);
      touched = false;
      if (was === 'shown' && state.phase === 'going') {
        zone.eventMode = 'none';
        onStart();
      }
      if (!alive) {
        this.onRender = null;
        setTimeout(() => this.destroy({ children: true }));
        return;
      }
      show();
    };

    const top = (level.best > 0 ? -100 : -80) - 20;
    const title = new Text({
      text: `${strings.t(`STAGES.${level.stage}.TITLE`)} - ${strings.t('LEVEL_NUMBER', level.number)}`,
      style: { fontFamily: fontFamily('FONTS.BLUE_STONE'), fontSize: 20, fill: 0xffd75a, stroke: { color: 0x5a2a00, width: 3 } },
    });
    title.anchor.set(0.5);
    title.position.set(0, top);
    const name = new Text({
      text: strings.t(`STAGES.${level.stage}.NAME`),
      style: { fontFamily: fontFamily(MAIN_FONT), fontSize: 14, fill: 0xffc23a, stroke: { color: 0x5a2a00, width: 3 }, align: 'center', wordWrap: true, wordWrapWidth: 420 },
    });
    name.anchor.set(0.5);
    name.position.set(0, top + 45);
    const rows = goalRows(textures, strings, level.goals, level.best);
    const awards = level.awards ?? [];
    // 0x51cf6: the scores make room for the awards won on this level, shown to their right.
    rows.position.set(awards.length > 0 ? -60 : 0, top + 95);
    centre.addChild(title, name, rows);
    introAwardPlaces(awards.length).forEach((at, i) => {
      awards[i]!.position.set(at.x, at.y);
      centre.addChild(awards[i]!);
    });
  }
}
