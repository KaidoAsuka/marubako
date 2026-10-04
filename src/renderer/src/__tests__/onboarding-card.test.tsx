// flow-4: the first-run card is three lines that are learned by doing them. Each is ticked by what
// the user really does, the card folds away by itself after the last one, and what was done is
// remembered across restarts.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../shared/default-data'
import type { ActivateSource, AppData } from '../../../shared/types'
import OnboardingCard from '../components/layout/OnboardingCard'
import { entryIds, ONBOARDING_KEY } from '../hooks/use-onboarding'
import { useAppStore } from '../store/use-app-store'

let activations: Array<(source?: ActivateSource) => void> = []

function launchSettings(shortcut: string, shortcutAvailable: boolean): void {
  vi.mocked(window.quickLaunch.getLaunchSettings).mockResolvedValue({
    ok: true,
    data: {
      openAtLogin: false,
      canAutoStart: true,
      shortcut,
      shortcutAvailable,
    },
  })
}

function showData(mutate: (data: AppData) => void = () => {}): AppData {
  const data = createDefaultAppData('en')
  mutate(data)
  useAppStore.setState({ data, loading: false })
  return data
}

async function mountCard(): Promise<ReturnType<typeof render>> {
  let view: ReturnType<typeof render> | undefined
  await act(async () => {
    view = render(<OnboardingCard />)
  })
  return view!
}

const done = (name: 'added' | 'bubble' | 'hotkey') =>
  screen.getByTestId(`onboarding-step-${name}`).hasAttribute('data-done')

function collapsed(value: boolean): void {
  act(() => {
    useAppStore.setState({
      windowState: { ...useAppStore.getState().windowState, collapsed: value },
    })
  })
}

