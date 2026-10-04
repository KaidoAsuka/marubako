// layout-2: the 44px single-line tile as the real window lays it out, at the widths the layout is made
// for: two columns in a slender window, more as it is widened, never a horizontal scrollbar. The popup's
// tiles are the same tile.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { test, expect, type Page } from '@playwright/test'

import {
  contrast,
  over,
  parseColor,
} from '../src/renderer/src/styles/__tests__/css-utils'
import { DEFAULT_PANEL_WIDTH } from '../src/shared/layout-widths'
import {
  createDefaultAppData,
  closeApp,
  launchApp,
  type AppContext,
} from './test-utils'

const TEN_CHARACTERS = '一二三四五六七八九十'
const LONG_CHINESE = '这是一个非常非常长的文件夹名称用来检查省略号'
const LONG_LATIN = 'A very long folder name that has to be cut with an ellipsis'

async function launchSeeded(
  width: number,
  theme: 'dark' | 'light' = 'dark',
  lang: 'zh' | 'en' | 'ja' = 'zh'
): Promise<AppContext> {
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'marubako-tile-layout-')
  )
  const data = createDefaultAppData()
  data.prefs.theme = theme
  data.prefs.lang = lang
  // Loose entries with names of every length, a group with a long name and many items in it.
  const names = [
    TEN_CHARACTERS,
    LONG_CHINESE,
    LONG_LATIN,
    'GitHub',
    '下载',
    '照片',
    'Reading list',
    '财务报表',
  ]
  names.forEach((name, index) => {
    const id = `loose-${index}`
    data.loose.folders.push({
      id,
      kind: 'folder',
      name,
      path: `C:\\Work\\Projects\\${name}\\Marubako`,
      icon: index % 2 ? 'tile:folder:5' : '📁',
    })
    data.topOrder.folders.push({ type: 'loose', id })
  })
  data.folders[0]!.name = LONG_CHINESE
  data.folders[0]!.items.push(
    ...names.map((name, index) => ({
      id: `inner-${index}`,
      kind: 'folder' as const,
      name,
      path: `C:\\Work\\${name}`,
      icon: 'tile:folder:3',
    }))
  )
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )
  const context = await launchApp(userDataDir)
  await context.page.emulateMedia({ reducedMotion: 'reduce' })
  await context.electronApp.evaluate(
    ({ BrowserWindow }, width) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())!
        .setSize(width, 720),
    width
  )
  // A window is sized in device pixels: at a 125% display scale 470 comes out as 471.
  await expect
    .poll(async () =>
      Math.abs((await context.page.evaluate(() => innerWidth)) - width)
    )
    .toBeLessThanOrEqual(1)
  await expect(context.page.locator('.widget-grid')).toBeVisible()

  return context
}

type TileFacts = {
  height: number
  computedHeight: string
  nameHeight: number
  nameWhiteSpace: string
  nameOverflow: string
  nameTextOverflow: string
  nameFontSize: string
  nameFontWeight: string
  nameText: string
  nameTruncated: boolean
  iconWidth: number
  iconHeight: number
  right: number
}

/** What every tile (or popup tile) of `selector` looks like once laid out. */
async function tileFacts(page: Page, selector: string): Promise<TileFacts[]> {
  return page.evaluate((tileSelector) => {
    return [...document.querySelectorAll(tileSelector)].map((tile) => {
      const rect = tile.getBoundingClientRect()
      const name = tile.querySelector('.widget-name, .grid-name')!
      const nameStyle = getComputedStyle(name)
      const icon = tile
        .querySelector('.widget-folder-symbol, .loose-icon-source, .grid-ico')!
        .getBoundingClientRect()

      return {
        height: rect.height,
        computedHeight: getComputedStyle(tile).height,
        nameHeight: name.getBoundingClientRect().height,
        nameWhiteSpace: nameStyle.whiteSpace,
        nameOverflow: nameStyle.overflow,
        nameTextOverflow: nameStyle.textOverflow,
        nameFontSize: nameStyle.fontSize,
        nameFontWeight: nameStyle.fontWeight,
        nameText: name.textContent ?? '',
        nameTruncated: name.scrollWidth > name.clientWidth,
        iconWidth: icon.width,
        iconHeight: icon.height,
        right: rect.right,
      }
    })
  }, selector)
}

function expectOneLineTiles(facts: TileFacts[]): void {
  expect(facts.length).toBeGreaterThan(0)
  for (const tile of facts) {
    expect(tile.height, tile.nameText).toBe(44)
    expect(tile.computedHeight, tile.nameText).toBe('44px')
    // One line of 18px, cut with an ellipsis rather than wrapped.
    expect(tile.nameHeight, tile.nameText).toBe(18)
    expect(tile.nameWhiteSpace).toBe('nowrap')
    expect(tile.nameOverflow).toBe('hidden')
    expect(tile.nameTextOverflow).toBe('ellipsis')
    expect(tile.nameFontSize).toBe('13px')
    expect(tile.nameFontWeight).toBe('500')
    expect([tile.iconWidth, tile.iconHeight]).toEqual([24, 24])
  }
}

