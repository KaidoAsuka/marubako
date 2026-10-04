import { act } from '@testing-library/react'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export interface SystemTheme {
  /** Switches Windows between its light and dark mode and tells the page, as the real one does. */
  set: (dark: boolean) => void
  /** How many listeners are waiting for the mode to change. */
  listeners: () => number
  /** Puts back the `matchMedia` that was there (jsdom has none). */
  restore: () => void
}

/**
 * A stand-in for the light or dark mode of Windows: jsdom has no `matchMedia`. The query
 * `(prefers-color-scheme: dark)` follows `set`; every other query does not match.
 */
export function installSystemTheme(dark = false): SystemTheme {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia')
  const listeners = new Set<() => void>()
  let current = dark

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const follows = query === DARK_QUERY

      return {
        media: query,
        get matches() {
          return follows && current
        },
        addEventListener: (type: string, listener: () => void) => {
          if (follows && type === 'change') listeners.add(listener)
        },
        removeEventListener: (type: string, listener: () => void) => {
          if (follows && type === 'change') listeners.delete(listener)
        },
      }
    },
  })

  return {
    set: (next) => {
      act(() => {
        current = next
        for (const listener of [...listeners]) listener()
      })
    },
    listeners: () => listeners.size,
    restore: () => {
      if (original) Object.defineProperty(window, 'matchMedia', original)
      else delete (window as { matchMedia?: unknown }).matchMedia
    },
  }
}
