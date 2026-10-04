import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppData, Lang } from '../../shared/types'
import { createDefaultAppData } from '../../shared/default-data'
import { DOCK_BALL_SIZE } from '../../shared/dock-size'
import { AppError } from '../app-error'
import type * as FileModule from '../data-file'
import { InvalidBackupError } from '../data-normalize'
import type * as NormalizeModule from '../data-normalize'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  mainContents: { id: 1, send: vi.fn() },
  dockContents: { id: 2, send: vi.fn() },
  /** Which of the two windows exist right now. */
  windows: { main: true, dock: true },
  statusListener: null as null | ((status: unknown) => void),
  lang: 'en' as Lang,
  /** The answers of the system dialogs, in the order they are asked. */
  messageBoxAnswers: [] as number[],
  messageBoxes: [] as Array<Record<string, unknown>>,
  saveDialog: { canceled: false, filePath: 'C:\\out\\export.json' } as {
    canceled: boolean
    filePath?: string
  },
  openDialog: {
    canceled: false,
    filePaths: ['C:\\in\\backup.json'],
  } as { canceled: boolean; filePaths: string[] },
  summary: { passwordsOmitted: false },
  summaryError: null as Error | null,
  exportAppDataFile: vi.fn(async () => undefined),
  exportMarkdownFile: vi.fn(async () => undefined),
  /** Whether the program runs as a portable copy. */
  portable: false,
  importAppData: vi.fn(),
  loadAppData: vi.fn(),
  saveAppData: vi.fn(),
  retryDataSave: vi.fn(),
  dismissNotice: vi.fn(),
  getDataStatus: vi.fn(),
  refreshTrayMenu: vi.fn(),
  checkForUpdatesNow: vi.fn(),
  installDownloadedUpdate: vi.fn(() => true),
  flushPendingWrite: vi.fn(async () => undefined),
  applyBubblePreference: vi.fn(async () => undefined),
  applyBallSizePreference: vi.fn(async () => undefined),
  setWindowOpacity: vi.fn(async () => undefined),
  applyLaunchShortcut: vi.fn(),
  keepTabNamesVisible: vi.fn(async () => undefined),
  /** What Windows says about its own light or dark mode. */
  nativeTheme: { shouldUseDarkColors: false },
  browser: {
    getFileIcon: vi.fn(),
    openApp: vi.fn(),
    openPath: vi.fn(),
    openUrl: vi.fn(),
  },
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'userData' ? 'C:\\Users\\me\\Data\\marubako' : 'C:\\Docs',
    getLocale: () => 'en-US',
    getVersion: () => '2.5.8',
  },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: {
    showMessageBox: vi.fn(
      async (
        ...args: [Record<string, unknown>] | [unknown, Record<string, unknown>]
      ) => {
        mocks.messageBoxes.push(
          args[args.length - 1] as Record<string, unknown>
        )
        return { response: mocks.messageBoxAnswers.shift() ?? 0 }
      }
    ),
    showSaveDialog: vi.fn(async () => mocks.saveDialog),
    showOpenDialog: vi.fn(async () => mocks.openDialog),
  },
  ipcMain: {
    handle: (
      channel: string,
      handler: (...args: unknown[]) => Promise<unknown>
    ) => mocks.handlers.set(channel, handler),
    on: vi.fn(),
  },
  nativeTheme: mocks.nativeTheme,
}))
vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../auto-updater', () => ({
  checkForUpdatesNow: mocks.checkForUpdatesNow,
  installDownloadedUpdate: mocks.installDownloadedUpdate,
}))
vi.mock('../launch-settings', () => ({
  applyLaunchShortcut: mocks.applyLaunchShortcut,
  checkLaunchShortcut: vi.fn(),
  getLaunchSettings: vi.fn(),
  retryLaunchShortcut: vi.fn(),
  setOpenAtLogin: vi.fn(),
}))
vi.mock('../browser', () => mocks.browser)
vi.mock('../portable', () => ({ isPortable: () => mocks.portable }))
vi.mock('../tray', () => ({ refreshTrayMenu: mocks.refreshTrayMenu }))
vi.mock('../window-manager', () => ({
  closeWindow: vi.fn(),
  acknowledgeWindowFrame: vi.fn(),
  applyBubblePreference: mocks.applyBubblePreference,
  applyBallSizePreference: mocks.applyBallSizePreference,
  collapseWindow: vi.fn(),
  activateDock: vi.fn(),
  dismissAfterLaunch: vi.fn(),
  setPeekBlocked: vi.fn(),
  dragDock: vi.fn(),
  expandWindow: vi.fn(),
  getDockWindow: vi.fn(() =>
    mocks.windows.dock
      ? { webContents: mocks.dockContents, isDestroyed: () => false }
      : null
  ),
  getMainWindow: vi.fn(() =>
    mocks.windows.main
      ? { webContents: mocks.mainContents, isDestroyed: () => false }
      : null
  ),
  getWindowSnapshot: vi.fn(),
  hideWindow: vi.fn(),
  keepTabNamesVisible: mocks.keepTabNamesVisible,
  setWindowOpacity: mocks.setWindowOpacity,
  togglePin: vi.fn(),
}))
vi.mock('../data-store', async () => {
  const normalize =
    await vi.importActual<typeof NormalizeModule>('../data-normalize')
  const file = await vi.importActual<typeof FileModule>('../data-file')
  return {
    normalizeAppData: normalize.normalizeAppData,
    hasStoredPasswords: file.hasStoredPasswords,
    getCachedLang: () => mocks.lang,
    dismissNotice: mocks.dismissNotice,
    exportAppDataFile: mocks.exportAppDataFile,
    exportMarkdownFile: mocks.exportMarkdownFile,
    flushPendingWrite: mocks.flushPendingWrite,
    getDataStatus: mocks.getDataStatus,
    importAppData: mocks.importAppData,
    loadAppData: mocks.loadAppData,
    onDataStatusChange: (listener: (status: unknown) => void) => {
      mocks.statusListener = listener
    },
    readImportSummary: vi.fn(async () => {
      if (mocks.summaryError) throw mocks.summaryError
      return mocks.summary
    }),
    retryDataSave: mocks.retryDataSave,
    saveAppData: mocks.saveAppData,
  }
})

