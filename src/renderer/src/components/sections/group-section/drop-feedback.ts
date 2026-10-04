import type { DragOverEvent } from '@dnd-kit/core'
import type { Dispatch, SetStateAction } from 'react'

import type { GridTab } from '../../../../../shared/types'
import {
  getTopEntrySortableId,
  parsePopupItemSortableId,
  parseTopEntrySortableId,
} from '../../../dnd/move-operations'
import {
  getActiveRect,
  getDragPosition,
  getRelativeDropPlacement,
  getResolvedGroupDropRect,
  getResolvedOverRect,
  isRectCenterInsideSelector,
  toMeasuredRect,
  type DragPosition,
} from './geometry'
import {
  getListGroupDropTargetId,
  getPointerGridTarget,
  getPointerListTarget,
  isPointerInsidePopup,
  shouldDropIntoGroupByRects,
  type PointerGridTarget,
} from './drop-targets'

export type GridDropFeedback = {
  gridClassName: string
  popupItemId: string | null
  popupItemClassName: string
  topEntryId: string | null
  topEntryClassName: string
}

export const EMPTY_GRID_DROP_FEEDBACK: GridDropFeedback = {
  gridClassName: '',
  popupItemId: null,
  popupItemClassName: '',
  topEntryId: null,
  topEntryClassName: '',
}

export function buildGridDropFeedback(
  event: DragOverEvent,
  popup: { tab: GridTab; groupId: string } | null,
  pointerPosition: DragPosition | null = null
): GridDropFeedback {
  const activeId = String(event.active.id)
  if (pointerPosition) {
    const pointerTarget = getPointerGridTarget(pointerPosition, activeId)
    if (pointerTarget) {
      return buildGridDropFeedbackFromPointerTarget(
        activeId,
        pointerTarget,
        popup
      )
    }

    // A popup item over a non-item spot of the popup is dropped nowhere, so
    // do not highlight whatever dnd-kit reports as `over` behind the popup.
    if (
      parsePopupItemSortableId(activeId) &&
      isPointerInsidePopup(pointerPosition)
    ) {
      return EMPTY_GRID_DROP_FEEDBACK
    }
  }

  const activeRect = getActiveRect(event)
  const dragPosition = getDragPosition(event, activeRect, pointerPosition)

  if (!dragPosition) {
    return EMPTY_GRID_DROP_FEEDBACK
  }

  const overId = event.over ? String(event.over.id) : null
  const overRect = toMeasuredRect(event.over?.rect ?? null)
  const activePopupItem = parsePopupItemSortableId(activeId)

  if (activePopupItem) {
    const overPopupItem = overId ? parsePopupItemSortableId(overId) : null
    if (overPopupItem && overRect) {
      return {
        ...EMPTY_GRID_DROP_FEEDBACK,
        popupItemId: overId,
        popupItemClassName: `drop-${getRelativeDropPlacement(
          dragPosition,
          overRect,
          'y'
        )}`,
      }
    }

    const overTopEntry = overId ? parseTopEntrySortableId(overId) : null
    const overTopRect =
      overId && overTopEntry ? getResolvedOverRect(event) : overRect
    const overGroupRect =
      overTopEntry?.type === 'group'
        ? getResolvedGroupDropRect(event, true)
        : null

    if (overTopEntry && overTopRect) {
      const shouldHighlightFolder =
        overTopEntry.type === 'group' &&
        popup?.groupId !== overTopEntry.id &&
        !!overGroupRect &&
        shouldDropIntoGroupByRects(dragPosition, overGroupRect, true)

      if (shouldHighlightFolder) {
        return {
          ...EMPTY_GRID_DROP_FEEDBACK,
          topEntryId: overId,
          topEntryClassName: 'folder-drop',
        }
      }

      return {
        ...EMPTY_GRID_DROP_FEEDBACK,
        topEntryId: overId,
        topEntryClassName: `drop-${getRelativeDropPlacement(
          dragPosition,
          overTopRect,
          'x'
        )}`,
      }
    }

    if (activeRect && isRectCenterInsideSelector(activeRect, '.widget-grid')) {
      return {
        ...EMPTY_GRID_DROP_FEEDBACK,
        gridClassName: 'drop-target',
      }
    }

    return EMPTY_GRID_DROP_FEEDBACK
  }

  const activeTopEntry = parseTopEntrySortableId(activeId)
  const overTopEntry = overId ? parseTopEntrySortableId(overId) : null
  const overTopRect =
    overId && overTopEntry ? getResolvedOverRect(event) : overRect
  const overGroupRect =
    overTopEntry?.type === 'group'
      ? getResolvedGroupDropRect(event, true)
      : null

  if (activeTopEntry && overTopEntry && overTopRect) {
    const shouldHighlightFolder =
      activeTopEntry.type === 'loose' &&
      overTopEntry.type === 'group' &&
      !!overGroupRect &&
      shouldDropIntoGroupByRects(dragPosition, overGroupRect, true)

    if (shouldHighlightFolder) {
      return {
        ...EMPTY_GRID_DROP_FEEDBACK,
        topEntryId: overId,
        topEntryClassName: 'folder-drop',
      }
    }

    return {
      ...EMPTY_GRID_DROP_FEEDBACK,
      topEntryId: overId,
      topEntryClassName: `drop-${getRelativeDropPlacement(
        dragPosition,
        overTopRect,
        'x'
      )}`,
    }
  }

  return EMPTY_GRID_DROP_FEEDBACK
}

