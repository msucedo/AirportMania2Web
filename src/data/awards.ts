import type { XmlNode } from './xml';

/** An award's place in the awards room, from `awards_room_descriptor_table.xml` (parser 0x1d5f8). */
export interface AwardPlace {
  /** The id the game's events use: 0 diploma, 1–20 planes, 21–33 medals, 34–39 special trophies, 40 pig, 41 clock. */
  id: number;
  kind: 'diploma' | 'pig' | 'clock' | 'medal' | 'special' | 'plane';
  /** Its number within its kind, which its images are named by. */
  number: number;
  x: number;
  y: number;
  /** Prefix of its texts: `.NAME`, `.EARN`, `.PRE_DESCRIPTION`, `.DESCRIPTION`. */
  text: string;
}

/** Where an award's sparkles appear (`AwardShine`), by the award's id. */
export function parseAwardShines(nodes: XmlNode[]): Map<number, { x: number; y: number }[]> {
  const table = nodes.find((node) => node.t === 'AwardsDescriptorTable');
  const shines = new Map<number, { x: number; y: number }[]>();
  for (const node of table?.c ?? []) {
    if (node.t !== 'AwardShine') continue;
    shines.set(Number(node.a.Id), node.c.filter((shine) => shine.t === 'Shine').map((shine) => ({ x: Number(shine.a.X), y: Number(shine.a.Y) })));
  }
  return shines;
}

export function parseAwardsTable(nodes: XmlNode[]): AwardPlace[] {
  const table = nodes.find((node) => node.t === 'AwardsDescriptorTable');
  const places: AwardPlace[] = [];
  for (const node of table?.c ?? []) {
    const x = Number(node.a.X);
    const y = Number(node.a.Y);
    const number = Number(node.a.Id ?? 0);
    if (node.t === 'DiplomaAward') places.push({ id: 0, kind: 'diploma', number: 0, x, y, text: 'AWARDS.DIPLOMA' });
    else if (node.t === 'PigAward') places.push({ id: 40, kind: 'pig', number: 0, x, y, text: 'AWARDS.STINGY_MANIAC' });
    else if (node.t === 'ClockAward') places.push({ id: 41, kind: 'clock', number: 0, x, y, text: 'AWARDS.FLYING_TIME' });
    else if (node.t === 'MedalAward') places.push({ id: 20 + number, kind: 'medal', number, x, y, text: node.a.TextID ?? '' });
    else if (node.t === 'SpecialTrophyAward') places.push({ id: 33 + number, kind: 'special', number, x, y, text: node.a.TextID ?? '' });
    else if (node.t === 'AirplaneTrophyAward') places.push({ id: number, kind: 'plane', number, x, y, text: `AWARDS.PLANE_${number}` });
  }
  return places;
}
