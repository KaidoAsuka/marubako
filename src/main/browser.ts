import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

import { app, shell } from 'electron'
import log from 'electron-log/main'

import type { BrowserPreference } from '../shared/types'
import { resolveEntryPath } from '../shared/user-path'
import { AppError, classifyOpenError, type OpenKind } from './app-error'

export function isValidHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * The path of an entry as the operating system has to see it. Entries saved by an older version, or
 * pasted into the form with quotes, stray spaces or a `file:` address, are cleaned here as well, and
 * `%VARIABLES%` are expanded now (the entry keeps them, so it still works on another account).
 */
function resolveTarget(targetPath: unknown): string {
  if (typeof targetPath !== 'string')
    throw new AppError('invalid_path', 'The path is not text')
  const resolved = resolveEntryPath(targetPath, process.env)
  if (!resolved) throw new AppError('invalid_path', 'The path is empty')
  return resolved
}

/** Opens what an entry points at, and says in a code why it could not. */
async function openTarget(targetPath: string, kind: OpenKind): Promise<string> {
  const resolved = resolveTarget(targetPath)
  try {
    await fs.access(resolved)
  } catch (error) {
    throw classifyOpenError(error, kind)
  }
  const failure = await shell.openPath(resolved)
  if (failure) throw new AppError('open_failed', failure)
  return ''
}

export function openPath(targetPath: string): Promise<string> {
  return openTarget(targetPath, 'folder')
}

export function openApp(targetPath: string): Promise<string> {
  return openTarget(targetPath, 'app')
}

type DirectBrowser = Exclude<BrowserPreference, 'default'>

const BROWSER_INSTALL_PATHS: Record<DirectBrowser, string[]> = {
  edge: ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
  chrome: ['Google', 'Chrome', 'Application', 'chrome.exe'],
}

/** Finds the browser executable in the standard machine-wide and per-user install folders. */
async function resolveBrowserExecutable(
  browser: DirectBrowser
): Promise<string | null> {
  const roots = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env['LOCALAPPDATA'],
  ]
  for (const root of roots) {
    if (!root) continue
    const candidate = path.join(root, ...BROWSER_INSTALL_PATHS[browser])
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // Not installed in this location; try the next one.
    }
  }
  return null
}

/**
 * Starts the browser without a shell, so no character of the URL is ever interpreted as a command.
 * Resolves to false when the process could not be started, so the caller can fall back.
 */
function spawnBrowser(executable: string, href: string): Promise<boolean> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      // "--" ends switch parsing, so the URL can never be read as a browser switch.
      child = spawn(executable, ['--', href], {
        detached: true,
        stdio: 'ignore',
        shell: false,
        windowsHide: true,
      })
    } catch (error) {
      log.warn('Could not start the browser', error)
      resolve(false)
      return
    }
    // Without a listener a failed spawn would surface as an uncaught exception in the main process.
    child.on('error', (error) => {
      log.warn('Could not start the browser', error)
      resolve(false)
    })
    child.once('spawn', () => resolve(true))
    child.unref()
  })
}

export async function openUrl(
  targetUrl: string,
  browser: BrowserPreference
): Promise<void> {
  if (typeof targetUrl !== 'string' || !isValidHttpUrl(targetUrl)) {
    throw new AppError('invalid_url', `Invalid URL: ${String(targetUrl)}`)
  }
  // Only the normalised form is ever handed to a browser or the OS.
  const href = new URL(targetUrl).href

  if (browser === 'edge' || browser === 'chrome') {
    const executable = await resolveBrowserExecutable(browser)
    if (executable && (await spawnBrowser(executable, href))) return
    log.warn(`${browser} is not available, using the default browser`)
  }

  try {
    await shell.openExternal(href)
  } catch (error) {
    throw new AppError(
      'open_failed',
      error instanceof Error ? error.message : String(error),
      { cause: error }
    )
  }
}

export async function getFileIcon(targetPath: string): Promise<string | null> {
  try {
    const icon = await app.getFileIcon(
      resolveEntryPath(targetPath, process.env),
      { size: 'large' }
    )
    return icon.toDataURL()
  } catch {
    return null
  }
}
