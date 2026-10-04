import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as AutoUpdaterModule from '../auto-updater'

type Listener = (...args: any[]) => void

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, Listener[]>()
  return {
    app: { isPackaged: true, getVersion: () => '2.5.8' },
    portable: false,
    updater: {
      autoDownload: undefined as boolean | undefined,
      autoInstallOnAppQuit: undefined as boolean | undefined,
      logger: undefined as unknown,
      checkForUpdates: vi.fn(),
      quitAndInstall: vi.fn(),
      on(event: string, listener: Listener) {
        listeners.set(event, [...(listeners.get(event) ?? []), listener])
      },
      emit(event: string, ...args: unknown[]) {
        for (const listener of listeners.get(event) ?? []) listener(...args)
      },
      reset() {
        listeners.clear()
        this.autoDownload = undefined
        this.autoInstallOnAppQuit = undefined
        this.checkForUpdates.mockReset()
        this.quitAndInstall.mockReset()
      },
    },
    // What a portable copy asks instead of the feed (portable-update.test.ts has its own tests).
    checkPortableUpdate: vi.fn(),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
})

vi.mock('electron', () => ({ app: mocks.app }))
vi.mock('electron-log/main', () => ({ default: mocks.log }))
vi.mock('electron-updater', () => ({ autoUpdater: mocks.updater }))
vi.mock('../portable', () => ({ isPortable: () => mocks.portable }))
vi.mock('../portable-update', () => ({
  checkPortableUpdate: mocks.checkPortableUpdate,
}))

// Electron sets process.resourcesPath; under vitest it is whatever the test makes it.
const originalResourcesPath = Object.getOwnPropertyDescriptor(
  process,
  'resourcesPath'
)
function setResourcesPath(value: string): void {
  Object.defineProperty(process, 'resourcesPath', {
    value,
    configurable: true,
    writable: true,
  })
}
let resourcesDir: string
let updater: typeof AutoUpdaterModule

function writeFeed(content: string | null): void {
  const file = path.join(resourcesDir, 'app-update.yml')
  fs.rmSync(file, { force: true })
  if (content !== null) fs.writeFileSync(file, content)
}

const GITHUB_FEED = [
  'provider: github',
  'owner: someone',
  'repo: marubako',
  'releaseType: release',
].join('\n')

/** What electron-updater answers a check with. */
function answer(available: boolean, version = '2.6.0') {
  return {
    isUpdateAvailable: available,
    updateInfo: { version },
    downloadPromise: available ? Promise.resolve(['installer.exe']) : null,
  }
}

beforeEach(async () => {
  resourcesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marubako-updater-'))
  setResourcesPath(resourcesDir)
  writeFeed(GITHUB_FEED)
  mocks.app.isPackaged = true
  mocks.portable = false
  mocks.updater.reset()
  mocks.checkPortableUpdate.mockReset()
  mocks.checkPortableUpdate.mockResolvedValue({
    status: 'latest',
    version: '2.5.8',
  })
  Object.values(mocks.log).forEach((fn) => fn.mockClear())
  vi.resetModules()
  updater = await import('../auto-updater')
})

afterEach(() => {
  fs.rmSync(resourcesDir, { recursive: true, force: true })
  if (originalResourcesPath)
    Object.defineProperty(process, 'resourcesPath', originalResourcesPath)
  else delete (process as { resourcesPath?: string }).resourcesPath
})

describe('hasUpdateProviderConfig', () => {
  it('rejects update configs without a provider', () => {
    expect(
      updater.hasUpdateProviderConfig('updaterCacheDirName: marubako-updater\n')
    ).toBe(false)
  })

  it('requires owner and repo for github update configs', () => {
    expect(
      updater.hasUpdateProviderConfig(
        ['provider: github', 'repo: marubako'].join('\n')
      )
    ).toBe(false)

    expect(
      updater.hasUpdateProviderConfig(
        ['provider: github', 'owner: user', 'repo: marubako'].join('\n')
      )
    ).toBe(true)
  })

  it('accepts non-github providers once a provider is present', () => {
    expect(
      updater.hasUpdateProviderConfig(
        ['provider: generic', 'url: https://example.com/updates'].join('\n')
      )
    ).toBe(true)
  })
})

