import { describe, expect, it } from 'vitest'

import { currentScale, panelGeometry } from '../window-motion'

describe('panelGeometry', () => {
  it('scales from the centre of the ball, which may lie outside the panel window', () => {
    // The ball window sits 8px left of the panel: its top-left corner is at x = -64.
    const geometry = panelGeometry({ x: -64, y: 0 }, 760, 720)
    expect(geometry.origin).toBe('-36px 28px')
  })

  it('keeps the far edge travelling about 48px however large the panel is', () => {
    for (const [width, height, origin] of [
      [760, 720, { x: -64, y: 0 }],
      [420, 700, { x: 428, y: 332 }],
      [1100, 900, { x: -64, y: 100 }],
    ] as const) {
      const { expand, origin: css } = panelGeometry(origin, width, height)
      const [ox = 0, oy = 0] = css.split(' ').map(parseFloat)
      const reach = Math.max(
        Math.abs(ox),
        Math.abs(width - ox),
        Math.abs(oy),
        Math.abs(height - oy)
      )
      expect(expand).toBeGreaterThanOrEqual(0.8)
      expect(expand).toBeLessThanOrEqual(0.96)
      // The clamp only bites for extreme sizes; in between the travel is 48px.
      if (expand > 0.8 && expand < 0.96)
        expect((1 - expand) * reach).toBeCloseTo(48, 6)
    }
  })

  it('clamps the starting scale to 0.80-0.96', () => {
    expect(panelGeometry({ x: 0, y: 0 }, 200, 200).expand).toBe(0.8)
    expect(panelGeometry({ x: 0, y: 0 }, 3000, 3000).expand).toBe(0.96)
  })

  it('shrinks the collapsing panel by 32px at the far edge', () => {
    const { collapse, origin } = panelGeometry({ x: -64, y: 0 }, 760, 720)
    const [ox = 0] = origin.split(' ').map(parseFloat)
    const reach = 760 - ox
    expect((1 - collapse) * reach).toBeCloseTo(32, 6)
  })
})

describe('currentScale', () => {
  it('reads the horizontal scale from a computed matrix', () => {
    expect(currentScale('matrix(0.92, 0, 0, 0.92, 0, 0)')).toBeCloseTo(0.92, 9)
    expect(
      currentScale(
        'matrix3d(0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)'
      )
    ).toBe(0.5)
  })

  it('reads an authored scale()', () => {
    expect(currentScale('scale(0.52)')).toBe(0.52)
  })

  it('treats no transform as full size', () => {
    expect(currentScale('none')).toBe(1)
    expect(currentScale('')).toBe(1)
    expect(currentScale(undefined)).toBe(1)
  })
})
