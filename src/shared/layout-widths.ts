import type { Lang } from './types'

// How the category row lays itself out for a given window width. The owner's rule (docs/review-2026-10-02,
// "默认窗口尺寸"): the default window is slender, so the seven categories stand in one row with the icon above
// the name; a wider window puts icon and name side by side; a narrower one keeps only the icons.
//
// The names differ in length between the languages, so the widths below are per language. They were
// measured once in the real app, with the real fonts, and e2e/layout-widths.spec.ts keeps them honest: at each
// width every name is whole, one pixel below it the tabs show icons only. They are constants and are never
// measured while the app runs. Widths are CSS pixels of the window, divided by the zoom setting.

/** How the seven categories are drawn. */
export type TabMode = 'icons' | 'stacked' | 'row'

/** How the global search is drawn in the window row. */
export type SearchMode = 'icon' | 'label' | 'full'

/**
 * The narrowest window at which all seven names stand whole under their icons. Measured: zh 284,
 * ja 362, en 450 (the widest names are 文件夹, フォルダ / コマンド and Commands); each is rounded up a
 * little so another machine's font rendering cannot tip a name into an ellipsis. The window cannot be
 * narrower than 320, so Chinese only reaches the icons-only layout through the zoom setting.
 * (Measured again after the glossary renamed the passwords tab and the Japanese interface got its
 * own fonts: en 442 with "Passwords", ja below 340 with Yu Gothic UI. The constants stay where they
 * were: they are safe, and the default widths below rest on them.)
 */
export const STACKED_MIN_WIDTH: Record<Lang, number> = {
  zh: 290,
  ja: 370,
  en: 460,
}

/**
 * The narrowest window at which all seven names stand whole beside their icons, with "new group" and
 * "add" at the right end of the same row. Measured: zh 602, ja 646, en 722, rounded up the same way
 * (ja was 686 before a Japanese interface got its own fonts, which draw kana narrower; en was 694
 * before the passwords tab was named "Passwords" instead of "Keys"; the constants of ja were left
 * where they were). The longest "add" label is the one of the command tab.
 */
export const ROW_MIN_WIDTH: Record<Lang, number> = {
  zh: 610,
  ja: 700,
  en: 732,
}

/**
 * The width a new installation opens at: slender, never square, and a little above the width the
 * names need so that rounding to device pixels cannot tip the tabs into icons only.
 */
export const DEFAULT_PANEL_WIDTH: Record<Lang, number> = {
  zh: 400,
  ja: 400,
  en: 470,
}

/** Below this the global search is only its magnifying glass. */
export const SEARCH_ICON_BELOW_WIDTH = 420

// The two widths above were measured with all seven categories. A user can hide categories in the
// settings; fewer tabs need less room, so the widths shrink with the count (the default window then
// moves to the one-row layout sooner). Both scalings are conservative: they never promise less width
// than the names need, whichever categories are the ones that are left.

/** How many categories the measured widths are for: all of them. */
export const MEASURED_TAB_COUNT = 7

/**
 * What the stacked row spends besides its tabs: the 12px of side padding on both ends, less one of the
 * 2px gaps (there is one gap fewer than there are tabs). The tabs share the rest equally, so what is
 * left over is the width one tab needs for the widest name.
 */
const STACKED_FIXED_WIDTH = 22

/**
 * The narrowest tab in the row layout, gap included: icon, name and padding of the shortest name.
 * Measured: zh 61 (two characters) + 2, ja 49 + 2 (a one-character name), en 61.9 + 2 (Passwords),
 * rounded down. Every category that is hidden takes at least this much off the row.
 */
export const ROW_TAB_MIN_WIDTH: Record<Lang, number> = {
  zh: 63,
  ja: 51,
  en: 63,
}

function clampTabCount(tabCount: number): number {
  if (!Number.isFinite(tabCount)) return MEASURED_TAB_COUNT

  return Math.min(MEASURED_TAB_COUNT, Math.max(1, Math.round(tabCount)))
}

/** `STACKED_MIN_WIDTH` for the number of categories that are shown (seven when omitted). */
export function stackedMinWidth(
  lang: Lang,
  tabCount: number = MEASURED_TAB_COUNT
): number {
  const count = clampTabCount(tabCount)
  const perTab = STACKED_MIN_WIDTH[lang] - STACKED_FIXED_WIDTH

  return STACKED_FIXED_WIDTH + Math.ceil((count * perTab) / MEASURED_TAB_COUNT)
}

/** `ROW_MIN_WIDTH` for the number of categories that are shown (seven when omitted). */
export function rowMinWidth(
  lang: Lang,
  tabCount: number = MEASURED_TAB_COUNT
): number {
  const hidden = MEASURED_TAB_COUNT - clampTabCount(tabCount)

  return ROW_MIN_WIDTH[lang] - hidden * ROW_TAB_MIN_WIDTH[lang]
}

export function resolveTabMode(
  lang: Lang,
  width: number,
  tabCount: number = MEASURED_TAB_COUNT
): TabMode {
  if (width >= rowMinWidth(lang, tabCount)) return 'row'
  if (width >= stackedMinWidth(lang, tabCount)) return 'stacked'

  return 'icons'
}

export function resolveSearchMode(
  lang: Lang,
  width: number,
  tabCount: number = MEASURED_TAB_COUNT
): SearchMode {
  if (width < SEARCH_ICON_BELOW_WIDTH) return 'icon'

  return resolveTabMode(lang, width, tabCount) === 'row' ? 'full' : 'label'
}
