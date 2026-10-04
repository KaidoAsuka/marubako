import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../shared/default-data'
import type {
  AppData,
  DataStatus,
  QuickLaunchResult,
} from '../../../shared/types'
import App from '../App'
import { useAppStore } from '../store/use-app-store'
import { ACCENT_CHOICES } from '../styles/background-theme'
import { installSystemTheme, type SystemTheme } from '../test/system-theme'

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
      previewPrefs: null,
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

    // An unknown theme is drawn light, the default; an unknown accent in violet.
    const root = await screen.findByTestId('app-root')
    expect(root).toHaveClass('theme-light')
    expect(root).not.toHaveClass('theme-dark')
    expect(root).toHaveAttribute('data-background', 'aurora')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('wears the look of a new installation: light, graphite', async () => {
    mockLoadedData(() => {})

    render(<App />)

    const root = await screen.findByTestId('app-root')
    expect(root).toHaveClass('theme-light')
    expect(root).toHaveAttribute('data-background', 'minimal')
    expect(root.style.getPropertyValue('--accent')).toBe(
      ACCENT_CHOICES.minimal.light
    )
    expect(root.style.getPropertyValue('--accent-solid')).toBe(
      ACCENT_CHOICES.minimal.solidLight
    )
    for (const target of [document.documentElement, document.body]) {
      expect(target).toHaveClass('theme-light')
      expect(target.dataset.background).toBe('minimal')
    }
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

  // workspace.css puts --font-user in front of the fonts of the language. It is set on the root
  // element, so that dialogs and menus mounted beside the panel follow as well.
  describe('the font the user chose', () => {
    const userFont = () =>
      document.documentElement.style.getPropertyValue('--font-user')

    afterEach(() => {
      document.documentElement.style.removeProperty('--font-user')
    })

    it('is set on the root element, as one quoted family', async () => {
      mockLoadedData((data) => {
        data.prefs.fontFamily = 'Yu Gothic UI'
      })

      render(<App />)
      await screen.findByTestId('app-root')

      expect(userFont()).toBe('"Yu Gothic UI"')
      // On the root only: the panel and what is mounted beside it inherit it from there.
      expect(document.body.style.getPropertyValue('--font-user')).toBe('')
      expect(
        screen.getByTestId('app-root').style.getPropertyValue('--font-user')
      ).toBe('')
    })

    it('is not set for the default, which leaves the fonts of the language', async () => {
      mockLoadedData(() => {})

      render(<App />)
      await screen.findByTestId('app-root')

      expect(userFont()).toBe('')
    })

    it('is not set before the data has arrived', () => {
      vi.mocked(window.quickLaunch.loadData).mockReturnValue(
        new Promise(() => {})
      )

      render(<App />)

      expect(screen.getByTestId('loading-screen')).toBeInTheDocument()
      expect(userFont()).toBe('')
    })

    it('follows the font the settings dialog previews, and the saved one again when the preview ends', async () => {
      mockLoadedData((data) => {
        data.prefs.fontFamily = 'Yu Gothic UI'
      })
      render(<App />)
      await screen.findByTestId('app-root')

      act(() => useAppStore.getState().setPreviewPrefs({ fontFamily: 'Arial' }))

      expect(userFont()).toBe('"Arial"')
      // Nothing was saved: the stored choice is untouched.
      expect(useAppStore.getState().data?.prefs.fontFamily).toBe('Yu Gothic UI')
      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()

      act(() => useAppStore.getState().setPreviewPrefs(null))

      expect(userFont()).toBe('"Yu Gothic UI"')
    })

    it('is removed while the dialog previews the default, though a font is saved', async () => {
      mockLoadedData((data) => {
        data.prefs.fontFamily = 'Yu Gothic UI'
      })
      render(<App />)
      await screen.findByTestId('app-root')
      expect(userFont()).toBe('"Yu Gothic UI"')

      act(() => useAppStore.getState().setPreviewPrefs({ fontFamily: '' }))

      expect(userFont()).toBe('')
      expect(
        document.documentElement.style.cssText.includes('--font-user')
      ).toBe(false)
    })

    it('keeps the saved font while the dialog previews something else', async () => {
      mockLoadedData((data) => {
        data.prefs.fontFamily = 'Yu Gothic UI'
      })
      render(<App />)
      await screen.findByTestId('app-root')

      act(() => useAppStore.getState().setPreviewPrefs({ theme: 'dark' }))

      expect(userFont()).toBe('"Yu Gothic UI"')
    })

    it('is removed when the saved font goes back to the default', async () => {
      mockLoadedData((data) => {
        data.prefs.fontFamily = 'Yu Gothic UI'
      })
      render(<App />)
      await screen.findByTestId('app-root')

      act(() => {
        const data = structuredClone(useAppStore.getState().data!)
        data.prefs.fontFamily = ''
        useAppStore.setState({ data })
      })

      expect(userFont()).toBe('')
    })

    it('never lets a name out of its quotes, even one that was not cleaned', async () => {
      mockLoadedData((data) => {
        data.prefs.fontFamily = 'Arial"; } body { display: none'
      })

      render(<App />)
      await screen.findByTestId('app-root')

      expect(userFont()).toBe('"Arial  body  display: none"')
    })
  })

  it('has no blob layer behind the opaque canvas, and still sets the accent from the stored choice', async () => {
    mockLoadedData((data) => {
      data.prefs.theme = 'dark'
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

  it('puts the theme and the accent choice on the same three elements, where a whole palette looks for them', async () => {
    mockLoadedData((data) => {
      data.prefs.theme = 'dark'
      data.prefs.background = 'monokai'
    })

    render(<App />)
    const root = await screen.findByTestId('app-root')

    // themes.css and code.css dress monokai with `.theme-<theme>[data-background='monokai']`.
    for (const target of [document.documentElement, document.body, root]) {
      expect(
        target.matches(".theme-dark[data-background='monokai']"),
        target.tagName
      ).toBe(true)
    }
    expect(root.style.getPropertyValue('--accent')).toBe(
      ACCENT_CHOICES.monokai.dark
    )
    expect(root.style.getPropertyValue('--accent-solid')).toBe(
      ACCENT_CHOICES.monokai.solidDark
    )

    act(() => useAppStore.getState().setPreviewPrefs({ theme: 'light' }))

    for (const target of [document.documentElement, document.body, root]) {
      expect(
        target.matches(".theme-light[data-background='monokai']"),
        target.tagName
      ).toBe(true)
      expect(target.matches('.theme-dark'), target.tagName).toBe(false)
    }
    expect(root.style.getPropertyValue('--accent')).toBe(
      ACCENT_CHOICES.monokai.light
    )
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

  describe('the theme set to follow Windows', () => {
    let system: SystemTheme

    afterEach(() => {
      system.restore()
    })

    it('is dark while Windows is dark and light while it is light, and changes with it at once', async () => {
      system = installSystemTheme(true)
      mockLoadedData((data) => {
        data.prefs.theme = 'system'
        data.prefs.background = 'ocean'
      })

      render(<App />)
      const root = await screen.findByTestId('app-root')

      expect(root).toHaveClass('theme-dark')
      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(root.style.getPropertyValue('--accent')).toBe(
        ACCENT_CHOICES.ocean.dark
      )

      system.set(false)

      expect(root).toHaveClass('theme-light')
      expect(root).not.toHaveClass('theme-dark')
      expect(document.documentElement).toHaveClass('theme-light')
      expect(document.body).toHaveClass('theme-light')
      expect(document.documentElement.dataset.theme).toBe('light')
      // The accent is the one of the theme that is drawn now.
      expect(root.style.getPropertyValue('--accent')).toBe(
        ACCENT_CHOICES.ocean.light
      )
      // What is saved stays "follow the system": nothing was written.
      expect(useAppStore.getState().data?.prefs.theme).toBe('system')
      expect(window.quickLaunch.saveData).not.toHaveBeenCalled()

      system.set(true)
      expect(root).toHaveClass('theme-dark')
    })

    it.each(['light', 'dark'] as const)(
      'leaves a chosen theme (%s) alone whatever Windows does',
      async (theme) => {
        system = installSystemTheme(theme === 'light')
        mockLoadedData((data) => {
          data.prefs.theme = theme
        })

        render(<App />)
        const root = await screen.findByTestId('app-root')
        expect(root).toHaveClass(`theme-${theme}`)

        system.set(theme !== 'light')

        expect(root).toHaveClass(`theme-${theme}`)
      }
    )

    it('is what the settings dialog previews when "system" is picked there', async () => {
      system = installSystemTheme(true)
      mockLoadedData((data) => {
        data.prefs.theme = 'light'
      })

      render(<App />)
      const root = await screen.findByTestId('app-root')
      expect(root).toHaveClass('theme-light')

      act(() => useAppStore.getState().setPreviewPrefs({ theme: 'system' }))

      expect(root).toHaveClass('theme-dark')
      act(() => useAppStore.getState().setPreviewPrefs(null))
      expect(root).toHaveClass('theme-light')
    })
  })

  describe('the first frame, before the data has arrived', () => {
    let deliver: (result: QuickLaunchResult<AppData>) => void

    function openAt(search: string): void {
      window.history.replaceState(null, '', `/${search}`)
    }

    beforeEach(() => {
      vi.mocked(window.quickLaunch.loadData).mockReturnValue(
        new Promise((resolve) => {
          deliver = resolve
        })
      )
    })

    afterEach(() => {
      openAt('')
    })

    it.each(['dark', 'light'] as const)(
      'wears the %s theme the main process put in the URL',
      async (theme) => {
        openAt(`?theme=${theme}`)

        render(<App />)

        expect(screen.getByTestId('loading-screen')).toBeInTheDocument()
        for (const target of [document.documentElement, document.body]) {
          expect(target).toHaveClass(`theme-${theme}`)
          expect(target.dataset.theme).toBe(theme)
        }
        await act(async () => {})
        expect(document.documentElement).toHaveClass(`theme-${theme}`)
      }
    )

    it.each(['', '?theme=sepia', '?theme=system'])(
      'is light, the default, when the URL names no theme it knows (%j)',
      (search) => {
        openAt(search)

        render(<App />)

        expect(document.documentElement).toHaveClass('theme-light')
        expect(document.documentElement).not.toHaveClass('theme-dark')
      }
    )

    it('hands over to the saved theme once the data is there', async () => {
      openAt('?theme=light')
      render(<App />)
      expect(document.documentElement).toHaveClass('theme-light')

      const data = createDefaultAppData()
      data.prefs.theme = 'dark'
      await act(async () => {
        deliver({ ok: true, data })
      })

      const root = await screen.findByTestId('app-root')
      expect(root).toHaveClass('theme-dark')
      expect(document.documentElement).toHaveClass('theme-dark')
      expect(document.documentElement).not.toHaveClass('theme-light')
    })
  })
})
