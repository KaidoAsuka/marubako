// color-3: the accent has a use per role. Solid is for the one primary action, soft is for what is
// selected, an accent line is for keyboard focus, everything else is neutral. These read the real
// stylesheets in cascade order and check which value wins.
import { describe, expect, it } from 'vitest'

import {
  contrast,
  lastValue,
  loadCascade,
  loadRules,
  over,
  parseColor,
  splitSelectors,
} from './css-utils'

const cascade = loadCascade()
const win = (selector: string, property: string) =>
  lastValue(cascade, selector, property)
const themes = loadRules('themes.css')
const dark = (name: string) => lastValue(themes, ':root', name)!
const light = (name: string) => lastValue(themes, '.theme-light', name)!

const CARD_CLASSES = [
  '.item-row',
  '.folder-widget',
  '.widget-loose',
  '.grid-item',
  '.group-card',
  '.task-card',
]

describe('solid is for the primary action', () => {
  it('fills the dialog footer button, the empty-state button and the selected calendar day', () => {
    expect(win('.modal-actions .primary-button', 'background')).toBe(
      'var(--accent-solid)'
    )
    expect(win('.modal-actions .primary-button', 'color')).toBe(
      'var(--on-accent)'
    )
    expect(win('.empty-state-action', 'background')).toBe('var(--accent-solid)')
    expect(win('.calendar-day.active', 'background')).toBe(
      'var(--accent-solid)'
    )
    expect(win('.calendar-day.active', 'color')).toBe('var(--on-accent)')
    expect(win('.calendar-day.active .calendar-day-number', 'color')).toBe(
      'var(--on-accent)'
    )
  })

  it('lightens the fill on hover, but not while disabled', () => {
    for (const selector of [
      '.modal-actions .primary-button:hover:not(:disabled)',
      '.empty-state-action:hover:not(:disabled)',
    ]) {
      expect(win(selector, 'background'), selector).toBe(
        'var(--accent-solid-hover)'
      )
      expect(win(selector, 'color'), selector).toBe('var(--on-accent)')
    }
  })

  it('draws the empty-state button flat, as high as the toolbar buttons', () => {
    expect(win('.empty-state-action', 'background')).not.toContain('gradient')
    expect(win('.empty-state-action', 'border-radius')).toBe('8px')
    expect(win('.empty-state-action', 'min-height')).toBe('34px')
    expect(win('.primary-button', 'min-height')).toBe('34px')
  })
})

describe('soft is for what is selected or lightly offered', () => {
  it('draws the toolbar action in soft, without a line, with accent text', () => {
    expect(win('.primary-button', 'background')).toBe('var(--accent-soft)')
    expect(win('.primary-button', 'color')).toBe('var(--accent)')
    expect(win('.primary-button', 'border')).toBe('1px solid transparent')
  })

  it('draws an enabled icon button and the active tab in soft without a line', () => {
    expect(win('.icon-button.active', 'background')).toBe('var(--accent-soft)')
    expect(win('.icon-button.active', 'color')).toBe('var(--accent)')
    expect(win('.icon-button.active', 'border-color')).toBeUndefined()
    expect(win('.titlebar-actions .icon-button.active', 'background')).toBe(
      'var(--accent-soft)'
    )
    expect(win('.tabbar::before', 'border')).toBe('1px solid transparent')
    // With no line the marker would be 1.2:1 against the bar; a little more fill keeps it visible.
    expect(win('.tabbar::before', 'background')).toContain(
      'color-mix(in srgb, var(--accent) 18%'
    )
    expect(win('.tab-button.active', 'border-color')).toBe('transparent')
    expect(win('.tab-button.active', 'color')).toBe('var(--accent)')
  })

  it('fills a group tile soft, with a plain line at rest, to tell it from a loose entry', () => {
    // layout-2: a group is not selected, but it is the one tile that opens something, so it is lightly
    // offered. The line stays the neutral one: an accent line is for focus.
    expect(win('.folder-widget', 'background')).toBe('var(--accent-soft)')
    expect(win('.folder-widget', 'border')).toBe('1px solid var(--line)')
    expect(win('.widget-loose', 'background')).toBe('var(--card-bg)')
  })

  it('keeps the selected search row soft', () => {
    expect(win('.command-result.selected', 'background')).toBe(
      'var(--accent-soft)'
    )
  })
})

