import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WindowSnapshot } from '../../../../../shared/types'
import DockBubble from '../DockBubble'

// The ball's single and double click rules (window-ux-1). Time is faked so that the 250 ms
// collapse delay and the 500 ms double-click window are exact.
describe('DockBubble clicks', () => {
  let pushState: (state: WindowSnapshot) => void = () => {}
  const modes = () =>
    vi
      .mocked(window.quickLaunch.window.activateDock)
      .mock.calls.map(([mode]) => mode)

  async function flush(ms = 0): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  function press(pointerId = 1, x = 20, y = 20): void {
    fireEvent.pointerDown(screen.getByTestId('dock-bubble'), {
      pointerId,
      button: 0,
      buttons: 1,
      screenX: x,
      screenY: y,
    })
  }

  function release(pointerId = 1, x = 20, y = 20): void {
    fireEvent.pointerUp(screen.getByTestId('dock-bubble'), {
      pointerId,
      button: 0,
      buttons: 0,
      screenX: x,
      screenY: y,
    })
  }

  /** One complete press and release on the ball, without moving the pointer. */
  async function click(): Promise<void> {
    press()
    release()
    await flush()
  }

  /**
   * How long an open panel stays: a temporary one folds away by itself, one opened as a window or
   * pinned stays until it is closed.
   */
  type Stay = 'temporary' | 'window' | 'pinned'

  function panelState(open: boolean, stay: Stay = 'temporary'): WindowSnapshot {
    return {
      alwaysOnTop: stay === 'pinned',
      collapsed: !open,
      opacity: 1,
      mode: stay === 'window' ? 'window' : 'peek',
    }
  }

  /** The main process reports the panel; an open one is temporary unless said otherwise. */
  function setPanelOpen(open: boolean, stay: Stay = 'temporary'): void {
    act(() => {
      pushState(panelState(open, stay))
    })
  }

  /** What the main process answers a click with: the state the panel is in afterwards. */
  function mainAnswers(open: boolean, stay: Stay = 'temporary'): void {
    vi.mocked(window.quickLaunch.window.activateDock).mockResolvedValue({
      ok: true,
      data: panelState(open, stay),
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mainAnswers(true)
    // The ball asks for the window state when it mounts; these tests start from the collapsed ball.
    vi.mocked(window.quickLaunch.window.getState).mockResolvedValue({
      ok: true,
      data: { alwaysOnTop: false, collapsed: true, opacity: 1 },
    })
    vi.mocked(window.quickLaunch.onWindowState).mockImplementation(
      (callback) => {
        pushState = callback
        return () => {}
      }
    )
    render(<DockBubble />)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.mocked(window.quickLaunch.onWindowState).mockImplementation(
      () => () => {}
    )
  })

  it('opens the temporary panel at once from the collapsed ball', async () => {
    await flush()
    await click()

    expect(modes()).toEqual(['peek'])
  })

  it('waits before collapsing a temporary panel so a second click can still keep it open', async () => {
    await flush()
    setPanelOpen(true)

    await click()
    expect(modes()).toEqual([])

    await flush(249)
    expect(modes()).toEqual([])
    await flush(2)
    expect(modes()).toEqual(['peek'])
  })

  it('keeps a temporary panel open when the ball is double-clicked', async () => {
    await flush()
    setPanelOpen(true)

    await click()
    await flush(120)
    await click()
    await flush(1000)

    // The collapse never goes out, so there is no collapse-then-reopen flicker either.
    expect(modes()).toEqual(['window'])
  })

  it('still counts a second click after the collapse went out as a double click', async () => {
    await flush()
    setPanelOpen(true)

    await click()
    await flush(300)
    expect(modes()).toEqual(['peek'])
    // The main process reports the collapse, which used to wipe the first click.
    setPanelOpen(false)
    await click()

    expect(modes()).toEqual(['peek', 'window'])
  })

  it('accepts a double click as slow as the Windows default of 500 ms', async () => {
    await flush()
    await click()
    expect(modes()).toEqual(['peek'])
    setPanelOpen(true)

    await flush(480)
    await click()

    expect(modes()).toEqual(['peek', 'window'])
  })

  it('treats two clicks more than 500 ms apart as two single clicks', async () => {
    await flush()
    await click()
    setPanelOpen(true)

    await flush(520)
    await click()
    await flush(300)

    expect(modes()).toEqual(['peek', 'peek'])
  })

  it('does not drop a click because the window lost focus mid-press', async () => {
    await flush()
    press()
    // The panel taking focus after a quick expansion blurs the ball.
    fireEvent.blur(window)
    release()
    await flush()

    expect(modes()).toEqual(['peek'])
  })

  it('does end a drag when the window loses focus', async () => {
    await flush()
    press()
    fireEvent.pointerMove(screen.getByTestId('dock-bubble'), {
      pointerId: 1,
      buttons: 1,
      screenX: 80,
      screenY: 20,
    })
    fireEvent.blur(window)
    await flush()

    expect(window.quickLaunch.window.dragDock).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'end' })
    )
    expect(modes()).toEqual([])
  })

  it('drops a pending collapse when the ball is dragged instead', async () => {
    await flush()
    setPanelOpen(true)
    await click()
    await flush(100)

    press(2)
    fireEvent.pointerMove(screen.getByTestId('dock-bubble'), {
      pointerId: 2,
      buttons: 1,
      screenX: 90,
      screenY: 20,
    })
    await flush(1000)

    expect(modes()).toEqual([])
  })

  it('does not send a delayed collapse after the ball is gone', async () => {
    await flush()
    setPanelOpen(true)
    await click()

    cleanup()
    await flush(1000)

    expect(modes()).toEqual([])
  })

  it('drops a pending collapse when the panel has already closed by itself', async () => {
    await flush()
    setPanelOpen(true)
    await click()
    await flush(100)

    // A very short auto-collapse delay, a shortcut or Win+D got there first.
    setPanelOpen(false)
    await flush(300)

    // Sending the collapse now would make the main process open the panel again.
    expect(modes()).toEqual([])
  })

  it('still sends the delayed collapse while the panel stays open', async () => {
    await flush()
    setPanelOpen(true)
    await click()
    await flush(100)

    // Other window state pushes (the mode changing, say) do not cancel it.
    act(() => {
      pushState({
        alwaysOnTop: false,
        collapsed: false,
        opacity: 1,
        mode: 'peek',
      })
    })
    await flush(300)

    expect(modes()).toEqual(['peek'])
  })

  it('collapses an open panel when the ball is activated from the keyboard', async () => {
    await flush()
    setPanelOpen(true)
    const button = screen.getByTestId('dock-bubble')
    expect(button).toHaveAccessibleName('收起 Marubako')

    // Enter, Space and a screen reader's default action are clicks without a pointer.
    fireEvent.click(button, { detail: 0 })
    await flush()

    expect(modes()).toEqual(['peek'])
  })

  it('opens the panel and keeps it open when the ball is activated from the keyboard', async () => {
    await flush()
    fireEvent.click(screen.getByTestId('dock-bubble'), { detail: 0 })
    await flush()

    expect(modes()).toEqual(['window'])
  })

  it('does not collapse a second time when a keyboard activation follows a pointer click', async () => {
    await flush()
    setPanelOpen(true)
    await click()
    await flush(100)

    fireEvent.click(screen.getByTestId('dock-bubble'), { detail: 0 })
    await flush(1000)

    expect(modes()).toEqual(['peek'])
  })

  it('hints at collapsing while the panel is open and at peeking while it is not', async () => {
    await flush()
    const button = screen.getByTestId('dock-bubble')
    expect(button).toHaveAttribute(
      'title',
      '单击临时展开 · 双击保持打开 · 拖动移动'
    )

    setPanelOpen(true)

    expect(button).toHaveAttribute(
      'title',
      '单击收起 · 双击保持打开 · 拖动移动'
    )
  })

  it.each(['window', 'pinned'] as const)(
    'does not promise that a double click keeps a panel open that is kept open already (%s)',
    async (stay) => {
      await flush()
      setPanelOpen(true, stay)

      expect(screen.getByTestId('dock-bubble')).toHaveAttribute(
        'title',
        '单击收起 · 拖动移动'
      )

      // Back to a temporary panel, back to the offer.
      setPanelOpen(true)
      expect(screen.getByTestId('dock-bubble')).toHaveAttribute(
        'title',
        '单击收起 · 双击保持打开 · 拖动移动'
      )
    }
  )

  // A panel that is kept open (opened as a window, or pinned) has nothing a second click could turn
  // it into, so the 250 ms wait would only be a delay.
  describe('a panel that is kept open', () => {
    // The click collapses it, and the main process says so in its answer.
    beforeEach(() => mainAnswers(false))

    it.each(['window', 'pinned'] as const)(
      'collapses on the click itself, with no wait (%s)',
      async (stay) => {
        await flush()
        setPanelOpen(true, stay)

        await click()

        expect(modes()).toEqual(['peek'])
      }
    )

    it('leaves no delayed collapse behind that would open the panel again', async () => {
      await flush()
      setPanelOpen(true, 'window')

      await click()
      setPanelOpen(false)
      await flush(1000)

      expect(modes()).toEqual(['peek'])
    })

    it('ignores the second click of a double click: the first one has collapsed the panel', async () => {
      await flush()
      setPanelOpen(true, 'window')

      await click()
      // The main process reports the collapse between the two clicks.
      setPanelOpen(false)
      await flush(120)
      await click()
      await flush(1000)

      // Neither kept open again ('window') nor opened as a temporary panel (a second 'peek').
      expect(modes()).toEqual(['peek'])
    })

    it('ignores that second click even before the collapse has been reported', async () => {
      await flush()
      setPanelOpen(true, 'pinned')

      await click()
      await flush(60)
      await click()
      await flush(1000)

      expect(modes()).toEqual(['peek'])
    })

    it('opens the panel again on a click that comes after the double-click time', async () => {
      await flush()
      setPanelOpen(true, 'window')

      await click()
      setPanelOpen(false)
      await flush(520)
      await click()

      expect(modes()).toEqual(['peek', 'peek'])
    })

    it('counts the click after an ignored one as a new click', async () => {
      await flush()
      setPanelOpen(true, 'window')

      await click()
      setPanelOpen(false)
      await flush(100)
      await click()
      await flush(100)
      await click()

      // Collapsed by the first, the second spent, opened as a temporary panel by the third.
      expect(modes()).toEqual(['peek', 'peek'])
    })

    it('is recognised by a ball that appears while the panel is already open', async () => {
      cleanup()
      vi.mocked(window.quickLaunch.window.getState).mockResolvedValue({
        ok: true,
        data: panelState(true, 'window'),
      })
      render(<DockBubble />)
      // No state is pushed: the ball has to ask.
      await flush()

      await click()

      expect(modes()).toEqual(['peek'])
    })

    it('starts as soon as a temporary panel is kept open: by a double click or the pin', async () => {
      await flush()
      setPanelOpen(true)
      setPanelOpen(true, 'window')

      await click()
      expect(modes()).toEqual(['peek'])
    })

    it('ends when the panel becomes temporary again: the wait and the double click are back', async () => {
      await flush()
      setPanelOpen(true, 'pinned')
      setPanelOpen(true)

      await click()
      expect(modes()).toEqual([])
      await flush(120)
      await click()
      await flush(1000)

      expect(modes()).toEqual(['window'])
    })

    it('collapses from the keyboard as before', async () => {
      await flush()
      setPanelOpen(true, 'window')

      fireEvent.click(screen.getByTestId('dock-bubble'), { detail: 0 })
      await flush()

      expect(modes()).toEqual(['peek'])
    })

    // Behind other windows the click does not collapse it: the main process brings it forward
    // as a temporary panel. The second click of a double click is then not spent.
    describe('and was behind other windows', () => {
      beforeEach(() => mainAnswers(true))

      it('is kept open by a double click, whose first click only brought it forward', async () => {
        await flush()
        setPanelOpen(true, 'window')

        await click()
        setPanelOpen(true)
        await flush(120)
        await click()
        await flush(1000)

        expect(modes()).toEqual(['peek', 'window'])
      })

      it('is collapsed by a later single click, after the usual wait of a temporary panel', async () => {
        await flush()
        setPanelOpen(true, 'window')

        await click()
        setPanelOpen(true)
        await flush(520)
        await click()
        expect(modes()).toEqual(['peek'])
        await flush(300)

        expect(modes()).toEqual(['peek', 'peek'])
      })
    })
  })

  // What did not change: a temporary panel keeps the wait and the double click.
  describe('a temporary panel', () => {
    it('says so in the state the main process reports, and still waits 250 ms', async () => {
      await flush()
      act(() => {
        pushState({
          alwaysOnTop: false,
          collapsed: false,
          opacity: 1,
          mode: 'peek',
        })
      })

      await click()
      expect(modes()).toEqual([])
      await flush(249)
      expect(modes()).toEqual([])
      await flush(2)

      expect(modes()).toEqual(['peek'])
    })

    it('is what a state without a mode counts as, like the state of an older main process', async () => {
      await flush()
      act(() => {
        pushState({ alwaysOnTop: false, collapsed: false, opacity: 1 })
      })

      await click()

      expect(modes()).toEqual([])
      await flush(300)
      expect(modes()).toEqual(['peek'])
    })
  })
})
