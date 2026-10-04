// Iteration 5 (package "settings", window-ux-9): the global shortcut can be changed and switched off in
// the settings. The e2e runs do not take a global shortcut unless QUICKLAUNCH_E2E_SHORTCUT is set, so
// these tests set it and use combinations nobody else would: Ctrl+Alt+Shift+F9..F12.
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createDefaultAppData } from '../src/shared/default-data'
import { closeApp, launchApp, type AppContext } from './test-utils'

const F11 = 'CommandOrControl+Alt+Shift+F11'
const F12 = 'CommandOrControl+Alt+Shift+F12'
const F9 = 'CommandOrControl+Alt+Shift+F9'

async function launchWithShortcut(
  shortcut: string,
  shortcutEnabled = true
): Promise<AppContext> {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-shortcut-'))
  const data = createDefaultAppData()
  data.prefs.shortcut = shortcut
  data.prefs.shortcutEnabled = shortcutEnabled
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )
  process.env.QUICKLAUNCH_E2E_SHORTCUT = '1'
  try {
    return await launchApp(userDataDir)
  } finally {
    delete process.env.QUICKLAUNCH_E2E_SHORTCUT
  }
}

const isRegistered = (context: AppContext, accelerator: string) =>
  context.electronApp.evaluate(
    ({ globalShortcut }, accelerator) =>
      globalShortcut.isRegistered(accelerator),
    accelerator
  )

async function openShortcut(page: Page): Promise<void> {
  await page.getByTestId('open-settings').click()
  await page.getByTestId('settings-tab-behavior').click()
}

async function savedPrefs(context: AppContext) {
  const raw = JSON.parse(
    await fs.readFile(
      path.join(context.userDataDir, 'quicklaunch-data.json'),
      'utf8'
    )
  )

  return (raw.data ?? raw).prefs
}

