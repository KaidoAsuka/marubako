import { DOCK_SIZE } from '../../../shared/dock-size'
import type { DockPosition } from '../../../shared/types'
import type { SpringOptions } from './spring'

/** How far the far edge of the panel travels while it scales in, in pixels. */
const EXPAND_TRAVEL = 48
/** How far the far edge travels while it scales out. */
const COLLAPSE_TRAVEL = 32

/** The ball bounces visibly; the panel only settles with a trace of overshoot. */
export const BALL_SPRING: SpringOptions = { bounce: 0.45, response: 300 }
export const PANEL_SPRING: SpringOptions = { bounce: 0.2, response: 340 }

/** Drawn size of the ball while the panel is open, relative to its resting size. */
export const DOT_SCALE = 0.52
export const BALL_RADIUS = '28% 28% 28% 50%'
export const DOT_RADIUS = '50%'

export interface PanelGeometry {
  /** `transform-origin`: the ball's centre in the panel window, possibly outside it. */
  origin: string
  /** Starting scale when the panel grows out of the ball. */
  expand: number
  /** End scale when the panel shrinks back towards the ball. */
  collapse: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * `origin` is the ball window's top-left corner in the panel window's coordinates, and `dockSize`
 * the side of that window: the ball's centre is in its middle. The scales are chosen so the
 * farthest panel edge always travels the same number of pixels, whatever the panel size.
 */
export function panelGeometry(
  origin: DockPosition,
  width: number,
  height: number,
  dockSize = DOCK_SIZE
): PanelGeometry {
  const x = origin.x + dockSize / 2
  const y = origin.y + dockSize / 2
  const reach = Math.max(
    Math.abs(x),
    Math.abs(width - x),
    Math.abs(y),
    Math.abs(height - y),
    1
  )
  return {
    origin: `${x}px ${y}px`,
    expand: clamp(1 - EXPAND_TRAVEL / reach, 0.8, 0.96),
    collapse: clamp(1 - COLLAPSE_TRAVEL / reach, 0, 1),
  }
}

/**
 * Horizontal scale of a computed `transform`, which is `none` or a matrix; an authored
 * `scale()` is accepted too. Anything else counts as full size.
 */
export function currentScale(transform: string | null | undefined): number {
  const match = /^(?:matrix3d|matrix|scale)\(\s*([-+\d.eE]+)/.exec(
    transform ?? ''
  )
  const value = match ? Number(match[1]) : Number.NaN
  return Number.isFinite(value) ? value : 1
}
