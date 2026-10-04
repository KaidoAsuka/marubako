import { app, globalShortcut } from 'electron'
import log from 'electron-log/main'

import { checkForUpdatesNow, configureAutoUpdater } from './auto-updater'
import { APP_ID, getLogFilePath } from './config'
import {
  promptRecovery,
  promptSaveFailure,
  showStartupFailure,
} from './data-prompts'
import {
  DataLoadAbortedError,
  flushPendingWrite,
  loadAppData,
} from './data-store'
import { registerIpcHandlers } from './ipc-handlers'
import { registerLaunchShortcut } from './launch-settings'
import { createTray, showTrayHint } from './tray'
import { startUpdateChecks } from './update-schedule'
import { resolveUserDataOverride } from './user-data-path'
import {
  createMainWindow,
  prepareToQuit,
  setHiddenToTrayNotifier,
  showMainWindow,
} from './window-manager'

const isE2E = process.env.QUICKLAUNCH_E2E === '1'

// Must run before the logger and the single-instance lock: both are keyed on userData.
const userDataOverride = resolveUserDataOverride({
  envUserData: process.env.QUICKLAUNCH_USER_DATA,
  isPackaged: app.isPackaged,
  appDataDir: app.getPath('appData'),
})
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
}

function configureLogger(): void {
  log.initialize()
  log.transports.file.resolvePathFn = () => getLogFilePath()
}

app.setAppUserModelId(APP_ID)
configureLogger()

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
        check: checkForUpdatesNow,
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
