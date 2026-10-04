import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DockAppearance, Lang } from '../../../../../shared/types'
import DockBubble from '../DockBubble'

describe('DockBubble', () => {
  let pushAppearance: (appearance: DockAppearance) => void

  beforeEach(() => {
    vi.clearAllMocks()
    // These tests start from the usual state: the panel is collapsed into the ball.
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
  })

  afterEach(() => {
    cleanup()
  })

  it('labels the bubble in the language it was told to use', async () => {
    render(<DockBubble />)
    await act(async () => {})

    act(() => {
      pushAppearance({ lang: 'en', theme: 'dark' })
    })

    expect(
      screen.getByRole('button', { name: 'Open Marubako' })
    ).toBeInTheDocument()
  })

  it('keeps rendering when the pushed language is unknown', async () => {
    render(<DockBubble />)
    await act(async () => {})

    act(() => {
      pushAppearance({ lang: 'fr' as Lang, theme: 'dark' })
    })

    expect(
      screen.getByRole('button', { name: '打开 Marubako' })
    ).toBeInTheDocument()
  })

  it('keeps rendering when the stored language is unknown', async () => {
    vi.mocked(window.quickLaunch.getDockAppearance).mockResolvedValueOnce({
      ok: true,
      data: { lang: 'constructor' as Lang, theme: 'dark' },
    })

    render(<DockBubble />)

    await waitFor(() =>
      expect(window.quickLaunch.getDockAppearance).toHaveBeenCalled()
    )
    await act(async () => {})
    expect(screen.getByTestId('dock-bubble')).toHaveAttribute(
      'aria-label',
      '打开 Marubako'
    )
  })

  it('learns its language and theme from its own channel, never by loading the data', async () => {
    vi.mocked(window.quickLaunch.getDockAppearance).mockResolvedValueOnce({
      ok: true,
      data: { lang: 'en', theme: 'light' },
    })

    const { container } = render(<DockBubble />)

    await waitFor(() =>
      expect(screen.getByTestId('dock-bubble')).toHaveAttribute(
        'aria-label',
        'Open Marubako'
      )
    )
    expect(container.querySelector('.dock-root')).toHaveClass('theme-light')
    // The data holds every password; the ball has no business asking for it.
    expect(window.quickLaunch.loadData).not.toHaveBeenCalled()
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
  })

  // dock.css draws the ball, and the dot in it, from this one length on the root of the window.
  describe('the size of the ball', () => {
    const ballSize = (container: HTMLElement) =>
      container
        .querySelector<HTMLElement>('.dock-root')!
        .style.getPropertyValue('--dock-ball-size')

    it('is the one its own channel answers with', async () => {
      vi.mocked(window.quickLaunch.getDockAppearance).mockResolvedValueOnce({
        ok: true,
        data: { lang: 'en', theme: 'light', ballSize: 48 },
      })

      const { container } = render(<DockBubble />)

      await waitFor(() => expect(ballSize(container)).toBe('48px'))
    })

    it('follows a size the main process pushes, when the setting is saved', async () => {
      const { container } = render(<DockBubble />)
      await act(async () => {})

      act(() => pushAppearance({ lang: 'en', theme: 'dark', ballSize: 64 }))
      expect(ballSize(container)).toBe('64px')

      act(() => pushAppearance({ lang: 'en', theme: 'dark', ballSize: 24 }))
      expect(ballSize(container)).toBe('24px')
    })

    it('is the default, 30px, when the main process does not say', async () => {
      const { container } = render(<DockBubble />)
      await act(async () => {})

      act(() => pushAppearance({ lang: 'en', theme: 'dark' }))

      expect(ballSize(container)).toBe('30px')
    })

    it.each([
      [500, '64px'],
      [3, '24px'],
      [31, '32px'],
      [Number.NaN, '30px'],
      ['48' as unknown as number, '30px'],
    ])(
      'draws %s, which is not a size of the setting, as %s',
      async (told, drawn) => {
        const { container } = render(<DockBubble />)
        await act(async () => {})

        act(() => pushAppearance({ lang: 'en', theme: 'dark', ballSize: told }))

        expect(ballSize(container)).toBe(drawn)
      }
    )

    it('sets nothing else on the ball: the button and its surface have no size of their own', async () => {
      const { container } = render(<DockBubble />)
      await act(async () => {})

      act(() => pushAppearance({ lang: 'en', theme: 'dark', ballSize: 48 }))

      const button = screen.getByTestId('dock-bubble')
      expect(button.style.width).toBe('')
      expect(button.style.height).toBe('')
      const surface = container.querySelector<HTMLElement>(
        '.dock-bubble-surface'
      )!
      expect(surface.style.width).toBe('')
      expect(surface.style.height).toBe('')
    })
  })
})
