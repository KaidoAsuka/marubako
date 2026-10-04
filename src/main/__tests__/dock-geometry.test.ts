import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DOCK_MARGIN,
  DOCK_PANEL_GAP,
  DOCK_SIZE,
  DOCK_SNAP_DISTANCE,
  fitsInArea,
  getDockBounds,
  getDockEdge,
  getDockSize,
  getExpandedPosition,
  getFirstRunLayout,
  isAtScreenEdge,
  redockToEdge,
  setDockSize,
  standsBeside,
} from '../dock-geometry'
import {
  DOCK_BALL_SIZE,
  DOCK_SIZE as SHARED_DOCK_SIZE,
  dockWindowSize,
} from '../../shared/dock-size'

// Every expectation below is written in terms of DOCK_SIZE, so that the size of the ball can be
// changed in one place (shared/dock-size.ts).
const HALF = DOCK_SIZE / 2

describe('the size of the ball', () => {
  it('is the one the interface draws: the main process takes it from the shared module', () => {
    expect(DOCK_SIZE).toBe(SHARED_DOCK_SIZE)
  })

  it('has room in its window for the ball that is drawn: nothing may be drawn outside it', () => {
    expect(DOCK_BALL_SIZE).toBeGreaterThan(0)
    expect(DOCK_BALL_SIZE).toBeLessThanOrEqual(DOCK_SIZE)
  })

  it('keeps the distances around the ball, whatever its size', () => {
    expect(DOCK_MARGIN).toBe(4)
    expect(DOCK_SNAP_DISTANCE).toBe(24)
    expect(DOCK_PANEL_GAP).toBe(8)
  })
})

