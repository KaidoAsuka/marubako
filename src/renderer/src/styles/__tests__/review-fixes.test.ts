// Iteration 4 phase A review follow-ups: keyboard focus, reduced motion and small-text contrast.
// These read the real stylesheets in cascade order.
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { BACKGROUNDS } from '../../../../shared/types'
import { getBackgroundUiVariables } from '../background-theme'
import {
  CASCADE_ORDER,
  contrast,
  lastValue,
  loadCascade,
  loadRules,
  mixOpaque,
  over,
  parseColor,
  rulesMatching,
} from './css-utils'

const cascade = loadCascade()
const win = (selector: string, property: string, at: string[] = []) =>
  lastValue(cascade, selector, property, at)
const REDUCED = '@media (prefers-reduced-motion: reduce)'

describe('the stylesheet order the tests assume', () => {
  it('is the order main.tsx imports them in, with themes.css first', () => {
    const main = readFileSync(path.resolve(__dirname, '../../main.tsx'), 'utf8')
    const imported = [...main.matchAll(/import '\.\/styles\/([\w-]+\.css)'/g)]
      .map((match) => match[1])
      .filter((name) => name !== 'themes.css')

    expect(CASCADE_ORDER).toEqual(['themes.css', ...imported])
  })
})

describe('keyboard focus', () => {
  it('is drawn inside hosts that sit flush in an overflow:hidden card, which would clip it', () => {
    for (const selector of [
      '.group-card-header:focus-visible',
      '.snippet-expand:focus-visible',
    ]) {
      expect(win(selector, 'outline-offset'), selector).toBe('-2px')
    }
    expect(win('.group-card-header', 'border-radius')).toBe('11px')
  })

  it('shows on the icon picker trigger: nothing switches the outline off', () => {
    expect(win('.emoji-picker-trigger:focus', 'outline')).toBeUndefined()
    expect(win('.item-form .emoji-picker-trigger:focus', 'border-color')).toBe(
      'var(--accent)'
    )
  })

  it('has room around the picker list for the ring of a glyph in the first column', () => {
    expect(win('.icon-picker-body', 'margin')).toBe('-4px')
    expect(win('.icon-picker-body', 'padding')).toBe('4px')
  })
})

describe('the popup tile', () => {
  it('draws its keyboard ring inside, where its own overflow:hidden cannot clip it', () => {
    expect(win('.grid-main:focus-visible', 'outline-offset')).toBe('-2px')
    expect(win('.grid-main:focus-visible', 'border-radius')).toBe('9px')
    expect(win('.grid-item:focus-visible', 'outline-offset')).toBe('-2px')
  })

  it('shows where a drop would land with an inset bar on that side, not a clipped bar outside', () => {
    expect(win('.grid-item.drop-before', 'box-shadow')).toBe(
      'inset 3px 0 0 var(--accent)'
    )
    expect(win('.grid-item.drop-after', 'box-shadow')).toBe(
      'inset -3px 0 0 var(--accent)'
    )
    expect(win('.grid-item.drop-before::before', 'content')).toBe('none')
    expect(win('.grid-item.drop-after::after', 'content')).toBe('none')
  })
})

describe('the window row at the zoom limit', () => {
  it('lets the buttons give way, so the close button stays inside a 320px window at 140%', () => {
    expect(win('.titlebar-actions', 'flex-shrink')).toBe('1')
    expect(win('.titlebar-actions', 'min-width')).toBe('0')
    expect(win('.titlebar-actions .icon-button', 'flex-shrink')).toBe('1')
    expect(win('.titlebar-actions .icon-button', 'min-width')).toBe('20px')
  })
})

describe('the search palette', () => {
  it('is never taller than its overlay, which a short window or the feedback strip makes small', () => {
    expect(win('.command-dialog', 'max-height')).toBe('min(82vh, 100%)')
  })
})

describe('prefers-reduced-motion', () => {
  it('still shows that a click was sent, as a static tint instead of the ring animation', () => {
    const selector =
      ":is(.grid-item, .widget-loose, .item-row)[data-launch='launching']"
    expect(win(selector, 'border-color', [REDUCED])).toBe('var(--accent)')
    expect(win(selector, 'background-color', [REDUCED])).toBe(
      'var(--accent-soft)'
    )
  })

  it('does not squeeze the icon of a list row on press either', () => {
    const rule = rulesMatching(
      loadRules('motion.css').filter((r) => r.at.join('|') === REDUCED),
      '.item-icon'
    )
    expect(
      rule.some((r) => /transform:\s*none\s*!important/.test(r.body))
    ).toBe(true)
  })
})

describe('the active tab', () => {
  it('reads at 4.5:1 on the marker in both themes and every accent colour', () => {
    const themes = loadRules('themes.css')
    const token = (theme: 'dark' | 'light', name: string) =>
      lastValue(themes, theme === 'light' ? '.theme-light' : ':root', name)!
    expect(win('.theme-light .tab-button.active', 'color')).toBe(
      'color-mix(in srgb, var(--accent) 60%, var(--text))'
    )

    for (const theme of ['dark', 'light'] as const) {
      for (const key of BACKGROUNDS) {
        const accent = parseColor(
          getBackgroundUiVariables(theme, key)['--accent']!
        )
        const bar = parseColor(token(theme, '--sidebar-bg'))
        const marker = over({ ...accent, a: 0.18 }, bar)
        const label =
          theme === 'light'
            ? mixOpaque(accent, 0.6, parseColor(token(theme, '--text')))
            : accent

        expect(
          contrast(label, marker),
          `${theme} ${key}`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})

describe('small text on a tinted or sunken surface', () => {
  it('colours the subtitle of the selected search row with the mid text', () => {
    expect(
      win('.command-result.selected .command-result-copy > span', 'color')
    ).toBe('var(--text-mid)')
  })

  it('keeps code comments at 4.5:1 on the code background in both themes', () => {
    const code = loadRules('code.css')
    for (const selector of [':root', '.theme-light']) {
      const comment = lastValue(code, selector, '--code-comment')!
      const background = lastValue(code, selector, '--code-bg')!
      expect(contrast(comment, background), selector).toBeGreaterThanOrEqual(
        4.5
      )
    }
  })
})
