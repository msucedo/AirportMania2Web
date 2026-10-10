import { Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { LevelGoals } from '../../data/levels';
import type { TextureStore } from '../../engine/textures';

// The in-game bar, after the original's update (0x4e89c) and draw (0x4eba4). The score reels and
// the goal bar are drawn first and seen through the holes of the bar's image, which goes over
// them; then the separators, the menu button and the clock.

export const HUD_SURFACES = [
  'GUI.INGAMEGUI.BACK',
  'GUI.INGAMEGUI.BLACK_NUMBERS',
  'GUI.INGAMEGUI.RED_NUMBERS',
  'GUI.INGAMEGUI.BAR_SEPARATOR',
  'GUI.INGAMEGUI.PROGRESS_BAR_EFFECT',
  'GUI.INGAMEGUI.MENU_BUTTON',
  'GUI.INGAMEGUI.MENU_BUTTON_OVER',
  'GUI.INGAMEGUI.YELLOW_DISC',
  'GUI.INGAMEGUI.BLUE_ORANGE_DISC',
  'GUI.INGAMEGUI.NO_MORE_TIME',
];
export const HUD_FONT = 'FONTS.KENYAN_COFFEE_BD';
export const HUD_HEIGHT = 34;

/** Eight reels 11 px apart, units on the right; each shows 12×18 px of its strip at y 2. */
const REEL = { count: 8, x: 81, pitch: 11, y: 2, width: 12, height: 18, speed: 200, loop: 200 };
/** A digit sits every 20 px down the strip, after the dash an unused reel shows. */
const digitAt = (digit: number): number => (digit + 1) * 20;
const BAR = { x: 194, y: 4, width: 119, height: 11 };
const MENU = { x: 425, y: 0 };
/** The clock: half a disc hanging from the top edge, centred on x 34.5, in three rings. */
const CLOCK = { x: 34.5, steps: 8 };
const RINGS = [
  { inner: 22.5, outer: 29, image: 'GUI.INGAMEGUI.BLUE_ORANGE_DISC' },
  { inner: 15, outer: 23, image: 'GUI.INGAMEGUI.YELLOW_DISC' },
  { inner: 7, outer: 15.5, image: 'GUI.INGAMEGUI.BLUE_ORANGE_DISC' },
] as const;
/**
 * Segment colours of the goal bar, one per tier. The original reads them from a table filled at
 * run time (`0x181314`) that has not been found; these are ours.
 */
const TIER_COLORS = [0xf2a33a, 0xe8c63a, 0xa8d04a, 0x6cc04a, 0x3fb36b];

/** Where the goal bar reaches, 0..1 of its length (0x4e8cc): each tier fills its share, eased. */
export function goalBarFraction(score: number, goals: LevelGoals): number {
  const marks = [goals.goal, goals.expert, goals.master, goals.supreme, goals.perfect];
  const reached = marks.filter((mark) => score >= mark).length;
  if (reached >= marks.length) return 1;
  const from = reached > 0 ? marks[reached - 1]! : 0;
  const to = marks[reached]!;
  const within = Math.max(0, Math.min(1, (score - from) / (to - from)));
  return (Math.pow(within, 0.6) * (to - from) + from) / goals.perfect;
}

/** The time left as three base-9 digits, coarse to fine: what the clock's rings show (0x4efa6). */
export function clockDigits(remaining: number): [number, number, number] {
  const r = Math.max(0, Math.min(1, remaining));
  const first = Math.floor(r * 9);
  if (first >= 9) return [9, 9, 9];
  return [first, Math.floor(r * 81) % 9, Math.floor(r * 729) % 9];
}

interface Reel {
  sprite: TilingSprite;
  at: number;
  target: number;
}

export class Hud extends Container {
  private readonly reels: Reel[] = [];
  private readonly strips: { black: Texture; red: Texture };
  private readonly fill = new Graphics();
  private readonly glow: Sprite;
  private readonly menu: Sprite;
  private readonly timeOver: Sprite;
  private readonly rings: Graphics[] = [];
  private shownScore: number | null = null;
  private time = 0;
  onPause: (() => void) | null = null;
  /** Drawn behind the bar: the service tabs show through its openings and hang below it. */
  readonly behind = new Container();

  constructor(
    textures: TextureStore,
    private readonly goals: LevelGoals,
  ) {
    super();
    this.strips = { black: textures.texture('GUI.INGAMEGUI.BLACK_NUMBERS'), red: textures.texture('GUI.INGAMEGUI.RED_NUMBERS') };
    // Reel 0 is the units, drawn rightmost.
    for (let i = 0; i < REEL.count; i++) {
      const sprite = new TilingSprite({ texture: this.strips.black, width: REEL.width, height: REEL.height });
      sprite.position.set(REEL.x + (REEL.count - 1 - i) * REEL.pitch, REEL.y);
      this.reels.push({ sprite, at: 0, target: 0 });
      this.addChild(sprite);
    }

    this.glow = textures.sprite('GUI.INGAMEGUI.PROGRESS_BAR_EFFECT');
    this.glow.anchor.set(1, 0.5);
    this.glow.blendMode = 'add';
    this.glow.height = BAR.height;
    this.addChild(this.behind, this.fill, this.glow, textures.sprite('GUI.INGAMEGUI.BACK'));

    const marks = [goals.goal, goals.expert, goals.master, goals.supreme];
    for (const mark of marks) {
      const separator = textures.sprite('GUI.INGAMEGUI.BAR_SEPARATOR');
      separator.position.set(Math.floor(BAR.x + (mark * BAR.width) / goals.perfect - separator.width / 2), 0);
      this.addChild(separator);
    }

    this.menu = textures.sprite('GUI.INGAMEGUI.MENU_BUTTON');
    this.menu.position.set(MENU.x, MENU.y);
    this.menu.eventMode = 'static';
    this.menu.cursor = 'pointer';
    this.menu.hitArea = new Rectangle(0, 0, this.menu.width, this.menu.height);
    this.menu.on('pointerover', () => (this.menu.texture = textures.texture('GUI.INGAMEGUI.MENU_BUTTON_OVER')));
    this.menu.on('pointerout', () => (this.menu.texture = textures.texture('GUI.INGAMEGUI.MENU_BUTTON')));
    this.menu.on('pointerdown', (event) => {
      event.stopPropagation();
      this.onPause?.();
    });
    this.addChild(this.menu);

    // 0x4f39a: over the clock once the time has run out.
    this.timeOver = textures.sprite('GUI.INGAMEGUI.NO_MORE_TIME');
    this.timeOver.position.set(14, 0);
    this.timeOver.visible = false;
    this.addChild(this.timeOver);

    // Each ring is its half-disc image, top centre on the clock's centre, seen through a sector.
    for (const ring of RINGS) {
      const image = textures.sprite(ring.image);
      image.position.set(CLOCK.x - image.width / 2, 0);
      const sector = new Graphics();
      image.mask = sector;
      this.rings.push(sector);
      this.addChild(sector, image);
    }
  }

  /** True when the point belongs to the HUD and must not reach the airport. */
  contains(y: number): boolean {
    return y < HUD_HEIGHT;
  }

  /** @param remaining share of the level's time still left, 1 at the start */
  update(score: number, remaining: number, dt: number): void {
    this.time += dt;
    this.timeOver.visible = remaining <= 0;
    this.timeOver.alpha = 0.5 + 0.5 * Math.sin(this.time * 11);
    this.setScore(score);
    this.rollReels(dt, score);

    // Reached tiers in full colour up to where the bar stands, the rest dimmed; a cleared bar
    // pulses. The bar stops at the tier it is in and creeps towards the next.
    const marks = [this.goals.goal, this.goals.expert, this.goals.master, this.goals.supreme, this.goals.perfect];
    const reach = BAR.x + BAR.width * goalBarFraction(score, this.goals);
    this.fill.clear();
    if (score >= this.goals.perfect) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 10);
      this.fill.rect(BAR.x, BAR.y, BAR.width, BAR.height).fill({ color: 0xffe45c, alpha: 0.6 + 0.4 * pulse });
    } else {
      let from = BAR.x;
      marks.forEach((mark, i) => {
        const to = BAR.x + (mark * BAR.width) / this.goals.perfect;
        const lit = Math.min(to, reach);
        if (lit > from) this.fill.rect(from, BAR.y, lit - from, BAR.height).fill(TIER_COLORS[i]!);
        if (to > Math.max(from, reach)) this.fill.rect(Math.max(from, reach), BAR.y, to - Math.max(from, reach), BAR.height).fill({ color: TIER_COLORS[i]!, alpha: 0.5 });
        from = to;
      });
    }
    this.glow.visible = reach > BAR.x + 1;
    this.glow.position.set(reach, BAR.y + BAR.height / 2);
    this.glow.width = Math.min(64, reach - BAR.x);

    const digits = clockDigits(remaining);
    this.rings.forEach((sector, i) => {
      const ring = RINGS[i]!;
      // A digit lights that many eighths of the half turn, from the left end round the bottom.
      const sweep = (Math.min(digits[i]!, CLOCK.steps) / CLOCK.steps) * Math.PI;
      sector.clear();
      if (sweep <= 0) return;
      sector
        .moveTo(CLOCK.x - ring.outer, 0)
        .arc(CLOCK.x, 0, ring.outer, Math.PI, Math.PI - sweep, true)
        .arc(CLOCK.x, 0, ring.inner, Math.PI - sweep, Math.PI, false)
        .closePath()
        .fill(0xffffff);
    });
  }

  /** New targets for the reels (0x4e9a8): a digit each as far as the number goes, a dash beyond. */
  private setScore(score: number): void {
    if (score === this.shownScore) return;
    const digits = String(Math.abs(score));
    this.reels.forEach((reel, i) => {
      const digit = digits[digits.length - 1 - i];
      // Reels beyond the number go back to the dash (the original's loop only sets the digits).
      reel.target = digit !== undefined ? digitAt(Number(digit)) : 0;
    });
    // A negative score puts the dash on the leftmost reel.
    if (score < 0) this.reels[REEL.count - 1]!.target = 0;
  }

  /** Reels turn at 200 px a second, upwards for a rising score, round a 200 px loop (0x4ea32). */
  private rollReels(dt: number, score: number): void {
    const rising = this.shownScore === null || score >= this.shownScore;
    const strip = score < 0 ? this.strips.red : this.strips.black;
    let turning = false;
    for (const reel of this.reels) {
      reel.sprite.texture = strip;
      if (reel.at !== reel.target) {
        const step = REEL.speed * dt * (rising ? 1 : -1);
        const before = reel.target - reel.at;
        reel.at += step;
        // Round the loop of ten digits, then stop on passing the target.
        if (reel.at > 210) reel.at -= REEL.loop;
        else if (reel.at < 10 && reel.target > 15) reel.at += REEL.loop;
        const after = reel.target - reel.at;
        if (before * after <= 0 && Math.abs(before) <= Math.abs(step) + 0.01) reel.at = reel.target;
        else turning = true;
      }
      reel.sprite.tilePosition.y = -reel.at;
    }
    if (!turning) this.shownScore = score;
  }
}
