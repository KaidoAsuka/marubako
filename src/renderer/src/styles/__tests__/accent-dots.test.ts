// color-4: the accent colour setting is a row of 24px solid dots with a 28px hit area, one per
// choice; the chosen one has a ring (and a check mark, see AccentDots.test.tsx). Vitest does not
// load .css files, so these read the real stylesheets.
import { describe, expect, it } from 'vitest'

import { BACKGROUNDS } from '../../../../shared/types'
import { getAccentSolid } from '../background-theme'
import {
  contrast,
  loadCascade,
  loadRules,
  lastValue,
  paletteValue,
} from './css-utils'

const cascade = loadCascade()
const win = (selector: string, property: string) =>
  lastValue(cascade, selector, property)
const themes = loadRules('themes.css')

describe('the accent dots', () => {
  it('draw a 24px round fill inside a 28px round hit area', () => {
    expect(win('.accent-dot', 'width')).toBe('28px')
    expect(win('.accent-dot', 'height')).toBe('28px')
    expect(win('.accent-dot', 'border-radius')).toBe('50%')
    expect(win('.accent-dot-fill', 'width')).toBe('24px')
    expect(win('.accent-dot-fill', 'height')).toBe('24px')
    expect(win('.accent-dot-fill', 'border-radius')).toBe('50%')
  })

  it('are solid: the fill is the colour the choice gives', () => {
    expect(win('.accent-dot-fill', 'background')).toBe('var(--dot)')
    expect(win('.accent-dot', 'background')).toBe('transparent')
  })

  it('ring the chosen one in the text colour, with a gap of the dialog colour', () => {
    expect(win('.accent-dot.active .accent-dot-fill', 'box-shadow')).toBe(
      '0 0 0 2px var(--card-bg), 0 0 0 4px var(--text)'
    )
    // The check takes the colour of text on a fill.
    expect(win('.accent-dot', 'color')).toBe('var(--on-accent)')
  })

  it('draw the check of the chosen dot at 4.5:1 or better on its fill, for every choice in both themes', () => {
    // Only the chosen dot has a check, and the dialog previews the choice as soon as it is made
    // (SettingsForm.preview.test.tsx), so the check is drawn in the --on-accent of that very choice:
    // white, or the dark text of the monokai palette on its yellow.
    for (const key of BACKGROUNDS) {
      for (const theme of ['dark', 'light'] as const) {
        expect(
          contrast(
            paletteValue(themes, theme, key, '--on-accent')!,
            getAccentSolid(theme, key)
          ),
          `${key} ${theme}`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('leave room between dots for the ring, and for the focus outline off the ring', () => {
    expect(win('.accent-dots', 'gap')).toBe('12px')
    expect(win('.accent-dot:focus-visible', 'outline-offset')).toBe('3px')
  })
})
