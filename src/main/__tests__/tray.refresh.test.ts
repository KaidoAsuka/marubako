import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  tray: {
    setToolTip: vi.fn(),
    on: vi.fn(),
    setContextMenu: vi.fn(),
    displayBalloon: vi.fn(),
    isDestroyed: vi.fn(() => false),
  },
  menus: [] as Array<{ name: string }>,
  createLauncherMenu: vi.fn(),
}))

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
  createLauncherMenu: mocks.createLauncherMenu,
}))
vi.mock('../launch-settings', () => ({
  getLaunchSettings: () => ({
    shortcut: 'Ctrl + Alt + Space',
    shortcutAvailable: true,
  }),
  onLaunchShortcutChange: vi.fn(() => () => {}),
}))
vi.mock('../window-manager', () => ({
  setLauncherMenuOpen: vi.fn(),
  showMainWindow: vi.fn(),
}))
vi.mock('../data-store', () => ({
  loadAppData: async () => ({}),
  updateWindowData: async () => ({}),
}))

import type * as TrayModule from '../tray'

let tray: typeof TrayModule

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.menus.length = 0
  mocks.createLauncherMenu.mockImplementation(async () => {
    const menu = { name: `menu-${mocks.menus.length + 1}` }
    mocks.menus.push(menu)
    return menu
  })
  mocks.tray.isDestroyed.mockReturnValue(false)
  // The module keeps the tray it created: every test starts without one.
  vi.resetModules()
  tray = await import('../tray')
})

describe('the tray menu after a change of language (i18n-copy-6)', () => {
  it('does nothing while there is no tray, as in the e2e runs', async () => {
    await tray.refreshTrayMenu()

    expect(mocks.createLauncherMenu).not.toHaveBeenCalled()
    expect(mocks.tray.setContextMenu).not.toHaveBeenCalled()
  })

  it('hands the tray the menu of the language that is saved now', async () => {
    await tray.createTray()
    expect(mocks.tray.setContextMenu).toHaveBeenLastCalledWith(mocks.menus[0])

    await tray.refreshTrayMenu()

    expect(mocks.createLauncherMenu).toHaveBeenCalledTimes(2)
    expect(mocks.tray.setContextMenu).toHaveBeenCalledTimes(2)
    expect(mocks.tray.setContextMenu).toHaveBeenLastCalledWith(mocks.menus[1])
  })

  it('leaves a tray that was destroyed in the meantime alone', async () => {
    await tray.createTray()
    mocks.tray.setContextMenu.mockClear()
    mocks.tray.isDestroyed.mockReturnValue(true)

    await tray.refreshTrayMenu()

    expect(mocks.tray.setContextMenu).not.toHaveBeenCalled()
  })
})
