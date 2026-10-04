import { describe, expect, it } from 'vitest'

import {
  BALL_SIZE_STEP,
  clampBallSize,
  DOCK_BALL_SIZE,
  DOCK_SIZE,
  dockWindowSize,
  MAX_BALL_SIZE,
  MIN_BALL_SIZE,
} from '../dock-size'

/** Every size the slider of the setting can produce. */
const SLIDER_SIZES: number[] = []
for (let size = MIN_BALL_SIZE; size <= MAX_BALL_SIZE; size += BALL_SIZE_STEP)
  SLIDER_SIZES.push(size)

// The spring that settles the ball throws it 12.6% past its size at the most, and the hairline
// around the ball is drawn 1 px outside its box and swells with it. Both numbers are measured, from
// the real spring and the real stylesheet, in renderer/src/styles/__tests__/dock-size.test.ts.
const SPRING_OVERSHOOT = 1.126
const RING = 1

describe('the range of the ball size setting', () => {
  it('goes from 24 to 64 px in steps of 2, and starts at 30', () => {
    expect(MIN_BALL_SIZE).toBe(24)
    expect(MAX_BALL_SIZE).toBe(64)
    expect(BALL_SIZE_STEP).toBe(2)
    expect(DOCK_BALL_SIZE).toBe(30)
  })

  it('has the default and both ends among the sizes the slider can produce', () => {
    expect(SLIDER_SIZES[0]).toBe(MIN_BALL_SIZE)
    expect(SLIDER_SIZES.at(-1)).toBe(MAX_BALL_SIZE)
    expect(SLIDER_SIZES).toContain(DOCK_BALL_SIZE)
  })
})

describe('clampBallSize', () => {
  it('keeps every size the slider can produce', () => {
    for (const size of SLIDER_SIZES) expect(clampBallSize(size)).toBe(size)
  })

  it.each([
    [23, 24],
    [0, 24],
    [-48, 24],
    [65, 64],
    [1000, 64],
  ])('brings %s into the range: %s', (value, expected) => {
    expect(clampBallSize(value)).toBe(expected)
  })

  // An odd ball would leave half a pixel of air on each side of it.
  it.each([
    [31, 32],
    [30.4, 30],
    [30.9, 30],
    [47.2, 48],
    [63, 64],
    [24.6, 24],
  ])('moves %s to the step of the slider next to it: %s', (value, expected) => {
    expect(clampBallSize(value)).toBe(expected)
  })

  it('always answers with a size of the slider, whatever number it is given', () => {
    for (let value = -10; value <= 100; value += 0.7)
      expect(SLIDER_SIZES, String(value)).toContain(clampBallSize(value))
  })

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['a numeric string', '48'],
    ['null', null],
    ['undefined', undefined],
    ['true', true],
    ['an object', { size: 48 }],
    ['a list', [48]],
  ])('falls back for %s: it is not a size', (_label, value) => {
    expect(clampBallSize(value)).toBe(DOCK_BALL_SIZE)
    // The caller says what to fall back to; the default ball when it does not.
    expect(clampBallSize(value, 48)).toBe(48)
  })
})

describe('dockWindowSize', () => {
  it('is the window of the default ball for DOCK_SIZE: 40 px', () => {
    expect(DOCK_SIZE).toBe(dockWindowSize(DOCK_BALL_SIZE))
    expect(DOCK_SIZE).toBe(40)
  })

  // Windows does not make a window lower than about 39 pixels.
  it.each([24, 26, 28, 30])('is 40 px for a ball of %i px', (ballSize) => {
    expect(dockWindowSize(ballSize)).toBe(40)
  })

  // At least 10 px larger than the ball, and then the next multiple of four.
  it.each([
    [32, 44],
    [34, 44],
    [36, 48],
    [48, 60],
    [50, 60],
    [60, 72],
  ])('is %i + 10 px or the multiple of four above it: %i', (ballSize, side) => {
    expect(dockWindowSize(ballSize)).toBe(side)
  })

  // The spring swells the ball by a share of its size: for the largest balls that is more than
  // the ten pixels (62 + 2 px of hairline, swollen by 12.6%, is 72.06 px).
  it.each([
    [62, 76],
    [64, 76],
  ])(
    'leaves a ball of %i px the room its spring needs: %i',
    (ballSize, side) => {
      expect(dockWindowSize(ballSize)).toBe(side)
    }
  )

  it('never gets smaller as the ball gets larger', () => {
    for (let index = 1; index < SLIDER_SIZES.length; index += 1)
      expect(
        dockWindowSize(SLIDER_SIZES[index]!),
        String(SLIDER_SIZES[index])
      ).toBeGreaterThanOrEqual(dockWindowSize(SLIDER_SIZES[index - 1]!))
  })

  it('takes a size that cannot be drawn for the nearest one that can', () => {
    expect(dockWindowSize(1000)).toBe(dockWindowSize(MAX_BALL_SIZE))
    expect(dockWindowSize(-5)).toBe(dockWindowSize(MIN_BALL_SIZE))
    expect(dockWindowSize(47)).toBe(dockWindowSize(48))
    expect(dockWindowSize(Number.NaN)).toBe(DOCK_SIZE)
  })
})

describe('the window of the ball, for every size the slider can produce', () => {
  // Such a length is a whole number of screen pixels at the display scales of Windows (125%, 150%,
  // 175%). A window of another size comes out a pixel larger than it was asked to be.
  it.each(SLIDER_SIZES)(
    'is a multiple of four and never below 40 px (%i px)',
    (ballSize) => {
      const side = dockWindowSize(ballSize)

      expect(side % 4).toBe(0)
      expect(side).toBeGreaterThanOrEqual(40)
    }
  )

  it.each(SLIDER_SIZES)(
    'leaves a whole number of pixels of air on each side of the ball, 5 at the least (%i px)',
    (ballSize) => {
      const air = (dockWindowSize(ballSize) - ballSize) / 2

      // Half a pixel would draw the ball between two pixels.
      expect(Number.isInteger(air)).toBe(true)
      expect(air).toBeGreaterThanOrEqual(5)
    }
  )

  // Nothing may be drawn outside the window: it would be cut off.
  it.each(SLIDER_SIZES)(
    'holds the ball when the spring swells it by 12.6%%, the 1 px ring around it included (%i px)',
    (ballSize) => {
      const side = dockWindowSize(ballSize)

      expect(ballSize * SPRING_OVERSHOOT).toBeLessThanOrEqual(side)
      expect((ballSize + 2 * RING) * SPRING_OVERSHOOT).toBeLessThanOrEqual(side)
    }
  )
})