function stored(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(ONBOARDING_KEY) ?? 'null')
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', '/?firstrun=1')
  activations = []
  vi.mocked(window.quickLaunch.onActivate).mockImplementation((callback) => {
    activations.push(callback)
    return () => {
      activations = activations.filter((entry) => entry !== callback)
    }
  })
  launchSettings('Ctrl + Shift + Space', true)
  useAppStore.setState({
    data: null,
    windowState: { alwaysOnTop: false, collapsed: false, opacity: 1 },
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

describe('the three lines', () => {
  it('are shown in order, the last with the shortcut that really is in effect', async () => {
    launchSettings('Ctrl + Shift + Space', true)
    showData()
    await mountCard()

    const steps = screen.getAllByRole('listitem')
    expect(steps.map((step) => step.getAttribute('data-testid'))).toEqual([
      'onboarding-step-added',
      'onboarding-step-bubble',
      'onboarding-step-hotkey',
    ])
    expect(steps[0]).toHaveTextContent('Add your first item')
    expect(steps[1]).toHaveTextContent('click it to peek, double-click')
    expect(steps[2]).toHaveTextContent(
      'Ctrl + Shift + Space brings the panel back from anywhere'
    )
    expect(steps[2]?.querySelector('kbd')).toHaveTextContent(
      'Ctrl + Shift + Space'
    )
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Get started'
    )
  })

  it('leave out the shortcut when none could be registered, rather than name a key that does nothing', async () => {
    launchSettings('Ctrl + Shift + Space', false)
    showData()
    await mountCard()

    expect(screen.queryByTestId('onboarding-step-hotkey')).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('are in the language of the data, three of them in each', async () => {
    for (const [lang, title] of [
      ['zh', '快速上手'],
      ['ja', 'はじめに'],
    ] as const) {
      showData((data) => {
        data.prefs.lang = lang
      })
      const view = await mountCard()

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(title)
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
      expect(
        screen.getByTestId('onboarding-step-hotkey').querySelector('kbd')
      ).toHaveTextContent('Ctrl + Shift + Space')
      view.unmount()
      localStorage.clear()
    }
  })
})

describe('ticking by doing', () => {
  it('ticks the first line when an entry is added, however it was added', async () => {
    const data = showData()
    await mountCard()
    expect(done('added')).toBe(false)

    const added = structuredClone(data)
    added.loose.websites.push({
      id: 'site-new',
      kind: 'website',
      name: 'Example',
      url: 'https://example.com',
      icon: 'tile:globe:1',
    })
    act(() => {
      useAppStore.setState({ data: added })
    })

    expect(done('added')).toBe(true)
  })

  it('does not tick the first line for a sample that was deleted, or for an edit', async () => {
    const data = showData()
    await mountCard()

    const edited = structuredClone(data)
    edited.websites[0]!.items.pop()
    edited.folders[0]!.items[0]!.name = 'Renamed'
    act(() => {
      useAppStore.setState({ data: edited })
    })

    expect(done('added')).toBe(false)
  })

  it('ticks the second line when the panel has been folded into the ball and opened again, not before', async () => {
    showData()
    await mountCard()

    collapsed(true)
    expect(done('bubble')).toBe(false)
    collapsed(false)

    expect(done('bubble')).toBe(true)
  })

  it('ticks the third line for the global shortcut only', async () => {
    showData()
    await mountCard()

    act(() => activations.forEach((callback) => callback('other')))
    expect(done('hotkey')).toBe(false)
    act(() => activations.forEach((callback) => callback('hotkey')))

    expect(done('hotkey')).toBe(true)
  })

  it('remembers what was done, and picks it up at the next start', async () => {
    showData()
    const first = await mountCard()
    collapsed(true)
    collapsed(false)
    expect(stored()).toMatchObject({ dismissed: false, bubble: true })
    first.unmount()

    // The next start is not a first run any more, but the card is still open and still ticked.
    window.history.replaceState(null, '', '/')
    showData()
    await mountCard()

    expect(done('bubble')).toBe(true)
    expect(done('added')).toBe(false)
  })

  it('keeps the entries as they were when it began, so that old data never ticks the first line', async () => {
    const data = showData()
    await mountCard()

    expect(stored()?.baseline).toEqual(entryIds(data))
    expect(entryIds(data)).toContain('folder-desktop')
  })
})

describe('finishing', () => {
  async function doEverything(): Promise<void> {
    const data = useAppStore.getState().data!
    const added = structuredClone(data)
    added.loose.apps.push({
      id: 'app-new',
      kind: 'app',
      name: 'Tool',
      path: 'C:\\tool.exe',
      icon: 'tile:rocket-launch:1',
    })
    act(() => {
      useAppStore.setState({ data: added })
    })
    collapsed(true)
    collapsed(false)
    act(() => activations.forEach((callback) => callback('hotkey')))
  }

  it('says it is all set, folds away a moment later, and is gone for good', async () => {
    showData()
    await mountCard()
    vi.useFakeTimers()

    await doEverything()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'All set'
    )
    expect(screen.getByTestId('onboarding-card')).not.toHaveAttribute(
      'data-folding'
    )

    act(() => {
      vi.advanceTimersByTime(1199)
    })
    expect(screen.getByTestId('onboarding-card')).not.toHaveAttribute(
      'data-folding'
    )
    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(screen.getByTestId('onboarding-card')).toHaveAttribute(
      'data-folding'
    )
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(screen.queryByTestId('onboarding-card')).toBeNull()
    expect(stored()).toMatchObject({ dismissed: true })
  })

  it('does not finish while the shortcut is not known yet, or before every line is done', async () => {
    showData()
    await mountCard()
    vi.useFakeTimers()

    collapsed(true)
    collapsed(false)
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.getByTestId('onboarding-card')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Get started'
    )
  })

  it('finishes with two lines when there is no shortcut line', async () => {
    launchSettings('Ctrl + Shift + Space', false)
    showData()
    await mountCard()
    vi.useFakeTimers()

    await doEverything()
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(screen.queryByTestId('onboarding-card')).toBeNull()
  })

  it('leaves the ball line out while the ball is turned off, and finishes without it', async () => {
    showData((data) => {
      data.prefs.showBubble = false
    })
    await mountCard()
    vi.useFakeTimers()

    expect(screen.queryByTestId('onboarding-step-bubble')).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)

    const added = structuredClone(useAppStore.getState().data!)
    added.loose.apps.push({
      id: 'app-new',
      kind: 'app',
      name: 'Tool',
      path: 'C:\tool.exe',
      icon: 'tile:rocket-launch:1',
    })
    act(() => {
      useAppStore.setState({ data: added })
    })
    act(() => activations.forEach((callback) => callback('hotkey')))
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(screen.queryByTestId('onboarding-card')).toBeNull()
  })

  it('can still be closed by hand before that', async () => {
    showData()
    await mountCard()
    vi.useFakeTimers()

    fireEvent.click(screen.getByTestId('onboarding-dismiss'))
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(screen.queryByTestId('onboarding-card')).toBeNull()
    expect(stored()).toMatchObject({ dismissed: true })
  })
})

describe('entryIds', () => {
  it('lists the items of the groups and the loose ones, of every category', () => {
    const data = createDefaultAppData('en')
    data.loose.commands.push({
      id: 'cmd-loose',
      kind: 'command',
      name: 'ls',
      description: '',
      language: 'bash',
      content: 'ls',
      icon: 'tile:terminal-window:1',
    })

    expect(entryIds(data)).toEqual(
      expect.arrayContaining([
        'folder-desktop',
        'site-github',
        'note-usage',
        'cmd-loose',
      ])
    )
    expect(entryIds(null)).toEqual([])
  })
})
