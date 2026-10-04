import type { AppData, Tab } from '../../../shared/types'

/** What a category holds: groups and entries for the collections, open tasks for the task page. */
export type TabCounts =
  | { kind: 'collection'; groups: number; items: number }
  | { kind: 'tasks'; open: number }

export function countTab(data: AppData, tab: Tab): TabCounts {
  if (tab === 'tasks') {
    return {
      kind: 'tasks',
      open: Object.values(data.tasks)
        .flat()
        .filter((task) => task.status !== 'done' && task.status !== 'skip')
        .length,
    }
  }

  return {
    kind: 'collection',
    groups: data[tab].length,
    items: data[tab].reduce(
      (count, group) => count + group.items.length,
      data.loose[tab].length
    ),
  }
}

/** Replaces `{name}` placeholders, so a translation keeps its own word order. */
export function fillTemplate(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  )
}

/**
 * The tooltip and accessible name of a category button, for example "Folders · 2 groups, 5 items ·
 * Alt+1". The counts no longer sit on the tab itself, so they live here.
 */
export function describeTab(
  t: (key: string) => string,
  data: AppData | null,
  tab: Tab,
  index: number
): string {
  const name = t(`tab_${tab}`)
  const shortcut = index + 1
  const counts = data ? countTab(data, tab) : null

  if (counts?.kind === 'tasks') {
    return fillTemplate(t('tab_summary_tasks'), {
      name,
      open: counts.open,
      n: shortcut,
    })
  }
  if (counts) {
    return fillTemplate(t('tab_summary'), {
      name,
      groups: counts.groups,
      items: counts.items,
      n: shortcut,
    })
  }

  return `${name} · Alt+${shortcut}`
}
