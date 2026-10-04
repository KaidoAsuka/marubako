import type { AcceleratorProblem } from './accelerator'

export const GROUP_TABS = [
  'folders',
  'websites',
  'apps',
  'passwords',
  'commands',
  'notes',
] as const

export const GRID_TABS = ['folders', 'websites', 'apps'] as const
export const ORDERED_GROUP_TABS = GROUP_TABS

export const ALL_TABS = [...GROUP_TABS, 'tasks'] as const

export const TASK_STATUSES = ['todo', 'doing', 'skip', 'done'] as const
export const LANGS = ['zh', 'en', 'ja'] as const
export const THEMES = ['dark', 'light'] as const
/**
 * What the theme setting can be: one of the two themes, or `system`, which follows the light or
 * dark mode of Windows and changes with it.
 */
export const THEME_SETTINGS = ['light', 'dark', 'system'] as const
export const BACKGROUNDS = [
  'aurora',
  'sunset',
  'forest',
  'ocean',
  'minimal',
  'monokai',
] as const
export const BROWSERS = ['default', 'edge', 'chrome'] as const
export const VIEW_MODES = ['grid', 'list'] as const
export const CODE_LANGUAGES = [
  'powershell',
  'bash',
  'batch',
  'python',
  'javascript',
  'typescript',
  'sql',
  'json',
  'yaml',
  'plaintext',
] as const
export type CodeLanguage = (typeof CODE_LANGUAGES)[number]

export type GroupTab = (typeof GROUP_TABS)[number]
export type GridTab = (typeof GRID_TABS)[number]
export type Tab = (typeof ALL_TABS)[number]
export const DEFAULT_STARTUP_TAB: Tab = ALL_TABS[0]
export type TaskStatus = (typeof TASK_STATUSES)[number]
export type Lang = (typeof LANGS)[number]
export type Theme = (typeof THEMES)[number]
export type ThemeSetting = (typeof THEME_SETTINGS)[number]
export type BackgroundKey = (typeof BACKGROUNDS)[number]
export type BrowserPreference = (typeof BROWSERS)[number]
export type ViewMode = (typeof VIEW_MODES)[number]

export interface WindowBounds {
  x: number
  y: number
  w: number
  h: number
}

export interface DockPosition {
  x: number
  y: number
}

export interface DockDrag {
  phase: 'start' | 'track' | 'move' | 'end'
  x: number
  y: number
  offset?: DockPosition
}

export type DockEdge = 'left' | 'right' | null

/** Who brought the panel up: the global shortcut, or anything else (ball, tray, a second launch). */
export type ActivateSource = 'hotkey' | 'other'

export interface WindowPresentation {
  stage: 'prepare' | 'shown' | 'animate' | 'reset'
  direction: 'expand' | 'collapse'
  surface: 'panel' | 'bubble'
  origin: DockPosition
  /** Multiplier for the animation durations; 1 matches the default motion preference. */
  timeScale: number
  stationary?: boolean
}

/**
 * The lowest panel opacity: below this the window is nearly invisible and the way back to the
 * settings is hard to find.
 */
export const MIN_OPACITY = 0.4

export const DEFAULT_PEEK_COLLAPSE_DELAY = 200
export const MAX_PEEK_COLLAPSE_DELAY = 2000

export interface Prefs {
  lang: Lang
  /** The theme the user chose; `system` is resolved to light or dark where it is drawn. */
  theme: ThemeSetting
  background: BackgroundKey
  browser: BrowserPreference
  zoom: number
  opacity: number
  motion: number
  peekCollapseDelay: number
  viewMode: ViewMode
  lastTab: Tab
  /**
   * Categories switched off in the settings (see shared/tabs.ts). Hiding only hides: the data stays,
   * and showing the category again brings it back. At least one category is always left visible.
   */
  hiddenTabs: Tab[]
  /**
   * The global shortcut that brings the panel up from any program: an accelerator such as
   * `CommandOrControl+Shift+Space` (shared/accelerator.ts). Always a valid one; the default when unset.
   */
  shortcut: string
  /** Whether that shortcut is registered. Off leaves the ball, the tray and the second launch. */
  shortcutEnabled: boolean
  hideAfterLaunch: boolean
  /**
   * Whether the floating ball exists. On (the default) it is permanent: collapsing, Esc, the
   * shortcut and "close to tray" all leave it on screen. Off sends all of those to the tray.
   */
  showBubble: boolean
}

/** All the ball's window is told about the user's data: how to dress itself. */
export interface DockAppearance {
  lang: Lang
  theme: Theme
}

export interface LaunchSettings {
  openAtLogin: boolean
  canAutoStart: boolean
  /** The configured shortcut as it reads to the user, e.g. `Ctrl + Shift + Space`. */
  shortcut: string
  /** True while that shortcut is registered and works. False when it is off or taken. */
  shortcutAvailable: boolean
  /** The configured shortcut as an accelerator; the default when the main process did not say. */
  shortcutAccelerator?: string
  /** Whether the user has the shortcut switched on; true when the main process did not say. */
  shortcutEnabled?: boolean
}

/** What trying a shortcut found out: whether it can be had now, or why not. */
export type ShortcutCheckResult =
  | { status: 'free' }
  | { status: 'current' }
  | { status: 'taken' }
  | { status: 'invalid'; problem: AcceleratorProblem }

export interface WindowState {
  bounds: WindowBounds | undefined
  dockPosition?: DockPosition
  dockEdge?: DockEdge
  opacity: number
  alwaysOnTop: boolean
  collapsed: boolean
  preCollapseHeight: number
  /** Set once the "still running in the tray" balloon has been shown. Main process only. */
  trayHintShown?: boolean
}