describe('screen edge docking', () => {
  it('allows free positioning and keeps the bubble inside the work area', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }
    expect(getDockBounds(area, { x: 120, y: 300 })).toEqual({
      x: 120,
      y: 300,
      width: DOCK_SIZE,
      height: DOCK_SIZE,
    })
    expect(getDockBounds(area, { x: 1400, y: 2000 })).toEqual({
      x: 1400,
      y: 1040 - DOCK_SIZE,
      width: DOCK_SIZE,
      height: DOCK_SIZE,
    })
    expect(getDockBounds(area, { x: 5000, y: 300 }).x).toBe(1920 - DOCK_SIZE)
  })

  it('snaps only when a drag ends within 24 pixels of either side', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }
    // The right-most place of the ball; it snaps to 4 px off the edge.
    const right = 1920 - DOCK_SIZE
    expect(getDockBounds(area, { x: 24, y: 300 }, true).x).toBe(4)
    expect(getDockBounds(area, { x: 25, y: 300 }, true).x).toBe(25)
    expect(getDockBounds(area, { x: right - 24, y: 300 }, true).x).toBe(
      right - 4
    )
    expect(getDockBounds(area, { x: right - 25, y: 300 }, true).x).toBe(
      right - 25
    )
    expect(getDockBounds(area, { x: 10, y: 300 }).x).toBe(10)
  })

  it('supports a monitor to the left and above the primary display', () => {
    const area = { x: -1600, y: -300, width: 1600, height: 900 }
    expect(getDockBounds(area, { x: -1550, y: -500 })).toEqual({
      x: -1550,
      y: -300,
      width: DOCK_SIZE,
      height: DOCK_SIZE,
    })
    expect(getDockBounds(area, { x: -100, y: 250 }).x).toBe(-100)
    expect(getDockBounds(area, { x: -1580, y: 250 }, true).x).toBe(-1596)
    expect(getDockBounds(area, { x: -DOCK_SIZE - 10, y: 250 }, true).x).toBe(
      -DOCK_SIZE - 4
    )
  })

  it('opens beside a fixed bubble, flips at the right edge and shifts vertically', () => {
    const area = { x: -1920, y: 0, width: 1920, height: 1040 }
    const size = { width: 760, height: 720 }
    // To the right of a free ball: its width and the 8 px gap further on, at the ball's top.
    expect(getExpandedPosition(area, { x: -1600, y: 150 }, size, null)).toEqual(
      { x: -1600 + DOCK_SIZE + 8, y: 150 }
    )
    // A docked ball has the panel centred on its middle.
    expect(
      getExpandedPosition(area, { x: -1916, y: 488 }, size, 'left')
    ).toEqual({ x: -1916 + DOCK_SIZE + 8, y: Math.round(488 + HALF - 360) })
    expect(
      getExpandedPosition(area, { x: -DOCK_SIZE - 4, y: 488 }, size, 'right')
    ).toEqual({
      x: -DOCK_SIZE - 4 - 8 - 760,
      y: Math.round(488 + HALF - 360),
    })
    // No room on the right: the panel flips to the left of the ball and is kept on the screen.
    expect(getExpandedPosition(area, { x: -200, y: 900 }, size, null)).toEqual({
      x: -968,
      y: 320,
    })
  })

  it('puts the panel of a docked ball on whole pixels, whatever its height', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }

    for (const height of [600, 601, 719, 720, 721]) {
      const size = { width: 400, height }
      for (const edge of ['left', 'right'] as const) {
        const dock = redockToEdge(area, { x: 0, y: 500 }, edge)
        const { x, y } = getExpandedPosition(area, dock, size, edge)

        expect(Number.isInteger(x), `${edge} ${height}`).toBe(true)
        expect(Number.isInteger(y), `${edge} ${height}`).toBe(true)
        // Centred on the middle of the ball, to the nearest pixel.
        expect(y, `${edge} ${height}`).toBe(Math.round(500 + HALF - height / 2))
        expect(Math.abs(y + height / 2 - (500 + HALF))).toBeLessThanOrEqual(0.5)
      }
    }
  })

  it('leaves the panel of a free ball at the top of the ball', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }

    expect(
      getExpandedPosition(
        area,
        { x: 300, y: 137 },
        { width: 400, height: 601 },
        null
      )
    ).toEqual({ x: 300 + DOCK_SIZE + 8, y: 137 })
  })

  it('knows a ball that stands 4 pixels off an edge as docked there, to the pixel', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }
    const right = 1920 - DOCK_SIZE - 4

    expect(getDockEdge(area, { x: 4, y: 300 })).toBe('left')
    expect(getDockEdge(area, { x: 5, y: 300 })).toBe('left')
    expect(getDockEdge(area, { x: 6, y: 300 })).toBeNull()
    expect(getDockEdge(area, { x: right, y: 300 })).toBe('right')
    expect(getDockEdge(area, { x: right - 1, y: 300 })).toBe('right')
    expect(getDockEdge(area, { x: right - 2, y: 300 })).toBeNull()
    expect(getDockEdge(area, { x: 900, y: 300 })).toBeNull()
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

    expect(dock).toEqual({
      x: 1920 - 4 - DOCK_SIZE,
      y: Math.round((1040 - DOCK_SIZE) / 2),
    })
    expect(edge).toBe('right')
    expect(getDockEdge(area, dock)).toBe('right')
    // 8 px between the panel and the ball, the panel on the same middle.
    expect(panel).toEqual({
      x: dock.x - 8 - 400,
      y: Math.round(dock.y + HALF - 720 / 2),
    })
    expect(standsBeside({ ...panel, ...size }, dock)).toBe(true)
    // The resting place of a pair: opening the panel from this ball puts it where it already is.
    expect(getExpandedPosition(area, dock, size, 'right')).toEqual(panel)
  })

  it('works on a second monitor to the left and on a small screen', () => {
    const left = { x: -1920, y: 0, width: 1920, height: 1040 }
    expect(getFirstRunLayout(left, size).dock).toEqual({
      x: -4 - DOCK_SIZE,
      y: Math.round((1040 - DOCK_SIZE) / 2),
    })
    expect(getFirstRunLayout(left, size).panel.x).toBe(-4 - DOCK_SIZE - 8 - 400)

    const small = { x: 0, y: 0, width: 1366, height: 728 }
    const layout = getFirstRunLayout(small, { width: 400, height: 704 })
    expect(layout.dock).toEqual({
      x: 1366 - 4 - DOCK_SIZE,
      y: Math.round((728 - DOCK_SIZE) / 2),
    })
    expect(layout.panel).toEqual({
      x: layout.dock.x - 8 - 400,
      y: Math.round(layout.dock.y + HALF - 704 / 2),
    })
  })

  it('keeps the panel on screen when the screen is barely wider than it', () => {
    const narrow = { x: 0, y: 0, width: 420, height: 800 }
    const { panel } = getFirstRunLayout(narrow, size)

    expect(panel.x).toBeGreaterThanOrEqual(0)
    expect(panel.x + size.width).toBeLessThanOrEqual(420)
  })
})

