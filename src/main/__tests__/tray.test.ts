import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../shared/default-data'
import type { AppData, WindowState } from '../../shared/types'
import { getTrayHintText } from '../tray-hint'

const mocks = vi.hoisted(() => {
  const tray = {
    setToolTip: vi.fn(),
    isDestroyed: vi.fn(() => false),
    on: vi.fn(),
    setContextMenu: vi.fn(),
    displayBalloon: vi.fn(),
  }
  return {
    tray,
    data: null as unknown,
    launch: { shortcut: 'Ctrl + Alt + Space', shortcutAvailable: true },
    // The listeners the tray registered for a change of the launch shortcut.
    listeners: [] as Array<() => void>,
  }
})

vi.mock('electron', () => {
  const emptyImage = {
    isEmpty: () => false,
    addRepresentation: vi.fn(),
    getSize: () => ({ width: 16, height: 16 }),
    getScaleFactors: () => [1],
  }
  return {
    app: { getAppPath: () => 'C:\\app' },
    Tray: vi.fn(function () {
      return mocks.tray
    }),
    nativeImage: {
      createEmpty: () => emptyImage,
      createFromPath: () => emptyImage,
    },
  }
})
vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), warn: vi.fn() },
}))
vi.mock('../launcher-menu', () => ({
  createLauncherMenu: vi.fn(async () => ({})),
}))
vi.mock('../launch-settings', () => ({
  getLaunchSettings: () => ({ ...mocks.launch }),
  onLaunchShortcutChange: (listener: () => void) => {
    mocks.listeners.push(listener)
    return () => {}
  },
}))
vi.mock('../window-manager', () => ({
  setLauncherMenuOpen: vi.fn(),
  showMainWindow: vi.fn(),
}))
vi.mock('../data-store', () => ({
  loadAppData: async () => mocks.data as AppData,
  updateWindowData: async (updater: (state: WindowState) => WindowState) => {
    const current = mocks.data as AppData
    mocks.data = { ...current, window: updater(current.window) }
    return mocks.data
  },
}))

import { createTray, showTrayHint } from '../tray'

describe('the tray hint text', () => {
  it('names the shortcut and the tray icon in every language', () => {
    expect(getTrayHintText('zh', 'Ctrl + Alt + Space')).toContain(
      'Ctrl + Alt + Space'
    )
    expect(getTrayHintText('zh', 'X')).toContain('托盘')
    expect(getTrayHintText('en', 'Ctrl + Alt + Space')).toContain(
      'Ctrl + Alt + Space'
    )
    expect(getTrayHintText('en', 'X')).toContain('tray')
    expect(getTrayHintText('ja', 'Ctrl + Alt + Space')).toContain(
      'Ctrl + Alt + Space'
    )
    expect(getTrayHintText('ja', 'X')).toContain('トレイ')
  })

  it('only points at the tray icon, naming no key, when no shortcut is registered', () => {
    expect(getTrayHintText('zh', null)).toContain('托盘图标')
    expect(getTrayHintText('en', null)).toContain('Click its icon')
    expect(getTrayHintText('ja', null)).toContain('アイコンをクリック')
    for (const lang of ['zh', 'en', 'ja'] as const) {
      const text = getTrayHintText(lang, null)
      expect(text, lang).not.toMatch(/Ctrl|Alt|Shift|Space|press|按|キー/)
      expect(text, lang).not.toBe(getTrayHintText(lang, 'Ctrl + Alt + Space'))
    }
  })
})

describe('the tray tooltip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.launch = { shortcut: 'Ctrl + Alt + Space', shortcutAvailable: true }
  })

  it('names the shortcut that opens the launcher', async () => {
    await createTray()

    expect(mocks.tray.setToolTip).toHaveBeenCalledWith(
      'Marubako · Ctrl + Alt + Space'
    )
  })

  it('names the shortcut that was registered instead of the first choice', async () => {
    mocks.launch = { shortcut: 'Ctrl + Shift + Space', shortcutAvailable: true }

    await createTray()

    expect(mocks.tray.setToolTip).toHaveBeenCalledWith(
      'Marubako · Ctrl + Shift + Space'
    )
  })

  it('names no shortcut when none could be registered', async () => {
    mocks.launch = { shortcut: 'Ctrl + Alt + Space', shortcutAvailable: false }

    await createTray()

    expect(mocks.tray.setToolTip).toHaveBeenCalledWith('Marubako')
  })

  it('follows a change of the shortcut in the settings, not only the one at start-up', async () => {
    mocks.listeners.length = 0
    await createTray()
    mocks.tray.setToolTip.mockClear()

    mocks.launch = { shortcut: 'Ctrl + Alt + Q', shortcutAvailable: true }
    for (const listener of mocks.listeners) listener()
    expect(mocks.tray.setToolTip).toHaveBeenLastCalledWith(
      'Marubako · Ctrl + Alt + Q'
    )

    // Switched off, or taken by another program: no key is named.
    mocks.launch = { shortcut: 'Ctrl + Alt + Q', shortcutAvailable: false }
    for (const listener of mocks.listeners) listener()
    expect(mocks.tray.setToolTip).toHaveBeenLastCalledWith('Marubako')
  })
})

describe('showTrayHint', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.data = createDefaultAppData()
    mocks.launch = { shortcut: 'Ctrl + Alt + Space', shortcutAvailable: true }
    await createTray()
  })

  it('shows a balloon in the saved language the first time', async () => {
    ;(mocks.data as AppData).prefs.lang = 'en'

    await showTrayHint()

    expect(mocks.tray.displayBalloon).toHaveBeenCalledTimes(1)
    expect(mocks.tray.displayBalloon).toHaveBeenCalledWith({
      title: 'Marubako',
      content: getTrayHintText('en', 'Ctrl + Alt + Space'),
    })
  })

  it('does not tell the user to press a shortcut that is not registered', async () => {
    mocks.launch = { shortcut: 'Ctrl + Alt + Space', shortcutAvailable: false }
    ;(mocks.data as AppData).prefs.lang = 'en'

    await showTrayHint()

    expect(mocks.tray.displayBalloon).toHaveBeenCalledWith({
      title: 'Marubako',
      content: getTrayHintText('en', null),
    })
    expect(mocks.tray.displayBalloon.mock.calls[0]![0].content).not.toContain(
      'Ctrl + Alt + Space'
    )
  })

  it('names the shortcut that was registered when the first choice was taken', async () => {
    mocks.launch = { shortcut: 'Ctrl + Shift + Space', shortcutAvailable: true }
    ;(mocks.data as AppData).prefs.lang = 'en'

    await showTrayHint()

    expect(mocks.tray.displayBalloon.mock.calls[0]![0].content).toContain(
      'Ctrl + Shift + Space'
    )
  })

  it('remembers that it was shown, in the window state the renderer cannot overwrite', async () => {
    await showTrayHint()

    expect((mocks.data as AppData).window.trayHintShown).toBe(true)
  })

  it('never shows it a second time', async () => {
    await showTrayHint()
    await showTrayHint()
    await showTrayHint()

    expect(mocks.tray.displayBalloon).toHaveBeenCalledTimes(1)
  })

  it('stays silent when it was shown in an earlier session', async () => {
    ;(mocks.data as AppData).window.trayHintShown = true

    await showTrayHint()

    expect(mocks.tray.displayBalloon).not.toHaveBeenCalled()
  })
})
