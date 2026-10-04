import { useEffect, useRef, useState } from 'react'

import type { UpdateCheckResult } from '../../../../shared/types'
import { useI18n } from '../../hooks/use-i18n'
import { useAppStore } from '../../store/use-app-store'

type CheckState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'done'; result: UpdateCheckResult }

const RESULT_KEYS: Record<UpdateCheckResult['status'], string> = {
  disabled: 'update_disabled',
  latest: 'update_latest',
  downloading: 'update_downloading',
  ready: 'update_ready',
  error: 'update_error',
}

/**
 * The "about" block of the settings: the running version, "Check for updates" with the answer in
 * words, and the way to report a problem (the project's issue page, opened by the main process).
 * The program also checks by itself a little after start-up; this is for asking now.
 */
export default function AboutSettings({
  disabled,
}: {
  disabled: boolean
}): JSX.Element {
  const { t } = useI18n()
  const showToast = useAppStore((state) => state.showToast)
  const [version, setVersion] = useState<string | null>(null)
  const [check, setCheck] = useState<CheckState>({ phase: 'idle' })
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    void window.quickLaunch
      .getAppInfo()
      .then((result) => {
        if (mounted.current && result.ok) setVersion(result.data.version)
      })
      .catch(() => undefined)
    return () => {
      mounted.current = false
    }
  }, [])

  async function checkForUpdates(): Promise<void> {
    setCheck({ phase: 'checking' })
    let result: UpdateCheckResult
    try {
      const answer = await window.quickLaunch.checkForUpdates()
      result = answer.ok ? answer.data : { status: 'error' }
    } catch {
      result = { status: 'error' }
    }
    if (mounted.current) setCheck({ phase: 'done', result })
  }

  async function installUpdate(): Promise<void> {
    try {
      const answer = await window.quickLaunch.installUpdate()
      if (!answer.ok) showToast(answer.error, 'danger')
    } catch (error) {
      showToast(String(error), 'danger')
    }
  }

  async function reportProblem(): Promise<void> {
    try {
      const answer = await window.quickLaunch.openIssuesPage()
      if (!answer.ok) showToast(answer.error, 'danger')
    } catch (error) {
      showToast(String(error), 'danger')
    }
  }

  const message =
    check.phase === 'checking'
      ? t('update_checking')
      : check.phase === 'done'
        ? t(RESULT_KEYS[check.result.status]).replace(
            '{version}',
            'version' in check.result ? check.result.version : ''
          )
        : ''

  return (
    <div className="settings-about" data-testid="settings-about">
      {version && (
        <span className="settings-about-version" data-testid="settings-version">
          {t('about_version').replace('{version}', version)}
        </span>
      )}
      <div className="settings-about-actions">
        <button
          className="secondary-button"
          type="button"
          data-testid="settings-check-updates"
          disabled={disabled || check.phase === 'checking'}
          onClick={() => void checkForUpdates()}
        >
          {t('update_check')}
        </button>
        {check.phase === 'done' && check.result.status === 'ready' && (
          <button
            className="primary-button"
            type="button"
            data-testid="settings-install-update"
            disabled={disabled}
            onClick={() => void installUpdate()}
          >
            {t('update_install')}
          </button>
        )}
        <button
          className="text-button"
          type="button"
          data-testid="settings-report-problem"
          onClick={() => void reportProblem()}
        >
          {t('report_problem')}
        </button>
      </div>
      <span
        className="form-field-note"
        role="status"
        data-testid="settings-update-result"
      >
        {message}
      </span>
    </div>
  )
}