import { registerIpcHandlers } from '../ipc-handlers'
import { RELEASES_URL } from '../portable-update'

const mainEvent = { sender: mocks.mainContents }

function invokeFrom(
  event: { sender: unknown },
  channel: string,
  ...args: unknown[]
): Promise<any> {
  const handler = mocks.handlers.get(channel)
  if (!handler) throw new Error(`no handler for ${channel}`)
  return Promise.resolve(handler(event, ...args))
}

/** What the panel's page does. */
function invoke(channel: string, ...args: unknown[]): Promise<any> {
  return invokeFrom(mainEvent, channel, ...args)
}

/** Sample data from which the sample account has been deleted: nothing in it is a password. */
function dataWithoutPasswords(): AppData {
  const data = createDefaultAppData()
  for (const group of data.passwords) group.items = []
  return data
}

/** Data whose one password is the loose entry 'pw-1'. */
function dataWithPassword(): AppData {
  const data = dataWithoutPasswords()
  data.loose.passwords = [
    {
      id: 'pw-1',
      kind: 'password',
      name: 'Mail',
      icon: 'key',
      username: 'me@example.com',
      password: 's3cret',
      note: '',
    },
  ]
  return data
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlers.clear()
  mocks.windows = { main: true, dock: true }
  mocks.refreshTrayMenu.mockResolvedValue(undefined)
  mocks.statusListener = null
  mocks.loadAppData.mockImplementation(async () => createDefaultAppData())
  mocks.saveAppData.mockImplementation(async (data: AppData) => data)
  mocks.applyBubblePreference.mockImplementation(async () => undefined)
  mocks.applyBallSizePreference.mockImplementation(async () => undefined)
  mocks.setWindowOpacity.mockImplementation(async () => undefined)
  mocks.exportMarkdownFile.mockImplementation(async () => undefined)
  mocks.portable = false
  mocks.applyLaunchShortcut.mockImplementation(() => undefined)
  mocks.keepTabNamesVisible.mockImplementation(async () => undefined)
  mocks.nativeTheme.shouldUseDarkColors = false
  mocks.lang = 'en'
  mocks.messageBoxAnswers = []
  mocks.messageBoxes = []
  mocks.saveDialog = { canceled: false, filePath: 'C:\\out\\export.json' }
  mocks.openDialog = { canceled: false, filePaths: ['C:\\in\\backup.json'] }
  mocks.summary = { passwordsOmitted: false }
  mocks.summaryError = null
  mocks.importAppData.mockResolvedValue(createDefaultAppData())
  registerIpcHandlers()
})

