import type { DragEndEvent } from '@dnd-kit/core'

import type { TopEntry } from '../../../../../shared/types'
import {
  getGroupItemSortableId,
  getPopupItemSortableId,
  getTopEntrySortableId,
  parseGroupItemSortableId,
  parsePopupItemSortableId,
  parseTopEntrySortableId,
} from '../../../dnd/move-operations'
import {
  expandRect,
  getActiveRect,
  getCollectionDropAxis,
  getDistanceToRect,
  getDragPosition,
  getGroupDropRectFromElement,
  getRelativeDropPlacement,
  getResolvedGroupDropRect,
  getResolvedOverRect,
  getTopEntryInteractionRectFromElement,
  isPointInsideRect,
  normalizeAxis,
  toMeasuredRect,
  type DragPosition,
  type DropPlacement,
  type MeasuredRect,
} from './geometry'

export type PointerTopEntryTarget = {
  kind: 'top-entry'
  entry: TopEntry
  sortableId: string
  entryRect: MeasuredRect
  placement: DropPlacement
  isGroupCenter: boolean
  /** The pointer is inside the entry's own rect, not just its padded hit area. */
  isInsideEntry: boolean
}

export type PointerPopupItemTarget = {
  kind: 'popup-item'
  id: string
  sortableId: string
  rect: MeasuredRect
  placement: DropPlacement
}

export type PointerDesktopTarget = {
  kind: 'desktop'
  targetEntry: TopEntry | null
  placement: DropPlacement
}

export type PointerGridTarget =
  | PointerTopEntryTarget
  | PointerPopupItemTarget
  | PointerDesktopTarget

export type PointerListItemTarget = {
  kind: 'item'
  groupId: string
  itemId: string
  sortableId: string
  rect: MeasuredRect
  placement: DropPlacement
}

/** The pointer is over the slot the dragged grouped item came from. */
export type PointerSelfTarget = {
  kind: 'self'
}

export type PointerListTarget =
  | PointerListItemTarget
  | PointerSelfTarget
  | PointerTopEntryTarget
  | PointerDesktopTarget

const POPUP_ITEM_TARGET_PADDING = 6

const GRID_TOP_ENTRY_TARGET_PADDING = {
  top: 8,
  right: 20,
  bottom: 10,
  left: 20,
}

const LIST_ITEM_TARGET_PADDING = {
  top: 6,
  right: 10,
  bottom: 6,
  left: 10,
}

const LIST_TOP_ENTRY_TARGET_PADDING = {
  top: 6,
  right: 14,
  bottom: 10,
  left: 14,
}

export function shouldDropIntoGroup(
  event: DragEndEvent,
  isGridTab: boolean,
  pointerPosition: DragPosition | null = null
): boolean {
  const activeRect = getActiveRect(event)
  const overRect =
    getResolvedGroupDropRect(event, isGridTab) ?? getResolvedOverRect(event)
  const dragPosition = getDragPosition(event, activeRect, pointerPosition)

  if (!dragPosition || !overRect) {
    return false
  }

  return shouldDropIntoGroupByRects(dragPosition, overRect, isGridTab)
}

export function shouldDropIntoGroupByRects(
  dragPosition: DragPosition,
  overRect: MeasuredRect,
  isGridTab: boolean
): boolean {
  if (isGridTab) {
    return isPointInsideRect(dragPosition, overRect)
  }

  const relativeY = normalizeAxis(dragPosition.y, overRect.top, overRect.height)

  return relativeY > 0.18 && relativeY < 0.82
}

export function didDragLeavePopup(
  event: DragEndEvent,
  pointerPosition: DragPosition | null = null
): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  const popupElement = document.querySelector('.widget-popup')
  if (!(popupElement instanceof HTMLElement)) {
    return false
  }

  const popupRect = popupElement.getBoundingClientRect()
  const activeRect = getActiveRect(event)
  const dragPosition = getDragPosition(event, activeRect, pointerPosition)

  if (!dragPosition) {
    return false
  }

  return (
    dragPosition.x < popupRect.left ||
    dragPosition.x > popupRect.right ||
    dragPosition.y < popupRect.top ||
    dragPosition.y > popupRect.bottom
  )
}

export function isPointerInsidePopup(pointerPosition: DragPosition): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  const popupElement = document.querySelector('.widget-popup')
  if (!(popupElement instanceof HTMLElement)) {
    return false
  }

  const popupRect = toMeasuredRect(popupElement.getBoundingClientRect())

  return Boolean(popupRect && isPointInsideRect(pointerPosition, popupRect))
}

