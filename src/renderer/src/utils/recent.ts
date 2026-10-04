import { GROUP_TABS, type GroupTab } from '../../../shared/types'
import type { RecentUse } from './search'

// What the search shows before anything is typed. It lives in this window's own storage: a
// convenience of this computer, not data worth saving with the entries, and it can be lost without
// harm (storage may be blocked or cleared; every access is guarded).
const STORAGE_KEY = 'recent-opens-v1'
const MAX_RECENT = 12

function isRecentUse(value: unknown): value is RecentUse {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as { tab?: unknown; id?: unknown }

  return (
    typeof entry.id === 'string' &&
    entry.id !== '' &&
    (GROUP_TABS as readonly unknown[]).includes(entry.tab)
  )
}

/** The entries used lately, newest first (empty when there are none or storage cannot be read). */
export function readRecent(): RecentUse[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []

    return Array.isArray(parsed)
      ? parsed.filter(isRecentUse).map(({ tab, id }) => ({ tab, id }))
      : []
  } catch {
    return []
  }
}

/** Notes that an entry was just used: it goes to the front, once, and the list stays short. */
export function recordUse(tab: GroupTab, id: string): void {
  if (!id) return
  try {
    const next = [
      { tab, id },
      ...readRecent().filter((entry) => entry.id !== id || entry.tab !== tab),
    ].slice(0, MAX_RECENT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Not remembered; nothing else depends on it.
  }
}
