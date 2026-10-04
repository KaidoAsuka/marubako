// color-2: one family of surface, line and text tokens, defined once in themes.css, with the
// readable semantic colours and one look for the settings dialog and the item editor.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { BACKGROUNDS } from '../../../../shared/types'
import { getBackgroundUiVariables } from '../background-theme'
import {
  colorLiterals,
  contrast,
  declarations,
  lastValue,
  loadCascade,
  loadRules,
  over,
  parseColor,
} from './css-utils'

const themes = loadRules('themes.css')
const dark = (name: string) => lastValue(themes, ':root', name)!
const light = (name: string) => lastValue(themes, '.theme-light', name)!
const cascade = loadCascade()
const win = (selector: string, property: string) =>
  lastValue(cascade, selector, property)

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === '__tests__') return []
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

describe('neutral token family', () => {
  it('holds the three layers, the two lines and the three text levels, dark and light', () => {
    expect(dark('--sidebar-bg')).toBe('#111319')
    expect(dark('--workspace-bg')).toBe('#15171e')
    expect(dark('--card-bg')).toBe('#1d2029')
    expect(dark('--text')).toBe('#f1f5f9')
    expect(dark('--text-mid')).toBe('#b9c0d0')
    expect(dark('--text-dim')).toBe('#8d96ab')
    expect(light('--sidebar-bg')).toBe('#f0f2f7')
    expect(light('--workspace-bg')).toBe('#f8f9fc')
    expect(light('--card-bg')).toBe('#ffffff')
    expect(light('--text')).toBe('#0f172a')
    expect(light('--text-mid')).toBe('#4c566d')
    expect(light('--text-dim')).toBe('#5b6577')
    expect(dark('--line')).toBe('rgba(185, 195, 215, 0.1)')
    expect(dark('--line-strong')).toBe('rgba(185, 195, 215, 0.18)')
    expect(light('--line')).toBe('rgba(37, 47, 68, 0.1)')
    expect(light('--line-strong')).toBe('rgba(37, 47, 68, 0.2)')
  })

  it('is declared once: workspace.css no longer redefines colours', () => {
    for (const selector of [':root', '.theme-light']) {
      const body = loadRules('workspace.css')
        .filter((rule) => rule.selector === selector && rule.at.length === 0)
        .flatMap((rule) => declarations(rule.body))
        .map(([name]) => name)
        .filter((name) => name !== '--sans')

      expect(body, selector).toEqual([])
    }
  })

  it('derives the hover fill and the neutral tint from the layers instead of listing them per palette', () => {
    for (const read of [dark, light]) {
      expect(read('--hover-bg')).toBe(
        'color-mix(in srgb, var(--card-bg), var(--accent) 4%)'
      )
      expect(read('--neutral-soft')).toBe(
        'color-mix(in srgb, var(--text-dim) 14%, transparent)'
      )
    }
  })
})

