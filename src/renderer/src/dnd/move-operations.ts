import type { Subtask, TaskItem, TopEntry } from '../../../shared/types'

type Identifiable = {
  id: string
}

export function reorderEntries(
  entries: TopEntry[],
  activeId: string,
  overId: string,
  position?: 'before' | 'after'
): TopEntry[] {
  const fromIndex = entries.findIndex((entry) =>
    matchesTopEntry(entry, activeId)
  )
  const targetIndex = entries.findIndex((entry) =>
    matchesTopEntry(entry, overId)
  )

  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) {
    return entries
  }

  const next = [...entries]
  const [entry] = next.splice(fromIndex, 1)
  if (!entry) {
    return entries
  }

  const nextTargetIndex = next.findIndex((candidate) =>
    matchesTopEntry(candidate, overId)
  )
  if (nextTargetIndex < 0) {
    return entries
  }

  const insertIndex =
    position === 'after' || (position === undefined && fromIndex < targetIndex)
      ? nextTargetIndex + 1
      : nextTargetIndex

  next.splice(insertIndex, 0, entry)
  return next
}

export function getTopEntrySortableId(entry: TopEntry): string {
  return `${entry.type}:${entry.id}`
}

export function parseTopEntrySortableId(sortableId: string): TopEntry | null {
  const [type, ...rest] = sortableId.split(':')
  const id = rest.join(':')

  if (!id || (type !== 'group' && type !== 'loose')) {
    return null
  }

  return { type, id }
}

export function getPopupItemSortableId(id: string): string {
  return `popupItem:${id}`
}

export function parsePopupItemSortableId(
  sortableId: string
): { id: string } | null {
  const prefix = 'popupItem:'
  if (!sortableId.startsWith(prefix)) {
    return null
  }

  const id = sortableId.slice(prefix.length)
  return id ? { id } : null
}

export function getGroupItemSortableId(
  groupId: string,
  itemId: string
): string {
  return `groupItem:${groupId}:${itemId}`
}

export function parseGroupItemSortableId(
  sortableId: string
): { groupId: string; itemId: string } | null {
  const prefix = 'groupItem:'
  if (!sortableId.startsWith(prefix)) {
    return null
  }

  const value = sortableId.slice(prefix.length)
  const separatorIndex = value.indexOf(':')
  if (separatorIndex < 0) {
    return null
  }

  const groupId = value.slice(0, separatorIndex)
  const itemId = value.slice(separatorIndex + 1)

  if (!groupId || !itemId) {
    return null
  }

  return {
    groupId,
    itemId,
  }
}

export function reorderTasks(
  tasks: TaskItem[],
  activeId: string,
  overId: string
): TaskItem[] {
  return reorderById(tasks, activeId, overId)
}

export function reorderSubtasks(
  subtasks: Subtask[],
  activeId: string,
  overId: string
): TaskItem['subtasks'] {
  return reorderById(subtasks, activeId, overId)
}

export function reorderById<T extends Identifiable>(
  items: T[],
  activeId: string,
  overId: string
): T[] {
  const fromIndex = items.findIndex((item) => item.id === activeId)
  const toIndex = items.findIndex((item) => item.id === overId)

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return items
  }

  const next = [...items]
  const [entry] = next.splice(fromIndex, 1)
  if (!entry) {
    return items
  }
  next.splice(toIndex, 0, entry)
  return next
}

export function moveBetweenLists<T extends Identifiable>(
  source: T[],
  target: T[],
  activeId: string,
  overId?: string
): {
  source: T[]
  target: T[]
} {
  const fromIndex = source.findIndex((item) => item.id === activeId)
  if (fromIndex < 0) {
    return { source, target }
  }

  const nextSource = [...source]
  const [entry] = nextSource.splice(fromIndex, 1)
  if (!entry) {
    return { source, target }
  }

  const nextTarget = [...target]
  const overIndex =
    overId !== undefined
      ? nextTarget.findIndex((item) => item.id === overId)
      : -1

  nextTarget.splice(overIndex >= 0 ? overIndex : nextTarget.length, 0, entry)

  return {
    source: nextSource,
    target: nextTarget,
  }
}

function matchesTopEntry(entry: TopEntry, sortableId: string): boolean {
  return entry.id === sortableId || getTopEntrySortableId(entry) === sortableId
}
