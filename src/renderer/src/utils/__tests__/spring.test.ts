import { describe, expect, it } from 'vitest'

import {
  springDuration,
  springKeyframes,
  springProgress,
  type SpringOptions,
} from '../spring'

const BALL: SpringOptions = { bounce: 0.45, response: 300 }
const PANEL: SpringOptions = { bounce: 0.2, response: 340 }

/** Finds the highest value and when it happens by scanning every millisecond. */
function peak(options: SpringOptions): { value: number; at: number } {
  let best = { value: 0, at: 0 }
  for (let t = 0; t <= springDuration(options); t++) {
    const value = springProgress(t, options)
    if (value > best.value) best = { value, at: t }
  }
  return best
}

describe('springProgress', () => {
  it('starts at rest and ends at the target', () => {
    for (const options of [BALL, PANEL, { bounce: 0, response: 300 }]) {
      expect(springProgress(0, options)).toBeCloseTo(0, 9)
      expect(springProgress(springDuration(options), options)).toBeCloseTo(1, 2)
      expect(springProgress(10_000, options)).toBeCloseTo(1, 6)
    }
  })

  it('overshoots the ball spring by 12-13.5 percent, peaking at 170-190 ms', () => {
    const { value, at } = peak(BALL)
    expect(value - 1).toBeGreaterThanOrEqual(0.12)
    expect(value - 1).toBeLessThanOrEqual(0.135)
    expect(at).toBeGreaterThanOrEqual(170)
    expect(at).toBeLessThanOrEqual(190)
  })

  it('overshoots the panel spring by only about 1.5 percent', () => {
    const { value } = peak(PANEL)
    expect(value - 1).toBeGreaterThan(0.01)
    expect(value - 1).toBeLessThan(0.02)
  })

  it.each([0, -0.2])('never overshoots with bounce %d', (bounce) => {
    for (let t = 0; t <= 2000; t += 5) {
      expect(springProgress(t, { bounce, response: 300 })).toBeLessThanOrEqual(
        1 + 1e-9
      )
    }
  })

  it('stretches in time without changing the overshoot when response grows', () => {
    const slow = peak({ bounce: 0.45, response: 600 })
    const fast = peak(BALL)
    expect(slow.value).toBeCloseTo(fast.value, 3)
    expect(slow.at / fast.at).toBeCloseTo(2, 1)
  })
})

describe('springDuration', () => {
  it('reports when the envelope has decayed to 0.1 percent', () => {
    // 6.9 / (zeta * omega_n): 0.55 * 2pi / 0.3 s is about 600 ms.
    expect(springDuration(BALL)).toBeGreaterThan(590)
    expect(springDuration(BALL)).toBeLessThan(610)
    expect(springDuration(PANEL)).toBeGreaterThan(460)
    expect(springDuration(PANEL)).toBeLessThan(475)
  })

  it('uses the critically damped settling time when there is no bounce', () => {
    // 9.2 / omega_n with omega_n = 2pi / 0.3 s is about 439 ms.
    expect(springDuration({ bounce: 0, response: 300 })).toBeCloseTo(439, 0)
  })

  it('is capped at 1600 ms', () => {
    expect(springDuration({ bounce: 0.45, response: 5000 })).toBe(1600)
  })
})

describe('springKeyframes', () => {
  it('forces the last frame to land exactly on the target', () => {
    for (const [from, to] of [
      [1, 0.52],
      [0.52, 1],
      [0.94, 1],
    ] as const) {
      const { values } = springKeyframes(from, to, BALL)
      expect(values[0]).toBe(from)
      expect(values[values.length - 1]).toBe(to)
    }
  })

  it('samples at least 24 frames and about one per 11 ms', () => {
    expect(
      springKeyframes(0, 1, { bounce: 0.2, response: 50 }).values.length
    ).toBeGreaterThanOrEqual(24)
    const { values, duration } = springKeyframes(1, 0.52, BALL)
    expect(values.length).toBeGreaterThanOrEqual(Math.round(duration * 0.09))
  })

  it('interpolates between the endpoints and overshoots past the target', () => {
    const shrink = springKeyframes(1, 0.52, BALL).values
    // Expanding: the dot dips below 0.52 by 0.48 * 12.6 percent, to about 0.46.
    expect(Math.min(...shrink)).toBeGreaterThan(0.455)
    expect(Math.min(...shrink)).toBeLessThan(0.47)
    const grow = springKeyframes(0.52, 1, BALL).values
    // Collapsing: the ball swells to about 1.06, well under the 1.08 window limit.
    expect(Math.max(...grow)).toBeGreaterThan(1.055)
    expect(Math.max(...grow)).toBeLessThan(1.07)
  })

  it('returns the settle time as the duration', () => {
    expect(springKeyframes(0, 1, BALL).duration).toBe(springDuration(BALL))
  })
})
