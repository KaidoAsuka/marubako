import type { AppData, GroupTab, TopEntry } from '../../../../shared/types'
import {
  reorderById,
  reorderEntries,
  reorderSubtasks as reorderSubtaskList,
  reorderTasks as reorderTaskList,
} from '../../dnd/move-operations'
import type { AppStoreCreator, DndSliceState } from '../store-types'

function getGroupsForTab<K extends GroupTab>(
  data: AppData,
  tab: K
): AppData[K] {
  return data[tab]
}

function getLooseItemsForTab<K extends GroupTab>(
  data: AppData,
  tab: K
): AppData['loose'][K] {
  return data.loose[tab]
}

function getGroupForTab<K extends GroupTab>(
  data: AppData,
  tab: K,
  groupId: string
): AppData[K][number] | null {
  return (
    getGroupsForTab(data, tab).find((entry) => entry.id === groupId) ?? null
  )
}

function removeLooseItem<K extends GroupTab>(
  data: AppData,
  tab: K,
  itemId: string
): AppData['loose'][K][number] | null {
  const list = getLooseItemsForTab(data, tab)
  const index = list.findIndex((entry) => entry.id === itemId)
  if (index < 0) {
    return null
  }

  const [item] = list.splice(index, 1)
  return item ?? null
}

function removeGroupItem<K extends GroupTab>(
  data: AppData,
  tab: K,
  groupId: string,
  itemId: string
): AppData['loose'][K][number] | null {
  const group = getGroupForTab(data, tab, groupId)
  if (!group) {
    return null
  }

  const index = group.items.findIndex((entry) => entry.id === itemId)
  if (index < 0) {
    return null
  }

  const [item] = group.items.splice(index, 1)
  return (item as AppData['loose'][K][number] | undefined) ?? null
}

function takeItemFromSource<K extends GroupTab>(
  data: AppData,
  tab: K,
  groupId: string | null,
  itemId: string
): AppData['loose'][K][number] | null {
  if (groupId === null) {
    return removeLooseItem(data, tab, itemId)
  }

  return removeGroupItem(data, tab, groupId, itemId)
}

function appendItemToGroup<K extends GroupTab>(
  group: AppData[K][number],
  item: AppData['loose'][K][number]
) {
  ;(group.items as unknown as Array<AppData['loose'][K][number]>).push(item)
}

function appendItemToLoose<K extends GroupTab>(
  data: AppData,
  tab: K,
  item: AppData['loose'][K][number]
) {
  ;(
    getLooseItemsForTab(data, tab) as unknown as Array<
      AppData['loose'][K][number]
    >
  ).push(item)
}

function insertTopEntry(
  topOrder: TopEntry[],
  nextEntry: TopEntry,
  targetEntry: TopEntry | null,
  position: 'before' | 'after' = 'before'
) {
  const existingIndex = topOrder.findIndex(
    (entry) => entry.type === nextEntry.type && entry.id === nextEntry.id
  )
  if (existingIndex >= 0) {
    topOrder.splice(existingIndex, 1)
  }

  const targetIndex = targetEntry
    ? topOrder.findIndex(
        (entry) =>
          entry.type === targetEntry.type && entry.id === targetEntry.id
      )
    : -1

  const insertIndex =
    targetIndex >= 0
      ? position === 'after'
        ? targetIndex + 1
        : targetIndex
      : topOrder.length

  topOrder.splice(insertIndex, 0, nextEntry)
}

