import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DockBubble from '../DockBubble'

// The ball that is restored after a restart is shown before its own data has loaded, so the main
// process hands the saved theme, language and size over in the URL (see loadRenderer).
describe('DockBubble first frame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Keep the appearance request pending: only what the URL says may decide the first frame.
    vi.mocked(window.quickLaunch.getDockAppearance).mockReturnValue(
      new Promise(() => {}) as never
    )
  })

  afterEach(() => {
    cleanup()
    window.history.replaceState({}, '', '/')
    vi.mocked(window.quickLaunch.getDockAppearance).mockReset()
  })

  it('uses the saved theme and language from the URL', () => {
    window.history.replaceState({}, '', '/?view=dock&theme=dark&lang=en')
    const { container } = render(<DockBubble />)

    expect(container.querySelector('.dock-root')).toHaveClass('theme-dark')
    expect(screen.getByTestId('dock-bubble')).toHaveAttribute(
      'aria-label',
      'Open Marubako'
    )
  })

  it('falls back to the defaults for values it does not know', () => {
    window.history.replaceState({}, '', '/?view=dock&theme=neon&lang=xx')
    const { container } = render(<DockBubble />)

    expect(container.querySelector('.dock-root')).toHaveClass('theme-light')
    expect(screen.getByTestId('dock-bubble')).toHaveAttribute(
      'aria-label',
      '打开 Marubako'
    )
  })

  it('uses the defaults when the URL says nothing', () => {
    window.history.replaceState({}, '', '/?view=dock')
    const { container } = render(<DockBubble />)

    expect(container.querySelector('.dock-root')).toHaveClass('theme-light')
  })

  // The window was made for the saved ball: a first frame with a ball of another size would jump.
  it.each([
    ['the saved size', '&ball=48', '48px'],
    ['the largest size', '&ball=64', '64px'],
    ['the default when the URL names none', '', '30px'],
    ['the default for a value that is not a number', '&ball=large', '30px'],
    ['the nearest size for one out of range', '&ball=1000', '64px'],
  ])('draws the ball at %s (%j)', (_name, query, size) => {
    window.history.replaceState(
      {},
      '',
      `/?view=dock&theme=dark&lang=en${query}`
    )
    const { container } = render(<DockBubble />)

    expect(
      container
        .querySelector<HTMLElement>('.dock-root')
        ?.style.getPropertyValue('--dock-ball-size')
    ).toBe(size)
  })
})
