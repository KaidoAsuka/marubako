import type {
  BrowserPreference,
  GroupItemMap,
  GroupTab,
} from '../../../shared/types'
import { resolveLang } from '../i18n/resolve-lang'
import { useAppStore } from '../store/use-app-store'
import { describeOpenFailure, openEditLabel } from './open-errors'
import { recordUse } from './recent'

/**
 * How long the message about an entry that would not open stays. It names a thing to repair and
 * carries a button, so it has to outlast a glance (the strip pauses it while the pointer is on it).
 */
export const OPEN_FAILURE_MS = 12_000

/** Opens the entry's form with the cursor in the field that holds the broken path or address. */
function editBrokenEntry(
  tab: GroupTab,
  groupId: string | null,
  itemId: string
): void {
  const store = useAppStore.getState()
  const data = store.data
  if (!data) return
  // The entry may have been deleted, or moved, while the message was showing.
  const stillThere =
    groupId === null
      ? data.loose[tab].some((entry) => entry.id === itemId)
      : (data[tab]
          .find((group) => group.id === groupId)
          ?.items.some((entry) => entry.id === itemId) ?? false)
  if (!stillThere) return

  // From the search palette the form must not open underneath it.
  store.setCommandOpen(false)
  store.setModal({
    kind: 'item',
    tab,
    groupId,
    itemId,
    focus: tab === 'websites' ? 'url' : 'path',
  })
}

function reportOpenFailure<K extends GroupTab>(
  tab: K,
  item: GroupItemMap[K],
  groupId: string | null,
  code: Parameters<typeof describeOpenFailure>[0]
): void {
  const store = useAppStore.getState()
  const lang = resolveLang(store.data?.prefs.lang)
  store.showToast(describeOpenFailure(code, item.name, lang), 'danger', {
    action: {
      label: openEditLabel(lang),
      run: () => editBrokenEntry(tab, groupId, item.id),
    },
    duration: OPEN_FAILURE_MS,
  })
}

/**
 * Opens a folder, a program or a website. When that fails the strip says, in the window's language,
 * which entry and what is wrong with it, and offers "Edit" to repair it on the spot. `groupId` is
 * where the entry lives (null for a loose one), so the button can open the right form.
 */
export async function openEntry<K extends GroupTab>(
  tab: K,
  item: GroupItemMap[K],
  browser: BrowserPreference,
  groupId: string | null
): Promise<boolean> {
  try {
    const result =
      tab === 'folders'
        ? await window.quickLaunch.openPath(
            (item as GroupItemMap['folders']).path
          )
        : tab === 'apps'
          ? await window.quickLaunch.openApp(
              (item as GroupItemMap['apps']).path
            )
          : tab === 'websites'
            ? await window.quickLaunch.openUrl(
                (item as GroupItemMap['websites']).url,
                browser
              )
            : null
    if (!result) return false
    if (!result.ok) {
      // The raw text is English and technical: it stays in the main process's log.
      console.warn('Could not open the entry', item.id, result.error)
      reportOpenFailure(tab, item, groupId, result.code)
      return false
    }
    // The search lists what was used lately before anything is typed.
    recordUse(tab, item.id)
    const store = useAppStore.getState()
    if (store.data?.prefs.hideAfterLaunch) await store.dismissAfterLaunch()
    return true
  } catch (error) {
    console.warn('Could not open the entry', item.id, error)
    reportOpenFailure(tab, item, groupId, undefined)
    return false
  }
}
