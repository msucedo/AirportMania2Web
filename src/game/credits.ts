// The credits roll (class at 0x27bc8–0x289f8): the text `CREDITS_DIALOG.TEXT` is a list of
// marked lines the roll lays out once (0x27bc8), scrolls (0x2864c) and draws with each line
// fading at the window's edges (0x2885c). See docs/re-notes.md.

export type CreditsItem =
  | { kind: 'line'; y: number; height: number; font: string; text: string }
  | { kind: 'columns'; y: number; height: number; font: string; left: string; right: string }
  | { kind: 'image'; y: number; height: number; resource: string };

export interface CreditsLayout {
  items: CreditsItem[];
  /** How far the roll can scroll. */
  total: number;
}

/** Distance between the centres of the two columns of a `TWO_COLUMNS_LINE`. */
export const COLUMNS_APART = 220;

/**
 * Lays the marked text out. Each line is `#MARK#value#`: `FONT` and `INTERLINING` set what the
 * lines after them use, `SEPARATION` leaves a gap, `LINE` and `TWO_COLUMNS_LINE` put text with
 * its top at the cursor and `IMAGE` a picture centred below it. The cursor starts at 30 with 30
 * between lines. (`COLOR` and `IMAGE_LINE` exist too; no language's text uses them.)
 */
export function parseCredits(text: string, fontHeight: (font: string) => number, imageHeight: (resource: string) => number): CreditsLayout {
  const items: CreditsItem[] = [];
  let cursor = 30;
  let interlining = 30;
  let font = 'FONTS.MAIN';
  for (const raw of text.split('\n')) {
    const match = /^#([A-Z_]+)#(.*)$/.exec(raw.trim());
    if (!match) continue;
    const values = match[2]!.split('#');
    const value = values[0] ?? '';
    switch (match[1]) {
      case 'FONT':
        font = value;
        break;
      case 'INTERLINING':
        interlining = Number.parseInt(value, 10);
        break;
      case 'SEPARATION':
        cursor += Number.parseInt(value, 10);
        break;
      case 'LINE': {
        const height = fontHeight(font);
        items.push({ kind: 'line', y: cursor, height, font, text: value });
        cursor += height + interlining;
        break;
      }
      case 'TWO_COLUMNS_LINE': {
        const height = fontHeight(font);
        items.push({ kind: 'columns', y: cursor, height, font, left: value, right: values[1] ?? '' });
        cursor += height + interlining;
        break;
      }
      case 'IMAGE': {
        const height = imageHeight(value);
        items.push({ kind: 'image', y: cursor + Math.trunc(height / 2), height, resource: value });
        cursor += height;
        break;
      }
    }
  }
  return { items, total: cursor - interlining };
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

/** How solid an item is with the roll `offset` px on: it fades over 50 px at each edge of a window 265 px tall. */
export function creditsItemAlpha(item: { y: number; height: number }, offset: number): number {
  const place = item.y - offset + 135;
  return clamp((Math.min(place, 265 - place) - item.height / 2) / 50);
}

/** A finger on the screen this frame: whether it has just come down, and its height. */
export interface RollTouch {
  began: boolean;
  y: number;
}

/**
 * The roll's movement. It appears over half a second, then rolls on its own at 40 px a second,
 * slowing over the last 200 px; a finger drags it, and on leaving gives it the speed it had.
 */
export class CreditsRoll {
  offset = 0;
  speed = 40;
  /** Half a second of appearing, during which touches are not looked at. */
  appearing = true;
  private fade: number;
  private dragging = false;
  private lastY = 0;
  private dragSpeed = 0;

  /** `delay`: seconds before it starts to appear (0x28a18's third argument); nothing moves until then. */
  constructor(
    readonly total: number,
    delay = 0,
  ) {
    this.fade = -delay;
  }

  /** Opacity of the whole roll: it rises to a half while appearing and is full after. */
  get alpha(): number {
    return this.appearing ? Math.max(0, this.fade) : 1;
  }

  update(dt: number, touch: RollTouch | null): void {
    if (this.appearing) {
      this.fade += dt;
      if (this.fade > 0.5) {
        this.fade = 0.5;
        this.appearing = false;
      } else if (this.fade < 0) return;
    } else if (touch?.began) {
      this.lastY = touch.y;
      this.dragSpeed = 0;
      this.speed = 0;
      this.dragging = true;
      return;
    } else if (touch) {
      if (!this.dragging) return this.roll(dt);
      const moved = this.lastY - touch.y;
      this.lastY = touch.y;
      this.offset += moved;
      if (dt > 0) {
        const kept = 0.3 ** dt;
        this.dragSpeed = this.dragSpeed * kept + (moved / dt) * (1 - kept);
      }
    } else if (this.dragging) {
      this.dragging = false;
      this.speed = this.dragSpeed;
    }
    this.roll(dt);
  }

  private roll(dt: number): void {
    const room = this.speed > 0 ? this.total + 10 - this.offset : this.offset + 10;
    const pace = room / 200 >= 0 ? Math.min(1, room / 200) : 0;
    this.offset = Math.max(0, Math.min(this.total, this.offset + pace * dt * this.speed));
  }
}
