import { ARCHES } from './arches';
import { ISLAND } from './island';
import type { StageLayout } from './layout';

/** Stages whose layout has been recovered so far, by stage number. */
export const STAGES: ReadonlyMap<number, StageLayout> = new Map([
  [ARCHES.stage, ARCHES],
  [ISLAND.stage, ISLAND],
]);
