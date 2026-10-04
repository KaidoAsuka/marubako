// motion-4: hovering changes colour and nothing else, and the buttons on a card wait for the pointer
// to rest. These read the real stylesheets in cascade order.
import { describe, expect, it } from 'vitest'

import {
  declarations,
  lastValue,
  loadCascade,
  loadRules,
  splitSelectors,
} from './css-utils'

const cascade = loadCascade()
const win = (selector: string, property: string) =>
  lastValue(cascade, selector, property)

const CARDS = [
  '.folder-widget',
  '.widget-loose',
  '.grid-item',
  '.item-row',
  '.task-card',
  '.group-card',
]
const CARD_LIST =
  ':is(.folder-widget, .widget-loose, .grid-item, .item-row, .task-card, .group-card)'

describe('hovering moves nothing', () => {
  it('has no hover rule that moves or scales a card, a tab or an icon', () => {
    const movers = cascade
      .filter((rule) =>
        splitSelectors(rule.selector).some(
          (part) =>
            part.includes(':hover') &&
            // The emoji picker's cells are 20px glyphs inside a popover: not what this is about.
            !part.includes('emoji-picker') &&
            [
              ...CARDS,
              '.widget-card',
              '.tab-button',
              '.widget-box',
              '.grid-ico',
            ].some((name) => part.includes(name))
        )
      )
      .filter((rule) =>
        declarations(rule.body).some(
          ([name, value]) => name === 'transform' && value !== 'none'
        )
      )
      .map((rule) => rule.selector)

    expect(movers).toEqual([])
  })

  it('draws no transform transition for a tab icon any more', () => {
    for (const rule of loadRules('motion.css')) {
      if (rule.at.length > 0) continue
      const parts = splitSelectors(rule.selector)
      if (!parts.includes('.tab-button-icon')) continue
      expect(rule.selector).toBe('.tab-button-icon')
    }
    expect(win('.tab-button-icon', 'transition')).toBeUndefined()
    expect(win('.group-card-chevron', 'transition')).toBe(
      'transform var(--motion-fast) var(--ease-out)'
    )
  })

  it('fades a card’s fill and line in 90ms on hover and out in the fast duration, and nothing else', () => {
    expect(win(CARD_LIST, 'transition')).toBe(
      'background-color var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out)'
    )
    expect(win(`${CARD_LIST}:hover`, 'transition-duration')).toBe(
      'var(--motion-instant)'
    )
    // The per-file card transitions are gone, so nothing else is faded or moved.
    for (const name of CARDS) {
      expect(win(name, 'transition'), name).toBeUndefined()
    }
  })

  it('lets the name keep its width when the buttons appear', () => {
    const padded = cascade
      .filter((rule) =>
        splitSelectors(rule.selector).some(
          (part) =>
            /:(hover|focus-within)/.test(part) &&
            /\.(widget-name|grid-name)\b/.test(part)
        )
      )
      .filter((rule) =>
        declarations(rule.body).some(([name]) => name === 'padding-right')
      )
      .map((rule) => rule.selector)

    expect(padded).toEqual([])
    // Instead, the group takes the colour of the hovered card and covers the tail of the name.
    expect(win('.widget-actions', 'background')).toBe('var(--hover-bg)')
    expect(win('.grid-actions', 'background')).toBe('var(--hover-bg)')
    expect(win('.folder-widget:hover', 'background')).toBe('var(--hover-bg)')
    expect(win('.widget-action-button', 'background')).toBe('transparent')
  })
})

describe('the buttons on a card', () => {
  const GROUPS = ['.widget-actions', '.grid-actions']

  it('are not pressable while invisible, and fade in 90ms', () => {
    for (const group of GROUPS) {
      expect(win(group, 'opacity'), group).toBe('0')
      expect(win(group, 'pointer-events'), group).toBe('none')
      expect(win(group, 'transition'), group).toBe(
        'opacity var(--motion-instant) var(--ease-out), pointer-events 0s linear var(--motion-instant)'
      )
      expect(win(group, 'transition-behavior'), group).toBe('allow-discrete')
    }
  })

  it('show after the pointer has rested for 150ms, but not for a pointer that just passes', () => {
    expect(lastValue(loadRules('themes.css'), ':root', '--hover-intent')).toBe(
      '150ms'
    )
    for (const selector of [
      '.folder-widget:hover .widget-actions',
      '.widget-loose:hover .widget-actions',
      '.grid-item:hover .grid-actions',
    ]) {
      expect(win(selector, 'pointer-events'), selector).toBe('auto')
      expect(win(selector, 'transition-delay'), selector).toBe(
        'var(--hover-intent)'
      )
    }
  })

  it('show at once for keyboard focus, and stay in the tab order', () => {
    for (const selector of [
      '.folder-widget:focus-within .widget-actions',
      '.widget-loose:focus-within .widget-actions',
      '.grid-item:focus-within .grid-actions',
    ]) {
      expect(win(selector, 'opacity'), selector).toBe('1')
      expect(win(selector, 'pointer-events'), selector).toBe('auto')
      expect(win(selector, 'transition-delay'), selector).toBe('0s')
    }
    // visibility: hidden would take the buttons out of the tab order.
    for (const group of GROUPS) {
      expect(win(group, 'visibility'), group).toBeUndefined()
      expect(win(group, 'display'), group).not.toBe('none')
    }
  })
})
