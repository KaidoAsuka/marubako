import { test, expect } from '@playwright/test'

import { closeApp, launchApp } from './test-utils'

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
