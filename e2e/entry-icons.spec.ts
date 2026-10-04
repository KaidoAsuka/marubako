import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { createDefaultAppData, closeApp, launchApp } from './test-utils'

// The 12 tile colours of the catalog and the glyph colours that go on them.
const BRAND_PURPLE = { hex: '#7C6CF0', rgb: 'rgb(124, 108, 240)' }
const YELLOW_GREEN = { hex: '#719C27', rgb: 'rgb(113, 156, 39)' }

function seed(theme: 'dark' | 'light') {
  const data = createDefaultAppData()
  data.prefs.theme = theme
  data.prefs.viewMode = 'grid'
  data.websites = [
    {
      id: 'g-tile',
      name: 'Tile group',
      icon: 'tile:globe:0',
      open: true,
      items: [
        {
          id: 'w-tile',
          kind: 'website',
          name: 'Tile site',
          url: 'https://example.com',
          icon: 'tile:key:4',
        },
      ],
    },
    {
      id: 'g-emoji',
      name: 'Emoji group',
      icon: '🎮',
      open: true,
      items: [],
    },
  ]
  data.loose.websites = [
    {
      id: 'w-loose',
      kind: 'website',
      name: 'Loose tile site',
      url: 'https://loose.example.com',
      icon: 'tile:globe:0',
    },
  ]
  data.topOrder.websites = [
    { type: 'group', id: 'g-tile' },
    { type: 'group', id: 'g-emoji' },
    { type: 'loose', id: 'w-loose' },
  ]
  return data
}

async function launchWith(theme: 'dark' | 'light') {
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'marubako-icons-')
  )
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(seed(theme))
  )
  return launchApp(userDataDir)
}

type TileLook = {
  glyph: string | null
  color: string | null
  background: string
  glyphColor: string
  width: number
  height: number
  svgWidth: number
}

async function tileLook(page: Page, selector: string): Promise<TileLook> {
  return page
    .locator(selector)
    .first()
    .evaluate((node) => {
      const style = getComputedStyle(node)
      const svg = node.querySelector('svg')
      return {
        glyph: node.getAttribute('data-tile-glyph'),
        color: node.getAttribute('data-tile-color'),
        background: style.backgroundColor,
        glyphColor: style.color,
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
        svgWidth: svg ? svg.getBoundingClientRect().width : 0,
      }
    })
}

function channels(rgb: string): number[] {
  return (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number)
}

