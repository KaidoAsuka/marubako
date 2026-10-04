// motion-3: a copy is confirmed on the button that was pressed. These read the real stylesheets.
import { describe, expect, it } from 'vitest'

import {
  compareSpecificity,
  contrast,
  declarations,
  lastValue,
  loadCascade,
  loadRules,
  over,
  paletteValue,
  parseColor,
  specificity,
  splitSelectors,
  type CssRule,
} from './css-utils'

const cascade = loadCascade()
const themes = loadRules('themes.css')
const dark = (name: string) => lastValue(themes, ':root', name)!
const light = (name: string) => lastValue(themes, '.theme-light', name)!
const motion = loadRules('motion.css')

const COPIED_BUTTON =
  ':is(.icon-button, .snippet-copy, .credential-copy)[data-copied]'

const copiedRules = motion.filter((rule) =>
  splitSelectors(rule.selector).some((part) => part.includes('[data-copied]'))
)

describe('the copied state', () => {
  it('turns a copy button green: text, line and a 10% tint', () => {
    const textRule = motion.find((rule) =>
      splitSelectors(rule.selector).includes(
        ':is(.icon-button, .snippet-copy)[data-copied]'
      )
    )!
    const frameRule = motion.find((rule) =>
      splitSelectors(rule.selector).includes(COPIED_BUTTON)
    )!

    expect(Object.fromEntries(declarations(textRule.body))['color']).toBe(
      'var(--success)'
    )
    const frame = Object.fromEntries(declarations(frameRule.body))
    expect(frame['border-color']).toBe(
      'color-mix(in srgb, var(--success) 40%, transparent)'
    )
    expect(frame['background-color']).toBe(
      'color-mix(in srgb, var(--success) 10%, transparent)'
    )
  })

  it('outranks every :hover rule of the buttons it applies to, because the pointer is on them', () => {
    const hoverRules: CssRule[] = cascade.filter((rule) =>
      splitSelectors(rule.selector).some(
        (part) =>
          part.includes(':hover') &&
          /(^|[^\w-])\.(icon-button|snippet-copy|credential-copy)\b/.test(
            part
          ) &&
          !part.includes('data-copied')
      )
    )
    const copiedHover = splitSelectors(
      motion.find((rule) =>
        splitSelectors(rule.selector).some((part) =>
          part.includes('[data-copied]:hover')
        )
      )!.selector
    ).find(
      (part) => part.includes('[data-copied]:hover') && !part.endsWith('svg')
    )!

    expect(hoverRules.length).toBeGreaterThan(0)
    for (const rule of hoverRules) {
      for (const part of splitSelectors(rule.selector)) {
        if (!part.includes(':hover')) continue
        expect(
          compareSpecificity(specificity(copiedHover), specificity(part)),
          `${copiedHover} against ${part}`
        ).toBeGreaterThan(0)
      }
    }
  })

  it('draws the tick on the spring and fades it in separately, so opacity never overshoots', () => {
    const svgRule = motion.find((rule) =>
      splitSelectors(rule.selector).some((part) =>
        part.endsWith('[data-copied] svg')
      )
    )!
    const declared = Object.fromEntries(declarations(svgRule.body))
    const keyframes = (name: string) =>
      motion
        .find((rule) => rule.selector === `@keyframes ${name}`)!
        .body.replace(/\s+/g, ' ')

    expect(declared['color']).toBe('var(--success)')
    expect(declared['animation']).toBe(
      'tickPop var(--motion-spring) var(--ease-spring), tickFade var(--motion-fast) var(--ease-out)'
    )
    expect(keyframes('tickPop')).toContain('from { transform: scale(0.5); }')
    expect(keyframes('tickPop')).not.toContain('opacity')
    expect(keyframes('tickFade')).toContain('from { opacity: 0.4; }')
    expect(keyframes('tickFade')).not.toContain('transform')
  })

  it('recolours a credential row’s text on the dark theme only', () => {
    const recolour = copiedRules.filter((rule) =>
      splitSelectors(rule.selector).some((part) =>
        part.includes('.credential-value')
      )
    )

    expect(recolour.map((rule) => rule.selector)).toEqual([
      '.theme-dark .credential-copy[data-copied] .credential-value',
    ])
    // No rule gives the button of a credential row a colour of its own: its value inherits it.
    for (const rule of copiedRules) {
      if (
        !splitSelectors(rule.selector).some((part) =>
          part.includes('.credential-copy')
        )
      )
        continue
      if (
        rule.selector.includes('.credential-value') ||
        rule.selector.includes('svg')
      )
        continue
      expect(Object.fromEntries(declarations(rule.body))).not.toHaveProperty(
        'color'
      )
    }
  })

  it('keeps the green text above 4.5:1 on its tint, in both themes', () => {
    for (const [read, name] of [
      [dark, 'dark'],
      [light, 'light'],
    ] as const) {
      const card = parseColor(read('--card-bg'))
      const tint = parseColor(read('--success'))
      const tinted = over({ ...tint, a: 0.1 }, card)

      expect(
        contrast(read('--success'), tinted),
        `${name} success on its 10% tint`
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps it above 4.5:1 in the monokai palette too, on that palette’s card and in its green', () => {
    for (const theme of ['dark', 'light'] as const) {
      const read = (name: string) =>
        paletteValue(themes, theme, 'monokai', name)!
      const tinted = over(
        { ...parseColor(read('--success')), a: 0.1 },
        parseColor(read('--card-bg'))
      )

      expect(
        contrast(read('--success'), tinted),
        `monokai ${theme} success on its 10% tint`
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('the announcement', () => {
  it('has a visually hidden text class that still counts for screen readers', () => {
    expect(lastValue(cascade, '.sr-only', 'position')).toBe('absolute')
    expect(lastValue(cascade, '.sr-only', 'width')).toBe('1px')
    expect(lastValue(cascade, '.sr-only', 'overflow')).toBe('hidden')
    expect(lastValue(cascade, '.sr-only', 'clip')).toBe('rect(0, 0, 0, 0)')
    expect(lastValue(cascade, '.sr-only', 'display')).toBeUndefined()
    expect(lastValue(cascade, '.sr-only', 'visibility')).toBeUndefined()
  })
})
