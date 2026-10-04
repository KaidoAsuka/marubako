import { visibleTabs } from '../../../shared/tabs'
import {
  GROUP_TABS,
  type AnyGroupItem,
  type AppData,
  type GroupTab,
  type Tab,
  type TaskItem,
} from '../../../shared/types'

export type SearchResult =
  | {
      key: string
      type: 'item'
      tab: GroupTab
      groupId: string | null
      groupName: string
      name: string
      icon: string
      detail: string
      item: AnyGroupItem
    }
  | {
      key: string
      type: 'group'
      tab: GroupTab
      groupId: string
      name: string
      icon: string
      detail: string
    }
  | {
      key: string
      type: 'task'
      tab: 'tasks'
      date: string
      name: string
      icon: string
      detail: string
      task: TaskItem
    }

function itemDetail(item: AnyGroupItem): string {
  switch (item.kind) {
    case 'folder':
    case 'app':
      return item.path
    case 'website':
      return item.url
    case 'password':
      return item.username
    case 'note':
      return item.content.replace(/\s+/g, ' ').slice(0, 120)
    case 'command':
      return `${item.language} · ${item.description || item.content.replace(/\s+/g, ' ').slice(0, 100)}`
  }
}

/** An entry the user used lately (opened, or copied from the search). */
export type RecentUse = { tab: GroupTab; id: string }

/** What the search knows about the situation it is opened in; none of it is needed to search. */
export interface SearchContext {
  /** The category in front. With an empty query and nothing used lately, its entries are listed. */
  currentTab?: Tab
  /** Entries used lately, newest first. With an empty query they are what is listed. */
  recent?: readonly RecentUse[]
}

/** What an empty query lists: entries used lately, the category in front, or just the first few. */
export type EmptyQueryKind = 'recent' | 'current' | 'all'

const EMPTY_QUERY_LIMIT = 8

type Candidate = { result: SearchResult; searchText: string }

function itemCandidate(
  tab: GroupTab,
  item: AnyGroupItem,
  groupId: string | null,
  groupName: string
): Candidate {
  const detail = itemDetail(item)
  const content =
    item.kind === 'note' || item.kind === 'command' ? item.content : ''

  return {
    result: {
      key: `${tab}:item:${item.id}`,
      type: 'item',
      tab,
      groupId,
      groupName,
      name: item.name,
      icon: item.icon,
      detail,
      item,
    },
    // A password is never part of what is searched: only its entry's name and username are.
    searchText: `${item.name} ${detail} ${groupName} ${content}`,
  }
}

function groupCandidate(
  tab: GroupTab,
  group: { id: string; name: string; icon: string; items: unknown[] }
): Candidate {
  return {
    result: {
      key: `${tab}:group:${group.id}`,
      type: 'group',
      tab,
      groupId: group.id,
      name: group.name,
      icon: group.icon,
      // The number is shown on the row; it is not something to search for ("2" is not a group).
      detail: `${group.items.length}`,
    },
    searchText: group.name,
  }
}

function taskCandidate(date: string, task: TaskItem): Candidate {
  return {
    result: {
      key: `tasks:${date}:${task.id}`,
      type: 'task',
      tab: 'tasks',
      date,
      name: task.name,
      icon: task.icon,
      detail: date,
      task,
    },
    searchText: `${task.name} ${date} ${task.subtasks
      .map((subtask) => subtask.name)
      .join(' ')}`,
  }
}

/** Every entry of the categories that are shown, in the order of the data: groups, then loose entries. */
function* candidates(
  data: AppData,
  options: { groups: boolean }
): Generator<Candidate> {
  const shown = new Set<string>(visibleTabs(data.prefs.hiddenTabs))
  for (const tab of GROUP_TABS) {
    // A hidden category is not in the index at all: none of its entries can come up.
    if (!shown.has(tab)) continue
    for (const group of data[tab]) {
      if (options.groups) yield groupCandidate(tab, group)
      for (const item of group.items as AnyGroupItem[])
        yield itemCandidate(tab, item, group.id, group.name)
    }
    for (const item of data.loose[tab] as AnyGroupItem[])
      yield itemCandidate(tab, item, null, '')
  }
  if (!shown.has('tasks')) return
  for (const [date, tasks] of Object.entries(data.tasks))
    for (const task of tasks) yield taskCandidate(date, task)
}

function findItem(data: AppData, tab: GroupTab, id: string): Candidate | null {
  for (const group of data[tab]) {
    const item = (group.items as AnyGroupItem[]).find(
      (entry) => entry.id === id
    )
    if (item) return itemCandidate(tab, item, group.id, group.name)
  }
  const loose = (data.loose[tab] as AnyGroupItem[]).find(
    (entry) => entry.id === id
  )

  return loose ? itemCandidate(tab, loose, null, '') : null
}

/**
 * What the search lists before anything is typed: the entries used lately (an entry that has been
 * deleted, or whose category is hidden, is skipped); without any, the first entries of the category
 * in front; without any of those, the first entries of everything.
 */
export function emptyQueryResults(
  data: AppData,
  context: SearchContext = {}
): { kind: EmptyQueryKind; results: SearchResult[] } {
  const shown = new Set<string>(visibleTabs(data.prefs.hiddenTabs))
  const recent: SearchResult[] = []
  for (const use of context.recent ?? []) {
    if (!shown.has(use.tab)) continue
    const found = findItem(data, use.tab, use.id)
    if (found && !recent.some((entry) => entry.key === found.result.key))
      recent.push(found.result)
    if (recent.length === EMPTY_QUERY_LIMIT) break
  }
  if (recent.length) return { kind: 'recent', results: recent }

  const everything = [...candidates(data, { groups: false })].filter(
    ({ result }) => !(result.type === 'task' && result.task.status === 'done')
  )
  const inFront = context.currentTab
    ? everything.filter(({ result }) => result.tab === context.currentTab)
    : []
  if (inFront.length) {
    return {
      kind: 'current',
      results: inFront.slice(0, EMPTY_QUERY_LIMIT).map(({ result }) => result),
    }
  }

  return {
    kind: 'all',
    results: everything.slice(0, EMPTY_QUERY_LIMIT).map(({ result }) => result),
  }
}

function tokenScore(name: string, token: string): number {
  if (name === token) return 3
  if (name.startsWith(token)) return 2

  return name.includes(token) ? 1 : 0
}

/**
 * Entries and groups matching every word of the query, best first. A word scores for the name it
 * is, starts or is part of; the words add up, and a name that is the whole query (or starts with it)
 * ranks above one that only contains its words. Equal scores keep the order of the data. An empty
 * query lists what `emptyQueryResults` says.
 */
export function searchEntries(
  data: AppData,
  query: string,
  limit = 60,
  context: SearchContext = {}
): SearchResult[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return emptyQueryResults(data, context).results

  const tokens = normalized.split(/\s+/).filter(Boolean)
  const results: Array<{ result: SearchResult; score: number; order: number }> =
    []
  let order = 0
  for (const { result, searchText } of candidates(data, { groups: true })) {
    const name = result.name.toLocaleLowerCase()
    const searchable = searchText.toLocaleLowerCase()
    if (tokens.some((token) => !searchable.includes(token))) continue
    const score =
      tokens.reduce((sum, token) => sum + tokenScore(name, token), 0) +
      (name === normalized ? 2 : name.startsWith(normalized) ? 1 : 0)
    results.push({ result, score, order: order++ })
  }

  return results
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ result }) => result)
}
