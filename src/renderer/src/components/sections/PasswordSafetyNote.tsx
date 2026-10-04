import { useState } from 'react'

import { useI18n } from '../../hooks/use-i18n'
import { IconClose, IconInfo } from '../common/icons'

const DISMISSED_KEY = 'password-safety-dismissed'
// Up to 3.0.1 the note could only be folded down to its first line, and that was remembered under
// this key. Whoever folded it has read it: for them it stays away as well.
const FOLDED_KEY = 'password-safety-collapsed'

function readDismissed(): boolean {
  try {
    return (
      localStorage.getItem(DISMISSED_KEY) === '1' ||
      localStorage.getItem(FOLDED_KEY) === '1'
    )
  } catch {
    // Storage can be unavailable; the note is then simply shown every time.
    return false
  }
}

function rememberDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Not remembering is harmless: the note comes back and can be closed again.
  }
}

/**
 * The security boundary of the password category, said at the top of its page until the user closes
 * it: this is a convenient place to keep passwords, not a password manager. Closing it is for good
 * (the choice is kept in the window's local storage, like the other first-use hints); the form of
 * a password item goes on saying the same thing.
 */
export default function PasswordSafetyNote(): JSX.Element | null {
  const { t } = useI18n()
  const [dismissed, setDismissed] = useState(readDismissed)

  if (dismissed) return null

  return (
    <aside className="pwd-safety" data-testid="password-safety-note">
      <div className="pwd-safety-head">
        <IconInfo className="pwd-safety-icon" size={14} aria-hidden />
        <span className="pwd-safety-title">{t('pwd_safety_title')}</span>
        <button
          className="icon-button pwd-safety-close"
          type="button"
          data-testid="password-safety-dismiss"
          title={t('pwd_safety_dismiss')}
          aria-label={t('pwd_safety_dismiss')}
          onClick={() => {
            setDismissed(true)
            rememberDismissed()
          }}
        >
          <IconClose size={12} />
        </button>
      </div>
      <p className="pwd-safety-body">{t('pwd_safety_body')}</p>
    </aside>
  )
}
