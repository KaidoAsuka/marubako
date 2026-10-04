import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../shared/default-data'
import type { AppData, DataStatus } from '../../../shared/types'
import App from '../App'
import { useAppStore } from '../store/use-app-store'

function mockLoadedData(mutate: (data: AppData) => void): void {
  const data = createDefaultAppData()
  mutate(data)
  vi.mocked(window.quickLaunch.loadData).mockResolvedValue({ ok: true, data })
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom has no matchMedia; the toast uses it to respect reduced motion.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    useAppStore.setState({
      data: null,
      loading: true,
      error: null,
      dataStatus: { writeError: null, notices: [] },
    })
  })

  afterEach(() => {
    cleanup()
    vi.mocked(window.quickLaunch.loadData).mockReset()
    vi.mocked(window.quickLaunch.loadData).mockImplementation(async () => ({
      ok: true,
      data: createDefaultAppData(),
    }))
  })

  it('still renders when the stored language, theme and background are unknown', async () => {
    mockLoadedData((data) => {
      Object.assign(data.prefs, {
        lang: 'fr',
        theme: 'sepia',
        background: 'xxx',
      })
    })

    render(<App />)

    const root = await screen.findByTestId('app-root')
    expect(root).toHaveClass('theme-dark')
    expect(root).toHaveAttribute('data-background', 'aurora')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('shows the data banner on top of the workspace and follows pushed status changes', async () => {
    let push: (status: DataStatus) => void = () => {}
    vi.mocked(window.quickLaunch.onDataStatus).mockImplementation(
      (callback) => {
        push = callback
        return () => {}
      }
    )
    vi.mocked(window.quickLaunch.getDataStatus).mockResolvedValueOnce({
      ok: true,
      data: {
        writeError: null,
        notices: [{ kind: 'passwordsLost', count: 2 }],
      },
    })
    mockLoadedData((data) => {
      data.prefs.lang = 'en'
    })

    render(<App />)

    expect(
      await screen.findByTestId('data-notice-passwords-lost')
    ).toHaveTextContent('2 saved passwords')
    expect(screen.queryByRole('alert')).toBeNull()

    act(() => {
      push({
        writeError: 'disk full',
        notices: [{ kind: 'passwordsLost', count: 2 }],
      })
    })

    // The failed write is the strip's persistent error, with its Retry button; it does not push
    // the startup notices out of the banner.
    const strip = screen.getByTestId('feedback-strip')
    expect(strip).toHaveAttribute('data-kind', 'error')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Disk write failed: Your latest changes are NOT saved yet. disk full'
    )
    expect(strip).toContainElement(screen.getByRole('alert'))
    expect(screen.getByTestId('data-notice-passwords-lost')).toBeInTheDocument()
  })

  it('shows the appearance previewed by the settings dialog, and the saved one again when the preview ends', async () => {
    mockLoadedData((data) => {
      data.prefs.theme = 'dark'
      data.prefs.background = 'aurora'
      data.prefs.zoom = 1
    })

    render(<App />)
    const root = await screen.findByTestId('app-root')
    expect(root).toHaveClass('theme-dark')
    expect(root).toHaveAttribute('data-background', 'aurora')

    act(() =>
      useAppStore
        .getState()
        .setPreviewPrefs({ theme: 'light', background: 'forest', zoom: 1.25 })
    )

    expect(root).toHaveClass('theme-light')
    expect(root).toHaveAttribute('data-background', 'forest')
    expect(root.style.zoom).toBe('1.25')
    expect(document.documentElement.dataset.theme).toBe('light')
    // Nothing was saved: the stored choice is untouched.
    expect(useAppStore.getState().data?.prefs.theme).toBe('dark')
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()

    act(() => useAppStore.getState().setPreviewPrefs(null))

    expect(root).toHaveClass('theme-dark')
    expect(root).toHaveAttribute('data-background', 'aurora')
    expect(root.style.zoom).toBe('1')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('applies the previewed animation duration to the motion tokens', async () => {
    mockLoadedData(() => {})
    render(<App />)
    await screen.findByTestId('app-root')
    const root = document.documentElement
    const standard = root.style.getPropertyValue('--motion-normal')

    act(() => useAppStore.getState().setPreviewPrefs({ motion: 0.81 }))
    const faster = root.style.getPropertyValue('--motion-normal')

    expect(parseInt(faster)).toBeLessThan(parseInt(standard))
    act(() => useAppStore.getState().setPreviewPrefs(null))
    expect(root.style.getPropertyValue('--motion-normal')).toBe(standard)
  })

  it('has no blob layer behind the opaque canvas, and still sets the accent from the stored choice', async () => {
    mockLoadedData((data) => {
      data.prefs.background = 'forest'
    })

    const { container } = render(<App />)
    const root = await screen.findByTestId('app-root')

    expect(container.querySelector('.app-bg')).toBeNull()
    expect(container.querySelector('.blob')).toBeNull()
    expect(root).toHaveAttribute('data-background', 'forest')
    expect(root.style.getPropertyValue('--accent')).toBe('#62d0dc')
    expect(root.style.getPropertyValue('--accent-solid')).toBe('#0e7490')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(
      '#62d0dc'
    )
    expect(document.body.dataset.background).toBe('forest')
  })

  it('has no status bar, and the feedback strip is the last thing in the shell', async () => {
    mockLoadedData((data) => {
      data.prefs.lang = 'en'
    })

    const { container } = render(<App />)
    await screen.findByTestId('app-root')

    expect(container.querySelector('.statusbar')).toBeNull()
    expect(container.querySelector('.toast')).toBeNull()
    const shell = container.querySelector('.app-shell')!
    expect(shell.lastElementChild).toBe(screen.getByTestId('feedback-strip'))
    // Nothing to say, nothing shown.
    expect(screen.getByTestId('feedback-strip')).not.toHaveAttribute(
      'data-open'
    )
  })
})