const WIDTHS = [
  { width: 360, columns: 2 },
  { width: 400, columns: 2 },
  { width: 600, columns: 3 },
  { width: 760, columns: 4 },
]

for (const { width, columns } of WIDTHS) {
  test(`at ${width}px the grid is ${columns} columns of 44px one-line tiles with no horizontal overflow`, async () => {
    const context = await launchSeeded(width)
    try {
      const { page } = context
      const grid = await page.evaluate(() => {
        const element = document.querySelector('.widget-grid')!
        const section = document.querySelector('.section-content')!
        const template = getComputedStyle(element).gridTemplateColumns

        return {
          columns: template.split(' ').length,
          columnWidth: Number.parseFloat(template.split(' ')[0]!),
          gridRight: element.getBoundingClientRect().right,
          sectionRight: section.getBoundingClientRect().right,
          pageOverflows:
            document.documentElement.scrollWidth > window.innerWidth,
          sectionOverflows: section.scrollWidth > section.clientWidth,
        }
      })

      expect(grid.columns).toBe(columns)
      expect(grid.pageOverflows).toBe(false)
      expect(grid.sectionOverflows).toBe(false)
      expect(grid.gridRight).toBeLessThanOrEqual(grid.sectionRight)

      const facts = await tileFacts(
        page,
        '.widget-grid > .folder-widget, .widget-grid > .widget-loose'
      )
      // 8 loose entries and the 2 groups of the sample data.
      expect(facts).toHaveLength(10)
      expectOneLineTiles(facts)
      for (const tile of facts) {
        expect(tile.right).toBeLessThanOrEqual(grid.gridRight + 0.5)
      }

      // A long name is cut, not wrapped; a short one is whole.
      const byName = new Map(facts.map((tile) => [tile.nameText, tile]))
      expect(byName.get(LONG_CHINESE)!.nameTruncated).toBe(true)
      expect(byName.get(LONG_LATIN)!.nameTruncated).toBe(true)
      expect(byName.get('GitHub')!.nameTruncated).toBe(false)
      expect(byName.get('下载')!.nameTruncated).toBe(false)
    } finally {
      await closeApp(context)
    }
  })

  test(`at ${width}px the group popup's tiles are the same 44px tile, and its grid does not overflow`, async () => {
    const context = await launchSeeded(width)
    try {
      const { page } = context
      await page.getByTestId('folder-widget-grp-folders-work').click()
      await expect(page.locator('.widget-popup .grid-view')).toBeVisible()
      const popup = await page.evaluate(() => {
        const element = document.querySelector('.widget-popup .grid-view')!
        const add = document.querySelector('.widget-popup .grid-add')!
        const popupRect = document
          .querySelector('.widget-popup')!
          .getBoundingClientRect()

        return {
          columns:
            getComputedStyle(element).gridTemplateColumns.split(' ').length,
          overflows: element.scrollWidth > element.clientWidth,
          addHeight: add.getBoundingClientRect().height,
          popupLeft: popupRect.left,
          popupRight: popupRect.right,
          pageOverflows:
            document.documentElement.scrollWidth > window.innerWidth,
        }
      })
      const facts = await tileFacts(page, '.widget-popup .grid-item')

      expect(facts).toHaveLength(10)
      expectOneLineTiles(facts)
      expect(popup.addHeight).toBe(44)
      expect(popup.overflows).toBe(false)
      expect(popup.pageOverflows).toBe(false)
      expect(popup.popupLeft).toBeGreaterThanOrEqual(0)
      expect(popup.popupRight).toBeLessThanOrEqual(width)
      if (width >= 400) {
        // The slender window still has room for two per row; wider ones for three.
        expect(popup.columns).toBe(width >= 600 ? 3 : 2)
      } else {
        expect(popup.columns).toBeGreaterThanOrEqual(1)
      }
    } finally {
      await closeApp(context)
    }
  })
}

// The default widths of the other two languages (their names are longer): still two columns, not three
// narrow ones, and the names are cut with an ellipsis rather than wrapped.
for (const { lang, width } of [
  { lang: 'ja', width: DEFAULT_PANEL_WIDTH.ja },
  { lang: 'en', width: DEFAULT_PANEL_WIDTH.en },
] as const) {
  test(`in ${lang} at ${width}px the grid is two columns of 44px one-line tiles, and the popup too`, async () => {
    const context = await launchSeeded(width, 'dark', lang)
    try {
      const { page } = context
      const columns = () =>
        page.evaluate(
          () =>
            getComputedStyle(
              document.querySelector('.widget-grid')!
            ).gridTemplateColumns.split(' ').length
        )

      expect(await columns()).toBe(2)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true)
      expectOneLineTiles(
        await tileFacts(
          page,
          '.widget-grid > .folder-widget, .widget-grid > .widget-loose'
        )
      )

      await page.getByTestId('folder-widget-grp-folders-work').click()
      await expect(page.locator('.widget-popup .grid-view')).toBeVisible()
      expect(
        await page.evaluate(
          () =>
            getComputedStyle(
              document.querySelector('.widget-popup .grid-view')!
            ).gridTemplateColumns.split(' ').length
        )
      ).toBe(2)
      expectOneLineTiles(await tileFacts(page, '.widget-popup .grid-item'))
    } finally {
      await closeApp(context)
    }
  })
}

