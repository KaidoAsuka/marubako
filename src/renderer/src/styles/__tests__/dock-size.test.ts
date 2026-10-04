// The size of the floating ball is the one the user set (Prefs.ballSize). shared/dock-size.ts has
// its range and its default, for the main process (which sizes the ball's window) and the panel's
// animation (which aims at the ball's centre). dock.css draws the ball from a variable the ball's
// window is given, --dock-ball-size, and writes the default once more as the fallback of that
// variable: a stylesheet cannot read a constant. These keep the two in step. Vitest does not load
// .css files, so the stylesheet is read from disk.
import { describe, expect, it } from 'vitest'

import {
  BALL_SIZE_STEP,
  DOCK_BALL_SIZE,
  DOCK_SIZE,
  dockWindowSize,
  MAX_BALL_SIZE,
  MIN_BALL_SIZE,
} from '../../../../shared/dock-size'
import { springDuration, springProgress } from '../../utils/spring'
import {
  BALL_RADIUS,
  BALL_SPRING,
  DOT_RADIUS,
  DOT_SCALE,
  panelGeometry,
} from '../../utils/window-motion'
import { lastValue, loadRules } from './css-utils'

const dock = loadRules('dock.css')
const css = (selector: string, property: string, at: string[] = []) =>
  lastValue(dock, selector, property, at)

/** The side of the ball in the stylesheet: what the window was told, or the default. */
const BALL_LENGTH = `var(--dock-ball-size, ${DOCK_BALL_SIZE}px)`
/** The white dot is 8px in a ball of 30px, and keeps that share of a ball of any size. */
const DOT_SHARE = 8 / 30

/** Every size the slider of the setting can produce. */
const SLIDER_SIZES: number[] = []
for (let size = MIN_BALL_SIZE; size <= MAX_BALL_SIZE; size += BALL_SIZE_STEP)
  SLIDER_SIZES.push(size)

/** How far a `box-shadow` reaches outside its box: the widest layer that is not `inset`. */
function outerReach(shadow: string): number {
  const layers = shadow.split(/,(?![^(]*\))/).map((layer) => layer.trim())

  return Math.max(
    0,
    ...layers
      .filter((layer) => !/\binset\b/.test(layer))
      .map((layer) => {
        const [x = 0, y = 0, blur = 0, spread = 0] = (
          layer.replace(/rgba?\([^)]*\)|#[0-9a-f]+/gi, '').match(/-?[\d.]+/g) ??
          []
        ).map(Number)

        return Math.max(Math.abs(x), Math.abs(y)) + blur + spread
      })
  )
}

/** The largest scale the ball's spring reaches on its way from `from` to full size. */
function springPeak(from: number): number {
  let peak = 1
  for (let ms = 0; ms <= springDuration(BALL_SPRING); ms += 1) {
    peak = Math.max(peak, from + (1 - from) * springProgress(ms, BALL_SPRING))
  }

  return peak
}

describe('the ball in dock.css and the constants in dock-size.ts', () => {
  it('draw the ball, and its hit area, at the size the window is told, and at DOCK_BALL_SIZE when it is told none', () => {
    expect(BALL_LENGTH).toBe('var(--dock-ball-size, 30px)')
    for (const selector of ['.dock-bubble', '.dock-bubble-surface']) {
      expect(css(selector, 'width'), selector).toBe(BALL_LENGTH)
      expect(css(selector, 'height'), selector).toBe(BALL_LENGTH)
    }
  })

  it('write no pixel size of the ball anywhere else: one variable draws all of it', () => {
    for (const rule of dock.filter((entry) =>
      entry.selector.includes('.dock-bubble')
    ))
      expect(rule.body, rule.selector).not.toMatch(
        /\b(?:width|height):\s*\d+px/
      )
  })

  it('leave the window larger than the ball, with the same air on every side', () => {
    expect(DOCK_SIZE).toBeGreaterThan(DOCK_BALL_SIZE)
    // A whole number of pixels on each side, or the ball would be drawn between two pixels.
    expect(Number.isInteger((DOCK_SIZE - DOCK_BALL_SIZE) / 2)).toBe(true)
  })

  it('keep the swollen ball inside its window: the spring overshoots by 12.6%', () => {
    // From nothing to full size is the furthest the spring can throw the ball past its size.
    const overshoot = springPeak(0)
    expect(overshoot).toBeCloseTo(1.126, 3)

    expect(DOCK_BALL_SIZE * overshoot).toBeLessThanOrEqual(DOCK_SIZE)
    // The hairline around the ball is drawn outside its box and swells with it.
    const ring = outerReach(css('.dock-bubble-surface', 'box-shadow')!)
    expect(ring).toBe(1)
    expect((DOCK_BALL_SIZE + 2 * ring) * overshoot).toBeLessThanOrEqual(
      DOCK_SIZE
    )
    // The springs the ball really plays (from the dot, from a pressed ball) stay inside as well.
    for (const from of [DOT_SCALE, 0.92, 0.48]) {
      expect(
        (DOCK_BALL_SIZE + 2 * ring) * springPeak(from),
        `from ${from}`
      ).toBeLessThanOrEqual(DOCK_SIZE)
    }
  })

  // shared/__tests__/dock-size.test.ts holds every size to the furthest throw of the spring, with
  // the two numbers measured above. This is what is seen on screen: the springs that are played.
  it('keep the springs the ball really plays inside its window at every size of the setting', () => {
    const ring = outerReach(css('.dock-bubble-surface', 'box-shadow')!)

    for (const size of SLIDER_SIZES)
      for (const from of [DOT_SCALE, 0.92, 0.48])
        expect(
          (size + 2 * ring) * springPeak(from),
          `${size}px from ${from}`
        ).toBeLessThanOrEqual(dockWindowSize(size))
  })

  it('centre the ball in its window, where the panel animation takes its centre to be', () => {
    expect(css('.dock-root', 'display')).toBe('grid')
    expect(css('.dock-root', 'place-items')).toBe('center')
    expect(css('.dock-root', 'width')).toBe('100%')
    expect(css('.dock-root', 'height')).toBe('100%')
    expect(css('.dock-bubble-surface', 'transform-origin')).toBe('center')

    // A ball window whose corner is the panel's corner: the origin is the middle of that window.
    expect(panelGeometry({ x: 0, y: 0 }, 760, 720).origin).toBe(
      `${DOCK_SIZE / 2}px ${DOCK_SIZE / 2}px`
    )
    // The window of a larger ball is larger: the panel is told its side, and aims at its middle.
    for (const size of SLIDER_SIZES) {
      const side = dockWindowSize(size)
      expect(
        panelGeometry({ x: 0, y: 0 }, 760, 720, side).origin,
        `${size}`
      ).toBe(`${side / 2}px ${side / 2}px`)
    }
  })
})

