import { randomUUID } from 'node:crypto'

import { createDefaultAppData } from '../shared/default-data'
import {
  DEFAULT_GROUP_ICONS,
  DEFAULT_ITEM_ICONS,
  DEFAULT_TASK_ICON,
} from '../shared/default-icons'
import {
  ALL_TABS,
  BACKGROUNDS,
  BROWSERS,
  CODE_LANGUAGES,
  LANGS,
  MAX_PEEK_COLLAPSE_DELAY,
  TASK_STATUSES,
  THEMES,
  VIEW_MODES,
  type CodeLanguage,
} from '../shared/types'
import type {
  AnyGroupItem,
  AppData,
  Group,
  GroupCollections,
  GroupItemMap,
  GroupTab,
  LooseCollections,
  Prefs,
  TaskItem,
  TaskStatus,
  TopEntry,
  TopOrderCollections,
} from '../shared/types'
import { normalizeAccelerator } from '../shared/accelerator'
import { normalizeHiddenTabs, resolveVisibleTab } from '../shared/tabs'
import {
  clampOpacity,
  normalizeWindowState,
  type LegacyWindowState,
} from './window-state'

export const CURRENT_SCHEMA_VERSION = 2

/** The data comes from a newer version of the app than this one. */
export class UnsupportedSchemaError extends Error {
  readonly version: number

  constructor(version: number) {
    super(`Data schema version ${version} is newer than this app supports`)
    this.name = 'UnsupportedSchemaError'
    this.version = version
  }
}

/** The file is valid JSON but does not look like Marubako data. */
export class InvalidBackupError extends Error {
  constructor() {
    super('This is not a Marubako data file')
    this.name = 'InvalidBackupError'
  }
}

export interface NormalizeContext {
  /** Decrypts a stored password; throws when this computer cannot. */
  decryptPassword?: (ciphertext: string) => string
  /** Called for every stored password that could not be decrypted, with its raw ciphertext. */
  onPasswordLost?: (itemId: string, ciphertext: string) => void
}

type Source = Record<string, unknown>

