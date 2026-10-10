import { AFRICA } from './africa';
import { AIRBORNE } from './airborne';
import { ANTARCTIC } from './antarctic';
import { ARCHES } from './arches';
import { CARRIER } from './carrier';
import { ISLAND } from './island';
import type { StageLayout } from './layout';
import { MARS } from './mars';
import { MONSTERS } from './monsters';
import { MOON } from './moon';
import { NORTH_POLE } from './northPole';
import { TUTORIAL } from './tutorial';

/** The ten stages, by stage number. */
export const STAGES: ReadonlyMap<number, StageLayout> = new Map([
  [ARCHES.stage, ARCHES],
  [ISLAND.stage, ISLAND],
  [MONSTERS.stage, MONSTERS],
  [NORTH_POLE.stage, NORTH_POLE],
  [AIRBORNE.stage, AIRBORNE],
  [AFRICA.stage, AFRICA],
  [ANTARCTIC.stage, ANTARCTIC],
  [CARRIER.stage, CARRIER],
  [MOON.stage, MOON],
  [MARS.stage, MARS],
]);

/** The tutorial is stage 0: it is played from the map's own button and is not one of the ten. */
export { TUTORIAL };

/** The layout of a stage by number, the tutorial included. */
export const stageLayout = (stage: number): StageLayout | undefined => (stage === 0 ? TUTORIAL : STAGES.get(stage));
