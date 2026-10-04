import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { AppInfo, Lang } from '../../../../../shared/types'
import { extraStrings } from '../../../i18n/extras'
import { translations } from '../../../i18n/translations'
import { useAppStore } from '../../../store/use-app-store'
import { describeOpenFailure } from '../../../utils/open-errors'
import SettingsForm from '../SettingsForm'

/** The title of the group the data buttons stand in. */
const DATA_GROUP = translations.en.strings.data_management!
const DATA_FOLDER = 'C:\\Users\\me\\AppData\\Roaming\\marubako'

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

/** What the main process says about the program, for as long as the test runs. */
function appInfo(info: AppInfo): void {
  vi.mocked(window.quickLaunch.getAppInfo).mockResolvedValue({
    ok: true,
    data: info,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  vi.mocked(window.quickLaunch.getAppInfo).mockReset()
  vi.mocked(window.quickLaunch.getAppInfo).mockImplementation(async () => ({
    ok: true,
    data: { version: '2.5.8' },
  }))
})

describe('the lines that explain the data buttons', () => {
  const KEYS = [
    'data_help_keep',
    'data_help_export',
    'data_help_markdown',
    'data_help_import',
    'data_help_backups',
  ]

  it.each(['zh', 'en', 'ja'] as const)(
    'are five, in the order of the buttons, in %s',
    (lang) => {
      openDataPage(lang)

      const lines = [
        ...screen.getByTestId('settings-data-help').querySelectorAll('li'),
      ].map((line) => line.textContent)

      expect(lines).toEqual(KEYS.map((key) => extraStrings[lang][key]))
      expect(lines).toHaveLength(5)
      for (const line of lines) expect(line).toBeTruthy()
    }
  )

  it('stand under the buttons they explain, inside the data management group', () => {
    openDataPage('en')

    const help = screen.getByTestId('settings-data-help')
    const group = screen.getByRole('group', { name: DATA_GROUP })
    expect(group).toContainElement(help)
    expect(group).toContainElement(screen.getByTestId('settings-export'))
    expect(help.tagName).toBe('UL')
    // After the buttons, not before them.
    expect(
      screen.getByTestId('settings-export').compareDocumentPosition(help) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('say what a person has to know before the data is lost', () => {
    openDataPage('en')
    const help = screen.getByTestId('settings-data-help')

    // The data is on this PC only; the backup can be imported again and the list cannot; an
    // import replaces everything; the automatic backups are on the same disk.
    expect(help).toHaveTextContent('on this PC only')
    expect(help).toHaveTextContent('can be imported again')
    expect(help).toHaveTextContent('It cannot be imported again')
    expect(help).toHaveTextContent('replaces all current data')
    expect(help).toHaveTextContent('do not replace an export')
  })

  // What stood there until 3.1.0: one sentence, about importing only.
  it.each([
    ['zh', '导入会覆盖当前全部数据，建议先导出备份。'],
    ['en', 'Import replaces the current data. Export a backup first.'],
    [
      'ja',
      '読み込みは現在のデータを上書きします。先にバックアップを書き出してください。',
    ],
  ] as const)(
    'take the place of the one line about importing (%s)',
    (lang, formerNote) => {
      openDataPage(lang)

      expect(screen.queryByText(formerNote)).toBeNull()
    }
  )

  it('are on the data page only', () => {
    openDataPage('en')

    fireEvent.click(screen.getByTestId('settings-tab-behavior'))
    expect(screen.queryByTestId('settings-data-help')).toBeNull()
    fireEvent.click(screen.getByTestId('settings-tab-appearance'))
    expect(screen.queryByTestId('settings-data-help')).toBeNull()
  })
})

describe('the button that opens the data folder', () => {
  it('opens the folder the main process named, through the main process', async () => {
    appInfo({ version: '3.1.1', dataFolder: DATA_FOLDER, portable: false })
    openDataPage('en')

    const button = await screen.findByTestId('settings-open-data-folder')
    expect(button).toHaveTextContent('Open data folder')
    expect(window.quickLaunch.openPath).not.toHaveBeenCalled()

    fireEvent.click(button)

    expect(window.quickLaunch.openPath).toHaveBeenCalledTimes(1)
    expect(window.quickLaunch.openPath).toHaveBeenCalledWith(DATA_FOLDER)
    expect(window.quickLaunch.openApp).not.toHaveBeenCalled()
    expect(window.quickLaunch.openUrl).not.toHaveBeenCalled()
  })

  it('opens the folder beside the program for a portable copy', async () => {
    appInfo({
      version: '3.1.1',
      dataFolder: 'E:\\Marubako\\data',
      portable: true,
    })
    openDataPage('en')

    fireEvent.click(await screen.findByTestId('settings-open-data-folder'))

    expect(window.quickLaunch.openPath).toHaveBeenCalledWith(
      'E:\\Marubako\\data'
    )
  })

  it('stands with the other data buttons', async () => {
    appInfo({ version: '3.1.1', dataFolder: DATA_FOLDER })
    openDataPage('en')

    expect(screen.getByRole('group', { name: DATA_GROUP })).toContainElement(
      await screen.findByTestId('settings-open-data-folder')
    )
  })

  it.each([
    [
      'does not tell the folder',
      async () => ({ ok: true as const, data: { version: '3.1.1' } }),
    ],
    [
      'refuses to tell',
      async () => ({ ok: false as const, error: 'Invalid data request' }),
    ],
    [
      'does not answer',
      async () => {
        throw new Error('channel closed')
      },
    ],
  ])('is not there when the main process %s', async (_name, answer) => {
    vi.mocked(window.quickLaunch.getAppInfo).mockImplementation(answer)
    openDataPage('en')

    await vi.waitFor(() =>
      expect(window.quickLaunch.getAppInfo).toHaveBeenCalled()
    )
    // The about block is in: the page has been drawn with what there is.
    expect(screen.getByTestId('settings-check-updates')).toBeInTheDocument()
    expect(screen.queryByTestId('settings-open-data-folder')).toBeNull()
    // The other buttons do not depend on it.
    expect(screen.getByTestId('settings-export')).toBeEnabled()
  })

  it.each(['zh', 'en', 'ja'] as const)(
    'says in %s, in the words of the window, when the folder would not open',
    async (lang) => {
      appInfo({ version: '3.1.1', dataFolder: DATA_FOLDER })
      vi.mocked(window.quickLaunch.openPath).mockResolvedValueOnce({
        ok: false,
        error: "ENOENT: no such file or directory, access 'C:\\Users\\me'",
        code: 'path_missing',
      })
      openDataPage(lang)

      fireEvent.click(await screen.findByTestId('settings-open-data-folder'))

      await vi.waitFor(() =>
        expect(useAppStore.getState().toast?.tone).toBe('danger')
      )
      const message = useAppStore.getState().toast?.message ?? ''
      expect(message).toBe(
        describeOpenFailure('path_missing', DATA_FOLDER, lang)
      )
      // The folder by its path, and not the raw English text of the failure.
      expect(message).toContain(DATA_FOLDER)
      expect(message).not.toContain('ENOENT')
    }
  )

  it.each(['zh', 'en', 'ja'] as const)('is named in %s', async (lang) => {
    appInfo({ version: '3.1.1', dataFolder: DATA_FOLDER })
    openDataPage(lang)

    expect(
      await screen.findByTestId('settings-open-data-folder')
    ).toHaveTextContent(extraStrings[lang].open_data_folder!)
  })
})
