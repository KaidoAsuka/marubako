import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { Lang, UpdateCheckResult } from '../../../../../shared/types'
import { extraStrings } from '../../../i18n/extras'
import { updateStrings } from '../../../i18n/updates'
import { useAppStore } from '../../../store/use-app-store'
import SettingsForm from '../SettingsForm'

function openDataPage(lang: Lang = 'en'): void {
  const data = createDefaultAppData()
  data.prefs.lang = lang
  useAppStore.setState({
    data,
    loading: false,
    saving: false,
    toast: null,
    modal: { kind: 'settings' },
  })
  render(<SettingsForm />)
  fireEvent.click(screen.getByTestId('settings-tab-data'))
}

function answerWith(result: UpdateCheckResult): void {
  vi.mocked(window.quickLaunch.checkForUpdates).mockResolvedValueOnce({
    ok: true,
    data: result,
  })
}

const resultText = () => screen.getByTestId('settings-update-result')

describe('the about block of the settings (product-ux-7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows the version of the running program', async () => {
    openDataPage('en')

    expect(await screen.findByTestId('settings-version')).toHaveTextContent(
      'Version 2.5.8'
    )
    // Asked once by the about block, for the version, and once by the dialog, for the data folder
    // of its "Open data folder" button. Neither asks again when it is drawn again.
    expect(window.quickLaunch.getAppInfo).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByTestId('settings-check-updates'))
    await vi.waitFor(() =>
      expect(resultText()).toHaveTextContent('You’re up to date.')
    )
    expect(window.quickLaunch.getAppInfo).toHaveBeenCalledTimes(2)
  })

  it('leaves the version out when the main process does not tell it', async () => {
    vi.mocked(window.quickLaunch.getAppInfo).mockResolvedValueOnce({
      ok: false,
      error: 'nope',
    })
    openDataPage('en')

    await vi.waitFor(() =>
      expect(window.quickLaunch.getAppInfo).toHaveBeenCalled()
    )
    expect(screen.queryByTestId('settings-version')).toBeNull()
    expect(screen.getByTestId('settings-check-updates')).toBeEnabled()
  })

  it('says nothing about updates until asked, and does not ask by itself', () => {
    openDataPage('en')

    expect(resultText()).toHaveTextContent('')
    expect(window.quickLaunch.checkForUpdates).not.toHaveBeenCalled()
  })

  it('has a status region for the answer, so that a screen reader says it', () => {
    openDataPage('en')

    expect(resultText()).toHaveAttribute('role', 'status')
  })

  it.each([
    [{ status: 'latest', version: '2.5.8' }, 'You’re up to date.'],
    [
      { status: 'downloading', version: '2.6.0' },
      'Version 2.6.0 is available and downloading. When it is done, check again to restart and install it.',
    ],
    [
      { status: 'ready', version: '2.6.0' },
      'Version 2.6.0 is downloaded. Choose “Restart and update” to install it now; it is also installed when you quit Marubako from the tray menu (closing the window only hides it to the tray).',
    ],
    // What a portable copy finds. It installs nothing: the words say what to do by hand.
    [
      { status: 'available', version: '2.6.0' },
      'Version 2.6.0 is available. The portable copy does not update itself: download the new zip and unpack it over this folder. Your data stays.',
    ],
    [
      { status: 'error' },
      'Couldn’t check for updates. Check your connection and try again.',
    ],
    [
      { status: 'disabled' },
      'Updates can only be checked in an installed version.',
    ],
  ] as const)('says the answer %j in words', async (result, text) => {
    answerWith(result)
    openDataPage('en')

    fireEvent.click(screen.getByTestId('settings-check-updates'))

    await vi.waitFor(() => expect(resultText()).toHaveTextContent(text))
    expect(window.quickLaunch.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('offers "Restart and update" only when a version is downloaded, and runs it through the main process', async () => {
    openDataPage('en')
    expect(screen.queryByTestId('settings-install-update')).toBeNull()

    answerWith({ status: 'downloading', version: '2.6.0' })
    fireEvent.click(screen.getByTestId('settings-check-updates'))
    await vi.waitFor(() => expect(resultText()).toHaveTextContent('2.6.0'))
    expect(screen.queryByTestId('settings-install-update')).toBeNull()

    answerWith({ status: 'ready', version: '2.6.0' })
    fireEvent.click(screen.getByTestId('settings-check-updates'))
    const install = await screen.findByTestId('settings-install-update')
    expect(install).toHaveTextContent('Restart and update')

    fireEvent.click(install)
    expect(window.quickLaunch.installUpdate).toHaveBeenCalledTimes(1)
  })

  it('says why when the update could not be started', async () => {
    vi.mocked(window.quickLaunch.installUpdate).mockResolvedValueOnce({
      ok: false,
      error: 'No update has been downloaded',
    })
    openDataPage('en')
    answerWith({ status: 'ready', version: '2.6.0' })
    fireEvent.click(screen.getByTestId('settings-check-updates'))

    fireEvent.click(await screen.findByTestId('settings-install-update'))

    await vi.waitFor(() =>
      expect(useAppStore.getState().toast).toMatchObject({
        message: 'No update has been downloaded',
        tone: 'danger',
      })
    )
  })

  it('offers the download page only when a portable copy found a newer version, and opens it through the main process', async () => {
    openDataPage('en')
    expect(screen.queryByTestId('settings-open-download')).toBeNull()

    answerWith({ status: 'latest', version: '2.5.8' })
    fireEvent.click(screen.getByTestId('settings-check-updates'))
    await vi.waitFor(() =>
      expect(resultText()).toHaveTextContent('You’re up to date.')
    )
    expect(screen.queryByTestId('settings-open-download')).toBeNull()

    answerWith({ status: 'available', version: '2.6.0' })
    fireEvent.click(screen.getByTestId('settings-check-updates'))
    const download = await screen.findByTestId('settings-open-download')
    expect(download).toHaveTextContent('Open the download page')
    // Nothing was downloaded, so there is nothing to restart into.
    expect(screen.queryByTestId('settings-install-update')).toBeNull()

    fireEvent.click(download)

    expect(window.quickLaunch.openReleasesPage).toHaveBeenCalledTimes(1)
    // The window passes no address: the main process knows the one page it may open.
    expect(
      vi.mocked(window.quickLaunch.openReleasesPage).mock.calls[0]
    ).toEqual([])
    expect(window.quickLaunch.openUrl).not.toHaveBeenCalled()
    expect(window.quickLaunch.installUpdate).not.toHaveBeenCalled()
  })

  it('does not offer the download page for a version that is downloading or downloaded by itself', async () => {
    openDataPage('en')

    for (const status of ['downloading', 'ready'] as const) {
      answerWith({ status, version: '2.6.0' })
      fireEvent.click(screen.getByTestId('settings-check-updates'))
      await vi.waitFor(() => expect(resultText()).toHaveTextContent('2.6.0'))
      await vi.waitFor(() =>
        expect(screen.getByTestId('settings-check-updates')).toBeEnabled()
      )
      expect(screen.queryByTestId('settings-open-download')).toBeNull()
    }
  })

  it.each([
    [
      'is refused',
      () =>
        vi.mocked(window.quickLaunch.openReleasesPage).mockResolvedValueOnce({
          ok: false,
          error: 'no browser',
        }),
      'no browser',
    ],
    [
      'fails',
      () =>
        vi
          .mocked(window.quickLaunch.openReleasesPage)
          .mockRejectedValueOnce(new Error('channel closed')),
      'Error: channel closed',
    ],
  ])(
    'tells the user when opening the download page %s',
    async (_name, arrange, message) => {
      arrange()
      openDataPage('en')
      answerWith({ status: 'available', version: '2.6.0' })
      fireEvent.click(screen.getByTestId('settings-check-updates'))

      fireEvent.click(await screen.findByTestId('settings-open-download'))

      await vi.waitFor(() =>
        expect(useAppStore.getState().toast).toMatchObject({
          message,
          tone: 'danger',
        })
      )
    }
  )

  it.each(['zh', 'en', 'ja'] as const)(
    'speaks %s about a newer version for a portable copy: the answer and the button',
    async (lang) => {
      answerWith({ status: 'available', version: '2.6.0' })
      openDataPage(lang)
      const strings = extraStrings[lang]

      fireEvent.click(screen.getByTestId('settings-check-updates'))

      expect(
        await screen.findByTestId('settings-open-download')
      ).toHaveTextContent(strings.update_open_download ?? '')
      expect(strings.update_available).toContain('{version}')
      expect(resultText()).toHaveTextContent(
        strings.update_available?.replace('{version}', '2.6.0') ?? ''
      )
      expect(resultText()).not.toHaveTextContent('{version}')
    }
  )

  it('shows that it is checking, and cannot be started twice meanwhile', async () => {
    let answer: (value: unknown) => void = () => undefined
    vi.mocked(window.quickLaunch.checkForUpdates).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve
      }) as never
    )
    openDataPage('en')
    const button = screen.getByTestId('settings-check-updates')

    fireEvent.click(button)

    expect(button).toBeDisabled()
    expect(resultText()).toHaveTextContent('Checking for updates…')
    fireEvent.click(button)
    expect(window.quickLaunch.checkForUpdates).toHaveBeenCalledTimes(1)

    answer({ ok: true, data: { status: 'latest', version: '2.5.8' } })
    await vi.waitFor(() => expect(button).toBeEnabled())
    expect(resultText()).toHaveTextContent('You’re up to date.')
  })

  it('says it could not check when the request itself fails or is refused', async () => {
    vi.mocked(window.quickLaunch.checkForUpdates).mockResolvedValueOnce({
      ok: false,
      error: 'Invalid data request',
    })
    openDataPage('en')

    fireEvent.click(screen.getByTestId('settings-check-updates'))
    await vi.waitFor(() =>
      expect(resultText()).toHaveTextContent('Couldn’t check for updates')
    )

    vi.mocked(window.quickLaunch.checkForUpdates).mockRejectedValueOnce(
      new Error('channel closed')
    )
    fireEvent.click(screen.getByTestId('settings-check-updates'))
    await vi.waitFor(() =>
      expect(screen.getByTestId('settings-check-updates')).toBeEnabled()
    )
    expect(resultText()).toHaveTextContent('Couldn’t check for updates')
  })

  it('does not show the raw error to the user', async () => {
    vi.mocked(window.quickLaunch.checkForUpdates).mockResolvedValueOnce({
      ok: false,
      error: 'ENOTFOUND github.com',
    })
    openDataPage('en')

    fireEvent.click(screen.getByTestId('settings-check-updates'))

    await vi.waitFor(() =>
      expect(resultText()).toHaveTextContent('Couldn’t check for updates')
    )
    expect(resultText()).not.toHaveTextContent('ENOTFOUND')
  })

  it('opens the issue page through the main process when asked to report a problem', () => {
    openDataPage('en')

    const link = screen.getByTestId('settings-report-problem')
    expect(link).toHaveTextContent('Report a problem')
    fireEvent.click(link)

    expect(window.quickLaunch.openIssuesPage).toHaveBeenCalledTimes(1)
    // The window passes no address: the main process knows the one page it may open.
    expect(vi.mocked(window.quickLaunch.openIssuesPage).mock.calls[0]).toEqual(
      []
    )
    expect(window.quickLaunch.openUrl).not.toHaveBeenCalled()
  })

  it('tells the user when the page could not be opened', async () => {
    vi.mocked(window.quickLaunch.openIssuesPage).mockResolvedValueOnce({
      ok: false,
      error: 'no browser',
    })
    openDataPage('en')

    fireEvent.click(screen.getByTestId('settings-report-problem'))

    await vi.waitFor(() =>
      expect(useAppStore.getState().toast?.tone).toBe('danger')
    )
  })

  it.each(['zh', 'en', 'ja'] as const)(
    'speaks %s: version, button, answer and link',
    async (lang) => {
      answerWith({ status: 'downloading', version: '2.6.0' })
      openDataPage(lang)
      const strings = updateStrings[lang]

      expect(await screen.findByTestId('settings-version')).toHaveTextContent(
        strings.about_version?.replace('{version}', '2.5.8') ?? ''
      )
      expect(screen.getByTestId('settings-check-updates')).toHaveTextContent(
        strings.update_check ?? ''
      )
      expect(screen.getByTestId('settings-report-problem')).toHaveTextContent(
        strings.report_problem ?? ''
      )
      fireEvent.click(screen.getByTestId('settings-check-updates'))
      await vi.waitFor(() =>
        expect(resultText()).toHaveTextContent(
          strings.update_downloading?.replace('{version}', '2.6.0') ?? ''
        )
      )
    }
  )
})

describe('the update strings', () => {
  const KEYS = [
    'about_title',
    'about_version',
    'update_check',
    'update_checking',
    'update_latest',
    'update_downloading',
    'update_ready',
    'update_install',
    'update_error',
    'update_disabled',
    'report_problem',
  ]

  it.each(['zh', 'en', 'ja'] as const)('are all there for %s', (lang) => {
    for (const key of KEYS)
      expect(updateStrings[lang][key], `${lang}.${key}`).toBeTruthy()
    expect(Object.keys(updateStrings[lang]).sort()).toEqual([...KEYS].sort())
  })

  it('carry the version where a version is meant', () => {
    for (const lang of ['zh', 'en', 'ja'] as const)
      for (const key of ['about_version', 'update_downloading', 'update_ready'])
        expect(updateStrings[lang][key], `${lang}.${key}`).toContain(
          '{version}'
        )
  })
})
