// The size of the floating ball is written twice: in shared/dock-size.ts, for the main process
// (which sizes the ball's window) and the panel's animation (which aims at the ball's centre), and
// in dock.css, which draws it and cannot read a constant. These keep the two in step. Vitest does
// not load .css files, so the stylesheet is read from disk.
import { describe, expect, it } from 'vitest'

import { DOCK_BALL_SIZE, DOCK_SIZE } from '../../../../shared/dock-size'
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
const px = (value: string | undefined): number => {
  const match = /^(-?[\d.]+)px$/.exec(value ?? '')
  if (!match) throw new Error(`Not a pixel length: ${value}`)

  return Number(match[1])
}

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
  it('draw the ball, and its hit area, at DOCK_BALL_SIZE', () => {
    for (const selector of ['.dock-bubble', '.dock-bubble-surface']) {
      expect(css(selector, 'width'), selector).toBe(`${DOCK_BALL_SIZE}px`)
      expect(css(selector, 'height'), selector).toBe(`${DOCK_BALL_SIZE}px`)
    }
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
  })
})

describe('the white dot of the ball', () => {
  it('is 8px, centred where the app icon has its dot', () => {
    const size = px(css('.dock-bubble-dot', 'width'))

    expect(size).toBe(8)
    expect(css('.dock-bubble-dot', 'height')).toBe(`${size}px`)
    expect(css('.dock-bubble-dot', 'left')).toBe(`calc(40.6% - ${size / 2}px)`)
    expect(css('.dock-bubble-dot', 'top')).toBe(`calc(59.4% - ${size / 2}px)`)
    expect(css('.dock-bubble-dot', 'border-radius')).toBe('50%')
    expect(css('.dock-bubble-dot', 'background')).toBe('#fff')
  })

  it('lies wholly inside the ball', () => {
    const size = px(css('.dock-bubble-dot', 'width'))

    for (const share of [0.406, 0.594]) {
      const centre = DOCK_BALL_SIZE * share
      expect(centre - size / 2).toBeGreaterThanOrEqual(0)
      expect(centre + size / 2).toBeLessThanOrEqual(DOCK_BALL_SIZE)
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
