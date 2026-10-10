// The hints the game gives when an order by hand is refused (table at 0x1796a8, raised by
// 0x10890): a picture and the key of a text for the hint dialog (0x4aedc). See docs/re-notes.md.

export const Hint = {
  SELECT: 0,
  LAND: 1,
  UNLOAD: 2,
  REPAIR: 3,
  FUEL: 4,
  WASH: 5,
  LUGGAGE: 6,
  LOAD: 7,
  LAUNCH: 8,
  NO_GAS_STATION: 9,
  NO_HANGAR: 10,
  FOG: 11,
  ICE: 12,
  SAND: 13,
  SPACE_GAS: 14,
} as const;

/** In the table's order. A picture with `%d` takes the stage number. */
const TABLE: readonly { image: string; text: string }[] = [
  { image: 'HINTS.PLANE', text: 'HINTS.NEEDS_TO_SELECT' },
  { image: 'HINTS.RUNWAY', text: 'HINTS.NEED_TO_BE_LANDED' },
  { image: 'HINTS.GATE_%d', text: 'HINTS.NEED_TO_BE_UNLOADED' },
  { image: 'HINTS.HANGAR_%d', text: 'HINTS.NEED_TO_BE_REPAIRED' },
  { image: 'HINTS.GAS_STATION_%d', text: 'HINTS.NEED_TO_BE_FUELED' },
  { image: 'HINTS.WASH_AND_GO', text: 'HINTS.NEED_TO_BE_WASHED' },
  { image: 'HINTS.LUGGAGE_%d', text: 'HINTS.NEED_TO_BE_LOADED_WITH_LUGGAGE' },
  { image: 'HINTS.GATE_%d', text: 'HINTS.NEED_TO_BE_LOADED' },
  { image: 'HINTS.RUNWAY', text: 'HINTS.NEED_TO_BE_LAUNCHED' },
  { image: 'HINTS.GAS_STATION_%d', text: 'HINTS.THERE_ISNT_GAS_STATION' },
  { image: 'HINTS.HANGAR_%d', text: 'HINTS.THERE_ISNT_HANGAR' },
  { image: 'HINTS.FOG', text: 'HINTS.FOG' },
  { image: 'HINTS.ICE', text: 'HINTS.ICE' },
  { image: 'HINTS.SAND', text: 'HINTS.SAND' },
  { image: 'HINTS.SPACE_GAS', text: 'HINTS.SPACE_GAS' },
];

/** The picture and text of a hint in a stage. */
export function hintFor(id: number, stage: number): { image: string; text: string } {
  const entry = TABLE[id];
  if (!entry) throw new Error(`No hint ${id}`);
  return { image: entry.image.replace('%d', String(stage)), text: entry.text };
}

/** Every picture the refused-order hints of a stage can show. */
export const hintImages = (stage: number): string[] => [...new Set(TABLE.map((entry) => entry.image.replace('%d', String(stage))))];
