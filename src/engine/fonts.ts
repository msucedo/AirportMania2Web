import type { Resources } from '../data/resources';

/** Loads the game's TrueType fonts so canvas and Pixi text can use them by family name. */
export async function loadFonts(resources: Resources, ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(async (id) => {
      const file = resources.fontFile(id);
      if (!file) return;
      const face = new FontFace(fontFamily(id), `url(${resources.url(file)})`);
      try {
        document.fonts.add(await face.load());
      } catch (error) {
        console.warn(`Could not load font ${id}`, error);
      }
    }),
  );
}

/** CSS family name used for a font resource id such as `FONTS.KENYAN_COFFEE_BD`. */
export function fontFamily(id: string): string {
  return `am2-${id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}
