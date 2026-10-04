import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core'

import type { TopEntry } from '../../../../../shared/types'
import { parseTopEntrySortableId } from '../../../dnd/move-operations'

export type DropPlacement = 'before' | 'after'

export type MeasuredRect = {
  left: number
  top: number
  width: number
  height: number
}

export type DragPosition = {
  x: number
  y: number
}

export type RectPadding =
  | number
  | {
      top?: number
      right?: number
      bottom?: number
      left?: number
    }

const LIST_GROUP_DROP_PADDING: RectPadding = {
  top: 10,
  right: 14,
  bottom: 14,
  left: 14,
}

const LIST_GROUP_DROP_MIN_HEIGHT = 84

/**
 * How far in from its left and right edge, in px, a group's tile in the grid starts to count as "into the
 * group". The tile is one 44px line, and its 24px icon is no target to aim a drop at (the old 72px card
 * had a 32px box), so nearly all of the tile is the group; these two strips are where a drop goes next to
 * it instead, before or after, together with the gap between tiles.
 */
export const GRID_GROUP_EDGE = 14

export function normalizeAxis(
  value: number,
  start: number,
  size: number
): number {
  return (value - start) / Math.max(1, size)
}

export function toMeasuredRect(
  rect:
    | MeasuredRect
    | DOMRect
    | {
        left: number
        top: number
        width: number
        height: number
      }
    | null
): MeasuredRect | null {
  if (!rect) {
    return null
  }

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
}

export function expandRect(
  rect: MeasuredRect,
  padding: RectPadding
): MeasuredRect {
  const resolvedPadding =
    typeof padding === 'number'
      ? {
          top: padding,
          right: padding,
          bottom: padding,
          left: padding,
        }
      : {
          top: padding.top ?? 0,
          right: padding.right ?? 0,
          bottom: padding.bottom ?? 0,
          left: padding.left ?? 0,
        }

  return {
    left: rect.left - resolvedPadding.left,
    top: rect.top - resolvedPadding.top,
    width: rect.width + resolvedPadding.left + resolvedPadding.right,
    height: rect.height + resolvedPadding.top + resolvedPadding.bottom,
  }
}

export function ensureMinimumRectSize(
  rect: MeasuredRect,
  minWidth: number,
  minHeight: number
): MeasuredRect {
  const widthDelta = Math.max(0, minWidth - rect.width)
  const heightDelta = Math.max(0, minHeight - rect.height)

  return {
    left: rect.left - widthDelta / 2,
    top: rect.top - heightDelta / 2,
    width: rect.width + widthDelta,
    height: rect.height + heightDelta,
  }
}

export function getElementRect(element: Element | null): MeasuredRect | null {
  return element instanceof HTMLElement
    ? toMeasuredRect(element.getBoundingClientRect())
    : null
}

export function isPointInsideRect(
  pointerPosition: DragPosition,
  rect: DOMRect | MeasuredRect
): boolean {
  return (
    pointerPosition.x >= rect.left &&
    pointerPosition.x <= rect.left + rect.width &&
    pointerPosition.y >= rect.top &&
    pointerPosition.y <= rect.top + rect.height
  )
}

export function getDistanceToRect(
  pointerPosition: DragPosition,
  rect: MeasuredRect
): number {
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  const deltaX =
    pointerPosition.x < rect.left
      ? rect.left - pointerPosition.x
      : pointerPosition.x > right
        ? pointerPosition.x - right
        : 0
  const deltaY =
    pointerPosition.y < rect.top
      ? rect.top - pointerPosition.y
      : pointerPosition.y > bottom
        ? pointerPosition.y - bottom
        : 0

  return Math.hypot(deltaX, deltaY)
}

export function isRectCenterInsideSelector(
  activeRect: MeasuredRect,
  selector: string
): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  const element = document.querySelector(selector)
  if (!(element instanceof HTMLElement)) {
    return false
  }

  const rect = element.getBoundingClientRect()
  const centerX = activeRect.left + activeRect.width / 2
  const centerY = activeRect.top + activeRect.height / 2

  return (
    centerX >= rect.left &&
    centerX <= rect.right &&
    centerY >= rect.top &&
    centerY <= rect.bottom
  )
}

export function getActiveRect(
  event: DragOverEvent | DragEndEvent
): MeasuredRect | null {
  const translated = event.active.rect.current.translated
  const initial = event.active.rect.current.initial
  const rect = translated ?? initial

  if (!rect) {
    return null
  }

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
}

export function getRelativeDropPlacement(
  dragPosition: DragPosition,
  overRect: MeasuredRect,
  axis: 'x' | 'y'
): DropPlacement {
  if (axis === 'x') {
    return dragPosition.x < overRect.left + overRect.width / 2
      ? 'before'
      : 'after'
  }

  return dragPosition.y < overRect.top + overRect.height / 2
    ? 'before'
    : 'after'
}

