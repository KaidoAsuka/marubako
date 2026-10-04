import { ALL_TABS, type Tab } from './types'

/**
 * Which categories the user sees. All seven are shown by default; `Prefs.hiddenTabs` lists the ones
 * switched off in the settings. Hiding only stops a category from being shown (the tab, the search,
 * Alt+number, the "add" targets): its data is never touched, so showing it again brings everything back.
 */

/**
 * The hidden categories as a clean list: only known categories, each once, in the fixed category order.
 * At least one category always stays visible: a list that would hide all seven keeps the first one.
 * Anything that is not a list (old data without the setting, a damaged file) hides nothing.
 */
export function normalizeHiddenTabs(input: unknown): Tab[] {
  if (!Array.isArray(input)) return []

  const hidden = ALL_TABS.filter((tab) => input.includes(tab))
  if (hidden.length >= ALL_TABS.length) {
    return hidden.filter((tab) => tab !== ALL_TABS[0])
  }

  return hidden
}

/** The categories to show, in the fixed order. Never empty. */
export function visibleTabs(hiddenTabs: unknown): Tab[] {
  const hidden = normalizeHiddenTabs(hiddenTabs)

  return ALL_TABS.filter((tab) => !hidden.includes(tab))
}

export function isTabVisible(tab: Tab, hiddenTabs: unknown): boolean {
  return visibleTabs(hiddenTabs).includes(tab)
}

/** The category the app opens on: the first one that is shown. */
export function firstVisibleTab(hiddenTabs: unknown): Tab {
  return visibleTabs(hiddenTabs)[0] ?? ALL_TABS[0]
}

/** `tab` itself when it is shown, otherwise the first category that is. */
export function resolveVisibleTab(tab: Tab, hiddenTabs: unknown): Tab {
  return isTabVisible(tab, hiddenTabs) ? tab : firstVisibleTab(hiddenTabs)
}
