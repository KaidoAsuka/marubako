import { act, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultAppData } from '../../../../shared/default-data'
import type { WindowSnapshot } from '../../../../shared/types'
import { workspaceStrings } from '../../i18n/workspace'
import { useAppStore } from '../../store/use-app-store'
import { useAppShortcuts } from '../use-app-shortcuts'

describe('panel activation shortcuts', () => {
  let activate: () => void
  beforeEach(() => {
    useAppStore.setState({
      commandOpen: false,
      modal: null,
      widgetPopup: null,
      currentTab: 'commands',
    })
    vi.mocked(window.quickLaunch.onActivate).mockImplementation((callback) => {
      activate = callback
      return () => {}
    })
  })

  it('reopens the current category without a search dialog', async () => {
    renderHook(useAppShortcuts)
    await act(async () => {
      activate()
    })
    expect(useAppStore.getState().commandOpen).toBe(false)
    expect(useAppStore.getState().currentTab).toBe('commands')
  })

  it('dismisses an old search when the panel is recalled', async () => {
    useAppStore.setState({ commandOpen: true })
    renderHook(useAppShortcuts)
    await act(async () => {
      activate()
    })
    expect(useAppStore.getState().commandOpen).toBe(false)
  })

  it('still opens search explicitly with Ctrl+K', () => {
    renderHook(useAppShortcuts)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(useAppStore.getState().commandOpen).toBe(true)
  })
})

describe('revealed passwords', () => {
  let activate: () => void
  let pushState: (state: WindowSnapshot) => void = () => {}

  beforeEach(() => {
    vi.mocked(window.quickLaunch.onActivate).mockImplementation((callback) => {
      activate = callback
      return () => {}
    })
    vi.mocked(window.quickLaunch.onWindowState).mockImplementation(
      (callback) => {
        pushState = callback
        return () => {}
      }
    )
    useAppStore.setState({
      revealedPasswordIds: ['password-1'],
      windowState: {
        alwaysOnTop: false,
        collapsed: false,
        opacity: 1,
        mode: 'window',
      },
    })
  })

  afterEach(() => {
    vi.mocked(window.quickLaunch.onWindowState).mockImplementation(
      () => () => {}
    )
  })

  it('masks them again when the panel collapses into the ball', () => {
    renderHook(useAppShortcuts)
    act(() => {
      pushState({ alwaysOnTop: false, collapsed: true, opacity: 1 })
    })
    expect(useAppStore.getState().revealedPasswordIds).toEqual([])
  })

  it('masks them again on every recall, also after a hide that never collapsed (no ball)', async () => {
    renderHook(useAppShortcuts)
    // With the ball switched off, the shortcut hides the panel to the tray and reports it as not collapsed.
    act(() => {
      pushState({ alwaysOnTop: false, collapsed: false, opacity: 1 })
    })
    expect(useAppStore.getState().revealedPasswordIds).toEqual(['password-1'])

    await act(async () => {
      activate()
    })
    expect(useAppStore.getState().revealedPasswordIds).toEqual([])
  })
})

describe('dock hint toasts', () => {
  it('falls back to zh strings when the stored language is unknown', () => {
    let pushState: (state: WindowSnapshot) => void = () => {}
    vi.mocked(window.quickLaunch.onWindowState).mockImplementation(
      (callback) => {
        pushState = callback
        return () => {}
      }
    )
    const data = createDefaultAppData()
    ;(data.prefs as { lang: unknown }).lang = 'fr'
    useAppStore.setState({ data, toast: null })
    localStorage.removeItem('dock-hint-seen')
    renderHook(useAppShortcuts)

    act(() => {
      pushState({
        alwaysOnTop: false,
        collapsed: false,
        opacity: 1,
        mode: 'peek',
      })
    })

    expect(useAppStore.getState().toast?.message).toBe(
      workspaceStrings.zh.dock_tip
    )
  })

  describe('and the first-run card, which says the same thing', () => {
    let pushState: (state: WindowSnapshot) => void = () => {}
    const peek = () =>
      act(() => {
        pushState({
          alwaysOnTop: false,
          collapsed: false,
          opacity: 1,
          mode: 'peek',
        })
      })

    beforeEach(() => {
      vi.mocked(window.quickLaunch.onWindowState).mockImplementation(
        (callback) => {
          pushState = callback
          return () => {}
        }
      )
      useAppStore.setState({ data: createDefaultAppData(), toast: null })
      localStorage.removeItem('dock-hint-seen')
      localStorage.removeItem('onboarding-v1')
    })

    it('is not shown while the card is open, and not used up either', () => {
      localStorage.setItem(
        'onboarding-v1',
        JSON.stringify({ dismissed: false })
      )
      renderHook(useAppShortcuts)

      peek()

      expect(useAppStore.getState().toast).toBeNull()
      expect(localStorage.getItem('dock-hint-seen')).toBeNull()
    })

    it('is shown, for six seconds, once the card has been closed', () => {
      localStorage.setItem('onboarding-v1', JSON.stringify({ dismissed: true }))
      renderHook(useAppShortcuts)

      peek()

      expect(useAppStore.getState().toast).toMatchObject({
        message: workspaceStrings.zh.dock_tip,
        duration: 6000,
      })
      expect(localStorage.getItem('dock-hint-seen')).toBe('1')
    })

    it('is shown to an installation that never had the card', () => {
      renderHook(useAppShortcuts)

      peek()

      expect(useAppStore.getState().toast?.message).toBe(
        workspaceStrings.zh.dock_tip
      )
    })
  })
})

