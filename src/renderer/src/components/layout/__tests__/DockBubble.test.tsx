import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Lang, Theme } from '../../../../../shared/types'
import DockBubble from '../DockBubble'

describe('DockBubble', () => {
  let pushAppearance: (appearance: { lang: Lang; theme: Theme }) => void

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
})
