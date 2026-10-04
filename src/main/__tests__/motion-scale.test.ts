import { describe, expect, it } from 'vitest'

import { motionTimeScale } from '../motion-scale'

describe('motionTimeScale', () => {
  it('is exactly 1 at the default motion setting', () => {
    expect(motionTimeScale(1.35)).toBe(1)
  })

  it('scales linearly inside the limits', () => {
    expect(motionTimeScale(1)).toBeCloseTo(1 / 1.35, 6)
    expect(motionTimeScale(1.8)).toBeCloseTo(1.8 / 1.35, 6)
  })

  it('stays within 0.6 and 1.6 across the whole preference range', () => {
    // The preference itself is clamped to 0.75..2.2 when it is saved.
    expect(motionTimeScale(0.75)).toBe(0.6)
    expect(motionTimeScale(2.2)).toBe(1.6)
    expect(motionTimeScale(0)).toBe(0.6)
    expect(motionTimeScale(50)).toBe(1.6)
  })

  it('falls back to the default speed for a value that is not a number', () => {
    expect(motionTimeScale(Number.NaN)).toBe(1)
    expect(motionTimeScale(Number.POSITIVE_INFINITY)).toBe(1)
  })
})
