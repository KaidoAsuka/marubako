import { useEffect, useState, type ReactNode } from 'react'

import { LANGS, type Lang } from '../../../../shared/types'
import { useI18n } from '../../hooks/use-i18n'
import { useOnboarding } from '../../hooks/use-onboarding'
import { useRadioKeys } from '../../hooks/use-radio-keys'
import { LANG_NAMES } from '../../i18n/resolve-lang'
import { useAppStore } from '../../store/use-app-store'
import { IconClose, IconDone, IconLanguage } from '../common/icons'

/** The language row names itself in all three languages: it has to be found by someone who cannot read the UI. */
const LANGUAGE_LABEL = 'Language / 言語 / 语言'
// Once every line is done the card says so for this long, then folds away.
const FINISHED_PAUSE_MS = 1200
// The fold (height and opacity) is a CSS transition of about this long; the card goes after it.
const FOLD_MS = 240

type LaunchInfo = { shortcut: string; available: boolean }

function Step({
  done,
  testId,
  children,
}: {
  done: boolean
  testId: string
  children: ReactNode
}): JSX.Element {
  const { t } = useI18n()

  return (
    <li
      className="onboarding-step"
      data-done={done ? '' : undefined}
      data-testid={testId}
    >
      <span
        className="onboarding-check"
        role="img"
        aria-label={done ? t('s_done') : t('s_todo')}
      >
        {done && <IconDone size={12} weight="bold" />}
      </span>
      <span className="onboarding-step-text">{children}</span>
    </li>
  )
}

/**
 * The first-run card, between the category bar and the content: three lines that are learned by
 * doing them, each ticked when it has been done, and a row to switch the language. It folds away
 * by itself a moment after the last line, and can be closed for good at any time.
 *
 * The language row is the visible way out for a user whose computer guessed the wrong language:
 * the settings dialog is the permanent place, but nothing on the first screen says so.
 */
export default function OnboardingCard(): JSX.Element | null {
  const { t, lang } = useI18n()
  const updateData = useAppStore((state) => state.updateData)
  const [launch, setLaunch] = useState<LaunchInfo | null>(null)
  // With the ball turned off the panel collapses to the tray: there is no line about the ball.
  const hasBubble = useAppStore(
    (state) => state.data?.prefs.showBubble !== false
  )
  const { visible, progress, complete, dismiss } = useOnboarding(
    launch === null ? null : launch.available,
    hasBubble
  )
  const [folding, setFolding] = useState(false)

  // The shortcut that really is in effect (the second or third choice when the first is taken).
  useEffect(() => {
    if (!visible) return undefined
    let active = true
    void window.quickLaunch
      .getLaunchSettings()
      .then((result) => {
        if (active && result.ok)
          setLaunch({
            shortcut: result.data.shortcut,
            available: result.data.shortcutAvailable,
          })
        else if (active) setLaunch({ shortcut: '', available: false })
      })
      .catch(() => {
        if (active) setLaunch({ shortcut: '', available: false })
      })
    return () => {
      active = false
    }
  }, [visible])

  // After the last line: a pause to read "all set", then the fold.
  useEffect(() => {
    if (!complete) return undefined
    const timer = window.setTimeout(() => setFolding(true), FINISHED_PAUSE_MS)
    return () => window.clearTimeout(timer)
  }, [complete])

  // The fold has to finish before the card goes, or it would vanish instead of folding.
  useEffect(() => {
    if (!folding) return undefined
    const timer = window.setTimeout(dismiss, FOLD_MS)
    return () => window.clearTimeout(timer)
  }, [folding, dismiss])

  const choose = (next: Lang): void => {
    if (next === lang) return
    void updateData((draft) => {
      draft.prefs.lang = next
    })
  }
  const keys = useRadioKeys<Lang>(LANGS, choose)

  if (!visible) return null

  const [before = '', after = ''] = t('onboard_hotkey').split('{shortcut}')

  return (
    <section
      className="onboarding-card"
      data-testid="onboarding-card"
      data-folding={folding ? '' : undefined}
      aria-label={t('onboard_title')}
    >
      <div className="onboarding-clip">
        <div className="onboarding-body">
          <header className="onboarding-head">
            <h2 className="onboarding-title">
              {complete ? t('onboard_done') : t('onboard_title')}
            </h2>
            <button
              className="icon-button onboarding-close"
              type="button"
              title={t('onboard_dismiss')}
              aria-label={t('onboard_dismiss')}
              data-testid="onboarding-dismiss"
              onClick={() => setFolding(true)}
            >
              <IconClose size={14} />
            </button>
          </header>
          <ul className="onboarding-steps">
            <Step done={progress.added} testId="onboarding-step-added">
              {t('onboard_drop')}
            </Step>
            {hasBubble && (
              <Step done={progress.bubble} testId="onboarding-step-bubble">
                {t('onboard_bubble')}
              </Step>
            )}
            {launch?.available && (
              <Step done={progress.hotkey} testId="onboarding-step-hotkey">
                {before}
                <kbd>{launch.shortcut}</kbd>
                {after}
              </Step>
            )}
          </ul>
          <div
            className="onboarding-language segmented"
            role="radiogroup"
            aria-label={LANGUAGE_LABEL}
            data-testid="onboarding-language"
          >
            <IconLanguage size={14} className="onboarding-language-icon" />
            {LANGS.map((code, index) => (
              <button
                key={code}
                className={`segmented-option ${lang === code ? 'active' : ''}`}
                type="button"
                role="radio"
                lang={code}
                aria-checked={lang === code}
                tabIndex={lang === code ? 0 : -1}
                data-testid={`onboarding-lang-${code}`}
                ref={keys.setRef(index)}
                onClick={() => choose(code)}
                onKeyDown={(event) => keys.onKeyDown(event, index)}
              >
                {LANG_NAMES[code]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
