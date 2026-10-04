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

export async function launchApp(
  userDataDir?: string,
  // Extra command-line switches, such as the `--hidden` an auto-start passes.
  extraArgs: string[] = []
): Promise<AppContext> {
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
  const page = await electronApp.firstWindow()

  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('app-root')).toBeVisible()

  return {
    electronApp,
    page,
    userDataDir: resolvedUserDataDir,
  }
}

export async function closeApp(
  context: AppContext,
  options?: { cleanup?: boolean; alreadyClosed?: boolean }
): Promise<void> {
  if (!options?.alreadyClosed) await context.electronApp.close()

  if (options?.cleanup === false) {
    return
  }

  await fs.rm(context.userDataDir, {
    recursive: true,
    force: true,
  })
}
