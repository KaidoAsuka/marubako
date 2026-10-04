// motion-2: a press and a launch are answered on the card itself. These read the real stylesheets.
import { describe, expect, it } from 'vitest'

import {
  LAUNCH_FAILED_MS,
  LAUNCH_WINDOW_MS,
} from '../../hooks/use-launch-feedback'
import {
  declarations,
  lastValue,
  loadCascade,
  loadRules,
  splitSelectors,
} from './css-utils'

const cascade = loadCascade()
const motion = loadRules('motion.css')
const win = (selector: string, property: string) =>
  lastValue(cascade, selector, property)

const PRESS_TARGETS = [
  '.grid-main:active .grid-ico',
  '.widget-loose:active:not(:has(.widget-actions :active)) .widget-loose-box',
  '.folder-widget:active:not(:has(.widget-actions :active)) .widget-box',
  '.item-row[data-launchable]:active:not(:has(.item-actions :active)) .item-icon',
]

describe('the press', () => {
  const pressRule = motion.find((rule) =>
    splitSelectors(rule.selector).some((part) =>
      part.includes('.grid-main:active')
    )
  )!

  it('squeezes the icon of a card the pointer is pressing, and nothing while a drag is under way', () => {
    const selectors = splitSelectors(pressRule.selector)

    expect(selectors).toHaveLength(PRESS_TARGETS.length)
    for (const target of PRESS_TARGETS) {
      expect(selectors, target).toContain(`body:not(.dnd-active) ${target}`)
    }
  })

  it('does not squeeze for a press on the card’s own edit and delete buttons', () => {
    // :active bubbles from a child to its ancestors, so the cards with such buttons exclude them.
    for (const target of PRESS_TARGETS.slice(1)) {
      expect(target).toMatch(/:not\(:has\(\.(widget|item)-actions :active\)\)/)
    }
  })

  it('scales to 0.92 in the press duration', () => {
    const declared = Object.fromEntries(declarations(pressRule.body))

    expect(declared['transform']).toBe('scale(0.92)')
    expect(declared['transition-duration']).toBe('var(--motion-instant)')
  })

  it('shows the grabbing cursor only while something is really being dragged', () => {
    expect(win('.folder-widget:active', 'cursor')).toBeUndefined()
    expect(win('.widget-loose:active', 'cursor')).toBeUndefined()
    expect(win('body.dnd-active .folder-widget', 'cursor')).toBe('grabbing')
    expect(win('body.dnd-active .widget-loose', 'cursor')).toBe('grabbing')
  })
})

describe('the answer', () => {
  const keyframes = (name: string) =>
    motion.find((rule) => rule.selector === `@keyframes ${name}`)

  it('springs the icon back from the pressed size, so there is no jump on release', () => {
    expect(
      win(
        "[data-launch='launching'] :is(.grid-ico, .widget-loose-box, .item-icon)",
        'animation'
      )
    ).toBe('launchPop var(--motion-spring) var(--ease-spring)')
    expect(keyframes('launchPop')!.body.replace(/\s+/g, ' ')).toContain(
      'from { transform: scale(0.92); }'
    )
  })

  it('lights the card edge for as long as further clicks are swallowed', () => {
    const ring = win("[data-launch='launching']", 'animation')!

    expect(ring).toBe(`launchRing ${LAUNCH_WINDOW_MS}ms var(--ease-out)`)
    expect(keyframes('launchRing')!.body.replace(/\s+/g, ' ')).toContain(
      'border-color: var(--accent)'
    )
  })

  it('keeps a failed launch red for the time the hook says, over the hover line', () => {
    const selector =
      ":is(.grid-item, .widget-loose, .item-row)[data-launch='failed']"

    expect(win(selector, 'border-color')).toBe('var(--danger)')
    expect(LAUNCH_FAILED_MS).toBe(1200)
  })
})
