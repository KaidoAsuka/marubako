import { LANGS, THEMES, type Lang, type Theme } from './types'

/**
 * What the main process puts in the URL of a window, so that the window's first frame is already
 * right: the saved language and theme, and whether this run shows the first-run guidance. The
 * renderer reads them before any data has arrived (startup-params.ts there).
 */
export interface StartupParams {
  lang: Lang | null
  theme: Theme | null
  /** Show the first-run guidance (until the user has dismissed it for good). */
  firstRun: boolean
}

const LANG_KEY = 'lang'
const THEME_KEY = 'theme'
const FIRST_RUN_KEY = 'firstrun'

/** The query parameters for `params`; absent values are left out. */
export function toStartupQuery(
  params: Partial<StartupParams>
): Record<string, string> {
  const query: Record<string, string> = {}
  if (params.lang) query[LANG_KEY] = params.lang
  if (params.theme) query[THEME_KEY] = params.theme
  if (params.firstRun) query[FIRST_RUN_KEY] = '1'
  return query
}

/** Reads `toStartupQuery`'s parameters back from a location's search string. Unknown values are null. */
export function parseStartupParams(search: string): StartupParams {
  const query = new URLSearchParams(search)
  const lang = query.get(LANG_KEY)
  const theme = query.get(THEME_KEY)

  return {
    lang: (LANGS as readonly string[]).includes(lang ?? '')
      ? (lang as Lang)
      : null,
    theme: (THEMES as readonly string[]).includes(theme ?? '')
      ? (theme as Theme)
      : null,
    firstRun: query.get(FIRST_RUN_KEY) === '1',
  }
}
