import { beforeEach, describe, expect, it, vi } from 'vitest'

// A stand-in for Electron's nativeTheme: what Windows says about its light or dark mode, and the
// 'updated' event it sends when that changes. Both can be made to fail, as a system call can.
const system = vi.hoisted(() => ({
  dark: false,
  unreadable: false,
  deaf: false,
  listeners: [] as Array<() => void>,
}))

vi.mock('electron', () => ({
  nativeTheme: {
    get shouldUseDarkColors(): boolean {
      if (system.unreadable) throw new Error('theme is not available')
      return system.dark
    },
    on(event: string, listener: () => void): void {
      if (system.deaf) throw new Error('cannot listen')
      if (event === 'updated') system.listeners.push(listener)
    },
    removeListener(event: string, listener: () => void): void {
      if (event !== 'updated') return
      const index = system.listeners.indexOf(listener)
      if (index >= 0) system.listeners.splice(index, 1)
    },
  },
}))

import { THEMES, THEME_SETTINGS } from '../../shared/types'
import { onSystemThemeChange, resolveThemeSetting } from '../system-theme'

/** Windows switches its mode and says so. */
function switchSystem(dark: boolean): void {
  system.dark = dark
  for (const listener of [...system.listeners]) listener()
}

beforeEach(() => {
  system.dark = false
  system.unreadable = false
  system.deaf = false
  system.listeners.length = 0
})

describe('resolveThemeSetting', () => {
  it.each([
    ['light', false],
    ['light', true],
    ['dark', false],
    ['dark', true],
  ] as const)(
    'keeps %s, the theme the user chose, whatever Windows is in (dark: %s)',
    (setting, systemDark) => {
      system.dark = systemDark

      expect(resolveThemeSetting(setting)).toBe(setting)
    }
  )

  it('follows Windows for "system": dark in its dark mode, light otherwise', () => {
    system.dark = true
    expect(resolveThemeSetting('system')).toBe('dark')

    system.dark = false
    expect(resolveThemeSetting('system')).toBe('light')
  })

  it('reads the mode of Windows at the moment it is asked', () => {
    expect(resolveThemeSetting('system')).toBe('light')
    switchSystem(true)
    expect(resolveThemeSetting('system')).toBe('dark')
    switchSystem(false)
    expect(resolveThemeSetting('system')).toBe('light')
  })

  it('is light, the default theme, when the mode of Windows cannot be read', () => {
    system.unreadable = true
    system.dark = true

    expect(resolveThemeSetting('system')).toBe('light')
    // A chosen theme does not need the system at all.
    expect(resolveThemeSetting('dark')).toBe('dark')
  })

  it('always comes to a theme that can be drawn', () => {
    for (const dark of [false, true]) {
      system.dark = dark
      for (const setting of THEME_SETTINGS)
        expect(THEMES).toContain(resolveThemeSetting(setting))
    }
  })
})

describe('onSystemThemeChange', () => {
  it('calls the listener every time Windows switches its mode', () => {
    const listener = vi.fn()
    onSystemThemeChange(listener)
    expect(listener).not.toHaveBeenCalled()

    switchSystem(true)
    switchSystem(false)

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stops calling a listener that unsubscribed, and leaves the others', () => {
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = onSystemThemeChange(first)
    onSystemThemeChange(second)

    switchSystem(true)
    stopFirst()
    switchSystem(false)

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
    expect(system.listeners).toHaveLength(1)
  })

  it('can be unsubscribed twice without harm', () => {
    const stop = onSystemThemeChange(vi.fn())

    stop()
    expect(() => stop()).not.toThrow()
    expect(system.listeners).toHaveLength(0)
  })

  it('gives back something to call even when Windows cannot be listened to', () => {
    system.deaf = true
    const listener = vi.fn()

    const stop = onSystemThemeChange(listener)

    expect(() => stop()).not.toThrow()
    expect(listener).not.toHaveBeenCalled()
  })
})