describe('window blur and the group popup', () => {
  const popup = { tab: 'websites', groupId: 'group-1' } as const
  let activate: () => void

  beforeEach(() => {
    vi.mocked(window.quickLaunch.onActivate).mockImplementation((callback) => {
      activate = callback
      return () => {}
    })
    useAppStore.setState({
      commandOpen: false,
      modal: null,
      widgetPopup: popup,
      windowState: {
        alwaysOnTop: false,
        collapsed: false,
        opacity: 1,
        mode: 'window',
      },
    })
  })

  it('keeps the popup open when a pinned-open window loses focus', () => {
    renderHook(useAppShortcuts)
    window.dispatchEvent(new Event('blur'))
    expect(useAppStore.getState().widgetPopup).toEqual(popup)
  })

  it('closes the popup when a temporary peek expansion loses focus', () => {
    useAppStore.setState({
      windowState: {
        alwaysOnTop: false,
        collapsed: false,
        opacity: 1,
        mode: 'peek',
      },
    })
    renderHook(useAppShortcuts)
    window.dispatchEvent(new Event('blur'))
    expect(useAppStore.getState().widgetPopup).toBeNull()
  })

  it('keeps the popup while a dialog owns the focus, even in peek mode', () => {
    useAppStore.setState({
      windowState: {
        alwaysOnTop: false,
        collapsed: false,
        opacity: 1,
        mode: 'peek',
      },
      modal: {
        kind: 'item',
        tab: 'websites',
        groupId: 'group-1',
        itemId: null,
      },
    })
    renderHook(useAppShortcuts)
    window.dispatchEvent(new Event('blur'))
    expect(useAppStore.getState().widgetPopup).toEqual(popup)
  })

  it('still dismisses the search palette on blur', () => {
    useAppStore.setState({ commandOpen: true, widgetPopup: null })
    renderHook(useAppShortcuts)
    window.dispatchEvent(new Event('blur'))
    expect(useAppStore.getState().commandOpen).toBe(false)
  })

  it('clears the popup when search opens, but not when it closes', () => {
    useAppStore.getState().setCommandOpen(false)
    expect(useAppStore.getState().widgetPopup).toEqual(popup)
    useAppStore.getState().setCommandOpen(true)
    expect(useAppStore.getState().widgetPopup).toBeNull()
  })

  it('returns to a clean state when the panel is recalled', async () => {
    renderHook(useAppShortcuts)
    await act(async () => {
      activate()
    })
    expect(useAppStore.getState().widgetPopup).toBeNull()
  })
})