describe('exporting data', () => {
  it('asks before writing a file that would hold passwords, and leaves them out by default', async () => {
    mocks.messageBoxAnswers = [0]

    const result = await invoke('data-export', dataWithPassword())

    expect(mocks.messageBoxes).toHaveLength(1)
    expect(mocks.messageBoxes[0]).toMatchObject({
      buttons: ['Export without passwords', 'Export with passwords', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
    })
    expect(String(mocks.messageBoxes[0]?.message)).toContain('not encrypted')
    expect(String(mocks.messageBoxes[0]?.detail)).toContain('plain text')
    expect(String(mocks.messageBoxes[0]?.detail)).toContain('another computer')
    expect(mocks.exportAppDataFile).toHaveBeenCalledWith(
      expect.anything(),
      'C:\\out\\export.json',
      { includePasswords: false }
    )
    expect(result).toMatchObject({
      ok: true,
      data: { canceled: false, passwordsIncluded: false },
    })
  })

  it('writes the passwords when the user chooses to', async () => {
    mocks.messageBoxAnswers = [1]

    const result = await invoke('data-export', dataWithPassword())

    expect(mocks.exportAppDataFile).toHaveBeenCalledWith(
      expect.anything(),
      'C:\\out\\export.json',
      { includePasswords: true }
    )
    expect(result).toMatchObject({
      ok: true,
      data: { canceled: false, passwordsIncluded: true },
    })
  })

  it('exports nothing, and does not even show the save dialog, after Cancel', async () => {
    mocks.messageBoxAnswers = [2]

    const result = await invoke('data-export', dataWithPassword())

    expect(result).toEqual({ ok: true, data: { canceled: true } })
    expect(mocks.exportAppDataFile).not.toHaveBeenCalled()
    const { dialog } = await import('electron')
    expect(dialog.showSaveDialog).not.toHaveBeenCalled()
  })

  it('treats Escape (the cancel answer) as Cancel', async () => {
    // Windows reports cancelId when the box is closed with Escape or the close button.
    mocks.messageBoxAnswers = [2]
    expect(await invoke('data-export', dataWithPassword())).toMatchObject({
      data: { canceled: true },
    })
  })

  it('does not ask when there is no password to protect', async () => {
    const result = await invoke('data-export', dataWithoutPasswords())

    expect(mocks.messageBoxes).toHaveLength(0)
    expect(mocks.exportAppDataFile).toHaveBeenCalledWith(
      expect.anything(),
      'C:\\out\\export.json',
      { includePasswords: true }
    )
    expect(result).toMatchObject({ ok: true, data: { canceled: false } })
  })

  it('does not ask about a password that is only an empty field', async () => {
    const data = dataWithPassword()
    data.loose.passwords[0]!.password = ''

    await invoke('data-export', data)

    expect(mocks.messageBoxes).toHaveLength(0)
  })

  it('asks about the sample account of a new installation as about any password', async () => {
    mocks.messageBoxAnswers = [0]

    const result = await invoke('data-export', createDefaultAppData())

    expect(mocks.messageBoxes).toHaveLength(1)
    expect(mocks.exportAppDataFile).toHaveBeenCalledWith(
      expect.anything(),
      'C:\\out\\export.json',
      { includePasswords: false }
    )
    expect(result).toMatchObject({
      ok: true,
      data: { canceled: false, passwordsIncluded: false },
    })
  })

  it('asks in the saved language', async () => {
    for (const [lang, without] of [
      ['zh', '不含密码导出'],
      ['ja', 'パスワードなしで書き出す'],
    ] as const) {
      mocks.lang = lang
      mocks.messageBoxAnswers = [0]
      mocks.messageBoxes = []

      await invoke('data-export', dataWithPassword())

      expect((mocks.messageBoxes[0]?.buttons as string[])[0], lang).toBe(
        without
      )
    }
  })

  it('keeps the file untouched when the save dialog is canceled', async () => {
    mocks.messageBoxAnswers = [1]
    mocks.saveDialog = { canceled: true }

    expect(await invoke('data-export', dataWithPassword())).toEqual({
      ok: true,
      data: { canceled: true },
    })
    expect(mocks.exportAppDataFile).not.toHaveBeenCalled()
  })
})

describe('importing data', () => {
  it('refuses a file that is not a data file before asking anything', async () => {
    mocks.summaryError = new InvalidBackupError()

    const result = await invoke('data-import')

    expect(result).toMatchObject({ ok: false })
    expect(String((result as { error: string }).error)).toContain(
      'not a Marubako data file'
    )
    expect(mocks.messageBoxes).toHaveLength(0)
    expect(mocks.importAppData).not.toHaveBeenCalled()
  })

  it('confirms in a main-process dialog that names the file, with Cancel as the default', async () => {
    mocks.messageBoxAnswers = [0]

    const result = await invoke('data-import')

    expect(mocks.messageBoxes).toHaveLength(1)
    const box = mocks.messageBoxes[0]!
    expect(box.buttons).toEqual(['Import', 'Cancel'])
    expect(box.defaultId).toBe(1)
    expect(box.cancelId).toBe(1)
    expect(String(box.message)).toContain('replaces all current data')
    expect(String(box.detail)).toContain('backup.json')
    expect(String(box.detail)).not.toContain('no passwords')
    expect(mocks.importAppData).toHaveBeenCalledWith('C:\\in\\backup.json')
    expect(result).toMatchObject({ ok: true, data: { canceled: false } })
  })

  it('says so when the file holds no passwords', async () => {
    mocks.summary = { passwordsOmitted: true }
    mocks.messageBoxAnswers = [0]

    await invoke('data-import')

    expect(String(mocks.messageBoxes[0]?.detail)).toContain(
      'contains no passwords'
    )
    expect(String(mocks.messageBoxes[0]?.detail)).toContain('empty password')
  })

  it('imports nothing when the user cancels', async () => {
    mocks.messageBoxAnswers = [1]

    expect(await invoke('data-import')).toEqual({
      ok: true,
      data: { canceled: true },
    })
    expect(mocks.importAppData).not.toHaveBeenCalled()
  })

  it('asks nothing when the file picker is canceled', async () => {
    mocks.openDialog = { canceled: true, filePaths: [] }

    expect(await invoke('data-import')).toEqual({
      ok: true,
      data: { canceled: true },
    })
    expect(mocks.messageBoxes).toHaveLength(0)
  })

  it.each([
    ['zh', '导入会覆盖当前全部数据', '不含密码'],
    [
      'ja',
      '読み込むと現在のデータをすべて置き換えます',
      'パスワードが含まれていません',
    ],
  ] as const)(
    'asks in the saved language (%s)',
    async (lang, message, note) => {
      mocks.lang = lang
      mocks.summary = { passwordsOmitted: true }
      mocks.messageBoxAnswers = [1]

      await invoke('data-import')

      expect(String(mocks.messageBoxes[0]?.message)).toContain(message)
      expect(String(mocks.messageBoxes[0]?.detail)).toContain(note)
    }
  )
})

describe('who may reach the data (data-security-8)', () => {
  const dockEvent = { sender: mocks.dockContents }
  const strangerEvent = { sender: { id: 99 } }

  /** Every channel that reads, changes, exports or imports the data, or tells about its files. */
  const dataChannels: Array<[string, unknown[]]> = [
    ['data-load', []],
    ['data-save', [dataWithPassword()]],
    ['data-export', [dataWithPassword()]],
    ['data-export', [dataWithPassword(), 'markdown']],
    ['data-import', []],
    ['data-get-status', []],
    ['data-dismiss-notice', ['reset']],
    ['data-retry-save', []],
  ]

  beforeEach(() => {
    mocks.loadAppData.mockImplementation(async () => dataWithPassword())
  })

  it.each(dataChannels)(
    '%s answers the ball with a refusal and does nothing',
    async (channel, args) => {
      const result = await invokeFrom(dockEvent, channel, ...args)

      expect(result.ok).toBe(false)
      expect(JSON.stringify(result)).not.toContain('s3cret')
      expect(mocks.loadAppData).not.toHaveBeenCalled()
      expect(mocks.saveAppData).not.toHaveBeenCalled()
      expect(mocks.exportAppDataFile).not.toHaveBeenCalled()
      expect(mocks.exportMarkdownFile).not.toHaveBeenCalled()
      expect(mocks.importAppData).not.toHaveBeenCalled()
      expect(mocks.retryDataSave).not.toHaveBeenCalled()
      expect(mocks.dismissNotice).not.toHaveBeenCalled()
      expect(mocks.getDataStatus).not.toHaveBeenCalled()
      expect(mocks.messageBoxes).toHaveLength(0)
      // Nothing that a save does to the windows happens either.
      expect(mocks.applyBubblePreference).not.toHaveBeenCalled()
      expect(mocks.applyBallSizePreference).not.toHaveBeenCalled()
      expect(mocks.applyLaunchShortcut).not.toHaveBeenCalled()
      expect(mocks.keepTabNamesVisible).not.toHaveBeenCalled()
    }
  )

  it.each(dataChannels)(
    '%s refuses any other page as well',
    async (channel, args) => {
      expect((await invokeFrom(strangerEvent, channel, ...args)).ok).toBe(false)
    }
  )

  it.each(dataChannels)(
    '%s refuses everybody while the panel does not exist',
    async (channel, args) => {
      mocks.windows.main = false

      expect((await invokeFrom(mainEvent, channel, ...args)).ok).toBe(false)
      expect((await invokeFrom(dockEvent, channel, ...args)).ok).toBe(false)
    }
  )

  it('still serves the panel: it loads, saves and exports its data', async () => {
    mocks.getDataStatus.mockReturnValue({ writeError: null, notices: [] })
    mocks.messageBoxAnswers = [1]

    const loaded = await invoke('data-load')
    expect(loaded.ok).toBe(true)
    expect(loaded.data.loose.passwords[0].password).toBe('s3cret')
    expect((await invoke('data-save', dataWithPassword())).ok).toBe(true)
    expect(mocks.saveAppData).toHaveBeenCalledTimes(1)
    expect((await invoke('data-get-status')).ok).toBe(true)
    expect(
      (await invoke('data-export', dataWithPassword())).data.canceled
    ).toBe(false)
  })

  it('tells the ball how to look, and nothing else', async () => {
    const data = dataWithPassword()
    data.prefs.lang = 'ja'
    data.prefs.theme = 'dark'
    data.prefs.ballSize = 48
    mocks.loadAppData.mockImplementation(async () => data)

    const result = await invokeFrom(dockEvent, 'dock-get-appearance')

    // The language, the theme and how large the ball is drawn: three values, no data.
    expect(result).toEqual({
      ok: true,
      data: { lang: 'ja', theme: 'dark', ballSize: 48 },
    })
    expect(JSON.stringify(result)).not.toContain('s3cret')
  })

  it.each([
    ['a size past the end of the setting', 500, 64],
    ['a size below its start', 3, 24],
    ['a size between two steps', 37, 38],
    ['no size at all (data of an earlier version)', undefined, DOCK_BALL_SIZE],
  ])(
    'tells the ball a size that can be drawn for %s',
    async (_name, saved, ballSize) => {
      const data = dataWithPassword()
      data.prefs.ballSize = saved as number
      mocks.loadAppData.mockImplementation(async () => data)

      const result = await invokeFrom(dockEvent, 'dock-get-appearance')

      expect(result.data.ballSize).toBe(ballSize)
    }
  )

  it.each([
    ['system', true, 'dark'],
    ['system', false, 'light'],
    // A theme the user chose is not for Windows to change.
    ['light', true, 'light'],
    ['dark', false, 'dark'],
  ] as const)(
    'tells the ball the theme that is drawn: %s with Windows dark %s is %s',
    async (setting, systemDark, theme) => {
      const data = dataWithPassword()
      data.prefs.theme = setting
      mocks.loadAppData.mockImplementation(async () => data)
      mocks.nativeTheme.shouldUseDarkColors = systemDark

      const result = await invokeFrom(dockEvent, 'dock-get-appearance')

      expect(result).toEqual({
        ok: true,
        data: { lang: 'zh', theme, ballSize: DOCK_BALL_SIZE },
      })
    }
  )

  it('keeps the ball channel for the ball: the panel and strangers are refused', async () => {
    expect((await invoke('dock-get-appearance')).ok).toBe(false)
    expect((await invokeFrom(strangerEvent, 'dock-get-appearance')).ok).toBe(
      false
    )
    mocks.windows.dock = false
    expect(
      (await invokeFrom({ sender: mocks.dockContents }, 'dock-get-appearance'))
        .ok
    ).toBe(false)
  })

  it('pushes the data status to the panel only', () => {
    const status = { writeError: 'disk full', notices: [] }

    mocks.statusListener?.(status)

    expect(mocks.mainContents.send).toHaveBeenCalledWith(
      'data-status-changed',
      status
    )
    expect(mocks.dockContents.send).not.toHaveBeenCalled()
  })
})

describe('how a failure reaches the window (i18n-copy-2)', () => {
  it('carries the code and keeps the technical text for the log', async () => {
    mocks.browser.openPath.mockRejectedValueOnce(
      new AppError(
        'path_missing',
        "ENOENT: no such file or directory, access 'D:\\Old'"
      )
    )

    const result = await invoke('system-open-path', 'D:\\Old')

    expect(result).toEqual({
      ok: false,
      error: "ENOENT: no such file or directory, access 'D:\\Old'",
      code: 'path_missing',
    })
  })

  it.each([
    ['system-open-path', 'openPath', ['C:\\x']],
    ['system-open-app', 'openApp', ['C:\\x.exe']],
    ['system-open-url', 'openUrl', ['nope', 'default']],
  ] as const)('%s passes the code on', async (channel, method, args) => {
    mocks.browser[method].mockRejectedValueOnce(
      new AppError('no_permission', 'denied')
    )

    expect(await invoke(channel, ...args)).toMatchObject({
      ok: false,
      code: 'no_permission',
    })
  })

  it('does not invent a code for a failure nobody classified', async () => {
    mocks.browser.openPath.mockRejectedValueOnce(
      Object.assign(new Error('ENOENT: weird'), { code: 'ENOENT' })
    )

    const result = await invoke('system-open-path', 'C:\\x')

    expect(result).toEqual({ ok: false, error: 'ENOENT: weird' })
  })

  it('does not tell an export that failed to write "edit the entry"', async () => {
    mocks.messageBoxAnswers = [1]
    mocks.exportAppDataFile.mockRejectedValueOnce(
      Object.assign(new Error('ENOENT: no such directory'), { code: 'ENOENT' })
    )

    const result = await invoke('data-export', dataWithPassword())

    expect(result.ok).toBe(false)
    expect(result).not.toHaveProperty('code')
  })

  it('answers a success as before', async () => {
    mocks.browser.openPath.mockResolvedValueOnce('')

    expect(await invoke('system-open-path', 'C:\\Work')).toEqual({
      ok: true,
      data: '',
    })
  })
})

describe('a change of language reaches the tray menu (i18n-copy-6)', () => {
  function withLang(lang: Lang): AppData {
    const data = createDefaultAppData()
    data.prefs.lang = lang
    return data
  }

  it('rebuilds the tray menu once the saved language differs from the one before', async () => {
    mocks.loadAppData.mockImplementation(async () => withLang('zh'))

    await invoke('data-save', withLang('en'))

    expect(mocks.refreshTrayMenu).toHaveBeenCalledTimes(1)
  })

  it('leaves the tray menu alone when only something else was saved', async () => {
    mocks.loadAppData.mockImplementation(async () => withLang('zh'))
    const data = withLang('zh')
    data.prefs.theme = 'dark'

    await invoke('data-save', data)

    expect(mocks.refreshTrayMenu).not.toHaveBeenCalled()
  })

  it('does not fail the save when the menu cannot be rebuilt', async () => {
    mocks.loadAppData.mockImplementation(async () => withLang('zh'))
    mocks.refreshTrayMenu.mockRejectedValueOnce(new Error('tray is gone'))

    const result = await invoke('data-save', withLang('ja'))

    expect(result.ok).toBe(true)
    expect(mocks.refreshTrayMenu).toHaveBeenCalledTimes(1)
  })

  it('rebuilds it after an import that brings another language', async () => {
    mocks.loadAppData.mockImplementation(async () => withLang('zh'))
    mocks.importAppData.mockResolvedValueOnce(withLang('en'))
    mocks.messageBoxAnswers = [0]

    await invoke('data-import')

    expect(mocks.refreshTrayMenu).toHaveBeenCalledTimes(1)
  })

  it('leaves it alone after an import in the same language, or a canceled one', async () => {
    mocks.loadAppData.mockImplementation(async () => withLang('zh'))
    mocks.importAppData.mockResolvedValueOnce(withLang('zh'))
    mocks.messageBoxAnswers = [0, 1]

    await invoke('data-import')
    await invoke('data-import')

    expect(mocks.refreshTrayMenu).not.toHaveBeenCalled()
  })
})

describe('a save keeps the names on the tabs', () => {
  function withPrefs(prefs: Partial<AppData['prefs']>): AppData {
    const data = createDefaultAppData()
    data.prefs = { ...data.prefs, ...prefs }
    return data
  }

  it('hands the preferences before and after the save to the window manager', async () => {
    const before = withPrefs({ lang: 'zh', zoom: 1 })
    const after = withPrefs({ lang: 'en', zoom: 1.2, hiddenTabs: ['notes'] })
    mocks.loadAppData.mockImplementation(async () => before)

    const result = await invoke('data-save', after)

    expect(result.ok).toBe(true)
    expect(mocks.keepTabNamesVisible).toHaveBeenCalledTimes(1)
    expect(mocks.keepTabNamesVisible).toHaveBeenCalledWith(
      before.prefs,
      after.prefs
    )
  })

  it('uses what was really saved, not what the page sent', async () => {
    const before = withPrefs({ lang: 'zh' })
    const stored = withPrefs({ lang: 'ja' })
    mocks.loadAppData.mockImplementation(async () => before)
    mocks.saveAppData.mockImplementation(async () => stored)

    await invoke('data-save', withPrefs({ lang: 'en' }))

    expect(mocks.keepTabNamesVisible).toHaveBeenCalledWith(
      before.prefs,
      stored.prefs
    )
  })

  /** Notes every step that follows a save or an import, in the order it happens. */
  function recordOrder(): string[] {
    const order: string[] = []
    mocks.saveAppData.mockImplementation(async (data: AppData) => {
      order.push('save')
      return data
    })
    mocks.setWindowOpacity.mockImplementation(async () => {
      order.push('opacity')
    })
    mocks.applyBubblePreference.mockImplementation(async () => {
      order.push('bubble')
    })
    mocks.applyBallSizePreference.mockImplementation(async () => {
      order.push('ball size')
    })
    mocks.applyLaunchShortcut.mockImplementation(() => {
      order.push('shortcut')
    })
    mocks.keepTabNamesVisible.mockImplementation(async () => {
      order.push('tab names')
    })
    return order
  }

  it('widens the panel after the ball, its size and the shortcut have been dealt with', async () => {
    const order = recordOrder()

    await invoke('data-save', withPrefs({ lang: 'en' }))

    // The size comes after the switch: a ball that was just turned off is not laid out again.
    expect(order).toEqual([
      'save',
      'bubble',
      'ball size',
      'shortcut',
      'tab names',
    ])
  })

  it('goes through the same steps in the same order after an import', async () => {
    const order = recordOrder()
    mocks.messageBoxAnswers = [0]

    await invoke('data-import')

    expect(order).toEqual([
      'opacity',
      'bubble',
      'ball size',
      'shortcut',
      'tab names',
    ])
  })

  it('does not widen anything for a save that failed', async () => {
    mocks.saveAppData.mockRejectedValueOnce(new Error('disk full'))

    const result = await invoke('data-save', withPrefs({ lang: 'en' }))

    expect(result.ok).toBe(false)
    expect(mocks.keepTabNamesVisible).not.toHaveBeenCalled()
  })

  it('still reports the save as done when the panel could not be widened', async () => {
    mocks.keepTabNamesVisible.mockRejectedValueOnce(new Error('no window'))

    const result = await invoke('data-save', withPrefs({ lang: 'en' }))

    expect(result.ok).toBe(true)
  })

  it('does the same after an import, with the preferences of the imported file', async () => {
    const before = withPrefs({ lang: 'zh' })
    const imported = withPrefs({ lang: 'en', zoom: 1.2 })
    mocks.loadAppData.mockImplementation(async () => before)
    mocks.importAppData.mockImplementation(async () => imported)
    mocks.messageBoxAnswers = [0]

    const result = await invoke('data-import')

    expect(result).toMatchObject({ ok: true, data: { canceled: false } })
    expect(mocks.keepTabNamesVisible).toHaveBeenCalledTimes(1)
    expect(mocks.keepTabNamesVisible).toHaveBeenCalledWith(
      before.prefs,
      imported.prefs
    )
  })
})

describe('a save applies the size of the ball at once', () => {
  function withBallSize(ballSize: number): AppData {
    const data = createDefaultAppData()
    data.prefs.ballSize = ballSize
    return data
  }

  it('hands the saved size to the window manager', async () => {
    const result = await invoke('data-save', withBallSize(48))

    expect(result.ok).toBe(true)
    expect(mocks.applyBallSizePreference).toHaveBeenCalledTimes(1)
    expect(mocks.applyBallSizePreference).toHaveBeenCalledWith(48)
  })

  it('uses what was really saved, not what the page sent', async () => {
    mocks.saveAppData.mockImplementation(async () => withBallSize(64))

    await invoke('data-save', withBallSize(9000))

    expect(mocks.applyBallSizePreference).toHaveBeenCalledWith(64)
  })

  it('does not touch the ball for a save that failed', async () => {
    mocks.saveAppData.mockRejectedValueOnce(new Error('disk full'))

    const result = await invoke('data-save', withBallSize(48))

    expect(result.ok).toBe(false)
    expect(mocks.applyBallSizePreference).not.toHaveBeenCalled()
  })

  it('does the same after an import, with the size of the imported file', async () => {
    mocks.importAppData.mockImplementation(async () => withBallSize(56))
    mocks.messageBoxAnswers = [0]

    const result = await invoke('data-import')

    expect(result).toMatchObject({ ok: true, data: { canceled: false } })
    expect(mocks.applyBallSizePreference).toHaveBeenCalledTimes(1)
    expect(mocks.applyBallSizePreference).toHaveBeenCalledWith(56)
  })

  it('leaves the ball alone when the import was canceled', async () => {
    mocks.messageBoxAnswers = [1]

    await invoke('data-import')

    expect(mocks.applyBallSizePreference).not.toHaveBeenCalled()
  })
})

describe('exporting the list for reading (Markdown)', () => {
  async function saveDialogOptions() {
    const { dialog } = await import('electron')
    const calls = vi.mocked(dialog.showSaveDialog).mock.calls
    return calls[calls.length - 1]?.at(-1) as unknown as {
      defaultPath?: string
      filters?: Array<{ name: string; extensions: string[] }>
    }
  }

  beforeEach(() => {
    mocks.saveDialog = { canceled: false, filePath: 'C:\\out\\list.md' }
  })

  it('asks about the passwords in the words for a list, and leaves them out by default', async () => {
    mocks.messageBoxAnswers = [0]

    const result = await invoke('data-export', dataWithPassword(), 'markdown')

    expect(mocks.messageBoxes).toHaveLength(1)
    expect(mocks.messageBoxes[0]).toMatchObject({
      buttons: ['Export without passwords', 'Export with passwords', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
    })
    expect(String(mocks.messageBoxes[0]?.detail)).toContain(
      'The list is plain text'
    )
    // A list cannot carry the passwords to another PC: the question does not say that it can.
    expect(String(mocks.messageBoxes[0]?.detail)).not.toContain(
      'another computer'
    )
    expect(String(mocks.messageBoxes[0]?.detail)).not.toContain('JSON')
    expect(result).toMatchObject({
      ok: true,
      data: {
        canceled: false,
        filePath: 'C:\\out\\list.md',
        passwordsIncluded: false,
      },
    })
  })

  it('writes the list, not the backup', async () => {
    mocks.messageBoxAnswers = [0]
    const data = dataWithPassword()

    await invoke('data-export', data, 'markdown')

    expect(mocks.exportMarkdownFile).toHaveBeenCalledTimes(1)
    const [exported, filePath, options] = mocks.exportMarkdownFile.mock
      .calls[0] as unknown as [AppData, string, Record<string, unknown>]
    expect(exported.loose.passwords[0]?.name).toBe('Mail')
    expect(filePath).toBe('C:\\out\\list.md')
    // In the language of the interface, with the version that wrote it and the moment it did.
    expect(options).toEqual({
      lang: 'en',
      includePasswords: false,
      exportedAt: expect.any(Date),
      version: '2.5.8',
    })
    expect(mocks.exportAppDataFile).not.toHaveBeenCalled()
  })

  it("offers a file named marubako-list with today's date, ending in .md", async () => {
    await invoke('data-export', dataWithoutPasswords(), 'markdown')

    const options = await saveDialogOptions()
    expect(options.defaultPath).toMatch(
      /^C:\\Docs[\\/]marubako-list-\d{4}-\d{2}-\d{2}\.md$/
    )
    expect(options.filters).toEqual([
      { name: 'Markdown Files', extensions: ['md'] },
    ])
  })

  it('writes the passwords into the list when the user chooses to', async () => {
    mocks.messageBoxAnswers = [1]

    const result = await invoke('data-export', dataWithPassword(), 'markdown')

    expect(mocks.exportMarkdownFile).toHaveBeenCalledWith(
      expect.anything(),
      'C:\\out\\list.md',
      expect.objectContaining({ includePasswords: true })
    )
    expect(result).toMatchObject({ data: { passwordsIncluded: true } })
  })

  it('writes nothing, and does not even show the save dialog, after Cancel', async () => {
    mocks.messageBoxAnswers = [2]

    const result = await invoke('data-export', dataWithPassword(), 'markdown')

    expect(result).toEqual({ ok: true, data: { canceled: true } })
    expect(mocks.exportMarkdownFile).not.toHaveBeenCalled()
    const { dialog } = await import('electron')
    expect(dialog.showSaveDialog).not.toHaveBeenCalled()
  })

  it('does not ask when there is no password to protect', async () => {
    await invoke('data-export', dataWithoutPasswords(), 'markdown')

    expect(mocks.messageBoxes).toHaveLength(0)
    expect(mocks.exportMarkdownFile).toHaveBeenCalledTimes(1)
  })

  it('keeps the file untouched when the save dialog is canceled', async () => {
    mocks.saveDialog = { canceled: true }

    expect(
      await invoke('data-export', dataWithoutPasswords(), 'markdown')
    ).toEqual({ ok: true, data: { canceled: true } })
    expect(mocks.exportMarkdownFile).not.toHaveBeenCalled()
  })

  it.each([
    ['zh', 'Markdown 文件', '导出的清单是明文'],
    ['ja', 'Markdown ファイル', '一覧は平文です'],
  ] as const)(
    'asks, names the file type and writes the list in %s',
    async (lang, filter, detail) => {
      mocks.lang = lang
      mocks.messageBoxAnswers = [0]

      await invoke('data-export', dataWithPassword(), 'markdown')

      expect(String(mocks.messageBoxes[0]?.detail)).toContain(detail)
      expect((await saveDialogOptions()).filters?.[0]?.name).toBe(filter)
      expect(mocks.exportMarkdownFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ lang })
      )
    }
  )

  it('reports a list that could not be written', async () => {
    mocks.exportMarkdownFile.mockRejectedValueOnce(
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    )

    const result = await invoke(
      'data-export',
      dataWithoutPasswords(),
      'markdown'
    )

    expect(result).toEqual({ ok: false, error: 'EACCES: permission denied' })
  })

  it.each([
    ['no format', undefined],
    ['"json"', 'json'],
    ['a format nobody knows', 'yaml'],
    ['another spelling', 'Markdown'],
    ['a number', 1],
    ['an object', { format: 'markdown' }],
  ])('writes the backup for %s', async (_name, format) => {
    mocks.messageBoxAnswers = [0]
    mocks.saveDialog = { canceled: false, filePath: 'C:\\out\\export.json' }

    await invoke('data-export', dataWithPassword(), format)

    expect(mocks.exportMarkdownFile).not.toHaveBeenCalled()
    expect(mocks.exportAppDataFile).toHaveBeenCalledWith(
      expect.anything(),
      'C:\\out\\export.json',
      { includePasswords: false }
    )
    // The question and the file are those of the backup.
    expect(String(mocks.messageBoxes[0]?.detail)).toContain('another computer')
    const options = await saveDialogOptions()
    expect(options.defaultPath).toMatch(
      /marubako-export-\d{4}-\d{2}-\d{2}\.json$/
    )
    expect(options.filters).toEqual([
      { name: 'JSON Files', extensions: ['json'] },
    ])
  })
})