describe('fitsInArea', () => {
  const area = { x: -1600, y: -300, width: 1600, height: 900 }

  it('accepts a window that lies inside the work area, its edges included', () => {
    expect(fitsInArea({ x: -1000, y: 0, width: 400, height: 300 }, area)).toBe(
      true
    )
    // Exactly the work area: every side touches, none is outside.
    expect(fitsInArea(area, area)).toBe(true)
    expect(fitsInArea({ x: -400, y: 300, width: 400, height: 300 }, area)).toBe(
      true
    )
  })

  it.each([
    ['left', { x: -1601, y: 0, width: 400, height: 300 }],
    ['top', { x: -1000, y: -301, width: 400, height: 300 }],
    ['right', { x: -399, y: 0, width: 400, height: 300 }],
    ['bottom', { x: -1000, y: 301, width: 400, height: 300 }],
  ])('refuses a window one pixel over the %s side', (_side, bounds) => {
    expect(fitsInArea(bounds, area)).toBe(false)
  })

  it('refuses a window larger than the work area, wherever it stands', () => {
    expect(
      fitsInArea({ x: -1600, y: -300, width: 1601, height: 900 }, area)
    ).toBe(false)
    expect(
      fitsInArea({ x: -1600, y: -300, width: 1600, height: 901 }, area)
    ).toBe(false)
  })

  it('refuses a window on another screen', () => {
    expect(fitsInArea({ x: 100, y: 100, width: 400, height: 300 }, area)).toBe(
      false
    )
  })
})

describe('standsBeside', () => {
  const dock = { x: 1000, y: 500 }
  const size = { width: 400, height: 600 }
  /** A panel `gap` px to the right of the ball, top on top. */
  const onTheRight = (gap: number) => ({
    x: dock.x + DOCK_SIZE + gap,
    y: dock.y,
    ...size,
  })
  /** A panel `gap` px to the left of the ball, top on top. */
  const onTheLeft = (gap: number) => ({
    x: dock.x - gap - size.width,
    y: dock.y,
    ...size,
  })

  it('knows a panel the gap of 8 px away from the ball, on either side, as beside it', () => {
    expect(standsBeside(onTheRight(DOCK_PANEL_GAP), dock)).toBe(true)
    expect(standsBeside(onTheLeft(DOCK_PANEL_GAP), dock)).toBe(true)
  })

  it('knows every layout the app makes itself as beside the ball', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }
    const layouts = [
      { at: { x: 4, y: 500 }, edge: 'left' },
      { at: { x: 1920 - DOCK_SIZE - 4, y: 500 }, edge: 'right' },
      { at: { x: 700, y: 300 }, edge: null },
      // No room on the right of this free ball: the panel flips to its left.
      { at: { x: 1700, y: 300 }, edge: null },
    ] as const

    for (const { at, edge } of layouts)
      for (const height of [600, 601])
        expect(
          standsBeside(
            {
              ...getExpandedPosition(area, at, { width: 400, height }, edge),
              width: 400,
              height,
            },
            at
          ),
          `${edge} ${at.x} ${height}`
        ).toBe(true)
  })

  it('allows 2 px more than the gap for rounding, and not a pixel beyond', () => {
    expect(standsBeside(onTheRight(DOCK_PANEL_GAP + 2), dock)).toBe(true)
    expect(standsBeside(onTheRight(DOCK_PANEL_GAP + 3), dock)).toBe(false)
    expect(standsBeside(onTheLeft(DOCK_PANEL_GAP + 2), dock)).toBe(true)
    expect(standsBeside(onTheLeft(DOCK_PANEL_GAP + 3), dock)).toBe(false)
  })

  it('takes the slack it is given: 18 px lets a panel laid out for a ball 16 px larger pass', () => {
    const forLargerBall = onTheRight(16 + DOCK_PANEL_GAP)

    expect(standsBeside(forLargerBall, dock)).toBe(false)
    expect(standsBeside(forLargerBall, dock, 18)).toBe(true)
    expect(standsBeside(onTheRight(DOCK_PANEL_GAP + 19), dock, 18)).toBe(false)
    expect(standsBeside(onTheRight(DOCK_PANEL_GAP), dock, 0)).toBe(true)
    expect(standsBeside(onTheRight(DOCK_PANEL_GAP + 1), dock, 0)).toBe(false)
  })

  it('knows a panel that touches the ball as beside it, and one that overlaps it as not', () => {
    expect(standsBeside(onTheRight(0), dock)).toBe(true)
    expect(standsBeside(onTheLeft(0), dock)).toBe(true)
    expect(standsBeside(onTheRight(-1), dock)).toBe(false)
    // The ball in the middle of the panel.
    expect(
      standsBeside({ x: dock.x - 200, y: dock.y - 300, ...size }, dock)
    ).toBe(false)
  })

  it('does not take a panel that is far from the ball for one beside it', () => {
    expect(standsBeside({ x: 100, y: 50, ...size }, dock)).toBe(false)
    // Beside it across, but far below it.
    expect(
      standsBeside(
        { ...onTheRight(DOCK_PANEL_GAP), y: dock.y + DOCK_SIZE + 50 },
        dock
      )
    ).toBe(false)
    // Above it within the gap, but far to the side.
    expect(
      standsBeside(
        { x: dock.x + DOCK_SIZE + 50, y: dock.y - 8 - size.height, ...size },
        dock
      )
    ).toBe(false)
  })

  it('counts the distance down like the distance across', () => {
    // The panel under the ball, 8 px below it.
    const below = { x: dock.x - 100, y: dock.y + DOCK_SIZE + 8, ...size }
    // The panel over the ball, its bottom 8 px above it.
    const above = { x: dock.x - 100, y: dock.y - 8 - size.height, ...size }

    expect(standsBeside(below, dock)).toBe(true)
    expect(standsBeside(above, dock)).toBe(true)
    expect(standsBeside({ ...below, y: below.y + 3 }, dock)).toBe(false)
    expect(standsBeside({ ...above, y: above.y - 3 }, dock)).toBe(false)
    // Corner to corner, the gap away both ways.
    expect(
      standsBeside(
        { ...onTheRight(DOCK_PANEL_GAP), y: dock.y + DOCK_SIZE + 8 },
        dock
      )
    ).toBe(true)
  })

  it('does not mind how far the panel reaches past the ball', () => {
    // A docked layout: the panel is centred on the ball and far taller than it.
    expect(
      standsBeside(
        { ...onTheLeft(DOCK_PANEL_GAP), y: dock.y - 280, height: 600 },
        dock
      )
    ).toBe(true)
  })
})

