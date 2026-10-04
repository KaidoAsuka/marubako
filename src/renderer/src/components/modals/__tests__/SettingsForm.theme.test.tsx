import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import {
  LANGS,
  THEME_SETTINGS,
  type AppData,
  type Lang,
} from '../../../../../shared/types'
import { translations } from '../../../i18n/translations'
import { useAppStore } from '../../../store/use-app-store'
import SettingsForm from '../SettingsForm'

const state = () => useAppStore.getState()

// The theme setting: light, dark, or the one Windows is in. It is a radio group like the other
// choices of the dialog, and what is saved is the setting itself ("system"), not the theme it comes
// to at the moment (App.test.tsx and background-theme.test.ts cover how it is drawn).
async function open(
  configure: (data: AppData) => void = () => {},
  lang: Lang = 'en'
): Promise<void> {
  const data = createDefaultAppData()
  data.prefs.lang = lang
  configure(data)
  useAppStore.setState({
    data,
    loading: false,
    saving: false,
    error: null,
    modal: { kind: 'settings' },
    toast: null,
    previewPrefs: null,
  })
  await act(async () => {
    render(<SettingsForm />)
  })
}

const chip = (theme: (typeof THEME_SETTINGS)[number]) =>
  screen.getByTestId(`theme-${theme}`)
const savedPrefs = () =>
  (vi.mocked(window.quickLaunch.saveData).mock.calls[0]![0] as AppData).prefs

describe('SettingsForm: the theme', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState({ modal: null, previewPrefs: null })
  })

  it('offers light, dark and "same as Windows", in that order', async () => {
    await open()

    expect([...THEME_SETTINGS]).toEqual(['light', 'dark', 'system'])
    const group = screen.getByRole('radiogroup', { name: 'Theme' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((radio) => radio.getAttribute('data-testid'))).toEqual([
      'theme-light',
      'theme-dark',
      'theme-system',
    ])
    expect(radios.map((radio) => radio.textContent)).toEqual([
      'Light',
      'Dark',
      'Same as Windows',
    ])
    for (const radio of radios) {
      expect(radio).toHaveAttribute('type', 'button')
      expect(radio).toHaveClass('chip-button')
    }
  })

  it.each([
    ['zh', '主题', ['浅色', '深色', '跟随系统']],
    ['en', 'Theme', ['Light', 'Dark', 'Same as Windows']],
    ['ja', 'テーマ', ['ライト', 'ダーク', 'Windows に合わせる']],
  ] as const)('is named and labelled in %s', async (lang, title, labels) => {
    await open(() => {}, lang)

    const group = screen.getByRole('radiogroup', { name: title })
    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.textContent)
    ).toEqual([...labels])
  })

  it.each(LANGS)('has the three words in %s', (lang) => {
    for (const theme of THEME_SETTINGS) {
      expect(
        translations[lang].strings[`theme_${theme}`],
        `${lang}.theme_${theme}`
      ).toBeTruthy()
    }
  })

  it('starts on light for a fresh profile', async () => {
    await open()

    expect(chip('light')).toHaveAttribute('aria-checked', 'true')
    expect(chip('light')).toHaveClass('active')
    for (const other of ['dark', 'system'] as const) {
      expect(chip(other)).toHaveAttribute('aria-checked', 'false')
      expect(chip(other)).not.toHaveClass('active')
    }
  })

  it.each(THEME_SETTINGS)(
    'shows a saved "%s" as the chosen one',
    async (saved) => {
      await open((data) => {
        data.prefs.theme = saved
      })

      for (const theme of THEME_SETTINGS) {
        expect(chip(theme)).toHaveAttribute(
          'aria-checked',
          String(theme === saved)
        )
      }
    }
  )

  it('keeps only the chosen option in the tab order', async () => {
    await open((data) => {
      data.prefs.theme = 'system'
    })

    expect(chip('system')).toHaveAttribute('tabindex', '0')
    expect(chip('light')).toHaveAttribute('tabindex', '-1')
    expect(chip('dark')).toHaveAttribute('tabindex', '-1')

    fireEvent.click(chip('dark'))

    expect(chip('dark')).toHaveAttribute('tabindex', '0')
    expect(chip('system')).toHaveAttribute('tabindex', '-1')
  })

  it('chooses with the arrow keys, Home and End, wrapping round, and moves the focus along', async () => {
    await open()
    chip('light').focus()

    fireEvent.keyDown(chip('light'), { key: 'ArrowRight' })
    expect(chip('dark')).toHaveAttribute('aria-checked', 'true')
    expect(chip('dark')).toHaveFocus()

    fireEvent.keyDown(chip('dark'), { key: 'ArrowDown' })
    expect(chip('system')).toHaveAttribute('aria-checked', 'true')
    expect(chip('system')).toHaveFocus()

    // Past the last one is the first again, and back.
    fireEvent.keyDown(chip('system'), { key: 'ArrowRight' })
    expect(chip('light')).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(chip('light'), { key: 'ArrowLeft' })
    expect(chip('system')).toHaveAttribute('aria-checked', 'true')
    expect(chip('system')).toHaveFocus()

    fireEvent.keyDown(chip('system'), { key: 'ArrowUp' })
    expect(chip('dark')).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(chip('dark'), { key: 'Home' })
    expect(chip('light')).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(chip('light'), { key: 'End' })
    expect(chip('system')).toHaveAttribute('aria-checked', 'true')
  })

  it('leaves other keys alone', async () => {
    await open()

    const notPrevented = fireEvent.keyDown(chip('light'), { key: 'a' })
    fireEvent.keyDown(chip('light'), { key: 'Tab' })

    expect(notPrevented).toBe(true)
    expect(chip('light')).toHaveAttribute('aria-checked', 'true')
  })

  it('previews the setting itself at once: "system" is resolved where it is drawn', async () => {
    await open()
    expect(state().previewPrefs?.theme).toBe('light')

    fireEvent.click(chip('system'))

    expect(state().previewPrefs?.theme).toBe('system')
    expect(state().data?.prefs.theme).toBe('light')
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
  })

  it.each(THEME_SETTINGS)('saves "%s" as it is', async (theme) => {
    // Start from another one, so that the click is a change.
    await open((data) => {
      data.prefs.theme = theme === 'dark' ? 'light' : 'dark'
    })

    fireEvent.click(chip(theme))
    fireEvent.click(screen.getByTestId('settings-save'))

    await waitFor(() => expect(window.quickLaunch.saveData).toHaveBeenCalled())
    expect(savedPrefs().theme).toBe(theme)
    await waitFor(() => expect(state().modal).toBeNull())
    expect(state().data?.prefs.theme).toBe(theme)
  })

  it('puts the saved theme back when the dialog is cancelled', async () => {
    await open((data) => {
      data.prefs.theme = 'dark'
    })
    fireEvent.click(chip('system'))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(state().previewPrefs).toBeNull()
    expect(state().data?.prefs.theme).toBe('dark')
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
  })
})
