import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PANEL_WIDTH,
  resolveSearchMode,
  resolveTabMode,
  ROW_MIN_WIDTH,
  rowMinWidth,
  SEARCH_ICON_BELOW_WIDTH,
  STACKED_MIN_WIDTH,
  stackedMinWidth,
} from '../layout-widths'
import { ALL_TABS, LANGS } from '../types'

describe('the widths that decide the category row', () => {
  it.each(LANGS)(
    'are whole numbers that grow from icons to stacked to row in %s',
    (lang) => {
      for (const value of [
        STACKED_MIN_WIDTH[lang],
        ROW_MIN_WIDTH[lang],
        DEFAULT_PANEL_WIDTH[lang],
      ])
        expect(Number.isInteger(value) && value > 0, `${lang} ${value}`).toBe(
          true
        )

      expect(STACKED_MIN_WIDTH[lang]).toBeLessThan(ROW_MIN_WIDTH[lang])
    }
  )

  it('give the longer names in English and Japanese more room than Chinese needs', () => {
    expect(STACKED_MIN_WIDTH.zh).toBeLessThan(STACKED_MIN_WIDTH.ja)
    expect(STACKED_MIN_WIDTH.ja).toBeLessThan(STACKED_MIN_WIDTH.en)
    expect(ROW_MIN_WIDTH.zh).toBeLessThan(ROW_MIN_WIDTH.ja)
    expect(ROW_MIN_WIDTH.ja).toBeLessThanOrEqual(ROW_MIN_WIDTH.en)
  })

  it('open a new installation slender: about 400 in Chinese, never square, and in the stacked layout', () => {
    expect(DEFAULT_PANEL_WIDTH.zh).toBe(400)
    for (const lang of LANGS) {
      // Room above the width the names need, so rounding to device pixels cannot cost the names.
      expect(DEFAULT_PANEL_WIDTH[lang], lang).toBeGreaterThanOrEqual(
        STACKED_MIN_WIDTH[lang] + 10
      )
      expect(DEFAULT_PANEL_WIDTH[lang], lang).toBeLessThan(ROW_MIN_WIDTH[lang])
      expect(resolveTabMode(lang, DEFAULT_PANEL_WIDTH[lang]), lang).toBe(
        'stacked'
      )
      // The default height is 720: narrow enough that the window is slender.
      expect(DEFAULT_PANEL_WIDTH[lang], lang).toBeLessThanOrEqual(480)
    }
  })

  it('make Chinese about 600 the width where icon and name go side by side', () => {
    expect(ROW_MIN_WIDTH.zh).toBeGreaterThanOrEqual(600)
    expect(ROW_MIN_WIDTH.zh).toBeLessThanOrEqual(620)
  })
})

describe('resolveTabMode', () => {
  it.each(LANGS)('switches exactly at the constants in %s', (lang) => {
    expect(resolveTabMode(lang, STACKED_MIN_WIDTH[lang] - 1)).toBe('icons')
    expect(resolveTabMode(lang, STACKED_MIN_WIDTH[lang])).toBe('stacked')
    expect(resolveTabMode(lang, ROW_MIN_WIDTH[lang] - 1)).toBe('stacked')
    expect(resolveTabMode(lang, ROW_MIN_WIDTH[lang])).toBe('row')
  })

  it.each(LANGS)(
    'only ever goes from icons to stacked to row as the window widens in %s',
    (lang) => {
      const order = ['icons', 'stacked', 'row']
      let previous = 0

      for (let width = 0; width <= 1400; width += 1) {
        const index = order.indexOf(resolveTabMode(lang, width))
        expect(index, `${lang} ${width}`).toBeGreaterThanOrEqual(previous)
        previous = index
      }
      expect(previous).toBe(2)
    }
  )

  it('shows only icons in a window as narrow as the smallest one allowed, in English and Japanese', () => {
    expect(resolveTabMode('en', 320)).toBe('icons')
    expect(resolveTabMode('ja', 320)).toBe('icons')
    // Chinese names are short enough to stand under their icons even there.
    expect(resolveTabMode('zh', 320)).toBe('stacked')
  })
})

