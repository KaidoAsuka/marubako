import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { Lang } from '../../../../../shared/types'
import { safetyStrings } from '../../../i18n/safety'
import { useAppStore } from '../../../store/use-app-store'
import GroupSection from '../GroupSection'
import PasswordSafetyNote from '../PasswordSafetyNote'

function useLang(lang: Lang): void {
  const data = createDefaultAppData()
  data.prefs.lang = lang
  useAppStore.setState({
    data,
    loading: false,
    currentTab: 'passwords',
    modal: null,
    widgetPopup: null,
  })
}

describe('PasswordSafetyNote', () => {
  beforeEach(() => {
    localStorage.clear()
    useLang('en')
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('states the security boundary in full, open, the first time', () => {
    render(<PasswordSafetyNote />)

    const body = screen.getByText(/encrypted with your current Windows account/)
    expect(body).toBeVisible()
    expect(body).toHaveTextContent('Anyone who can sign in to this Windows')
    expect(body).toHaveTextContent('dedicated password manager')
    expect(screen.getByTestId('password-safety-toggle')).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('folds down to its one line and unfolds again, remembering the choice', () => {
    const { unmount } = render(<PasswordSafetyNote />)
    const toggle = screen.getByTestId('password-safety-toggle')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.getByText('Convenient storage, not a password manager')
    ).toBeVisible()
    expect(
      screen.getByText(/encrypted with your current Windows/)
    ).not.toBeVisible()

    // A new visit to the page starts as the user left it.
    unmount()
    render(<PasswordSafetyNote />)
    expect(screen.getByTestId('password-safety-toggle')).toHaveAttribute(
      'aria-expanded',
      'false'
    )

    fireEvent.click(screen.getByTestId('password-safety-toggle'))
    expect(
      screen.getByText(/encrypted with your current Windows/)
    ).toBeVisible()
    expect(localStorage.getItem('password-safety-collapsed')).toBeNull()
  })

  it('still works when the browser storage cannot be used', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<PasswordSafetyNote />)

    fireEvent.click(screen.getByTestId('password-safety-toggle'))

    expect(screen.getByTestId('password-safety-toggle')).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it.each(['zh', 'en', 'ja'] as const)('speaks %s', (lang) => {
    useLang(lang)
    render(<PasswordSafetyNote />)

    expect(
      screen.getByText(safetyStrings[lang].pwd_safety_title!)
    ).toBeVisible()
    expect(screen.getByText(safetyStrings[lang].pwd_safety_body!)).toBeVisible()
  })
})

describe('the passwords page', () => {
  beforeEach(() => {
    localStorage.clear()
    useLang('zh')
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
  })

  afterEach(cleanup)

  it('carries the note, even while it has no entries', () => {
    render(<GroupSection tab="passwords" />)

    expect(screen.getByTestId('password-safety-note')).toBeInTheDocument()
    expect(screen.getByTestId('password-safety-note')).toHaveTextContent(
      '用当前 Windows 账户加密'
    )
  })

  it.each(['folders', 'websites', 'apps', 'commands', 'notes'] as const)(
    'is not shown on the %s page',
    (tab) => {
      render(<GroupSection tab={tab} />)

      expect(screen.queryByTestId('password-safety-note')).toBeNull()
    }
  )
})