export function buildGridDropFeedbackFromPointerTarget(
  activeId: string,
  target: PointerGridTarget,
  popup: { tab: GridTab; groupId: string } | null
): GridDropFeedback {
  const activePopupItem = parsePopupItemSortableId(activeId)
  const activeTopEntry = parseTopEntrySortableId(activeId)

  if (target.kind === 'popup-item') {
    if (!activePopupItem) {
      return EMPTY_GRID_DROP_FEEDBACK
    }

    return {
      ...EMPTY_GRID_DROP_FEEDBACK,
      popupItemId: target.sortableId,
      popupItemClassName: `drop-${target.placement}`,
    }
  }

  if (target.kind === 'top-entry') {
    const shouldHighlightFolder =
      target.entry.type === 'group' &&
      target.isGroupCenter &&
      (activePopupItem || activeTopEntry?.type === 'loose') &&
      (!activePopupItem || popup?.groupId !== target.entry.id)

    return {
      ...EMPTY_GRID_DROP_FEEDBACK,
      topEntryId: target.sortableId,
      topEntryClassName: shouldHighlightFolder
        ? 'folder-drop'
        : `drop-${target.placement}`,
    }
  }

  if (target.targetEntry) {
    return {
      ...EMPTY_GRID_DROP_FEEDBACK,
      topEntryId: getTopEntrySortableId(target.targetEntry),
      topEntryClassName: `drop-${target.placement}`,
    }
  }

  return {
    ...EMPTY_GRID_DROP_FEEDBACK,
    gridClassName: 'drop-target',
  }
}

/**
 * The group card to light up with `folder-drop` in the list view: the group a
 * release at the pointer would move the dragged entry into, if any.
 */
export function buildListGroupDropFeedbackId(
  pointerPosition: DragPosition | null,
  activeId: string
): string | null {
  return getListGroupDropTargetId(
    getPointerListTarget(pointerPosition, activeId),
    activeId
  )
}

export function applyGridDropFeedback(
  setGridDropFeedback: Dispatch<SetStateAction<GridDropFeedback>>,
  nextFeedback: GridDropFeedback
) {
  setGridDropFeedback((currentFeedback) =>
    areGridDropFeedbackEqual(currentFeedback, nextFeedback)
      ? currentFeedback
      : nextFeedback
  )
}

export function areGridDropFeedbackEqual(
  left: GridDropFeedback,
  right: GridDropFeedback
): boolean {
  return (
    left.gridClassName === right.gridClassName &&
    left.popupItemId === right.popupItemId &&
    left.popupItemClassName === right.popupItemClassName &&
    left.topEntryId === right.topEntryId &&
    left.topEntryClassName === right.topEntryClassName
  )
}
