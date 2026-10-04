import type { DragEndEvent } from '@dnd-kit/core'
import { describe, expect, it } from 'vitest'

import {
  ensureMinimumRectSize,
  expandRect,
  getRelativeDropPlacement,
  normalizeAxis,
  resolveDragPosition,
  toMeasuredRect,
} from '../geometry'

function makeDragEvent(
  activatorEvent: Event | null,
  delta: { x: number; y: number }
): DragEndEvent {
  const rect = { left: 100, top: 200, width: 40, height: 20 }

  return {
    activatorEvent,
    delta,
    active: {
      id: 'active',
      rect: { current: { initial: rect, translated: rect } },
    },
    over: null,
  } as unknown as DragEndEvent
}

describe('geometry helpers', () => {
  it('normalizes values against the provided axis size', () => {
    expect(normalizeAxis(15, 10, 20)).toBeCloseTo(0.25)
  })

  it('resolves drop placement against an axis midpoint', () => {
    expect(
      getRelativeDropPlacement(
        { x: 10, y: 10 },
        { left: 0, top: 0, width: 40, height: 40 },
        'x'
      )
    ).toBe('before')
    expect(
      getRelativeDropPlacement(
        { x: 10, y: 30 },
        { left: 0, top: 0, width: 40, height: 40 },
        'y'
      )
    ).toBe('after')
  })

  it('converts DOM-like rects into measured rects', () => {
    expect(toMeasuredRect({ left: 1, top: 2, width: 3, height: 4 })).toEqual({
      left: 1,
      top: 2,
      width: 3,
      height: 4,
    })
  })

  it('expands a rect with directional padding', () => {
    expect(
      expandRect(
        { left: 20, top: 30, width: 40, height: 50 },
        { top: 4, right: 6, bottom: 8, left: 10 }
      )
    ).toEqual({
      left: 10,
      top: 26,
      width: 56,
      height: 62,
    })
  })

  it('ensures a minimum rect size around the original center', () => {
    expect(
      ensureMinimumRectSize(
        { left: 20, top: 30, width: 40, height: 50 },
        40,
        80
      )
    ).toEqual({
      left: 20,
      top: 15,
      width: 40,
      height: 80,
    })
  })

  describe('resolveDragPosition', () => {
    const pointerDown = new MouseEvent('pointerdown', {
      clientX: 50,
      clientY: 60,
    })

    it('uses the latest pointer for pointer drags instead of the scroll-inflated delta', () => {
      // dnd-kit adds the scrolled distance (400) to the delta.
      const event = makeDragEvent(pointerDown, { x: 0, y: 460 })

      expect(resolveDragPosition(event, { x: 50, y: 120 })).toEqual({
        x: 50,
        y: 120,
      })
    })

    it('falls back to the activator position plus delta without a latest pointer', () => {
      const event = makeDragEvent(pointerDown, { x: 10, y: 30 })

      expect(resolveDragPosition(event, null)).toEqual({ x: 60, y: 90 })
    })

    it('uses the centre of the active rect for keyboard drags, ignoring the mouse', () => {
      const event = makeDragEvent(new KeyboardEvent('keydown'), {
        x: 0,
        y: 0,
      })

      expect(resolveDragPosition(event, { x: 999, y: 999 })).toEqual({
        x: 120,
        y: 210,
      })
    })
  })
})