export interface BaseItem {
  id: string
  name: string
  icon: string
}

export interface FolderItem extends BaseItem {
  kind: 'folder'
  path: string
}

export interface WebsiteItem extends BaseItem {
  kind: 'website'
  url: string
}

export interface AppItem extends BaseItem {
  kind: 'app'
  path: string
}

export interface PasswordItem extends BaseItem {
  kind: 'password'
  username: string
  password: string
  note: string
  /** Runtime only, never persisted: the stored password could not be decrypted on this machine. */
  passwordLost?: boolean
}

export interface NoteItem extends BaseItem {
  kind: 'note'
  content: string
}

export interface CommandItem extends BaseItem {
  kind: 'command'
  content: string
  language: CodeLanguage
  description: string
}

export type GroupItemMap = {
  folders: FolderItem
  websites: WebsiteItem
  apps: AppItem
  passwords: PasswordItem
  notes: NoteItem
  commands: CommandItem
}

export type AnyGroupItem = GroupItemMap[GroupTab]
export type GridLooseItem = GroupItemMap[GridTab]

export interface Group<TItem extends AnyGroupItem> {
  id: string
  name: string
  icon: string
  open: boolean
  items: TItem[]
}

export type GroupCollections = {
  folders: Group<FolderItem>[]
  websites: Group<WebsiteItem>[]
  apps: Group<AppItem>[]
  passwords: Group<PasswordItem>[]
  notes: Group<NoteItem>[]
  commands: Group<CommandItem>[]
}

export type LooseCollections = {
  [K in GroupTab]: GroupItemMap[K][]
}

export interface TopEntry {
  type: 'group' | 'loose'
  id: string
}

export type TopOrderCollections = Record<GroupTab, TopEntry[]>

export interface Subtask {
  id: string
  name: string
  status: TaskStatus
}

export interface TaskItem {
  id: string
  name: string
  icon: string
  status: TaskStatus
  open: boolean
  subtasks: Subtask[]
}

export interface AppData extends GroupCollections {
  schemaVersion: 2
  prefs: Prefs
  window: WindowState
  loose: LooseCollections
  topOrder: TopOrderCollections
  tasks: Record<string, TaskItem[]>
}

export interface WindowSnapshot {
  opacity: number
  alwaysOnTop: boolean
  collapsed: boolean
  mode?: 'peek' | 'window'
}

export type SaveDataResult = {
  data: AppData
  savedAt: string
}

/**
 * Things the user must be told about after the data file was loaded. They stay in the main process
 * until dismissed, so a window opened later still sees them.
 */
export type StartupNotice =
  | {
      /** The data file could not be read and the user chose to start from default data. */
      kind: 'reset'
      reason: 'parse' | 'decrypt' | 'schema'
      recoveryPath: string
    }
  | {
      /** The data file could not be read and the user chose to restore an automatic backup. */
      kind: 'restored'
      backupPath: string
      backupDate: string
      recoveryPath: string
    }
  | {
      /** Some passwords could not be decrypted on this machine and must be typed again. */
      kind: 'passwordsLost'
      count: number
    }

export type StartupNoticeKind = StartupNotice['kind']

export interface DataStatus {
  /** Set while the last attempt to write to disk failed; cleared by the next successful write. */
  writeError: string | null
  notices: StartupNotice[]
}

export type ExportDataResult =
  | {
      canceled: true
    }
  | {
      canceled: false
      filePath: string
      exportedAt: string
      /** False when the user chose "without passwords": the file holds none. */
      passwordsIncluded: boolean
    }

export type ImportDataResult =
  | {
      canceled: true
    }
  | {
      canceled: false
      data: AppData
      filePath: string
      importedAt: string
    }

/**
 * Why opening an entry failed, in terms the window can turn into a sentence and a next step. A
 * failure without a code is one nobody has classified; the window then says it in general words.
 */
export const ERROR_CODES = [
  /** The folder or file is not there (moved, deleted, or its drive is not connected). */
  'path_missing',
  /** A part of the path is a file, not a folder. */
  'not_a_folder',
  /** The path is empty or not a path (illegal characters, too long). */
  'invalid_path',
  /** Windows refused access to it. */
  'no_permission',
  /** The program is not there (uninstalled, moved). */
  'app_missing',
  /** The address is not a valid http or https address. */
  'invalid_url',
  /** It exists, but the system could not open it (no program is associated with it). */
  'open_failed',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]
/** What a dropped or pasted path turned out to be (src/main/classify-paths.ts). */
export type ClassifiedPath =
  | { kind: 'folder' | 'app' | 'file'; target: string }
  /** An internet shortcut (.url): the target is the address inside it. */
  | { kind: 'website'; target: string }

/** What the settings dialog shows about the program itself. */
export interface AppInfo {
  version: string
}

/**
 * The answer to "check for updates". The window words each status in the user's language; the
 * technical reason for an error stays in the log.
 *  - disabled: nothing to ask (a development build, or an install without an update feed)
 *  - latest: this is the newest version; `version` is the running one
 *  - downloading: a newer version was found and is being downloaded
 *  - ready: a newer version is downloaded and is installed when the program quits
 *  - error: the check (or an earlier download) failed, typically offline
 */
export type UpdateCheckResult =
  | { status: 'disabled' }
  | { status: 'latest'; version: string }
  | { status: 'downloading'; version: string }
  | { status: 'ready'; version: string }
  | { status: 'error' }

export type QuickLaunchResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      /** The technical text, for the log and the tooltip. Never shown as the message. */
      error: string
      /** Set where the failure is understood; the window words it in the user's language. */
      code?: ErrorCode
    }
