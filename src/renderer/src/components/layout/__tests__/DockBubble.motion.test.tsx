import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Lang, Theme, WindowSnapshot } from '../../../../../shared/types'
import { workspaceStrings } from '../../../i18n/workspace'
import DockBubble from '../DockBubble'

describe('DockBubble look and press feedback', () => {
  let pushAppearance: (appearance: { lang: Lang; theme: Theme }) => void
  let pushState: (state: WindowSnapshot) => void

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.quickLaunch.window.getState).mockResolvedValue({
      ok: true,
      data: { alwaysOnTop: false, collapsed: true, opacity: 1 },
    })
    vi.mocked(window.quickLaunch.onDockAppearance).mockImplementation(
      (callback) => {
        pushAppearance = callback
        return () => {}
      }
    )
    vi.mocked(window.quickLaunch.onWindowState).mockImplementation(
      (callback) => {
        pushState = callback
        return () => {}
      }
    )
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  const state = (collapsed: boolean): WindowSnapshot => ({
    alwaysOnTop: false,
    collapsed,
    opacity: 1,
    mode: 'window',
  })

  function mount() {
    const view = render(<DockBubble />)
    const button = view.getByTestId('dock-bubble')
    return { ...view, button }
  }

  async function press(button: HTMLElement) {
    await act(async () => {
      fireEvent.pointerDown(button, {
        pointerId: 1,
        button: 0,
        screenX: 100,
        screenY: 100,
        clientX: 25,
        clientY: 25,
      })
    })
  }

  async function release(button: HTMLElement) {
    await act(async () => {
      fireEvent.pointerUp(button, {
        pointerId: 1,
        button: 0,
        screenX: 100,
        screenY: 100,
      })
    })
  }

  describe('the drawn ball', () => {
    it('is plain shapes: no image, one white dot as a real child', () => {
      const { container } = mount()
      expect(container.querySelector('img')).toBeNull()
      const surface = container.querySelector('.dock-bubble-surface')!
      expect(surface.querySelectorAll('.dock-bubble-dot')).toHaveLength(1)
      expect(surface.children).toHaveLength(1)
    })
  })

  describe('labels', () => {
    it.each(['zh', 'en', 'ja'] as const)(
      'say open while collapsed and close while the panel is open in %s',
      async (lang) => {
        const { button } = mount()
        await act(async () => {})
        act(() => pushAppearance({ lang, theme: 'dark' }))
        const strings = workspaceStrings[lang]
        expect(strings.dock_close).toBeTruthy()
        expect(strings.dock_bubble_hint_open).toBeTruthy()

        act(() => pushState(state(true)))
        expect(button).toHaveAttribute('aria-label', strings.dock_open)
        expect(button).toHaveAttribute('title', strings.dock_bubble_hint)
        expect(button).toHaveAttribute('aria-expanded', 'false')

        // A temporary panel: a double click can still keep it open.
        act(() => pushState({ ...state(false), mode: 'peek' }))
        expect(button).toHaveAttribute('aria-label', strings.dock_close)
        expect(button).toHaveAttribute('title', strings.dock_bubble_hint_open)
        expect(button).toHaveAttribute('aria-expanded', 'true')
        expect(strings.dock_close).not.toBe(strings.dock_open)
      }
    )

    it.each(['zh', 'en', 'ja'] as const)(
      'do not offer the double click while the open panel is kept open already, in %s',
      async (lang) => {
        const { button } = mount()
        await act(async () => {})
        act(() => pushAppearance({ lang, theme: 'dark' }))
        const strings = workspaceStrings[lang]
        expect(strings.dock_bubble_hint_kept).toBeTruthy()
        expect(strings.dock_bubble_hint_kept).not.toBe(
          strings.dock_bubble_hint_open
        )

        // Opened as a window.
        act(() => pushState(state(false)))
        expect(button).toHaveAttribute('aria-label', strings.dock_close)
        expect(button).toHaveAttribute('title', strings.dock_bubble_hint_kept)

        // A temporary panel that is pinned.
        act(() =>
          pushState({ ...state(false), mode: 'peek', alwaysOnTop: true })
        )
        expect(button).toHaveAttribute('title', strings.dock_bubble_hint_kept)

        // Unpinned again: the offer is back.
        act(() => pushState({ ...state(false), mode: 'peek' }))
        expect(button).toHaveAttribute('title', strings.dock_bubble_hint_open)

        // Collapsed, whatever it was before: the ball offers both again.
        act(() => pushState(state(true)))
        expect(button).toHaveAttribute('title', strings.dock_bubble_hint)
      }
    )

    it('start out as close when the ball appears while the panel is already open', async () => {
      vi.mocked(window.quickLaunch.window.getState).mockResolvedValue({
        ok: true,
        data: { alwaysOnTop: false, collapsed: false, opacity: 1 },
      })
      const { button } = mount()
      await act(async () => {})
      expect(button).toHaveAttribute('aria-label', '收起 Marubako')
      expect(button).toHaveAttribute('aria-expanded', 'true')
    })

    it('use the agreed wording', () => {
      expect(workspaceStrings.zh.dock_close).toBe('收起 Marubako')
      expect(workspaceStrings.zh.dock_bubble_hint_open).toBe(
        '单击收起 · 双击保持打开 · 拖动移动'
      )
      expect(workspaceStrings.en.dock_close).toBe('Collapse Marubako')
      expect(workspaceStrings.en.dock_bubble_hint_open).toBe(
        'Click to collapse · Double-click to keep open · Drag to move'
      )
      expect(workspaceStrings.ja.dock_close).toBe('Marubako を収納')
      expect(workspaceStrings.ja.dock_bubble_hint_open).toBe(
        'クリックで収納 · ダブルクリックで開いたまま · ドラッグで移動'
      )
      // The same hint without the double click, for a panel that is kept open already.
      expect(workspaceStrings.zh.dock_bubble_hint_kept).toBe(
        '单击收起 · 拖动移动'
      )
      expect(workspaceStrings.en.dock_bubble_hint_kept).toBe(
        'Click to collapse · Drag to move'
      )
      expect(workspaceStrings.ja.dock_bubble_hint_kept).toBe(
        'クリックで収納 · ドラッグで移動'
      )
    })
  })

  describe('press state', () => {
    it('marks the button as pressed on pointer down, before any IPC answers', async () => {
      const { button } = mount()
      expect(button).not.toHaveAttribute('data-pressed')
      await press(button)
      expect(button).toHaveAttribute('data-pressed')
    })

    it('is dropped once the pointer has travelled more than 5px: it is a drag', async () => {
      const { button } = mount()
      await press(button)
      expect(button).toHaveAttribute('data-pressed')
      await act(async () => {
        fireEvent.pointerMove(window, {
          pointerId: 1,
          buttons: 1,
          screenX: 103,
          screenY: 100,
        })
      })
      expect(button).toHaveAttribute('data-pressed')
      await act(async () => {
        fireEvent.pointerMove(window, {
          pointerId: 1,
          buttons: 1,
          screenX: 110,
          screenY: 100,
        })
      })
      expect(button).not.toHaveAttribute('data-pressed')
    })

    it('is dropped when the system cancels the pointer', async () => {
      const { button } = mount()
      await press(button)
      expect(button).toHaveAttribute('data-pressed')
      await act(async () => {
        fireEvent.pointerCancel(button, { pointerId: 1 })
      })
      expect(button).not.toHaveAttribute('data-pressed')
    })

    it('is dropped when the window loses focus mid-press', async () => {
      const { button } = mount()
      await press(button)
      expect(button).toHaveAttribute('data-pressed')
      await act(async () => {
        fireEvent.blur(window)
      })
      expect(button).not.toHaveAttribute('data-pressed')
    })

    it('stays through a click, for the animation to release, and falls back after 400 ms', async () => {
      vi.useFakeTimers()
      const { button } = mount()
      await press(button)
      expect(button).toHaveAttribute('data-pressed')
      await release(button)
      expect(button).toHaveAttribute('data-pressed')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(399)
      })
      expect(button).toHaveAttribute('data-pressed')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(button).not.toHaveAttribute('data-pressed')
    })

    it('does not let the fallback of an earlier click release a later press', async () => {
      vi.useFakeTimers()
      const { button } = mount()
      await press(button)
      await release(button)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      await press(button)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
      })
      // 500 ms after the first click, but only 200 ms into the second press.
      expect(button).toHaveAttribute('data-pressed')
    })
  })
})
