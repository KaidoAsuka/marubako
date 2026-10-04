import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { DataStatus, Lang } from '../../../../../shared/types'
import { extraStrings } from '../../../i18n/extras'
import { workspaceStrings } from '../../../i18n/workspace'
import { useAppStore } from '../../../store/use-app-store'
import DataNoticeBanner from '../DataNoticeBanner'

const emptyStatus: DataStatus = { writeError: null, notices: [] }

function setStatus(dataStatus: DataStatus, lang: Lang = 'en'): void {
  const data = createDefaultAppData()
  data.prefs.lang = lang
  useAppStore.setState({ data, loading: false, dataStatus, toast: null })
}

describe('DataNoticeBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    setStatus(emptyStatus)
  })

  afterEach(async () => {
    // Let the busy flag of the last click settle inside act().
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders nothing while there is nothing to report', () => {
    const { container } = render(<DataNoticeBanner />)

    expect(container).toBeEmptyDOMElement()
  })

  it('leaves a failed disk write to the feedback strip', () => {
    setStatus({ writeError: 'EPERM: access denied', notices: [] })
    const { container } = render(<DataNoticeBanner />)

    // The write error and its Retry button live at the bottom of the window now (FeedbackStrip).
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the startup notices without the write error beside them', () => {
    setStatus({
      writeError: 'disk full',
      notices: [{ kind: 'passwordsLost', count: 1 }],
    })
    render(<DataNoticeBanner />)

    expect(screen.getByTestId('data-notice-passwords-lost')).toBeInTheDocument()
    expect(screen.queryByText(/disk full/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it.each([
    ['decrypt', 'created on another computer or Windows account'],
    ['parse', 'it is damaged'],
    ['schema', 'created by a newer version'],
  ] as const)(
    'explains a reset caused by a %s failure and where the original file went',
    (reason, text) => {
      setStatus({
        writeError: null,
        notices: [
          {
            kind: 'reset',
            reason,
            recoveryPath: 'C:\\Users\\me\\AppData\\Roaming\\Marubako\\data.bad',
          },
        ],
      })
      render(<DataNoticeBanner />)

      const notice = screen.getByRole('status')
      expect(notice).toHaveTextContent(text)
      expect(notice).toHaveTextContent('Marubako started with default data.')
      expect(notice).toHaveTextContent(
        'C:\\Users\\me\\AppData\\Roaming\\Marubako\\data.bad'
      )
      expect(screen.queryByRole('alert')).toBeNull()
    }
  )

  it('opens the folder that holds the recovered file', async () => {
    setStatus({
      writeError: null,
      notices: [
        {
          kind: 'reset',
          reason: 'parse',
          recoveryPath: 'C:\\Users\\me\\AppData\\Roaming\\Marubako\\data.bad',
        },
      ],
    })
    render(<DataNoticeBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))

    await waitFor(() =>
      expect(window.quickLaunch.openPath).toHaveBeenCalledWith(
        'C:\\Users\\me\\AppData\\Roaming\\Marubako'
      )
    )
  })

  it('opens the drive root when the recovered file sits directly in it, and handles forward slashes', async () => {
    setStatus({
      writeError: null,
      notices: [{ kind: 'reset', reason: 'parse', recoveryPath: 'D:\\x.bad' }],
    })
    const { unmount } = render(<DataNoticeBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    await waitFor(() =>
      expect(window.quickLaunch.openPath).toHaveBeenLastCalledWith('D:\\')
    )
    unmount()

    setStatus({
      writeError: null,
      notices: [
        { kind: 'reset', reason: 'parse', recoveryPath: '/home/me/q/x.bad' },
      ],
    })
    render(<DataNoticeBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))
    await waitFor(() =>
      expect(window.quickLaunch.openPath).toHaveBeenLastCalledWith('/home/me/q')
    )
  })

  it('shows a toast when the folder cannot be opened', async () => {
    setStatus({
      writeError: null,
      notices: [
        { kind: 'reset', reason: 'parse', recoveryPath: 'C:\\q\\x.bad' },
      ],
    })
    vi.mocked(window.quickLaunch.openPath).mockResolvedValueOnce({
      ok: false,
      error: 'ENOENT',
      code: 'path_missing',
    })
    render(<DataNoticeBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }))

    // In the window's language and naming the folder, not the raw error of the main process.
    await waitFor(() =>
      expect(useAppStore.getState().toast).toEqual({
        message:
          'Can’t find “C:\\q”: its path was moved or deleted, or its drive isn’t connected.',
        tone: 'danger',
      })
    )
  })

  it('imports a backup from a reset notice and dismisses it afterwards', async () => {
    setStatus({
      writeError: null,
      notices: [{ kind: 'reset', reason: 'decrypt', recoveryPath: 'C:\\q\\x' }],
    })
    const imported = createDefaultAppData()
    imported.prefs.lang = 'en'
    vi.mocked(window.quickLaunch.importData).mockResolvedValueOnce({
      ok: true,
      data: {
        canceled: false,
        data: imported,
        filePath: 'C:\\backup.json',
        importedAt: new Date().toISOString(),
      },
    })
    render(<DataNoticeBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Import backup' }))

    await waitFor(() =>
      expect(window.quickLaunch.dismissDataNotice).toHaveBeenCalledWith('reset')
    )
    expect(window.quickLaunch.importData).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().toast?.message).toBe('Data imported')
  })

  it('keeps the notice when the import is canceled in the main-process dialogs', async () => {
    setStatus({
      writeError: null,
      notices: [{ kind: 'reset', reason: 'decrypt', recoveryPath: 'C:\\q\\x' }],
    })
    // The file picker and the confirmation are the main process's; "canceled" is what comes back
    // from either of them.
    render(<DataNoticeBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Import backup' }))
    await waitFor(() =>
      expect(window.quickLaunch.importData).toHaveBeenCalledTimes(1)
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Import backup' })
      ).toBeEnabled()
    )

    expect(window.quickLaunch.dismissDataNotice).not.toHaveBeenCalled()
    expect(screen.getByTestId('data-notice-reset')).toBeInTheDocument()
    // The question is no longer a browser confirm() with the system's button words.
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('tells the user which automatic backup was restored', () => {
    setStatus({
      writeError: null,
      notices: [
        {
          kind: 'restored',
          backupPath: 'C:\\q\\backups\\data-2026-09-30.json',
          backupDate: '2026-09-30',
          recoveryPath: 'C:\\q\\data.bad',
        },
      ],
    })
    render(<DataNoticeBanner />)

    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent(
      'restored from the automatic backup of 2026-09-30. Changes made after that date may be missing.'
    )
    expect(notice).toHaveTextContent('C:\\q\\data.bad')
    expect(
      screen.getByRole('button', { name: 'Open folder' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Import backup' })).toBeNull()
  })

  it('leaves out the original-file sentence and the folder button when no original exists', () => {
    setStatus({
      writeError: null,
      notices: [
        {
          kind: 'restored',
          backupPath: 'C:\\q\\backups\\data-2026-09-30.json',
          backupDate: '2026-09-30',
          recoveryPath: '',
        },
      ],
    })
    render(<DataNoticeBanner />)

    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('2026-09-30')
    expect(notice).not.toHaveTextContent('The original file was kept at')
    expect(screen.queryByRole('button', { name: 'Open folder' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('counts the passwords that need to be typed again', () => {
    setStatus({
      writeError: null,
      notices: [{ kind: 'passwordsLost', count: 3 }],
    })
    render(<DataNoticeBanner />)

    expect(screen.getByRole('status')).toHaveTextContent(
      '3 saved passwords could not be decrypted on this computer and were left empty. Edit each item and type the passwords again.'
    )
    expect(screen.queryByRole('button', { name: 'Open folder' })).toBeNull()

    act(() => {
      setStatus({
        writeError: null,
        notices: [{ kind: 'passwordsLost', count: 1 }],
      })
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 saved password could not be decrypted'
    )
  })

  it('dismisses a notice by kind', async () => {
    setStatus({
      writeError: null,
      notices: [
        { kind: 'passwordsLost', count: 2 },
        {
          kind: 'restored',
          backupPath: 'b',
          backupDate: '2026-01-01',
          recoveryPath: '',
        },
      ],
    })
    render(<DataNoticeBanner />)

    expect(screen.getAllByRole('status')).toHaveLength(2)
    fireEvent.click(screen.getByTestId('data-notice-dismiss-passwordsLost'))

    await waitFor(() =>
      expect(window.quickLaunch.dismissDataNotice).toHaveBeenCalledWith(
        'passwordsLost'
      )
    )
  })

  it('stacks several startup notices in one list', () => {
    setStatus({
      writeError: null,
      notices: [
        { kind: 'passwordsLost', count: 2 },
        {
          kind: 'restored',
          backupPath: 'b',
          backupDate: '2026-01-01',
          recoveryPath: '',
        },
      ],
    })
    render(<DataNoticeBanner />)

    const stack = screen.getByTestId('data-notice-stack')
    expect(stack.children).toHaveLength(2)
    expect(stack.children[0]).toHaveAttribute('role', 'status')
    expect(stack.children[1]).toHaveAttribute('role', 'status')
  })

  it('uses the active language', () => {
    setStatus(
      { writeError: null, notices: [{ kind: 'passwordsLost', count: 2 }] },
      'zh'
    )
    render(<DataNoticeBanner />)

    expect(screen.getByRole('status')).toHaveTextContent(
      '个已保存的密码无法在这台电脑上解密'
    )
    expect(screen.getByRole('button', { name: '知道了' })).toBeInTheDocument()
  })
})

// A portable copy does not update itself. When it finds a newer version it says so here, once per
// version: what was dismissed is remembered in the storage of the window, across restarts.
describe('the notice of a newer version in a portable copy', () => {
  const DISMISSED_KEY = 'update-notice-dismissed'

  const update = (version: string): DataStatus => ({
    writeError: null,
    notices: [{ kind: 'updateAvailable', version }],
  })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.removeItem(DISMISSED_KEY)
    setStatus(emptyStatus)
  })

  afterEach(async () => {
    // Let the busy flag of the last click settle inside act().
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    cleanup()
    vi.restoreAllMocks()
    localStorage.removeItem(DISMISSED_KEY)
  })

  it('names the version and says what to do, with a button for the download page and one to dismiss', () => {
    setStatus(update('3.2.0'))
    render(<DataNoticeBanner />)

    const notice = screen.getByTestId('data-notice-update')
    expect(notice).toHaveAttribute('role', 'status')
    expect(notice).toHaveTextContent(
      'Version 3.2.0 is available. The portable copy does not update itself: download the new zip and unpack it over this folder. Your data stays.'
    )
    expect(notice).not.toHaveTextContent('{version}')
    expect(screen.getByTestId('data-notice-open-download')).toHaveTextContent(
      'Open the download page'
    )
    expect(
      screen.getByTestId('data-notice-dismiss-updateAvailable')
    ).toHaveTextContent('Dismiss')
    expect(notice).toContainElement(
      screen.getByTestId('data-notice-open-download')
    )
    expect(notice).toContainElement(
      screen.getByTestId('data-notice-dismiss-updateAvailable')
    )
  })

  it('is news, not a warning: nothing is wrong with the data', () => {
    setStatus(update('3.2.0'))
    render(<DataNoticeBanner />)

    const notice = screen.getByTestId('data-notice-update')
    expect(notice).toHaveClass('data-notice-info')
    expect(notice).not.toHaveClass('data-notice-danger')
    expect(notice).not.toHaveClass('data-notice-warning')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('opens the download page through the main process, and stays until it is dismissed', async () => {
    setStatus(update('3.2.0'))
    render(<DataNoticeBanner />)

    fireEvent.click(screen.getByTestId('data-notice-open-download'))

    await waitFor(() =>
      expect(window.quickLaunch.openReleasesPage).toHaveBeenCalledTimes(1)
    )
    // The window passes no address: the main process knows the one page it may open.
    expect(
      vi.mocked(window.quickLaunch.openReleasesPage).mock.calls[0]
    ).toEqual([])
    expect(window.quickLaunch.openUrl).not.toHaveBeenCalled()
    expect(screen.getByTestId('data-notice-update')).toBeInTheDocument()
    expect(localStorage.getItem(DISMISSED_KEY)).toBeNull()
    expect(window.quickLaunch.dismissDataNotice).not.toHaveBeenCalled()
  })

  it('shows a toast when the download page cannot be opened', async () => {
    vi.mocked(window.quickLaunch.openReleasesPage).mockResolvedValueOnce({
      ok: false,
      error: 'no browser',
    })
    setStatus(update('3.2.0'))
    render(<DataNoticeBanner />)

    fireEvent.click(screen.getByTestId('data-notice-open-download'))

    await waitFor(() =>
      expect(useAppStore.getState().toast).toMatchObject({
        message: 'no browser',
        tone: 'danger',
      })
    )
  })

  it('remembers the dismissed version, tells the main process and goes away', async () => {
    setStatus(update('3.2.0'))
    render(<DataNoticeBanner />)

    fireEvent.click(screen.getByTestId('data-notice-dismiss-updateAvailable'))

    expect(localStorage.getItem(DISMISSED_KEY)).toBe('3.2.0')
    await waitFor(() =>
      expect(window.quickLaunch.dismissDataNotice).toHaveBeenCalledWith(
        'updateAvailable'
      )
    )
    expect(window.quickLaunch.dismissDataNotice).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.queryByTestId('data-notice-update')).toBeNull()
    )
  })

  it('is gone at once, also when the main process could not take it off its list', async () => {
    vi.mocked(window.quickLaunch.dismissDataNotice).mockResolvedValueOnce({
      ok: false,
      error: 'Invalid data request',
    })
    setStatus(update('3.2.0'))
    render(<DataNoticeBanner />)

    fireEvent.click(screen.getByTestId('data-notice-dismiss-updateAvailable'))

    // The status still lists the notice; the window knows that this version was dismissed.
    expect(screen.queryByTestId('data-notice-update')).toBeNull()
    await waitFor(() =>
      expect(window.quickLaunch.dismissDataNotice).toHaveBeenCalledTimes(1)
    )
    expect(useAppStore.getState().dataStatus.notices).toHaveLength(1)
    expect(screen.queryByTestId('data-notice-update')).toBeNull()
  })

  it('does not come back for the same version after a restart, or with the next check', () => {
    localStorage.setItem(DISMISSED_KEY, '3.2.0')
    setStatus(update('3.2.0'))

    const { container } = render(<DataNoticeBanner />)

    expect(container).toBeEmptyDOMElement()

    // The check of the next day finds the same version again.
    act(() => setStatus(update('3.2.0')))
    expect(container).toBeEmptyDOMElement()
  })

  it('comes back for a later version', () => {
    localStorage.setItem(DISMISSED_KEY, '3.2.0')
    setStatus(update('3.3.0'))

    render(<DataNoticeBanner />)

    expect(screen.getByTestId('data-notice-update')).toHaveTextContent(
      'Version 3.3.0 is available.'
    )
  })

  it('comes back for a later version found while the window stays open', async () => {
    setStatus(update('3.2.0'))
    render(<DataNoticeBanner />)
    // The click, and the answer of the main process to it, inside act().
    await act(async () => {
      fireEvent.click(screen.getByTestId('data-notice-dismiss-updateAvailable'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(screen.queryByTestId('data-notice-update')).toBeNull()

    act(() => setStatus(update('3.3.0')))

    expect(screen.getByTestId('data-notice-update')).toHaveTextContent(
      'Version 3.3.0 is available.'
    )
    // Dismissing that one replaces what is remembered.
    await act(async () => {
      fireEvent.click(screen.getByTestId('data-notice-dismiss-updateAvailable'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('3.3.0')
    expect(window.quickLaunch.dismissDataNotice).toHaveBeenCalledTimes(2)
  })

  it('leaves the other notices where they are when it is not shown', () => {
    localStorage.setItem(DISMISSED_KEY, '3.2.0')
    setStatus({
      writeError: null,
      notices: [
        { kind: 'passwordsLost', count: 2 },
        { kind: 'updateAvailable', version: '3.2.0' },
      ],
    })

    render(<DataNoticeBanner />)

    expect(screen.getByTestId('data-notice-passwords-lost')).toBeInTheDocument()
    expect(screen.queryByTestId('data-notice-update')).toBeNull()
    expect(screen.getByTestId('data-notice-stack').children).toHaveLength(1)
  })

  it('stands in the list with the notices about the data', () => {
    setStatus({
      writeError: null,
      notices: [
        { kind: 'passwordsLost', count: 2 },
        { kind: 'updateAvailable', version: '3.2.0' },
      ],
    })

    render(<DataNoticeBanner />)

    expect(screen.getByTestId('data-notice-stack').children).toHaveLength(2)
    expect(screen.getByTestId('data-notice-stack')).toContainElement(
      screen.getByTestId('data-notice-update')
    )
  })

  it('is shown, and can be dismissed, when the storage of the window cannot be used', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException(
        'The quota has been exceeded.',
        'QuotaExceededError'
      )
    })
    setStatus(update('3.2.0'))

    render(<DataNoticeBanner />)
    fireEvent.click(screen.getByTestId('data-notice-dismiss-updateAvailable'))

    // Nothing is remembered: it comes back with the next start, and is gone for now.
    await waitFor(() =>
      expect(window.quickLaunch.dismissDataNotice).toHaveBeenCalledWith(
        'updateAvailable'
      )
    )
    expect(screen.queryByTestId('data-notice-update')).toBeNull()
  })

  it.each(['zh', 'en', 'ja'] as const)(
    'speaks %s: the sentence with the version in it, and both buttons',
    (lang) => {
      setStatus(update('3.2.0'), lang)
      render(<DataNoticeBanner />)
      const strings = extraStrings[lang]

      expect(screen.getByTestId('data-notice-update')).toHaveTextContent(
        strings.update_available!.replace('{version}', '3.2.0')
      )
      expect(screen.getByTestId('data-notice-open-download')).toHaveTextContent(
        strings.update_open_download!
      )
      expect(
        screen.getByTestId('data-notice-dismiss-updateAvailable')
      ).toHaveTextContent(workspaceStrings[lang].data_dismiss!)
    }
  )
})
