import { DOCK_SIZE } from '../shared/dock-size'
import type { DockPosition, DockEdge } from '../shared/types'

export { DOCK_SIZE }
export const DOCK_MARGIN = 4
export const DOCK_SNAP_DISTANCE = 24
export const DOCK_PANEL_GAP = 8

type Area = { x: number; y: number; width: number; height: number }

export function getDockBounds(
  area: Area,
  position: DockPosition,
  snap = false
): Area {
  const right = area.x + area.width - DOCK_SIZE
  let x = Math.max(area.x, Math.min(right, position.x))
  if (snap && x - area.x <= DOCK_SNAP_DISTANCE) x = area.x + DOCK_MARGIN
  else if (snap && right - x <= DOCK_SNAP_DISTANCE) x = right - DOCK_MARGIN
  return {
    x,
    y: Math.max(area.y, Math.min(area.y + area.height - DOCK_SIZE, position.y)),
    width: DOCK_SIZE,
    height: DOCK_SIZE,
  }
}

export function getDockEdge(area: Area, position: DockPosition): DockEdge {
  if (Math.abs(position.x - area.x - DOCK_MARGIN) <= 1) return 'left'
  if (
    Math.abs(position.x - (area.x + area.width - DOCK_SIZE - DOCK_MARGIN)) <= 1
  )
    return 'right'
  return null
}

export function getExpandedPosition(
  area: Area,
  dock: DockPosition,
  size: { width: number; height: number },
  edge: DockEdge
): DockPosition {
  const right = dock.x + DOCK_SIZE + DOCK_PANEL_GAP
  const left = dock.x - size.width - DOCK_PANEL_GAP
  const fits = (x: number) =>
    x >= area.x && x + size.width <= area.x + area.width
  const preferred = edge === 'right' ? left : right
  const alternate = edge === 'right' ? right : left
  // Keep the reference button fixed; only the panel flips or shifts to fit.
  const x = fits(preferred)
    ? preferred
    : fits(alternate)
      ? alternate
      : dock.x - area.x > area.x + area.width - dock.x - DOCK_SIZE
        ? left
        : right
  // Whole pixels: a panel of odd height would otherwise be centred on a half one, and a window
  // cannot be placed there.
  const y = edge ? Math.round(dock.y + DOCK_SIZE / 2 - size.height / 2) : dock.y
  return {
    x: Math.max(area.x, Math.min(area.x + area.width - size.width, x)),
    y: Math.max(area.y, Math.min(area.y + area.height - size.height, y)),
  }
}

/**
 * Where a new installation puts the two windows: the ball docked to the right edge of the work area
 * and vertically centred, and the panel where the ball would open it, beside it. The pair is in
 * its resting place from the first second, so the first collapse and the first expansion move
 * nothing.
 */
export function getFirstRunLayout(
  area: Area,
  size: { width: number; height: number }
): { dock: DockPosition; panel: DockPosition; edge: 'right' } {
  const dock = {
    x: area.x + area.width - DOCK_SIZE - DOCK_MARGIN,
    y: area.y + Math.round((area.height - DOCK_SIZE) / 2),
  }
  return {
    dock,
    panel: getExpandedPosition(area, dock, size, 'right'),
    edge: 'right',
  }
}

/** Whether a window with these bounds lies wholly inside the work area. */
export function fitsInArea(bounds: Area, area: Area): boolean {
  return (
    bounds.x >= area.x &&
    bounds.y >= area.y &&
    bounds.x + bounds.width <= area.x + area.width &&
    bounds.y + bounds.height <= area.y + area.height
  )
}

/**
 * Whether a panel stands beside the ball: the two do not overlap, and are no further apart than
 * the gap the app leaves between them (plus `slack` for rounding), across and down. A panel that
 * was moved or resized while the ball was not on screen can be anywhere, and is not beside it.
 */
export function standsBeside(
  panel: Area,
  dock: DockPosition,
  slack = 2
): boolean {
  const apartX = Math.max(
    panel.x - (dock.x + DOCK_SIZE),
    dock.x - (panel.x + panel.width)
  )
  const apartY = Math.max(
    panel.y - (dock.y + DOCK_SIZE),
    dock.y - (panel.y + panel.height)
  )
  const reach = DOCK_PANEL_GAP + slack
  return (
    (apartX >= 0 || apartY >= 0) &&
    Math.max(apartX, 0) <= reach &&
    Math.max(apartY, 0) <= reach
  )
}

/**
 * Where a ball saved as docked to an edge sits for the current ball size: flush against that edge.
 * A saved position was computed for the size the ball had then, and the ball has been made smaller
 * since; one docked to the right edge would otherwise stand off it by the difference.
 */
export function redockToEdge(
  area: Area,
  position: DockPosition,
  edge: DockEdge
): DockPosition {
  if (edge === 'left') return { x: area.x + DOCK_MARGIN, y: position.y }
  if (edge === 'right')
    return {
      x: area.x + area.width - DOCK_SIZE - DOCK_MARGIN,
      y: position.y,
    }
  return position
}

export function isAtScreenEdge(bounds: Area, area: Area): boolean {
  return (
    Math.abs(bounds.x - area.x) <= DOCK_SNAP_DISTANCE ||
    Math.abs(bounds.x + bounds.width - area.x - area.width) <=
      DOCK_SNAP_DISTANCE
  )
}