export const createDndSlice: AppStoreCreator<DndSliceState> = (_set, get) => ({
  async reorderTopEntries(tab, activeId, overId, position) {
    if (activeId === overId) {
      return
    }

    await get().updateData((draft) => {
      draft.topOrder[tab] = reorderEntries(
        draft.topOrder[tab],
        activeId,
        overId,
        position
      )
    })
  },
  async moveLooseItemToGroup(tab, itemId, groupId) {
    await get().moveItemToGroup(tab, null, itemId, groupId)
  },
  async moveGroupItemToLoose(tab, groupId, itemId) {
    await get().moveItemToLooseAt(tab, groupId, itemId, null)
  },
  async moveGroupItemToLooseAt(
    tab,
    groupId,
    itemId,
    targetEntry,
    position = 'after'
  ) {
    await get().moveItemToLooseAt(tab, groupId, itemId, targetEntry, position)
  },
  async moveItemToGroup(tab, sourceGroupId, itemId, targetGroupId) {
    if (sourceGroupId === targetGroupId) {
      return
    }

    await get().updateData((draft) => {
      const targetGroup = getGroupForTab(draft, tab, targetGroupId)
      if (!targetGroup) {
        return
      }

      const item = takeItemFromSource(draft, tab, sourceGroupId, itemId)
      if (!item) {
        return
      }

      appendItemToGroup(targetGroup, item)
    })
  },
  async moveGroupItemToGroup(tab, sourceGroupId, itemId, targetGroupId) {
    await get().moveItemToGroup(tab, sourceGroupId, itemId, targetGroupId)
  },
  async moveItemToLooseAt(
    tab,
    sourceGroupId,
    itemId,
    targetEntry,
    position = 'after'
  ) {
    const nextEntry = { type: 'loose', id: itemId } as const

    await get().updateData((draft) => {
      if (
        sourceGroupId === null &&
        targetEntry?.type === nextEntry.type &&
        targetEntry.id === nextEntry.id
      ) {
        return
      }

      if (sourceGroupId === null) {
        insertTopEntry(draft.topOrder[tab], nextEntry, targetEntry, position)
        return
      }

      const item = takeItemFromSource(draft, tab, sourceGroupId, itemId)
      if (!item) {
        return
      }

      appendItemToLoose(draft, tab, item)
      insertTopEntry(
        draft.topOrder[tab],
        { type: 'loose', id: item.id },
        targetEntry,
        position
      )
    })
  },
  async moveItemRelative(
    tab,
    sourceGroupId,
    itemId,
    targetGroupId,
    targetItemId,
    position = 'before'
  ) {
    if (sourceGroupId === targetGroupId && itemId === targetItemId) {
      return
    }

    if (targetGroupId === null) {
      await get().moveItemToLooseAt(
        tab,
        sourceGroupId,
        itemId,
        { type: 'loose', id: targetItemId },
        position
      )
      return
    }

    await get().updateData((draft) => {
      const targetGroup = getGroupForTab(draft, tab, targetGroupId)
      if (!targetGroup) {
        return
      }

      const targetIndex = targetGroup.items.findIndex(
        (entry) => entry.id === targetItemId
      )
      if (targetIndex < 0) {
        return
      }

      const sourceGroup =
        sourceGroupId === null
          ? null
          : getGroupForTab(draft, tab, sourceGroupId)
      const sourceItems = sourceGroupId === null ? null : sourceGroup?.items
      const sourceIndex = sourceItems
        ? sourceItems.findIndex((entry) => entry.id === itemId)
        : -1
      const item = takeItemFromSource(draft, tab, sourceGroupId, itemId)
      if (!item) {
        return
      }

      let insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
      if (
        sourceGroupId !== null &&
        sourceGroupId === targetGroupId &&
        sourceIndex >= 0 &&
        sourceIndex < insertIndex
      ) {
        insertIndex -= 1
      }

      const targetItems = targetGroup.items as Array<typeof item>

      targetItems.splice(
        Math.max(0, Math.min(insertIndex, targetItems.length)),
        0,
        item
      )
    })
  },
  async reorderGroups(tab, activeId, overId) {
    if (activeId === overId) {
      return
    }

    await get().updateData((draft) => {
      switch (tab) {
        case 'folders':
          draft.folders = reorderById(draft.folders, activeId, overId)
          break
        case 'websites':
          draft.websites = reorderById(draft.websites, activeId, overId)
          break
        case 'apps':
          draft.apps = reorderById(draft.apps, activeId, overId)
          break
        case 'passwords':
          draft.passwords = reorderById(draft.passwords, activeId, overId)
          break
        case 'notes':
          draft.notes = reorderById(draft.notes, activeId, overId)
          break
        case 'commands':
          draft.commands = reorderById(draft.commands, activeId, overId)
          break
      }
    })
  },
  async reorderItems(tab, groupId, activeId, overId) {
    if (activeId === overId) {
      return
    }

    await get().updateData((draft) => {
      if (groupId === null) {
        switch (tab) {
          case 'folders':
            draft.loose.folders = reorderById(
              draft.loose.folders,
              activeId,
              overId
            )
            break
          case 'websites':
            draft.loose.websites = reorderById(
              draft.loose.websites,
              activeId,
              overId
            )
            break
          case 'apps':
            draft.loose.apps = reorderById(draft.loose.apps, activeId, overId)
            break
          case 'passwords':
            draft.loose.passwords = reorderById(
              draft.loose.passwords,
              activeId,
              overId
            )
            break
          case 'notes':
            draft.loose.notes = reorderById(draft.loose.notes, activeId, overId)
            break
          case 'commands':
            draft.loose.commands = reorderById(
              draft.loose.commands,
              activeId,
              overId
            )
            break
        }
        return
      }

      switch (tab) {
        case 'folders': {
          const targetGroup = draft.folders.find(
            (entry) => entry.id === groupId
          )
          if (targetGroup) {
            targetGroup.items = reorderById(targetGroup.items, activeId, overId)
          }
          break
        }
        case 'websites': {
          const targetGroup = draft.websites.find(
            (entry) => entry.id === groupId
          )
          if (targetGroup) {
            targetGroup.items = reorderById(targetGroup.items, activeId, overId)
          }
          break
        }
        case 'apps': {
          const targetGroup = draft.apps.find((entry) => entry.id === groupId)
          if (targetGroup) {
            targetGroup.items = reorderById(targetGroup.items, activeId, overId)
          }
          break
        }
        case 'passwords': {
          const targetGroup = draft.passwords.find(
            (entry) => entry.id === groupId
          )
          if (targetGroup) {
            targetGroup.items = reorderById(targetGroup.items, activeId, overId)
          }
          break
        }
        case 'notes': {
          const targetGroup = draft.notes.find((entry) => entry.id === groupId)
          if (targetGroup) {
            targetGroup.items = reorderById(targetGroup.items, activeId, overId)
          }
          break
        }
        case 'commands': {
          const targetGroup = draft.commands.find(
            (entry) => entry.id === groupId
          )
          if (targetGroup)
            targetGroup.items = reorderById(targetGroup.items, activeId, overId)
          break
        }
      }
    })
  },
  async reorderTasks(date, activeId, overId) {
    if (activeId === overId) {
      return
    }

    await get().updateData((draft) => {
      draft.tasks[date] = reorderTaskList(
        draft.tasks[date] ?? [],
        activeId,
        overId
      )
    })
  },
  async reorderSubtasks(date, taskId, activeId, overId) {
    if (activeId === overId) {
      return
    }

    await get().updateData((draft) => {
      const task = (draft.tasks[date] ?? []).find(
        (entry) => entry.id === taskId
      )
      if (!task) {
        return
      }

      task.subtasks = reorderSubtaskList(task.subtasks, activeId, overId)
    })
  },
})