describe('dismissing a notice', () => {
  it.each(['reset', 'restored', 'passwordsLost', 'updateAvailable'])(
    'dismisses %s',
    async (kind) => {
      const status = { writeError: null, notices: [] }
      mocks.dismissNotice.mockReturnValueOnce(status)

      expect(await invoke('data-dismiss-notice', kind)).toEqual({
        ok: true,
        data: status,
      })
      expect(mocks.dismissNotice).toHaveBeenCalledWith(kind)
    }
  )

  it.each([
    ['a kind nobody knows', 'updateReady'],
    ['nothing', undefined],
  ])('refuses %s', async (_name, kind) => {
    expect((await invoke('data-dismiss-notice', kind)).ok).toBe(false)
    expect(mocks.dismissNotice).not.toHaveBeenCalled()
  })
})

describe('the dialogs of the main process speak the saved language (i18n-copy-6)', () => {
  async function lastOptions(kind: 'showOpenDialog' | 'showSaveDialog') {
    const { dialog } = await import('electron')
    const calls = vi.mocked(dialog[kind]).mock.calls
    return calls[calls.length - 1]?.at(-1) as unknown as {
      title?: string
      buttonLabel?: string
      filters?: Array<{ name: string; extensions: string[] }>
    }
  }

  it.each([
    ['zh', '选择文件夹', '选择程序或快捷方式', '程序与快捷方式', '所有文件'],
    [
      'en',
      'Choose a folder',
      'Choose a program or shortcut',
      'Programs and shortcuts',
      'All Files',
    ],
    [
      'ja',
      'フォルダーを選択',
      'プログラムまたはショートカットを選択',
      'プログラムとショートカット',
      'すべてのファイル',
    ],
  ] as const)(
    'titles and filters the path pickers in %s',
    async (lang, folderTitle, appTitle, appFilter, allFiles) => {
      mocks.lang = lang

      await invoke('system-select-path', 'folder')
      expect((await lastOptions('showOpenDialog')).title).toBe(folderTitle)

      await invoke('system-select-path', 'app')
      const app = await lastOptions('showOpenDialog')
      expect(app.title).toBe(appTitle)
      expect(app.filters?.map((filter) => filter.name)).toEqual([
        appFilter,
        allFiles,
      ])
      expect(app.filters?.[0]?.extensions).toEqual(['exe', 'lnk', 'bat', 'cmd'])
    }
  )

  it.each([
    ['zh', '导出 Marubako 数据', '导出', 'JSON 文件'],
    ['en', 'Export Marubako Data', 'Export', 'JSON Files'],
    ['ja', 'Marubako のデータを書き出す', '書き出す', 'JSON ファイル'],
  ] as const)(
    'titles the export dialog in %s',
    async (lang, title, button, filter) => {
      mocks.lang = lang

      await invoke('data-export', createDefaultAppData())

      const options = await lastOptions('showSaveDialog')
      expect(options.title).toBe(title)
      expect(options.buttonLabel).toBe(button)
      expect(options.filters?.[0]?.name).toBe(filter)
      expect(options.filters?.[0]?.extensions).toEqual(['json'])
    }
  )

  it.each([
    ['zh', '导入 Marubako 数据', '导入', ['JSON 文件', '所有文件']],
    ['en', 'Import Marubako Data', 'Import', ['JSON Files', 'All Files']],
    [
      'ja',
      'Marubako のデータを読み込む',
      '読み込む',
      ['JSON ファイル', 'すべてのファイル'],
    ],
  ] as const)(
    'titles the import dialog in %s',
    async (lang, title, button, filters) => {
      mocks.lang = lang
      mocks.messageBoxAnswers = [1]

      await invoke('data-import')

      const options = await lastOptions('showOpenDialog')
      expect(options.title).toBe(title)
      expect(options.buttonLabel).toBe(button)
      expect(options.filters?.map((filter) => filter.name)).toEqual(filters)
    }
  )

  it('follows a change of language between two dialogs', async () => {
    mocks.lang = 'zh'
    await invoke('system-select-path', 'folder')
    expect((await lastOptions('showOpenDialog')).title).toBe('选择文件夹')

    mocks.lang = 'en'
    await invoke('system-select-path', 'folder')
    expect((await lastOptions('showOpenDialog')).title).toBe('Choose a folder')
  })
})

