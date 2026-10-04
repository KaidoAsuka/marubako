import { useRef, type KeyboardEvent, type MouseEvent } from 'react'

import type { ContextMenuPoint } from '../../../shared/context-menu'
import type { GroupTab } from '../../../shared/types'
import { deleteEntity } from '../store/delete-actions'
import { moveEntry } from '../store/move-actions'
import type { UndoTarget } from '../store/undo'
import { useAppStore } from '../store/use-app-store'
import {
  buildEntryMenu,
  type EntryMenuAction,
  type EntryTarget,
} from '../utils/entry-menu'
import { openEntry } from '../utils/open-entry'
import { useI18n } from './use-i18n'

// Where an entry says what it is. A tile in a group's popup, a row of a group in the list view, and
// a top-level tile, row or group card; the first that matches going up from the target is the one.
const ENTRY_SELECTOR =
  '[data-popup-item-id], [data-list-item-id], [data-top-entry-type]'

/** What the element, or what it sits inside, stands for. Null for anything that is not an entry. */
export function entryTargetAt(
  element: Element | null,
  tab: GroupTab
): EntryTarget | null {
  const found = element?.closest<HTMLElement>(ENTRY_SELECTOR)
  if (!found) return null

  if (found.dataset.popupItemId) {
    // A popup shows the entries of the group that is open.
    const popup = useAppStore.getState().widgetPopup
    return popup
      ? {
          kind: 'item',
          tab: popup.tab,
          groupId: popup.groupId,
          itemId: found.dataset.popupItemId,
        }
      : null
  }
  if (found.dataset.listItemId && found.dataset.listGroupId) {
    return {
      kind: 'item',
      tab,
      groupId: found.dataset.listGroupId,
      itemId: found.dataset.listItemId,
    }
  }
  const id = found.dataset.topEntryId
  if (!id) return null

  return found.dataset.topEntryType === 'group'
    ? { kind: 'group', tab, groupId: id }
    : { kind: 'item', tab, groupId: null, itemId: id }
}

function deletionOf(target: EntryTarget): UndoTarget {
  if (target.kind === 'group') {
    return { kind: 'group', tab: target.tab, groupId: target.groupId }
  }

  return target.groupId === null
    ? { kind: 'loose', tab: target.tab, itemId: target.itemId }
    : {
        kind: 'groupItem',
        tab: target.tab,
        groupId: target.groupId,
        itemId: target.itemId,
      }
}

// The menu key and Shift+F10 also make the browser raise a `contextmenu` event of its own, shortly after
// the key. The key has been answered already, so that event is not answered a second time.
const KEY_MENU_ECHO_MS = 600

const isEditing = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.matches('input, textarea, select') || target.isContentEditable)

/** Where the menu key opens the menu: at the lower left of the focused entry, in window pixels. */
function pointBelow(element: Element | null): ContextMenuPoint | undefined {
  const entry = element?.closest<HTMLElement>(ENTRY_SELECTOR)
  if (!entry) return undefined
  const rect = entry.getBoundingClientRect()

  return {
    x: Math.round(rect.left + Math.min(24, rect.width / 2)),
    y: Math.round(rect.bottom - 4),
  }
}

/**
 * The right-click menu and the keys that go with it, for the entries and groups of one category page:
 * right-click (or the menu key, or Shift+F10) opens a native menu with launch or copy, rename, move to
 * a group and delete; F2 renames (opens the editor on the name) and Delete deletes, from the tile
 * itself. The handlers go on the page's root, so every tile, row and card and the group popup are
 * covered without each of them knowing about the menu.
 */
