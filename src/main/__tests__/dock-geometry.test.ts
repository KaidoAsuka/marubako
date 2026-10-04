import { describe, expect, it } from 'vitest'
import {
  getDockBounds,
  getDockEdge,
  getExpandedPosition,
  getFirstRunLayout,
  isAtScreenEdge,
} from '../dock-geometry'

describe('screen edge docking', () => {
  it('allows free positioning and keeps the bubble inside the work area', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }
    expect(getDockBounds(area, { x: 120, y: 300 })).toEqual({
      x: 120,
      y: 300,
      width: 56,
      height: 56,
    })
    expect(getDockBounds(area, { x: 1400, y: 2000 })).toEqual({
      x: 1400,
      y: 984,
      width: 56,
      height: 56,
    })
  })

  it('snaps only when a drag ends within 24 pixels of either side', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }
    expect(getDockBounds(area, { x: 24, y: 300 }, true).x).toBe(4)
    expect(getDockBounds(area, { x: 25, y: 300 }, true).x).toBe(25)
    expect(getDockBounds(area, { x: 1840, y: 300 }, true).x).toBe(1860)
    expect(getDockBounds(area, { x: 1839, y: 300 }, true).x).toBe(1839)
    expect(getDockBounds(area, { x: 10, y: 300 }).x).toBe(10)
  })

  it('supports a monitor to the left and above the primary display', () => {
    const area = { x: -1600, y: -300, width: 1600, height: 900 }
    expect(getDockBounds(area, { x: -1550, y: -500 })).toEqual({
      x: -1550,
      y: -300,
      width: 56,
      height: 56,
    })
    expect(getDockBounds(area, { x: -100, y: 250 }).x).toBe(-100)
    expect(getDockBounds(area, { x: -1580, y: 250 }, true).x).toBe(-1596)
  })

  it('opens beside a fixed bubble, flips at the right edge and shifts vertically', () => {
    const area = { x: -1920, y: 0, width: 1920, height: 1040 }
    const size = { width: 760, height: 720 }
    expect(getExpandedPosition(area, { x: -1600, y: 150 }, size, null)).toEqual(
      { x: -1536, y: 150 }
    )
    expect(
      getExpandedPosition(area, { x: -1916, y: 488 }, size, 'left')
    ).toEqual({ x: -1852, y: 156 })
    expect(
      getExpandedPosition(area, { x: -60, y: 488 }, size, 'right')
    ).toEqual({ x: -828, y: 156 })
    expect(getExpandedPosition(area, { x: -200, y: 900 }, size, null)).toEqual({
      x: -968,
      y: 320,
    })
  })

  it('only docks the full panel near a vertical screen edge', () => {
    const area = { x: -1600, y: 0, width: 1600, height: 1000 }
    expect(
      isAtScreenEdge({ x: -1590, y: 100, width: 760, height: 720 }, area)
    ).toBe(true)
    expect(
      isAtScreenEdge({ x: -765, y: 100, width: 760, height: 720 }, area)
    ).toBe(true)
    expect(
      isAtScreenEdge({ x: -1200, y: 0, width: 760, height: 720 }, area)
    ).toBe(false)
  })
})

describe('the first-run layout', () => {
  const size = { width: 400, height: 720 }

  it('docks the ball to the right edge on the vertical middle and opens the panel to its left', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }
    const { dock, panel, edge } = getFirstRunLayout(area, size)

    expect(dock).toEqual({ x: 1860, y: 492 })
    expect(edge).toBe('right')
    expect(getDockEdge(area, dock)).toBe('right')
    // 8 px between the panel and the ball, the panel on the same middle.
    expect(panel).toEqual({ x: 1860 - 8 - 400, y: 160 })
    // The resting place of a pair: opening the panel from this ball puts it where it already is.
    expect(getExpandedPosition(area, dock, size, 'right')).toEqual(panel)
  })

  it('works on a second monitor to the left and on a small screen', () => {
    const left = { x: -1920, y: 0, width: 1920, height: 1040 }
    expect(getFirstRunLayout(left, size).dock).toEqual({ x: -60, y: 492 })
    expect(getFirstRunLayout(left, size).panel.x).toBe(-60 - 8 - 400)

    const small = { x: 0, y: 0, width: 1366, height: 728 }
    const layout = getFirstRunLayout(small, { width: 400, height: 704 })
    expect(layout.dock).toEqual({ x: 1306, y: 336 })
    expect(layout.panel).toEqual({ x: 1306 - 8 - 400, y: 12 })
  })

  it('keeps the panel on screen when the screen is barely wider than it', () => {
    const narrow = { x: 0, y: 0, width: 420, height: 800 }
    const { panel } = getFirstRunLayout(narrow, size)

    expect(panel.x).toBeGreaterThanOrEqual(0)
    expect(panel.x + size.width).toBeLessThanOrEqual(420)
  })
})
