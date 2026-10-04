import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { closeApp, launchApp } from './test-utils'

test('searches across categories and opens a note for editing using the keyboard', async () => {
  const context = await launchApp()
  try {
    await context.page.keyboard.press('Control+k')
    await expect(context.page.getByTestId('command-input')).toBeFocused()
    await context.page.getByTestId('command-input').fill('使用说明')
    await expect(context.page.getByRole('option')).toHaveCount(1)
    // Enter copies a note (search-palette.spec.ts); Shift+Enter opens it.
    await context.page.keyboard.press('Shift+Enter')
    await expect(context.page.getByTestId('modal-item')).toBeVisible()
    await expect(context.page.getByTestId('item-name-input')).toHaveValue(
      '使用说明'
    )
    await expect(context.page.getByTestId('tab-notes')).toHaveClass(/active/)
    await context.page.keyboard.press('Escape')
    await expect(context.page.getByTestId('modal-item')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('supports category and create shortcuts and traps dialog focus', async () => {
  const context = await launchApp()
  try {
    await context.page.keyboard.press('Alt+3')
    await expect(context.page.getByTestId('tab-apps')).toHaveClass(/active/)
    await context.page.keyboard.press('Control+n')
    await expect(context.page.getByTestId('modal-item')).toBeVisible()
    await expect(context.page.getByTestId('item-browse')).toBeVisible()
    await context.page.getByTestId('item-save').focus()
    await context.page.keyboard.press('Tab')
    await expect(
      context.page.getByRole('button', { name: '关闭', exact: true })
    ).toBeFocused()
    await context.page.keyboard.press('Escape')
    await expect(context.page.getByTestId('modal-item')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('shows a failed launch above search and keeps the panel open', async () => {
  const context = await launchApp()
  try {
    await context.page.getByTestId('add-loose-item-folders').click()
    await context.page.getByTestId('item-name-input').fill('Broken path')
    await context.page
      .getByTestId('item-path-input')
      .fill(path.join(context.userDataDir, 'missing-directory'))
    await context.page.getByTestId('item-save').click()
    await expect(context.page.getByTestId('modal-item')).toHaveCount(0)
    await context.page.keyboard.press('Control+k')
    await context.page.getByTestId('command-input').fill('Broken path')
    await context.page.keyboard.press('Enter')
    await expect(
      context.page.locator('.feedback-strip[data-kind="danger"]')
    ).toBeVisible()
    await expect(context.page.getByTestId('command-palette')).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('hides the panel on native close, leaves the ball and remains available to reopen from the tray', async () => {
  const context = await launchApp()
  try {
    await context.electronApp.evaluate(({ BrowserWindow }) => {
      process.env.QUICKLAUNCH_E2E = '0'
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())!
        .close()
    })
    await expect
      .poll(() =>
        context.electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())!
            .isVisible()
        )
      )
      .toBe(false)
    // The ball is permanent: it is the only window left, not hidden along with the panel.
    await expect
      .poll(() =>
        context.electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .filter((window) => window.isVisible())
            .map((window) => window.isResizable())
        )
      )
      .toEqual([false])
    await context.electronApp.evaluate(({ app }) => app.emit('second-instance'))
    await expect
      .poll(() =>
        context.electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())!
            .isVisible()
        )
      )
      .toBe(true)
    await expect(context.page.getByTestId('command-input')).toHaveCount(0)
  } finally {
    await context.electronApp.evaluate(() => {
      process.env.QUICKLAUNCH_E2E = '1'
    })
    await closeApp(context)
  }
})

test('preserves a recovery copy before replacing an unreadable data file', async () => {
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'marubako-recovery-')
  )
  const original = '{broken-data-with-user-content'
  await fs.writeFile(path.join(userDataDir, 'quicklaunch-data.json'), original)
  const context = await launchApp(userDataDir)
  try {
    const recovery = (await fs.readdir(userDataDir)).find((entry) =>
      entry.startsWith('quicklaunch-data.json.recovery-')
    )
    expect(recovery).toBeTruthy()
    expect(await fs.readFile(path.join(userDataDir, recovery!), 'utf8')).toBe(
      original
    )
    await context.page
      .getByTestId('folder-widget-grp-folders-work')
      .locator('.widget-box')
      .click()
    await expect(
      context.page.getByTestId('grid-item-folder-desktop')
    ).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('persists hide-after-launch and restores it on restart', async () => {
  const first = await launchApp()
  await first.page.getByTestId('open-settings').click()
  await first.page.getByTestId('settings-tab-behavior').click()
  await first.page.getByTestId('hide-after-launch').check()
  await first.page.getByTestId('settings-save').click()
  await expect(first.page.getByTestId('modal-settings')).toHaveCount(0)
  const userDataDir = first.userDataDir
  await closeApp(first, { cleanup: false })
  const second = await launchApp(userDataDir)
  try {
    await second.page.getByTestId('open-settings').click()
    await second.page.getByTestId('settings-tab-behavior').click()
    await expect(second.page.getByTestId('hide-after-launch')).toBeChecked()
  } finally {
    await closeApp(second)
  }
})

test('keeps navigation and dialogs usable at compact and large window sizes', async () => {
  const context = await launchApp()
  try {
    await context.page.screenshot({
      path: 'artifacts/workspace-dark.png',
      animations: 'disabled',
    })
    await context.page.getByTestId('open-command').click()
    await context.page.getByTestId('command-input').fill('GitHub')
    await context.page.screenshot({
      path: 'artifacts/search.png',
      animations: 'disabled',
    })
    await context.page.keyboard.press('Escape')
    await context.electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())!
        .setSize(420, 700)
    })
    await expect(context.page.getByTestId('tab-tasks')).toBeVisible()
    await context.page.screenshot({
      path: 'artifacts/workspace-compact.png',
      animations: 'disabled',
    })
    await context.page.getByTestId('open-settings').click()
    await context.page.getByTestId('theme-light').click()
    await context.page.getByTestId('settings-save').click()
    await context.electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())!
        .setSize(760, 720)
    })
    await expect(context.page.getByTestId('app-root')).toHaveClass(
      /theme-light/
    )
    // A group tile is the light theme's accent at 10% (layout-2: it is the soft fill that tells it from
    // a loose entry); the canvas under it and the white card colour are the theme's.
    await expect(
      context.page.getByTestId('folder-widget-grp-folders-work')
    ).toHaveCSS(
      'background-color',
      'color(srgb 0.333333 0.266667 0.854902 / 0.1)'
    )
    expect(
      await context.page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--card-bg')
          .trim()
      )
    ).toBe('#ffffff')
    await context.page.screenshot({
      path: 'artifacts/workspace-light.png',
      animations: 'disabled',
    })
  } finally {
    await closeApp(context)
  }
})
