import fs from 'node:fs'
import os from 'node:os'

import { app } from 'electron'

import {
  keyOwner,
  PortableKeyError,
  selectPortableKey,
  type KeyOwner,
  type PortableKeyChange,
} from './portable-key'
import { resolvePortableDataDir } from './user-data-path'

// undefined: not looked at yet. The answer cannot change while the program runs.
let dataDir: string | null | undefined

function isFile(target: string): boolean {
  try {
    return fs.statSync(target).isFile()
  } catch {
    return false
  }
}

/** The data folder of a portable copy, or null for an installed copy and for a development build. */
export function getPortableDataDir(): string | null {
  if (dataDir === undefined) {
    dataDir =
      resolvePortableDataDir({
        isPackaged: app.isPackaged,
        exePath: app.getPath('exe'),
        isFile,
        exists: fs.existsSync,
      }) ?? null
  }
  return dataDir
}

/**
 * Whether this is a portable copy. Such a copy does not update itself: the updater would install
 * the installer's version somewhere else and leave this folder as it is.
 */
export function isPortable(): boolean {
  return getPortableDataDir() !== null
}

function thisPc(): KeyOwner {
  let username: string
  try {
    username = os.userInfo().username
  } catch {
    username = process.env.USERNAME ?? ''
  }
  const homeDir = os.homedir()
  let volume: number | undefined
  try {
    // On Windows: the serial number of the volume.
    volume = fs.statSync(homeDir).dev
  } catch {
    volume = undefined
  }
  return keyOwner({ hostname: os.hostname(), username, homeDir, volume })
}

/**
 * When the program is about to run on the data folder of a portable copy: makes the folder, and
 * keeps the key of another PC from being replaced (selectPortableKey). Call it before the app is
 * ready. Returns what was done with the key, or the error that kept it from being done (if that
 * one is `fatal` the program must not start); null when `userDataDir` is not that folder.
 */
export function guardPortableKey(
  userDataDir: string | undefined
): PortableKeyChange | PortableKeyError | null {
  const portableDataDir = getPortableDataDir()
  if (portableDataDir === null || userDataDir !== portableDataDir) return null
  try {
    fs.mkdirSync(portableDataDir, { recursive: true })
    return selectPortableKey(portableDataDir, thisPc())
  } catch (error) {
    return error instanceof PortableKeyError
      ? error
      : new PortableKeyError(error, false)
  }
}

/** Test hook: look again. */
export function resetPortableForTests(): void {
  dataDir = undefined
}
