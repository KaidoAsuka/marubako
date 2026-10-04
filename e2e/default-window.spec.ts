// layout-1 / 默认窗口: a new installation opens slender, about 400 x 720 in Chinese, and a window the
// user has sized is left alone.
import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { DEFAULT_PANEL_WIDTH } from '../src/shared/layout-widths'
import {
  createDefaultAppData,
  closeApp,
  launchApp,
  type AppContext,
} from './test-utils'

async function profileWith(
  mutate: (data: ReturnType<typeof createDefaultAppData>) => void
): Promise<string> {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-default-'))
  const data = createDefaultAppData()
  mutate(data)
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )

  return userDataDir
}

async function panelGeometry(context: AppContext) {
  return context.electronApp.evaluate(({ BrowserWindow, screen }) => {
    const panel = BrowserWindow.getAllWindows().find((window) =>
      window.isResizable()
    )!
    const bounds = panel.getBounds()
    const area = screen.getDisplayMatching(bounds).workArea

    return { bounds, area }
  })
}

test('a new installation opens slender and centred, in the stacked layout with every name whole', async () => {
  const context = await launchApp()
  try {
    const { bounds, area } = await panelGeometry(context)

    expect(Math.abs(bounds.width - 400)).toBeLessThanOrEqual(2)
    // 720, or what the screen leaves after the 12px margins.
    expect(bounds.height).toBe(Math.min(720, area.height - 24))
    expect(bounds.width).toBeLessThan(bounds.height)
    expect(
      Math.abs(
        bounds.x - (area.x + Math.round((area.width - bounds.width) / 2))
      )
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(
        bounds.y - (area.y + Math.round((area.height - bounds.height) / 2))
      )
    ).toBeLessThanOrEqual(1)

    const { page } = context
    await expect(page.locator('.workspace-nav')).toHaveAttribute(
      'data-tab-mode',
      'stacked'
    )
    const names = await page
      .locator('.tab-label')
      .evaluateAll((labels) =>
        labels.map((label) => [
          label.textContent,
          label.scrollWidth <= label.clientWidth,
        ])
      )
    expect(names).toHaveLength(7)
    for (const [text, whole] of names) expect(whole, `${text}`).toBe(true)
    // Two tile columns in the slender window.
    const columns = await page
      .getByTestId('section-folders')
      .evaluate((section) => {
        const left = new Set(
          Array.from(section.querySelectorAll('.folder-widget')).map((card) =>
            Math.round(card.getBoundingClientRect().left)
          )
        )

        return left.size
      })
    expect(columns).toBe(2)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
  } finally {
    await closeApp(context)
  }
})

for (const lang of ['ja', 'en'] as const) {
  test(`a new installation in ${lang} opens at the width its names need`, async () => {
    const userDataDir = await profileWith((data) => {
      data.prefs.lang = lang
    })
    const context = await launchApp(userDataDir)
    try {
      const { bounds } = await panelGeometry(context)

      // A window is sized in device pixels, so on a scaled display it can come out a pixel or two off.
      expect(
        Math.abs(bounds.width - DEFAULT_PANEL_WIDTH[lang])
      ).toBeLessThanOrEqual(2)
      const names = await context.page
        .locator('.tab-label')
        .evaluateAll((labels) =>
          labels.map((label) => label.scrollWidth <= label.clientWidth)
        )
      expect(names).toEqual(new Array(7).fill(true))
    } finally {
      await closeApp(context)
    }
  })
}

test('a window the user has sized keeps its size and position', async () => {
  const saved = { x: 120, y: 60, w: 760, h: 640 }
  const userDataDir = await profileWith((data) => {
    data.window.bounds = saved
    data.window.preCollapseHeight = 640
  })
  const context = await launchApp(userDataDir)
  try {
    const { bounds, area } = await panelGeometry(context)

    expect(bounds.width).toBe(saved.w)
    expect(bounds.height).toBe(Math.min(saved.h, area.height - 24))
    await expect(context.page.locator('.workspace-nav')).toHaveAttribute(
      'data-tab-mode',
      'row'
    )
  } finally {
    await closeApp(context)
  }
})