function luminance(rgb: string): number {
  const [r = 0, g = 0, b = 0] = channels(rgb).map((value) => {
    const scaled = value / 255
    return scaled <= 0.03928
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)
}

/** The grid or list choice is a setting now: open the settings, choose, save. */
async function chooseViewMode(page: Page, mode: 'grid' | 'list') {
  await page.getByTestId('open-settings').click()
  await page.getByTestId('settings-tab-appearance').click()
  await page.getByTestId(`view-mode-${mode}`).click()
  await page.getByTestId('settings-save').click()
  await expect(page.getByTestId('modal-settings')).toHaveCount(0)
}

for (const theme of ['dark', 'light'] as const) {
  test(`draws coloured tiles with a legible glyph in the ${theme} theme`, async () => {
    const context = await launchWith(theme)

    try {
      const { page } = context
      await page.getByTestId('tab-websites').click()
      await chooseViewMode(page, 'list') // list view: group cards and rows

      const group = await tileLook(page, '.group-card-icon .entry-tile')
      expect(group).toMatchObject({
        glyph: 'globe',
        color: '0',
        background: BRAND_PURPLE.rgb,
        glyphColor: 'rgb(255, 255, 255)',
        width: 26,
        height: 26,
      })
      expect(group.svgWidth).toBeGreaterThan(14)
      expect(group.svgWidth).toBeLessThan(20)

      const row = await tileLook(page, '.item-icon .entry-tile')
      expect(row).toMatchObject({
        glyph: 'key',
        color: '4',
        background: YELLOW_GREEN.rgb,
        glyphColor: 'rgb(22, 22, 29)',
      })

      // Both glyph colours read clearly on their tile, in either theme.
      expect(
        contrast(group.background, group.glyphColor)
      ).toBeGreaterThanOrEqual(3.6)
      expect(contrast(row.background, row.glyphColor)).toBeGreaterThanOrEqual(
        3.6
      )
    } finally {
      await closeApp(context)
    }
  })
}

test('a chosen tile looks identical in the grid, the list, the group popup and the search results', async () => {
  const context = await launchWith('dark')

  try {
    const { page } = context
    await page.getByTestId('tab-websites').click()

    // Grid: a group's folder widget and a loose widget carry the tile of globe/0.
    const widget = await tileLook(page, '.widget-folder-symbol .entry-tile')
    const loose = await tileLook(page, '.loose-icon-source .entry-tile')
    expect(widget).toMatchObject({
      glyph: 'globe',
      color: '0',
      background: BRAND_PURPLE.rgb,
    })
    expect(loose).toMatchObject({
      glyph: 'globe',
      color: '0',
      background: BRAND_PURPLE.rgb,
    })

    // The old emoji group keeps drawing as text.
    await expect(
      page.getByTestId('folder-widget-g-emoji').locator('.widget-folder-symbol')
    ).toHaveText('🎮')
    await expect(
      page.getByTestId('folder-widget-g-emoji').locator('.entry-tile')
    ).toHaveCount(0)

    // Group popup: the entry's own tile (key/4) and the group's (globe/0).
    await page.getByTestId('folder-widget-g-tile').click()
    const popupGroup = await tileLook(page, '.widget-popup-icon .entry-tile')
    expect(popupGroup).toMatchObject({
      glyph: 'globe',
      color: '0',
      background: BRAND_PURPLE.rgb,
    })
    const popupItem = await tileLook(page, '.grid-ico .entry-tile')
    expect(popupItem).toMatchObject({
      glyph: 'key',
      color: '4',
      background: YELLOW_GREEN.rgb,
    })
    await page.keyboard.press('Escape')

    // List: the group card.
    await chooseViewMode(page, 'list')
    const card = await tileLook(page, '.group-card-icon .entry-tile')
    expect(card).toMatchObject({
      glyph: 'globe',
      color: '0',
      background: BRAND_PURPLE.rgb,
    })

    // Search: the same entries, the same tiles.
    await page.getByTestId('open-command').click()
    await page.keyboard.type('Tile')
    const results = page.locator('.command-result-icon .entry-tile')
    await expect(results.first()).toBeVisible()
    const seen = await results.evaluateAll((nodes) =>
      nodes.map((node) => ({
        glyph: node.getAttribute('data-tile-glyph'),
        color: node.getAttribute('data-tile-color'),
        background: getComputedStyle(node).backgroundColor,
      }))
    )
    expect(seen).toContainEqual({
      glyph: 'globe',
      color: '0',
      background: BRAND_PURPLE.rgb,
    })
    expect(seen).toContainEqual({
      glyph: 'key',
      color: '4',
      background: YELLOW_GREEN.rgb,
    })
  } finally {
    await closeApp(context)
  }
})

test('a fresh install shows tiles, and new entries start with the tile of their category', async () => {
  const context = await launchApp()

  try {
    const { page } = context
    // Sample data: group icons are tiles, not emoji.
    await expect(
      page.locator('.widget-folder-symbol .entry-tile').first()
    ).toBeVisible()
    await expect(
      page.locator('.widget-folder-symbol > span:not(.entry-tile)')
    ).toHaveCount(0)

    // A new group in Websites starts with the websites colour (blue, colour 1).
    await page.getByTestId('tab-websites').click()
    await page.getByTestId('add-group-websites').click()
    const preview = page
      .getByTestId('icon-picker-trigger')
      .locator('.entry-tile')
    await expect(preview).toHaveAttribute('data-tile-glyph', 'folders')
    await expect(preview).toHaveAttribute('data-tile-color', '1')
    await page.getByTestId('group-name-input').fill('Fresh group')
    await page.getByTestId('group-save').click()
    const fresh = page
      .locator('[data-testid^="folder-widget-"]', { hasText: 'Fresh group' })
      .locator('.entry-tile')
    await expect(fresh).toHaveAttribute('data-tile-glyph', 'folders')
    await expect(fresh).toHaveAttribute('data-tile-color', '1')

    // A new website starts with the globe tile.
    await page.getByTestId('add-loose-item-websites').click()
    await expect(
      page.getByTestId('icon-picker-trigger').locator('.entry-tile')
    ).toHaveAttribute('data-tile-glyph', 'globe')
    await page.getByTestId('item-name-input').fill('Fresh site')
    await page.getByTestId('item-url-input').fill('fresh.example.com')
    await page.getByTestId('item-save').click()
    await expect(
      page.locator('.loose-icon-source .entry-tile').last()
    ).toHaveAttribute('data-tile-glyph', 'globe')

    // A new task starts with the target tile.
    await page.getByTestId('tab-tasks').click()
    await page.getByTestId('add-task').click()
    await expect(
      page.getByTestId('icon-picker-trigger').locator('.entry-tile')
    ).toHaveAttribute('data-tile-glyph', 'target')
  } finally {
    await closeApp(context)
  }
})
