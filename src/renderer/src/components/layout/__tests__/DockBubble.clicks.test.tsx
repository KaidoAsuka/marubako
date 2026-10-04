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

  function setPanelOpen(open: boolean): void {
    act(() => {
      pushState({ alwaysOnTop: false, collapsed: !open, opacity: 1 })
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
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

  it('waits before collapsing an open panel so a second click can still keep it open', async () => {
    await flush()
    setPanelOpen(true)

    await click()
    expect(modes()).toEqual([])

    await flush(249)
    expect(modes()).toEqual([])
    await flush(2)
    expect(modes()).toEqual(['peek'])
  })

  it('keeps an open panel open when the ball is double-clicked', async () => {
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
})