describe('crossing midnight while the app stays resident', () => {
  const DAY_ONE = '2026-03-10'
  const DAY_TWO = '2026-03-11'
  const openWindow: WindowSnapshot = {
    alwaysOnTop: false,
    collapsed: false,
    opacity: 1,
    mode: 'window',
  }

  const clockAt = (year: number, month: number, day: number, hour = 9) =>
    vi.setSystemTime(new Date(year, month - 1, day, hour, 0, 0))

  // The "which day was today" bookkeeping lives at module level, like the store's initial
  // selectedDate, so every test loads fresh copies of both while the fake clock says day one.
  async function startOnDayOne() {
    clockAt(2026, 3, 10)
    vi.resetModules()
    const { useAppStore: store } = await import('../../store/use-app-store')
    const { useAppShortcuts: hook } = await import('../use-app-shortcuts')
    let activate: () => void = () => {}
    let pushState: (state: WindowSnapshot) => void = () => {}
    vi.mocked(window.quickLaunch.onActivate).mockImplementation((callback) => {
      activate = callback
      return () => {}
    })
    vi.mocked(window.quickLaunch.onWindowState).mockImplementation(
      (callback) => {
        pushState = callback
        return () => {}
      }
    )
    store.setState({
      data: createDefaultAppData(),
      currentTab: 'tasks',
      windowState: openWindow,
    })
    expect(store.getState().selectedDate).toBe(DAY_ONE)
    const { unmount } = renderHook(hook)
    return {
      store,
      unmount,
      activate: () => act(async () => activate()),
      pushState: (state: WindowSnapshot) => act(() => pushState(state)),
    }
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('moves a task page that was on "today" forward when the panel is recalled', async () => {
    const { store, activate } = await startOnDayOne()
    clockAt(2026, 3, 11)
    await activate()
    expect(store.getState().selectedDate).toBe(DAY_TWO)
  })

  it('moves forward when the window expands out of the collapsed ball', async () => {
    const { store, pushState } = await startOnDayOne()
    clockAt(2026, 3, 11)
    pushState(openWindow)
    expect(store.getState().selectedDate).toBe(DAY_TWO)
  })

  it('does not check the date while the window collapses', async () => {
    const { store, pushState } = await startOnDayOne()
    clockAt(2026, 3, 11)
    pushState({ ...openWindow, collapsed: true })
    expect(store.getState().selectedDate).toBe(DAY_ONE)
  })

  it('moves forward when an already open panel regains focus on the new day', async () => {
    const { store } = await startOnDayOne()
    clockAt(2026, 3, 11)
    window.dispatchEvent(new Event('focus'))
    expect(store.getState().selectedDate).toBe(DAY_TWO)
  })

  it('creates a Ctrl+N task for the new day after the rollover', async () => {
    const { store } = await startOnDayOne()
    clockAt(2026, 3, 11)
    window.dispatchEvent(new Event('focus'))
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
    expect(store.getState().modal).toEqual({
      kind: 'task',
      date: DAY_TWO,
      taskId: null,
    })
  })

  it('leaves a day the user chose on purpose alone', async () => {
    const { store, activate } = await startOnDayOne()
    store.setState({ selectedDate: '2026-03-20' })
    clockAt(2026, 3, 11)
    await activate()
    expect(store.getState().selectedDate).toBe('2026-03-20')
  })

  it('only follows a day once, so a later manual pick is respected', async () => {
    const { store, activate } = await startOnDayOne()
    clockAt(2026, 3, 11)
    await activate()
    store.setState({ selectedDate: DAY_ONE })
    window.dispatchEvent(new Event('focus'))
    expect(store.getState().selectedDate).toBe(DAY_ONE)
  })

  it('does nothing within the same day', async () => {
    const { store, activate } = await startOnDayOne()
    clockAt(2026, 3, 10, 23)
    await activate()
    window.dispatchEvent(new Event('focus'))
    expect(store.getState().selectedDate).toBe(DAY_ONE)
  })

  // A panel that stays open or pinned across midnight gets no focus, activate or window-state event,
  // so the day has to be noticed by a timer. Both Date and the timers are faked here.
  describe('with no focus or activate event at all', () => {
    beforeEach(() => {
      vi.useRealTimers()
      vi.useFakeTimers()
    })

    it('moves a page that was on "today" forward once the clock passes midnight', async () => {
      const { store } = await startOnDayOne()
      vi.setSystemTime(new Date(2026, 2, 10, 23, 59, 50))

      act(() => {
        vi.advanceTimersByTime(5_000)
      })
      expect(store.getState().selectedDate).toBe(DAY_ONE)

      act(() => {
        vi.advanceTimersByTime(30_000)
      })
      expect(store.getState().selectedDate).toBe(DAY_TWO)
    })

    it('creates a Ctrl+N task for the new day after the timer followed it', async () => {
      const { store } = await startOnDayOne()
      clockAt(2026, 3, 11)

      act(() => {
        vi.advanceTimersByTime(30_000)
      })
      fireEvent.keyDown(window, { key: 'n', ctrlKey: true })

      expect(store.getState().modal).toEqual({
        kind: 'task',
        date: DAY_TWO,
        taskId: null,
      })
    })

    it('leaves a day the user chose on purpose alone', async () => {
      const { store } = await startOnDayOne()
      store.setState({ selectedDate: '2026-03-20' })
      clockAt(2026, 3, 11)

      act(() => {
        vi.advanceTimersByTime(60_000)
      })

      expect(store.getState().selectedDate).toBe('2026-03-20')
    })

    it('does nothing while the day stays the same', async () => {
      const { store } = await startOnDayOne()
      clockAt(2026, 3, 10, 23)

      act(() => {
        vi.advanceTimersByTime(5 * 60_000)
      })

      expect(store.getState().selectedDate).toBe(DAY_ONE)
    })

    it('also catches up when the window becomes visible again after sleep', async () => {
      const { store } = await startOnDayOne()
      clockAt(2026, 3, 11)

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })

      expect(store.getState().selectedDate).toBe(DAY_TWO)
    })

    it('stops following once the hook is unmounted', async () => {
      const { store, unmount } = await startOnDayOne()
      const running = vi.getTimerCount()
      unmount()
      expect(vi.getTimerCount()).toBeLessThan(running)
      clockAt(2026, 3, 11)

      act(() => {
        vi.advanceTimersByTime(60_000)
        document.dispatchEvent(new Event('visibilitychange'))
      })

      expect(store.getState().selectedDate).toBe(DAY_ONE)
    })
  })
})
