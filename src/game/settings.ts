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
}

const DEFAULTS: Settings = { sound: 1, music: 1, language: 'spanish', enlarged: true };
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
