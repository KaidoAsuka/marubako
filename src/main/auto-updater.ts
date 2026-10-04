import { readFileSync } from 'node:fs'
import path from 'node:path'

import { app } from 'electron'
import log from 'electron-log/main'
import { autoUpdater } from 'electron-updater'

import type { UpdateCheckResult } from '../shared/types'
import { isPortable } from './portable'
import { checkPortableUpdate } from './portable-update'

let configured = false
let missingUpdateFeedLogged = false
// The newer version whose download is running, and the one that is downloaded and waits for the
// program to quit. Both are what the events said; a check that finds the same version again
// answers from them instead of asking the feed (and downloading) a second time.
let downloadingVersion: string | null = null
let downloadedVersion: string | null = null
let inFlightCheck: Promise<UpdateCheckResult> | null = null

export function hasUpdateProviderConfig(configContent: string): boolean {
  if (!/^provider:\s*\S+/m.test(configContent)) {
    return false
  }

  if (!/^provider:\s*github\s*$/m.test(configContent)) {
    return true
  }

  return (
    /^owner:\s*\S+/m.test(configContent) && /^repo:\s*\S+/m.test(configContent)
  )
}

function logMissingUpdateFeed(message: string, error?: unknown): void {
  if (missingUpdateFeedLogged) {
    return
  }

  if (error) {
    log.info(message, error)
  } else {
    log.info(message)
  }

  missingUpdateFeedLogged = true
}

function hasConfiguredUpdateFeed(): boolean {
  try {
    const configPath = path.join(process.resourcesPath, 'app-update.yml')
    const configContent = readFileSync(configPath, 'utf8')

    if (hasUpdateProviderConfig(configContent)) {
      return true
    }

    logMissingUpdateFeed(
      'Auto updater is disabled for this build because app-update.yml does not contain a complete publish provider.'
    )
    return false
  } catch (error) {
    logMissingUpdateFeed(
      'Auto updater is disabled for this build because app-update.yml is unavailable.',
      error
    )
    return false
  }
}

export function configureAutoUpdater(): void {
  // A portable copy carries the same feed file as an installed one, and must not use it.
  if (
    configured ||
    !app.isPackaged ||
    isPortable() ||
    !hasConfiguredUpdateFeed()
  ) {
    return
  }

  autoUpdater.logger = log
  // A newer version is downloaded in the background and installed when the program quits; the
  // quit has already written the data by then (index.ts holds the quit until it is saved).
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates')
  })

  autoUpdater.on('update-available', (info) => {
    downloadingVersion = info.version
    log.info('Update available', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    log.info('No updates available')
  })

  autoUpdater.on('update-downloaded', (info) => {
    downloadingVersion = null
    downloadedVersion = info.version
    log.info('Update downloaded', info.version)
  })

  autoUpdater.on('error', (error) => {
    // A failed download must not block the next check from trying again.
    downloadingVersion = null
    log.error('Auto updater failed', error)
  })

  configured = true
}

/**
 * Quits and installs the update that is downloaded, now. Waiting for the program to quit is not
 * enough here: Marubako lives in the tray and may start with Windows, and Windows does not send the
 * quit event on a shutdown, restart or logoff, so such a user would never get the update. The
 * caller writes the pending data first. False when no update has been downloaded.
 */
export function installDownloadedUpdate(): boolean {
  if (!configured || !downloadedVersion) return false
  autoUpdater.quitAndInstall(true, true)
  return true
}

async function runUpdateCheck(): Promise<UpdateCheckResult> {
  if (!app.isPackaged) {
    log.info('Skipped update check in development')
    return { status: 'disabled' }
  }

  // A portable copy does not update itself; it only finds out whether there is a newer version.
  if (isPortable()) return checkPortableUpdate()

  if (!hasConfiguredUpdateFeed()) {
    return { status: 'disabled' }
  }

  configureAutoUpdater()
  if (downloadedVersion) return { status: 'ready', version: downloadedVersion }
  if (downloadingVersion) {
    return { status: 'downloading', version: downloadingVersion }
  }

  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result) return { status: 'disabled' }
    if (!result.isUpdateAvailable) {
      return { status: 'latest', version: app.getVersion() }
    }
    // autoDownload has started the download; its failure is logged by the error event.
    result.downloadPromise?.catch(() => undefined)
    const version = result.updateInfo.version
    if (downloadedVersion === version) return { status: 'ready', version }
    downloadingVersion = version
    return { status: 'downloading', version }
  } catch (error) {
    log.warn('Update check failed', error)
    return { status: 'error' }
  }
}

/**
 * Asks the update feed and says what it found. It never throws: a failed check is the `error`
 * status (the reason is in the log), so that a check nobody is waiting for, the timed one, stays
 * silent when the computer is offline. Two callers at once share one check.
 */
export function checkForUpdatesNow(): Promise<UpdateCheckResult> {
  inFlightCheck ??= runUpdateCheck().finally(() => {
    inFlightCheck = null
  })
  return inFlightCheck
}

/** Test hook: forget what the events and checks have said so far. */
export function resetAutoUpdaterStateForTests(): void {
  configured = false
  missingUpdateFeedLogged = false
  downloadingVersion = null
  downloadedVersion = null
  inFlightCheck = null
}
