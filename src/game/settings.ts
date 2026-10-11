import { isLanguage, type Language } from '../data/strings';

const KEY = 'am2web.settings.v1';

/** What the options dialog changes; kept in the browser like the progress. */
export interface Settings {
  /** Volumes from 0 to 1. */
  sound: number;
  music: number;
  language: Language;
  /** Use the enlarged images when they have been generated. */
  enlarged: boolean;
  /** The three switches of the options (0x2220). Turning with the device does nothing here. */
  autoOrientate: boolean;
  showTips: boolean;
  bubbleClicking: boolean;
  /** The colour table chosen in the colour help, 0 to 3 (the original keeps it in the profile, `+0x50`). */
  palette: number;
}

// The switches start on: the bytes they keep (0x1781e0, 0x181310) are 1 in the binary.
const DEFAULTS: Settings = { sound: 1, music: 1, language: 'spanish', enlarged: true, autoOrientate: true, showTips: true, bubbleClicking: true, palette: 0 };
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
const unit = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback);

/** Reads stored settings, falling back to the defaults for anything missing or malformed. */
export function parseSettings(raw: string | null): Settings {
  try {
    const stored = JSON.parse(raw ?? '{}') as Partial<Record<keyof Settings, unknown>>;
    return {
      sound: unit(stored.sound, DEFAULTS.sound),
      music: unit(stored.music, DEFAULTS.music),
      language: typeof stored.language === 'string' && isLanguage(stored.language) ? stored.language : DEFAULTS.language,
      enlarged: typeof stored.enlarged === 'boolean' ? stored.enlarged : DEFAULTS.enlarged,
      autoOrientate: flag(stored.autoOrientate, DEFAULTS.autoOrientate),
      showTips: flag(stored.showTips, DEFAULTS.showTips),
      bubbleClicking: flag(stored.bubbleClicking, DEFAULTS.bubbleClicking),
      palette: typeof stored.palette === 'number' && Number.isInteger(stored.palette) && stored.palette >= 0 && stored.palette < 4 ? stored.palette : DEFAULTS.palette,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode); the settings then last for this page only.
  }
}
