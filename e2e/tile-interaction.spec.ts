// layout-2: what the hover buttons, a press and a launch do on the 44px single-line tile, in a slender
// (400px) window where the tile is about 177px wide.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { test, expect, type Locator, type Page } from '@playwright/test'

import {
  createDefaultAppData,
  closeApp,
  launchApp,
  type AppContext,
} from './test-utils'

async function launchSlender(width = 400): Promise<AppContext> {
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'marubako-tile-ui-')
  )
  const data = createDefaultAppData()
  await fs.mkdir(path.join(userDataDir, 'exists'))
  data.loose.folders.push(
    {
      id: 'loose-open',
      kind: 'folder',
      name: '项目工作目录',
      path: path.join(userDataDir, 'exists'),
      icon: '📁',
    },
    {
      id: 'loose-missing',
      kind: 'folder',
      name: '不存在的目录',
      path: path.join(userDataDir, 'missing-directory'),
      icon: '📁',
    }
  )
  data.topOrder.folders.push(
    { type: 'loose', id: 'loose-open' },
    { type: 'loose', id: 'loose-missing' }
  )
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )
  const context = await launchApp(userDataDir)
  // Not reduced motion: that setting takes the press squeeze away, and the squeeze is under test.
  await context.electronApp.evaluate(
    ({ BrowserWindow }, width) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())!
        .setSize(width, 720),
    width
  )
  await expect.poll(() => context.page.evaluate(() => innerWidth)).toBe(width)

  return context
}

const boxOf = async (locator: Locator) => (await locator.boundingBox())!

/** The box of something that may still be settling (a popup opens by scaling up): once it is the same twice. */
async function settledBox(locator: Locator) {
  let previous = ''
  await expect
    .poll(async () => {
      const box = await locator.boundingBox()
      const signature = JSON.stringify(box)
      const settled = signature === previous
      previous = signature

      return settled
    })
    .toBe(true)

  return boxOf(locator)
}

/** Hovers a tile with the real pointer and waits for its buttons (they show after the hover intent). */
async function hoverTile(tile: Locator, actions: Locator): Promise<void> {
  await tile.hover()
  await expect(actions).toHaveCSS('opacity', '1')
  await expect(actions).toHaveCSS('pointer-events', 'auto')
}

type Case = {
  name: string
  tile: (page: Page) => Locator
  actions: string
  icon: string
  buttons: number
  edit: string
}

const CASES: Case[] = [
  {
    name: 'a group tile',
    tile: (page) => page.getByTestId('folder-widget-grp-folders-work'),
    actions: '.widget-actions',
    icon: '.widget-box',
    buttons: 2,
    edit: 'group-name-input',
  },
  {
    name: 'a loose tile',
    tile: (page) => page.getByTestId('loose-widget-loose-open'),
    actions: '.widget-actions',
    icon: '.widget-loose-box',
    buttons: 2,
    edit: 'item-name-input',
  },
]

for (const item of CASES) {
  test(`the buttons of ${item.name} are centred on its 44px, clear of its icon, and work`, async () => {
    const context = await launchSlender()
    try {
      const { page } = context
      const tile = item.tile(page)
      const actions = tile.locator(item.actions)
      await hoverTile(tile, actions)

      const tileBox = await boxOf(tile)
      const actionsBox = await boxOf(actions)
      const iconBox = await boxOf(tile.locator(item.icon))
      expect(tileBox.height).toBe(44)
      expect(
        Math.abs(
          actionsBox.y +
            actionsBox.height / 2 -
            (tileBox.y + tileBox.height / 2)
        )
      ).toBeLessThanOrEqual(1)
      // At the right edge, past the icon, and not over most of the name.
      expect(
        tileBox.x + tileBox.width - (actionsBox.x + actionsBox.width)
      ).toBeLessThan(9)
      expect(actionsBox.x).toBeGreaterThan(iconBox.x + iconBox.width + 6)
      expect(actionsBox.width / tileBox.width).toBeLessThanOrEqual(0.4)

      // Each button is a 22px target of its own, and is what the pointer reaches at its centre.
      const buttons = actions.getByRole('button')
      await expect(buttons).toHaveCount(item.buttons)
      for (let index = 0; index < item.buttons; index++) {
        const button = buttons.nth(index)
        const box = await boxOf(button)
        expect([Math.round(box.width), Math.round(box.height)]).toEqual([
          22, 22,
        ])
        expect(
          await button.evaluate((node) => {
            const rect = node.getBoundingClientRect()

            return (
              document
                .elementFromPoint(
                  rect.x + rect.width / 2,
                  rect.y + rect.height / 2
                )
                ?.closest('button') === node
            )
          })
        ).toBe(true)
      }
      // Edit is the first of them and opens the editor, not the tile.
      await buttons.first().click()
      await expect(page.getByTestId(item.edit)).toBeVisible()
    } finally {
      await closeApp(context)
    }
  })
}

