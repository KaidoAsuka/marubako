import {
  MAX_MENU_ITEMS,
  MAX_MENU_LABEL,
  type ContextMenuItem,
} from '../../../shared/context-menu'
import type {
  AnyGroupItem,
  AppData,
  Group,
  GroupTab,
  ViewMode,
} from '../../../shared/types'

/** What a right-click, or the menu key, was on: one entry (loose or inside a group) or a whole group. */
export type EntryTarget =
  | { kind: 'item'; tab: GroupTab; groupId: string | null; itemId: string }
  | { kind: 'group'; tab: GroupTab; groupId: string }

/** What a chosen menu item means. */
export type EntryMenuAction =
  | { type: 'open' }
  | { type: 'copy'; what: 'password' | 'username' | 'content' }
  | { type: 'rename' }
  | { type: 'delete' }
  | { type: 'move'; toGroupId: string | null }

export interface EntryMenu {
  items: ContextMenuItem[]
  /** The meaning of the id that comes back when an item is chosen; null for one this menu never had. */
  actionFor: (id: string) => EntryMenuAction | null
}

type Translate = (key: string) => string

const GRID_TABS: readonly GroupTab[] = ['folders', 'websites', 'apps']
const LAUNCHABLE: readonly GroupTab[] = ['folders', 'websites', 'apps']

// Leaves room for the standalone entry in a menu that holds at most 40 items.
const MAX_MOVE_TARGETS = MAX_MENU_ITEMS - 2

function clipLabel(label: string): string {
  return label.length > MAX_MENU_LABEL
    ? `${label.slice(0, MAX_MENU_LABEL - 1)}…`
    : label
}

function findItem(
  data: AppData,
  tab: GroupTab,
  groupId: string | null,
  itemId: string
): AnyGroupItem | null {
  const items =
    groupId === null
      ? (data.loose[tab] as AnyGroupItem[])
      : ((data[tab] as Array<Group<AnyGroupItem>>).find(
          (group) => group.id === groupId
        )?.items ?? [])

  return items.find((item) => item.id === itemId) ?? null
}

function moveItems(
  data: AppData,
  target: Extract<EntryTarget, { kind: 'item' }>,
  t: Translate
): ContextMenuItem[] {
  const groups = (data[target.tab] as Array<Group<AnyGroupItem>>).filter(
    (group) => group.id !== target.groupId
  )
  const items: ContextMenuItem[] = []
  // Out of its group, to the entries that belong to no group.
  if (target.groupId !== null)
    items.push({ id: 'move:loose', label: t('item_loose') })
  for (const group of groups.slice(0, MAX_MOVE_TARGETS)) {
    items.push({
      id: `move:group:${group.id}`,
      label: clipLabel(group.name || t('menu_unnamed_group')),
    })
  }

  return items
}

function itemMenu(
  data: AppData,
  target: Extract<EntryTarget, { kind: 'item' }>,
  t: Translate
): ContextMenuItem[] | null {
  const item = findItem(data, target.tab, target.groupId, target.itemId)
  if (!item) return null

  const items: ContextMenuItem[] = []
  if (LAUNCHABLE.includes(target.tab)) {
    items.push({ id: 'open', label: t('menu_open') })
  } else if (item.kind === 'password') {
    items.push(
      {
        id: 'copy-password',
        label: t('copy_password'),
        enabled: item.password !== '',
      },
      {
        id: 'copy-username',
        label: t('copy_username'),
        enabled: item.username !== '',
      }
    )
  } else if (item.kind === 'command') {
    items.push({ id: 'copy-content', label: t('cmd_copy') })
  } else if (item.kind === 'note') {
    items.push({ id: 'copy-content', label: t('copy') })
  }
  if (items.length) items.push({ type: 'separator' })
  items.push({ id: 'rename', label: t('menu_rename'), accelerator: 'F2' })
  const moves = moveItems(data, target, t)
  if (moves.length) items.push({ label: t('menu_move_to'), submenu: moves })
  items.push(
    { type: 'separator' },
    { id: 'delete', label: t('btn_delete'), accelerator: 'Delete' }
  )

  return items
}

function groupMenu(
  data: AppData,
  target: Extract<EntryTarget, { kind: 'group' }>,
  viewMode: ViewMode,
  t: Translate
): ContextMenuItem[] | null {
  const group = (data[target.tab] as Array<Group<AnyGroupItem>>).find(
    (entry) => entry.id === target.groupId
  )
  if (!group) return null

  const items: ContextMenuItem[] = []
  // In the grid a group is a tile that opens into a popup; in the list it is already open or shut.
  if (GRID_TABS.includes(target.tab) && viewMode === 'grid')
    items.push({ id: 'open', label: t('menu_open') })
  items.push(
    { id: 'rename', label: t('menu_rename_group'), accelerator: 'F2' },
    { type: 'separator' },
    { id: 'delete', label: t('btn_delete'), accelerator: 'Delete' }
  )

  return items
}

function actionOf(id: string): EntryMenuAction | null {
  switch (id) {
    case 'open':
      return { type: 'open' }
    case 'copy-password':
      return { type: 'copy', what: 'password' }
    case 'copy-username':
      return { type: 'copy', what: 'username' }
    case 'copy-content':
      return { type: 'copy', what: 'content' }
    case 'rename':
      return { type: 'rename' }
    case 'delete':
      return { type: 'delete' }
    case 'move:loose':
      return { type: 'move', toGroupId: null }
    default:
      return id.startsWith('move:group:')
        ? { type: 'move', toGroupId: id.slice('move:group:'.length) }
        : null
  }
}

/**
 * The right-click menu of an entry or a group, in the user's language: launch or copy, rename (F2),
 * move to another group (so moving needs no dragging) and delete (Del); a group has open, rename and
 * delete. Null when the target is not in the data any more.
 */
export function buildEntryMenu(
  data: AppData,
  target: EntryTarget,
  options: { t: Translate; viewMode: ViewMode }
): EntryMenu | null {
  const items =
    target.kind === 'item'
      ? itemMenu(data, target, options.t)
      : groupMenu(data, target, options.viewMode, options.t)
  if (!items) return null

  return { items, actionFor: actionOf }
}