function isRecord(value: unknown): value is Source {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function pickEnum<T extends string>(
  list: readonly T[],
  value: unknown,
  fallback: T
): T {
  return list.includes(value as T) ? (value as T) : fallback
}

function clampMotion(value: unknown, fallback: number): number {
  const number =
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(2.2, Math.max(0.75, number))
}

function normalizePrefs(
  input: unknown,
  legacyWindow: LegacyWindowState | undefined,
  fallback: Prefs
): Prefs {
  const prefs: Partial<Record<keyof Prefs, unknown>> = isRecord(input)
    ? input
    : {}
  const hiddenTabs = normalizeHiddenTabs(prefs.hiddenTabs)

  return {
    lang: pickEnum(LANGS, prefs.lang, fallback.lang),
    theme: pickEnum(THEMES, prefs.theme, fallback.theme),
    background: pickEnum(BACKGROUNDS, prefs.background, fallback.background),
    browser: pickEnum(BROWSERS, prefs.browser, fallback.browser),
    zoom:
      typeof prefs.zoom === 'number' && Number.isFinite(prefs.zoom)
        ? Math.min(1.4, Math.max(0.8, prefs.zoom))
        : fallback.zoom,
    opacity: clampOpacity(prefs.opacity, clampOpacity(legacyWindow?.opacity)),
    motion: clampMotion(prefs.motion, fallback.motion),
    peekCollapseDelay:
      typeof prefs.peekCollapseDelay === 'number' &&
      Number.isFinite(prefs.peekCollapseDelay)
        ? Math.round(
            Math.min(
              MAX_PEEK_COLLAPSE_DELAY,
              Math.max(0, prefs.peekCollapseDelay)
            )
          )
        : fallback.peekCollapseDelay,
    viewMode: pickEnum(VIEW_MODES, prefs.viewMode, fallback.viewMode),
    // A last tab that is hidden would open on a page the tab row does not show.
    lastTab: resolveVisibleTab(
      pickEnum(ALL_TABS, prefs.lastTab, fallback.lastTab),
      hiddenTabs
    ),
    hiddenTabs,
    // Anything that is not an acceptable launch shortcut goes back to the default one.
    shortcut: normalizeAccelerator(prefs.shortcut) ?? fallback.shortcut,
    shortcutEnabled:
      typeof prefs.shortcutEnabled === 'boolean'
        ? prefs.shortcutEnabled
        : fallback.shortcutEnabled,
    hideAfterLaunch:
      typeof prefs.hideAfterLaunch === 'boolean'
        ? prefs.hideAfterLaunch
        : fallback.hideAfterLaunch,
    showBubble:
      typeof prefs.showBubble === 'boolean'
        ? prefs.showBubble
        : fallback.showBubble,
  }
}

function normalizeTaskStatus(status: unknown): TaskStatus {
  return TASK_STATUSES.includes(status as TaskStatus)
    ? (status as TaskStatus)
    : 'todo'
}

function ensureId(id: unknown, prefix: string): string {
  return typeof id === 'string' && id.trim() ? id : `${prefix}-${randomUUID()}`
}

function normalizeTopEntry(entry: unknown): TopEntry | null {
  if (!isRecord(entry)) {
    return null
  }

  if (
    (entry.type === 'group' || entry.type === 'loose') &&
    typeof entry.id === 'string' &&
    entry.id
  ) {
    return { type: entry.type, id: entry.id }
  }

  return null
}

/** Files written by this app wrap the data in `{ version, data }`; plain exports do not. */
export function unwrapPersistedData(raw: unknown): unknown {
  if (isRecord(raw) && 'version' in raw && isRecord(raw.data)) {
    return raw.data
  }

  return raw
}

function readPassword(
  item: Partial<Record<string, unknown>> | undefined,
  id: string,
  context: NormalizeContext
): string {
  if (typeof item?.password === 'string') {
    return item.password
  }

  const ciphertext = item?.passwordCiphertext
  if (typeof ciphertext !== 'string' || !ciphertext) {
    return ''
  }

  try {
    if (!context.decryptPassword) throw new Error('No decryptor available')
    return context.decryptPassword(ciphertext)
  } catch {
    context.onPasswordLost?.(id, ciphertext)
    return ''
  }
}

function normalizeBaseItem<TItem extends AnyGroupItem>(
  item: unknown,
  kind: TItem['kind'],
  prefix: string,
  fallbackIcon: string,
  context: NormalizeContext
): TItem {
  const fields: Partial<Record<string, unknown>> = isRecord(item) ? item : {}
  const id = ensureId(fields.id, prefix)
  const text = (key: string): string =>
    typeof fields[key] === 'string' ? (fields[key] as string) : ''

  return {
    id,
    kind,
    name:
      typeof fields.name === 'string' && fields.name.trim() ? fields.name : '',
    icon:
      typeof fields.icon === 'string' && fields.icon.trim()
        ? fields.icon
        : fallbackIcon,
    ...(kind === 'folder' || kind === 'app'
      ? { path: text('path') }
      : kind === 'website'
        ? { url: text('url') }
        : kind === 'password'
          ? {
              username: text('username'),
              password: readPassword(fields, id, context),
              note: text('note'),
            }
          : {
              content: text('content'),
              ...(kind === 'command'
                ? {
                    language: CODE_LANGUAGES.includes(
                      fields.language as CodeLanguage
                    )
                      ? fields.language
                      : 'powershell',
                    description: text('description'),
                  }
                : {}),
            }),
  } as TItem
}

function normalizeGroupItem<K extends GroupTab>(
  tab: K,
  item: unknown,
  context: NormalizeContext
): GroupItemMap[K] {
  switch (tab) {
    case 'folders':
      return normalizeBaseItem(
        item,
        'folder',
        'folder',
        DEFAULT_ITEM_ICONS.folders,
        context
      )
    case 'websites':
      return normalizeBaseItem(
        item,
        'website',
        'site',
        DEFAULT_ITEM_ICONS.websites,
        context
      )
    case 'apps':
      return normalizeBaseItem(
        item,
        'app',
        'app',
        DEFAULT_ITEM_ICONS.apps,
        context
      )
    case 'passwords':
      return normalizeBaseItem(
        item,
        'password',
        'password',
        DEFAULT_ITEM_ICONS.passwords,
        context
      )
    case 'notes':
      return normalizeBaseItem(
        item,
        'note',
        'note',
        DEFAULT_ITEM_ICONS.notes,
        context
      )
    case 'commands':
      return normalizeBaseItem(
        item,
        'command',
        'command',
        DEFAULT_ITEM_ICONS.commands,
        context
      )
  }
}

function normalizeGroup<K extends GroupTab>(
  tab: K,
  group: unknown,
  context: NormalizeContext
): Group<GroupItemMap[K]> {
  const fields: Source = isRecord(group) ? group : {}

  return {
    id: ensureId(fields.id, `${tab}-group`),
    name:
      typeof fields.name === 'string' && fields.name.trim() ? fields.name : '',
    icon:
      typeof fields.icon === 'string' && fields.icon.trim()
        ? fields.icon
        : DEFAULT_GROUP_ICONS[tab],
    open: typeof fields.open === 'boolean' ? fields.open : true,
    items: asArray(fields.items).map((item) =>
      normalizeGroupItem(tab, item, context)
    ),
  }
}

function normalizeGroups(
  raw: Source,
  context: NormalizeContext
): GroupCollections {
  return {
    folders: asArray(raw.folders).map((group) =>
      normalizeGroup('folders', group, context)
    ),
    websites: asArray(raw.websites).map((group) =>
      normalizeGroup('websites', group, context)
    ),
    apps: asArray(raw.apps).map((group) =>
      normalizeGroup('apps', group, context)
    ),
    passwords: asArray(raw.passwords).map((group) =>
      normalizeGroup('passwords', group, context)
    ),
    notes: asArray(raw.notes).map((group) =>
      normalizeGroup('notes', group, context)
    ),
    commands: asArray(raw.commands).map((group) =>
      normalizeGroup('commands', group, context)
    ),
  }
}

function normalizeLoose(
  raw: unknown,
  context: NormalizeContext
): LooseCollections {
  const loose: Source = isRecord(raw) ? raw : {}

  return {
    folders: asArray(loose.folders).map((item) =>
      normalizeGroupItem('folders', item, context)
    ),
    websites: asArray(loose.websites).map((item) =>
      normalizeGroupItem('websites', item, context)
    ),
    apps: asArray(loose.apps).map((item) =>
      normalizeGroupItem('apps', item, context)
    ),
    passwords: asArray(loose.passwords).map((item) =>
      normalizeGroupItem('passwords', item, context)
    ),
    notes: asArray(loose.notes).map((item) =>
      normalizeGroupItem('notes', item, context)
    ),
    commands: asArray(loose.commands).map((item) =>
      normalizeGroupItem('commands', item, context)
    ),
  }
}

function normalizeTopOrder(
  raw: unknown,
  groups: GroupCollections,
  loose: LooseCollections
): TopOrderCollections {
  const order: Source = isRecord(raw) ? raw : {}
  const buildEntries = (tab: GroupTab): TopEntry[] => {
    const groupIds = new Set(groups[tab].map((group) => group.id))
    const looseIds = new Set(loose[tab].map((item) => item.id))
    const seen = new Set<string>()
    const next: TopEntry[] = []

    for (const entry of asArray(order[tab])) {
      const normalized = normalizeTopEntry(entry)
      if (!normalized) {
        continue
      }

      const key = `${normalized.type}:${normalized.id}`
      if (seen.has(key)) {
        continue
      }

      if (normalized.type === 'group' && groupIds.has(normalized.id)) {
        next.push(normalized)
        seen.add(key)
      }

      if (normalized.type === 'loose' && looseIds.has(normalized.id)) {
        next.push(normalized)
        seen.add(key)
      }
    }

    for (const group of groups[tab]) {
      const key = `group:${group.id}`
      if (!seen.has(key)) {
        next.push({ type: 'group', id: group.id })
      }
    }

    for (const item of loose[tab]) {
      const key = `loose:${item.id}`
      if (!seen.has(key)) {
        next.push({ type: 'loose', id: item.id })
      }
    }

    return next
  }

  return {
    folders: buildEntries('folders'),
    websites: buildEntries('websites'),
    apps: buildEntries('apps'),
    passwords: buildEntries('passwords'),
    notes: buildEntries('notes'),
    commands: buildEntries('commands'),
  }
}

function normalizeTask(task: unknown): TaskItem {
  const fields: Source = isRecord(task) ? task : {}

  return {
    id: ensureId(fields.id, 'task'),
    name:
      typeof fields.name === 'string' && fields.name.trim() ? fields.name : '',
    icon:
      typeof fields.icon === 'string' && fields.icon.trim()
        ? fields.icon
        : DEFAULT_TASK_ICON,
    status: normalizeTaskStatus(fields.status),
    open: typeof fields.open === 'boolean' ? fields.open : true,
    subtasks: asArray(fields.subtasks).map((subtask) => {
      const sub: Source = isRecord(subtask) ? subtask : {}
      return {
        id: ensureId(sub.id, 'subtask'),
        name: typeof sub.name === 'string' && sub.name.trim() ? sub.name : '',
        status: normalizeTaskStatus(sub.status),
      }
    }),
  }
}

function normalizeTasks(raw: unknown): Record<string, TaskItem[]> {
  if (!isRecord(raw)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(raw).map(([date, tasks]) => [
      date,
      asArray(tasks).map((task) => normalizeTask(task)),
    ])
  )
}

export function normalizeAppData(
  raw: unknown,
  context: NormalizeContext = {}
): AppData {
  const fallback = createDefaultAppData()
  const source = unwrapPersistedData(raw)

  if (!isRecord(source)) {
    return fallback
  }

  if (
    typeof source.schemaVersion === 'number' &&
    source.schemaVersion > CURRENT_SCHEMA_VERSION
  ) {
    throw new UnsupportedSchemaError(source.schemaVersion)
  }

  const legacyWindow = isRecord(source.window)
    ? (source.window as LegacyWindowState)
    : undefined
  const groups = normalizeGroups(source, context)
  const loose = normalizeLoose(source.loose, context)
  const topOrder = normalizeTopOrder(source.topOrder, groups, loose)
  const prefs = normalizePrefs(source.prefs, legacyWindow, fallback.prefs)

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    prefs,
    window: normalizeWindowState(legacyWindow, prefs.opacity),
    ...groups,
    loose,
    topOrder,
    tasks: normalizeTasks(source.tasks),
  }
}

