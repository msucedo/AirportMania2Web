import { Container, Graphics, Text } from 'pixi.js';
import type { LevelGoals } from '../../data/levels';
import type { Strings } from '../../data/strings';
import { fontFamily } from '../../engine/fonts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../../engine/screen';
import type { TextureStore } from '../../engine/textures';
import type { Simulation } from '../sim/simulation';
import { MAIN_FONT, SCORE_FONT } from './floatingText';

export const FINAL_REPORT_SURFACES = ['GUI.FINAL_REPORT.STAR', 'GUI.FINAL_REPORT.BACK_STAR'];

export type Tier = 'FAIL' | 'GOAL' | 'EXPERT' | 'MASTER' | 'SUPREME' | 'PERFECT';
const TIERS: Exclude<Tier, 'FAIL'>[] = ['GOAL', 'EXPERT', 'MASTER', 'SUPREME', 'PERFECT'];

export function tierFor(score: number, goals: LevelGoals): Tier {
  const values: Record<Exclude<Tier, 'FAIL'>, number> = { GOAL: goals.goal, EXPERT: goals.expert, MASTER: goals.master, SUPREME: goals.supreme, PERFECT: goals.perfect };
  let reached: Tier = 'FAIL';
  for (const tier of TIERS) if (score >= values[tier]) reached = tier;
  return reached;
}

/**
 * End-of-level summary with the original texts, fonts and star sprites. The layout is ours: the
 * original final report dialog has not been reconstructed.
 */
export class FinalReport extends Container {
  onReplay: (() => void) | null = null;

  constructor(textures: TextureStore, strings: Strings, sim: Simulation, level: number) {
    super();
    const tier = tierFor(sim.score, sim.goals);
    const panel = { x: 90, y: 48, width: 300, height: 232 };
    this.addChild(new Graphics().rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill({ color: 0x000000, alpha: 0.45 }));
    this.addChild(new Graphics().roundRect(panel.x, panel.y, panel.width, panel.height, 12).fill({ color: 0x1d2c3f, alpha: 0.95 }).stroke({ color: 0xf2f2f2, width: 2 }));

    const main = fontFamily(MAIN_FONT);
    const score = fontFamily(SCORE_FONT);
    const centre = panel.x + panel.width / 2;
    const label = (text: string, x: number, y: number, size: number, family: string, fill: number, anchorX = 0.5): Text => {
      const node = new Text({ text, style: { fontFamily: family, fontSize: size, fill, stroke: { color: 0x101820, width: 3 } } });
      node.anchor.set(anchorX, 0.5);
      node.position.set(x, y);
      this.addChild(node);
      return node;
    };

    label(strings.t('LEVEL_NUMBER', level), centre, panel.y + 20, 17, main, 0xffb52e);

    // One star per goal reached, over the empty outlines.
    const reached = tier === 'FAIL' ? 0 : TIERS.indexOf(tier) + 1;
    TIERS.forEach((_, i) => {
      const x = centre + (i - 2) * 34;
      const back = textures.sprite('GUI.FINAL_REPORT.BACK_STAR');
      back.anchor.set(0.5);
      back.position.set(x, panel.y + 54);
      // Dimmed so that only the stars actually earned stand out.
      back.tint = 0x56606c;
      this.addChild(back);
      if (i < reached) {
        const star = textures.sprite('GUI.FINAL_REPORT.STAR');
        star.anchor.set(0.5);
        star.position.set(x, panel.y + 54);
        this.addChild(star);
      }
    });
    label(strings.t(tier === 'FAIL' ? 'SCORE.FAILED_SCORE' : `SCORE.${tier}_SCORE`), centre, panel.y + 84, 15, main, tier === 'FAIL' ? 0xff6b5c : 0xfff2a8);

    const rows: [string, number | string][] = [
      [strings.t('FINAL_REPORT_DIALOG.PLANES_SERVED'), sim.planesServed],
      [strings.t('FINAL_REPORT_DIALOG.PLANES_LOST'), sim.planesLost],
      [`${strings.t('FINAL_REPORT_DIALOG.ARRIVALS')}: ${strings.t('FINAL_REPORT_DIALOG.PLANES_EARLY')} / ${strings.t('FINAL_REPORT_DIALOG.PLANES_ON_TIME')} / ${strings.t('FINAL_REPORT_DIALOG.PLANES_LATE')}`, `${sim.counts.unload.EARLY} / ${sim.counts.unload.ON_TIME} / ${sim.counts.unload.LATE}`],
      [`${strings.t('FINAL_REPORT_DIALOG.DEPARTURES')}: ${strings.t('FINAL_REPORT_DIALOG.PLANES_EARLY')} / ${strings.t('FINAL_REPORT_DIALOG.PLANES_ON_TIME')} / ${strings.t('FINAL_REPORT_DIALOG.PLANES_LATE')}`, `${sim.counts.takeOff.EARLY} / ${sim.counts.takeOff.ON_TIME} / ${sim.counts.takeOff.LATE}`],
    ];
    rows.forEach(([name, value], i) => {
      const y = panel.y + 108 + i * 17;
      const text = label(name.replace(/:+/g, ':'), panel.x + 16, y, 11, score, 0xe8eef5, 0);
      // Long translated rows shrink to leave room for the value.
      const room = panel.width - 32 - 64;
      if (text.width > room) text.scale.set(room / text.width);
      label(String(value), panel.x + panel.width - 16, y, 12, score, 0xffffff, 1);
    });

    label(strings.t('FINAL_REPORT_DIALOG.LEVEL_SCORE'), panel.x + 16, panel.y + 184, 13, main, 0xffb52e, 0);
    label(String(sim.score), panel.x + panel.width - 16, panel.y + 184, 18, score, sim.score < 0 ? 0xff6b5c : 0xffe45c, 1);

    const button = new Container();
    button.position.set(centre, panel.y + 212);
    const caption = new Text({ text: strings.t('FINAL_REPORT_DIALOG.REPLAY_LEVEL'), style: { fontFamily: main, fontSize: 13, fill: 0x1d2c3f } });
    caption.anchor.set(0.5);
    const width = Math.max(110, caption.width + 24);
    button.addChild(new Graphics().roundRect(-width / 2, -11, width, 22, 8).fill(0xffb52e).stroke({ color: 0xffffff, width: 1 }), caption);
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.on('pointerdown', (event) => {
      event.stopPropagation();
      this.onReplay?.();
    });
    this.addChild(button);
  }
}
