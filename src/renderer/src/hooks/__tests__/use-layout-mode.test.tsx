import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import {
  ROW_MIN_WIDTH,
  STACKED_MIN_WIDTH,
} from '../../../../shared/layout-widths'
import type { Lang } from '../../../../shared/types'
import { useAppStore } from '../../store/use-app-store'
import { INITIAL_WINDOW_WIDTH, resizeWindow } from '../../test/resize-window'
import { useLayoutMode } from '../use-layout-mode'

function load(lang: Lang, zoom = 1): void {
  const data = createDefaultAppData()
  data.prefs.lang = lang
  data.prefs.zoom = zoom
  useAppStore.setState({ data })
}

describe('useLayoutMode', () => {
  beforeEach(() => {
    load('zh')
  })

  afterEach(() => {
    cleanup()
    resizeWindow(INITIAL_WINDOW_WIDTH)
  })

  it('reads the window width the first time it renders, not one frame later', () => {
    resizeWindow(400)

    const { result } = renderHook(() => useLayoutMode())

    expect(result.current).toEqual({ tabMode: 'stacked', searchMode: 'icon' })
  })

  it.each([
    [280, 'icons', 'icon'],
    [400, 'stacked', 'icon'],
    [440, 'stacked', 'label'],
    [700, 'row', 'full'],
  ] as const)(
    'is %i px wide: tabs %s, search %s (Chinese)',
    (width, tabs, search) => {
      resizeWindow(width)

      const { result } = renderHook(() => useLayoutMode())

      expect(result.current).toEqual({ tabMode: tabs, searchMode: search })
    }
  )

  it('follows the window as it is resized', () => {
    resizeWindow(400)
    const { result } = renderHook(() => useLayoutMode())
    expect(result.current.tabMode).toBe('stacked')

    resizeWindow(900)
    expect(result.current.tabMode).toBe('row')

    resizeWindow(280)
    expect(result.current.tabMode).toBe('icons')
  })

  it('does not render again for a resize that stays inside one layout', () => {
    resizeWindow(500)
    let renders = 0
    const { result } = renderHook(() => {
      renders += 1
      return useLayoutMode()
    })
    const first = result.current
    const before = renders

    for (const width of [501, 520, 560, 600]) resizeWindow(width)

    expect(renders).toBe(before)
    expect(result.current).toBe(first)
  })

  it('uses the thresholds of the stored language', () => {
    load('en')
    resizeWindow(STACKED_MIN_WIDTH.en - 1)
    const { result } = renderHook(() => useLayoutMode())
    expect(result.current.tabMode).toBe('icons')

    resizeWindow(STACKED_MIN_WIDTH.en)
    expect(result.current.tabMode).toBe('stacked')

    resizeWindow(ROW_MIN_WIDTH.en)
    expect(result.current.tabMode).toBe('row')
  })

  it('moves to the thresholds of another language as soon as the language changes', () => {
    resizeWindow(400)
    const { result } = renderHook(() => useLayoutMode())
    expect(result.current.tabMode).toBe('stacked')

    act(() => load('en'))

    expect(result.current.tabMode).toBe('icons')
  })

  it('treats an unknown stored language as Chinese', () => {
    const data = createDefaultAppData()
    Object.assign(data.prefs, { lang: 'fr' })
    useAppStore.setState({ data })
    resizeWindow(400)

    const { result } = renderHook(() => useLayoutMode())

    expect(result.current.tabMode).toBe('stacked')
  })

  it('counts the zoom setting as less room: a 1.5 zoom makes a 400 px window 267 px', () => {
    load('zh', 1.5)
    resizeWindow(400)

    const { result } = renderHook(() => useLayoutMode())

    expect(result.current.tabMode).toBe('icons')
  })

  it('keeps a window at 125% zoom that is wide enough in the stacked layout', () => {
    load('zh', 1.25)
    resizeWindow(400)

    const { result } = renderHook(() => useLayoutMode())

    expect(result.current.tabMode).toBe('stacked')
  })

  it('follows the interface size being previewed in the settings dialog', () => {
    resizeWindow(400)
    const { result } = renderHook(() => useLayoutMode())
    expect(result.current.tabMode).toBe('stacked')

    // 1.5 makes the 400 px window 267 px of interface: icons only. Nothing is saved.
    act(() => useAppStore.getState().setPreviewPrefs({ zoom: 1.5 }))
    expect(result.current.tabMode).toBe('icons')
    expect(useAppStore.getState().data?.prefs.zoom).toBe(1)

    act(() => useAppStore.getState().setPreviewPrefs(null))
    expect(result.current.tabMode).toBe('stacked')
  })

  it('uses the thresholds for the number of categories that are shown', () => {
    resizeWindow(400)
    const { result } = renderHook(() => useLayoutMode())
    expect(result.current.tabMode).toBe('stacked')

    // Three Chinese names fit beside their icons in 400 px.
    act(() => {
      const data = createDefaultAppData()
      data.prefs.lang = 'zh'
      data.prefs.hiddenTabs = ['apps', 'commands', 'notes', 'tasks']
      useAppStore.setState({ data })
    })

    expect(result.current.tabMode).toBe('row')
  })

  it('stops listening when it is unmounted', () => {
    resizeWindow(400)
    let renders = 0
    const { unmount } = renderHook(() => {
      renders += 1
      return useLayoutMode()
    })
    unmount()
    const before = renders

    resizeWindow(900)

    expect(renders).toBe(before)
  })
})
