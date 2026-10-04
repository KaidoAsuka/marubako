// color-1: one violet accent seed taken from the app icon, no blue defaults, a solid fill white text
// can sit on. The stylesheets are read from disk because vitest does not load .css files.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { BACKGROUNDS } from '../../../../shared/types'
import { getBackgroundUiVariables } from '../background-theme'
import {
  colorLiterals,
  contrast,
  declarations,
  hoverFill,
  isBlue,
  lastValue,
  loadRules,
  parseColor,
  readStyle,
  rulesMatching,
  type CssRule,
} from './css-utils'

const STYLE_FILES = readdirSync(
  resolve(process.cwd(), 'src/renderer/src/styles')
)
  .filter((name) => name.endsWith('.css'))
  .sort()

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === '__tests__') return []
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const themes = loadRules('themes.css')
const light = (name: string) => lastValue(themes, '.theme-light', name)
const dark = (name: string) => lastValue(themes, ':root', name)

describe('accent seed', () => {
  it('uses the violet of the app icon in both themes', () => {
    expect(dark('--brand-start')).toBe('#9a85ff')
    expect(dark('--brand-end')).toBe('#5544da')
    expect(dark('--accent')).toBe('#a594ff')
    expect(dark('--accent-solid')).toBe('#6553e4')
    expect(light('--accent')).toBe('#5544da')
    expect(light('--accent-solid')).toBe('#5544da')
    expect(dark('--on-accent')).toBe('#ffffff')
  })

  it('derives the hover fill from the solid fill: lighter on dark, darker on light', () => {
    // color-4: a palette supplies only --accent and --accent-solid, so the hover step cannot be a
    // listed value per palette any more. It is a mix with white (dark) or black (light).
    expect(dark('--accent-solid-hover')).toBe(
      'color-mix(in srgb, var(--accent-solid), #fff 6%)'
    )
    expect(light('--accent-solid-hover')).toBe(
      'color-mix(in srgb, var(--accent-solid), #000 14%)'
    )
    // For the violet default that lands next to the values the first token pass hand-picked.
    const close = (a: string, b: string) =>
      expect(
        Math.max(
          ...['r', 'g', 'b'].map((channel) =>
            Math.abs(
              parseColor(a)[channel as 'r'] - parseColor(b)[channel as 'r']
            )
          )
        )
      ).toBeLessThanOrEqual(12)
    const toHex = (value: ReturnType<typeof hoverFill>) =>
      `#${[value.r, value.g, value.b]
        .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
        .join('')}`
    close(
      toHex(hoverFill(dark('--accent-solid-hover')!, dark('--accent-solid')!)),
      '#6e5ce8'
    )
    close(
      toHex(
        hoverFill(light('--accent-solid-hover')!, light('--accent-solid')!)
      ),
      '#4737c2'
    )
  })

  it('is not blue anywhere in the token defaults', () => {
    for (const name of ['--accent', '--accent-solid']) {
      for (const read of [dark, light]) {
        const value = read(name)
        expect(value, name).toBeDefined()
        expect(isBlue(parseColor(value!)), `${name} ${value}`).toBe(false)
      }
    }
  })

  it('derives the soft fill and the border from the accent in both themes', () => {
    // The ball window puts only a theme class on its root, so each theme block has to derive them
    // itself: a value derived at :root would be inherited already computed, in the dark accent.
    for (const read of [dark, light]) {
      expect(read('--accent-soft')).toMatch(
        /^color-mix\(in srgb, var\(--accent\) \d+%, transparent\)$/
      )
      expect(read('--accent-border')).toMatch(
        /^color-mix\(in srgb, var\(--accent\) \d+%, transparent\)$/
      )
    }
    expect(dark('--accent-soft')).toContain('14%')
    expect(dark('--accent-border')).toContain('36%')
    expect(light('--accent-soft')).toContain('10%')
    expect(light('--accent-border')).toContain('30%')
  })

  it('keeps white text readable on the solid fill, resting and hovered', () => {
    // --on-accent is white in both themes, so it is declared once, on :root.
    const onAccent = dark('--on-accent')!
    expect(light('--on-accent')).toBeUndefined()

    for (const read of [dark, light]) {
      expect(
        contrast(onAccent, read('--accent-solid')!)
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrast(
          onAccent,
          hoverFill(read('--accent-solid-hover')!, read('--accent-solid')!)
        )
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps the accent legible as text on the canvas and the cards', () => {
    const surfaces = {
      dark: [dark('--workspace-bg')!, dark('--card-bg')!],
      light: [light('--workspace-bg')!, light('--card-bg')!],
    }

    for (const surface of surfaces.dark) {
      expect(contrast(dark('--accent')!, surface)).toBeGreaterThanOrEqual(4.5)
    }
    for (const surface of surfaces.light) {
      expect(contrast(light('--accent')!, surface)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('the primary button', () => {
  const workspace = loadRules('workspace.css')

  it('turns solid on hover with the on-accent text, and not while disabled', () => {
    const selector = '.primary-button:hover:not(:disabled)'

    expect(lastValue(workspace, selector, 'background')).toBe(
      'var(--accent-solid)'
    )
    expect(lastValue(workspace, selector, 'color')).toBe('var(--on-accent)')
    expect(lastValue(workspace, '.primary-button:hover', 'color')).toBe(
      undefined
    )
  })

  it('draws the switch on the solid fill with an on-accent thumb', () => {
    expect(
      lastValue(workspace, '.setting-switch-row input:checked', 'background')
    ).toBe('var(--accent-solid)')
    expect(
      lastValue(
        workspace,
        '.setting-switch-row input:checked::after',
        'background'
      )
    ).toBe('var(--on-accent)')
  })

  it('draws range sliders itself in the accent, not in the system blue', () => {
    const slider = "input[type='range']"
    const thumb = ".range-row input[type='range']::-webkit-slider-thumb"
    const track =
      ".range-row input[type='range']::-webkit-slider-runnable-track"

    expect(lastValue(workspace, `.range-row ${slider}`, 'appearance')).toBe(
      'none'
    )
    expect(lastValue(workspace, thumb, 'background')).toBe(
      'var(--accent-solid)'
    )
    expect(lastValue(workspace, track, 'background')).toContain(
      'var(--accent-solid)'
    )
    // accent-color would make Chromium paint the unfilled track near-white in the dark theme.
    expect(dark('accent-color')).toBeUndefined()
  })
})

describe('retired accent tokens', () => {
  const retired = [
    '--accent-gradient-start',
    '--accent-gradient-end',
    '--accent-glow',
    '--focus-ring',
    '--base-bg',
  ]

  it('are neither defined nor referenced anywhere in the renderer', () => {
    const root = resolve(process.cwd(), 'src/renderer/src')
    const hits: string[] = []

    for (const file of walk(root)) {
      if (!/\.(css|ts|tsx)$/.test(file)) continue
      const text = readFileSync(file, 'utf8')
      for (const token of retired) {
        if (text.includes(token)) hits.push(`${relative(root, file)} ${token}`)
      }
    }

    expect(hits).toEqual([])
  })
})

describe('no blue left in the stylesheets', () => {
  it('has no blue colour literal outside the code-syntax palette', () => {
    const blue: string[] = []

    for (const file of STYLE_FILES) {
      for (const rule of loadRules(file) as CssRule[]) {
        for (const [property, value] of declarations(rule.body)) {
          // Syntax highlighting colours are content, not interface chrome.
          if (property === '--code-variable') continue
          for (const literal of colorLiterals(value)) {
            if (isBlue(parseColor(literal))) {
              blue.push(`${file} ${rule.selector} ${property}: ${literal}`)
            }
          }
        }
      }
    }

    expect(blue).toEqual([])
  })

  it('draws the ball from the brand tokens, never from the accent', () => {
    // The ball window has no theme variables of its own; its colours must not depend on them.
    const dock = loadRules('dock.css')
    const ballRules = [
      ...rulesMatching(dock, '.dock-bubble'),
      ...rulesMatching(dock, '.dock-root'),
    ]

    expect(ballRules.length).toBeGreaterThan(0)
    for (const rule of ballRules) {
      expect(rule.body, rule.selector).not.toMatch(/var\(--accent/)
    }
    expect(lastValue(dock, '.dock-bubble-surface', 'background')).toBe(
      'linear-gradient(135deg, var(--brand-start), var(--brand-end))'
    )
  })

  it('keeps the startup glow and the fallbacks on the new violet', () => {
    const startup = readStyle('startup.css')

    expect(startup).not.toMatch(/139,\s*92,\s*246/)
    expect(startup).not.toMatch(/#b2a1ff/i)
    expect(startup).toContain('#a594ff')
  })
})

describe('background palettes', () => {
  it('keep the five keys and the same shape', () => {
    expect(BACKGROUNDS).toEqual([
      'aurora',
      'sunset',
      'forest',
      'ocean',
      'minimal',
    ])
  })

  it('give aurora the new accent and let themes.css derive the rest', () => {
    const darkVars = getBackgroundUiVariables('dark', 'aurora')
    const lightVars = getBackgroundUiVariables('light', 'aurora')

    expect(darkVars).toEqual({
      '--accent': '#a594ff',
      '--accent-solid': '#6553e4',
    })
    expect(lightVars).toEqual({
      '--accent': '#5544da',
      '--accent-solid': '#5544da',
    })
    for (const vars of [darkVars, lightVars]) {
      // The hover fill, the soft fill and the border come from the two values above, in CSS.
      for (const derived of [
        '--accent-solid-hover',
        '--accent-soft',
        '--accent-border',
      ]) {
        expect(vars).not.toHaveProperty(derived)
      }
      for (const name of ['--accent', '--accent-solid']) {
        expect(isBlue(parseColor(vars[name]!)), name).toBe(false)
      }
    }
  })

  it('no longer inject the retired tokens', () => {
    for (const key of BACKGROUNDS) {
      for (const theme of ['dark', 'light'] as const) {
        const names = Object.keys(getBackgroundUiVariables(theme, key))
        for (const gone of [
          '--accent-gradient-start',
          '--accent-gradient-end',
          '--accent-glow',
          '--focus-ring',
        ]) {
          expect(names, `${key} ${theme}`).not.toContain(gone)
        }
      }
    }
  })

  it.each(BACKGROUNDS)(
    'keeps white text readable on the solid fill of %s, resting and hovered',
    (key) => {
      for (const theme of ['dark', 'light'] as const) {
        const vars = getBackgroundUiVariables(theme, key)
        const hover = hoverFill(
          (theme === 'dark' ? dark : light)('--accent-solid-hover')!,
          vars['--accent-solid']!
        )

        expect(vars['--accent-solid'], `${key} ${theme}`).toBeDefined()
        expect(
          contrast('#ffffff', vars['--accent-solid']!),
          `${key} ${theme} solid`
        ).toBeGreaterThanOrEqual(4.5)
        expect(
          contrast('#ffffff', hover),
          `${key} ${theme} hover`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  )
})
