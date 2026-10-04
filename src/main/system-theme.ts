import { nativeTheme } from 'electron'

import type { Theme, ThemeSetting } from '../shared/types'

/** Whether Windows is in its dark mode right now. Unknown counts as light, the default theme. */
function systemPrefersDark(): boolean {
  // Reading the system's mode must never keep a window from opening.
  try {
    return nativeTheme.shouldUseDarkColors
  } catch {
    return false
  }
}

/**
 * The theme to draw for the saved setting: `system` is whatever Windows is in at this moment. The
 * panel follows a later change by itself (the `prefers-color-scheme` media query); the ball is told
 * through `onSystemThemeChange`.
 */
export function resolveThemeSetting(setting: ThemeSetting): Theme {
  return setting === 'system'
    ? systemPrefersDark()
      ? 'dark'
      : 'light'
    : setting
}

/** Calls `listener` whenever Windows switches between light and dark; returns how to stop. */
export function onSystemThemeChange(listener: () => void): () => void {
  try {
    nativeTheme.on('updated', listener)
    return () => {
      nativeTheme.removeListener('updated', listener)
    }
  } catch {
    return () => {}
  }
}