const COLLECTION_KEYS = [
  'folders',
  'websites',
  'apps',
  'passwords',
  'notes',
  'commands',
] as const
const OBJECT_KEYS = ['prefs', 'loose', 'topOrder', 'tasks'] as const

/**
 * Rejects JSON that is not Marubako data, so that importing the wrong file cannot replace the
 * user's data with an empty one. Call it on the data after unwrapping, before normalizing.
 */
export function assertLooksLikeAppData(source: unknown): void {
  if (!isRecord(source)) {
    throw new InvalidBackupError()
  }

  for (const key of COLLECTION_KEYS) {
    if (key in source && !Array.isArray(source[key])) {
      throw new InvalidBackupError()
    }
  }
  for (const key of OBJECT_KEYS) {
    if (key in source && !isRecord(source[key])) {
      throw new InvalidBackupError()
    }
  }

  // A real file carries all of these keys. Requiring two keeps a foreign JSON file that happens to
  // have a generic `notes` or `tasks` key (or just a version number) from replacing the user's data.
  const markers = [...COLLECTION_KEYS, ...OBJECT_KEYS].filter(
    (key) => key in source
  )
  if (markers.length < 2) {
    throw new InvalidBackupError()
  }
}

export function hasWindowState(source: unknown): boolean {
  const data = unwrapPersistedData(source)
  return isRecord(data) && isRecord(data.window)
}