describe('redockToEdge', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 }
  // Where the right edge is for the ball as it is now, and where a ball 16 px larger was saved.
  const rightEdge = 1920 - DOCK_SIZE - DOCK_MARGIN
  const savedForLargerBall = rightEdge - 16

  it('puts a ball saved at the right edge flush against it for the size the ball has now', () => {
    // The saved place is no longer the edge: the smaller ball would stand off it.
    expect(getDockEdge(area, { x: savedForLargerBall, y: 500 })).toBeNull()

    const dock = redockToEdge(area, { x: savedForLargerBall, y: 500 }, 'right')

    expect(dock).toEqual({ x: rightEdge, y: 500 })
    expect(getDockEdge(area, dock)).toBe('right')
  })

  it('puts a ball saved at the left edge 4 pixels off it and keeps its height', () => {
    expect(redockToEdge(area, { x: 4, y: 321 }, 'left')).toEqual({
      x: 4,
      y: 321,
    })
    const dock = redockToEdge(area, { x: 30, y: 321 }, 'left')
    expect(dock).toEqual({ x: 4, y: 321 })
    expect(getDockEdge(area, dock)).toBe('left')
  })

  it('leaves a free ball exactly where it is', () => {
    const position = { x: 700, y: 300 }

    expect(redockToEdge(area, position, null)).toBe(position)
  })

  it('measures from the work area of the screen the ball is on', () => {
    const left = { x: -1600, y: -300, width: 1600, height: 900 }

    expect(redockToEdge(left, { x: -90, y: 100 }, 'right')).toEqual({
      x: -DOCK_SIZE - DOCK_MARGIN,
      y: 100,
    })
    expect(redockToEdge(left, { x: -1500, y: 100 }, 'left')).toEqual({
      x: -1596,
      y: 100,
    })
  })

  it('agrees with where a drag snaps the ball and with the first-run layout', () => {
    const redocked = redockToEdge(
      area,
      { x: savedForLargerBall, y: 500 },
      'right'
    )

    expect(redocked.x).toBe(getDockBounds(area, { x: 1900, y: 500 }, true).x)
    expect(redocked.x).toBe(
      getFirstRunLayout(area, { width: 400, height: 720 }).dock.x
    )
    expect(redockToEdge(area, { x: 30, y: 500 }, 'left').x).toBe(
      getDockBounds(area, { x: 10, y: 500 }, true).x
    )
  })
})