describe('an accent line is for keyboard focus', () => {
  it('has one focus outline for buttons, tabindex and fields', () => {
    const holders = cascade.filter((rule) =>
      splitSelectors(rule.selector).includes('button:focus-visible')
    )

    expect(holders).toHaveLength(1)
    for (const selector of [
      'button:focus-visible',
      '[tabindex]:focus-visible',
      'input:focus-visible',
      'textarea:focus-visible',
      'select:focus-visible',
    ]) {
      expect(win(selector, 'outline'), selector).toBe('2px solid var(--accent)')
      expect(win(selector, 'outline-offset'), selector).toBe('2px')
    }
  })

  it('changes a focused field border only, with no halo around it', () => {
    const halos = cascade
      .filter((rule) =>
        splitSelectors(rule.selector).some(
          (part) =>
            /:focus(-within)?\b/.test(part) &&
            !part.includes('dock-bubble') &&
            !part.includes('titlebar-dock')
        )
      )
      .filter((rule) => /box-shadow\s*:/.test(rule.body))
      .map((rule) => rule.selector)

    expect(halos).toEqual([])
    expect(win('.form-field input:focus', 'border-color')).toBe('var(--accent)')
    expect(win('.item-form .form-field input:focus', 'border-color')).toBe(
      'var(--accent)'
    )
  })
})

describe('everything else is neutral', () => {
  it('draws the icon on a group tile with no box and no line of its own', () => {
    // layout-2: the tile is the box now; the 24px icon sits straight on it.
    expect(win('.widget-box', 'background')).toBe('transparent')
    expect(win('.widget-box', 'border')).toBe('0')
  })

  it('draws the shortcut card on the canvas layer with a plain line', () => {
    expect(win('.shortcut-card', 'background')).toBe('var(--workspace-bg)')
    expect(win('.shortcut-card', 'border')).toBe('1px solid var(--line)')
  })

  it('frames the search palette with the strong line', () => {
    expect(win('.command-dialog', 'border')).toBe(
      '1px solid var(--line-strong)'
    )
  })

  it('hovers an icon button to the neutral hover fill and the text colour', () => {
    expect(win('.icon-button:hover', 'background')).toBe('var(--hover-bg)')
    expect(win('.icon-button:hover', 'color')).toBe('var(--text)')
    expect(win('.icon-button:hover', 'border-color')).toBeUndefined()
  })

  it('hovers a card by the strong line, never by an accent line', () => {
    const accentHovers = cascade
      .filter((rule) =>
        splitSelectors(rule.selector).some(
          (part) =>
            part.includes(':hover') &&
            CARD_CLASSES.some((card) => part.includes(card))
        )
      )
      .filter((rule) => /border-color\s*:\s*var\(--accent/.test(rule.body))
      .map((rule) => rule.selector)

    expect(accentHovers).toEqual([])
    expect(win('.folder-widget:hover', 'border-color')).toBe(
      'var(--line-strong)'
    )
    expect(win('.grid-item:hover', 'border-color')).toBe('var(--line-strong)')
    expect(win('.task-card:hover', 'border-color')).toBe('var(--line-strong)')
    expect(win('.item-row.command-item:hover', 'border-color')).toBe(
      'var(--line-strong)'
    )
  })

  it('keeps the card hover fill as the faint accent tint', () => {
    expect(win('.folder-widget:hover', 'background')).toBe('var(--hover-bg)')
  })
})

describe('destructive actions', () => {
  it('stay tinted red at rest, in a dialog footer too, and turn solid red on hover', () => {
    for (const selector of [
      '.primary-button.danger',
      '.modal-actions .primary-button.danger',
    ]) {
      expect(win(selector, 'color'), selector).toBe('var(--danger-text)')
      expect(win(selector, 'background'), selector).toBe(
        'color-mix(in srgb, var(--danger) 12%, transparent)'
      )
    }
    for (const selector of [
      '.primary-button.danger:hover:not(:disabled)',
      '.modal-actions .primary-button.danger:hover:not(:disabled)',
    ]) {
      expect(win(selector, 'background'), selector).toBe('var(--danger-solid)')
      expect(win(selector, 'color'), selector).toBe('var(--on-accent)')
    }
  })

  it('reads at 4.5:1 at rest, on the tint over every surface it can sit on', () => {
    for (const [name, read] of [
      ['dark', dark],
      ['light', light],
    ] as const) {
      const tint = { ...parseColor(read('--danger')), a: 0.12 }
      for (const surface of ['--sidebar-bg', '--workspace-bg', '--card-bg']) {
        const ground = over(tint, parseColor(read(surface)))
        expect(
          contrast(read('--danger-text'), ground),
          `${name} ${surface}`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('has a solid red that carries white text at 4.5:1 in both themes', () => {
    expect(dark('--danger-solid')).toBe('#cf3f52')
    expect(light('--danger-solid')).toBe('#c92f3f')
    for (const read of [dark, light]) {
      expect(
        contrast('#ffffff', read('--danger-solid'))
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})
