// 3.1.1: the size of the floating ball and the font of the interface are settings, and the data
// can be written as a list a person reads (Markdown).
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

import {
  DOCK_BALL_SIZE,
  DOCK_SIZE,
  dockWindowSize,
} from '../src/shared/dock-size'
import {
  closeApp,
  createDefaultAppData,
  launchApp,
  type AppContext,
} from './test-utils'

async function windows(context: AppContext) {
  return context.electronApp.evaluate(({ BrowserWindow, screen }) => {
    const all = BrowserWindow.getAllWindows()
    const panel = all.find((window) => window.isResizable())!
    const ball = all.find((window) => !window.isResizable())
    return {
      panel: panel.getBounds(),
      panelVisible: panel.isVisible(),
      ball: ball?.getBounds(),
      ballVisible: ball?.isVisible() ?? false,
      area: screen.getDisplayMatching(panel.getBounds()).workArea,
    }
  })
}

async function ballPage(context: AppContext): Promise<Page> {
  await expect
    .poll(() => context.electronApp.windows().length)
    .toBeGreaterThanOrEqual(2)
  const ball = context.electronApp
    .windows()
    .find((page) => page !== context.page)!
  await expect(ball.getByTestId('dock-bubble')).toBeVisible()
  return ball
}

async function savedPrefs(
  context: AppContext
): Promise<Record<string, unknown>> {
  const raw = JSON.parse(
    await fs.readFile(
      path.join(context.userDataDir, 'quicklaunch-data.json'),
      'utf8'
    )
  )
  return (raw.data ?? raw).prefs
}

/** Collapses the panel into the ball and drags nothing: the ball is where the app puts it. */
async function collapse(context: AppContext): Promise<Page> {
  await context.page.getByTestId('dock-panel').click()
  const ball = await ballPage(context)
  await expect
    .poll(async () => (await windows(context)).panelVisible)
    .toBe(false)
  return ball
}

async function openSettings(page: Page, tab?: 'behavior' | 'data') {
  await page.getByTestId('open-settings').click()
  if (tab) await page.getByTestId(`settings-tab-${tab}`).click()
}

test('the ball takes the size set in the settings at once, keeps its centre, and keeps the size after a restart', async () => {
  let context = await launchApp()
  const userDataDir = context.userDataDir
  try {
    const ball = await collapse(context)
    const before = (await windows(context)).ball!
    expect(before.width).toBe(DOCK_SIZE)
    await expect(ball.getByTestId('dock-bubble')).toHaveCSS(
      'width',
      `${DOCK_BALL_SIZE}px`
    )

    await ball.getByTestId('dock-bubble').dblclick()
    await expect
      .poll(async () => (await windows(context)).panelVisible)
      .toBe(true)
    await openSettings(context.page, 'behavior')
    await context.page.getByTestId('ball-size').fill('48')
    await expect(context.page.getByTestId('ball-size')).toHaveValue('48')
    // Nothing changes before Save.
    expect((await windows(context)).ball!.width).toBe(DOCK_SIZE)
    await context.page.getByTestId('settings-save').click()

    const size = dockWindowSize(48)
    // A window that does not start on a whole screen pixel reports a pixel more than it was given
    // (a display scale of 125%), at any size of the ball.
    const nearly = (value: number) => Math.abs(value - size) <= 1
    await expect
      .poll(async () => nearly((await windows(context)).ball!.width))
      .toBe(true)
    const after = (await windows(context)).ball!
    // The same centre: the ball moves in steps of four pixels, so to within two (and that pixel).
    expect(
      Math.abs(after.x + size / 2 - (before.x + DOCK_SIZE / 2))
    ).toBeLessThanOrEqual(3)
    expect(
      Math.abs(after.y + size / 2 - (before.y + DOCK_SIZE / 2))
    ).toBeLessThanOrEqual(3)
    await expect(ball.getByTestId('dock-bubble')).toHaveCSS('width', '48px')
    // The white dot grows with the ball: 8px in a ball of 30px.
    expect(
      await ball
        .locator('.dock-bubble-dot')
        .evaluate((dot) => (dot as HTMLElement).offsetWidth)
    ).toBe(Math.round((48 * 8) / 30))
    // The data file is written a moment after the dialog has closed.
    await expect.poll(async () => (await savedPrefs(context)).ballSize).toBe(48)

    await closeApp(context, { cleanup: false })
    context = await launchApp(userDataDir)
    const restarted = await collapse(context)
    expect(nearly((await windows(context)).ball!.width)).toBe(true)
    await expect(restarted.getByTestId('dock-bubble')).toHaveCSS(
      'width',
      '48px'
    )
  } finally {
    await closeApp(context)
  }
})

/** Launches the app as a first start: the ball docked to the right edge, the panel beside it. */
async function launchNew(): Promise<AppContext> {
  const keys = ['QUICKLAUNCH_LOCALE', 'QUICKLAUNCH_FIRST_RUN'] as const
  const saved = keys.map((key) => process.env[key])
  process.env.QUICKLAUNCH_LOCALE = 'zh-CN'
  process.env.QUICKLAUNCH_FIRST_RUN = '1'
  try {
    return await launchApp()
  } finally {
    keys.forEach((key, index) => {
      const value = saved[index]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    })
  }
}

