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
