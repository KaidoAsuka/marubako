import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

import { createDefaultAppData as createStarterData } from '../src/shared/default-data'
import type { AppData, Lang } from '../src/shared/types'

/**
 * Sample data for a spec that writes its own data file. It has the look the specs were written
 * against (dark, violet, a grid): the same one the app gives a first start under QUICKLAUNCH_E2E
 * (src/main/first-run.ts). new-install-look.spec.ts covers the look a real installation starts with.
 */
export function createDefaultAppData(lang: Lang = 'zh'): AppData {
  const data = createStarterData(lang)
  return {
    ...data,
    prefs: {
      ...data.prefs,
      theme: 'dark',
      background: 'aurora',
      viewMode: 'grid',
    },
  }
}

export type AppContext = {
  electronApp: ElectronApplication
  page: Page
  userDataDir: string
}

/** The app's process and its data folder: what there is before any window. */
export type StartedApp = Pick<AppContext, 'electronApp' | 'userDataDir'>

/**
 * Starts the app and returns as soon as its process is there, without waiting for a window: for
 * the specs about what happens before the panel is up. Every other spec uses launchApp.
 */
export async function startApp(
  userDataDir?: string,
  extraArgs: string[] = []
): Promise<StartedApp> {
  const resolvedUserDataDir =
    userDataDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), 'marubako-e2e-')))
  const mainEntry = path.join(process.cwd(), 'out', 'main', 'index.js')
  const electronApp = await electron.launch({
    args: [mainEntry, ...extraArgs],
    cwd: process.cwd(),
    env: {
      ...process.env,
      QUICKLAUNCH_E2E: '1',
      QUICKLAUNCH_USER_DATA: resolvedUserDataDir,
    },
  })
  return { electronApp, userDataDir: resolvedUserDataDir }
}

export async function launchApp(
  userDataDir?: string,
  // Extra command-line switches, such as the `--hidden` an auto-start passes.
  extraArgs: string[] = []
): Promise<AppContext> {
  const { electronApp, userDataDir: resolvedUserDataDir } = await startApp(
    userDataDir,
    extraArgs
  )
  try {
    const page = await electronApp.firstWindow()

    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('app-root')).toBeVisible()

    return {
      electronApp,
      page,
      userDataDir: resolvedUserDataDir,
    }
  } catch (error) {
    // The spec gets nothing it could close. Left running, the app would be closed by the worker
    // at its teardown, which waits for the process without a limit of its own.
    endProcessTree(electronApp)
    throw error
  }
}

/** How long the app's process gets to end once it has been asked to quit (see quitApp). */
const QUIT_TIMEOUT_MS = 15_000
/** And how long after it has been ended by force. */
const PROCESS_END_TIMEOUT_MS = 10_000

function after<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms).unref())
}

/** Ends the process the app was started in, and every process under it. */
function endProcessTree(electronApp: ElectronApplication): void {
  const { pid } = electronApp.process()
  if (pid === undefined) return
  if (process.platform === 'win32') {
    // Playwright starts Electron through a shell here, so the app is a child of this process.
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
    })
  } else {
    electronApp.process().kill('SIGKILL')
  }
}

/**
 * Asks the app to quit and waits for its process to end, but not for ever: `electronApp.close()`
 * has no time limit, and a process that stays takes first the test and then the teardown of the
 * worker to their timeouts, which fails the whole run even when the retry passes.
 *
 * Once the app has closed its windows it has done its part: it writes its data before it closes
 * them (the before-quit handler in src/main/index.ts). What is left is the end of the Electron
 * process, and its last threads run at a low priority: on a machine that is busy with other things
 * they are kept waiting (8 to 25 s were measured with every core busy, against half a second).
 * A process that is still there after the limit is therefore ended. Only if it still had a window
 * open did the app itself not quit, and then the test fails and says so.
 */
async function quitApp(context: StartedApp): Promise<void> {
  const { electronApp } = context
  const closing = electronApp.close().then(() => true as const)
  if (await Promise.race([closing, after(QUIT_TIMEOUT_MS, false as const)]))
    return

  const openWindows = electronApp.windows().length
  const log = openWindows
    ? await fs
        .readFile(path.join(context.userDataDir, 'logs', 'main.log'), 'utf8')
        .catch(() => '(no log)')
    : ''
  endProcessTree(electronApp)
  // Until Playwright has seen the process go, so that the next launch does not meet the old one.
  await Promise.race([closing, after(PROCESS_END_TIMEOUT_MS, false as const)])

  const seconds = QUIT_TIMEOUT_MS / 1000
  if (openWindows) {
    throw new Error(
      `The app did not quit: ${seconds} s after it was asked to, ${openWindows} of its windows ` +
        `were still open. Its process was ended. The end of its log:\n${log.slice(-2000)}`
    )
  }
  console.warn(
    `The app had closed its windows, but ${seconds} s after it was asked to quit its process ` +
      'was still there. It was ended.'
  )
}

export async function closeApp(
  context: StartedApp,
  options?: { cleanup?: boolean; alreadyClosed?: boolean }
): Promise<void> {
  try {
    if (!options?.alreadyClosed) await quitApp(context)
  } finally {
    if (options?.cleanup !== false) {
      await fs.rm(context.userDataDir, {
        recursive: true,
        force: true,
        // A process that had to be ended may hold on to its files for a moment longer.
        maxRetries: 5,
        retryDelay: 200,
      })
    }
  }
}
