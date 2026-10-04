import type {
  AnyGroupItem,
  AppData,
  Group,
  GroupTab,
} from '../../../shared/types'
import { reconcileTopOrder } from './data-helpers'
import type { ToastAction } from './store-types'

/** How long the most recent deletion stays undoable. */
export const UNDO_WINDOW_MS = 5 * 60 * 1000

/** A group item living in a group, a loose top-level item, or a whole group. */
export type UndoTarget =
  | { kind: 'loose'; tab: GroupTab; itemId: string }
  | { kind: 'groupItem'; tab: GroupTab; groupId: string; itemId: string }
  | { kind: 'group'; tab: GroupTab; groupId: string }

export type UndoKind = UndoTarget['kind']

export type UndoEntity = AnyGroupItem | Group<AnyGroupItem>

/**
 * Everything needed to put one deleted entity back: where it was, and the entity itself. Only the
 * entity is restored, never a snapshot of the whole data, so edits made in the meantime survive.
 */
export type UndoRecord = {
  tab: GroupTab
  kind: UndoKind
  /** The group holding the item (`groupItem`), or the group itself (`group`); null for loose items. */
  groupId: string | null
  /** Position in the list the entity was removed from. */
  index: number
  /** Position in `topOrder[tab]`; null for items inside a group, which have no top-level entry. */
  topIndex: number | null
  entity: UndoEntity
  /** The toast offering this undo, so it can be hidden when the record is dropped. */
  toastAction?: ToastAction
}

type Stored = { record: UndoRecord; expiresAt: number; timer: number }

// Only the most recent deletion is kept. Lives outside the store: it is not UI state and must not
// re-render anything.
let stored: Stored | null = null

export function getUndoRecord(): UndoRecord | null {
  if (stored && Date.now() >= stored.expiresAt) {
    clearUndoRecord()
  }

  return stored?.record ?? null
}

export function setUndoRecord(record: UndoRecord): void {
  clearUndoRecord()
  stored = {
    record,
    expiresAt: Date.now() + UNDO_WINDOW_MS,
    // Releases the deleted entity (it may be a password) once it can no longer be undone.
    timer: window.setTimeout(() => {
      if (stored?.record === record) {
        stored = null
      }
    }, UNDO_WINDOW_MS),
  }
}

/** Forget the pending undo. Returns the dropped record, if there was one. */
export function clearUndoRecord(): UndoRecord | null {
  const dropped = stored?.record ?? null
  if (stored) {
    window.clearTimeout(stored.timer)
    stored = null
  }

  return dropped
}

function listFor(
  data: AppData,
  tab: GroupTab,
  kind: UndoKind,
  groupId: string | null
): UndoEntity[] | null {
  if (kind === 'loose') {
    return data.loose[tab] as UndoEntity[]
  }

  if (kind === 'group') {
    return data[tab] as UndoEntity[]
  }

  const group = (data[tab] as Array<Group<AnyGroupItem>>).find(
    (entry) => entry.id === groupId
  )
  return group ? (group.items as UndoEntity[]) : null
}

const listOf = (data: AppData, record: UndoRecord) =>
  listFor(data, record.tab, record.kind, record.groupId)

function topEntryOf(kind: UndoKind, id: string) {
  return { type: kind === 'group' ? 'group' : 'loose', id } as const
}

function topIndexOf(
  data: AppData,
  tab: GroupTab,
  kind: UndoKind,
  id: string
): number | null {
  // updateData reconciles topOrder after every change (dropping stale or duplicate entries), so
  // measure the position in the reconciled order: that is what the entity's neighbours will have.
  const reconciled = { ...data, topOrder: { ...data.topOrder } }
  reconcileTopOrder(reconciled, tab)
  const wanted = topEntryOf(kind, id)
  const index = reconciled.topOrder[tab].findIndex(
    (entry) => entry.type === wanted.type && entry.id === wanted.id
  )
  return index >= 0 ? index : null
}

/** Describe what a delete is about to remove, or null when it is not there any more. */
export function captureDeletion(
  data: AppData,
  target: UndoTarget
): UndoRecord | null {
  const groupId = target.kind === 'loose' ? null : target.groupId
  const list = listFor(data, target.tab, target.kind, groupId)
  const id = target.kind === 'group' ? target.groupId : target.itemId
  const index = list?.findIndex((entry) => entry.id === id) ?? -1
  const entity = list?.[index]
  if (!entity) {
    return null
  }

  return {
    tab: target.tab,
    kind: target.kind,
    groupId,
    index,
    topIndex:
      target.kind === 'groupItem'
        ? null
        : topIndexOf(data, target.tab, target.kind, id),
    entity: structuredClone(entity),
  }
}

/** Remove the recorded entity from a draft. */
export function removeDeletedEntity(draft: AppData, record: UndoRecord): void {
  const list = listOf(draft, record)
  const index = list?.findIndex((entry) => entry.id === record.entity.id) ?? -1
  if (list && index >= 0) {
    list.splice(index, 1)
  }
}

/** Whether the recorded entity can be put back into this data. */
export function canRestore(data: AppData, record: UndoRecord): boolean {
  const list = listOf(data, record)
  return list !== null && !list.some((entry) => entry.id === record.entity.id)
}

/**
 * Put the recorded entity back at its original index and, for top-level entries, its original
 * place in `topOrder`. updateData reconciles topOrder afterwards and would append a missing entry
 * at the end, so the position has to be restored here.
 */
export function restoreDeletedEntity(
  draft: AppData,
  record: UndoRecord
): boolean {
  const list = listOf(draft, record)
  if (!list || !canRestore(draft, record)) {
    return false
  }

  list.splice(
    Math.min(record.index, list.length),
    0,
    structuredClone(record.entity)
  )

  if (record.topIndex !== null) {
    // Reconcile first so the order is clean, then move the appended entry back to its old place.
    reconcileTopOrder(draft, record.tab)
    const order = draft.topOrder[record.tab]
    const wanted = topEntryOf(record.kind, record.entity.id)
    const from = order.findIndex(
      (entry) => entry.type === wanted.type && entry.id === wanted.id
    )
    if (from >= 0) {
      const [entry] = order.splice(from, 1)
      order.splice(Math.min(record.topIndex, order.length), 0, entry!)
    }
  }

  return true
}
