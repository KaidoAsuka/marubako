// layout-2: one 44px single-line tile for the grid, the group popup and the popup's add cell. These read
// the real stylesheets in cascade order and check which value wins.
import { describe, expect, it } from 'vitest'

import { DEFAULT_PANEL_WIDTH } from '../../../../shared/layout-widths'

import {
  declarations,
  lastValue,
  loadCascade,
  loadRules,
  splitSelectors,
} from './css-utils'

// entry-icon.css is imported by main.tsx after motion.css but is not part of the shared cascade list.
const cascade = [...loadCascade(), ...loadRules('entry-icon.css')]
const win = (selector: string, property: string, at: string[] = []) =>
  lastValue(cascade, selector, property, at)

const TILES = ['.folder-widget', '.widget-loose', '.grid-item', '.grid-add']
const px = (value: string | undefined): number => Number.parseFloat(value ?? '')

/** `minmax(144px, 1fr)` inside `repeat(auto-fill, ...)`: the 144. */
function minColumn(selector: string): number {
  const template = win(selector, 'grid-template-columns')
  const match = /^repeat\(auto-fill, minmax\((\d+)px, 1fr\)\)$/.exec(
    template ?? ''
  )
  expect(match, `${selector}: ${template}`).not.toBeNull()

  return Number(match![1])
}

/** How many columns `repeat(auto-fill, minmax(min, 1fr))` makes of `width` px with `gap` between. */
const columnsFor = (width: number, min: number, gap: number): number =>
  Math.max(1, Math.floor((width + gap) / (min + gap)))

/**
 * What a section's content is when the window is `window` px wide: the window's 2px inset on each side
 * of the root, the thin scrollbar gutter that is always reserved (11px), and the section's padding
 * (12px each side, layout-1).
 */
const contentWidth = (window: number): number => window - 4 - 11 - 24

describe('the tile is one 44px line', () => {
  it.each(TILES)('%s is 44px high', (selector) => {
    expect(win(selector, 'height')).toBe('44px')
  })

  it('has no taller minimum left over from the 72px card, anywhere in the cascade', () => {
    const stale = cascade
      .filter((rule) =>
        splitSelectors(rule.selector).some((part) =>
          [...TILES, '.grid-main'].some((tile) => part.startsWith(tile))
        )
      )
      .flatMap((rule) =>
        declarations(rule.body)
          .filter(([name, value]) => name === 'min-height' && px(value) > 44)
          .map(([, value]) => `${rule.selector} min-height: ${value}`)
      )

    expect(stale).toEqual([])
  })

  it('lays a loose tile out as icon and name, and a group as icon, name and count', () => {
    expect(win('.widget-loose', 'grid-template-columns')).toBe(
      '24px minmax(0, 1fr)'
    )
    expect(win('.folder-widget', 'grid-template-columns')).toBe(
      '24px minmax(0, 1fr) auto'
    )
    for (const selector of ['.folder-widget', '.widget-loose']) {
      expect(win(selector, 'display'), selector).toBe('grid')
      expect(win(selector, 'align-items'), selector).toBe('center')
      expect(win(selector, 'padding'), selector).toBe('0 7px')
      expect(win(selector, 'border-radius'), selector).toBe('10px')
    }
  })

  it('lays the popup tile out the same way: the button fills the tile and centres its row', () => {
    expect(win('.grid-main', 'height')).toBe('100%')
    expect(win('.grid-main', 'flex-direction')).toBe('row')
    expect(win('.grid-main', 'align-items')).toBe('center')
    expect(win('.grid-main', 'padding')).toBe('0 7px')
    expect(win('.grid-main', 'gap')).toBe(win('.widget-loose', 'gap'))
    expect(win('.grid-item', 'padding')).toBe('0')
  })

  it('turns the popup’s add cell into a row of the same height', () => {
    expect(win('.grid-add', 'flex-direction')).toBeUndefined()
    expect(win('.grid-add', 'align-items')).toBe('center')
    expect(win('.grid-add', 'padding')).toBe('0 7px')
    expect(win('.grid-add-label', 'font-size')).toBe('13px')
    expect(win('.grid-add-label', 'margin-top')).toBeUndefined()
  })

  it('keeps the drop marker inside the 44px tile', () => {
    for (const side of ['before::before', 'after::after']) {
      const selector = `:is(.folder-widget, .widget-loose, .grid-item).drop-${side}`
      expect(win(selector, 'top'), selector).toBe('6px')
      expect(win(selector, 'bottom'), selector).toBe('6px')
    }
  })
})