export function getPointerGridTarget(
  pointerPosition: DragPosition | null,
  activeId: string
): PointerGridTarget | null {
  if (typeof document === 'undefined' || !pointerPosition) {
    return null
  }

  const popupItemTarget = getPointerPopupItemTarget(pointerPosition, activeId)
  if (popupItemTarget) {
    return popupItemTarget
  }

  // The popup floats over the grid: a popup item released anywhere inside the
  // popup that is not another popup item (its own slot, the row-end blank, the
  // add cell, the header) must not be resolved against the grid behind it.
  if (
    parsePopupItemSortableId(activeId) &&
    isPointerInsidePopup(pointerPosition)
  ) {
    return null
  }

  const topEntryTarget = getPointerTopEntryTarget(pointerPosition, activeId)
  if (topEntryTarget) {
    return topEntryTarget
  }

  const gridElement = document.querySelector('.widget-grid')
  const gridRect =
    gridElement instanceof HTMLElement
      ? toMeasuredRect(gridElement.getBoundingClientRect())
      : null

  if (!gridRect || !isPointInsideRect(pointerPosition, gridRect)) {
    return null
  }

  return getDesktopDropTarget(pointerPosition, activeId)
}

export function getPointerPopupItemTarget(
  pointerPosition: DragPosition,
  activeId: string
): PointerPopupItemTarget | null {
  const activePopupItem = parsePopupItemSortableId(activeId)
  const candidates: Array<{
    hitRect: MeasuredRect
    distanceRect: MeasuredRect
    target: PointerPopupItemTarget
  }> = []

  for (const element of getPopupItemElements().filter(
    (candidate) => !candidate.classList.contains('dnd-dragging')
  )) {
    const itemId = element.dataset.popupItemId
    const rect = element.getBoundingClientRect()
    const measuredRect = toMeasuredRect(rect)
    if (!itemId || !measuredRect || itemId === activePopupItem?.id) {
      continue
    }

    candidates.push({
      hitRect: expandRect(measuredRect, POPUP_ITEM_TARGET_PADDING),
      distanceRect: measuredRect,
      target: {
        kind: 'popup-item',
        id: itemId,
        sortableId: getPopupItemSortableId(itemId),
        rect: measuredRect,
        placement: getRelativeDropPlacement(pointerPosition, measuredRect, 'y'),
      },
    })
  }

  return pickClosestContainedCandidate(pointerPosition, candidates)
}

export function getPointerTopEntryTarget(
  pointerPosition: DragPosition,
  activeId: string
): PointerTopEntryTarget | null {
  const activeTopEntry = parseTopEntrySortableId(activeId)
  const candidates: Array<{
    hitRect: MeasuredRect
    distanceRect: MeasuredRect
    target: PointerTopEntryTarget
  }> = []

  for (const element of getTopEntryElements().filter(
    (candidate) => !candidate.classList.contains('dnd-dragging')
  )) {
    const entry = getTopEntryFromElement(element)
    const entryRect = getTopEntryInteractionRectFromElement(element)
    if (
      !entry ||
      !entryRect ||
      (activeTopEntry &&
        entry.type === activeTopEntry.type &&
        entry.id === activeTopEntry.id)
    ) {
      continue
    }

    const groupDropRect =
      entry.type === 'group' ? getGroupDropRectFromElement(element, true) : null

    candidates.push({
      hitRect: expandRect(entryRect, GRID_TOP_ENTRY_TARGET_PADDING),
      distanceRect: entryRect,
      target: {
        kind: 'top-entry',
        entry,
        sortableId: getTopEntrySortableId(entry),
        entryRect,
        placement: getRelativeDropPlacement(pointerPosition, entryRect, 'x'),
        isGroupCenter: Boolean(
          groupDropRect &&
          shouldDropIntoGroupByRects(pointerPosition, groupDropRect, true)
        ),
        isInsideEntry: isPointInsideRect(pointerPosition, entryRect),
      },
    })
  }

  return pickClosestContainedCandidate(pointerPosition, candidates)
}

