import { IconError, IconInfo, IconWarning } from '../common/icons'
import { useState, type ReactNode } from 'react'

import type { StartupNotice } from '../../../../shared/types'
import { useI18n } from '../../hooks/use-i18n'
import { useAppStore } from '../../store/use-app-store'
import { describeOpenFailure } from '../../utils/open-errors'

const RESET_REASON_KEYS = {
  decrypt: 'data_reset_decrypt',
  parse: 'data_reset_parse',
  schema: 'data_reset_schema',
} as const

/** Directory part of a Windows (or POSIX) path, for opening the folder that holds a recovery file. */
function parentDirectory(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  if (index < 0) {
    return filePath
  }

  const directory = filePath.slice(0, index)
  if (/^[A-Za-z]:$/.test(directory)) {
    return `${directory}\\`
  }

  return directory || filePath.slice(0, index + 1)
}

// The version of the newest "there is a newer version" notice the user dismissed. That notice is
// for one version: it comes back with the next one, not with the next start.
const UPDATE_DISMISSED_KEY = 'update-notice-dismissed'

function dismissedUpdate(): string {
  try {
    return localStorage.getItem(UPDATE_DISMISSED_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberDismissedUpdate(version: string): void {
  try {
    localStorage.setItem(UPDATE_DISMISSED_KEY, version)
  } catch {
    // Storage is not there: the notice comes back with the next start.
  }
}

/**
 * Notices that need reading: the data was reset or restored, passwords could not be decrypted, or
 * (in a portable copy) there is a newer version. They wait here until dismissed. A failed disk
 * write is not one of them: it is the error line of the feedback strip at the bottom, with its
 * Retry button.
 */
export default function DataNoticeBanner(): JSX.Element | null {
  const { t, lang } = useI18n()
  const allNotices = useAppStore((state) => state.dataStatus.notices)
  const dismissNotice = useAppStore((state) => state.dismissNotice)
  const importData = useAppStore((state) => state.importData)
  const showToast = useAppStore((state) => state.showToast)
  const [busy, setBusy] = useState(false)
  const [skippedUpdate, setSkippedUpdate] = useState(dismissedUpdate)
  const notices = allNotices.filter(
    (notice) =>
      notice.kind !== 'updateAvailable' || notice.version !== skippedUpdate
  )

  if (notices.length === 0) {
    return null
  }

  const openDownloadPage = async (): Promise<void> => {
    const result = await window.quickLaunch.openReleasesPage()
    if (!result.ok) showToast(result.error, 'danger')
  }

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  const openRecoveryFolder = async (recoveryPath: string): Promise<void> => {
    const folder = parentDirectory(recoveryPath)
    const result = await window.quickLaunch.openPath(folder)
    if (!result.ok) {
      // In the window's language, not the raw English error of the main process.
      showToast(describeOpenFailure(result.code, folder, lang), 'danger')
    }
  }

  const importBackup = async (notice: StartupNotice): Promise<void> => {
    // The main process asks for confirmation once the file is chosen.
    const before = useAppStore.getState().data
    await importData({ successMessage: t('import_success') })
    // A canceled or failed import leaves `data` untouched, so the notice stays until it is dismissed.
    if (useAppStore.getState().data !== before) {
      await dismissNotice(notice.kind)
    }
  }

  const recoveryLine = (recoveryPath: string): ReactNode =>
    recoveryPath ? (
      <p className="data-notice-line">
        {t('data_recovery_path')}
        <code className="data-notice-path">{recoveryPath}</code>
      </p>
    ) : null

  const actionButton = (
    label: string,
    onClick: () => void,
    testId: string
  ): JSX.Element => (
    <button
      className="secondary-button data-notice-button"
      type="button"
      data-testid={testId}
      disabled={busy}
      onClick={onClick}
    >
      {label}
    </button>
  )

  const openFolderButton = (kind: string, recoveryPath: string): ReactNode =>
    recoveryPath
      ? actionButton(
          t('data_open_folder'),
          () => void openRecoveryFolder(recoveryPath),
          `data-notice-open-folder-${kind}`
        )
      : null

  const dismissButton = (notice: StartupNotice): JSX.Element =>
    actionButton(
      t('data_dismiss'),
      () => void run(() => dismissNotice(notice.kind)),
      `data-notice-dismiss-${notice.kind}`
    )

  const renderNotice = (notice: StartupNotice): JSX.Element => {
    switch (notice.kind) {
      case 'reset':
        return (
          <div
            key={notice.kind}
            className="data-notice data-notice-danger"
            role="status"
            data-testid="data-notice-reset"
          >
            <IconError className="data-notice-icon" size={16} aria-hidden />
            <div className="data-notice-body">
              <p className="data-notice-line">
                {t(RESET_REASON_KEYS[notice.reason])}
              </p>
              <p className="data-notice-line">{t('data_reset_started')}</p>
              {recoveryLine(notice.recoveryPath)}
            </div>
            <div className="data-notice-actions">
              {openFolderButton(notice.kind, notice.recoveryPath)}
              {actionButton(
                t('data_import_backup'),
                () => void run(() => importBackup(notice)),
                'data-notice-import-reset'
              )}
              {dismissButton(notice)}
            </div>
          </div>
        )
      case 'restored':
        return (
          <div
            key={notice.kind}
            className="data-notice data-notice-warning"
            role="status"
            data-testid="data-notice-restored"
          >
            <IconWarning className="data-notice-icon" size={16} aria-hidden />
            <div className="data-notice-body">
              <p className="data-notice-line">
                {t('data_restored_before')}
                {notice.backupDate}
                {t('data_restored_after')}
              </p>
              {recoveryLine(notice.recoveryPath)}
            </div>
            <div className="data-notice-actions">
              {openFolderButton(notice.kind, notice.recoveryPath)}
              {dismissButton(notice)}
            </div>
          </div>
        )
      case 'passwordsLost':
        return (
          <div
            key={notice.kind}
            className="data-notice data-notice-warning"
            role="status"
            data-testid="data-notice-passwords-lost"
          >
            <IconWarning className="data-notice-icon" size={16} aria-hidden />
            <div className="data-notice-body">
              <p className="data-notice-line">
                {`${notice.count} ${t(
                  notice.count === 1
                    ? 'data_passwords_lost_one'
                    : 'data_passwords_lost_many'
                )}`}
              </p>
            </div>
            <div className="data-notice-actions">{dismissButton(notice)}</div>
          </div>
        )
      case 'updateAvailable':
        return (
          <div
            key={notice.kind}
            className="data-notice data-notice-info"
            role="status"
            data-testid="data-notice-update"
          >
            <IconInfo className="data-notice-icon" size={16} aria-hidden />
            <div className="data-notice-body">
              <p className="data-notice-line">
                {t('update_available').replace('{version}', notice.version)}
              </p>
            </div>
            <div className="data-notice-actions">
              {actionButton(
                t('update_open_download'),
                () => void run(openDownloadPage),
                'data-notice-open-download'
              )}
              {actionButton(
                t('data_dismiss'),
                () => {
                  rememberDismissedUpdate(notice.version)
                  setSkippedUpdate(notice.version)
                  void run(() => dismissNotice(notice.kind))
                },
                'data-notice-dismiss-updateAvailable'
              )}
            </div>
          </div>
        )
    }
  }

  return (
    <div className="data-notice-stack" data-testid="data-notice-stack">
      {notices.map(renderNotice)}
    </div>
  )
}
