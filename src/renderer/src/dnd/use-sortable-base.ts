import { useSortable } from '@dnd-kit/sortable'

type SortableResult = ReturnType<typeof useSortable>

export type SortableBindings = {
  attributes: SortableResult['attributes']
  listeners: SortableResult['listeners']
  setNodeRef: SortableResult['setNodeRef']
  isDragging: boolean
  style: React.CSSProperties
}

export function useSortableBase(id: string): SortableBindings {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({ id })

  const translateTransform =
    transform && isDragging
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined

  return {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    style: {
      transform: translateTransform,
      transition: isDragging ? 'none' : undefined,
      willChange: isDragging ? 'transform' : undefined,
      zIndex: isDragging ? 50 : undefined,
      cursor: isDragging ? 'grabbing' : undefined,
    },
  }
}
