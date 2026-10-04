import { test, expect, type Locator } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createDefaultAppData } from '../src/shared/default-data'
import { closeApp, launchApp } from './test-utils'

async function expectActionsAtTheRight(card: Locator, actionsSelector: string) {
  const content = card.locator('.widget-label, .grid-copy')
  await expect
    .poll(() =>
      card.evaluate((node) => {
        const box = node.getBoundingClientRect()
        const label = node
          .querySelector('.widget-label, .grid-copy')!
          .getBoundingClientRect()
        const icon = node
          .querySelector('.widget-box, .widget-loose-box, .grid-ico')!
          .getBoundingClientRect()
        const centerY = box.y + box.height / 2
        return Math.max(
          Math.abs(label.y + label.height / 2 - centerY),
          Math.abs(icon.y + icon.height / 2 - centerY)
        )
      })
    )
    .toBeLessThanOrEqual(1)
  const cardBox = (await card.boundingBox())!
  const before = (await content.boundingBox())!
  const name = card.locator('.widget-name, .grid-name')
  const nameBefore = (await name.boundingBox())!
  await card.hover()
  const actions = card.locator(actionsSelector)
  await expect(actions).toHaveCSS('opacity', '1')
  const after = (await content.boundingBox())!
  expect(after.y).toBe(before.y)
  expect(after.height).toBe(before.height)
  const actionsBox = (await actions.boundingBox())!
  // Centred on the 44px tile, and on its right edge.
  expect(cardBox.height).toBe(44)
  expect(
    Math.abs(
      actionsBox.y + actionsBox.height / 2 - (cardBox.y + cardBox.height / 2)
    )
  ).toBeLessThanOrEqual(1)
  expect(
    cardBox.x + cardBox.width - actionsBox.x - actionsBox.width
  ).toBeLessThan(9)
  // The name does not make room for the buttons (that re-truncated it on every hover). It keeps its
  // width and the group, drawn in the colour of the hovered card, covers the tail of it instead.
  const nameAfter = (await name.boundingBox())!
  expect(nameAfter.width).toBe(nameBefore.width)
  expect(nameAfter.x).toBe(nameBefore.x)
  await expect
    .poll(() =>
      actions.evaluate((node) => {
        const card = node.closest('.folder-widget, .widget-loose, .grid-item')!

        return (
          getComputedStyle(node).backgroundColor ===
          getComputedStyle(card).backgroundColor
        )
      })
    )
    .toBe(true)
}

test('folder cards share action placement and preview paths and websites', async () => {
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'marubako-folder-cards-')
  )
  const data = createDefaultAppData()
  data.folders[0]!.name = 'Shared documents'
  data.folders[0]!.items[1]!.path = 'C:\\Work\\Documents'
  data.loose.folders.push({
    id: 'loose-projects',
    kind: 'folder',
    name: '项目工作目录',
    path: 'C:\\Work\\Projects\\Marubako',
    icon: '📁',
  })
  data.topOrder.folders.push({ type: 'loose', id: 'loose-projects' })
  data.loose.websites.push({
    id: 'loose-docs',
    kind: 'website',
    name: '项目文档',
    url: 'https://docs.example.com/marubako/getting-started',
    icon: '📖',
  })
  data.topOrder.websites.push({ type: 'loose', id: 'loose-docs' })
  data.apps.push({
    id: 'grp-apps-tools',
    name: '开发工具',
    icon: '🧰',
    open: true,
    items: [
      {
        id: 'app-editor',
        kind: 'app',
        name: '编辑器',
        path: 'C:\\Tools\\Editor.exe',
        icon: '⚙️',
      },
    ],
  })
  data.topOrder.apps.push({ type: 'group', id: 'grp-apps-tools' })
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )
  const context = await launchApp(userDataDir)
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const folder = page.getByTestId('folder-widget-grp-folders-work')
    const loose = page.getByTestId('loose-widget-loose-projects')
    await expectActionsAtTheRight(folder, '.widget-actions')
    await expectActionsAtTheRight(loose, '.widget-actions')
    // A tile is one line: the path is in its tooltip and its accessible name, not drawn.
    await expect(loose.locator('.widget-detail')).toHaveCount(0)
    await expect(loose).toHaveAttribute(
      'title',
      '项目工作目录\nC:\\Work\\Projects\\Marubako'
    )
    await expect(loose).toHaveAttribute(
      'aria-label',
      '项目工作目录, C:\\Work\\Projects\\Marubako'
    )
    await expect(folder.locator('.widget-count')).toHaveText('2')
    await expect(folder).toHaveAttribute('title', 'Shared documents\n2 个条目')
    await page.screenshot({
      path: 'artifacts/folder-grid.png',
      animations: 'disabled',
    })
    await folder.click()
    const inner = page.getByTestId('grid-item-folder-documents')
    await expect(inner.locator('.grid-detail')).toHaveCount(0)
    await expect(inner).toHaveAttribute('title', '文档\nC:\\Work\\Documents')
    await expectActionsAtTheRight(inner, '.grid-actions')
    await page.screenshot({
      path: 'artifacts/folder-popup.png',
      animations: 'disabled',
    })
    await page.getByTestId('edit-item-folder-documents').click()
    await expect(page.getByTestId('item-name-input')).toHaveValue('文档')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.getByTestId('tab-websites').click()
    await expectActionsAtTheRight(
      page.getByTestId('folder-widget-grp-sites-tools'),
      '.widget-actions'
    )
    await expectActionsAtTheRight(
      page.getByTestId('loose-widget-loose-docs'),
      '.widget-actions'
    )
    await expect(page.getByTestId('loose-widget-loose-docs')).toHaveAttribute(
      'title',
      '项目文档\nhttps://docs.example.com/marubako/getting-started'
    )
    await page.getByTestId('folder-widget-grp-sites-tools').click()
    await expect(page.getByTestId('grid-item-site-github')).toHaveAttribute(
      'title',
      'GitHub\nhttps://github.com'
    )
    await page.keyboard.press('Escape')
    await page.getByTestId('tab-apps').click()
    await expectActionsAtTheRight(
      page.getByTestId('folder-widget-grp-apps-tools'),
      '.widget-actions'
    )
    await page.getByTestId('folder-widget-grp-apps-tools').click()
    await expectActionsAtTheRight(
      page.getByTestId('grid-item-app-editor'),
      '.grid-actions'
    )
    await page.keyboard.press('Escape')
    await page.getByTestId('open-settings').click()
    await page.getByTestId('theme-light').click()
    await page.getByTestId('settings-save').click()
    await page.getByTestId('tab-folders').click()
    await loose.hover()
    await page.screenshot({
      path: 'artifacts/folder-grid-light.png',
      animations: 'disabled',
    })
    await context.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())!
        .setSize(320, 700)
    )
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(320)
    await expectActionsAtTheRight(loose, '.widget-actions')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await folder.click()
    await expectActionsAtTheRight(inner, '.grid-actions')
    await page.screenshot({
      path: 'artifacts/folder-popup-compact.png',
      animations: 'disabled',
    })
  } finally {
    await closeApp(context)
  }
})

