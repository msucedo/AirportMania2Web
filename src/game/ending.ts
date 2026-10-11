// How the ending moves (scene 0x3473c; classes 0x35ce4, 0x35ffc, 0x361bc, 0x36bb8, 0x35194).
// See docs/re-notes.md.

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

/** The pictures that float in front, in the order they are made: resource, place, the seconds before its clock reaches zero, and its size. */
export const FLOATERS = [
  { resource: 'FINAL_VICTORY.LITTLE_PLANE', x: 189, y: 87, delay: 8, scale: 0.5, propeller: true },
  { resource: 'FINAL_VICTORY.MILITAR_PLANE', x: 96, y: 182, delay: 7, scale: 0.75, propeller: false },
  { resource: 'FINAL_VICTORY.TRANSBORDER', x: 360, y: 120, delay: 6, scale: 0.85, propeller: false },
  { resource: 'FINAL_VICTORY.MAIN_CHARACTER', x: 240, y: 204, delay: 5, scale: 1, propeller: false },
] as const;

/**
 * A floater with its clock at `t` (0x35e6c): until 2 it comes down from the upper right, turning;
 * always it sways a little. Offsets are from its place, the angle in degrees.
 */
export function floaterPose(t: number, scale: number): { x: number; y: number; angle: number } {
  let x = 11 * Math.sin(0.47 * t) * scale;
  let y = 10 * Math.cos(0.53 * t) * scale;
  let angle = 7 * Math.sin(0.3 * t);
  if (t < 2) {
    const u = 2 - t;
    x += 60 * u * u * scale;
    y += -160 * u ** 4 * scale;
    angle += 25 * u * u;
  }
  return { x, y, angle };
}

/** The little plane's propeller turns 5000 degrees a second. */
export const propellerTurn = (t: number): number => 5000 * t;

/** A thing of the ground at depth `z`, `side` px to one side (0x367f4): shown under 10, its foot at (x, y) and its size. */
export function groundPose(z: number, side: number): { x: number; y: number; scale: number } | null {
  if (z >= 10) return null;
  const scale = 1 / (z + 0.5);
  return { x: 240 + side * scale, y: 320 + 42 * z, scale };
}

/** A cloud at depth `z` (0x36e86), likewise. */
export function cloudPose(z: number, x: number): { x: number; y: number; scale: number } | null {
  if (z >= 10) return null;
  const scale = 2 / Math.max(0.1, z);
  return { x: 240 + x * scale, y: 42 * z, scale };
}

/** The ground's rings (0x36232): thirty pairs each, a quarter apart in depth, from a first depth, with the number of pictures each goes round. */
export const GROUND_RINGS = [
  { resource: 'FINAL_VICTORY.BUILDINGS', pictures: 5, from: 40 },
  { resource: 'FINAL_VICTORY.CANION', pictures: 4, from: 30 },
  { resource: 'FINAL_VICTORY.MOUNTAIN', pictures: 6, from: 20 },
  { resource: 'FINAL_VICTORY.PALM_TREE', pictures: 3, from: 10 },
] as const;
/** Depths go round at 50 for the ground and 20 for the clouds, one a second. */
export const GROUND_DEPTH = 50;
export const CLOUD_DEPTH = 20;

export interface GroundItem {
  resource: string;
  side: number;
  z: number;
  mirrored: boolean;
}

/** Every thing of the ground, in the order made: for each depth one to the right and, three pictures on, its mirror to the left. */
export function groundItems(): GroundItem[] {
  const items: GroundItem[] = [];
  for (const ring of GROUND_RINGS) {
    for (let i = 0; i < 30; i++) {
      const z = i * 0.25 + ring.from;
      items.push({ resource: `${ring.resource}.${i % ring.pictures}`, side: 120, z, mirrored: false });
      items.push({ resource: `${ring.resource}.${(i + 3) % ring.pictures}`, side: -120, z, mirrored: true });
    }
  }
  return items;
}

/**
 * A letter of the congratulations (0x356c6), the `index`th of `count`, with the text's clock at
 * `clock`: each starts 0.7/count after the one before, a second in; it comes over half a second,
 * swells and shrinks once a second for three, and goes over half a second.
 */
export function letterPose(clock: number, index: number, count: number): { scale: number; alpha: number } | null {
  if (clock <= 1 || clock >= 9) return null;
  const t = clock - 1 - (0.7 * index) / count;
  const swell = t < 0.5 ? 2 * t : t > 3.5 ? 2 * (4 - t) : 1 + 0.25 * Math.sin(2 * Math.PI * (t - 0.5));
  return { scale: 0.5 + 0.5 * swell, alpha: clamp(2 * swell) };
}