describe('the white dot of the ball', () => {
  it('is 8px in a ball of 30px and grows with the ball: 8/30 of its side', () => {
    expect(css('.dock-bubble-dot', '--dock-dot-size')).toBe(
      `calc(${BALL_LENGTH} * 8 / 30)`
    )
    expect(css('.dock-bubble-dot', 'width')).toBe('var(--dock-dot-size)')
    expect(css('.dock-bubble-dot', 'height')).toBe('var(--dock-dot-size)')
    // The default ball has the dot it always had.
    expect(DOCK_BALL_SIZE * DOT_SHARE).toBe(8)
  })

  it('is centred where the app icon has its dot, at any size', () => {
    expect(css('.dock-bubble-dot', 'left')).toBe(
      'calc(40.6% - var(--dock-dot-size) / 2)'
    )
    expect(css('.dock-bubble-dot', 'top')).toBe(
      'calc(59.4% - var(--dock-dot-size) / 2)'
    )
    expect(css('.dock-bubble-dot', 'border-radius')).toBe('50%')
    expect(css('.dock-bubble-dot', 'background')).toBe('#fff')
  })

  it('lies wholly inside the ball at every size of the setting', () => {
    for (const ball of SLIDER_SIZES) {
      const size = ball * DOT_SHARE

      for (const share of [0.406, 0.594]) {
        const centre = ball * share
        expect(centre - size / 2, `${ball}px`).toBeGreaterThanOrEqual(0)
        expect(centre + size / 2, `${ball}px`).toBeLessThanOrEqual(ball)
      }
    }
  })
})

describe('the focus ring of the ball', () => {
  it('is drawn inside the ball: a white ring on the outside of a dark one, nothing outside the box', () => {
    const ring = css(
      '.dock-bubble:focus-visible .dock-bubble-surface',
      'box-shadow'
    )!

    expect(ring).toBe(
      'inset 0 0 0 2px #fff, inset 0 0 0 3px rgba(10, 12, 20, 0.85)'
    )
    expect(outerReach(ring)).toBe(0)
    // The global accent outline would be cut off by the small window.
    expect(css('.dock-bubble:focus-visible', 'outline')).toBe('none')
  })
})

describe('the two shapes of the ball', () => {
  it('are the same in the stylesheet and in the animation that moves between them', () => {
    expect(css('.dock-bubble-surface', 'border-radius')).toBe(BALL_RADIUS)
    expect(css('.dock-bubble', 'border-radius')).toBe(BALL_RADIUS)
    expect(css(".dock-bubble-surface[data-morph='dot']", 'border-radius')).toBe(
      DOT_RADIUS
    )
  })

  it('shrink to the dot by DOT_SCALE, which stays 0.52 at any ball size', () => {
    expect(DOT_SCALE).toBe(0.52)
    expect(css(".dock-bubble-surface[data-morph='dot']", 'transform')).toBe(
      `scale(${DOT_SCALE})`
    )
    expect(
      css(
        ".dock-bubble[data-pressed] .dock-bubble-surface[data-morph='dot']",
        'transform',
        ['@media (prefers-reduced-motion: reduce)']
      )
    ).toBe(`scale(${DOT_SCALE})`)
  })
})
