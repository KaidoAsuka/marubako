// color-4: the accent colour setting is five 24px solid dots with a 28px hit area; the chosen one has
// a ring (and a check mark, see AccentDots.test.tsx). Vitest does not load .css files, so these read
// the real stylesheets.
import { describe, expect, it } from 'vitest'

import { loadCascade, lastValue } from './css-utils'

const cascade = loadCascade()
const win = (selector: string, property: string) =>
  lastValue(cascade, selector, property)

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
    // The check is white on the fill, which every solid carries at 4.5:1.
    expect(win('.accent-dot', 'color')).toBe('var(--on-accent)')
  })

  it('leave room between dots for the ring, and for the focus outline off the ring', () => {
    expect(win('.accent-dots', 'gap')).toBe('12px')
    expect(win('.accent-dot:focus-visible', 'outline-offset')).toBe('3px')
  })
})