test('floating bubble preserves panel dimensions and zoom across queued visibility changes', async () => {
  const context = await launchApp()
  try {
    const { page, electronApp } = context
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())!
        .setSize(820, 600)
    )
    await page.evaluate(async () => {
      const result = await window.quickLaunch.loadData()
      if (!result.ok) throw new Error(result.error)
      result.data.prefs.zoom = 1.35
      await window.quickLaunch.saveData(result.data)
    })
    await page.reload()
    await expect(page.getByTestId('app-root')).toBeVisible()
    await page.getByTestId('dock-panel').click()
    await expect.poll(() => electronApp.windows().length).toBe(2)
    const bubble = electronApp.windows().find((window) => window !== page)!
    await expect(bubble.getByTestId('dock-bubble')).toBeVisible()
    expect(await bubble.evaluate(() => innerWidth)).toBe(56)
    await expect(bubble.getByTestId('dock-bubble')).toHaveCSS('width', '50px')
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect
      .poll(() =>
        electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())!
            .isVisible()
        )
      )
      .toBe(true)
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.isResizable())!
          .getSize()
      )
    ).toEqual([820, 600])
    const results = await page.evaluate(() =>
      Promise.all([
        window.quickLaunch.window.collapse(),
        window.quickLaunch.window.expand(),
        window.quickLaunch.window.collapse(),
        window.quickLaunch.window.expand(),
      ])
    )
    expect(results.every((result) => result.ok)).toBe(true)
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.isResizable())!
          .getSize()
      )
    ).toEqual([820, 600])
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.isResizable())!
          .isVisible()
      )
    ).toBe(true)
    const reverse = await page.evaluate(() =>
      Promise.all([
        window.quickLaunch.window.expand(),
        window.quickLaunch.window.collapse(),
      ])
    )
    expect(reverse.every((result) => result.ok)).toBe(true)
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.isResizable())!
          .isVisible()
      )
    ).toBe(false)
  } finally {
    await closeApp(context)
  }
})
test('loading animation remains visible while data is loading and respects reduced motion', async () => {
  const context = await launchApp()
  try {
    const saved = await context.page.evaluate(() =>
      window.quickLaunch.loadData()
    )
    await context.electronApp.evaluate(({ ipcMain }, saved) => {
      ipcMain.removeHandler('data-load')
      ipcMain.handle('data-load', async () => {
        await new Promise((resolve) => setTimeout(resolve, 2200))
        return saved
      })
    }, saved)
    await context.page.reload()
    const loading = context.page.getByTestId('loading-screen')
    await expect(loading).toBeVisible()
    await expect(loading.locator('.startup-logo')).toHaveJSProperty(
      'complete',
      true
    )
    expect(
      await loading
        .locator('.startup-logo')
        .evaluate((node) => getComputedStyle(node).animationName)
    ).toBe('startupLogoFloat')
    await context.page.screenshot({ path: 'artifacts/startup-animation.png' })
    await context.page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(loading.locator('.startup-logo')).toHaveCSS(
      'animation-name',
      'none'
    )
    await expect(context.page.getByTestId('app-root')).toBeVisible()
    await expect(loading).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})
