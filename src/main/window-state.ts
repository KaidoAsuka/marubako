import { MIN_OPACITY } from '../shared/types'
import type { WindowBounds, WindowState } from '../shared/types'

type LegacyWindowState = Partial<WindowState> & {
  x?: number
  y?: number
  width?: number
  height?: number
}

export type { LegacyWindowState }

export function clampOpacity(value: unknown, fallback = 1): number {
  const number =
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(1, Math.max(MIN_OPACITY, number))
}

function normalizeBounds(
  bounds: Partial<WindowBounds> | undefined
): WindowBounds | undefined {
  if (
    typeof bounds?.x !== 'number' ||
    typeof bounds?.y !== 'number' ||
    typeof bounds?.w !== 'number' ||
    typeof bounds?.h !== 'number' ||
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.w) ||
    !Number.isFinite(bounds.h)
  ) {
    return undefined
  }

  return {
    x: bounds.x,
    y: bounds.y,
    w: bounds.w,
    h: bounds.h,
  }
}

export function normalizeWindowState(
  input: LegacyWindowState | undefined,
  fallbackOpacity = 1
): WindowState {
  const bounds =
    normalizeBounds(input?.bounds) ??
    normalizeBounds(
      typeof input?.x === 'number' &&
        typeof input?.y === 'number' &&
        typeof input?.width === 'number' &&
        typeof input?.height === 'number'
        ? { x: input.x, y: input.y, w: input.width, h: input.height }
        : undefined
    )
  const preCollapseHeight =
    typeof input?.preCollapseHeight === 'number' &&
    Number.isFinite(input.preCollapseHeight)
      ? input.preCollapseHeight
      : (bounds?.h ?? 700)

  return {
    bounds,
    ...(input?.dockEdge === null ||
    input?.dockEdge === 'left' ||
    input?.dockEdge === 'right'
      ? { dockEdge: input.dockEdge }
      : {}),
    ...(Number.isFinite(input?.dockPosition?.x) &&
    Number.isFinite(input?.dockPosition?.y)
      ? { dockPosition: input!.dockPosition }
      : {}),
    opacity: clampOpacity(input?.opacity, fallbackOpacity),
    alwaysOnTop:
      typeof input?.alwaysOnTop === 'boolean' ? input.alwaysOnTop : false,
    collapsed: typeof input?.collapsed === 'boolean' ? input.collapsed : false,
    preCollapseHeight: Math.max(420, preCollapseHeight),
    // Written by the main process only, so it has to be carried through every normalization.
    ...(input?.trayHintShown === true ? { trayHintShown: true } : {}),
  }
}

/**
 * The state the window starts from. A collapsed state is kept, so the ball can come back after a
 * restart; only the expanded height older versions saved as a thin strip is repaired.
 */
export function getLaunchWindowState(windowState: WindowState): WindowState {
  const { bounds } = windowState
  if (!windowState.collapsed || !bounds || bounds.h >= 420) {
    return windowState
  }

  return {
    ...windowState,
    bounds: { ...bounds, h: windowState.preCollapseHeight },
  }
}
