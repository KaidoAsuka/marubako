// The monokai accent choice is a whole palette: besides the accent (background-theme.ts) it sets the
// three layers, the lines, the text levels and the text on the yellow fills (themes.css), and the
// code colours (code.css). The generic accent tests check the other five choices against the
// theme's own surfaces and with white text on the fill; these recompute the same roles for monokai
// from its own values. Vitest does not load .css files, so the stylesheets are read from disk.
import { describe, expect, it } from 'vitest'

import { ACCENT_CHOICES, getBackgroundUiVariables } from '../background-theme'
import {
  compareSpecificity,
  contrast,
  declarations,
  hoverFill,
  lastValue,
  loadCascade,
  loadRules,
  mixOpaque,
  over,
  paletteSelector,
  paletteValue,
  parseColor,
  specificity,
  splitSelectors,
  type CssRule,
  type Rgba,
} from './css-utils'

const KEY = 'monokai'
const THEMES = ['dark', 'light'] as const
type ThemeName = (typeof THEMES)[number]

const themes = loadRules('themes.css')
const code = loadRules('code.css')
const cascade = loadCascade()

/** What the palette's own block declares for a theme, in one stylesheet. */
function ownTokens(rules: CssRule[], theme: ThemeName): Map<string, string> {
  return new Map(
    rules
      .filter(
        (rule) =>
          rule.at.length === 0 &&
          splitSelectors(rule.selector).includes(paletteSelector(theme, KEY))
      )
      .flatMap((rule) => declarations(rule.body))
  )
}

/** A token as the app root has it with monokai chosen: the palette's value, else the theme's. */
const token = (theme: ThemeName, name: string): string =>
  paletteValue(themes, theme, KEY, name)!
const codeToken = (theme: ThemeName, name: string): string =>
  paletteValue(code, theme, KEY, name)!
const accent = (theme: ThemeName): string =>
  getBackgroundUiVariables(theme, KEY)['--accent']!
const solid = (theme: ThemeName): string =>
  getBackgroundUiVariables(theme, KEY)['--accent-solid']!

const LAYERS = ['--sidebar-bg', '--workspace-bg', '--card-bg'] as const

/** The share of the accent in a `color-mix(in srgb, var(--accent) N%, transparent)` tint. */
function accentShare(value: string | undefined): number {
  const match =
    /^color-mix\(in srgb, var\(--accent\) (\d+)%, transparent\)$/.exec(
      value ?? ''
    )
  if (!match) throw new Error(`Not an accent tint: ${value}`)

  return Number(match[1]) / 100
}

describe('the monokai choice', () => {
  it('is the yellow of the Monokai family: light on the dark theme, a brown that reads on the light one', () => {
    expect(ACCENT_CHOICES.monokai).toEqual({
      dark: '#ffd866',
      light: '#7a4800',
      solidDark: '#ffd866',
      solidLight: '#f2bd3a',
    })
  })

  it.each(THEMES)(
    'has a block of its own for the %s theme, on the element that carries the theme and the choice',
    (theme) => {
      // App.tsx puts `theme-<theme>` and `data-background` on the same three elements (html, body
      // and the app root), which is what this selector needs.
      expect(paletteSelector(theme, KEY)).toBe(
        `.theme-${theme}[data-background='monokai']`
      )
      expect(ownTokens(themes, theme).size, 'themes.css').toBeGreaterThan(0)
      expect(ownTokens(code, theme).size, 'code.css').toBeGreaterThan(0)
    }
  )

  it.each(THEMES)(
    'sets the three layers, the two lines, the three text levels and the text on the fills for the %s theme',
    (theme) => {
      const own = ownTokens(themes, theme)

      for (const name of [
        ...LAYERS,
        '--line',
        '--line-strong',
        '--text',
        '--text-mid',
        '--text-dim',
        '--on-accent',
      ]) {
        expect(own.has(name), `${theme} ${name}`).toBe(true)
      }
    }
  )

  it.each(THEMES)(
    'sets only base tokens for the %s theme: every value is a colour, and what is derived stays derived',
    (theme) => {
      const own = ownTokens(themes, theme)

      for (const [name, value] of own) {
        expect(
          () => parseColor(value),
          `${theme} ${name}: ${value}`
        ).not.toThrow()
      }
      // The accent itself comes from background-theme.ts, like every other choice; the hover, soft
      // and border steps and the two neutral tints are worked out by the theme blocks from the
      // values above. Listing one of them here would freeze it for this palette.
      for (const derived of [
        '--accent',
        '--accent-solid',
        '--accent-solid-hover',
        '--accent-soft',
        '--accent-border',
        '--hover-bg',
        '--neutral-soft',
      ]) {
        expect(own.has(derived), `${theme} ${derived}`).toBe(false)
      }
    }
  )
})