test('registers the saved shortcut at start and shows it in the settings as it reads', async () => {
  const context = await launchWithShortcut(F11)
  try {
    const { page } = context
    expect(await isRegistered(context, F11)).toBe(true)
    // Not the old fixed default, and not any of the old fallbacks.
    expect(await isRegistered(context, 'CommandOrControl+Alt+Space')).toBe(
      false
    )

    await openShortcut(page)

    await expect(page.getByTestId('shortcut-value')).toHaveText(
      'Ctrl + Alt + Shift + F11'
    )
    await expect(page.getByTestId('shortcut-enabled')).toBeChecked()
    // It works, so there is nothing to warn about.
    await expect(page.getByTestId('shortcut-status')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('records a new combination, checks it, and swaps the registration when saved', async () => {
  const context = await launchWithShortcut(F11)
  try {
    const { page } = context
    await openShortcut(page)

    await page.getByTestId('shortcut-change').click()
    await expect(page.getByTestId('shortcut-change')).toHaveAttribute(
      'data-recording',
      'true'
    )
    await page.keyboard.press('Control+Alt+Shift+F12')

    await expect(page.getByTestId('shortcut-value')).toHaveText(
      'Ctrl + Alt + Shift + F12'
    )
    await expect(page.getByTestId('shortcut-status')).toContainText('可以使用')
    // Checking tried the combination and let go of it again; nothing changed before Save.
    expect(await isRegistered(context, F12)).toBe(false)
    expect(await isRegistered(context, F11)).toBe(true)

    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('modal-card')).toHaveCount(0)

    await expect.poll(() => isRegistered(context, F12)).toBe(true)
    expect(await isRegistered(context, F11)).toBe(false)
    await expect
      .poll(async () => (await savedPrefs(context)).shortcut)
      .toBe(F12)

    await openShortcut(page)
    await expect(page.getByTestId('shortcut-value')).toHaveText(
      'Ctrl + Alt + Shift + F12'
    )
  } finally {
    await closeApp(context)
  }
})

test('refuses a combination that is already taken, and lets another one through', async () => {
  const context = await launchWithShortcut(F11)
  try {
    const { page } = context
    // Something else holds F9: another program in real life, this app's own registration here.
    expect(
      await context.electronApp.evaluate(
        ({ globalShortcut }, accelerator) =>
          globalShortcut.register(accelerator, () => {}),
        F9
      )
    ).toBe(true)
    await openShortcut(page)

    await page.getByTestId('shortcut-change').click()
    await page.keyboard.press('Control+Alt+Shift+F9')

    await expect(page.getByTestId('shortcut-status')).toContainText(
      '已被其他程序占用'
    )
    await expect(page.getByTestId('settings-save')).toBeDisabled()

    await page.getByTestId('shortcut-change').click()
    await page.keyboard.press('Control+Alt+Shift+F12')
    await expect(page.getByTestId('shortcut-status')).toContainText('可以使用')
    await expect(page.getByTestId('settings-save')).toBeEnabled()
  } finally {
    await closeApp(context)
  }
})

test('explains a combination that is not allowed and keeps the dialog open on Escape', async () => {
  const context = await launchWithShortcut(F11)
  try {
    const { page } = context
    await openShortcut(page)

    await page.getByTestId('shortcut-change').click()
    await page.keyboard.press('Control+K')
    await expect(page.getByTestId('shortcut-status')).toContainText(
      '至少要两个修饰键'
    )
    await page.keyboard.press('Escape')

    // Escape ended the recording, not the dialog.
    await expect(page.getByTestId('modal-card')).toBeVisible()
    await expect(page.getByTestId('shortcut-change')).not.toHaveAttribute(
      'data-recording',
      'true'
    )
    await expect(page.getByTestId('shortcut-value')).toHaveText(
      'Ctrl + Alt + Shift + F11'
    )
    // The page behind did not take Ctrl+K for its search.
    await expect(page.getByTestId('command-palette')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('turns the shortcut off and on again, keeping the choice in between', async () => {
  const context = await launchWithShortcut(F11)
  try {
    const { page } = context
    await openShortcut(page)
    await page.getByTestId('shortcut-enabled').uncheck()
    await expect(page.getByTestId('shortcut-status')).toContainText('已关闭')
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('modal-card')).toHaveCount(0)

    await expect.poll(() => isRegistered(context, F11)).toBe(false)
    await expect
      .poll(async () => (await savedPrefs(context)).shortcutEnabled)
      .toBe(false)
    expect((await savedPrefs(context)).shortcut).toBe(F11)

    await openShortcut(page)
    await expect(page.getByTestId('shortcut-enabled')).not.toBeChecked()
    await page.getByTestId('shortcut-enabled').check()
    await expect(page.getByTestId('shortcut-value')).toHaveText(
      'Ctrl + Alt + Shift + F11'
    )
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('modal-card')).toHaveCount(0)
    await expect.poll(() => isRegistered(context, F11)).toBe(true)
  } finally {
    await closeApp(context)
  }
})

test('a shortcut that is switched off at start is not registered', async () => {
  const context = await launchWithShortcut(F11, false)
  try {
    const { page } = context
    expect(await isRegistered(context, F11)).toBe(false)

    await openShortcut(page)
    await expect(page.getByTestId('shortcut-enabled')).not.toBeChecked()
    await expect(page.getByTestId('shortcut-status')).toContainText('已关闭')
  } finally {
    await closeApp(context)
  }
})

test('without the e2e switch the runs register no global shortcut at all', async () => {
  const context = await launchApp()
  try {
    expect(await isRegistered(context, 'CommandOrControl+Alt+Space')).toBe(
      false
    )
    // Saving settings must not register one behind the scenes either.
    await context.page.getByTestId('open-settings').click()
    await context.page.getByTestId('theme-light').click()
    await context.page.getByTestId('settings-save').click()
    await expect(context.page.getByTestId('modal-card')).toHaveCount(0)
    expect(await isRegistered(context, 'CommandOrControl+Alt+Space')).toBe(
      false
    )
  } finally {
    await closeApp(context)
  }
})
