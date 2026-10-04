// layout-1: the widths in src/shared/layout-widths.ts were measured in the real app. This keeps them
// honest with the real fonts and styles: at each width every category name is whole, and one pixel below
// it the tabs switch to the next layout.
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createDefaultAppData } from '../src/shared/default-data'
import {
  DEFAULT_PANEL_WIDTH,
  ROW_MIN_WIDTH,
  rowMinWidth,
  STACKED_MIN_WIDTH,
  stackedMinWidth,
} from '../src/shared/layout-widths'
import type { Lang, Tab } from '../src/shared/types'
import { closeApp, launchApp, type AppContext } from './test-utils'

const TABS = [
  'folders',
  'websites',
  'apps',
  'passwords',
  'commands',
  'notes',
  'tasks',
] as const

// Chinese names are short enough to fit under their icons in the narrowest window the app allows (320),
// so its stacked width is only reachable with the zoom setting, which makes the interface narrower.
const ZOOM: Record<Lang, number> = { zh: 1.25, ja: 1, en: 1 }

async function launchIn(
  lang: Lang,
  hiddenTabs: Tab[] = []
): Promise<AppContext> {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-widths-'))
  const data = createDefaultAppData()
  data.prefs.lang = lang
  data.prefs.zoom = ZOOM[lang]
  data.prefs.hiddenTabs = hiddenTabs
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )
  const context = await launchApp(userDataDir)
  await context.page.emulateMedia({ reducedMotion: 'reduce' })

  return context
}

/** Sizes the window, and says what the page then reports as its width once the resize has landed. */
async function resizeTo(context: AppContext, width: number): Promise<number> {
  const { page, electronApp } = context
  const before = await page.evaluate(() => innerWidth)
  await electronApp.evaluate(({ BrowserWindow }, width) => {
    BrowserWindow.getAllWindows()
      .find((candidate) => candidate.isResizable())!
      .setSize(width, 720)
  }, width)
  let reported = before
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(50)
    reported = await page.evaluate(() => innerWidth)
    // The window is sized in device pixels, so what the page reports can differ by one. The width it
    // had before only counts when that is also what was asked for.
    if (
      Math.abs(reported - width) <= 1 &&
      (reported !== before || before === width)
    ) {
      await page.waitForTimeout(50)
      if ((await page.evaluate(() => innerWidth)) === reported) return reported
    }
  }

  return reported
}

/**
 * Sizes the window so that the interface is as narrow as possible but at least `css` pixels wide (the
 * window less the zoom), or as wide as possible but narrower than `css` when `side` is "below". Windows
 * are sized in device pixels, so on a scaled display some widths cannot be had: asking for 369 gives
 * 370. Says what the interface is then, in CSS pixels.
 */
async function setCssWidth(
  context: AppContext,
  lang: Lang,
  css: number,
  side: 'atLeast' | 'below' = 'atLeast'
): Promise<number> {
  const zoom = ZOOM[lang]
  const step = side === 'atLeast' ? 1 : -1
  let width = Math.round(css * zoom) + (side === 'below' ? -1 : 0)
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const actual = Math.round((await resizeTo(context, width)) / zoom)
    if (side === 'atLeast' ? actual >= css : actual < css) return actual
    width += step
  }

  throw new Error(`cannot make the interface ${side} ${css}px at zoom ${zoom}`)
}

type TabsReport = {
  mode: string | null
  rowHeight: number
  names: Array<{ text: string; whole: boolean; drawn: boolean }>
  outside: number
  actionsInRow: boolean
  actionsOverlapTabs: boolean
}

function readTabs(page: Page): Promise<TabsReport> {
  return page.evaluate(() => {
    const nav = document.querySelector('.workspace-nav')!
    const navRight = nav.getBoundingClientRect().right
    const buttons = Array.from(document.querySelectorAll('.tab-button'))
    const actions = nav.querySelector('.section-actions')
    const last = buttons[buttons.length - 1]!.getBoundingClientRect()

    return {
      mode: nav.getAttribute('data-tab-mode'),
      rowHeight: (nav as HTMLElement).offsetHeight,
      names: Array.from(
        document.querySelectorAll<HTMLElement>('.tab-label')
      ).map((label) => ({
        text: label.textContent ?? '',
        whole: label.scrollWidth <= label.clientWidth,
        drawn: getComputedStyle(label).display !== 'none',
      })),
      outside: buttons.filter(
        (button) => button.getBoundingClientRect().right > navRight + 0.5
      ).length,
      actionsInRow: actions !== null,
      actionsOverlapTabs: actions
        ? actions.getBoundingClientRect().left < last.right
        : false,
    }
  })
}