describe('the icon', () => {
  it('is a 24px slot everywhere on the tile', () => {
    for (const selector of ['.widget-box', '.widget-loose-box']) {
      expect(win(selector, 'width'), selector).toBe('24px')
      expect(win(selector, 'height'), selector).toBe('24px')
      expect(win(selector, 'padding'), selector).toBe('0')
      expect(win(selector, 'max-width'), selector).toBeUndefined()
      expect(win(selector, 'aspect-ratio'), selector).toBeUndefined()
    }
    for (const selector of [
      '.widget-folder-symbol',
      '.loose-icon-source',
      '.grid-ico',
    ]) {
      expect(win(selector, 'width'), selector).toBe('24px')
      expect(win(selector, 'height'), selector).toBe('24px')
      expect(win(selector, '--entry-tile-size'), selector).toBe('24px')
      // An emoji, 18px, sits in the same slot as a 24px tile or a program's own icon.
      expect(win(selector, 'font-size'), selector).toBe('18px')
    }
  })

  it('has no frame of its own: a group is told apart by the tile, not by a box inside it', () => {
    expect(win('.widget-box', 'background')).toBe('transparent')
    expect(win('.widget-box', 'border')).toBe('0')
    expect(win('.widget-loose-box', 'background')).toBe('transparent')
    // The rule that took the frame away from a tile icon only is not needed any more.
    expect(
      loadRules('entry-icon.css').filter((rule) =>
        rule.selector.includes('.widget-box')
      )
    ).toEqual([])
  })
})

describe('the name and the count', () => {
  it.each(['.widget-name', '.grid-name'])(
    '%s is 13px, medium and one line with an ellipsis',
    (selector) => {
      expect(win(selector, 'font-size')).toBe('13px')
      expect(win(selector, 'font-weight')).toBe('500')
      expect(win(selector, 'line-height')).toBe('18px')
      expect(win(selector, 'white-space')).toBe('nowrap')
      expect(win(selector, 'overflow')).toBe('hidden')
      expect(win(selector, 'text-overflow')).toBe('ellipsis')
      expect(win(selector, 'text-align')).toBe('left')
    }
  )

  it('draws the count faint, small and on the right', () => {
    expect(win('.widget-count', 'display')).toBe('block')
    expect(win('.widget-count', 'font')).toBe('11px/1 var(--sans)')
    expect(win('.widget-count', 'color')).toBe('var(--text-dim)')
    expect(win('.widget-count', 'margin')).toBe('0')
  })

  it('has no second line any more', () => {
    const second = cascade.filter((rule) =>
      splitSelectors(rule.selector).some((part) =>
        /\.(widget|grid)-detail\b/.test(part)
      )
    )

    expect(second.map((rule) => rule.selector)).toEqual([])
  })
})

describe('the group tile', () => {
  it('is told apart by its soft accent fill, with a plain line at rest and none of the accent', () => {
    expect(win('.folder-widget', 'background')).toBe('var(--accent-soft)')
    expect(win('.widget-loose', 'background')).toBe('var(--card-bg)')
    for (const selector of ['.folder-widget', '.widget-loose']) {
      expect(win(selector, 'border'), selector).toBe('1px solid var(--line)')
    }
  })
})

describe('the columns', () => {
  it('fill the width with tiles at least 144px wide, 6px apart, in the grid and the popup', () => {
    expect(minColumn('.widget-grid')).toBe(144)
    expect(minColumn('.grid-view')).toBe(144)
    expect(win('.widget-grid', 'gap')).toBe('6px')
    expect(win('.grid-view', 'gap')).toBe('6px')
  })

  it('make two columns at the default content width, in all three languages', () => {
    const min = minColumn('.widget-grid')
    const gap = px(win('.widget-grid', 'gap'))

    // The owner's figure (window 400, 376 content) and the real one (361: the scrollbar gutter).
    expect(columnsFor(376, min, gap)).toBe(2)
    expect(columnsFor(contentWidth(400), min, gap)).toBe(2)
    // The default windows of ja and en stay two columns instead of three narrow ones.
    expect(columnsFor(contentWidth(DEFAULT_PANEL_WIDTH.ja), min, gap)).toBe(2)
    expect(columnsFor(contentWidth(DEFAULT_PANEL_WIDTH.en), min, gap)).toBe(2)
    // Down to a 360 window, two; the 320 minimum window falls back to one wide tile.
    expect(columnsFor(contentWidth(360), min, gap)).toBe(2)
    expect(columnsFor(contentWidth(320), min, gap)).toBe(1)
  })

  it('fill up with more columns as the window is widened', () => {
    const min = minColumn('.widget-grid')
    const gap = px(win('.widget-grid', 'gap'))

    expect(columnsFor(contentWidth(600), min, gap)).toBe(3)
    expect(columnsFor(contentWidth(760), min, gap)).toBe(4)
    expect(columnsFor(contentWidth(1000), min, gap)).toBe(6)
  })

  it('leave a ten-character Chinese name room at 13px in a loose tile, and eight in a group', () => {
    const min = minColumn('.widget-grid')
    const gap = px(win('.widget-grid', 'gap'))
    const padding = px(win('.widget-loose', 'padding')?.split(' ')[1])
    const border = 1
    const icon = px(win('.widget-box', 'width'))
    const iconGap = px(win('.widget-loose', 'gap'))
    const char = px(win('.widget-name', 'font-size'))
    const tileWidth = (content: number) => {
      const columns = columnsFor(content, min, gap)

      return (content - (columns - 1) * gap) / columns
    }
    const nameRoom = (content: number) =>
      tileWidth(content) - 2 * (border + padding) - icon - iconGap
    // A group's count: its gap and about two digits of 11px.
    const countRoom = iconGap + 14

    for (const content of [361, 376, 401, 421]) {
      expect(nameRoom(content) / char, `loose, ${content}`).toBeGreaterThan(10)
      expect(
        (nameRoom(content) - countRoom) / char,
        `group, ${content}`
      ).toBeGreaterThan(8)
    }
  })
})