describe('a ball of the size the user set', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 }
  // The window of the largest ball the setting offers.
  const LARGE = dockWindowSize(64)

  beforeEach(() => {
    setDockSize(LARGE)
  })

  // The size is kept by the module: the tests around this block go by the default.
  afterEach(() => {
    setDockSize(DOCK_SIZE)
  })

  it('starts at the default size, and keeps the size it is told', () => {
    setDockSize(DOCK_SIZE)
    expect(getDockSize()).toBe(DOCK_SIZE)

    setDockSize(LARGE)
    expect(getDockSize()).toBe(LARGE)
    expect(LARGE).toBeGreaterThan(DOCK_SIZE)
  })

  it('gives the window of the ball that size and keeps all of it in the work area', () => {
    expect(getDockBounds(area, { x: 120, y: 300 })).toEqual({
      x: 120,
      y: 300,
      width: LARGE,
      height: LARGE,
    })
    expect(getDockBounds(area, { x: 5000, y: 2000 })).toEqual({
      x: 1920 - LARGE,
      y: 1040 - LARGE,
      width: LARGE,
      height: LARGE,
    })
  })

  it('snaps and docks 4 px off the right edge for that size', () => {
    const right = 1920 - LARGE

    expect(getDockBounds(area, { x: right - 24, y: 300 }, true).x).toBe(
      right - 4
    )
    expect(getDockBounds(area, { x: right - 25, y: 300 }, true).x).toBe(
      right - 25
    )
    expect(getDockEdge(area, { x: right - 4, y: 300 })).toBe('right')
    // Where the default ball is docked is not the edge for this one.
    expect(getDockEdge(area, { x: 1920 - DOCK_SIZE - 4, y: 300 })).toBeNull()
    expect(
      redockToEdge(area, { x: 1920 - DOCK_SIZE - 4, y: 300 }, 'right')
    ).toEqual({ x: right - 4, y: 300 })
    // The left edge does not depend on the size.
    expect(getDockEdge(area, { x: 4, y: 300 })).toBe('left')
    expect(redockToEdge(area, { x: 30, y: 300 }, 'left')).toEqual({
      x: 4,
      y: 300,
    })
  })

  it('opens the panel 8 px from the window of that size', () => {
    const size = { width: 400, height: 600 }

    // To the right of a free ball, at its top.
    expect(getExpandedPosition(area, { x: 300, y: 150 }, size, null)).toEqual({
      x: 300 + LARGE + 8,
      y: 150,
    })
    // Centred on the middle of a docked ball.
    expect(getExpandedPosition(area, { x: 4, y: 500 }, size, 'left')).toEqual({
      x: 4 + LARGE + 8,
      y: Math.round(500 + LARGE / 2 - 300),
    })
    expect(
      getExpandedPosition(area, { x: 1920 - LARGE - 4, y: 500 }, size, 'right')
    ).toEqual({
      x: 1920 - LARGE - 4 - 8 - 400,
      y: Math.round(500 + LARGE / 2 - 300),
    })
  })

  it('lays out a new installation for that size', () => {
    const size = { width: 400, height: 720 }
    const { dock, panel } = getFirstRunLayout(area, size)

    expect(dock).toEqual({
      x: 1920 - 4 - LARGE,
      y: Math.round((1040 - LARGE) / 2),
    })
    expect(panel).toEqual({
      x: dock.x - 8 - 400,
      y: Math.round(dock.y + LARGE / 2 - 360),
    })
    expect(getDockEdge(area, dock)).toBe('right')
  })

  it('measures "beside the ball" from the window of that size', () => {
    const dock = { x: 1000, y: 500 }
    const size = { width: 400, height: 600 }

    expect(
      standsBeside(
        { x: dock.x + LARGE + DOCK_PANEL_GAP, y: dock.y, ...size },
        dock
      )
    ).toBe(true)
    // Where the panel of the default ball stands, this ball reaches into it.
    expect(
      standsBeside(
        { x: dock.x + DOCK_SIZE + DOCK_PANEL_GAP, y: dock.y, ...size },
        dock
      )
    ).toBe(false)
    // Under the ball, the gap below its window.
    expect(
      standsBeside({ x: dock.x - 100, y: dock.y + LARGE + 8, ...size }, dock)
    ).toBe(true)
  })
})