describe('resolveSearchMode', () => {
  it('is the magnifying glass alone below the icon width, whatever the tabs do', () => {
    for (const lang of LANGS)
      for (const width of [0, 320, SEARCH_ICON_BELOW_WIDTH - 1])
        expect(resolveSearchMode(lang, width), `${lang} ${width}`).toBe('icon')
  })

  it('shows the label, without the shortcut, while "new group" and "add" sit beside it', () => {
    expect(resolveSearchMode('en', DEFAULT_PANEL_WIDTH.en)).toBe('label')
    expect(resolveSearchMode('zh', SEARCH_ICON_BELOW_WIDTH)).toBe('label')
  })

  it('shows label and shortcut once the actions have moved to the category row', () => {
    for (const lang of LANGS)
      expect(resolveSearchMode(lang, ROW_MIN_WIDTH[lang]), lang).toBe('full')
  })

  it('has an icon width of about 420', () => {
    expect(SEARCH_ICON_BELOW_WIDTH).toBe(420)
  })
})

describe('the widths for fewer categories', () => {
  const COUNTS = Array.from({ length: ALL_TABS.length }, (_, i) => i + 1)

  it.each(LANGS)('are the measured constants for all seven in %s', (lang) => {
    expect(stackedMinWidth(lang, 7)).toBe(STACKED_MIN_WIDTH[lang])
    expect(rowMinWidth(lang, 7)).toBe(ROW_MIN_WIDTH[lang])
    // No count given means the full set.
    expect(stackedMinWidth(lang)).toBe(STACKED_MIN_WIDTH[lang])
    expect(rowMinWidth(lang)).toBe(ROW_MIN_WIDTH[lang])
  })

  it.each(LANGS)(
    'shrink with every category that is hidden, never growing, in %s',
    (lang) => {
      for (const count of COUNTS.slice(1)) {
        expect(
          stackedMinWidth(lang, count - 1),
          `${lang} stacked ${count}`
        ).toBeLessThan(stackedMinWidth(lang, count))
        expect(
          rowMinWidth(lang, count - 1),
          `${lang} row ${count}`
        ).toBeLessThan(rowMinWidth(lang, count))
      }
    }
  )

  it.each(LANGS)(
    'keep the stacked layout narrower than the row layout for any count in %s',
    (lang) => {
      for (const count of COUNTS)
        expect(stackedMinWidth(lang, count), `${lang} ${count}`).toBeLessThan(
          rowMinWidth(lang, count)
        )
    }
  )

  it.each(LANGS)('are whole numbers in %s', (lang) => {
    for (const count of COUNTS) {
      expect(Number.isInteger(stackedMinWidth(lang, count))).toBe(true)
      expect(Number.isInteger(rowMinWidth(lang, count))).toBe(true)
    }
  })

  it('treat a count outside 1..7 as the nearest valid one', () => {
    expect(stackedMinWidth('en', 0)).toBe(stackedMinWidth('en', 1))
    expect(rowMinWidth('en', -3)).toBe(rowMinWidth('en', 1))
    expect(stackedMinWidth('en', 12)).toBe(stackedMinWidth('en', 7))
    expect(rowMinWidth('en', Number.NaN)).toBe(rowMinWidth('en', 7))
  })

  it('let the default slender window use the one-row layout once only a few categories are left', () => {
    // Seven categories need the stacked layout at 400; three Chinese names, or one Japanese one,
    // fit beside their icons.
    expect(resolveTabMode('zh', 400, 7)).toBe('stacked')
    expect(resolveTabMode('zh', 400, 3)).toBe('row')
    expect(resolveTabMode('ja', 400, 7)).toBe('stacked')
    expect(resolveTabMode('ja', 400, 3)).toBe('stacked')
    expect(resolveTabMode('ja', 400, 1)).toBe('row')
  })

  it('give English, whose names are longest, the icons-only layout for fewer categories at a narrower width', () => {
    expect(resolveTabMode('en', 400, 7)).toBe('icons')
    // Five categories need less than 400 under their icons.
    expect(resolveTabMode('en', 400, 5)).toBe('stacked')
  })

  it('switch exactly at the scaled constants for any count', () => {
    for (const lang of LANGS)
      for (const count of COUNTS) {
        const stacked = stackedMinWidth(lang, count)
        const row = rowMinWidth(lang, count)

        expect(resolveTabMode(lang, stacked - 1, count)).toBe('icons')
        expect(resolveTabMode(lang, stacked, count)).toBe('stacked')
        expect(resolveTabMode(lang, row - 1, count)).toBe('stacked')
        expect(resolveTabMode(lang, row, count)).toBe('row')
      }
  })

  it('puts the search label and shortcut with the row layout for the count in use', () => {
    expect(resolveSearchMode('zh', rowMinWidth('zh', 3), 3)).toBe('icon')
    expect(resolveSearchMode('zh', 430, 3)).toBe('full')
    expect(resolveSearchMode('zh', 430, 7)).toBe('label')
  })
})