describe.each(THEMES)('monokai in the %s theme', (theme) => {
  const layers = LAYERS.map((name) => [name, token(theme, name)] as const)

  it('keeps the three text levels at 4.5:1 or better on each of its layers', () => {
    for (const name of ['--text', '--text-mid', '--text-dim']) {
      for (const [layer, fill] of layers) {
        expect(
          contrast(token(theme, name), fill),
          `${name} on ${layer} (${token(theme, name)} on ${fill})`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('keeps dim text at 4.5:1 or better on the tinted surfaces: a hovered card and the soft fill on the canvas', () => {
    // The yellow tints lift a surface more than the tints of the other accents do, so the dim
    // text of this palette is checked on them as well as on the plain layers.
    const dim = token(theme, '--text-dim')
    const hover =
      /^color-mix\(in srgb, var\(--card-bg\), var\(--accent\) (\d+)%\)$/.exec(
        token(theme, '--hover-bg')
      )
    expect(hover, token(theme, '--hover-bg')).not.toBeNull()
    const hovered = mixOpaque(
      parseColor(accent(theme)),
      Number(hover![1]) / 100,
      parseColor(token(theme, '--card-bg'))
    )
    const soft = mixOpaque(
      parseColor(accent(theme)),
      accentShare(token(theme, '--accent-soft')),
      parseColor(token(theme, '--workspace-bg'))
    )

    expect(contrast(dim, hovered), '--hover-bg').toBeGreaterThanOrEqual(4.5)
    expect(
      contrast(dim, soft),
      '--accent-soft over the canvas'
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the mid text of a selected search row at 4.5:1 or better on its soft fill', () => {
    // The search palette is a card; the subtitle of its selected row is drawn in --text-mid
    // (review-fixes.test.ts) on the soft fill.
    expect(
      lastValue(
        cascade,
        '.command-result.selected .command-result-copy > span',
        'color'
      )
    ).toBe('var(--text-mid)')
    const selected = mixOpaque(
      parseColor(accent(theme)),
      accentShare(token(theme, '--accent-soft')),
      parseColor(token(theme, '--card-bg'))
    )

    expect(
      contrast(token(theme, '--text-mid'), selected)
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('leaves an input visibly sunk into a dialog, by fill and by line', () => {
    const card = parseColor(token(theme, '--card-bg'))
    const line = over(parseColor(token(theme, '--line-strong')), card)

    expect(
      contrast(token(theme, '--workspace-bg'), token(theme, '--card-bg'))
    ).toBeGreaterThan(1.05)
    expect(contrast(line, card)).toBeGreaterThan(1.2)
  })

  it('reads as accent text on each of its layers', () => {
    for (const [layer, fill] of layers) {
      expect(
        contrast(accent(theme), fill),
        `${accent(theme)} on ${layer} ${fill}`
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('reads as accent text on the soft fill over each layer, and on the tab marker', () => {
    const soft = accentShare(token(theme, '--accent-soft'))
    const marker = accentShare(
      lastValue(cascade, '.tabbar::before', 'background')
    )
    // The marker is a little stronger than the soft fill (accent-usage.test.ts).
    expect(marker).toBeGreaterThan(soft)

    for (const [layer, fill] of layers) {
      const tint = mixOpaque(parseColor(accent(theme)), soft, parseColor(fill))

      expect(
        contrast(accent(theme), tint),
        `soft fill over ${layer}`
      ).toBeGreaterThanOrEqual(4.5)
    }
    // The tab row is a sunken bar.
    expect(
      contrast(
        accent(theme),
        mixOpaque(
          parseColor(accent(theme)),
          marker,
          parseColor(token(theme, '--sidebar-bg'))
        )
      ),
      'tab marker'
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('carries its own dark text on the yellow fill, resting and hovered, where white would not read', () => {
    const onAccent = token(theme, '--on-accent')
    const hover: Rgba = hoverFill(
      token(theme, '--accent-solid-hover'),
      solid(theme)
    )

    // The reason this palette has an --on-accent of its own.
    expect(contrast('#ffffff', solid(theme))).toBeLessThan(3)
    expect(onAccent).not.toBe(lastValue(themes, ':root', '--on-accent'))

    expect(contrast(onAccent, solid(theme)), 'resting').toBeGreaterThanOrEqual(
      4.5
    )
    expect(contrast(onAccent, hover), 'hovered').toBeGreaterThanOrEqual(4.5)
  })

  it('is told apart from its hover: one step lighter on dark, one step darker on light', () => {
    const lum = (colour: string | Rgba) => contrast(colour, '#000000') // monotonic in luminance
    const hover = hoverFill(token(theme, '--accent-solid-hover'), solid(theme))

    if (theme === 'dark') expect(lum(hover)).toBeGreaterThan(lum(solid(theme)))
    else expect(lum(hover)).toBeLessThan(lum(solid(theme)))
  })

  it('colours code as the editors do, every colour at 4.5:1 or better on its code background', () => {
    const background = codeToken(theme, '--code-bg')

    expect(ownTokens(code, theme).has('--code-bg')).toBe(true)
    for (const name of [
      '--code-comment',
      '--code-string',
      '--code-number',
      '--code-keyword',
      '--code-variable',
    ]) {
      expect(ownTokens(code, theme).has(name), name).toBe(true)
      expect(
        contrast(codeToken(theme, name), background),
        `${name} (${codeToken(theme, name)} on ${background})`
      ).toBeGreaterThanOrEqual(4.5)
    }
    // Plain code is drawn in the text colour.
    expect(contrast(token(theme, '--text'), background)).toBeGreaterThanOrEqual(
      4.5
    )
  })
})

describe('monokai on the dark theme', () => {
  it('brings status colours of its family that read at 4.5:1 or better on each of its layers', () => {
    const own = ownTokens(themes, 'dark')

    for (const name of ['--success', '--warning', '--danger']) {
      expect(own.has(name), name).toBe(true)
      for (const layer of LAYERS) {
        expect(
          contrast(token('dark', name), token('dark', layer)),
          `${name} on ${layer}`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('needs no help to mark a value: its yellow fill stands out at 3:1 or better on each layer', () => {
    for (const layer of LAYERS) {
      expect(
        contrast(solid('dark'), token('dark', layer)),
        layer
      ).toBeGreaterThanOrEqual(3)
    }
    // So the rules that help the light theme have no dark twin.
    for (const rule of cascade) {
      for (const selector of splitSelectors(rule.selector)) {
        if (selector === paletteSelector('dark', KEY)) continue
        expect(selector).not.toContain(paletteSelector('dark', KEY))
      }
    }
  })
})

// On the light theme the yellow fill is too close to the paper to mark a value by itself (a slider's
// filled part, the chosen day, a switch that is on). Those are drawn, or outlined, in the darker
// accent; text on the yellow fill is dark and reads well (see above).
describe('monokai on the light theme: what marks a value', () => {
  const scope = paletteSelector('light', KEY)
  const win = (selector: string, property: string) =>
    lastValue(cascade, selector, property)
  const layers = LAYERS.map((name) => [name, token('light', name)] as const)

  it('is not the yellow fill alone, which stays under 3:1 on every layer', () => {
    for (const [layer, fill] of layers) {
      expect(contrast(solid('light'), fill), layer).toBeLessThan(3)
    }
  })

  it('is the accent, which reaches 3:1 on the card and on the other layers', () => {
    expect(accent('light')).toBe('#7a4800')
    for (const [layer, fill] of layers) {
      expect(contrast(accent('light'), fill), layer).toBeGreaterThanOrEqual(3)
    }
  })

  it('draws the filled part of a slider and its thumb in the accent', () => {
    const track = "input[type='range']::-webkit-slider-runnable-track"
    const thumb = "input[type='range']::-webkit-slider-thumb"
    const usual = win(`.range-row ${track}`, 'background')!

    // The same track as everywhere else, with the accent in place of the yellow fill.
    expect(usual).toContain('var(--accent-solid) calc(')
    expect(win(`${scope} .range-row ${track}`, 'background')).toBe(
      usual.replace('var(--accent-solid)', 'var(--accent)')
    )
    expect(win(`.range-row ${thumb}`, 'background')).toBe('var(--accent-solid)')
    expect(win(`${scope} .range-row ${thumb}`, 'background')).toBe(
      'var(--accent)'
    )
  })

  it.each([
    '.calendar-day.active',
    '.setting-switch-row input:checked',
    '.category-switch input:checked',
    '.shortcut-switch:checked',
  ])('outlines %s in the accent, around its yellow fill', (selector) => {
    // The fill and its dark text stay; only the line changes.
    expect(win(selector, 'background')).toBe('var(--accent-solid)')
    expect(win(selector, 'border-color')).toBe('var(--accent-solid)')
    expect(win(`${scope} ${selector}`, 'border-color')).toBe('var(--accent)')
    expect(win(`${scope} ${selector}`, 'background')).toBeUndefined()
  })

  it('outranks the rules it adjusts, wherever they stand in the stylesheets', () => {
    for (const selector of [
      ".range-row input[type='range']::-webkit-slider-runnable-track",
      ".range-row input[type='range']::-webkit-slider-thumb",
      '.calendar-day.active',
      '.setting-switch-row input:checked',
      '.category-switch input:checked',
      '.shortcut-switch:checked',
    ]) {
      expect(
        compareSpecificity(
          specificity(`${scope} ${selector}`),
          specificity(selector)
        ),
        selector
      ).toBeGreaterThan(0)
    }
  })

  it('covers every fill of the solid accent that carries no text', () => {
    // Where the solid accent is a fill, it either carries text in --on-accent (a button, the chosen
    // day, the tick of a finished step), or it is one of the marks above.
    const marks = [
      ".range-row input[type='range']::-webkit-slider-runnable-track",
      ".range-row input[type='range']::-webkit-slider-thumb",
      '.setting-switch-row input:checked',
      '.category-switch input:checked',
      '.shortcut-switch:checked',
    ]
    const bare = cascade
      .filter(
        (rule) =>
          rule.at.length === 0 &&
          !rule.selector.includes(scope) &&
          declarations(rule.body).some(
            ([name, value]) =>
              /^background(-color)?$/.test(name) &&
              /var\(--accent-solid\)/.test(value)
          ) &&
          !declarations(rule.body).some(
            ([name, value]) => name === 'color' && value === 'var(--on-accent)'
          )
      )
      .flatMap((rule) => splitSelectors(rule.selector))
      // The tick of a finished first-run step takes its colour from the rule of the circle.
      .filter((selector) => !selector.includes('.onboarding-check'))

    expect(bare.sort()).toEqual([...marks].sort())
  })
})
