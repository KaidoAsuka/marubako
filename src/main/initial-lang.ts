import { app } from 'electron'

import { resolveSystemLang } from '../shared/system-lang'
import type { Lang } from '../shared/types'

/** What the operating system says about the user's language, most preferred first. */
function systemLocales(): string[] {
  const locales: string[] = []
  // Reading the locale must never keep the app from starting.
  try {
    locales.push(app.getLocale())
  } catch {
    // Not available: fall through to the next source.
  }
  try {
    locales.push(...app.getPreferredSystemLanguages())
  } catch {
    // Not available either: English it is.
  }
  return locales
}

/**
 * The language a NEW installation starts in (data that already exists keeps its own). It follows
 * the system: zh* is Chinese, ja* is Japanese, anything else English.
 *
 * `QUICKLAUNCH_LOCALE` poses as another computer's locale (for tests, and for reproducing a bug
 * report from one). The end-to-end runs set `QUICKLAUNCH_E2E`, and without a locale of their own
 * they start in Chinese whatever machine they run on, so that their assertions do not depend on it.
 */
export function detectInitialLang(env: NodeJS.ProcessEnv = process.env): Lang {
  const forced = env.QUICKLAUNCH_LOCALE
  if (forced) return resolveSystemLang([forced])
  if (env.QUICKLAUNCH_E2E === '1') return 'zh'
  return resolveSystemLang(systemLocales())
}