export function useEntryContextMenu(tab: GroupTab): {
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
} {
  const { t } = useI18n()
  const keyMenuAt = useRef(0)

  const rename = (target: EntryTarget) => {
    const store = useAppStore.getState()
    store.setModal(
      target.kind === 'group'
        ? { kind: 'group', tab: target.tab, groupId: target.groupId }
        : {
            kind: 'item',
            tab: target.tab,
            groupId: target.groupId,
            itemId: target.itemId,
            // The target comes first in the form, but a rename wants the cursor on the name.
            focus: 'name',
          }
    )
  }

  const copy = async (
    target: EntryTarget,
    what: 'password' | 'username' | 'content'
  ) => {
    const store = useAppStore.getState()
    const item =
      target.kind === 'item' && store.data
        ? (target.groupId === null
            ? store.data.loose[target.tab]
            : (store.data[target.tab].find(
                (group) => group.id === target.groupId
              )?.items ?? [])
          ).find((entry) => entry.id === target.itemId)
        : undefined
    if (!item) return
    const text =
      what === 'password' && item.kind === 'password'
        ? item.password
        : what === 'username' && item.kind === 'password'
          ? item.username
          : what === 'content' &&
              (item.kind === 'command' || item.kind === 'note')
            ? item.content
            : ''
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      store.showToast(
        t(
          what === 'password'
            ? 'password_copied'
            : what === 'username'
              ? 'username_copied'
              : 'copied'
        ),
        'success'
      )
    } catch (error) {
      store.showToast(
        error instanceof Error ? error.message : String(error),
        'danger'
      )
    }
  }

  const perform = async (target: EntryTarget, action: EntryMenuAction) => {
    const store = useAppStore.getState()
    switch (action.type) {
      case 'rename':
        rename(target)
        return
      case 'delete':
        await deleteEntity(deletionOf(target), t)
        return
      case 'copy':
        await copy(target, action.what)
        return
      case 'move':
        if (target.kind === 'item') {
          await moveEntry(
            target.tab,
            target.itemId,
            target.groupId,
            action.toGroupId,
            t
          )
        }
        return
      case 'open':
        if (target.kind === 'group') {
          if (
            target.tab === 'folders' ||
            target.tab === 'websites' ||
            target.tab === 'apps'
          )
            store.openWidgetPopup(target.tab, target.groupId)
          return
        }
        if (store.data) {
          const list =
            target.groupId === null
              ? store.data.loose[target.tab]
              : (store.data[target.tab].find(
                  (group) => group.id === target.groupId
                )?.items ?? [])
          const item = list.find((entry) => entry.id === target.itemId)
          if (item)
            await openEntry(
              target.tab,
              item,
              store.data.prefs.browser,
              target.groupId
            )
        }
    }
  }

  const showMenu = async (target: EntryTarget, point?: ContextMenuPoint) => {
    const store = useAppStore.getState()
    if (!store.data) return
    const menu = buildEntryMenu(store.data, target, {
      t,
      viewMode: store.data.prefs.viewMode,
    })
    if (!menu) return
    const result = await window.quickLaunch.showContextMenu(menu.items, point)
    if (!result.ok) {
      store.showToast(result.error, 'danger')
      return
    }
    const action = result.data === null ? null : menu.actionFor(result.data)
    if (action) await perform(target, action)
  }

  return {
    onContextMenu(event) {
      if (event.defaultPrevented) return
      const target = entryTargetAt(event.target as Element, tab)
      // Anywhere that is not an entry keeps the page's own (no) menu.
      if (!target) return
      event.preventDefault()
      if (Date.now() - keyMenuAt.current < KEY_MENU_ECHO_MS) return
      void showMenu(target)
    },
    onKeyDown(event) {
      if (event.defaultPrevented || event.nativeEvent.isComposing) return
      if (isEditing(event.target)) return
      if (useAppStore.getState().modal) return
      const opensMenu =
        event.key === 'ContextMenu' ||
        (event.key === 'F10' &&
          event.shiftKey &&
          !event.ctrlKey &&
          !event.altKey)
      const plain = !event.ctrlKey && !event.altKey && !event.metaKey
      if (
        !opensMenu &&
        !(plain && (event.key === 'F2' || event.key === 'Delete'))
      )
        return
      const target = entryTargetAt(event.target as Element, tab)
      if (!target) return

      event.preventDefault()
      if (opensMenu) {
        keyMenuAt.current = Date.now()
        void showMenu(target, pointBelow(event.target as Element))
      } else if (event.key === 'F2') rename(target)
      else void deleteEntity(deletionOf(target), t)
    },
  }
}
