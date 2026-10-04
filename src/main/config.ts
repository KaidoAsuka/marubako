import { app } from 'electron'
import path from 'node:path'

export const APP_ID = 'io.github.KaidoAsuka.marubako'
// A portable copy is its own application to Windows. "Start with Windows" is stored under this id:
// with the id of the installed copy, each of the two would overwrite the other's entry, and
// uninstalling the installed copy would delete the portable one's (build/installer.nsh).
export const PORTABLE_APP_ID = `${APP_ID}.portable`
export const APP_NAME = 'Marubako'
// Where the project lives; the owner is filled in by scripts/set-github-owner.cjs. The issue page is
// what the settings dialog links to, the releases are the update feed of electron-builder.config.cjs.
export const REPOSITORY_URL = 'https://github.com/KaidoAsuka/marubako'
export const ISSUES_URL = `${REPOSITORY_URL}/issues`
export const DATA_FILENAME = 'quicklaunch-data.json'
export const LOG_FILENAME = 'main.log'

// A new installation opens at DEFAULT_WINDOW_HEIGHT and a width that depends on the language
// (default-window-size.ts). Saved window bounds are never replaced by either.
export const DEFAULT_WINDOW_HEIGHT = 720
export const MIN_EXPANDED_WIDTH = 320
export const MIN_EXPANDED_HEIGHT = 420
export const WINDOW_MARGIN = 12

export const WINDOW_STATE_FILENAME = 'window-state.json'
export const BACKUP_DIRNAME = 'backups'

export function getDataFilePath(): string {
  return path.join(app.getPath('userData'), DATA_FILENAME)
}

export function getWindowStateFilePath(): string {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILENAME)
}

export function getBackupDir(): string {
  return path.join(app.getPath('userData'), BACKUP_DIRNAME)
}

export function getLogFilePath(): string {
  return path.join(app.getPath('userData'), 'logs', LOG_FILENAME)
}
