// motion-5: choosing a category shows it at once; only the marker slides. These read the real
// stylesheets in cascade order.
import { describe, expect, it } from 'vitest'

import { lastValue, loadCascade } from './css-utils'

const cascade = loadCascade()
const win = (selector: string, property: string, at: string[] = []) =>
  lastValue(cascade, selector, property, at)
const keyframes = (name: string) =>
  cascade
    .filter((rule) => rule.selector === `@keyframes ${name}`)
    .map((rule) => rule.body.replace(/\s+/g, ' ').trim())

describe('the content of a category', () => {
  it('is there at once: it only brightens from 0.6, with no slide and no empty first frame', () => {
    expect(keyframes('sectionIn')).toEqual([
      'from { opacity: 0.6; } to { opacity: 1; }',
    ])
    expect(keyframes('sectionIn')[0]).not.toContain('transform')
    expect(keyframes('sectionIn')[0]).not.toContain('opacity: 0;')
  })

  it('brightens in the instant duration, declared once', () => {
    expect(win('.section-content', 'animation')).toBe(
      'sectionIn var(--motion-instant) var(--ease-out) both'
    )
    expect(win('.section-content', 'animation-duration')).toBeUndefined()
  })
})

describe('the marker', () => {
  it('slides in the normal duration', () => {
    expect(win('.tabbar::before', 'transition')).toBe(
      'transform var(--motion-normal) var(--ease-out)'
    )
  })

  it('takes its place and size from the measured active button, whatever the layout', () => {
    expect(win('.tabbar::before', 'width')).toBe('var(--tab-w, 0px)')
    expect(win('.tabbar::before', 'transform')).toBe(
      'translateX(var(--tab-x, 0px))'
    )
    expect(win('.tabbar::before', 'height')).toBe('100%')
    // No fixed seven columns and no two-row special case are left to go wrong with another tab count.
    for (const rule of cascade) {
      expect(rule.body, rule.selector).not.toContain('--active-tab')
      expect(rule.body, rule.selector).not.toContain('--compact-tab')
    }
  })

  it('appears in place while a window is resized or the first frame is drawn', () => {
    expect(win('.tabbar[data-marker-instant]::before', 'transition')).toBe(
      'none'
    )
  })

  it('has labels that change colour at once', () => {
    expect(win('.tab-button', 'transition-duration')).toBe(
      'var(--motion-instant)'
    )
  })
})

describe('switching the day', () => {
  it('keeps its direction, shorter and lighter: 6px and half opacity, in the fast duration', () => {
    const forward = keyframes('dateSlideForward')[0]!
    const backward = keyframes('dateSlideBackward')[0]!

    expect(forward).toContain('opacity: 0.5')
    expect(forward).toContain('translateX(6px)')
    expect(backward).toContain('opacity: 0.5')
    expect(backward).toContain('translateX(-6px)')
    expect(win('.date-display-copy', 'animation')).toBe(
      'dateSlideForward var(--motion-fast) var(--ease-out) both'
    )
    expect(win('.week-strip-track', 'animation')).toBe(
      'dateSlideForward var(--motion-fast) var(--ease-out) both'
    )
  })
})
