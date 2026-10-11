// How the awards room moves (update 0x1e6f0, draw 0x1ed68): the curtain, the pages and the
// sparkles. See docs/re-notes.md.

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

/** A page is a screen wide. */
export const PAGE_WIDTH = 480;

/**
 * How far down the curtain's edge hangs with the room `open` (0 shut to 1 open, over a second):
 * 27 px when open and 300 more when shut, eased, the first third of the opening spent shut.
 */
export function curtainEdge(open: number): number {
  const t = clamp(1.5 * (1 - open));
  return 27 + 300 * t * t * (3 - 2 * t);
}

/**
 * One step of the wall's slide towards a page (0x1eac0): it speeds up at 8000 px/s² and brakes
 * as hard once it is within one and a half times its stopping distance, never slower than
 * 50 px/s, and stops on the page.
 */
export function slideStep(scroll: number, speed: number, target: number, dt: number): { scroll: number; speed: number } {
  const left = target - scroll;
  if (Math.abs(left) <= 1) return { scroll, speed: 0 };
  let v = speed;
  let a = left > 0 ? 8000 : -8000;
  if (left > 0 === v > 0 && Math.abs(left) < (1.5 * v * v) / 8000) {
    if (Math.abs(v) < 50) v = v > 0 ? 50 : -50;
    const next = scroll + v * dt;
    if (v > 0 ? next > target : next < target) return { scroll: target, speed: 0 };
    a = -a;
  }
  return { scroll: scroll + v * dt + 0.5 * a * dt * dt, speed: v + a * dt };
}

/** A page's number at the top left: its size and how far it is nudged aside, by how far the wall is from that page. */
export function pageNumberPose(index: number, scroll: number): { x: number; y: number; scale: number } {
  const away = index - scroll / -PAGE_WIDTH;
  const distance = Math.abs(away);
  return { x: 30 + 26 * index + (away < -1 ? -8 : away > 1 ? 8 : 8 * away), y: 24, scale: 1 - (distance < 0.75 ? 0.5 * distance : 0.375) };
}

/** The page a touch on the strip of numbers picks: they are taken to be 36 px apart across the first 110. */
export function pageTouched(x: number, y: number, pages: number): number | null {
  if (x < 0 || x > 110 || y < 0 || y > 48) return null;
  return Math.min(Math.trunc(x / 36), pages - 1);
}

/**
 * A finger's movement, smoothed: each step keeps 0.7 of what it had and takes 0.3 of the new.
 * Once it is over 3 px, a mostly sideways one turns the page.
 */
export function swipeStep(kept: { x: number; y: number }, dx: number, dy: number): { kept: { x: number; y: number }; turn: -1 | 0 | 1 } {
  const x = 0.7 * kept.x + 0.3 * dx;
  const y = 0.7 * kept.y + 0.3 * dy;
  const length = Math.hypot(x, y);
  if (length <= 3) return { kept: { x, y }, turn: 0 };
  const across = x / length;
  return { kept: { x: 0, y: 0 }, turn: across < -0.6 ? 1 : across > 0.6 ? -1 : 0 };
}

/** A sparkle with `clock` of its two seconds left: its size about its own, its turn in degrees and its opacity. */
export function sparklePose(clock: number, size: number, angle: number): { scale: number; angle: number; alpha: number } {
  return { scale: size + 0.2 * Math.sin(2 * clock), angle: angle + 200 * clock, alpha: clamp(2 * Math.min(clock, 2 - clock)) };
}

/** Seconds between attempts at a sparkle: each picks one of the 42 award ids, and sparkles if that award is had. */
export const SPARKLE_EVERY = 0.15;
