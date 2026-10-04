import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import { BACKGROUNDS, type BackgroundKey } from '../../../../../shared/types'
import { translations } from '../../../i18n/translations'
import { ACCENT_CHOICES } from '../../../styles/background-theme'
import { useAppStore } from '../../../store/use-app-store'
import AccentDots from '../AccentDots'
import SettingsForm from '../SettingsForm'

const names = translations.en.strings

function setLang(lang: 'zh' | 'en' | 'ja'): void {
  const data = createDefaultAppData()
  data.prefs.lang = lang
  useAppStore.setState({ data, loading: false, saving: false })
}

describe('AccentDots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setLang('en')
  })

  afterEach(() => {
    cleanup()
  })

  const renderDots = (
    value: BackgroundKey = 'aurora',
    theme: 'dark' | 'light' = 'dark',
    onChange: (value: BackgroundKey) => void = () => {}
  ) =>
    render(
      <AccentDots
        value={value}
        theme={theme}
        label="Accent color"
        onChange={onChange}
      />
    )

  it('is one named radio group with a dot per choice, each with a title and an aria-label', () => {
    renderDots()

    const group = screen.getByRole('radiogroup', { name: 'Accent color' })
    const dots = within(group).getAllByRole('radio')
    expect(dots).toHaveLength(5)
    expect(dots.map((dot) => dot.getAttribute('data-testid'))).toEqual(
      BACKGROUNDS.map((key) => `background-${key}`)
    )
    for (const [index, key] of BACKGROUNDS.entries()) {
      const name = names[`bg_${key}`]!
      expect(dots[index]).toHaveAccessibleName(name)
      expect(dots[index]).toHaveAttribute('title', name)
      expect(dots[index]).toHaveAttribute('type', 'button')
    }
    expect(dots.map((dot) => dot.getAttribute('aria-label'))).toEqual([
      'Violet',
      'Coral',
      'Teal',
      'Blue',
      'Graphite',
    ])
  })

  it('marks the chosen dot with a check mark and a ring class, and the others with neither', () => {
    renderDots('forest')

    for (const key of BACKGROUNDS) {
      const dot = screen.getByTestId(`background-${key}`)
      const chosen = key === 'forest'

      expect(dot).toHaveAttribute('aria-checked', String(chosen))
      expect(dot.classList.contains('active')).toBe(chosen)
      // Not colour alone: the chosen one also carries a glyph.
      expect(dot.querySelector('svg') !== null).toBe(chosen)
    }
  })

  it('keeps only the chosen dot in the tab order', () => {
    renderDots('ocean')

    for (const key of BACKGROUNDS) {
      expect(screen.getByTestId(`background-${key}`)).toHaveAttribute(
        'tabindex',
        key === 'ocean' ? '0' : '-1'
      )
    }
  })

  it('fills each dot with the solid colour of the theme being edited', () => {
    const { rerender } = renderDots('aurora', 'dark')
    const fill = (key: BackgroundKey) =>
      screen.getByTestId(`background-${key}`).style.getPropertyValue('--dot')

    for (const key of BACKGROUNDS) {
      expect(fill(key)).toBe(ACCENT_CHOICES[key].solidDark)
    }

    rerender(
      <AccentDots
        value="aurora"
        theme="light"
        label="Accent color"
        onChange={() => {}}
      />
    )
    for (const key of BACKGROUNDS) {
      expect(fill(key)).toBe(ACCENT_CHOICES[key].solidLight)
    }
    // Where the two solids differ the dot really changes with the theme.
    expect(ACCENT_CHOICES.ocean.solidDark).not.toBe(
      ACCENT_CHOICES.ocean.solidLight
    )
  })

  it('chooses a dot by clicking it', () => {
    const onChange = vi.fn()
    renderDots('aurora', 'dark', onChange)

    fireEvent.click(screen.getByTestId('background-sunset'))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('sunset')
  })

  it('walks the dots with the arrow keys, Home and End, wrapping round, and moves focus with the choice', () => {
    const onChange = vi.fn()
    const { rerender } = renderDots('aurora', 'dark', onChange)
    const press = (key: BackgroundKey, name: string) =>
      fireEvent.keyDown(screen.getByTestId(`background-${key}`), { key: name })

    press('aurora', 'ArrowRight')
    expect(onChange).toHaveBeenLastCalledWith('sunset')
    expect(screen.getByTestId('background-sunset')).toHaveFocus()

    press('aurora', 'ArrowLeft')
    expect(onChange).toHaveBeenLastCalledWith('minimal')
    press('minimal', 'ArrowRight')
    expect(onChange).toHaveBeenLastCalledWith('aurora')
    press('forest', 'ArrowDown')
    expect(onChange).toHaveBeenLastCalledWith('ocean')
    press('forest', 'ArrowUp')
    expect(onChange).toHaveBeenLastCalledWith('sunset')
    press('forest', 'End')
    expect(onChange).toHaveBeenLastCalledWith('minimal')
    press('forest', 'Home')
    expect(onChange).toHaveBeenLastCalledWith('aurora')

    onChange.mockClear()
    press('forest', 'Tab')
    press('forest', 'a')
    expect(onChange).not.toHaveBeenCalled()
    rerender(
      <AccentDots
        value="aurora"
        theme="dark"
        label="Accent color"
        onChange={onChange}
      />
    )
  })
})

describe('the accent colour in the settings dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  const openAppearance = async () => {
    await act(async () => {
      render(<SettingsForm />)
    })
  }

  it.each([
    ['zh', '强调色', ['紫罗兰', '珊瑚橙', '青', '海蓝', '石墨']],
    ['en', 'Accent color', ['Violet', 'Coral', 'Teal', 'Blue', 'Graphite']],
    [
      'ja',
      'アクセントカラー',
      ['バイオレット', 'コーラル', 'ティール', 'ブルー', 'グラファイト'],
    ],
  ] as const)(
    'is named "%s" with five dots named in that language',
    async (lang, title, labels) => {
      setLang(lang)
      await openAppearance()

      const group = screen.getByRole('radiogroup', { name: title })
      expect(
        within(group)
          .getAllByRole('radio')
          .map((dot) => dot.getAttribute('aria-label'))
      ).toEqual([...labels])
      // The old text pills and the word "background" are gone.
      expect(screen.queryByText('背景')).toBeNull()
      expect(screen.queryByText('Background')).toBeNull()
    }
  )

  it('saves the chosen dot as prefs.background', async () => {
    setLang('en')
    await openAppearance()

    fireEvent.click(screen.getByTestId('background-forest'))
    expect(screen.getByTestId('background-forest')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByTestId('background-aurora')).toHaveAttribute(
      'aria-checked',
      'false'
    )
    await act(async () => {
      fireEvent.click(screen.getByTestId('settings-save'))
    })

    expect(useAppStore.getState().data?.prefs.background).toBe('forest')
  })

  it('shows the dots in the solid colours of the theme chosen in the same dialog', async () => {
    setLang('en')
    await openAppearance()
    const dot = () =>
      screen.getByTestId('background-ocean').style.getPropertyValue('--dot')

    expect(dot()).toBe(ACCENT_CHOICES.ocean.solidDark)
    fireEvent.click(screen.getByTestId('theme-light'))
    expect(dot()).toBe(ACCENT_CHOICES.ocean.solidLight)
  })
})
