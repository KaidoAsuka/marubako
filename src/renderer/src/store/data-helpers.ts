import { ORDERED_GROUP_TABS } from '../../../shared/types'
import type {
  AppData,
  GroupItemMap,
  GroupTab,
  TaskItem,
  TaskStatus,
  TopEntry,
} from '../../../shared/types'

export type OrderedEntry =
  | {
      type: 'group'
      group: AppData[GroupTab][number]
    }
  | {
      type: 'loose'
      item: AppData['loose'][GroupTab][number]
    }

export function reconcileTopOrder(data: AppData, tab: GroupTab): void {
  const groupIds = new Set(data[tab].map((group) => group.id))
  const looseIds = new Set(data.loose[tab].map((item) => item.id))
  const seen = new Set<string>()
  const next: TopEntry[] = []

  for (const entry of data.topOrder[tab]) {
    const key = `${entry.type}:${entry.id}`
    if (seen.has(key)) {
      continue
    }

    if (entry.type === 'group' && groupIds.has(entry.id)) {
      next.push(entry)
      seen.add(key)
    }

    if (entry.type === 'loose' && looseIds.has(entry.id)) {
      next.push(entry)
      seen.add(key)
    }
  }

  for (const group of data[tab]) {
    const key = `group:${group.id}`
    if (!seen.has(key)) {
      next.push({ type: 'group', id: group.id })
    }
  }

  for (const item of data.loose[tab]) {
    const key = `loose:${item.id}`
    if (!seen.has(key)) {
      next.push({ type: 'loose', id: item.id })
    }
  }

  data.topOrder[tab] = next
}

export function reconcileAllTopOrders(data: AppData): void {
  for (const tab of ORDERED_GROUP_TABS) {
    reconcileTopOrder(data, tab)
  }
}

export function getTopEntries<K extends GroupTab>(
  data: AppData,
  tab: K
): OrderedEntry[] {
  const groupsById = new Map(data[tab].map((group) => [group.id, group]))
  const looseById = new Map(data.loose[tab].map((item) => [item.id, item]))

  return data.topOrder[tab]
    .map((entry) => {
      if (entry.type === 'group') {
        const group = groupsById.get(entry.id)
        return group ? { type: 'group' as const, group } : null
      }

      const item = looseById.get(entry.id)
      return item ? { type: 'loose' as const, item } : null
    })
    .filter(Boolean) as Array<
    | { type: 'group'; group: (typeof data)[K][number] }
    | { type: 'loose'; item: (typeof data.loose)[K][number] }
  >
}

export function getItemList<K extends GroupTab>(
  data: AppData,
  tab: K,
  groupId: string | null
): GroupItemMap[K][] {
  if (groupId === null) {
    return data.loose[tab] as GroupItemMap[K][]
  }

  const group = data[tab].find((entry) => entry.id === groupId)
  return (group?.items ?? []) as GroupItemMap[K][]
}

export function tasksOnDate(data: AppData, date: string): TaskItem[] {
  return data.tasks[date] ?? []
}

export function getTaskProgress(task: TaskItem) {
  const total = task.subtasks.length
  if (!total) {
    return {
      done: task.status === 'done' || task.status === 'skip' ? 1 : 0,
      total: 1,
      pct: task.status === 'done' || task.status === 'skip' ? 100 : 0,
    }
  }

  const done = task.subtasks.filter(
    (subtask) => subtask.status === 'done' || subtask.status === 'skip'
  ).length

  return {
    done,
    total,
    pct: Math.round((done / total) * 100),
  }
}

/** A task or subtask that needs no more work: done, or deliberately skipped. */
export function isFinished(status: TaskStatus): boolean {
  return status === 'done' || status === 'skip'
}

/** What to suggest to the user after the subtasks of a task changed. */
export type TaskStatusOffer = 'complete' | 'reopen'

/**
 * How the status of a task and the progress of its subtasks go together.
 *
 * The status belongs to the user: nothing here changes it. A task's own button and the form set
 * it, and the subtasks only ever lead to a suggestion, shown once, at the moment it is true:
 * - the change finished the last open subtask of a task that is not finished: offer "complete";
 * - the change opened a subtask again (or added one) in a task that was marked done while all its
 *   subtasks were finished: offer "reopen".
 * Anything else, such as renaming a subtask, ticking one more under a task that was marked done
 * with some subtasks left open on purpose, or a task without subtasks, offers nothing.
 */
export function taskStatusOffer(
  before: TaskItem,
  after: TaskItem
): TaskStatusOffer | null {
  if (after.subtasks.length === 0) {
    return null
  }

  const allFinished = (task: TaskItem) =>
    task.subtasks.length > 0 &&
    task.subtasks.every((subtask) => isFinished(subtask.status))

  if (allFinished(after) && !allFinished(before) && !isFinished(after.status)) {
    return 'complete'
  }
  if (!allFinished(after) && allFinished(before) && after.status === 'done') {
    return 'reopen'
  }

  return null
}
