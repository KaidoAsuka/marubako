import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

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