describe('the buttons on a tile', () => {
  it('sit at the right edge, centred on the 44px with no transform, as high as their own buttons', () => {
    for (const selector of ['.widget-actions', '.grid-actions']) {
      expect(win(selector, 'top'), selector).toBe('0')
      expect(win(selector, 'bottom'), selector).toBe('0')
      expect(win(selector, 'right'), selector).toBe('6px')
      expect(win(selector, 'left'), selector).toBe('auto')
      expect(win(selector, 'height'), selector).toBe('fit-content')
      expect(win(selector, 'margin-block'), selector).toBe('auto')
      expect(win(selector, 'transform'), selector).toBe('none')
      expect(win(selector, 'gap'), selector).toBe('6px')
      // The colour of the hovered tile, so they cover the tail of the name rather than push it.
      expect(win(selector, 'background'), selector).toBe('var(--hover-bg)')
    }
    expect(win('.widget-action-button', 'width')).toBe('22px')
    expect(win('.widget-action-button', 'height')).toBe('22px')
    expect(win('.grid-actions .icon-button', 'width')).toBe('22px')
    expect(win('.grid-actions .icon-button', 'height')).toBe('22px')
  })

  it('leave the icon and part of the name uncovered even on the narrowest tile', () => {
    const min = minColumn('.widget-grid')
    const right = px(win('.widget-actions', 'right'))
    const gap = px(win('.widget-actions', 'gap'))
    const button = px(win('.widget-action-button', 'width'))
    const covered = (buttons: number) =>
      right + buttons * button + (buttons - 1) * gap
    // A group's and a loose entry's two buttons; the popup's copy, edit and delete.
    expect(covered(2) / min).toBeLessThanOrEqual(0.4)
    expect(covered(3) / min).toBeLessThanOrEqual(0.6)

    const iconEnd = 1 + px(win('.widget-loose', 'padding')?.split(' ')[1]) + 24
    expect(min - covered(3)).toBeGreaterThan(iconEnd)
  })
})

describe('dropping a loose entry into a group', () => {
  it('lights the whole group tile, since the tile is the drop surface', () => {
    for (const selector of [
      '.folder-widget.folder-drop',
      '.folder-widget.folder-drop:hover',
    ]) {
      expect(win(selector, 'outline'), selector).toBe('2px solid var(--accent)')
      expect(win(selector, 'outline-offset'), selector).toBe('0')
      expect(win(selector, 'background'), selector).toBe(
        'color-mix(in srgb, var(--accent) 24%, transparent)'
      )
    }
    // Not the 24px icon box any more: that rule would draw a ring around the icon alone.
    expect(win('.folder-drop .widget-box', 'outline')).toBeUndefined()
  })
})

describe('the popup', () => {
  it('is as wide as the window less a margin, which is what leaves room for two tiles per row', () => {
    expect(win('.widget-popup', 'width')).toBe('calc(100% - 16px)')
    expect(win('.widget-popup', 'max-width')).toBe('560px')

    const min = minColumn('.grid-view')
    const gap = px(win('.grid-view', 'gap'))
    // At a 400 window the overlay is 392px (inset 4px), the popup 376, its inside 376 - 2 - 2 * padding.
    const padding = px(win('.widget-popup', 'padding'))
    const inside = 392 - 16 - 2 - 2 * padding

    expect(columnsFor(inside, min, gap)).toBe(2)
  })
})

describe('the rules for the old card are gone', () => {
  it('has no fixed two-column grid or card size at 480px and below', () => {
    const narrow = cascade.filter((rule) =>
      rule.at.some((prelude) => prelude.includes('max-width'))
    )
    const touching = narrow
      .filter((rule) =>
        splitSelectors(rule.selector).some((part) =>
          [
            '.widget-grid',
            '.folder-widget',
            '.widget-loose',
            '.widget-box',
            '.widget-name',
          ].includes(part)
        )
      )
      .map((rule) => `${rule.at.join(' ')} ${rule.selector}`)

    expect(touching).toEqual([])
  })
})
