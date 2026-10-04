// color-4: the "background" setting is an accent colour: five solid choices, four values each, and
// no blob layer. The contrast figures are the ones listed in 17-design-improvements.md; this
// recomputes every one of them from the real values and the real theme tokens.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { BACKGROUNDS, type BackgroundKey } from '../../../../shared/types'
import * as backgroundTheme from '../background-theme'
import {
  ACCENT_CHOICES,
  getAccentSolid,
  getBackgroundUiVariables,
  resolveBackground,
  resolveTheme,
} from '../background-theme'
import {
  contrast,
  hoverFill,
  loadRules,
  lastValue,
  mixOpaque,
  parseColor,
  toHsl,
  type Rgba,
} from './css-utils'

const themes = loadRules('themes.css')
const tokens = (theme: 'dark' | 'light') => (name: string) =>
  lastValue(themes, theme === 'dark' ? ':root' : '.theme-light', name) ??
  lastValue(themes, ':root', name)!

/** What the CSS makes of `--accent-solid-hover` for a solid fill. */
const hoverOf = (theme: 'dark' | 'light', solid: string): Rgba =>
  hoverFill(tokens(theme)('--accent-solid-hover'), solid)

describe('what the setting is now', () => {
  it('keeps the five stored keys, so saved data and the data-background attribute still match', () => {
    expect(BACKGROUNDS).toEqual([
      'aurora',
      'sunset',
      'forest',
      'ocean',
      'minimal',
    ])
    expect(Object.keys(ACCENT_CHOICES)).toEqual([...BACKGROUNDS])
  })

  it('is a table of four values per choice and nothing else', () => {
    for (const key of BACKGROUNDS) {
      const choice = ACCENT_CHOICES[key]

      expect(Object.keys(choice).sort(), key).toEqual([
        'dark',
        'light',
        'solidDark',
        'solidLight',
      ])
      for (const value of Object.values(choice)) {
        expect(value, key).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('exports no blob layer, no base colours and no visual presets any more', () => {
    expect(Object.keys(backgroundTheme).sort()).toEqual([
      'ACCENT_CHOICES',
      'getAccentSolid',
      'getBackgroundUiVariables',
      'resolveBackground',
      'resolveTheme',
    ])
  })

  it('has no Background component, no .app-bg or .blob rule and no text pill left', () => {
    const root = resolve(process.cwd(), 'src/renderer/src')

    expect(existsSync(resolve(root, 'components/layout/Background.tsx'))).toBe(
      false
    )
    for (const file of readdirSync(resolve(root, 'styles')).filter((name) =>
      name.endsWith('.css')
    )) {
      const css = readFileSync(resolve(root, 'styles', file), 'utf8')
      for (const dead of [
        '.app-bg',
        '.blob',
        '.swatch-button',
        '.swatch-row',
      ]) {
        expect(css.includes(dead), `${file} ${dead}`).toBe(false)
      }
    }
    const app = readFileSync(resolve(root, 'App.tsx'), 'utf8')
    expect(app).not.toContain('<Background')
    expect(app).not.toContain('layout/Background')
  })
})

describe('lookups', () => {
  it.each(['xxx', '', 'constructor', '__proto__', 'toString', 42, null])(
    'falls back to aurora for the stored background %j',
    (value) => {
      const background = value as unknown as BackgroundKey

      expect(resolveBackground(value)).toBe('aurora')
      expect(getAccentSolid('dark', background)).toBe(
        ACCENT_CHOICES.aurora.solidDark
      )
      expect(getBackgroundUiVariables('dark', background)).toEqual(
        getBackgroundUiVariables('dark', 'aurora')
      )
      expect(getBackgroundUiVariables('light', background)).toEqual(
        getBackgroundUiVariables('light', 'aurora')
      )
    }
  )

  it('falls back to dark for an unknown theme', () => {
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
    expect(resolveTheme('sepia')).toBe('dark')
    expect(resolveTheme(undefined)).toBe('dark')
  })

  it('sets only --accent and --accent-solid, in the colours of the theme', () => {
    for (const key of BACKGROUNDS) {
      expect(getBackgroundUiVariables('dark', key), key).toEqual({
        '--accent': ACCENT_CHOICES[key].dark,
        '--accent-solid': ACCENT_CHOICES[key].solidDark,
      })
      expect(getBackgroundUiVariables('light', key), key).toEqual({
        '--accent': ACCENT_CHOICES[key].light,
        '--accent-solid': ACCENT_CHOICES[key].solidLight,
      })
    }
  })

  it('agrees with themes.css for the default, violet', () => {
    // The two files must not drift: the default accent is written in both places.
    for (const theme of ['dark', 'light'] as const) {
      const read = tokens(theme)
      const vars = getBackgroundUiVariables(theme, 'aurora')

      expect(vars['--accent']).toBe(read('--accent'))
      expect(vars['--accent-solid']).toBe(read('--accent-solid'))
    }
  })
})

// [dark text on canvas / card / active tab, light text on white / active tab, white on solid]
// as listed in the color-4 spec and its review note.
const SPEC: Record<
  BackgroundKey,
  {
    darkText: [number, number, number]
    lightText: [number, number]
    solid: [number, number]
  }
> = {
  aurora: {
    darkText: [7.06, 6.41, 5.89],
    lightText: [6.51, 5.03],
    solid: [5.37, 6.51],
  },
  ocean: {
    darkText: [8.59, 7.8, 6.94],
    lightText: [6.48, 5.01],
    solid: [5.17, 6.7],
  },
  forest: {
    darkText: [9.87, 8.97, 7.81],
    lightText: [5.95, 4.63],
    solid: [5.36, 5.36],
  },
  sunset: {
    darkText: [9.3, 8.46, 7.47],
    lightText: [6.45, 4.96],
    solid: [5.18, 5.18],
  },
  minimal: {
    darkText: [9.66, 8.78, 7.64],
    lightText: [7.58, 5.86],
    solid: [6.34, 7.58],
  },
}

describe.each(BACKGROUNDS)('the %s accent', (key) => {
  const dark = tokens('dark')
  const light = tokens('light')
  const choice = ACCENT_CHOICES[key]
  const spec = SPEC[key]
  // The soft fill behind a selected tab: the accent at --accent-soft's strength over the tab bar.
  const activeTab = (theme: 'dark' | 'light') => {
    const read = tokens(theme)
    const share = Number(/(\d+)%/.exec(read('--accent-soft'))![1])

    return mixOpaque(
      parseColor(theme === 'dark' ? choice.dark : choice.light),
      share / 100,
      parseColor(read('--sidebar-bg'))
    )
  }

  it('reads as text on the dark canvas, the card and the selected tab', () => {
    const text = choice.dark
    const [canvas, card, tab] = spec.darkText

    expect(contrast(text, dark('--workspace-bg'))).toBeCloseTo(canvas, 1)
    expect(contrast(text, dark('--card-bg'))).toBeCloseTo(card, 1)
    expect(contrast(text, activeTab('dark'))).toBeCloseTo(tab, 1)
    for (const surface of [
      contrast(text, dark('--workspace-bg')),
      contrast(text, dark('--card-bg')),
      contrast(text, activeTab('dark')),
    ]) {
      expect(surface).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('reads as text on the light card and the selected tab', () => {
    const text = choice.light
    const [card, tab] = spec.lightText

    expect(contrast(text, light('--card-bg'))).toBeCloseTo(card, 1)
    expect(contrast(text, activeTab('light'))).toBeCloseTo(tab, 1)
    expect(contrast(text, light('--card-bg'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(text, light('--workspace-bg'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(text, activeTab('light'))).toBeGreaterThanOrEqual(4.5)
  })

  it('carries white text on its solid fill in both themes, resting and hovered', () => {
    const [onDark, onLight] = spec.solid

    expect(contrast('#ffffff', choice.solidDark)).toBeCloseTo(onDark, 1)
    expect(contrast('#ffffff', choice.solidLight)).toBeCloseTo(onLight, 1)
    expect(
      contrast('#ffffff', hoverOf('dark', choice.solidDark)),
      'dark hover'
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrast('#ffffff', hoverOf('light', choice.solidLight)),
      'light hover'
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('is told apart from its hover: one step lighter on dark, one step darker on light', () => {
    const lum = (colour: string | Rgba) => contrast(colour, '#000000') // monotonic in luminance

    expect(lum(hoverOf('dark', choice.solidDark))).toBeGreaterThan(
      lum(choice.solidDark)
    )
    expect(lum(hoverOf('light', choice.solidLight))).toBeLessThan(
      lum(choice.solidLight)
    )
  })
})

describe('forest is teal, not green', () => {
  // Green already means "done" and "saved" (--success, 158 degrees): a green accent would be
  // mistaken for a status.
  it.each(['dark', 'light'] as const)('in the %s theme', (theme) => {
    const success = toHsl(parseColor(tokens(theme)('--success'))).h
    const choice = ACCENT_CHOICES.forest

    for (const colour of theme === 'dark'
      ? [choice.dark, choice.solidDark]
      : [choice.light, choice.solidLight]) {
      const hue = toHsl(parseColor(colour)).h

      expect(hue, colour).toBeGreaterThanOrEqual(180)
      expect(hue, colour).toBeLessThanOrEqual(200)
      expect(Math.abs(hue - success), colour).toBeGreaterThanOrEqual(20)
    }
  })
})
