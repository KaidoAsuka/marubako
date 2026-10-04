import { useId, useState } from 'react'

import { useI18n } from '../../hooks/use-i18n'
import { IconCaretDown, IconCaretUp, IconInfo } from '../common/icons'

const COLLAPSED_KEY = 'password-safety-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    // Storage can be unavailable; the note then simply starts open every time.
    return false
  }
}

function rememberCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(COLLAPSED_KEY, '1')
    else localStorage.removeItem(COLLAPSED_KEY)
  } catch {
    // Not remembering is harmless.
  }
}

/**
 * The security boundary of the password category, said once at the top of its page: this is a
 * convenient place to keep passwords, not a password manager. It is a permanent line the user may
 * fold down to its first sentence (and the choice is remembered), never a dialog shown on every use.
 */
export default function PasswordSafetyNote(): JSX.Element {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const bodyId = useId()

  return (
    <aside
      className="pwd-safety"
      data-testid="password-safety-note"
      data-collapsed={collapsed ? 'true' : undefined}
    >
      <button
        className="pwd-safety-toggle"
        type="button"
        data-testid="password-safety-toggle"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        title={t('pwd_safety_title')}
        onClick={() => {
          const next = !collapsed
          setCollapsed(next)
          rememberCollapsed(next)
        }}
      >
        <IconInfo className="pwd-safety-icon" size={14} aria-hidden />
        <span className="pwd-safety-title">{t('pwd_safety_title')}</span>
        {collapsed ? (
          <IconCaretDown size={12} aria-hidden />
        ) : (
          <IconCaretUp size={12} aria-hidden />
        )}
      </button>
      <p id={bodyId} className="pwd-safety-body" hidden={collapsed}>
        {t('pwd_safety_body')}
      </p>
    </aside>
  )
}
