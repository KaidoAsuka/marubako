/**
 * The font of the interface (Prefs.fontFamily): the family name of one font installed on this PC,
 * or nothing, which leaves the fonts the language comes with. The main process cleans the name
 * when the data is read; the interface puts it in front of its own list of fonts, so that a font
 * that is gone (another PC, an uninstalled font) simply falls back to those.
 */

/** Longer than any family name; a name that is longer was not a family name. */
export const MAX_FONT_FAMILY_LENGTH = 80

/** What must not be in a name that is written into a stylesheet value between quotes. */
function isUnsafe(character: string): boolean {
  return character < ' ' || '"\'\\;{}<>'.includes(character)
}

export function normalizeFontFamily(value: unknown): string {
  if (typeof value !== 'string') return ''
  return [...value]
    .filter((character) => !isUnsafe(character))
    .join('')
    .trim()
    .slice(0, MAX_FONT_FAMILY_LENGTH)
}

/** The name as a value for `font-family`, or nothing for the default. */
export function fontFamilyCss(family: string): string {
  const name = normalizeFontFamily(family)
  return name ? `"${name}"` : ''
}
