import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import largeIcon from '../../../assets/marubako.svg'
import smallIcon from '../../../assets/marubako-small.svg'
import { useAppStore } from '../../../store/use-app-store'
import { IconPin } from '../../common/icons'
import TitleBar from '../TitleBar'

describe('TitleBar window exits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const data = createDefaultAppData()
    data.prefs.lang = 'en'
    useAppStore.setState({
      data,
      windowState: { alwaysOnTop: false, collapsed: false, opacity: 1 },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('offers exactly two ways out: collapse to the ball and close to the tray', () => {
    render(<TitleBar />)

    expect(screen.getByTestId('dock-panel')).toBeInTheDocument()
    expect(screen.getByTestId('close-window')).toBeInTheDocument()
    expect(screen.queryByTestId('minimize-window')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Minimize' })).toBeNull()
  })

  it('has one collapse button, not a logo and a button that do the same', () => {
    render(<TitleBar />)

    expect(screen.getAllByTestId('dock-panel')).toHaveLength(1)
    expect(screen.queryByTestId('dock-panel-button')).toBeNull()
  })

  it('labels the collapse button as collapsing to the ball, not as a minimise', () => {
    render(<TitleBar />)

    const button = screen.getByTestId('dock-panel')
    expect(button).toHaveAttribute('aria-label', 'Return to floating bubble')
    expect(button).toHaveAttribute(
      'title',
      'Return to the bubble, or drag the title bar to a screen edge'
    )
  })

  it('draws the collapse button in the shape of the ball, at 14px', () => {
    render(<TitleBar />)

    const image = screen.getByTestId('dock-panel').querySelector('img')
    expect(image).not.toBeNull()
    expect(image).toHaveAttribute('width', '14')
    expect(image).toHaveAttribute('height', '14')
    // The small version of the app icon, whose larger dot survives 14px.
    expect(image).toHaveAttribute('src', smallIcon)
    expect(smallIcon).not.toBe(largeIcon)
  })

  it('does not promise a ball in its labels once the ball is turned off', () => {
    const data = createDefaultAppData()
    data.prefs.lang = 'en'
    data.prefs.showBubble = false
    useAppStore.setState({ data })
    render(<TitleBar />)

    expect(screen.getByTestId('dock-panel')).toHaveAttribute(
      'aria-label',
      'Hide to system tray'
    )
    expect(screen.getByTestId('dock-panel')).toHaveAttribute(
      'title',
      'Hide to system tray'
    )
  })

  it('collapses through the same path as Esc', () => {
    render(<TitleBar />)

    fireEvent.click(screen.getByTestId('dock-panel'))

    expect(window.quickLaunch.window.collapse).toHaveBeenCalledOnce()
    expect(window.quickLaunch.window.hide).not.toHaveBeenCalled()
  })

  it('closes to the tray with the close button', () => {
    render(<TitleBar />)

    fireEvent.click(screen.getByTestId('close-window'))

    expect(window.quickLaunch.window.hide).toHaveBeenCalledOnce()
  })

  it('fills the pin icon only while the window is pinned on top', () => {
    const { container, unmount } = render(
      <>
        <IconPin size={16} weight="duotone" />
        <IconPin size={16} weight="fill" />
      </>
    )
    const [duotone, fill] = Array.from(container.querySelectorAll('svg')).map(
      (svg) => svg.outerHTML
    )
    unmount()
    expect(duotone).not.toBe(fill)

    render(<TitleBar />)
    expect(screen.getByTestId('toggle-pin').innerHTML).toBe(duotone)
    cleanup()

    useAppStore.setState({
      windowState: { alwaysOnTop: true, collapsed: false, opacity: 1 },
    })
    render(<TitleBar />)
    expect(screen.getByTestId('toggle-pin').innerHTML).toBe(fill)
  })
})

describe('TitleBar window row', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const data = createDefaultAppData()
    data.prefs.lang = 'en'
    useAppStore.setState({
      data,
      commandOpen: false,
      modal: null,
      windowState: { alwaysOnTop: false, collapsed: false, opacity: 1 },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('carries no logo and no product name', () => {
    const { container } = render(<TitleBar />)

    expect(screen.queryByText('Marubako')).toBeNull()
    expect(container.querySelector('.titlebar-brand')).toBeNull()
    expect(container.querySelector('.titlebar-title')).toBeNull()
  })

  it('holds the search first, then the four window buttons in order', () => {
    const { container } = render(<TitleBar />)

    const ids = Array.from(
      container.querySelectorAll('.titlebar [data-testid]')
    ).map((node) => node.getAttribute('data-testid'))
    expect(ids).toEqual([
      'open-command',
      'toggle-pin',
      'open-settings',
      'dock-panel',
      'close-window',
    ])
  })

  it('opens the global search and the settings', () => {
    render(<TitleBar />)

    fireEvent.click(screen.getByTestId('open-command'))
    expect(useAppStore.getState().commandOpen).toBe(true)
    fireEvent.click(screen.getByTestId('open-settings'))
    expect(useAppStore.getState().modal).toEqual({ kind: 'settings' })
  })

  it('names the search for screen readers and shows its shortcut', () => {
    render(<TitleBar />)

    const search = screen.getByTestId('open-command')
    expect(search).toHaveAttribute('aria-label', 'Search everything')
    expect(search).toHaveAttribute('title', 'Search everything · Ctrl+K')
  })
})
