import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MOTION,
  MOTION_PERCENT_MAX,
  MOTION_PERCENT_MIN,
  MOTION_PERCENT_STEP,
  motionTimeScale,
  motionToPercent,
  percentToMotion,
} from '../motion-scale'

describe('the motion slider percentage', () => {
  it('shows the standard duration as 100%, not as the stored 135', () => {
    expect(motionToPercent(DEFAULT_MOTION)).toBe(100)
    expect(percentToMotion(100)).toBe(DEFAULT_MOTION)
  })

  it('is a percentage of the standard duration: half the stored value is half the time', () => {
    expect(motionToPercent(DEFAULT_MOTION / 2)).toBe(MOTION_PERCENT_MIN)
    expect(motionToPercent(DEFAULT_MOTION * 1.2)).toBe(120)
    expect(percentToMotion(80)).toBe(1.08)
    expect(percentToMotion(150)).toBe(2.03)
  })

  it('moves the time scale the way the percentage says', () => {
    for (const percent of [60, 80, 100, 130, 160])
      expect(motionTimeScale(percentToMotion(percent))).toBeCloseTo(
        percent / 100,
        2
      )
  })

  it('spans exactly the range the time scale can use, so no end of the slider does nothing', () => {
    expect(motionTimeScale(percentToMotion(MOTION_PERCENT_MIN))).toBeCloseTo(
      0.6,
      2
    )
    expect(motionTimeScale(percentToMotion(MOTION_PERCENT_MAX))).toBeCloseTo(
      1.6,
      2
    )
    // The step just below the top is still distinguishable from the top.
    expect(
      motionTimeScale(percentToMotion(MOTION_PERCENT_MAX - MOTION_PERCENT_STEP))
    ).toBeLessThan(motionTimeScale(percentToMotion(MOTION_PERCENT_MAX)))
  })

  it('stores values the preference validation accepts', () => {
    // data-normalize clamps motion to 0.75..2.2.
    expect(percentToMotion(MOTION_PERCENT_MIN)).toBeGreaterThanOrEqual(0.75)
    expect(percentToMotion(MOTION_PERCENT_MAX)).toBeLessThanOrEqual(2.2)
  })

  it('snaps an old stored value to a slider step and keeps it inside the slider', () => {
    // 1.4 (an old slider position of 140) is 103.7% of the standard.
    expect(motionToPercent(1.4)).toBe(105)
    // The old slider reached 75 and 220: both are past the ends of the new one.
    expect(motionToPercent(0.75)).toBe(MOTION_PERCENT_MIN)
    expect(motionToPercent(2.2)).toBe(MOTION_PERCENT_MAX)
  })

  it('treats a value that is not a number as the standard', () => {
    expect(motionToPercent(Number.NaN)).toBe(100)
  })

  it('round-trips every slider position', () => {
    for (
      let percent = MOTION_PERCENT_MIN;
      percent <= MOTION_PERCENT_MAX;
      percent += MOTION_PERCENT_STEP
    )
      expect(motionToPercent(percentToMotion(percent))).toBe(percent)
  })
})
