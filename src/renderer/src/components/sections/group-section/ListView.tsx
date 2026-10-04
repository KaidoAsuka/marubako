import {
  useCallback,
  useEffect,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { rectSortingStrategy } from '@dnd-kit/sortable'
import {
  type DragEndEvent,
  DragOverlay,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'

import type { GroupTab } from '@shared/types'
import { DndRoot, SortableZone } from '@renderer/dnd/DndProvider'
import {
  getTopEntrySortableId,
  parseGroupItemSortableId,
  parseTopEntrySortableId,
} from '@renderer/dnd/move-operations'
import type { OrderedEntry } from '@renderer/store/data-helpers'
import { useAppStore } from '@renderer/store/use-app-store'
import GroupCard from '@renderer/components/groups/GroupCard'
import ItemRow from '@renderer/components/items/ItemRow'
import { buildListGroupDropFeedbackId } from './drop-feedback'
import {
  getGroupTailItemId,
  getListGroupDropTargetId,
  getPointerListTarget,
  shouldDropGroupedItemLooseFromSourceGroup,
} from './drop-targets'
import {
  getRelativeDropPlacement,
  getResolvedOverRect,
  resolveDragPosition,
  type DragPosition,
} from './geometry'

type Props = {
  tab: GroupTab
  topEntries: OrderedEntry[]
  topEntryIds: string[]
  dragOverlayNode: ReactNode
  latestPointerPosition: MutableRefObject<DragPosition | null>
  activeDragId: MutableRefObject<string | null>
  onDragStart: (event: DragStartEvent) => void
  onDragStop: () => void
}

export default function ListView({
  tab,
  topEntries,
  topEntryIds,
  dragOverlayNode,
  latestPointerPosition,
  activeDragId,
  onDragStart,
  onDragStop,
}: Props): JSX.Element {
  const moveItemRelative = useAppStore((state) => state.moveItemRelative)
  const moveItemToGroup = useAppStore((state) => state.moveItemToGroup)
  const moveItemToLooseAt = useAppStore((state) => state.moveItemToLooseAt)
  const reorderTopEntries = useAppStore((state) => state.reorderTopEntries)
  const [groupDropFeedbackId, setGroupDropFeedbackId] = useState<string | null>(
    null
  )

  const syncGroupDropFeedback = useCallback(
    (pointerPosition: DragPosition | null, activeId: string | null) => {
      if (!pointerPosition || !activeId) {
        setGroupDropFeedbackId((currentId) =>
          currentId === null ? currentId : null
        )
        return
      }

      const nextGroupId = buildListGroupDropFeedbackId(
        pointerPosition,
        activeId
      )

      setGroupDropFeedbackId((currentId) =>
        currentId === nextGroupId ? currentId : nextGroupId
      )
    },
    []
  )

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const nextPointerPosition = {
        x: event.clientX,
        y: event.clientY,
      }
      latestPointerPosition.current = nextPointerPosition
      syncGroupDropFeedback(nextPointerPosition, activeDragId.current)
    }

    // Scrolling (auto-scroll while dragging) moves the content under a
    // stationary pointer, so the highlight has to follow it.
    const handleScroll = () => {
      if (activeDragId.current) {
        syncGroupDropFeedback(
          latestPointerPosition.current,
          activeDragId.current
        )
      }
    }

    window.addEventListener('pointermove', handlePointerMove, true)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [activeDragId, latestPointerPosition, syncGroupDropFeedback])

  const handleListDragOver = (event: DragOverEvent) => {
    syncGroupDropFeedback(
      resolveDragPosition(event, latestPointerPosition.current),
      String(event.active.id)
    )
  }

  const handleListDragEnd = async (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    const activeTopEntry = parseTopEntrySortableId(activeId)
    const activeGroupItem = parseGroupItemSortableId(activeId)
    // Read before the first await: onDragStop clears the latest pointer.
    const dragPosition = resolveDragPosition(
      event,
      latestPointerPosition.current
    )
    const pointerTarget = getPointerListTarget(dragPosition, activeId)
    // The group a release moves into: the same rule as the folder-drop cue.
    const dropIntoGroupId = getListGroupDropTargetId(pointerTarget, activeId)

    // Dropped back on its own slot: nothing to move.
    if (pointerTarget?.kind === 'self') {
      return
    }

    if (activeTopEntry?.type === 'group') {
      const overEntry =
        pointerTarget?.kind === 'top-entry'
          ? pointerTarget.entry
          : pointerTarget?.kind === 'desktop'
            ? pointerTarget.targetEntry
            : event.over
              ? parseTopEntrySortableId(String(event.over.id))
              : null
      const overPlacement =
        pointerTarget?.kind === 'top-entry' || pointerTarget?.kind === 'desktop'
          ? pointerTarget.placement
          : dragPosition && getResolvedOverRect(event)
            ? getRelativeDropPlacement(
                dragPosition,
                getResolvedOverRect(event)!,
                'y'
              )
            : 'before'

      if (!overEntry) {
        return
      }

      const overId = getTopEntrySortableId(overEntry)
      if (activeId !== overId) {
        await reorderTopEntries(tab, activeId, overId, overPlacement)
      }
      return
    }

    if (activeTopEntry?.type === 'loose') {
      if (pointerTarget?.kind === 'item') {
        await moveItemRelative(
          tab,
          null,
          activeTopEntry.id,
          pointerTarget.groupId,
          pointerTarget.itemId,
          pointerTarget.placement
        )
        return
      }

      if (pointerTarget?.kind === 'top-entry') {
        if (dropIntoGroupId) {
          await moveItemToGroup(tab, null, activeTopEntry.id, dropIntoGroupId)
          return
        }

        await moveItemToLooseAt(
          tab,
          null,
          activeTopEntry.id,
          pointerTarget.entry,
          pointerTarget.placement
        )
        return
      }

      if (pointerTarget?.kind === 'desktop') {
        await moveItemToLooseAt(
          tab,
          null,
          activeTopEntry.id,
          pointerTarget.targetEntry,
          pointerTarget.placement
        )
        return
      }

      const overGroupItem = event.over
        ? parseGroupItemSortableId(String(event.over.id))
        : null
      if (overGroupItem) {
        await moveItemRelative(
          tab,
          null,
          activeTopEntry.id,
          overGroupItem.groupId,
          overGroupItem.itemId,
          'before'
        )
        return
      }

      const overEntry = event.over
        ? parseTopEntrySortableId(String(event.over.id))
        : null
      if (overEntry && getTopEntrySortableId(overEntry) !== activeId) {
        const overRect = getResolvedOverRect(event)
        const overPlacement =
          dragPosition && overRect
            ? getRelativeDropPlacement(dragPosition, overRect, 'y')
            : 'before'

        await reorderTopEntries(
          tab,
          activeId,
          getTopEntrySortableId(overEntry),
          overPlacement
        )
      }
      return
    }

    if (!activeGroupItem) {
      return
    }

    const sourceGroupLooseDrop = shouldDropGroupedItemLooseFromSourceGroup(
      dragPosition,
      activeGroupItem.groupId
    )
    if (
      sourceGroupLooseDrop &&
      (!pointerTarget ||
        (pointerTarget.kind === 'top-entry' &&
          pointerTarget.entry.type === 'group' &&
          pointerTarget.entry.id === activeGroupItem.groupId))
    ) {
      await moveItemToLooseAt(
        tab,
        activeGroupItem.groupId,
        activeGroupItem.itemId,
        {
          type: 'group',
          id: activeGroupItem.groupId,
        },
        'after'
      )
      return
    }

    if (pointerTarget?.kind === 'item') {
      await moveItemRelative(
        tab,
        activeGroupItem.groupId,
        activeGroupItem.itemId,
        pointerTarget.groupId,
        pointerTarget.itemId,
        pointerTarget.placement
      )
      return
    }

    if (pointerTarget?.kind === 'top-entry') {
      if (dropIntoGroupId) {
        await moveItemToGroup(
          tab,
          activeGroupItem.groupId,
          activeGroupItem.itemId,
          dropIntoGroupId
        )
        return
      }

      const isOwnGroup =
        pointerTarget.entry.type === 'group' &&
        pointerTarget.entry.id === activeGroupItem.groupId

      // On the header band of its own group: nothing to move.
      if (isOwnGroup && pointerTarget.isGroupCenter) {
        return
      }

      if (isOwnGroup && pointerTarget.isInsideEntry) {
        // Inside its own card: only the blank space after the last item moves
        // the item (to the end of the group); anywhere else it stays put.
        const tailItemId = dragPosition
          ? getGroupTailItemId(dragPosition, activeGroupItem.groupId)
          : null
        if (tailItemId) {
          await moveItemRelative(
            tab,
            activeGroupItem.groupId,
            activeGroupItem.itemId,
            activeGroupItem.groupId,
            tailItemId,
            'after'
          )
        }
        return
      }

      await moveItemToLooseAt(
        tab,
        activeGroupItem.groupId,
        activeGroupItem.itemId,
        pointerTarget.entry,
        pointerTarget.placement
      )
      return
    }

    if (pointerTarget?.kind === 'desktop') {
      await moveItemToLooseAt(
        tab,
        activeGroupItem.groupId,
        activeGroupItem.itemId,
        pointerTarget.targetEntry,
        pointerTarget.placement
      )
      return
    }

    const overGroupItem = event.over
      ? parseGroupItemSortableId(String(event.over.id))
      : null
    if (overGroupItem) {
      await moveItemRelative(
        tab,
        activeGroupItem.groupId,
        activeGroupItem.itemId,
        overGroupItem.groupId,
        overGroupItem.itemId,
        'before'
      )
      return
    }

    const overTopEntry = event.over
      ? parseTopEntrySortableId(String(event.over.id))
      : null
    if (overTopEntry) {
      await moveItemToLooseAt(
        tab,
        activeGroupItem.groupId,
        activeGroupItem.itemId,
        overTopEntry,
        'before'
      )
    }
  }

  return (
    <DndRoot
      onDragStart={onDragStart}
      onDragOver={handleListDragOver}
      onDragEnd={(event) => {
        setGroupDropFeedbackId(null)
        void handleListDragEnd(event)
        onDragStop()
      }}
      onDragCancel={() => {
        setGroupDropFeedbackId(null)
        onDragStop()
      }}
    >
      <SortableZone ids={topEntryIds} strategy={rectSortingStrategy}>
        <div className="list-section" data-testid={`list-section-${tab}`}>
          {topEntries.map((entry) =>
            entry.type === 'group' ? (
              <GroupCard
                key={entry.group.id}
                tab={tab}
                group={entry.group}
                dropClassName={
                  groupDropFeedbackId === entry.group.id ? 'folder-drop' : ''
                }
                hideWhileDragging
                sortableId={getTopEntrySortableId({
                  type: 'group',
                  id: entry.group.id,
                })}
                useExternalItemDnd
              />
            ) : (
              <ItemRow
                key={entry.item.id}
                tab={tab}
                item={entry.item}
                groupId={null}
                hideWhileDragging
                sortableId={getTopEntrySortableId({
                  type: 'loose',
                  id: entry.item.id,
                })}
              />
            )
          )}
        </div>
      </SortableZone>
      {typeof document === 'undefined'
        ? null
        : createPortal(
            <DragOverlay dropAnimation={null} zIndex={260}>
              {dragOverlayNode}
            </DragOverlay>,
            document.body
          )}
    </DndRoot>
  )
}