export function getPointerListTarget(
  pointerPosition: DragPosition | null,
  activeId: string
): PointerListTarget | null {
  if (typeof document === 'undefined' || !pointerPosition) {
    return null
  }

  const activeTopEntry = parseTopEntrySortableId(activeId)
  const allowItemTargets = !activeTopEntry || activeTopEntry.type === 'loose'

  if (allowItemTargets) {
    const itemCandidates: Array<{
      hitRect: MeasuredRect
      distanceRect: MeasuredRect
      target: PointerListItemTarget | PointerSelfTarget
    }> = []
    const activeItem = parseGroupItemSortableId(activeId)

    for (const element of getListItemElements()) {
      const groupId = element.dataset.listGroupId
      const itemId = element.dataset.listItemId
      const sortableId =
        groupId && itemId ? getGroupItemSortableId(groupId, itemId) : null
      if (!groupId || !itemId || !sortableId) {
        continue
      }

      if (
        activeItem &&
        activeItem.groupId === groupId &&
        activeItem.itemId === itemId
      ) {
        // The dragged row follows the pointer, so its slot is where it started.
        const slotRect = getSlotRect(element)
        if (slotRect) {
          itemCandidates.push({
            hitRect: expandRect(slotRect, LIST_ITEM_TARGET_PADDING),
            distanceRect: slotRect,
            target: { kind: 'self' },
          })
        }
        continue
      }

      if (element.classList.contains('dnd-dragging')) {
        continue
      }

      const measuredRect = toMeasuredRect(element.getBoundingClientRect())
      if (!measuredRect) {
        continue
      }

      itemCandidates.push({
        hitRect: expandRect(measuredRect, LIST_ITEM_TARGET_PADDING),
        distanceRect: measuredRect,
        target: {
          kind: 'item',
          groupId,
          itemId,
          sortableId,
          rect: measuredRect,
          placement: getRelativeDropPlacement(
            pointerPosition,
            measuredRect,
            getCollectionDropAxis(element)
          ),
        },
      })
    }

    const itemTarget = pickClosestContainedCandidate(
      pointerPosition,
      itemCandidates
    )
    if (itemTarget) {
      return itemTarget
    }
  }

  const topEntryCandidates: Array<{
    hitRect: MeasuredRect
    distanceRect: MeasuredRect
    target: PointerTopEntryTarget
  }> = []

  for (const element of getListTopEntryElements()) {
    if (element.classList.contains('dnd-dragging')) {
      continue
    }

    const entry = getTopEntryFromElement(element)
    const rect = element.getBoundingClientRect()
    if (!entry) {
      continue
    }

    if (
      activeTopEntry &&
      activeTopEntry.type === entry.type &&
      activeTopEntry.id === entry.id
    ) {
      continue
    }

    const entryRect = toMeasuredRect(rect)
    if (!entryRect) {
      continue
    }

    const groupDropRect =
      entry.type === 'group'
        ? getGroupDropRectFromElement(element, false)
        : null

    topEntryCandidates.push({
      hitRect: expandRect(entryRect, LIST_TOP_ENTRY_TARGET_PADDING),
      distanceRect: entryRect,
      target: {
        kind: 'top-entry',
        entry,
        sortableId: getTopEntrySortableId(entry),
        entryRect,
        placement: getRelativeDropPlacement(
          pointerPosition,
          entryRect,
          getCollectionDropAxis(element)
        ),
        isGroupCenter: Boolean(
          groupDropRect &&
          shouldDropIntoGroupByRects(pointerPosition, groupDropRect, false)
        ),
        isInsideEntry: isPointInsideRect(pointerPosition, entryRect),
      },
    })
  }

  const topEntryTarget = pickClosestContainedCandidate(
    pointerPosition,
    topEntryCandidates
  )
  if (topEntryTarget) {
    return topEntryTarget
  }

  const listElement = document.querySelector('.list-section')
  if (!(listElement instanceof HTMLElement)) {
    return null
  }

  const listRect = getListDropAreaRect(listElement)
  if (!listRect || !isPointInsideRect(pointerPosition, listRect)) {
    return null
  }

  return getListDesktopDropTarget(pointerPosition, activeId)
}

/**
 * The group a release at `pointerTarget` moves the dragged entry into, or null
 * when it does not enter a group. One rule for both the folder-drop highlight
 * and the drop itself, so the cue always matches what a release does.
 *
 * A whole group never enters another group (it only reorders). A grouped item
 * released back in its own group is no drop into a group: it stays put, or
 * moves to the end of that group.
 */
export function getListGroupDropTargetId(
  pointerTarget: PointerListTarget | null,
  activeId: string
): string | null {
  if (!pointerTarget || pointerTarget.kind === 'self') {
    return null
  }

  if (parseTopEntrySortableId(activeId)?.type === 'group') {
    return null
  }

  const ownGroupId = parseGroupItemSortableId(activeId)?.groupId ?? null
  let groupId: string | null = null

  if (pointerTarget.kind === 'item') {
    // Released on an item row: the dragged item is placed next to it.
    groupId = pointerTarget.groupId
  } else if (
    pointerTarget.kind === 'top-entry' &&
    pointerTarget.entry.type === 'group' &&
    (pointerTarget.isGroupCenter || pointerTarget.isInsideEntry)
  ) {
    // The header band, or anywhere else inside the group's card.
    groupId = pointerTarget.entry.id
  }

  return groupId !== ownGroupId ? groupId : null
}