test('in the default slender window the columns are about 185px wide and a ten-character name fits whole', async () => {
  const context = await launchSeeded(400)
  try {
    const { page } = context
    const { columnWidth, name } = await page.evaluate((ten) => {
      const grid = document.querySelector('.widget-grid')!
      const names = [...grid.querySelectorAll('.widget-loose .widget-name')]
      const found = names.find((node) => node.textContent === ten)!

      return {
        columnWidth: Number.parseFloat(
          getComputedStyle(grid).gridTemplateColumns.split(' ')[0]!
        ),
        name: {
          truncated: found.scrollWidth > found.clientWidth,
          width: found.getBoundingClientRect().width,
        },
      }
    }, TEN_CHARACTERS)

    // 185 is the owner's figure at 376px of content; the 15px scrollbar gutter takes about 10 of it.
    expect(columnWidth).toBeGreaterThanOrEqual(170)
    expect(columnWidth).toBeLessThanOrEqual(190)
    expect(name.truncated).toBe(false)
    expect(name.width).toBeGreaterThanOrEqual(125)
  } finally {
    await closeApp(context)
  }
})

for (const theme of ['dark', 'light'] as const) {
  test(`a group tile's faint count and its name stay readable on its soft fill (${theme})`, async () => {
    const context = await launchSeeded(400, theme)
    try {
      const { page } = context
      const look = await page.evaluate(() => {
        const tile = document.querySelector('.folder-widget')!
        const count = tile.querySelector('.widget-count')!
        const name = tile.querySelector('.widget-name')!
        const canvas = getComputedStyle(document.documentElement)
          .getPropertyValue('--workspace-bg')
          .trim()

        return {
          fill: getComputedStyle(tile).backgroundColor,
          line: getComputedStyle(tile).borderTopColor,
          lineWidth: getComputedStyle(tile).borderTopWidth,
          count: getComputedStyle(count).color,
          countSize: getComputedStyle(count).fontSize,
          countText: count.textContent,
          name: getComputedStyle(name).color,
          canvas,
          countRight: count.getBoundingClientRect().right,
          tileRight: tile.getBoundingClientRect().right,
        }
      })
      const ground = over(parseColor(look.fill), parseColor(look.canvas))

      expect(look.countText).toBe('10')
      expect(look.countSize).toBe('11px')
      expect(contrast(parseColor(look.count), ground)).toBeGreaterThanOrEqual(
        4.5
      )
      expect(contrast(parseColor(look.name), ground)).toBeGreaterThanOrEqual(7)
      // The count is at the right, inside the tile's padding.
      expect(look.tileRight - look.countRight).toBeLessThanOrEqual(10)
      expect(look.tileRight - look.countRight).toBeGreaterThanOrEqual(7)
      // A plain line, not an accent line, at rest (one device pixel: 0.8px at a 125% scale).
      expect(Number.parseFloat(look.lineWidth)).toBeGreaterThan(0.5)
      expect(Number.parseFloat(look.lineWidth)).toBeLessThanOrEqual(1)
      expect(parseColor(look.line).a).toBeLessThan(0.3)
    } finally {
      await closeApp(context)
    }
  })
}

test('the list view keeps its two-line rows, name above path', async () => {
  const context = await launchSeeded(600)
  try {
    const { page } = context
    // The grid or list choice is a setting: open the settings, choose, save.
    await page.getByTestId('open-settings').click()
    await page.getByTestId('settings-tab-appearance').click()
    await page.getByTestId('view-mode-list').click()
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('modal-settings')).toHaveCount(0)
    const row = page.getByTestId('item-row-loose-0')
    await expect(row.locator('.item-name')).toHaveText(TEN_CHARACTERS)
    await expect(row.locator('.item-subtext')).toHaveText(
      `C:\\Work\\Projects\\${TEN_CHARACTERS}\\Marubako`
    )
    const name = (await row.locator('.item-name').boundingBox())!
    const subtext = (await row.locator('.item-subtext').boundingBox())!
    expect(subtext.y).toBeGreaterThan(name.y + name.height - 1)
    // The tiles are not drawn in the list.
    await expect(page.locator('.widget-grid')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})
