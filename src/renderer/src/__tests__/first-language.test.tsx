// i18n-copy-1 / product-ux-11: the first frame and the first screen speak the language of the
// computer (the main process puts it in the URL), and a user who got the wrong one can find the
// switch on the first-run card.
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../shared/default-data'
import type { Lang } from '../../../shared/types'
import App from '../App'
import LoadingScreen from '../components/layout/LoadingScreen'
import OnboardingCard from '../components/layout/OnboardingCard'
import { useI18n } from '../hooks/use-i18n'
import { ONBOARDING_KEY } from '../hooks/use-onboarding'
import { useAppStore } from '../store/use-app-store'

function openAt(search: string): void {
  window.history.replaceState(null, '', `/${search}`)
}

function loadAs(lang: Lang): void {
  vi.mocked(window.quickLaunch.loadData).mockResolvedValue({
    ok: true,
    data: createDefaultAppData(lang),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
  localStorage.clear()
  openAt('')
  useAppStore.setState({
    data: null,
    loading: true,
    error: null,
    dataStatus: { writeError: null, notices: [] },
  })
})

afterEach(() => {
  cleanup()
  openAt('')
  document.documentElement.lang = 'zh-CN'
  vi.mocked(window.quickLaunch.loadData).mockReset()
  vi.mocked(window.quickLaunch.loadData).mockImplementation(async () => ({
    ok: true,
    data: createDefaultAppData(),
  }))
})

describe('the first frame, before the data has arrived', () => {
  it('speaks the language the main process put in the URL', () => {
    openAt('?lang=en')
    const { result } = renderHook(() => useI18n())

    expect(result.current.lang).toBe('en')
    expect(result.current.t('loading_workspace')).toBe(
      'Preparing your workspace…'
    )
  })

  it('names the loading screen in that language', () => {
    openAt('?lang=ja')
    render(<LoadingScreen />)

    expect(screen.getByTestId('loading-screen')).toHaveAttribute(
      'aria-label',
      'ワークスペースを準備中…'
    )
  })

  it('falls back to Chinese for a language it does not know, as before', () => {
    openAt('?lang=fr')
    const { result } = renderHook(() => useI18n())

    expect(result.current.lang).toBe('zh')
  })

  it('hands over to the saved language once the data is there', () => {
    openAt('?lang=en')
    const { result } = renderHook(() => useI18n())
    expect(result.current.lang).toBe('en')

    act(() => {
      useAppStore.setState({ data: createDefaultAppData('ja') })
    })

    expect(result.current.lang).toBe('ja')
  })
})

describe('the document language', () => {
  it.each([
    ['zh', 'zh-CN'],
    ['en', 'en'],
    ['ja', 'ja'],
  ] as const)(
    'is set for %s (screen readers and letterforms)',
    async (lang, tag) => {
      loadAs(lang)
      render(<App />)
      await screen.findByTestId('app-root')

      expect(document.documentElement.lang).toBe(tag)
    }
  )

  it('follows a language chosen later', async () => {
    loadAs('zh')
    render(<App />)
    await screen.findByTestId('app-root')
    expect(document.documentElement.lang).toBe('zh-CN')

    act(() => {
      useAppStore.setState({ data: createDefaultAppData('ja') })
    })

    expect(document.documentElement.lang).toBe('ja')
  })
})

describe('the first-run card and its language row', () => {
  /** Mounts the card and lets it hear back about the shortcut, as it does on a real start. */
  async function mountCard(): Promise<ReturnType<typeof render>> {
    let view: ReturnType<typeof render> | undefined
    await act(async () => {
      view = render(<OnboardingCard />)
    })
    return view!
  }

  function showCard(lang: Lang = 'en'): void {
    useAppStore.setState({ data: createDefaultAppData(lang), loading: false })
  }

  it('is not there when this is not a first run, as for an installation that existed before it', async () => {
    showCard()
    await mountCard()

    expect(screen.queryByTestId('onboarding-card')).toBeNull()
    expect(localStorage.getItem(ONBOARDING_KEY)).toBeNull()
  })

  it('is begun on the first run and then comes back on every start until it is closed', async () => {
    openAt('?firstrun=1')
    showCard()
    const first = await mountCard()
    expect(screen.getByTestId('onboarding-card')).toBeInTheDocument()
    expect(
      JSON.parse(localStorage.getItem(ONBOARDING_KEY) ?? '{}')
    ).toMatchObject({ dismissed: false })
    first.unmount()

    // The second start is not a first run any more (no parameter), but the card was begun.
    openAt('')
    await mountCard()
    expect(screen.getByTestId('onboarding-card')).toBeInTheDocument()
  })

  it('names every language in its own words, so a wrong guess can be corrected', async () => {
    openAt('?firstrun=1')
    showCard('ja')
    await mountCard()

    const buttons = buttonsOf(screen.getByTestId('onboarding-language'))
    expect(buttons.map((button) => button.textContent)).toEqual([
      '中文',
      'English',
      '日本語',
    ])
    expect(buttons.map((button) => button.lang)).toEqual(['zh', 'en', 'ja'])
    expect(screen.getByTestId('onboarding-lang-ja')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByTestId('onboarding-lang-en')).toHaveAttribute(
      'aria-checked',
      'false'
    )
    expect(screen.getByRole('radiogroup')).toHaveAccessibleName(
      'Language / 言語 / 语言'
    )
  })

  it('switches the whole interface and saves the choice', async () => {
    openAt('?firstrun=1')
    showCard('en')
    await mountCard()

    fireEvent.click(screen.getByTestId('onboarding-lang-zh'))

    await waitFor(() =>
      expect(useAppStore.getState().data?.prefs.lang).toBe('zh')
    )
    expect(window.quickLaunch.saveData).toHaveBeenCalledTimes(1)
    expect(
      vi.mocked(window.quickLaunch.saveData).mock.calls[0]?.[0].prefs.lang
    ).toBe('zh')
    expect(screen.getByTestId('onboarding-dismiss')).toHaveAttribute(
      'aria-label',
      '不再显示'
    )
  })

  it('does nothing when the language that is already chosen is clicked', async () => {
    openAt('?firstrun=1')
    showCard('en')
    await mountCard()

    fireEvent.click(screen.getByTestId('onboarding-lang-en'))

    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
  })

  it('moves between languages with the arrow keys, like the other radio groups', async () => {
    openAt('?firstrun=1')
    showCard('en')
    await mountCard()

    fireEvent.keyDown(screen.getByTestId('onboarding-lang-en'), {
      key: 'ArrowRight',
    })

    await waitFor(() =>
      expect(useAppStore.getState().data?.prefs.lang).toBe('ja')
    )
  })

  it('is closed for good by its close button, after folding away', async () => {
    openAt('?firstrun=1')
    showCard('en')
    const first = await mountCard()

    fireEvent.click(screen.getByTestId('onboarding-dismiss'))

    expect(screen.getByTestId('onboarding-card')).toHaveAttribute(
      'data-folding'
    )
    await waitFor(() =>
      expect(screen.queryByTestId('onboarding-card')).toBeNull()
    )
    expect(
      JSON.parse(localStorage.getItem(ONBOARDING_KEY) ?? '{}')
    ).toMatchObject({ dismissed: true })
    first.unmount()

    // The next start (a new window, the same storage) does not bring it back.
    await mountCard()
    expect(screen.queryByTestId('onboarding-card')).toBeNull()
  })

  it('stays away when nothing can be remembered, rather than come back every start', async () => {
    openAt('?firstrun=1')
    showCard('en')
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage is blocked')
      })
    try {
      await mountCard()

      expect(screen.queryByTestId('onboarding-card')).toBeNull()
    } finally {
      getItem.mockRestore()
    }
  })

  it('still closes when the choice cannot be written down', async () => {
    openAt('?firstrun=1')
    showCard('en')
    await mountCard()
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota')
      })
    try {
      fireEvent.click(screen.getByTestId('onboarding-dismiss'))

      await waitFor(() =>
        expect(screen.queryByTestId('onboarding-card')).toBeNull()
      )
    } finally {
      setItem.mockRestore()
    }
  })

  it('sits between the category bar and the content on the first screen', async () => {
    openAt('?firstrun=1&lang=en')
    loadAs('en')
    render(<App />)
    const card = await screen.findByTestId('onboarding-card')

    const shell = card.parentElement!
    const order = Array.from(shell.children).map(
      (child) => child.className.split(' ')[0]
    )
    expect(order.indexOf('onboarding-card')).toBe(
      order.indexOf('workspace-nav') + 1
    )
    expect(order.indexOf('workspace')).toBe(
      order.indexOf('onboarding-card') + 1
    )
  })
})

function buttonsOf(group: HTMLElement): HTMLButtonElement[] {
  return Array.from(group.querySelectorAll('button'))
}