export function getDesktopDropTarget(
  pointerPosition: DragPosition,
  activeId: string
): PointerDesktopTarget {
  const activeTopEntry = parseTopEntrySortableId(activeId)

  const entries = getTopEntryElements().filter((element) => {
    if (element.classList.contains('dnd-dragging')) {
      return false
    }

    const entry = getTopEntryFromElement(element)
    if (!entry || !activeTopEntry) {
      return Boolean(entry)
    }

    return !(
      entry.type === activeTopEntry.type && entry.id === activeTopEntry.id
    )
  })

  if (!entries.length) {
    return {
      kind: 'desktop',
      targetEntry: null,
      placement: 'after',
    }
  }

  for (const element of entries) {
    const rect = getTopEntryInteractionRectFromElement(element)
    if (!rect) {
      continue
    }

    const sameRow =
      pointerPosition.y >= rect.top &&
      pointerPosition.y <= rect.top + rect.height

    if (sameRow) {
      if (pointerPosition.x < rect.left + rect.width / 2) {
        return {
          kind: 'desktop',
          targetEntry: getTopEntryFromElement(element),
          placement: 'before',
        }
      }

      continue
    }

    if (pointerPosition.y < rect.top + rect.height / 2) {
      return {
        kind: 'desktop',
        targetEntry: getTopEntryFromElement(element),
        placement: 'before',
      }
    }
  }

  return {
    kind: 'desktop',
    targetEntry: getTopEntryFromElement(entries[entries.length - 1]!),
    placement: 'after',
  }
}

export function getListDesktopDropTarget(
  pointerPosition: DragPosition,
  activeId: string
): PointerDesktopTarget {
  const activeTopEntry = parseTopEntrySortableId(activeId)
  const entries = getListTopEntryElements().filter((element) => {
    if (element.classList.contains('dnd-dragging')) {
      return false
    }

    const entry = getTopEntryFromElement(element)
    if (!entry || !activeTopEntry) {
      return Boolean(entry)
    }

    return !(
      entry.type === activeTopEntry.type && entry.id === activeTopEntry.id
    )
  })

  if (!entries.length) {
    return {
      kind: 'desktop',
      targetEntry: null,
      placement: 'after',
    }
  }

  for (const element of entries) {
    const entry = getTopEntryFromElement(element)
    const rect = element.getBoundingClientRect()
    if (!entry) {
      continue
    }

    if (
      getCollectionDropAxis(element) === 'x' &&
      pointerPosition.y >= rect.top &&
      pointerPosition.y <= rect.bottom
    ) {
      if (pointerPosition.x < rect.left + rect.width / 2)
        return { kind: 'desktop', targetEntry: entry, placement: 'before' }
      continue
    }
    if (pointerPosition.y < rect.top + rect.height / 2) {
      return {
        kind: 'desktop',
        targetEntry: entry,
        placement: 'before',
      }
    }
  }

  return {
    kind: 'desktop',
    targetEntry: getTopEntryFromElement(entries[entries.length - 1]!),
    placement: 'after',
  }
}

function pickClosestContainedCandidate<T>(
  pointerPosition: DragPosition,
  candidates: Array<{
    hitRect: MeasuredRect
    distanceRect: MeasuredRect
    target: T
  }>
): T | null {
  const matchingCandidates = candidates
    .filter(({ hitRect }) => isPointInsideRect(pointerPosition, hitRect))
    .sort(
      (left, right) =>
        getDistanceToRect(pointerPosition, left.distanceRect) -
        getDistanceToRect(pointerPosition, right.distanceRect)
    )

  return matchingCandidates[0]?.target ?? null
}

export function getListDropAreaRect(
  listElement: HTMLElement
): MeasuredRect | null {
  const listRect = toMeasuredRect(listElement.getBoundingClientRect())
  if (!listRect) {
    return null
  }

  const sectionElement = listElement.closest('.section-content')
  if (!(sectionElement instanceof HTMLElement)) {
    return listRect
  }

  const sectionRect = sectionElement.getBoundingClientRect()

  return {
    left: listRect.left,
    top: listRect.top,
    width: listRect.width,
    height: Math.max(listRect.height, sectionRect.bottom - listRect.top),
  }
}

