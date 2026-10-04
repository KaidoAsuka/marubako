// color-7: one neutral scrim behind every dialog, two shadows (small for what floats, large for what
// is modal) that follow the theme, and no tinted fog over the light theme.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { BACKGROUNDS } from '../../../../shared/types'
import { getBackgroundUiVariables } from '../background-theme'
import {
  declarations,
  lastValue,
  loadCascade,
  loadRules,
  over,
  parseColor,
} from './css-utils'

const cascade = loadCascade()
const win = (selector: string, property: string) =>
  lastValue(cascade, selector, property)
const themes = loadRules('themes.css')
const dark = (name: string) => lastValue(themes, ':root', name)!
const light = (name: string) => lastValue(themes, '.theme-light', name)!

const chroma = (colour: { r: number; g: number; b: number }) =>
  (Math.max(colour.r, colour.g, colour.b) -
    Math.min(colour.r, colour.g, colour.b)) /
  255

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === '__tests__') return []
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

describe('scrim', () => {
  it('is one neutral colour per theme', () => {
    expect(dark('--scrim')).toBe('rgba(8, 9, 14, 0.56)')
    expect(light('--scrim')).toBe('rgba(24, 28, 40, 0.32)')
  })

  it('leaves no purple fog over the light canvas', () => {
    const canvas = parseColor(light('--workspace-bg'))
    const fogged = over(parseColor(light('--scrim')), canvas)

    // About #B0B2B8: a quiet grey, darker than the canvas, not the #E9E2FA of the old lilac scrim.
    expect(chroma(fogged)).toBeLessThan(0.05)
    expect(fogged.r).toBeLessThan(canvas.r - 40)
  })

  it('is the same scrim and the same blur behind the dialog, the search palette and the folder popup', () => {
    for (const overlay of [
      '.modal-overlay',
      '.command-overlay',
      '.widget-popup-overlay',
    ]) {
      expect(win(overlay, 'background'), overlay).toBe('var(--scrim)')
      expect(win(overlay, 'backdrop-filter'), overlay).toBe('blur(6px)')
    }
  })
})

describe('shadows', () => {
  it('has a small one and a large one, lighter in the light theme', () => {
    expect(dark('--shadow-pop')).toBe('0 8px 24px rgba(0, 0, 0, 0.36)')
    expect(dark('--shadow-modal')).toBe('0 24px 64px rgba(0, 0, 0, 0.5)')
    expect(light('--shadow-pop')).toBe('0 8px 24px rgba(15, 23, 42, 0.12)')
    expect(light('--shadow-modal')).toBe('0 24px 64px rgba(15, 23, 42, 0.18)')
  })

  it('gives what floats the small one', () => {
    for (const selector of [
      '.calendar-popover',
      '.emoji-picker-dropdown',
      '.drag-overlay-shell .folder-widget',
      '.drag-overlay-shell .group-card',
    ]) {
      expect(win(selector, 'box-shadow'), selector).toBe('var(--shadow-pop)')
    }
  })

  it('gives what is modal the large one, with no inner highlight', () => {
    for (const selector of [
      '.modal-card',
      '.widget-popup-card',
      '.widget-popup',
      '.command-dialog',
    ]) {
      expect(win(selector, 'box-shadow'), selector).toBe('var(--shadow-modal)')
    }
  })

  it('draws no shadow on the cards themselves', () => {
    for (const selector of [
      '.folder-widget',
      '.widget-loose',
      '.grid-item',
      '.group-card',
      '.task-card',
      '.item-row',
    ]) {
      const shadow = win(selector, 'box-shadow')
      expect(shadow === undefined || shadow === 'none', selector).toBe(true)
    }
  })

  it('has no hand-written black shadow left in the stylesheets', () => {
    const offenders: string[] = []

    for (const file of [
      'global.css',
      'workspace.css',
      'collection.css',
      'tasks.css',
      'item-editor.css',
      'code.css',
    ]) {
      for (const rule of loadRules(file)) {
        for (const [property, value] of declarations(rule.body)) {
          if (
            property === 'box-shadow' &&
            /rgba\(\s*0\s*,\s*0\s*,\s*0/.test(value)
          ) {
            offenders.push(`${file} ${rule.selector}: ${value}`)
          }
        }
      }
    }

    expect(offenders).toEqual([])
  })
})

describe('popups share one line', () => {
  it('outlines every dialog, popup and popover with the strong line', () => {
    for (const selector of [
      '.modal-card',
      '.item-modal-card',
      '.widget-popup-card',
      '.widget-popup',
      '.command-dialog',
      '.calendar-popover',
      '.emoji-picker-dropdown',
    ]) {
      const border = win(selector, 'border')
      const colour = win(selector, 'border-color')

      expect(
        colour === 'var(--line-strong)' ||
          border === '1px solid var(--line-strong)',
        `${selector}: ${border} / ${colour}`
      ).toBe(true)
    }
  })
})

describe('retired overlay and shadow tokens', () => {
  it('are neither defined nor referenced anywhere in the renderer', () => {
    const root = resolve(process.cwd(), 'src/renderer/src')
    const hits: string[] = []

    for (const file of walk(root)) {
      if (!/\.(css|ts|tsx)$/.test(file)) continue
      const text = readFileSync(file, 'utf8')
      for (const token of [
        '--overlay-bg',
        '--overlay-strong',
        '--shadow-sm',
        '--shadow-md',
        '--shadow-lg',
      ]) {
        if (text.includes(token)) hits.push(`${relative(root, file)} ${token}`)
      }
    }

    expect(hits).toEqual([])
  })

  it('are not injected by any palette, so a palette cannot tint the scrim again', () => {
    for (const key of BACKGROUNDS) {
      for (const theme of ['dark', 'light'] as const) {
        const names = Object.keys(getBackgroundUiVariables(theme, key))

        expect(names).not.toContain('--overlay-bg')
        expect(names).not.toContain('--scrim')
      }
    }
  })
})
