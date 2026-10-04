// layout-1: two bars above the content instead of four. These read the real stylesheets in cascade
// order, since the geometry is the whole point.
import { describe, expect, it } from 'vitest'

import {
  lastValue,
  loadCascade,
  rulesMatching,
  splitSelectors,
} from './css-utils'

const cascade = loadCascade()
const win = (selector: string, property: string, at: string[] = []) =>
  lastValue(cascade, selector, property, at)

describe('row 1, the window row', () => {
  it('is 36px high with a 12px inset, and drags the window', () => {
    expect(win('.titlebar', 'height')).toBe('36px')
    expect(win('.titlebar', 'min-height')).toBe('36px')
    expect(win('.titlebar', 'padding')).toBe('0 12px')
    expect(win('.titlebar', '-webkit-app-region')).toBe('drag')
  })

  it('lets the buttons and the search be pressed, not dragged', () => {
    expect(win('.titlebar-search', '-webkit-app-region')).toBe('no-drag')
    expect(win('.titlebar-actions', '-webkit-app-region')).toBe('no-drag')
    expect(win('.section-actions', '-webkit-app-region')).toBe('no-drag')
  })

  it('draws the search and the window buttons 28px high', () => {
    expect(win('.titlebar-search', 'height')).toBe('28px')
    expect(win('.titlebar-actions .icon-button', 'width')).toBe('28px')
    expect(win('.titlebar-actions .icon-button', 'height')).toBe('28px')
  })

  it('draws the collapse button with the brand image at 14px', () => {
    expect(win('.titlebar-ball img', 'width')).toBe('14px')
    expect(win('.titlebar-ball img', 'height')).toBe('14px')
  })
})

describe('row 2, the category row', () => {
  it('is 40px high with a 12px inset, and 52px high with the icons above the names', () => {
    expect(win('.workspace-nav', 'height')).toBe('40px')
    expect(win('.workspace-nav', 'padding')).toBe('4px 12px 3px')
    expect(win(".workspace-nav[data-tab-mode='stacked']", 'height')).toBe(
      '52px'
    )
  })

  it('shares the width equally between however many tabs there are', () => {
    expect(win('.tabbar', 'display')).toBe('flex')
    expect(win('.tab-button', 'flex')).toBe('1 1 0')
    expect(win('.tab-button', 'min-width')).toBe('0')
    expect(win('.tabbar', 'grid-template-columns')).toBeUndefined()
  })

  it('fixes no tab height of its own: the row decides', () => {
    expect(win('.tab-button', 'height')).toBeUndefined()
  })

  it('is followed at once by the content, with 10px above the first entry', () => {
    expect(win('.section-content', 'padding')).toBe('10px 12px 12px')
  })
})

describe('the three layouts of the tabs', () => {
  const stacked = ".workspace-nav[data-tab-mode='stacked']"
  const icons = ".workspace-nav[data-tab-mode='icons']"
  const wide = ".workspace-nav[data-tab-mode='row']"

  it('stacked: the icon above the name, the name as wide as the tab and cut with an ellipsis', () => {
    expect(win(`${stacked} .tab-button`, 'flex-direction')).toBe('column')
    expect(win(`${stacked} .tab-button`, 'font-size')).toBe('11px')
    expect(win(`${stacked} .tab-label`, 'align-self')).toBe('stretch')
    expect(win('.tab-label', 'text-overflow')).toBe('ellipsis')
    expect(win('.tab-label', 'overflow')).toBe('hidden')
  })

  it('icons: the names are not drawn', () => {
    expect(win(`${icons} .tab-label`, 'display')).toBe('none')
    expect(win(`${icons} .tab-button`, 'flex-direction')).toBeUndefined()
  })

  it('row: icon and name side by side, each tab as wide as its content, the actions at the right end', () => {
    expect(win(`${wide} .tab-button`, 'flex')).toBe('0 0 auto')
    expect(win('.tab-button', 'flex-direction')).toBeUndefined()
    expect(win(`${wide} .section-actions`, 'margin-left')).toBe('auto')
  })

  it('draws "new group" and "add" as icons only in the window row', () => {
    expect(win('.titlebar .section-action-label', 'display')).toBe('none')
    expect(win('.titlebar .section-actions .section-add', 'width')).toBe('28px')
    expect(win('.section-actions .section-group-add', 'width')).toBe('28px')
    expect(win('.section-action-label', 'display')).toBeUndefined()
  })
})

describe('the three layouts of the search', () => {
  it('icon: a 28px square with only the magnifying glass', () => {
    expect(win(".titlebar[data-search='icon'] .titlebar-search", 'width')).toBe(
      '28px'
    )
    expect(
      win(".titlebar[data-search='icon'] .titlebar-search span", 'display')
    ).toBe('none')
    expect(
      win(".titlebar[data-search='icon'] .titlebar-search kbd", 'display')
    ).toBe('none')
  })

  it('label: 160px wide, without the shortcut', () => {
    expect(
      win(".titlebar[data-search='label'] .titlebar-search", 'flex-basis')
    ).toBe('160px')
    expect(
      win(".titlebar[data-search='label'] .titlebar-search kbd", 'display')
    ).toBe('none')
  })

  it('full: up to 240px, with the shortcut', () => {
    expect(win('.titlebar-search', 'flex')).toBe('0 1 240px')
    expect(win('.titlebar-search kbd', 'display')).toBeUndefined()
  })
})

describe('what the frame replaced is gone', () => {
  it.each([
    '.search-box',
    '.section-toolbar',
    '.section-heading',
    '.tab-count',
    '.titlebar-brand',
    '.titlebar-mark',
    '.titlebar-title',
    '.titlebar-subtitle',
    '.titlebar-dock',
    '.tab-bar-line',
  ])('has no rule left for %s', (fragment) => {
    expect(
      rulesMatching(cascade, fragment).map((rule) => rule.selector)
    ).toEqual([])
  })

  it('has no width breakpoint that rewrites the bars any more', () => {
    for (const rule of cascade) {
      if (!rule.at.some((at) => /max-width:\s*(480|620)px/.test(at))) continue
      expect(rule.selector, rule.at.join(' ')).not.toMatch(
        /titlebar|workspace-nav|tab-button|tabbar|section-add|section-group-add/
      )
    }
  })
})

describe('the segmented control of the settings', () => {
  it('draws the selected option in soft with accent text', () => {
    expect(win('.segmented-option.active', 'background')).toBe(
      'var(--accent-soft)'
    )
    expect(win('.segmented-option.active', 'color')).toBe('var(--accent)')
  })

  it('keeps the selected option accent while the pointer is on it: hovering only lights the others', () => {
    // The pointer is still on the option that was just pressed, so a plain :hover rule would paint
    // the selected option in the text colour.
    for (const rule of rulesMatching(cascade, '.segmented-option'))
      for (const selector of splitSelectors(rule.selector))
        if (selector.includes(':hover'))
          expect(selector, rule.selector).toContain(':not(.active)')
    expect(
      win('.segmented-option:not(.active):hover:not(:disabled)', 'color')
    ).toBe('var(--text)')
  })
})
