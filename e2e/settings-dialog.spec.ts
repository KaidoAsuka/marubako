// Iteration 5 (package "settings"): the dialog previews appearance before saving and puts it back on
// cancel; the sliders say what they do; the pin switch is immediate.
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

import { closeApp, launchApp, type AppContext } from './test-utils'

const panelOpacity = (context: AppContext) =>
  context.electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((candidate) => candidate.isResizable())!
      .getOpacity()
  )

const root = (page: Page) => page.getByTestId('app-root')

const zoomOf = (page: Page) =>
  root(page).evaluate((element) => element.style.zoom)

const accentOf = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent')
  )

async function savedPref(context: AppContext, key: string): Promise<unknown> {
  const raw = JSON.parse(
    await fs.readFile(
      path.join(context.userDataDir, 'quicklaunch-data.json'),
      'utf8'
    )
  )

  return (raw.data ?? raw).prefs[key]
}

test('shows the theme, the accent and the interface size while the dialog is open, and puts them back on cancel', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(root(page)).toHaveClass(/theme-dark/)
    await expect(root(page)).toHaveAttribute('data-background', 'aurora')
    const accentBefore = await accentOf(page)

    await page.getByTestId('open-settings').click()
    await page.getByTestId('theme-light').click()
    await page.getByTestId('background-sunset').click()
    await page.locator('#settings-font-size').fill('125')

    // Nothing is saved yet, and the window already looks like the choice.
    await expect(root(page)).toHaveClass(/theme-light/)
    await expect(root(page)).toHaveAttribute('data-background', 'sunset')
    await expect.poll(() => zoomOf(page)).toBe('1.25')
    expect(await accentOf(page)).not.toBe(accentBefore)

    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByTestId('modal-card')).toHaveCount(0)

    await expect(root(page)).toHaveClass(/theme-dark/)
    await expect(root(page)).toHaveAttribute('data-background', 'aurora')
    await expect.poll(() => zoomOf(page)).toBe('1')
    expect(await accentOf(page)).toBe(accentBefore)
    // The dialog shows the saved values again when it is reopened.
    await page.getByTestId('open-settings').click()
    await expect(page.getByTestId('theme-dark')).toHaveClass(/active/)
    await expect(page.locator('#settings-font-size')).toHaveValue('100')
  } finally {
    await closeApp(context)
  }
})

test('Escape and the close button put the previewed appearance back too, and Save keeps it', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await page.getByTestId('open-settings').click()
    await page.getByTestId('theme-light').click()
    await expect(root(page)).toHaveClass(/theme-light/)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('modal-card')).toHaveCount(0)
    await expect(root(page)).toHaveClass(/theme-dark/)

    await page.getByTestId('open-settings').click()
    await page.getByTestId('theme-light').click()
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(page.getByTestId('modal-card')).toHaveCount(0)
    await expect(root(page)).toHaveClass(/theme-dark/)

    await page.getByTestId('open-settings').click()
    await page.getByTestId('theme-light').click()
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('modal-card')).toHaveCount(0)
    await expect(root(page)).toHaveClass(/theme-light/)
  } finally {
    await closeApp(context)
  }
})

test('previews the panel opacity on the real window, restores it on cancel and keeps it on Save', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    expect(await panelOpacity(context)).toBe(1)

    await page.getByTestId('open-settings').click()
    // The slider stops at 40%: a window cannot be made nearly invisible.
    await expect(page.locator('#settings-opacity')).toHaveAttribute('min', '40')
    await page.locator('#settings-opacity').fill('60')
    await expect.poll(() => panelOpacity(context)).toBeCloseTo(0.6, 2)

    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByTestId('modal-card')).toHaveCount(0)
    await expect.poll(() => panelOpacity(context)).toBe(1)

    await page.getByTestId('open-settings').click()
    await page.locator('#settings-opacity').fill('60')
    await expect.poll(() => panelOpacity(context)).toBeCloseTo(0.6, 2)
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('modal-card')).toHaveCount(0)
    await expect.poll(() => panelOpacity(context)).toBeCloseTo(0.6, 2)
    await expect.poll(() => savedPref(context, 'opacity')).toBeCloseTo(0.6, 2)
  } finally {
    await closeApp(context)
  }
})

test('the sliders say what they do: opacity 100% is solid, animation duration 100% is the standard', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await page.getByTestId('open-settings').click()
    const card = page.getByTestId('modal-card')

    await expect(page.getByLabel('不透明度')).toHaveValue('100')
    await expect(page.getByLabel('动效时长')).toHaveValue('100')
    await expect(card).toContainText('100% 为完全不透明')
    await expect(card).toContainText('数值越小动画越快')
    await expect(page.getByTestId('settings-preview-note')).toContainText(
      '立刻预览'
    )
    // The size setting is not called a font size, because the dialogs do not follow it.
    await expect(card).toContainText('界面大小')
    await expect(card).toContainText('弹窗和搜索保持原大小')

    // 80% of the standard duration is stored on the old scale: 0.8 x 1.35.
    await page.getByLabel('动效时长').fill('80')
    await page.getByTestId('settings-save').click()
    await expect(card).toHaveCount(0)
    await expect.poll(() => savedPref(context, 'motion')).toBeCloseTo(1.08, 2)
    await page.getByTestId('open-settings').click()
    await expect(page.getByLabel('动效时长')).toHaveValue('80')
  } finally {
    await closeApp(context)
  }
})

test('the pin switch is immediate: it takes effect at once, says so, and Cancel does not undo it', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    await expect(page.getByTestId('toggle-pin')).toHaveAttribute(
      'aria-pressed',
      'false'
    )

    await page.getByTestId('open-settings').click()
    await page.getByTestId('settings-tab-behavior').click()
    await expect(page.getByTestId('modal-card')).toContainText('立即生效')
    await page.getByTestId('pin-panel').click()
    // The title bar button follows without Save.
    await expect(page.getByTestId('toggle-pin')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByTestId('modal-card')).toHaveCount(0)

    await expect(page.getByTestId('toggle-pin')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  } finally {
    await closeApp(context)
  }
})
