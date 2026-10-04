import { useEffect } from 'react'

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type AutoScrollOptions,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  type SortingStrategy,
} from '@dnd-kit/sortable'

type DndRootProps = {
  children: React.ReactNode
  autoScroll?: boolean | AutoScrollOptions
  collisionDetection?: CollisionDetection
  onDragStart?: (event: DragStartEvent) => void
  onDragOver?: (event: DragOverEvent) => void
  onDragEnd?: (event: DragEndEvent) => void
  onDragCancel?: (event: DragCancelEvent) => void
}

type SortableZoneProps = {
  ids: string[]
  children: React.ReactNode
  strategy?: SortingStrategy
}

type DndProviderProps = {
  ids: string[]
  children: React.ReactNode
  onDragEnd: (
    activeId: string,
    overId: string | null,
    event: DragEndEvent
  ) => void
  strategy?: SortingStrategy
  autoScroll?: boolean | AutoScrollOptions
}

const precisePointerCollision: CollisionDetection = (args) => {
  if (!args.pointerCoordinates) {
    return closestCenter(args)
  }

  return pointerWithin(args)
}

function toggleBodyDndState(isActive: boolean) {
  if (typeof document === 'undefined') {
    return
  }

  document.body.classList.toggle('dnd-active', isActive)
}

export function DndRoot({
  children,
  autoScroll = true,
  collisionDetection = precisePointerCollision,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDragCancel,
}: DndRootProps): JSX.Element {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // A click with a slightly unsteady hand must stay a click: an
        // activated drag swallows the click that follows it.
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => () => toggleBodyDndState(false), [])

  const dragContextProps = {
    ...(onDragOver ? { onDragOver } : {}),
  }

  return (
    <DndContext
      autoScroll={autoScroll}
      collisionDetection={collisionDetection}
      onDragStart={(event) => {
        toggleBodyDndState(true)
        onDragStart?.(event)
      }}
      onDragEnd={(event) => {
        toggleBodyDndState(false)
        onDragEnd?.(event)
      }}
      onDragCancel={(event) => {
        toggleBodyDndState(false)
        onDragCancel?.(event)
      }}
      sensors={sensors}
      {...dragContextProps}
    >
      {children}
    </DndContext>
  )
}

export function SortableZone({
  ids,
  children,
  strategy = verticalListSortingStrategy,
}: SortableZoneProps): JSX.Element {
  return (
    <SortableContext items={ids} strategy={strategy}>
      {children}
    </SortableContext>
  )
}

export default function DndProvider({
  ids,
  children,
  onDragEnd,
  strategy = verticalListSortingStrategy,
  autoScroll = true,
}: DndProviderProps): JSX.Element {
  return (
    <DndRoot
      autoScroll={autoScroll}
      onDragEnd={(event) => {
        const { active, over } = event
        if (over && active.id === over.id) {
          return
        }

        onDragEnd(String(active.id), over ? String(over.id) : null, event)
      }}
    >
      <SortableZone ids={ids} strategy={strategy}>
        {children}
      </SortableZone>
    </DndRoot>
  )
}
