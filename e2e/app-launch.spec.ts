import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { closeApp, launchApp, startApp } from './test-utils'

// How long the app's process may take to end by itself. Half a second is usual. closeApp ends a
// process that is still there after 15 s without failing the test, so the time has to be looked at.
const END_TIMEOUT_MS = 10_000

function readLog(userDataDir: string): Promise<string> {
  return fs.readFile(path.join(userDataDir, 'logs', 'main.log'), 'utf8')
}

test('launches the desktop app shell', async () => {
  const context = await launchApp()

  try {
    await expect(context.page.getByTestId('app-root')).toBeVisible()
    await expect(context.page.getByTestId('tab-folders')).toHaveClass(/active/)
    await expect(context.page.getByTestId('tab-tasks')).not.toHaveClass(
      /active/
    )
  } finally {
    await closeApp(context)
  }
})

test('puts two bars above the content: the window row, then the category row', async () => {
  const context = await launchApp()

  try {
    const { page } = context
    // No logo and no product name in the window row; the collapse button is on the right.
    await expect(page.getByText('Marubako')).toHaveCount(0)
    await expect(page.locator('.titlebar-brand')).toHaveCount(0)
    await expect(page.getByTestId('dock-panel')).toBeVisible()
    await expect(page.getByTestId('open-command')).toBeVisible()
    // Nothing is fixed above the content but the two bars.
    const geometry = await page.evaluate(() => {
      const box = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect()
      const bar = box('.titlebar')
      const row = box('.workspace-nav')
      const content = box('.workspace-content')

      return {
        barHeight: bar.height,
        rowTop: row.top,
        barBottom: bar.bottom,
        rowBottom: row.bottom,
        contentTop: content.top,
      }
    })
    expect(geometry.barHeight).toBe(36)
    expect(geometry.rowTop).toBeCloseTo(geometry.barBottom, 0)
    expect(geometry.contentTop).toBeCloseTo(geometry.rowBottom, 0)
    // 36 + 52 (the stacked category row of the default window) plus the 2px of window edge.
    expect(geometry.contentTop).toBeLessThanOrEqual(36 + 52 + 3)
    // There is no title row, no filter box and no per-page add button inside the page.
    await expect(page.locator('.section-toolbar, .search-box')).toHaveCount(0)
    await expect(
      page.getByTestId('section-folders').getByTestId('add-loose-item-folders')
    ).toHaveCount(0)
    // The page keeps a heading for screen readers, drawn as nothing.
    const heading = page
      .getByTestId('section-folders')
      .getByRole('heading', { level: 1 })
    await expect(heading).toHaveCount(1)
    const drawn = await heading.evaluate((node) => {
      const rect = node.getBoundingClientRect()

      return { width: rect.width, height: rect.height }
    })
    expect(drawn.width).toBeLessThanOrEqual(1)
    expect(drawn.height).toBeLessThanOrEqual(1)
  } finally {
    await closeApp(context)
  }
})

test('quits when it is asked to while the panel is still loading', async () => {
  const context = await startApp()

  try {
    // The panel's window is there; its page has not finished loading.
    await context.electronApp.firstWindow()
    const asked = Date.now()
    await closeApp(context, { cleanup: false })
    const elapsed = Date.now() - asked

    // Closing the window ends its load, which fails the start-up it was part of. That is no failure
    // to start: reported as one, it left the program waiting in an error box nobody could close.
    expect(await readLog(context.userDataDir)).not.toContain(
      'Failed to start Marubako'
    )
    expect(elapsed).toBeLessThan(END_TIMEOUT_MS)
  } finally {
    // Also ends an app that was never asked to quit, because the test stopped before that.
    await closeApp(context)
  }
})

test('a start that fails under test ends the program instead of waiting in an error box', async () => {
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'marubako-no-start-')
  )
  // A data file that cannot be read is never replaced: the app does not start. A folder of that
  // name is such a file.
  await fs.mkdir(path.join(userDataDir, 'quicklaunch-data.json'))
  const context = await startApp(userDataDir)
  // Asked for now: Playwright forgets the process as soon as it has ended.
  const appProcess = context.electronApp.process()

  try {
    await expect
      .poll(() => appProcess.exitCode, { timeout: END_TIMEOUT_MS })
      .not.toBeNull()
    expect(await readLog(userDataDir)).toContain('Failed to start Marubako')
  } finally {
    await closeApp(context)
  }
})
