import type {
  AnyGroupItem,
  AppData,
  ClassifiedPath,
  GridTab,
  GroupItemMap,
  GroupTab,
} from '../../../shared/types'
import { DEFAULT_ITEM_ICONS } from '../../../shared/default-icons'
import { isTabVisible } from '../../../shared/tabs'
import { fillTemplate } from '../utils/tab-summary'
import {
  hostLabel,
  inferName,
  normalizeWebAddress,
} from '../utils/normalize-target'
import type { Translate } from './delete-actions'
import { useAppStore } from './use-app-store'

/** Tiles for what the add flow makes: a file is not a folder, but opens the same way. */
export const FILE_ICON = 'tile:file-text:0'

/** What to add: the target, and the category it belongs to by its type. */
export type EntryDraft = {
  tab: GridTab
  /** A path or an http(s) address. */
  target: string
  /** Defaults to a name made from the target. */
  name?: string
  icon?: string
}

type AddedItem = GroupItemMap[GridTab]

/** Folders and programs are the same place however it is spelled: case, slashes, a trailing one. */
function comparablePath(path: string): string {
  return path.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

function comparableTarget(tab: GridTab, target: string): string {
  if (tab === 'websites') {
    try {
      return new URL(target).href
    } catch {
      return target.trim()
    }
  }

  return comparablePath(target)
}

function targetOf(item: AnyGroupItem): string | null {
  return 'path' in item ? item.path : 'url' in item ? item.url : null
}

/** Whether an entry with this target is already in the category, loose or in any group. */
export function hasTarget(
  data: AppData,
  tab: GridTab,
  target: string
): boolean {
  const wanted = comparableTarget(tab, target)
  const known = [
    ...(data.loose[tab] as AnyGroupItem[]),
    ...(data[tab] as Array<{ items: AnyGroupItem[] }>).flatMap(
      (group) => group.items
    ),
  ]

  return known.some((item) => {
    const own = targetOf(item)
    return own !== null && comparableTarget(tab, own) === wanted
  })
}

function makeItem(draft: EntryDraft): AddedItem {
  const id = crypto.randomUUID()
  if (draft.tab === 'websites') {
    const url = normalizeWebAddress(draft.target) ?? draft.target
    return {
      id,
      kind: 'website',
      name: draft.name?.trim() || hostLabel(url) || url,
      icon: draft.icon ?? DEFAULT_ITEM_ICONS.websites,
      url,
    }
  }

  const name = draft.name?.trim() || inferName(draft.tab, draft.target)
  return draft.tab === 'apps'
    ? {
        id,
        kind: 'app',
        name: name || draft.target,
        icon: draft.icon ?? DEFAULT_ITEM_ICONS.apps,
        path: draft.target,
      }
    : {
        id,
        kind: 'folder',
        name: name || draft.target,
        icon: draft.icon ?? DEFAULT_ITEM_ICONS.folders,
        path: draft.target,
      }
}

/** Takes entries out again, wherever they are by now. Entries that are gone are skipped. */
export async function removeEntries(
  entries: ReadonlyArray<{ tab: GroupTab; id: string }>
): Promise<void> {
  await useAppStore.getState().updateData((draft) => {
    for (const { tab, id } of entries) {
      const loose = draft.loose[tab] as AnyGroupItem[]
      const at = loose.findIndex((item) => item.id === id)
      if (at >= 0) loose.splice(at, 1)
      for (const group of draft[tab]) {
        const items = group.items as AnyGroupItem[]
        const index = items.findIndex((item) => item.id === id)
        if (index >= 0) items.splice(index, 1)
      }
    }
  })
}

/**
 * The words for "these were added": one name, a count in a category, a count across categories,
 * with the number that were already there when there were any.
 */
export function describeAdded(
  t: Translate,
  added: ReadonlyArray<{ tab: GroupTab; name: string }>,
  skipped: number
): string {
  const count = added.length
  if (skipped > 0) {
    return fillTemplate(t('added_skipped'), { count, skipped })
  }
  if (count === 1) {
    return fillTemplate(t('added_named'), { name: added[0]!.name })
  }
  const tabs = new Set(added.map((entry) => entry.tab))
  if (tabs.size === 1) {
    return fillTemplate(t('added_many'), {
      count,
      tab: t(`tab_${added[0]!.tab}`),
    })
  }

  return fillTemplate(t('added_items'), { count })
}

/** Shows "added ..." in the feedback strip with an undo that takes exactly these entries out again. */
export function announceAdded(
  t: Translate,
  added: ReadonlyArray<{ tab: GroupTab; id: string; name: string }>,
  skipped = 0
): void {
  const store = useAppStore.getState()
  if (added.length === 0) {
    store.showToast(t('added_exists'), 'info')
    return
  }

  store.showToast(describeAdded(t, added, skipped), 'success', {
    action: {
      label: t('undo'),
      run: () => void removeEntries(added),
    },
  })
}

/**
 * Puts a moved entry back where it was: its group (or the loose list if that group is gone) and
 * its old position. An entry that no longer exists is left alone.
 */
export async function moveBack(
  tab: GroupTab,
  id: string,
  groupId: string | null,
  index: number
): Promise<void> {
  await useAppStore.getState().updateData((draft) => {
    let entry: AnyGroupItem | undefined
    const loose = draft.loose[tab] as AnyGroupItem[]
    const at = loose.findIndex((item) => item.id === id)
    if (at >= 0) entry = loose.splice(at, 1)[0]
    for (const group of draft[tab]) {
      const items = group.items as AnyGroupItem[]
      const found = items.findIndex((item) => item.id === id)
      if (found >= 0) entry = items.splice(found, 1)[0]
    }
    if (!entry) return

    const home = (
      groupId === null
        ? loose
        : (draft[tab].find((group) => group.id === groupId)?.items ?? loose)
    ) as AnyGroupItem[]
    home.splice(
      index >= 0 ? Math.min(index, home.length) : home.length,
      0,
      entry
    )
  })
}

/** "Moved ... to ..." with an undo that puts the entry back where it came from. */
export function announceMoved(
  t: Translate,
  moved: {
    tab: GroupTab
    id: string
    name: string
    fromGroupId: string | null
    fromIndex: number
    place: string
  }
): void {
  useAppStore
    .getState()
    .showToast(
      fillTemplate(t('moved_named'), { name: moved.name, place: moved.place }),
      'success',
      {
        action: {
          label: t('undo'),
          run: () =>
            void moveBack(
              moved.tab,
              moved.id,
              moved.fromGroupId,
              moved.fromIndex
            ),
        },
      }
    )
}

/**
 * Adds entries made from targets (a paste, a drop) in one save. A target that is already in its
 * category is skipped and counted. They go loose into their category, or into the group `into`
 * for the ones that belong to that group's category. The view moves to the category of the first one, and
 * the feedback strip says what happened, with an undo.
 */
export async function addEntries(
  drafts: EntryDraft[],
  t: Translate,
  into: { tab: GroupTab; id: string } | null = null
): Promise<{ added: number; skipped: number }> {
  const store = useAppStore.getState()
  const data = store.data
  if (!data || drafts.length === 0) return { added: 0, skipped: 0 }

  // A category that is hidden in the settings takes nothing: the entry would be in no tab and in no
  // search, behind a message that says it was added.
  const shown = drafts.filter((draft) =>
    isTabVisible(draft.tab, data.prefs.hiddenTabs)
  )
  if (shown.length === 0) {
    store.showToast(t('drop_hidden'), 'info')
    return { added: 0, skipped: 0 }
  }
  drafts = shown

  const items: AddedItem[] = []
  let skipped = 0
  for (const draft of drafts) {
    const item = makeItem(draft)
    const repeated = items.some(
      (made) =>
        made.kind === item.kind &&
        comparableTarget(draft.tab, targetOf(made) ?? '') ===
          comparableTarget(draft.tab, targetOf(item) ?? '')
    )
    if (repeated || hasTarget(data, draft.tab, draft.target)) {
      skipped += 1
    } else {
      items.push(item)
    }
  }

  if (items.length === 0) {
    announceAdded(t, [], skipped)
    return { added: 0, skipped }
  }

  const tabOf = (item: AddedItem): GridTab =>
    item.kind === 'website'
      ? 'websites'
      : item.kind === 'app'
        ? 'apps'
        : 'folders'

  await store.updateData((draft) => {
    for (const item of items) {
      const tab = tabOf(item)
      const group =
        into?.tab === tab
          ? draft[tab].find((entry) => entry.id === into.id)
          : undefined
      const list = (group ? group.items : draft.loose[tab]) as AddedItem[]
      list.push(item)
    }
  })

  // A write that failed has been rolled back and reported: nothing was added.
  if (useAppStore.getState().error) return { added: 0, skipped }

  const first = tabOf(items[0]!)
  if (useAppStore.getState().currentTab !== first) {
    useAppStore.getState().setCurrentTab(first)
  }
  announceAdded(
    t,
    items.map((item) => ({ tab: tabOf(item), id: item.id, name: item.name })),
    skipped
  )

  return { added: items.length, skipped }
}

/** What was dropped or pasted: paths of things on this computer, and web addresses. */
export type TargetInput = { paths: string[]; urls: string[] }

function draftOf(entry: ClassifiedPath): EntryDraft {
  switch (entry.kind) {
    case 'website':
      return { tab: 'websites', target: entry.target }
    case 'app':
      return { tab: 'apps', target: entry.target }
    case 'file':
      return { tab: 'folders', target: entry.target, icon: FILE_ICON }
    default:
      return { tab: 'folders', target: entry.target }
  }
}

/**
 * Adds what was dropped or pasted: web addresses as they are, paths after the main process has
 * looked at what each one is. Quiet adds say nothing when there turns out to be nothing to add (a
 * paste of ordinary text); a drop always answers.
 */
export async function addFromTargets(
  input: TargetInput,
  t: Translate,
  options: {
    into?: { tab: GroupTab; id: string } | null
    quiet?: boolean
  } = {}
): Promise<void> {
  const store = useAppStore.getState()
  const drafts: EntryDraft[] = input.urls.map((url) => ({
    tab: 'websites',
    target: url,
  }))

  if (input.paths.length > 0) {
    try {
      const result = await window.quickLaunch.classifyPaths(input.paths)
      if (result.ok) {
        drafts.push(...result.data.map(draftOf))
      } else if (!options.quiet) {
        store.showToast(result.error, 'danger')
        return
      }
    } catch (error) {
      if (!options.quiet) {
        store.showToast(
          error instanceof Error ? error.message : String(error),
          'danger'
        )
        return
      }
    }
  }

  if (drafts.length === 0) {
    if (!options.quiet) store.showToast(t('drop_unsupported'), 'info')
    return
  }

  await addEntries(drafts, t, options.into ?? null)
}
