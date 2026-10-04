import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { installSystemTheme, type SystemTheme } from '../../test/system-theme'
import { useSystemDark } from '../use-system-dark'

// The theme setting "follow the system" is drawn from this hook: whether Windows is in its dark
// mode, kept up to date while the window is open.
describe('useSystemDark', () => {
  let system: SystemTheme | undefined

  afterEach(() => {
    cleanup()
    system?.restore()
    system = undefined
  })

  it('takes Windows for light where the mode cannot be asked for', () => {
    // jsdom has no matchMedia, like a window that cannot tell.
    expect(typeof window.matchMedia).toBe('undefined')

    const { result } = renderHook(() => useSystemDark())

    expect(result.current).toBe(false)
  })

  it.each([true, false])(
    'knows on the first frame whether Windows is dark (%s)',
    (dark) => {
      system = installSystemTheme(dark)
      const frames: boolean[] = []

      renderHook(() => {
        const value = useSystemDark()
        frames.push(value)
        return value
      })

      // Not light first and dark a frame later: the panel would flash.
      expect(frames[0]).toBe(dark)
      expect(new Set(frames)).toEqual(new Set([dark]))
    }
  )

  it('asks for the colour scheme, not for anything else', () => {
    system = installSystemTheme(true)
    const matchMedia = vi.spyOn(window, 'matchMedia')

    renderHook(() => useSystemDark())

    expect(matchMedia).toHaveBeenCalled()
    for (const [query] of matchMedia.mock.calls) {
      expect(query).toBe('(prefers-color-scheme: dark)')
    }
  })

  it('follows Windows when it changes, in both directions, without a restart', () => {
    system = installSystemTheme(false)
    const { result } = renderHook(() => useSystemDark())
    expect(result.current).toBe(false)

    system.set(true)
    expect(result.current).toBe(true)

    system.set(false)
    expect(result.current).toBe(false)
  })

  it('stops listening when the component is gone', () => {
    system = installSystemTheme(false)
    const { unmount } = renderHook(() => useSystemDark())
    expect(system.listeners()).toBe(1)

    unmount()

    expect(system.listeners()).toBe(0)
  })

  it('catches a change that happened between the first frame and the start of listening', () => {
    let dark = false
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({
        // The first read (while rendering) is light; by the time the effect runs Windows is dark,
        // and no change event will be sent for that any more.
        get matches() {
          const now = dark
          dark = true
          return now
        },
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    try {
      const { result } = renderHook(() => useSystemDark())

      expect(result.current).toBe(true)
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia
    }
  })
})