describe('readable text and status colours', () => {
  const layers = (read: (name: string) => string) =>
    ['--sidebar-bg', '--workspace-bg', '--card-bg'].map(
      (name) => [name, read(name)] as const
    )

  for (const [theme, read] of [
    ['dark', dark],
    ['light', light],
  ] as const) {
    it(`keeps text and the semantic colours at 4.5:1 or better on every layer in the ${theme} theme`, () => {
      for (const token of [
        '--text',
        '--text-mid',
        '--text-dim',
        '--success',
        '--warning',
        '--danger',
      ]) {
        for (const [layer, fill] of layers(read)) {
          expect(
            contrast(read(token), fill),
            `${token} on ${layer} (${read(token)} on ${fill})`
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
    })
  }

  it('uses the corrected light status colours', () => {
    expect(light('--success')).toBe('#127a55')
    expect(light('--warning')).toBe('#946006')
    expect(light('--danger')).toBe('#c92f3f')
  })

  it('no longer dims the placeholders with opacity', () => {
    expect(win('.item-form input::placeholder', 'opacity')).toBeUndefined()
    expect(win('input::placeholder', 'color')).toBe('var(--text-dim)')
    expect(win('input::placeholder', 'opacity')).toBe('1')
    // The placeholder is drawn on the sunk input field.
    expect(
      contrast(dark('--text-dim'), dark('--workspace-bg'))
    ).toBeGreaterThan(4.5)
    expect(
      contrast(light('--text-dim'), light('--workspace-bg'))
    ).toBeGreaterThan(4.5)
  })

  it('derives the danger and success tints from the tokens', () => {
    expect(win('.primary-button.danger', 'background')).toBe(
      'color-mix(in srgb, var(--danger) 12%, transparent)'
    )
    expect(win('.primary-button.danger', 'border-color')).toBe(
      'color-mix(in srgb, var(--danger) 35%, transparent)'
    )
    expect(win('.calendar-day.today:not(.active)', 'border-color')).toBe(
      'color-mix(in srgb, var(--success) 35%, transparent)'
    )
  })
})

describe('the settings dialog and the item editor look alike', () => {
  it('put their dialogs on the same card layer, with the same sunken footer', () => {
    expect(win('.modal-card', 'background')).toBe('var(--card-bg)')
    expect(win('.item-modal-card', 'background')).toBe('var(--card-bg)')
    expect(win('.modal-actions', 'background')).toBe('var(--sidebar-bg)')
    expect(win('.item-modal-card .modal-actions', 'background')).toBe(
      'var(--sidebar-bg)'
    )
    expect(win('.item-modal-card', 'border-color')).toBe('var(--line-strong)')
    expect(win('.modal-card', 'border')).toBe('1px solid var(--line-strong)')
  })

  it('sink every input into the canvas colour with the same strong line', () => {
    const settings = '.form-field input'
    const editor = '.item-form .form-field input'

    expect(win(settings, 'background')).toBe('var(--workspace-bg)')
    expect(win(editor, 'background')).toBe('var(--workspace-bg)')
    expect(win(settings, 'border')).toBe('1px solid var(--line-strong)')
    expect(win(editor, 'border')).toBe('1px solid var(--line-strong)')
    for (const selector of [
      '.form-field select',
      '.form-field textarea',
      '.emoji-picker-trigger',
      '.item-form .emoji-picker-trigger',
    ]) {
      expect(win(selector, 'border'), selector).toBe(
        '1px solid var(--line-strong)'
      )
    }
  })

  it('leave an input visibly sunk into the dialog, by fill and by line, in both themes', () => {
    for (const read of [dark, light]) {
      const card = parseColor(read('--card-bg'))
      const line = over(parseColor(read('--line-strong')), card)

      expect(
        contrast(read('--workspace-bg'), read('--card-bg'))
      ).toBeGreaterThan(1.05)
      expect(contrast(line, card)).toBeGreaterThan(1.2)
    }
  })
})

describe('the old surface tokens are gone', () => {
  const retired = [
    '--glass-bg',
    '--glass-border',
    '--glass-hover',
    '--glass-active',
    '--app-bg',
    '--modal-bg',
    '--input-bg',
    '--surface',
    '--surface-strong',
    '--surface-soft',
    '--surface-hover',
    '--shell-highlight',
    '--overlay-strong',
    '--loading-bg',
  ]

  it('are neither defined nor referenced anywhere in the renderer', () => {
    const root = resolve(process.cwd(), 'src/renderer/src')
    const hits: string[] = []

    for (const file of walk(root)) {
      if (!/\.(css|ts|tsx)$/.test(file)) continue
      const text = readFileSync(file, 'utf8')
      for (const token of retired) {
        if (new RegExp(`${token}(?![\\w-])`).test(text)) {
          hits.push(`${relative(root, file)} ${token}`)
        }
      }
      if (/--border(?![\w-])/.test(text))
        hits.push(`${relative(root, file)} --border`)
    }

    expect(hits).toEqual([])
  })

  it('leave the palettes with the two accent tokens, nothing else', () => {
    const names = (
      key: (typeof BACKGROUNDS)[number],
      theme: 'dark' | 'light'
    ) => Object.keys(getBackgroundUiVariables(theme, key)).sort()
    // The hover, soft and border tokens are derived from these two in themes.css (color-4).
    const allowed = new Set(['--accent', '--accent-solid'])

    for (const key of BACKGROUNDS) {
      for (const theme of ['dark', 'light'] as const) {
        for (const name of names(key, theme)) {
          expect(allowed.has(name), `${key} ${theme} injects ${name}`).toBe(
            true
          )
        }
      }
    }
  })

  it('has no colour literal left in a surface or border declaration outside themes.css', () => {
    const offenders: string[] = []

    for (const file of [
      'global.css',
      'workspace.css',
      'collection.css',
      'tasks.css',
      'item-editor.css',
    ]) {
      for (const rule of loadRules(file)) {
        for (const [property, value] of declarations(rule.body)) {
          if (
            !/^(background|background-color|border|border-color|border-top|border-bottom)$/.test(
              property
            )
          )
            continue
          for (const literal of colorLiterals(value)) {
            const color = parseColor(literal)
            // Overlays, scrims and tints of black or white are allowed; a tinted literal is a hand-picked surface.
            const tinted =
              Math.max(color.r, color.g, color.b) -
                Math.min(color.r, color.g, color.b) >
              40
            if (tinted)
              offenders.push(`${file} ${rule.selector} ${property}: ${literal}`)
          }
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