for (const lang of ['zh', 'ja', 'en'] as const) {
  test(`${lang}: names are whole at the default width and at the stacked and row constants, icons only below`, async () => {
    const context = await launchIn(lang)
    try {
      const { page } = context

      await test.step('default width: stacked, every name whole', async () => {
        await setCssWidth(context, lang, DEFAULT_PANEL_WIDTH[lang])
        for (const tab of TABS) {
          await page.getByTestId(`tab-${tab}`).click()
          const report = await readTabs(page)
          expect(report.mode, `${tab}`).toBe('stacked')
          for (const name of report.names)
            expect(name, `${lang} ${name.text} at the default width`).toEqual({
              text: name.text,
              whole: true,
              drawn: true,
            })
          expect(report.outside).toBe(0)
        }
      })

      await test.step('stacked constant: every name whole, a 52px row', async () => {
        const width = STACKED_MIN_WIDTH[lang]
        await setCssWidth(context, lang, width)
        const report = await readTabs(page)
        expect(report.mode).toBe('stacked')
        expect(report.rowHeight).toBe(52)
        for (const name of report.names)
          expect(name.whole, `${lang} ${name.text} at ${width}px`).toBe(true)
        expect(report.outside).toBe(0)
      })

      await test.step('one pixel below it: icons only, the names still in the accessible name', async () => {
        await setCssWidth(context, lang, STACKED_MIN_WIDTH[lang], 'below')
        const report = await readTabs(page)
        expect(report.mode).toBe('icons')
        expect(report.names.every((name) => !name.drawn)).toBe(true)
        for (const tab of TABS)
          await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute(
            'aria-label',
            /Alt\+\d/
          )
        expect(report.outside).toBe(0)
      })

      await test.step('row constant: names beside the icons, the actions at the right end, on every tab', async () => {
        const width = ROW_MIN_WIDTH[lang]
        await setCssWidth(context, lang, width)
        for (const tab of TABS) {
          await page.getByTestId(`tab-${tab}`).click()
          const report = await readTabs(page)
          expect(report.mode, `${tab}`).toBe('row')
          expect(report.rowHeight).toBe(40)
          for (const name of report.names)
            expect(
              name.whole,
              `${lang} ${name.text} on ${tab} at ${width}px`
            ).toBe(true)
          expect(report.outside, `${tab}`).toBe(0)
          expect(report.actionsInRow, `${tab}`).toBe(true)
          expect(report.actionsOverlapTabs, `${tab}`).toBe(false)
        }
      })

      await test.step('one pixel below it: back to the stacked layout, the actions beside the search', async () => {
        await setCssWidth(context, lang, ROW_MIN_WIDTH[lang], 'below')
        const report = await readTabs(page)
        expect(report.mode).toBe('stacked')
        expect(report.actionsInRow).toBe(false)
        // The last tab clicked was the task page: only "add task" is beside the search.
        await expect(
          page.locator('.titlebar').getByTestId('add-task')
        ).toBeVisible()
        await page.getByTestId('tab-folders').click()
        await expect(
          page.locator('.titlebar').getByTestId('add-group-folders')
        ).toBeVisible()
        await expect(
          page.locator('.titlebar').getByTestId('add-loose-item-folders')
        ).toBeVisible()
      })
    } finally {
      await closeApp(context)
    }
  })
}

// Categories hidden in the settings: the widths shrink with the number of tabs left (layout-widths.ts).
// Two hidden leaves five, in the fixed order folders, websites, apps, passwords, commands.
const HIDDEN: Tab[] = ['notes', 'tasks']
const SHOWN = TABS.filter((tab) => !HIDDEN.includes(tab))

for (const lang of ['zh', 'ja', 'en'] as const) {
  test(`${lang}: with two categories hidden the names are whole at the scaled row width and the tab row switches one pixel below it`, async () => {
    const context = await launchIn(lang, HIDDEN)
    try {
      const { page } = context
      const row = rowMinWidth(lang, SHOWN.length)
      const stacked = stackedMinWidth(lang, SHOWN.length)
      // Fewer tabs fit beside their names sooner than all seven would.
      expect(row).toBeLessThan(ROW_MIN_WIDTH[lang])
      expect(stacked).toBeLessThanOrEqual(STACKED_MIN_WIDTH[lang])

      await test.step('five tabs, not seven', async () => {
        await setCssWidth(context, lang, row)
        await expect(page.locator('.tab-button')).toHaveCount(SHOWN.length)
        await expect(page.getByTestId('tab-notes')).toHaveCount(0)
      })

      await test.step('scaled row constant: names beside the icons, the actions at the right end, nothing overlapping', async () => {
        await setCssWidth(context, lang, row)
        for (const tab of SHOWN) {
          await page.getByTestId(`tab-${tab}`).click()
          const report = await readTabs(page)
          expect(report.mode, `${tab}`).toBe('row')
          expect(report.names, `${tab}`).toHaveLength(SHOWN.length)
          for (const name of report.names)
            expect(
              name.whole,
              `${lang} ${name.text} on ${tab} at ${row}px`
            ).toBe(true)
          expect(report.outside, `${tab}`).toBe(0)
          expect(report.actionsInRow, `${tab}`).toBe(true)
          expect(report.actionsOverlapTabs, `${tab}`).toBe(false)
        }
      })

      await test.step('one pixel below it: stacked, every name whole', async () => {
        await setCssWidth(context, lang, row, 'below')
        const report = await readTabs(page)
        expect(report.mode).toBe(
          // Where the stacked width is out of the window's reach the row below is stacked anyway.
          'stacked'
        )
        for (const name of report.names)
          expect(name.whole, `${lang} ${name.text} stacked`).toBe(true)
        expect(report.outside).toBe(0)
        expect(report.actionsInRow).toBe(false)
      })

      // Only reachable when the window (at least 320 wide) can be that narrow.
      if (stacked * ZOOM[lang] >= 320) {
        await test.step('scaled stacked constant: whole names; one pixel below, icons only', async () => {
          await setCssWidth(context, lang, stacked)
          const report = await readTabs(page)
          expect(report.mode).toBe('stacked')
          for (const name of report.names)
            expect(name.whole, `${lang} ${name.text} at ${stacked}px`).toBe(
              true
            )
          expect(report.outside).toBe(0)

          await setCssWidth(context, lang, stacked, 'below')
          expect((await readTabs(page)).mode).toBe('icons')
        })
      }
    } finally {
      await closeApp(context)
    }
  })
}
