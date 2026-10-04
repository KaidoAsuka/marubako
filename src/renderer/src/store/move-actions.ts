import type {
  AnyGroupItem,
  AppData,
  Group,
  GroupTab,
} from '../../../shared/types'
import type { Translate } from './delete-actions'
import { captureDeletion, restoreDeletedEntity, type UndoRecord } from './undo'
import { useAppStore } from './use-app-store'

/** Takes the entry out of whichever list holds it now. Returns it, or null when it is nowhere. */
function takeEntry(
  draft: AppData,
  tab: GroupTab,
  itemId: string
): AnyGroupItem | null {
  const lists: AnyGroupItem[][] = [
    ...(draft[tab] as Array<Group<AnyGroupItem>>).map((group) => group.items),
    draft.loose[tab] as AnyGroupItem[],
  ]
  for (const list of lists) {
    const index = list.findIndex((entry) => entry.id === itemId)
    if (index >= 0) return list.splice(index, 1)[0] ?? null
  }

  return null
}

/**
 * Puts an entry back where it was before it was moved. The entry itself is the one that exists now,
 * so a rename made since the move is kept; if it has been deleted meanwhile there is nothing to put back.
 */
async function undoMove(
  tab: GroupTab,
  itemId: string,
  before: UndoRecord
): Promise<void> {
  await useAppStore.getState().updateData((draft) => {
    const current = takeEntry(draft, tab, itemId)
    if (current) restoreDeletedEntity(draft, { ...before, entity: current })
  })
}

/**
 * Moves an entry to another group, or out of its group to the standalone entries (`toGroupId` null),
 * without dragging. The entry goes to the end of the destination, and the strip says where it went
 * with an "Undo" that puts it back in its old place. Returns whether it moved.
 */
export async function moveEntry(
  tab: GroupTab,
  itemId: string,
  fromGroupId: string | null,
  toGroupId: string | null,
  t: Translate
): Promise<boolean> {
  const store = useAppStore.getState()
  const data = store.data
  if (!data || fromGroupId === toGroupId) return false

  const before = captureDeletion(
    data,
    fromGroupId === null
      ? { kind: 'loose', tab, itemId }
      : { kind: 'groupItem', tab, groupId: fromGroupId, itemId }
  )
  if (!before) return false
  const destination =
    toGroupId === null
      ? null
      : ((data[tab] as Array<Group<AnyGroupItem>>).find(
          (group) => group.id === toGroupId
        ) ?? null)
  if (toGroupId !== null && !destination) return false

  if (toGroupId === null) {
    await store.moveItemToLooseAt(tab, fromGroupId, itemId, null)
  } else {
    await store.moveItemToGroup(tab, fromGroupId, itemId, toGroupId)
  }
  // A save that failed has been rolled back and said so; there is nothing to announce or undo.
  if (useAppStore.getState().error) return false

  const name = destination
    ? destination.name || t('menu_unnamed_group')
    : t('item_loose')
  store.showToast(`${t('moved_before')}${name}${t('moved_after')}`, 'info', {
    action: { label: t('undo'), run: () => void undoMove(tab, itemId, before) },
  })

  return true
}