test('the three buttons of a popup tile fit beside its icon and each is a 22px target', async () => {
  const context = await launchSlender()
  try {
    const { page } = context
    await page.getByTestId('folder-widget-grp-folders-work').click()
    const tile = page.getByTestId('grid-item-folder-desktop')
    const actions = tile.locator('.grid-actions')
    await hoverTile(tile, actions)

    const tileBox = await settledBox(tile)
    const actionsBox = await settledBox(actions)
    const iconBox = await settledBox(tile.locator('.grid-ico'))
    expect(tileBox.height).toBe(44)
    expect(
      Math.abs(
        actionsBox.y + actionsBox.height / 2 - (tileBox.y + tileBox.height / 2)
      )
    ).toBeLessThanOrEqual(1)
    expect(actionsBox.x).toBeGreaterThan(iconBox.x + iconBox.width + 6)
    expect(actionsBox.width / tileBox.width).toBeLessThanOrEqual(0.55)
    const buttons = actions.getByRole('button')
    await expect(buttons).toHaveCount(3)
    for (let index = 0; index < 3; index++) {
      const box = await boxOf(buttons.nth(index))
      expect([Math.round(box.width), Math.round(box.height)]).toEqual([22, 22])
    }
  } finally {
    await closeApp(context)
  }
})

test('a press squeezes the icon and nothing on the tile moves; the launch ring and a failure fit the 44px', async () => {
  const context = await launchSlender()
  try {
    const { page, electronApp } = context
    await electronApp.evaluate(({ shell }) => {
      const scope = globalThis as typeof globalThis & { __opens: number }
      scope.__opens = 0
      shell.openPath = async () => {
        scope.__opens += 1

        return ''
      }
    })
    const opens = () =>
      electronApp.evaluate(
        () => (globalThis as typeof globalThis & { __opens: number }).__opens
      )
    const tile = page.getByTestId('loose-widget-loose-open')
    const icon = tile.locator('.widget-loose-box')
    const name = tile.locator('.widget-name')
    await page.mouse.move(2, 2)
    const before = {
      tile: await boxOf(tile),
      icon: await boxOf(icon),
      name: await boxOf(name),
    }

    // Pressed on the name, the icon still gives way (:active is the tile's), and nothing moves.
    await page.mouse.move(
      before.name.x + before.name.width / 2,
      before.name.y + before.name.height / 2
    )
    await page.mouse.down()
    await expect
      .poll(() => icon.evaluate((node) => getComputedStyle(node).transform))
      .toBe('matrix(0.92, 0, 0, 0.92, 0, 0)')
    expect(await boxOf(tile)).toEqual(before.tile)
    expect(await boxOf(name)).toEqual(before.name)
    await page.mouse.up()

    // The click is answered at once: the ring and the pop play on the tile, which stays 44px high.
    await expect(tile).toHaveAttribute('data-launch', 'launching')
    await expect(tile).toHaveCSS('animation-name', 'launchRing')
    await expect(icon).toHaveCSS('animation-name', 'launchPop')
    expect((await boxOf(tile)).height).toBe(44)
    await expect(tile).not.toHaveAttribute('data-launch', /./, {
      timeout: 2000,
    })
    expect(await opens()).toBe(1)

    // A launch that fails outlines the tile in red, and its size is the same.
    await page.mouse.move(2, 2)
    const bad = page.getByTestId('loose-widget-loose-missing')
    await bad.click()
    await expect(bad).toHaveAttribute('data-launch', 'failed')
    await expect
      .poll(() => bad.evaluate((node) => getComputedStyle(node).borderTopColor))
      .toBe('rgb(248, 113, 113)')
    expect((await boxOf(bad)).height).toBe(44)
    expect((await boxOf(bad)).width).toBeCloseTo(before.tile.width, 1)
  } finally {
    await closeApp(context)
  }
})

test('a press on a popup tile squeezes its icon, and its launch ring fits the 44px', async () => {
  const context = await launchSlender()
  try {
    const { page, electronApp } = context
    // The sample folders are placeholders: nothing real is opened.
    await electronApp.evaluate(({ shell }) => {
      shell.openPath = async () => ''
    })
    await page.getByTestId('folder-widget-grp-folders-work').click()
    const tile = page.getByTestId('grid-item-folder-desktop')
    const icon = tile.locator('.grid-ico')
    const before = await settledBox(tile)
    const iconBox = await settledBox(icon)
    await page.mouse.move(iconBox.x + iconBox.width / 2, iconBox.y + 12)
    await page.mouse.down()
    await expect
      .poll(() => icon.evaluate((node) => getComputedStyle(node).transform))
      .toBe('matrix(0.92, 0, 0, 0.92, 0, 0)')
    expect(await boxOf(tile)).toEqual(before)
    await page.mouse.up()
    await expect(tile).toHaveAttribute('data-launch', /./)
    expect((await boxOf(tile)).height).toBe(44)
  } finally {
    await closeApp(context)
  }
})
