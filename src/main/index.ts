import path from 'node:path'

import { app, globalShortcut } from 'electron'
import log from 'electron-log/main'

import { checkForUpdatesNow, configureAutoUpdater } from './auto-updater'
import { APP_ID, getLogFilePath, PORTABLE_APP_ID } from './config'
import {
  promptRecovery,
  promptSaveFailure,
  showPortableKeyFailure,
  showStartupFailure,
} from './data-prompts'
import {
  DataLoadAbortedError,
  flushPendingWrite,
  loadAppData,
  showUpdateNotice,
} from './data-store'
import { registerIpcHandlers } from './ipc-handlers'
import { registerLaunchShortcut } from './launch-settings'
import { getPortableDataDir, guardPortableKey, isPortable } from './portable'
import { PortableKeyError } from './portable-key'
import { createTray, showTrayHint } from './tray'
import { startUpdateChecks } from './update-schedule'
import {
  NOT_STARTED_USER_DATA_DIRNAME,
  resolveUserDataOverride,
} from './user-data-path'
import {
  createMainWindow,
  prepareToQuit,
  setHiddenToTrayNotifier,
  showMainWindow,
} from './window-manager'

const isE2E = process.env.QUICKLAUNCH_E2E === '1'
// The smoke test of the portable copy runs without a data folder of its own to point at.
const mustBePortable = process.env.QUICKLAUNCH_REQUIRE_PORTABLE === '1'

/**
 * Ends the program before Chromium has read a single file. Whatever of this file still runs before
 * the exit takes effect is pointed at a folder of its own, away from anybody's data.
 */
function stopBeforeStart(exitCode: number): void {
  app.setPath(
    'userData',
    path.join(app.getPath('temp'), NOT_STARTED_USER_DATA_DIRNAME)
  )
  app.exit(exitCode)
}

// A copy that had to be portable and does not find itself so must not go on to the data of an
// installed one.
if (mustBePortable && !isPortable()) stopBeforeStart(2)

// Must run before the logger and the single-instance lock: both are keyed on userData.
const userDataOverride = resolveUserDataOverride({
  envUserData: process.env.QUICKLAUNCH_USER_DATA,
  isPackaged: app.isPackaged,
  appDataDir: app.getPath('appData'),
  portableDataDir: getPortableDataDir() ?? undefined,
})
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
}
// Also before Chromium reads its files: a portable folder may have been on another PC meanwhile.
const portableKey = guardPortableKey(userDataOverride)

function configureLogger(): void {
  log.initialize()
  log.transports.file.resolvePathFn = () => getLogFilePath()
}

app.setAppUserModelId(isPortable() ? PORTABLE_APP_ID : APP_ID)
configureLogger()
if (portableKey instanceof PortableKeyError && portableKey.fatal) {
  // Chromium would replace the key of the other PC as soon as it starts.
  log.error(
    'Not starting: the key of another PC in the data folder could not be kept safe',
    portableKey
  )
  // Under test nobody is there to close the box.
  if (!isE2E && !mustBePortable) showPortableKeyFailure(portableKey)
  stopBeforeStart(3)
} else if (portableKey instanceof PortableKeyError) {
  log.warn('Could not keep a copy of the key in the data folder', portableKey)
} else if (portableKey !== null && portableKey !== 'unchanged') {
  log.info(`Portable data folder, key of this PC: ${portableKey}`)
}

if (!isE2E && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Until start-up has finished, a second launch must not race it (the recovery dialog may be open).
  let started = false
  app.on('second-instance', () => {
    if (started) {
      showMainWindow().catch((error) =>
        log.warn('Could not show the window for a second launch', error)
      )
    }
  })
  app
    .whenReady()
    .then(async () => {
      const startupData = await loadAppData(
        isE2E ? {} : { chooseRecovery: promptRecovery }
      )
      if (!isE2E) {
        configureAutoUpdater()
      }
      registerIpcHandlers()
      // The e2e runs never take a global shortcut, except the one that tests this very thing.
      if (!isE2E || process.env.QUICKLAUNCH_E2E_SHORTCUT === '1')
        registerLaunchShortcut(startupData.prefs)
      await createMainWindow()
      if (!isE2E) {
        await createTray()
        // Only fires when everything, ball included, was hidden (the ball turned off).
        setHiddenToTrayNotifier(
          () =>
            void showTrayHint().catch((error) =>
              log.warn('Could not show the tray hint', error)
            )
        )
      }

      // Once per start, a little after the window is up; then at most once a day while it stays open.
      startUpdateChecks({
        isPackaged: app.isPackaged,
        isE2E,
        // The installed copy downloads what it finds. A portable copy cannot: it says so in the
        // panel, once, and the user fetches the new version.
        check: async () => {
          const result = await checkForUpdatesNow()
          if (result.status === 'available') showUpdateNotice(result.version)
          return result
        },
      })

      started = true
      app.on('activate', () => {
        showMainWindow().catch((error) =>
          log.warn('Could not show the window on activate', error)
        )
      })
    })
    .catch((error) => {
      if (error instanceof DataLoadAbortedError) {
        log.warn('Start-up cancelled by the user to keep the data file')
        app.quit()
        return
      }
      log.error('Failed to start Marubako', error)
      showStartupFailure(error, getLogFilePath())
      app.quit()
    })
}

const QUIT_FLUSH_TIMEOUT_MS = 8000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Writing the data file timed out')),
      ms
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/** Writes pending data before quitting; if that fails the user decides between retry and quit. */
async function flushBeforeQuit(): Promise<void> {
  for (;;) {
    try {
      await withTimeout(flushPendingWrite(), QUIT_FLUSH_TIMEOUT_MS)
      return
    } catch (error) {
      log.error('Failed to flush application data', error)
      if (isE2E) return
      const message = error instanceof Error ? error.message : String(error)
      if ((await promptSaveFailure(message)) !== 'retry') return
    }
  }
}

let flushedBeforeQuit = false
let quitFlow: Promise<void> | null = null
app.on('before-quit', (event) => {
  prepareToQuit()
  if (flushedBeforeQuit) return
  event.preventDefault()
  // A second Quit while the first flush (or its retry dialog) is pending must not start another.
  if (quitFlow) return
  quitFlow = flushBeforeQuit()
    .catch((error) => log.error('Quit flow failed', error))
    .finally(() => {
      flushedBeforeQuit = true
      app.quit()
    })
})

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
