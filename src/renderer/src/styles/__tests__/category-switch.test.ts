// Choosing a category: its page slides in a short way from the side its tab lies on, the way the
// marker travels, and fades in; the first page of a session is simply there. The bodies of groups
// and tasks unfold only when the user opens them, not when their page arrives. These read the real
// stylesheets in cascade order (ContentRouter.test.tsx checks which page gets which direction).
import { describe, expect, it } from 'vitest'

import {
  CASCADE_ORDER,
  declarations,
  lastValue,
  loadCascade,
  loadRules,
  splitSelectors,
} from './css-utils'

const cascade = loadCascade()
const win = (selector: string, property: string, at: string[] = []) =>
  lastValue(cascade, selector, property, at)
const keyframes = (name: string) =>
  cascade
    .filter((rule) => rule.selector === `@keyframes ${name}`)
    .map((rule) => rule.body.replace(/\s+/g, ' ').trim())
const REDUCED = '@media (prefers-reduced-motion: reduce)'

describe('the page of a category', () => {
  it.each([
    ['forward', 'pageInForward', '16px'],
    ['backward', 'pageInBackward', '-16px'],
  ] as const)(
    'comes in %s from 16px to that side, fading in from nothing',
    (_direction, name, offset) => {
      expect(keyframes(name)).toEqual([
        `from { opacity: 0; transform: translateX(${offset}); }`,
      ])
    }
  )

  it('has no end frame and does not hold its last one, so no transform is left on the page', () => {
    // A transform on the page, even `translateX(0)`, would make it the containing block of the
    // fixed drag overlay. Without `to` the animation ends on the page as it is styled, and without
    // a fill mode nothing of it remains afterwards.
    for (const name of ['pageInForward', 'pageInBackward']) {
      expect(keyframes(name)[0], name).not.toMatch(/\bto\b|100%/)
    }
    for (const direction of ['forward', 'backward']) {
      const animation = win(
        `.section-content[data-enter='${direction}']`,
        'animation'
      )!

      expect(animation, direction).not.toMatch(/\b(both|forwards|backwards)\b/)
      expect(
        win(
          `.section-content[data-enter='${direction}']`,
          'animation-fill-mode'
        )
      ).toBeUndefined()
    }
    expect(win('.section-content', 'transform')).toBeUndefined()
    expect(win('.section-content', 'will-change')).toBeUndefined()
  })

  it('slides in the normal duration with the arriving curve, like the marker', () => {
    expect(win(".section-content[data-enter='forward']", 'animation')).toBe(
      'pageInForward var(--motion-normal) var(--ease-out)'
    )
    expect(win(".section-content[data-enter='backward']", 'animation')).toBe(
      'pageInBackward var(--motion-normal) var(--ease-out)'
    )
    expect(win('.tabbar::before', 'transition')).toBe(
      'transform var(--motion-normal) var(--ease-out)'
    )
  })

  it('is simply there when it was not switched to: a page without data-enter has no animation', () => {
    expect(win('.section-content', 'animation')).toBeUndefined()
    expect(win('.section-content', 'animation-name')).toBeUndefined()
    // Every animation on the page asks for a direction.
    const animated = cascade
      .filter((rule) =>
        declarations(rule.body).some(([name]) => /^animation/.test(name))
      )
      .flatMap((rule) => splitSelectors(rule.selector))
      .filter((selector) => /\.section-content(?![\w-])/.test(selector))

    expect(animated.sort()).toEqual([
      ".section-content[data-enter='backward']",
      ".section-content[data-enter='forward']",
    ])
  })

  it('has let go of the old brightening', () => {
    const everything = CASCADE_ORDER.map((file) =>
      loadRules(file)
        .map((rule) => `${rule.selector} { ${rule.body} }`)
        .join('\n')
    ).join('\n')

    expect(everything).not.toContain('sectionIn')
  })

  it('does not move at all for someone who asked for reduced motion', () => {
    const everywhere = cascade.find(
      (rule) =>
        rule.at.join('|') === REDUCED &&
        splitSelectors(rule.selector).includes('*')
    )

    expect(everywhere).toBeDefined()
    expect(
      declarations(everywhere!.body).find(([name]) => name === 'animation')?.[1]
    ).toBe('none !important')
  })
})

describe('the body of a group or a task', () => {
  it('unfolds only when the user opened it', () => {
    for (const body of ['.group-card-body', '.task-card-body']) {
      expect(win(`${body}[data-unfold]`, 'animation'), body).toBe(
        'expandIn var(--motion-normal) var(--ease-out) both'
      )
      // One that is open when its page arrives is part of the page: it has no animation of its
      // own, or a whole page of bodies would drop down under the page that is sliding in.
      expect(win(body, 'animation'), body).toBeUndefined()
    }
    expect(keyframes('expandIn')).toHaveLength(1)
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
