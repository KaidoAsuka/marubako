import type { DragStartEvent } from '@dnd-kit/core'
import type { CSSProperties } from 'react'

import {
  parseGroupItemSortableId,
  parsePopupItemSortableId,
  parseTopEntrySortableId,
} from '../../../dnd/move-operations'
import {
  getElementRect,
  toMeasuredRect,
  type DragPosition,
  type MeasuredRect,
} from './geometry'
import {
  getListItemElements,
  getPopupItemElements,
  getTopEntryElement,
} from './drop-targets'

export type ActiveDragOverlay = {
  id: string
  width: number
  height: number
  anchorOffset: DragPosition | null
}

export function createActiveDragOverlay(
  event: DragStartEvent,
  alignGridOverlay: boolean
): ActiveDragOverlay {
  const id = String(event.active.id)
  const initialRect = event.active.rect.current.initial
  const sourceElement = getDragSourceElement(id)
  const sourceRect =
    getElementRect(sourceElement) ?? toMeasuredRect(initialRect ?? null)
  const anchorRect = getDragOverlayAnchorRect(
    id,
    sourceElement,
    alignGridOverlay
  )

  return {
    id,
    width: sourceRect?.width ?? 0,
    height: sourceRect?.height ?? 0,
    anchorOffset:
      sourceRect && anchorRect
        ? {
            x: anchorRect.left - sourceRect.left + anchorRect.width / 2,
            y: anchorRect.top - sourceRect.top + anchorRect.height / 2,
          }
        : null,
  }
}

export function buildDragOverlayStyle(
  overlay: ActiveDragOverlay
): CSSProperties | undefined {
  if (!overlay.width) {
    return undefined
  }

  return {
    width: overlay.width,
    maxWidth: overlay.width,
    minHeight: overlay.height || undefined,
  }
}

export function buildPointerAnchoredOverlayStyle(
  overlay: ActiveDragOverlay | null,
  pointerPosition: DragPosition | null
): CSSProperties | undefined {
  if (!overlay?.anchorOffset || !pointerPosition) {
    return undefined
  }

  return {
    left: pointerPosition.x - overlay.anchorOffset.x,
    top: pointerPosition.y - overlay.anchorOffset.y,
    transform: 'translate3d(0, 0, 0)',
  }
}

export function getDragSourceElement(activeId: string): HTMLElement | null {
  const popupItem = parsePopupItemSortableId(activeId)
  if (popupItem) {
    return (
      getPopupItemElements().find(
        (element) => element.dataset.popupItemId === popupItem.id
      ) ?? null
    )
  }

  const groupItem = parseGroupItemSortableId(activeId)
  if (groupItem) {
    return (
      getListItemElements().find(
        (element) =>
          element.dataset.listGroupId === groupItem.groupId &&
          element.dataset.listItemId === groupItem.itemId
      ) ?? null
    )
  }

  const topEntry = parseTopEntrySortableId(activeId)
  return topEntry ? getTopEntryElement(topEntry) : null
}

export function getDragOverlayAnchorRect(
  activeId: string,
  sourceElement: HTMLElement | null,
  alignGridOverlay: boolean
): MeasuredRect | null {
  if (!sourceElement) {
    return null
  }

  if (parsePopupItemSortableId(activeId)) {
    return getElementRect(sourceElement.querySelector('.grid-ico'))
  }

  if (!alignGridOverlay) {
    return null
  }

  const topEntry = parseTopEntrySortableId(activeId)
  if (!topEntry) {
    return null
  }

  return getElementRect(
    sourceElement.querySelector(
      topEntry.type === 'group' ? '.widget-box' : '.widget-loose-box'
    )
  )
}
