import {
  BACKGROUNDS,
  type BackgroundKey,
  type Theme,
} from '../../../shared/types'

/**
 * The accent colour the user picks (stored as `prefs.background`, with the old key names). Each
 * choice is four values and nothing else: the colour used as text, icons and focus rings on the
 * dark and on the light theme, and the solid fill that carries white text on each. Everything
 * derived from them (the hover fill, the soft fill, the border) is worked out by themes.css.
 *
 * The values were chosen for their contrast ratios on the surfaces they sit on;
 * background-theme.test.ts recomputes every one of them. "forest" is teal on purpose:
 * green already means "done" and "saved" in the interface, and a green accent would look like it.
 */
type AccentChoice = {
  dark: string
  light: string
  solidDark: string
  solidLight: string
}

export const ACCENT_CHOICES: Record<BackgroundKey, AccentChoice> = {
  // Violet, the app icon's colour.
  aurora: {
    dark: '#a594ff',
    light: '#5544da',
    solidDark: '#6553e4',
    solidLight: '#5544da',
  },
  // Coral.
  sunset: {
    dark: '#ffa57a',
    light: '#a8390b',
    solidDark: '#c2410c',
    solidLight: '#c2410c',
  },
  // Teal.
  forest: {
    dark: '#62d0dc',
    light: '#0f6e7a',
    solidDark: '#0e7490',
    solidLight: '#0e7490',
  },
  // Blue.
  ocean: {
    dark: '#7cb7ff',
    light: '#1b58c4',
    solidDark: '#2563eb',
    solidLight: '#1d4ed8',
  },
  // Graphite, the default.
  minimal: {
    dark: '#b4bfd3',
    light: '#475569',
    solidDark: '#52607a',
    solidLight: '#475569',
  },
  // Monokai's yellow. This choice is a whole palette: themes.css also warms the surfaces and the
  // text for it, and gives the yellow fills a dark text instead of the white one.
  monokai: {
    dark: '#ffd866',
    light: '#7a4800',
    solidDark: '#ffd866',
    solidLight: '#f2bd3a',
  },
}

/**
 * Stored prefs are untrusted, and absent until the data has loaded: anything that is not a choice
 * is drawn in aurora, the violet of the app icon and of the loading screen.
 */
export function resolveBackground(background: unknown): BackgroundKey {
  return typeof background === 'string' &&
    (BACKGROUNDS as readonly string[]).includes(background)
    ? (background as BackgroundKey)
    : 'aurora'
}

/**
 * The theme to draw for the saved setting. `system` follows Windows (`systemDark` says which mode it
 * is in). Stored prefs are untrusted: an unknown theme falls back to light, the default.
 */
export function resolveTheme(theme: unknown, systemDark = false): Theme {
  if (theme === 'system') return systemDark ? 'dark' : 'light'

  return theme === 'dark' ? 'dark' : 'light'
}

/** The solid fill of a choice in a theme: what the dot in the settings shows. */
export function getAccentSolid(theme: Theme, key: BackgroundKey): string {
  const choice = ACCENT_CHOICES[resolveBackground(key)]

  return theme === 'light' ? choice.solidLight : choice.solidDark
}

/** The two tokens a choice sets; the rest of the accent family is derived from them by CSS. */
export function getBackgroundUiVariables(
  theme: Theme,
  background: BackgroundKey
): Record<string, string> {
  const choice = ACCENT_CHOICES[resolveBackground(background)]

  return {
    '--accent': theme === 'light' ? choice.light : choice.dark,
    '--accent-solid': getAccentSolid(theme, background),
  }
}