test('a ball docked to the right edge stays flush against it at another size, and the panel beside it stays beside it', async () => {
  const context = await launchNew()
  try {
    await ballPage(context)
    await expect
      .poll(async () => (await windows(context)).ballVisible)
      .toBe(true)
    const before = await windows(context)
    const rightEdge = before.area.x + before.area.width
    expect(
      Math.abs(before.ball!.x + DOCK_SIZE + 4 - rightEdge)
    ).toBeLessThanOrEqual(1)

    for (const ballSize of [64, 24]) {
      await openSettings(context.page, 'behavior')
      await context.page.getByTestId('ball-size').fill(String(ballSize))
      await context.page.getByTestId('settings-save').click()

      const size = dockWindowSize(ballSize)
      await expect
        .poll(async () => (await windows(context)).ball!.width)
        .toBe(size)
      const after = await windows(context)
      // Flush against the edge, with the margin it always had.
      expect(
        Math.abs(after.ball!.x + size + 4 - rightEdge),
        `ball of ${ballSize}px at the edge`
      ).toBeLessThanOrEqual(1)
      // The panel stands beside the ball, the usual gap apart, and nothing overlaps.
      expect(
        Math.abs(after.panel.x + after.panel.width + 8 - after.ball!.x),
        `panel beside a ball of ${ballSize}px`
      ).toBeLessThanOrEqual(2)
      expect(after.panel.width).toBe(before.panel.width)
      expect(after.panel.height).toBe(before.panel.height)
    }
  } finally {
    await closeApp(context)
  }
})

test('a chosen font is shown while the dialog is open, put back on cancel and kept on save', async () => {
  const context = await launchApp()
  try {
    const { page } = context
    const userFont = () =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--font-user')
      )
    const bodyFont = () =>
      page.evaluate(() => getComputedStyle(document.body).fontFamily)
    const defaultFont = await bodyFont()
    expect(await userFont()).toBe('')

    await openSettings(page)
    const select = page.getByTestId('settings-font-family')
    // The fonts of this PC are listed; Segoe UI is on every Windows.
    await expect(
      select.locator('option', { hasText: /^Segoe UI$/ })
    ).toHaveCount(1)
    await select.selectOption('Segoe UI')
    await expect.poll(userFont).toBe('"Segoe UI"')
    expect(await bodyFont()).toMatch(/^"Segoe UI", /)

    await page.getByRole('button', { name: '取消' }).click()
    await expect.poll(userFont).toBe('')
    expect(await bodyFont()).toBe(defaultFont)
    expect((await savedPrefs(context)).fontFamily ?? '').toBe('')

    await openSettings(page)
    await page.getByTestId('settings-font-family').selectOption('Segoe UI')
    await page.getByTestId('settings-save').click()
    await expect
      .poll(() => savedPrefs(context))
      .toMatchObject({
        fontFamily: 'Segoe UI',
      })
    expect(await userFont()).toBe('"Segoe UI"')
    // Code keeps its monospace font.
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--mono')
      )
    ).not.toContain('Segoe UI')
  } finally {
    await closeApp(context)
  }
})

test('"Export as Markdown" writes a list that reads in Notepad, without the passwords unless asked', async () => {
  const data = createDefaultAppData('zh')
  // Only the one made-up account below: the sample account of a new installation is taken out.
  data.passwords = []
  data.loose.passwords = [
    {
      id: 'p-1',
      kind: 'password',
      name: '测试服务器',
      icon: '',
      username: 'qa@example.test',
      password: 'made-up-secret',
      note: '',
    },
  ]
  data.topOrder.passwords = [{ type: 'loose', id: 'p-1' }]
  const context = await launchApp()
  const userDataDir = context.userDataDir
  await closeApp(context, { cleanup: false })
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data)
  )
  const second = await launchApp(userDataDir)
  const target = path.join(userDataDir, 'list.md')
  try {
    // The two system dialogs answer by themselves: the save dialog names the file, the question
    // about passwords gets the answer of its default button first, then "with passwords".
    const answer = (response: number) =>
      second.electronApp.evaluate(
        ({ dialog }, { file, response }) => {
          const stub = dialog as unknown as {
            showSaveDialog: () => Promise<unknown>
            showMessageBox: () => Promise<unknown>
          }
          stub.showSaveDialog = async () => ({
            canceled: false,
            filePath: file,
          })
          stub.showMessageBox = async () => ({
            response,
            checkboxChecked: false,
          })
        },
        { file: target, response }
      )

    await answer(0)
    await openSettings(second.page, 'data')
    await expect(second.page.getByTestId('settings-data-help')).toContainText(
      '导出为 Markdown：给人看的清单'
    )
    await second.page.getByTestId('settings-export-markdown').click()
    await expect
      .poll(() => fs.readFile(target, 'utf8').catch(() => ''))
      .toContain('# Marubako 数据清单')
    const without = await fs.readFile(target, 'utf8')
    expect(without.charCodeAt(0)).toBe(0xfeff)
    expect(without).toContain('\r\n## 密码 (1)\r\n')
    expect(without).toContain('- **测试服务器**')
    expect(without).toContain('密码: （未导出）')
    expect(without).not.toContain('made-up-secret')
    expect(without).toContain('这个文件不含密码。')

    await answer(1)
    await second.page.getByTestId('settings-export-markdown').click()
    await expect
      .poll(() => fs.readFile(target, 'utf8'))
      .toContain('密码: `made-up-secret`')
    expect(await fs.readFile(target, 'utf8')).toContain(
      '注意：这个文件里有明文密码'
    )
  } finally {
    await closeApp(second)
  }
})
