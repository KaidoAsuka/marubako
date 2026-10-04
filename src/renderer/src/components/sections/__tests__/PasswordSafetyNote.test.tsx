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

  it('states the security boundary in full the first time', () => {
    render(<PasswordSafetyNote />)

    expect(
      screen.getByText('Convenient storage, not a password manager')
    ).toBeVisible()
    const body = screen.getByText(/encrypted with your current Windows account/)
    expect(body).toBeVisible()
    expect(body).toHaveTextContent('Anyone who can sign in to this Windows')
    expect(body).toHaveTextContent('dedicated password manager')
  })

  it('goes away for good when its cross is clicked', () => {
    const { unmount } = render(<PasswordSafetyNote />)

    fireEvent.click(screen.getByTestId('password-safety-dismiss'))
    expect(screen.queryByTestId('password-safety-note')).toBeNull()
    expect(localStorage.getItem('password-safety-dismissed')).toBe('1')

    // A new visit to the page, or a new start of the app, does not bring it back.
    unmount()
    render(<PasswordSafetyNote />)
    expect(screen.queryByTestId('password-safety-note')).toBeNull()
  })

  it('names what the cross does, for the pointer and for a screen reader', () => {
    render(<PasswordSafetyNote />)

    const cross = screen.getByTestId('password-safety-dismiss')
    expect(cross).toHaveAccessibleName('Got it, don’t show again')
    expect(cross).toHaveAttribute('title', 'Got it, don’t show again')
  })

  it('stays away for someone who had folded it in an earlier version', () => {
    localStorage.setItem('password-safety-collapsed', '1')
    render(<PasswordSafetyNote />)

    expect(screen.queryByTestId('password-safety-note')).toBeNull()
  })

  it('can still be closed when the browser storage cannot be used', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<PasswordSafetyNote />)
    expect(screen.getByTestId('password-safety-note')).toBeVisible()

    fireEvent.click(screen.getByTestId('password-safety-dismiss'))

    expect(screen.queryByTestId('password-safety-note')).toBeNull()
  })

  it.each(['zh', 'en', 'ja'] as const)('speaks %s', (lang) => {
    useLang(lang)
    render(<PasswordSafetyNote />)

    expect(
      screen.getByText(safetyStrings[lang].pwd_safety_title!)
    ).toBeVisible()
    expect(screen.getByText(safetyStrings[lang].pwd_safety_body!)).toBeVisible()
    expect(screen.getByTestId('password-safety-dismiss')).toHaveAccessibleName(
      safetyStrings[lang].pwd_safety_dismiss!
    )
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

  it('no longer carries it once it was closed', () => {
    const { unmount } = render(<GroupSection tab="passwords" />)

    fireEvent.click(screen.getByTestId('password-safety-dismiss'))
    expect(screen.queryByTestId('password-safety-note')).toBeNull()

    unmount()
    render(<GroupSection tab="passwords" />)
    expect(screen.queryByTestId('password-safety-note')).toBeNull()
  })

  it.each(['folders', 'websites', 'apps', 'commands', 'notes'] as const)(
    'is not shown on the %s page',
    (tab) => {
      render(<GroupSection tab={tab} />)

      expect(screen.queryByTestId('password-safety-note')).toBeNull()
    }
  )
})
