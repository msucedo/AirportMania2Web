// The help (dialog 0x49c24, built by 0x49c80): eight pages kept by the game, the first seven
// with two pictures and two texts each and the last with the game's tips. See docs/re-notes.md.

export const HELP_PAGES = 8;

/** The two pictures of pages 1 to 7 (table 0x17a9c4). A `%d` takes the stage number. */
const PICTURES: readonly (readonly [string, string])[] = [
  ['HINTS.PLANE', 'HINTS.RUNWAY'],
  ['HINTS.TELLING', 'HINTS.WAITING'],
  ['HINTS.GATE_%d', 'HINTS.GAS_STATION_%d'],
  ['HINTS.GATE_COMBO', 'HINTS.RUNWAY_COMBO'],
  ['HINTS.DIRTY_PLANES', 'HINTS.RUNWAY'],
  ['HINTS.STORAGE_PLACE', 'HINTS.QUEUING'],
  ['HINTS.SWAPPING_PLACES', 'HINTS.HIGHER_SCORES'],
];

/** The pictures of a page (1 to 7) in a stage. */
export function helpPictures(page: number, stage: number): [string, string] {
  const [first, second] = PICTURES[page - 1]!;
  return [first.replace('%d', String(stage)), second.replace('%d', String(stage))];
}

/** Every picture the help shows in a stage, to load with the level. */
export const helpSurfaces = (stage: number): string[] => [...new Set(PICTURES.flatMap((_, index) => helpPictures(index + 1, stage)))];

/** The tip after `index`: they go round (0x49c54). */
export const nextTip = (index: number, count: number): number => (index + 1 >= count ? 0 : index + 1);
