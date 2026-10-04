import { normalizeFontFamily } from '../../../shared/font-family'

/** What Chromium tells about one installed font (the Local Font Access API). */
interface LocalFont {
  family: string
}

export type FontSource = { queryLocalFonts?: () => Promise<LocalFont[]> }

/**
 * The families of the fonts installed on this PC, each once, in alphabetical order. Null when the
 * list cannot be had. Nothing leaves the PC for this: Chromium reads the fonts of Windows.
 */
export async function listInstalledFonts(
  source: FontSource = window as FontSource
): Promise<string[] | null> {
  if (typeof source.queryLocalFonts !== 'function') return null
  try {
    const families = new Set(
      (await source.queryLocalFonts())
        .map((font) => normalizeFontFamily(font.family))
        .filter(Boolean)
    )
    return [...families].sort((one, other) => one.localeCompare(other))
  } catch {
    return null
  }
}
