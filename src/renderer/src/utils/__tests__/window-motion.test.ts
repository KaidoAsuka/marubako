import { describe, expect, it } from 'vitest'

import { DOCK_SIZE } from '../../../../shared/dock-size'
import { currentScale, panelGeometry } from '../window-motion'

// The ball window sits 8px left of the panel (DOCK_PANEL_GAP in the main process), so its top-left
// corner is that far, plus its own width, left of the panel's.
const GAP = 8
const BALL_LEFT = { x: -(DOCK_SIZE + GAP), y: 0 }
// The ball is drawn in the middle of its window.
const CENTER = DOCK_SIZE / 2

describe('panelGeometry', () => {
  it('scales from the centre of the ball, which may lie outside the panel window', () => {
    const geometry = panelGeometry(BALL_LEFT, 760, 720)
    expect(geometry.origin).toBe(`${-GAP - CENTER}px ${CENTER}px`)
    expect(-GAP - CENTER).toBeLessThan(0)
  })

  it('takes the centre to be the middle of the ball window, whatever its size', () => {
    expect(panelGeometry({ x: 0, y: 0 }, 760, 720).origin).toBe(
      `${CENTER}px ${CENTER}px`
    )
    expect(panelGeometry({ x: 428, y: 332 }, 420, 700).origin).toBe(
      `${428 + CENTER}px ${332 + CENTER}px`
    )
  })

  it('keeps the far edge travelling about 48px however large the panel is', () => {
    for (const [width, height, origin] of [
      [760, 720, BALL_LEFT],
      [420, 700, { x: 428, y: 332 }],
      [1100, 900, { ...BALL_LEFT, y: 100 }],
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
    const { collapse, origin } = panelGeometry(BALL_LEFT, 760, 720)
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
