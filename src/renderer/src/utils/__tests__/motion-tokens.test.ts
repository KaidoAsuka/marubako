import { describe, expect, it } from 'vitest'

import { motionTimeScale } from '../../../../shared/motion-scale'
import { applyMotionTokens, motionDurations } from '../motion-tokens'

describe('motionDurations', () => {
  it('is 120, 180 and 600 milliseconds at the default motion setting', () => {
    expect(motionDurations(1.35)).toEqual({
      fast: 120,
      normal: 180,
      spring: 600,
    })
  })

  it('shrinks and grows with the same time scale the ball and the panel use', () => {
    for (const motion of [0.75, 1, 1.35, 1.8, 2.2]) {
      const scale = motionTimeScale(motion)

      expect(motionDurations(motion)).toEqual({
        fast: Math.round(120 * scale),
        normal: Math.round(180 * scale),
        spring: Math.round(600 * scale),
      })
    }
  })

  it('stays between 0.6 and 1.6 times the base across the whole slider', () => {
    // The slider runs from 75% to 220%; the previous mapping gave 90 to 264 ms for the fast one.
    expect(motionDurations(0.75)).toEqual({
      fast: 72,
      normal: 108,
      spring: 360,
    })
    expect(motionDurations(2.2)).toEqual({
      fast: 192,
      normal: 288,
      spring: 960,
    })
    expect(motionDurations(0)).toEqual(motionDurations(0.75))
    expect(motionDurations(99)).toEqual(motionDurations(2.2))
  })

  it('falls back to the default for a value that is not a number', () => {
    expect(motionDurations(Number.NaN)).toEqual(motionDurations(1.35))
  })
})

describe('applyMotionTokens', () => {
  it('writes the three scaled durations and nothing else onto the root', () => {
    const root = document.createElement('div')

    applyMotionTokens(root, 1.8)

    expect(root.style.getPropertyValue('--motion-fast')).toBe('160ms')
    expect(root.style.getPropertyValue('--motion-normal')).toBe('240ms')
    expect(root.style.getPropertyValue('--motion-spring')).toBe('800ms')
    // --motion-instant does not scale, and --motion-slow no longer exists.
    expect(root.style.getPropertyValue('--motion-instant')).toBe('')
    expect(root.style.getPropertyValue('--motion-slow')).toBe('')
    expect(root.style.length).toBe(3)
  })
})
