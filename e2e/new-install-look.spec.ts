// What a new installation looks like and how the ball and the panel keep together. The other specs
// run with the look they were written against (dark, violet, a grid; first-run.ts in the main
// process); these opt in to the real first start with QUICKLAUNCH_FIRST_RUN=1.
import { test, expect } from '@playwright/test'

import { STACKED_MIN_WIDTH } from '../src/shared/layout-widths'
import { closeApp, launchApp, type AppContext } from './test-utils'

/** Launches the app as a first start on a computer that reports `locale`. */
async function launchNew(locale: string): Promise<AppContext> {
  const keys = ['QUICKLAUNCH_LOCALE', 'QUICKLAUNCH_FIRST_RUN'] as const
  const saved = keys.map((key) => process.env[key])
  process.env.QUICKLAUNCH_LOCALE = locale
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

type Rect = { x: number; y: number; width: number; height: number }

/** The bounds of the panel and of the ball, as the main process has them. */
async function pair(
  context: AppContext
): Promise<{ panel: Rect; ball: Rect; ballVisible: boolean }> {
  return context.electronApp.evaluate(({ BrowserWindow }) => {
    const all = BrowserWindow.getAllWindows()
    const panel = all.find((window) => window.isResizable())!
    const ball = all.find((window) => !window.isResizable())!
    return {
      panel: panel.getBounds(),
      ball: ball.getBounds(),
      ballVisible: ball.isVisible(),
    }
  })
}

/** The ball is on screen and has finished appearing (a ball that is still arriving cannot be dragged). */
async function ballIsShown(context: AppContext): Promise<void> {
  await expect
    .poll(async () => {
      try {
        return (await pair(context)).ballVisible
      } catch {
        return false
      }
    })
    .toBe(true)
  const bubble = context.electronApp
    .windows()
    .find((window) => window !== context.page)!
  await expect
    .poll(() =>
      bubble.evaluate(
        () => document.getElementById('root')?.dataset.presentation ?? ''
      )
    )
    .toBe('')
  // The main process ends the transition a moment after the ball has said it is done.
  await context.page.waitForTimeout(150)
}

test('a new installation is light, graphite and a list, with samples in every category', async () => {
  const context = await launchNew('ja-JP')
  const { page } = context
  try {
    await expect(page.locator('html')).toHaveClass(/theme-light/)
    await expect(page.getByTestId('app-root')).toHaveAttribute(
      'data-background',
      'minimal'
    )
    const loaded = await page.evaluate(() => window.quickLaunch.loadData())
    expect(loaded.ok && loaded.data.prefs).toMatchObject({
      lang: 'ja',
      theme: 'light',
      background: 'minimal',
      viewMode: 'list',
      shortcut: 'CommandOrControl+Shift+Space',
    })

    // A Japanese first start has the English sample words, in a list.
    const folders = page.getByTestId('section-folders')
    await expect(folders.locator('.group-card')).toHaveCount(2)
    await expect(folders).toContainText('Work files')
    await expect(folders).toContainText('Desktop')
    await expect(folders.locator('.grid-item')).toHaveCount(0)

    await page.getByTestId('tab-apps').click()
    const apps = page.getByTestId('section-apps')
    await expect(apps).toContainText('Terminals')
    await expect(apps).toContainText('PowerShell')
    await expect(apps).toContainText('Command Prompt')

    await page.getByTestId('tab-passwords').click()
    await expect(page.getByTestId('section-passwords')).toContainText(
      'Example account'
    )
    await expect(page.getByTestId('section-passwords')).toContainText(
      'you@example.com'
    )
    // The sample password is masked like any other.
    await expect(page.getByTestId('section-passwords')).not.toContainText(
      'example-password'
    )

    await page.getByTestId('tab-commands').click()
    await expect(page.getByTestId('section-commands')).toContainText(
      'Flush the DNS cache'
    )
    await expect(page.getByTestId('section-commands')).toContainText(
      'ipconfig /flushdns'
    )
  } finally {
    await closeApp(context)
  }
})

test('the button beside "new group" switches between list and grid and saves the choice', async () => {
  const context = await launchNew('en-US')
  const { page } = context
  try {
    const toggle = page.getByTestId('toggle-view-mode')
    await expect(toggle).toHaveAttribute('data-view-mode', 'list')
    await expect(toggle).toHaveAttribute('aria-label', 'Show as grid')
    await toggle.click()
    await expect(toggle).toHaveAttribute('data-view-mode', 'grid')
    await expect(toggle).toHaveAttribute('aria-label', 'Show as list')
    await expect(
      page.getByTestId('section-folders').locator('.folder-widget').first()
    ).toBeVisible()
    await expect
      .poll(async () => {
        const data = await page.evaluate(() => window.quickLaunch.loadData())
        return data.ok && data.data.prefs.viewMode
      })
      .toBe('grid')
    // The same setting is in the dialog, and the pages without a grid have no button.
    await page.getByTestId('tab-notes').click()
    await expect(page.getByTestId('toggle-view-mode')).toHaveCount(0)
    await page.getByTestId('tab-websites').click()
    await page.getByTestId('toggle-view-mode').click()
    await expect(page.getByTestId('toggle-view-mode')).toHaveAttribute(
      'data-view-mode',
      'list'
    )
    await expect(
      page.getByTestId('section-websites').locator('.group-card').first()
    ).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('the theme can follow Windows, and Monokai changes the whole palette', async () => {
  const context = await launchNew('en-US')
  const { page } = context
  try {
    await page.getByTestId('open-settings').click()
    await expect(page.getByTestId('theme-light')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await page.getByTestId('theme-system').click()
    await page.getByTestId('background-monokai').click()
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('modal-settings')).toHaveCount(0)

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveClass(/theme-dark/)
    const root = page.getByTestId('app-root')
    await expect(root).toHaveAttribute('data-background', 'monokai')
    // Charcoal canvas, and the yellow primary button of a dialog carries a dark label.
    await expect(page.locator('.app-shell')).toHaveCSS(
      'background-color',
      'rgb(45, 42, 46)'
    )
    await page.getByTestId('open-settings').click()
    const save = page.getByTestId('settings-save')
    await expect(save).toHaveCSS('background-color', 'rgb(255, 216, 102)')
    await expect(save).toHaveCSS('color', 'rgb(45, 42, 46)')

    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveClass(/theme-light/)
    await expect(page.locator('.app-shell')).toHaveCSS(
      'background-color',
      'rgb(250, 244, 242)'
    )
    await expect(save).toHaveCSS('background-color', 'rgb(242, 189, 58)')
    await expect(save).toHaveCSS('color', 'rgb(41, 36, 42)')
  } finally {
    await closeApp(context)
  }
})

test('another language widens the window when its category names would not fit', async () => {
  const context = await launchNew('ja-JP')
  const { page } = context
  try {
    await ballIsShown(context)
    const nav = page.locator('.workspace-nav')
    await expect(nav).toHaveAttribute('data-tab-mode', 'stacked')
    const before = await pair(context)
    expect(before.panel.width).toBeLessThan(STACKED_MIN_WIDTH.en)

    await page.getByTestId('open-settings').click()
    await page.getByTestId('settings-tab-data').click()
    await page.locator('#settings-language').selectOption('en')
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('modal-settings')).toHaveCount(0)

    await expect(nav).toHaveAttribute('data-tab-mode', 'stacked')
    await expect(page.locator('.tab-label').first()).toBeVisible()
    const after = await pair(context)
    expect(after.panel.width).toBeGreaterThanOrEqual(STACKED_MIN_WIDTH.en)
    // The ball is to the right of the panel: the panel grew to the left, away from it.
    expect(
      Math.abs(
        after.panel.x +
          after.panel.width -
          (before.panel.x + before.panel.width)
      )
    ).toBeLessThanOrEqual(2)
    expect(after.ball.x).toBe(before.ball.x)
  } finally {
    await closeApp(context)
  }
})

test('a category page slides in from the side its tab is on, and the first page does not move', async () => {
  const context = await launchNew('en-US')
  const { page } = context
  try {
    const first = page.getByTestId('section-folders')
    await expect(first).toBeVisible()
    expect(await first.getAttribute('data-enter')).toBeNull()
    expect(
      await first.evaluate((node) => getComputedStyle(node).animationName)
    ).toBe('none')

    await page.getByTestId('tab-commands').click()
    const commands = page.getByTestId('section-commands')
    await expect(commands).toHaveAttribute('data-enter', 'forward')
    await expect(commands).toHaveCSS('animation-name', 'pageInForward')
    // An open group is part of the page: it does not unfold on its own.
    await expect(commands.locator('.group-card-body').first()).toHaveCSS(
      'animation-name',
      'none'
    )

    await page.getByTestId('tab-websites').click()
    const websites = page.getByTestId('section-websites')
    await expect(websites).toHaveAttribute('data-enter', 'backward')
    await expect(websites).toHaveCSS('animation-name', 'pageInBackward')
    // Once the page has arrived nothing is left on it that would move a dragged card.
    await expect
      .poll(() =>
        websites.evaluate((node) =>
          node.getAnimations().length === 0
            ? getComputedStyle(node).transform
            : 'running'
        )
      )
      .toBe('none')

    // A group the user opens does unfold.
    const closed = websites.locator('.group-card:not(.open)').first()
    await closed.locator('.group-card-header').click()
    await expect(
      websites.locator('.group-card-body[data-unfold]').first()
    ).toHaveCSS('animation-name', 'expandIn')
  } finally {
    await closeApp(context)
  }
})

test('the ball follows a dragged panel step by step, and the panel reopens where it stood', async () => {
  const context = await launchNew('en-US')
  const { page } = context
  try {
    await ballIsShown(context)
    const start = await pair(context)
    // A title-bar drag as Windows reports it: will-move before every step, moved at the end.
    const steps = await context.electronApp.evaluate(({ BrowserWindow }) => {
      const all = BrowserWindow.getAllWindows()
      const panel = all.find((window) => window.isResizable())!
      const ball = all.find((window) => !window.isResizable())!
      const origin = panel.getBounds()
      const seen: Array<{ x: number; y: number }> = []
      for (let step = 1; step <= 3; step++) {
        panel.emit('will-move', { preventDefault() {} }, panel.getBounds())
        panel.setBounds({
          ...origin,
          x: origin.x - 60 * step,
          y: origin.y + 15 * step,
        })
        const now = ball.getBounds()
        seen.push({ x: now.x, y: now.y })
      }
      panel.emit('moved')
      return seen
    })
    steps.forEach((ball, index) => {
      expect(
        Math.abs(ball.x - (start.ball.x - 60 * (index + 1)))
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(ball.y - (start.ball.y + 15 * (index + 1)))
      ).toBeLessThanOrEqual(1)
    })
    const dragged = await pair(context)
    expect(Math.abs(dragged.ball.x - (start.ball.x - 180))).toBeLessThanOrEqual(
      1
    )

    // Collapse and open again: the panel is back beside the ball, where it was.
    await page.getByTestId('dock-panel').click()
    await expect
      .poll(() =>
        context.electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())!
            .isVisible()
        )
      )
      .toBe(false)
    const bubble = context.electronApp
      .windows()
      .find((window) => window !== page)!
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect
      .poll(async () => {
        const now = await pair(context)
        return [
          Math.abs(now.panel.x - dragged.panel.x) <= 1,
          Math.abs(now.panel.y - dragged.panel.y) <= 1,
        ]
      })
      .toEqual([true, true])
  } finally {
    await closeApp(context)
  }
})

test('the open panel travels with a dragged ball and keeps its place beside it', async () => {
  const context = await launchNew('en-US')
  const { page } = context
  try {
    await ballIsShown(context)
    // Away from the edge first, so that the pair has room on every side.
    await context.electronApp.evaluate(({ BrowserWindow }) => {
      const panel = BrowserWindow.getAllWindows().find((window) =>
        window.isResizable()
      )!
      const origin = panel.getBounds()
      panel.emit('will-move', { preventDefault() {} }, origin)
      panel.setBounds({ ...origin, x: origin.x - 300 })
      panel.emit('moved')
    })
    const start = await pair(context)
    const bubble = context.electronApp
      .windows()
      .find((window) => window !== page)!
    const from = { x: start.ball.x + 20, y: start.ball.y + 20 }
    await bubble.evaluate(async (point) => {
      const api = window.quickLaunch.window
      await api.dragDock({ phase: 'start', x: point.x, y: point.y })
      await api.dragDock({
        phase: 'move',
        x: point.x - 120,
        y: point.y + 40,
      })
    }, from)
    const during = await pair(context)
    expect(Math.abs(during.ball.x - (start.ball.x - 120))).toBeLessThanOrEqual(
      1
    )
    expect(
      Math.abs(during.panel.x - (start.panel.x - 120))
    ).toBeLessThanOrEqual(1)
    expect(Math.abs(during.panel.y - (start.panel.y + 40))).toBeLessThanOrEqual(
      1
    )

    await bubble.evaluate(async (point) => {
      await window.quickLaunch.window.dragDock({
        phase: 'end',
        x: point.x - 120,
        y: point.y + 40,
      })
    }, from)
    const ended = await pair(context)
    expect(Math.abs(ended.panel.x - (start.panel.x - 120))).toBeLessThanOrEqual(
      1
    )
    expect(Math.abs(ended.panel.y - (start.panel.y + 40))).toBeLessThanOrEqual(
      1
    )
    // The panel is no wider for having been moved.
    expect(Math.abs(ended.panel.width - start.panel.width)).toBeLessThanOrEqual(
      1
    )
  } finally {
    await closeApp(context)
  }
})
