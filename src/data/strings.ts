/** Localised text table produced by the importer: `{ "NAMESPACE.NAME": text }`. */
export class Strings {
  constructor(
    readonly language: string,
    private readonly table: Record<string, string>,
  ) {}

  has(id: string): boolean {
    return id in this.table;
  }

  /** Text for an id, with printf-style `%d` / `%s` filled in order. Unknown ids come back as-is. */
  t(id: string, ...args: (string | number)[]): string {
    const text = this.table[id];
    if (text === undefined) return id;
    let next = 0;
    return text.replace(/%[ds]/g, () => String(args[next++] ?? ''));
  }
}

export const LANGUAGES = ['english', 'spanish', 'portuguese', 'german', 'french', 'italian', 'dutch', 'swedish'] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: string | null): value is Language {
  return value !== null && (LANGUAGES as readonly string[]).includes(value);
}