export function getPointerCoordinates(
  event: Event | null
): DragPosition | null {
  if (!event) {
    return null
  }

  if ('clientX' in event && 'clientY' in event) {
    return {
      x: Number(event.clientX),
      y: Number(event.clientY),
    }
  }

  if ('touches' in event) {
    const touchEvent = event as TouchEvent
    if (touchEvent.touches.length === 0) {
      return null
    }

    return {
      x: touchEvent.touches[0]!.clientX,
      y: touchEvent.touches[0]!.clientY,
    }
  }

  return null
}

export function getDragPosition(
  event: DragOverEvent | DragEndEvent,
  activeRect: MeasuredRect | null,
  pointerPosition: DragPosition | null = null
): DragPosition | null {
  if (pointerPosition) {
    return pointerPosition
  }

  const pointer = getPointerCoordinates(event.activatorEvent)
  if (pointer) {
    return {
      x: pointer.x + event.delta.x,
      y: pointer.y + event.delta.y,
    }
  }

  if (!activeRect) {
    return null
  }

  return {
    x: activeRect.left + activeRect.width / 2,
    y: activeRect.top + activeRect.height / 2,
  }
}

/**
 * The viewport position a drag is currently over. For pointer drags this is the
 * latest real pointer position: dnd-kit's `delta` already includes the distance
 * scrolled since the drag started, so `activatorEvent + delta` drifts from the
 * pointer (and from the highlighted target) once a container scrolled. Keyboard
 * drags have no pointer, so they use the centre of the dragged rect instead of
 * a mouse position that happens to be moving elsewhere.
 */
export function resolveDragPosition(
  event: DragOverEvent | DragEndEvent,
  latestPointer: DragPosition | null
): DragPosition | null {
  if (latestPointer && getPointerCoordinates(event.activatorEvent)) {
    return latestPointer
  }

  return getDragPosition(event, getActiveRect(event))
}

export function getResolvedOverRect(
  event: DragOverEvent | DragEndEvent
): MeasuredRect | null {
  const overId = event.over ? String(event.over.id) : null
  if (!overId) {
    return toMeasuredRect(event.over?.rect ?? null)
  }

  const topEntryRect = getResolvedTopEntryRect(overId)
  if (topEntryRect) {
    return topEntryRect
  }

  return toMeasuredRect(event.over?.rect ?? null)
}

export function getResolvedTopEntryRect(overId: string): MeasuredRect | null {
  const overEntry = parseTopEntrySortableId(overId)
  if (!overEntry) {
    return null
  }

  const element = getTopEntryElement(overEntry)
  if (!element) {
    return null
  }

  return toMeasuredRect(element.getBoundingClientRect())
}

/** What a drop aims at: the entry itself (the tile in the grid, the card in the list). */
export function getTopEntryInteractionRectFromElement(
  element: HTMLElement
): MeasuredRect | null {
  return toMeasuredRect(element.getBoundingClientRect())
}

export function getResolvedGroupDropRect(
  event: DragOverEvent | DragEndEvent,
  isGridTab: boolean
): MeasuredRect | null {
  const overId = event.over ? String(event.over.id) : null
  if (!overId) {
    return null
  }

  const overEntry = parseTopEntrySortableId(overId)
  if (overEntry?.type !== 'group') {
    return null
  }

  const element = getTopEntryElement(overEntry)
  if (!element) {
    return null
  }

  return getGroupDropRectFromElement(element, isGridTab)
}

function getTopEntryElement(entry: TopEntry): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null
  }

  return (
    (Array.from(
      document.querySelectorAll('[data-top-entry-type][data-top-entry-id]')
    ).find(
      (element) =>
        element instanceof HTMLElement &&
        element.dataset.topEntryType === entry.type &&
        element.dataset.topEntryId === entry.id
    ) as HTMLElement | undefined) ?? null
  )
}

export function getGroupDropRectFromElement(
  element: HTMLElement,
  isGridTab: boolean
): MeasuredRect | null {
  if (isGridTab) {
    // The tile less its two edge strips; never thinner than half of it, so a narrow tile keeps a middle.
    const tile = toMeasuredRect(element.getBoundingClientRect())
    if (!tile) {
      return null
    }
    const edge = Math.min(GRID_GROUP_EDGE, tile.width / 4)

    return {
      left: tile.left + edge,
      top: tile.top,
      width: tile.width - 2 * edge,
      height: tile.height,
    }
  }

  const dropSurface = element.querySelector('.group-card-header')

  if (!(dropSurface instanceof HTMLElement)) {
    return null
  }

  const dropRect = toMeasuredRect(dropSurface.getBoundingClientRect())
  if (!dropRect) {
    return null
  }

  return ensureMinimumRectSize(
    expandRect(dropRect, LIST_GROUP_DROP_PADDING),
    dropRect.width,
    LIST_GROUP_DROP_MIN_HEIGHT
  )
}

export function getCollectionDropAxis(element: HTMLElement): 'x' | 'y' {
  if (element.dataset.topEntryType === 'group' || !element.parentElement)
    return 'y'
  const styles = window.getComputedStyle(element.parentElement)
  return styles.display === 'grid' &&
    styles.gridTemplateColumns.trim().split(/\s+/).length > 1
    ? 'x'
    : 'y'
}