describe('the version, the update check, the issue page and the download page', () => {
  const dockEvent = { sender: mocks.dockContents }
  const issuesUrl = /^https:\/\/github\.com\/[A-Za-z0-9_-]+\/marubako\/issues$/

  it('tells the panel the version of the running program and the folder its data is in', async () => {
    expect(await invoke('app-get-info')).toEqual({
      ok: true,
      data: {
        version: '2.5.8',
        dataFolder: 'C:\\Users\\me\\Data\\marubako',
        portable: false,
      },
    })
  })

  it('tells the panel when the program is a portable copy', async () => {
    mocks.portable = true

    expect((await invoke('app-get-info')).data.portable).toBe(true)
  })

  it('passes the answer of the update check on, whatever it is', async () => {
    for (const answer of [
      { status: 'disabled' },
      { status: 'latest', version: '2.5.8' },
      { status: 'downloading', version: '2.6.0' },
      { status: 'ready', version: '2.6.0' },
      // What a portable copy finds: a version to download by hand.
      { status: 'available', version: '2.6.0' },
      { status: 'error' },
    ]) {
      mocks.checkForUpdatesNow.mockResolvedValueOnce(answer)

      expect(await invoke('updater-check-now')).toEqual({
        ok: true,
        data: answer,
      })
    }
  })

  it('opens the issue page in the browser the user chose, and no other address', async () => {
    mocks.loadAppData.mockImplementation(async () => {
      const data = createDefaultAppData()
      data.prefs.browser = 'edge'
      return data
    })

    expect(await invoke('app-open-issues', 'https://evil.example')).toEqual({
      ok: true,
      data: undefined,
    })

    expect(mocks.browser.openUrl).toHaveBeenCalledTimes(1)
    const [url, browser] = mocks.browser.openUrl.mock.calls[0] as unknown[]
    expect(url).toMatch(issuesUrl)
    expect(browser).toBe('edge')
  })

  it('opens the page of the newest release in the browser the user chose, and no other address', async () => {
    mocks.loadAppData.mockImplementation(async () => {
      const data = createDefaultAppData()
      data.prefs.browser = 'chrome'
      return data
    })

    expect(await invoke('app-open-releases', 'https://evil.example')).toEqual({
      ok: true,
      data: undefined,
    })

    expect(mocks.browser.openUrl).toHaveBeenCalledTimes(1)
    expect(mocks.browser.openUrl).toHaveBeenCalledWith(RELEASES_URL, 'chrome')
    expect(RELEASES_URL).toMatch(
      /^https:\/\/github\.com\/[A-Za-z0-9_-]+\/marubako\/releases\/latest$/
    )
  })

  it.each(['app-open-issues', 'app-open-releases'])(
    '%s reports a page that would not open',
    async (channel) => {
      mocks.browser.openUrl.mockRejectedValueOnce(
        new AppError('open_failed', 'no browser')
      )

      expect(await invoke(channel)).toMatchObject({
        ok: false,
        code: 'open_failed',
      })
    }
  )

  it('writes the pending data first, then quits and installs the downloaded update', async () => {
    const order: string[] = []
    mocks.flushPendingWrite.mockImplementationOnce(async () => {
      order.push('flush')
    })
    mocks.installDownloadedUpdate.mockImplementationOnce(() => {
      order.push('install')
      return true
    })

    expect(await invoke('updater-install-now')).toEqual({
      ok: true,
      data: undefined,
    })
    expect(order).toEqual(['flush', 'install'])
  })

  it('reports it when there is no downloaded update to install', async () => {
    mocks.installDownloadedUpdate.mockReturnValueOnce(false)

    expect(await invoke('updater-install-now')).toMatchObject({ ok: false })
  })

  it('does not install when the data could not be written', async () => {
    mocks.flushPendingWrite.mockRejectedValueOnce(new Error('disk full'))

    expect(await invoke('updater-install-now')).toMatchObject({ ok: false })
    expect(mocks.installDownloadedUpdate).not.toHaveBeenCalled()
  })

  it.each([
    ['app-get-info'],
    ['updater-check-now'],
    ['updater-install-now'],
    ['app-open-issues'],
    ['app-open-releases'],
  ])(
    '%s is for the panel: the ball gets a refusal and nothing happens',
    async (channel) => {
      const result = await invokeFrom(dockEvent, channel)

      expect(result.ok).toBe(false)
      expect(result).not.toHaveProperty('data')
      expect(mocks.checkForUpdatesNow).not.toHaveBeenCalled()
      expect(mocks.browser.openUrl).not.toHaveBeenCalled()
    }
  )

  it('opens the download page for nobody while the panel does not exist', async () => {
    mocks.windows.main = false

    expect((await invoke('app-open-releases')).ok).toBe(false)
    expect(
      (await invokeFrom({ sender: { id: 99 } }, 'app-open-releases')).ok
    ).toBe(false)
    expect(mocks.browser.openUrl).not.toHaveBeenCalled()
  })
})