/**
 * The rect an element occupies in layout, without the translate a drag adds to
 * it: the slot a dragged row started in.
 */
function getSlotRect(element: HTMLElement): MeasuredRect | null {
  const rect = toMeasuredRect(element.getBoundingClientRect())
  if (!rect) {
    return null
  }

  let offsetX = 0
  let offsetY = 0
  const transform = window.getComputedStyle(element).transform
  if (
    typeof DOMMatrixReadOnly !== 'undefined' &&
    transform &&
    transform !== 'none'
  ) {
    const matrix = new DOMMatrixReadOnly(transform)
    offsetX = matrix.m41
    offsetY = matrix.m42
  }

  return { ...rect, left: rect.left - offsetX, top: rect.top - offsetY }
}

/**
 * The id of the last item of a group when the pointer is past it: below it, or
 * on its row to the right of it (the blank cell of an odd last row). Null when
 * the pointer is anywhere else, or the group has no rows.
 */
export function getGroupTailItemId(
  pointerPosition: DragPosition,
  groupId: string
): string | null {
  const groupElements = getListItemElements().filter(
    (element) => element.dataset.listGroupId === groupId
  )
  const lastElement = groupElements[groupElements.length - 1]
  const lastItemId = lastElement?.dataset.listItemId
  const lastRect = lastElement ? getSlotRect(lastElement) : null
  if (!lastItemId || !lastRect) {
    return null
  }

  const bottom = lastRect.top + lastRect.height
  const isBelow = pointerPosition.y > bottom
  const isRightOnSameRow =
    pointerPosition.y >= lastRect.top &&
    pointerPosition.y <= bottom &&
    pointerPosition.x > lastRect.left + lastRect.width

  return isBelow || isRightOnSameRow ? lastItemId : null
}

export function getTopEntryElements(): HTMLElement[] {
  if (typeof document === 'undefined') {
    return []
  }

  return Array.from(
    document.querySelectorAll('[data-top-entry-type][data-top-entry-id]')
  ).filter((element): element is HTMLElement => element instanceof HTMLElement)
}

export function getPopupItemElements(): HTMLElement[] {
  if (typeof document === 'undefined') {
    return []
  }

  return Array.from(document.querySelectorAll('[data-popup-item-id]')).filter(
    (element): element is HTMLElement => element instanceof HTMLElement
  )
}

export function getListTopEntryElements(): HTMLElement[] {
  if (typeof document === 'undefined') {
    return []
  }

  return Array.from(
    document.querySelectorAll(
      '.list-section [data-top-entry-type][data-top-entry-id]'
    )
  ).filter((element): element is HTMLElement => element instanceof HTMLElement)
}

export function getListItemElements(): HTMLElement[] {
  if (typeof document === 'undefined') {
    return []
  }

  return Array.from(
    document.querySelectorAll(
      '.list-section [data-list-group-id][data-list-item-id]'
    )
  ).filter((element): element is HTMLElement => element instanceof HTMLElement)
}

export function getTopEntryElement(entry: TopEntry): HTMLElement | null {
  return (
    getTopEntryElements().find(
      (element) =>
        element.dataset.topEntryType === entry.type &&
        element.dataset.topEntryId === entry.id
    ) ?? null
  )
}

export function getTopEntryFromElement(element: HTMLElement): TopEntry | null {
  const type = element.dataset.topEntryType
  const id = element.dataset.topEntryId

  if (!id || (type !== 'group' && type !== 'loose')) {
    return null
  }

  return { type, id }
}

export function shouldDropGroupedItemLooseFromSourceGroup(
  pointerPosition: DragPosition | null,
  sourceGroupId: string
): boolean {
  if (typeof document === 'undefined' || !pointerPosition) {
    return false
  }

  const listElement = document.querySelector('.list-section')
  if (!(listElement instanceof HTMLElement)) {
    return false
  }

  const dropAreaRect = getListDropAreaRect(listElement)
  if (!dropAreaRect || !isPointInsideRect(pointerPosition, dropAreaRect)) {
    return false
  }

  const sourceGroupElement = getTopEntryElement({
    type: 'group',
    id: sourceGroupId,
  })
  if (!(sourceGroupElement instanceof HTMLElement)) {
    return false
  }

  const sourceGroupRect = toMeasuredRect(
    sourceGroupElement.getBoundingClientRect()
  )
  if (!sourceGroupRect) {
    return false
  }

  // Leaving the group takes dragging out of its card, not just to its lower part.
  return pointerPosition.y > sourceGroupRect.top + sourceGroupRect.height
}