describe('installing a downloaded update now', () => {
  it('does nothing while no update has been downloaded', async () => {
    writeFeed(GITHUB_FEED)
    mocks.updater.checkForUpdates.mockResolvedValue(answer(true, '2.6.0'))
    await updater.checkForUpdatesNow()

    expect(updater.installDownloadedUpdate()).toBe(false)
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('quits and installs silently, and starts the program again, once a download has finished', async () => {
    writeFeed(GITHUB_FEED)
    mocks.updater.checkForUpdates.mockResolvedValue(answer(true, '2.6.0'))
    await updater.checkForUpdatesNow()
    mocks.updater.emit('update-downloaded', { version: '2.6.0' })

    expect(updater.installDownloadedUpdate()).toBe(true)
    expect(mocks.updater.quitAndInstall).toHaveBeenCalledWith(true, true)
  })
})

describe('checking for updates', () => {
  it('does not ask the feed in a development build', async () => {
    mocks.app.isPackaged = false

    await expect(updater.checkForUpdatesNow()).resolves.toEqual({
      status: 'disabled',
    })
    expect(mocks.updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('asks nothing in an installed copy that a portable copy would ask', async () => {
    mocks.updater.checkForUpdates.mockResolvedValue(answer(false))

    await updater.checkForUpdatesNow()

    expect(mocks.checkPortableUpdate).not.toHaveBeenCalled()
  })

  it.each([
    ['there is no app-update.yml', null],
    ['app-update.yml names no provider', 'channel: latest\n'],
    ['the github feed has no owner', 'provider: github\nrepo: marubako\n'],
  ])('is disabled when %s', async (_name, content) => {
    writeFeed(content)

    await expect(updater.checkForUpdatesNow()).resolves.toEqual({
      status: 'disabled',
    })
    expect(mocks.updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('says it is the latest version, naming the running one', async () => {
    mocks.updater.checkForUpdates.mockResolvedValue(answer(false))

    await expect(updater.checkForUpdatesNow()).resolves.toEqual({
      status: 'latest',
      version: '2.5.8',
    })
  })

  it('says a newer version is downloading, and downloads in the background', async () => {
    mocks.updater.checkForUpdates.mockResolvedValue(answer(true, '2.6.0'))

    await expect(updater.checkForUpdatesNow()).resolves.toEqual({
      status: 'downloading',
      version: '2.6.0',
    })
    expect(mocks.updater.autoDownload).toBe(true)
    expect(mocks.updater.autoInstallOnAppQuit).toBe(true)
  })

  it('treats a download that fails later as logged news, not an unhandled rejection', async () => {
    const rejected = Promise.reject(new Error('network down'))
    mocks.updater.checkForUpdates.mockResolvedValue({
      ...answer(true),
      downloadPromise: rejected,
    })
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)

    await updater.checkForUpdatesNow()
    await new Promise((resolve) => setTimeout(resolve, 20))
    process.off('unhandledRejection', unhandled)

    expect(unhandled).not.toHaveBeenCalled()
  })

  it('reports an error as a result, never as a throw, and logs the reason', async () => {
    mocks.updater.checkForUpdates.mockRejectedValue(new Error('ENOTFOUND'))

    await expect(updater.checkForUpdatesNow()).resolves.toEqual({
      status: 'error',
    })
    expect(mocks.log.warn).toHaveBeenCalledWith(
      'Update check failed',
      expect.any(Error)
    )
  })

  it('is disabled when the updater itself says there is nothing to check', async () => {
    mocks.updater.checkForUpdates.mockResolvedValue(null)

    await expect(updater.checkForUpdatesNow()).resolves.toEqual({
      status: 'disabled',
    })
  })

  it('lets two callers at once share one check', async () => {
    let finish: (value: unknown) => void = () => undefined
    mocks.updater.checkForUpdates.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )

    const first = updater.checkForUpdatesNow()
    const second = updater.checkForUpdatesNow()
    finish(answer(false))

    expect(await first).toEqual({ status: 'latest', version: '2.5.8' })
    expect(await second).toEqual({ status: 'latest', version: '2.5.8' })
    expect(mocks.updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('asks again after a check has finished', async () => {
    mocks.updater.checkForUpdates.mockResolvedValue(answer(false))

    await updater.checkForUpdatesNow()
    await updater.checkForUpdatesNow()

    expect(mocks.updater.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('does not ask the feed again while the download it started is running', async () => {
    mocks.updater.checkForUpdates.mockResolvedValue(answer(true, '2.6.0'))
    await updater.checkForUpdatesNow()
    mocks.updater.emit('update-available', { version: '2.6.0' })

    await expect(updater.checkForUpdatesNow()).resolves.toEqual({
      status: 'downloading',
      version: '2.6.0',
    })
    expect(mocks.updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('says ready, without asking, once the download has finished', async () => {
    mocks.updater.checkForUpdates.mockResolvedValue(answer(true, '2.6.0'))
    await updater.checkForUpdatesNow()
    mocks.updater.emit('update-downloaded', { version: '2.6.0' })

    await expect(updater.checkForUpdatesNow()).resolves.toEqual({
      status: 'ready',
      version: '2.6.0',
    })
    expect(mocks.updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('says ready when the download finished before the check came back', async () => {
    mocks.updater.checkForUpdates.mockImplementation(async () => {
      mocks.updater.emit('update-downloaded', { version: '2.6.0' })
      return answer(true, '2.6.0')
    })

    await expect(updater.checkForUpdatesNow()).resolves.toEqual({
      status: 'ready',
      version: '2.6.0',
    })
  })

  it('tries again after a download failed', async () => {
    mocks.updater.checkForUpdates.mockResolvedValue(answer(true, '2.6.0'))
    await updater.checkForUpdatesNow()
    mocks.updater.emit('error', new Error('connection reset'))

    await updater.checkForUpdatesNow()

    expect(mocks.updater.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(mocks.log.error).toHaveBeenCalledWith(
      'Auto updater failed',
      expect.any(Error)
    )
  })
})

// The zip of a release carries the same app-update.yml as the installed program, and must not use
// it: the updater would install the installer's version somewhere else and leave the folder of the
// portable copy as it is. Such a copy only finds out whether there is a newer version.
describe('checking for updates in a portable copy', () => {
  beforeEach(() => {
    mocks.portable = true
  })

  it.each([
    ['there is a feed file', GITHUB_FEED],
    ['there is none', null],
  ])(
    'asks which version is the newest and never the feed, when %s',
    async (_name, feed) => {
      writeFeed(feed)
      mocks.checkPortableUpdate.mockResolvedValue({
        status: 'available',
        version: '2.6.0',
      })

      await expect(updater.checkForUpdatesNow()).resolves.toEqual({
        status: 'available',
        version: '2.6.0',
      })
      expect(mocks.checkPortableUpdate).toHaveBeenCalledTimes(1)
      expect(mocks.updater.checkForUpdates).not.toHaveBeenCalled()
    }
  )

  it.each([
    [{ status: 'latest', version: '2.5.8' }],
    [{ status: 'available', version: '2.6.0' }],
    [{ status: 'error' }],
  ] as const)('passes the answer %j on as it is', async (result) => {
    mocks.checkPortableUpdate.mockResolvedValue(result)

    await expect(updater.checkForUpdatesNow()).resolves.toEqual(result)
  })

  it('sets nothing up to download or to install on quit', async () => {
    mocks.checkPortableUpdate.mockResolvedValue({
      status: 'available',
      version: '2.6.0',
    })
    await updater.checkForUpdatesNow()

    updater.configureAutoUpdater()

    expect(mocks.updater.autoDownload).toBeUndefined()
    expect(mocks.updater.autoInstallOnAppQuit).toBeUndefined()
    // There is nothing downloaded to install, whatever version was found.
    expect(updater.installDownloadedUpdate()).toBe(false)
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('does not ask at all in a development build', async () => {
    mocks.app.isPackaged = false

    await expect(updater.checkForUpdatesNow()).resolves.toEqual({
      status: 'disabled',
    })
    expect(mocks.checkPortableUpdate).not.toHaveBeenCalled()
  })

  it('lets two callers at once share one check, and asks again afterwards', async () => {
    let finish: (value: unknown) => void = () => undefined
    mocks.checkPortableUpdate.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      })
    )

    const first = updater.checkForUpdatesNow()
    const second = updater.checkForUpdatesNow()
    finish({ status: 'available', version: '2.6.0' })

    expect(await first).toEqual({ status: 'available', version: '2.6.0' })
    expect(await second).toEqual({ status: 'available', version: '2.6.0' })
    expect(mocks.checkPortableUpdate).toHaveBeenCalledTimes(1)

    // Nothing is remembered: the next check asks again.
    await updater.checkForUpdatesNow()
    expect(mocks.checkPortableUpdate).toHaveBeenCalledTimes(2)
  })
})
