import {
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import {
  DragOverlay,
  type AutoScrollOptions,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { rectSortingStrategy } from '@dnd-kit/sortable'

import type { GridTab, GroupItemMap } from '@shared/types'
import { DndRoot, SortableZone } from '@renderer/dnd/DndProvider'
import {
  getTopEntrySortableId,
  parsePopupItemSortableId,
  parseTopEntrySortableId,
} from '@renderer/dnd/move-operations'
import type { OrderedEntry } from '@renderer/store/data-helpers'
import { useAppStore } from '@renderer/store/use-app-store'
import FolderWidget from '@renderer/components/groups/FolderWidget'
import LooseWidget from '@renderer/components/groups/LooseWidget'
import WidgetPopup from '@renderer/components/groups/WidgetPopup'
import {
  EMPTY_GRID_DROP_FEEDBACK,
  applyGridDropFeedback,
  buildGridDropFeedback,
  buildGridDropFeedbackFromPointerTarget,
  type GridDropFeedback,
} from './drop-feedback'
import {
  didDragLeavePopup,
  getPointerGridTarget,
  shouldDropIntoGroup,
} from './drop-targets'
import {
  buildPointerAnchoredOverlayStyle,
  type ActiveDragOverlay,
} from './drag-overlay'
import {
  getRelativeDropPlacement,
  getResolvedOverRect,
  resolveDragPosition,
  type DragPosition,
} from './geometry'

type OrderedGroup = Extract<OrderedEntry, { type: 'group' }>['group']

type Props = {
  tab: GridTab
  topEntries: OrderedEntry[]
  topEntryIds: string[]
  popup: { tab: GridTab; groupId: string } | null
  popupGroup: OrderedGroup | null
  activeDragOverlay: ActiveDragOverlay | null
  dragOverlayNode: ReactNode
  latestPointerPosition: MutableRefObject<DragPosition | null>
  activeDragId: MutableRefObject<string | null>
  onDragStart: (event: DragStartEvent) => void
  onDragStop: () => void
}

export default function GridView({
  tab,
  topEntries,
  topEntryIds,
  popup,
  popupGroup,
  activeDragOverlay,
  dragOverlayNode,
  latestPointerPosition,
  activeDragId,
  onDragStart,
  onDragStop,
}: Props): JSX.Element {
  const closeWidgetPopup = useAppStore((state) => state.closeWidgetPopup)
  const moveLooseItemToGroup = useAppStore(
    (state) => state.moveLooseItemToGroup
  )
  const moveItemToLooseAt = useAppStore((state) => state.moveItemToLooseAt)
  const moveGroupItemToLooseAt = useAppStore(
    (state) => state.moveGroupItemToLooseAt
  )
  const moveGroupItemToGroup = useAppStore(
    (state) => state.moveGroupItemToGroup
  )
  const reorderItems = useAppStore((state) => state.reorderItems)
  const reorderTopEntries = useAppStore((state) => state.reorderTopEntries)
  const [gridDropFeedback, setGridDropFeedback] = useState<GridDropFeedback>(
    EMPTY_GRID_DROP_FEEDBACK
  )
  const [overlayPointerPosition, setOverlayPointerPosition] =
    useState<DragPosition | null>(null)

  useEffect(() => {
    const syncDropFeedback = (pointerPosition: DragPosition) => {
      if (!activeDragId.current) {
        return
      }

      const pointerTarget = getPointerGridTarget(
        pointerPosition,
        activeDragId.current
      )

      applyGridDropFeedback(
        setGridDropFeedback,
        pointerTarget
          ? buildGridDropFeedbackFromPointerTarget(
              activeDragId.current,
              pointerTarget,
              popup
            )
          : EMPTY_GRID_DROP_FEEDBACK
      )
    }

    const handlePointerMove = (event: PointerEvent) => {
      const nextPointerPosition = {
        x: event.clientX,
        y: event.clientY,
      }
      latestPointerPosition.current = nextPointerPosition

      if (!activeDragId.current) {
        return
      }

      setOverlayPointerPosition(nextPointerPosition)
      syncDropFeedback(nextPointerPosition)
    }

    // Scrolling (auto-scroll while dragging) moves the content under a
    // stationary pointer, so the highlight has to follow it.
    const handleScroll = () => {
      if (latestPointerPosition.current) {
        syncDropFeedback(latestPointerPosition.current)
      }
    }

    window.addEventListener('pointermove', handlePointerMove, true)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [activeDragId, latestPointerPosition, popup])

  // Only the container the drag happens in may auto-scroll: the popup's grid
  // while a popup is open, otherwise the section itself.
  const gridAutoScroll = useMemo<AutoScrollOptions>(
    () => ({
      canScroll: (element) =>
        popup
          ? Boolean(element.closest('.widget-popup'))
          : element.classList.contains('section-content'),
    }),
    [popup]
  )

  const gridDragOverlayStyle = useMemo(
    () =>
      buildPointerAnchoredOverlayStyle(
        activeDragOverlay,
        overlayPointerPosition
      ),
    [activeDragOverlay, overlayPointerPosition]
  )

  const handleTopLevelDragEnd = (
    activeId: string,
    overId: string | null,
    event: DragEndEvent,
    dragPosition: DragPosition | null
  ) => {
    const activeEntry = parseTopEntrySortableId(activeId)
    const pointerTarget = getPointerGridTarget(dragPosition, activeId)
    const overEntry =
      pointerTarget?.kind === 'top-entry'
        ? pointerTarget.entry
        : pointerTarget?.kind === 'desktop'
          ? pointerTarget.targetEntry
          : overId
            ? parseTopEntrySortableId(overId)
            : null

    const targetPlacement =
      pointerTarget?.kind === 'top-entry' || pointerTarget?.kind === 'desktop'
        ? pointerTarget.placement
        : dragPosition && getResolvedOverRect(event)
          ? getRelativeDropPlacement(
              dragPosition,
              getResolvedOverRect(event)!,
              'x'
            )
          : 'before'

    const shouldMoveIntoGroup =
      activeEntry?.type === 'loose' &&
      overEntry?.type === 'group' &&
      (pointerTarget?.kind === 'top-entry'
        ? pointerTarget.isGroupCenter
        : shouldDropIntoGroup(event, true, dragPosition))

    if (activeEntry?.type === 'loose') {
      if (shouldMoveIntoGroup) {
        void moveLooseItemToGroup(tab, activeEntry.id, overEntry.id)
        return
      }

      void moveItemToLooseAt(
        tab,
        null,
        activeEntry.id,
        overEntry,
        targetPlacement
      )
      return
    }

    if (!overEntry) {
      return
    }

    const resolvedOverId = getTopEntrySortableId(overEntry)
    if (activeId === resolvedOverId) {
      return
    }

    void reorderTopEntries(tab, activeId, resolvedOverId, targetPlacement)
  }

  const handleGridDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    const activeId = String(active.id)
    const overId = over ? String(over.id) : null
    const activePopupItem = parsePopupItemSortableId(activeId)
    // Read before the first await: onDragStop clears the latest pointer.
    const dragPosition = resolveDragPosition(
      event,
      latestPointerPosition.current
    )
    const pointerTarget = getPointerGridTarget(dragPosition, activeId)

    if (activePopupItem && popup && popup.tab === tab && popupGroup) {
      if (pointerTarget?.kind === 'popup-item') {
        if (pointerTarget.id !== activePopupItem.id) {
          await reorderItems(
            popup.tab,
            popup.groupId,
            activePopupItem.id,
            pointerTarget.id
          )
        }
        return
      }

      if (pointerTarget?.kind === 'top-entry') {
        if (pointerTarget.entry.type === 'group') {
          if (pointerTarget.entry.id === popup.groupId) {
            return
          }

          closeWidgetPopup()
          if (pointerTarget.isGroupCenter) {
            await moveGroupItemToGroup(
              popup.tab,
              popup.groupId,
              activePopupItem.id,
              pointerTarget.entry.id
            )
            return
          }

          await moveGroupItemToLooseAt(
            popup.tab,
            popup.groupId,
            activePopupItem.id,
            pointerTarget.entry,
            pointerTarget.placement
          )
          return
        }

        closeWidgetPopup()
        await moveGroupItemToLooseAt(
          popup.tab,
          popup.groupId,
          activePopupItem.id,
          pointerTarget.entry,
          pointerTarget.placement
        )
        return
      }

      if (pointerTarget?.kind === 'desktop') {
        closeWidgetPopup()
        await moveGroupItemToLooseAt(
          popup.tab,
          popup.groupId,
          activePopupItem.id,
          pointerTarget.targetEntry,
          pointerTarget.placement
        )
        return
      }

      const overPopupItem = overId ? parsePopupItemSortableId(overId) : null
      if (overPopupItem) {
        if (overPopupItem.id !== activePopupItem.id) {
          await reorderItems(
            popup.tab,
            popup.groupId,
            activePopupItem.id,
            overPopupItem.id
          )
        }
        return
      }

      if (!didDragLeavePopup(event, dragPosition)) {
        return
      }

      const overEntry = overId ? parseTopEntrySortableId(overId) : null
      const overRect = getResolvedOverRect(event)
      const topPlacement =
        dragPosition && overRect
          ? getRelativeDropPlacement(dragPosition, overRect, 'x')
          : 'after'

      if (overEntry?.type === 'group' && overEntry.id === popup.groupId) {
        return
      }

      if (
        overEntry?.type === 'group' &&
        overEntry.id !== popup.groupId &&
        shouldDropIntoGroup(event, true, dragPosition)
      ) {
        closeWidgetPopup()
        await moveGroupItemToGroup(
          popup.tab,
          popup.groupId,
          activePopupItem.id,
          overEntry.id
        )
        return
      }

      closeWidgetPopup()
      await moveGroupItemToLooseAt(
        popup.tab,
        popup.groupId,
        activePopupItem.id,
        overEntry,
        topPlacement
      )
      return
    }

    if (parseTopEntrySortableId(activeId)) {
      handleTopLevelDragEnd(activeId, overId, event, dragPosition)
    }
  }

  const handleGridDragOver = (event: DragOverEvent) => {
    applyGridDropFeedback(
      setGridDropFeedback,
      buildGridDropFeedback(event, popup, latestPointerPosition.current)
    )
  }

  return (
    <DndRoot
      autoScroll={gridAutoScroll}
      onDragStart={onDragStart}
      onDragOver={handleGridDragOver}
      onDragEnd={(event) => {
        applyGridDropFeedback(setGridDropFeedback, EMPTY_GRID_DROP_FEEDBACK)
        void handleGridDragEnd(event)
        onDragStop()
      }}
      onDragCancel={() => {
        applyGridDropFeedback(setGridDropFeedback, EMPTY_GRID_DROP_FEEDBACK)
        onDragStop()
      }}
    >
      <SortableZone ids={topEntryIds} strategy={rectSortingStrategy}>
        <div
          className={`widget-grid ${gridDropFeedback.gridClassName}`.trim()}
          data-testid={`widget-grid-${tab}`}
        >
          {topEntries.map((entry) =>
            entry.type === 'group' ? (
              <FolderWidget
                key={entry.group.id}
                tab={tab}
                groupId={entry.group.id}
                name={entry.group.name}
                icon={entry.group.icon}
                count={entry.group.items.length}
                previewIcons={entry.group.items.map((item) => item.icon)}
                hideWhileDragging
                sortableId={getTopEntrySortableId({
                  type: 'group',
                  id: entry.group.id,
                })}
                dropClassName={
                  gridDropFeedback.topEntryId ===
                  getTopEntrySortableId({
                    type: 'group',
                    id: entry.group.id,
                  })
                    ? gridDropFeedback.topEntryClassName
                    : ''
                }
              />
            ) : (
              <LooseWidget
                key={entry.item.id}
                tab={tab}
                item={entry.item as GroupItemMap[GridTab]}
                hideWhileDragging
                sortableId={getTopEntrySortableId({
                  type: 'loose',
                  id: entry.item.id,
                })}
                dropClassName={
                  gridDropFeedback.topEntryId ===
                  getTopEntrySortableId({
                    type: 'loose',
                    id: entry.item.id,
                  })
                    ? gridDropFeedback.topEntryClassName
                    : ''
                }
              />
            )
          )}
        </div>
      </SortableZone>
      <WidgetPopup
        popupItemId={gridDropFeedback.popupItemId}
        popupItemClassName={gridDropFeedback.popupItemClassName}
      />
      {typeof document === 'undefined'
        ? null
        : createPortal(
            <DragOverlay
              dropAnimation={null}
              zIndex={260}
              {...(gridDragOverlayStyle ? { style: gridDragOverlayStyle } : {})}
            >
              {dragOverlayNode}
            </DragOverlay>,
            document.body
          )}
    </DndRoot>
  )
}
