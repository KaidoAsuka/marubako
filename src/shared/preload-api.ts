import type { ContextMenuItem, ContextMenuPoint } from './context-menu'
import type {
  ActivateSource,
  AppData,
  AppInfo,
  BrowserPreference,
  ClassifiedPath,
  DataStatus,
  DockAppearance,
  DockDrag,
  StartupNoticeKind,
  UpdateCheckResult,
  ExportDataResult,
  ExportFormat,
  ImportDataResult,
  LaunchSettings,
  QuickLaunchResult,
  SaveDataResult,
  ShortcutCheckResult,
  WindowSnapshot,
  WindowPresentation,
} from './types'

export interface QuickLaunchApi {
  loadData: () => Promise<QuickLaunchResult<AppData>>
  saveData: (data: AppData) => Promise<QuickLaunchResult<SaveDataResult>>
  exportData: (
    data: AppData,
    format?: ExportFormat
  ) => Promise<QuickLaunchResult<ExportDataResult>>
  importData: () => Promise<QuickLaunchResult<ImportDataResult>>
  getDataStatus: () => Promise<QuickLaunchResult<DataStatus>>
  dismissDataNotice: (
    kind: StartupNoticeKind
  ) => Promise<QuickLaunchResult<DataStatus>>
  retryDataSave: () => Promise<QuickLaunchResult<DataStatus>>
  onDataStatus: (callback: (status: DataStatus) => void) => () => void
  openPath: (targetPath: string) => Promise<QuickLaunchResult<string>>
  openApp: (targetPath: string) => Promise<QuickLaunchResult<string>>
  openUrl: (
    url: string,
    browser: BrowserPreference
  ) => Promise<QuickLaunchResult<void>>
  getFileIcon: (targetPath: string) => Promise<QuickLaunchResult<string | null>>
  /** Asks the update feed now. The answer says what was found; an error is a result, not a throw. */
  checkForUpdates: () => Promise<QuickLaunchResult<UpdateCheckResult>>
  /** Writes pending data, then quits and installs the downloaded update. */
  installUpdate: () => Promise<QuickLaunchResult<void>>
  getAppInfo: () => Promise<QuickLaunchResult<AppInfo>>
  /** Opens the project's issue page in the browser the user chose. */
  openIssuesPage: () => Promise<QuickLaunchResult<void>>
  /** Opens the page of the newest release, where a portable copy is downloaded by hand. */
  openReleasesPage: () => Promise<QuickLaunchResult<void>>
  /**
   * The path on disk of each dropped or pasted file (File objects; the type is loose because the
   * main and preload projects have no DOM types). Files with no path (an image from a web page)
   * are left out.
   */
  getDroppedPaths: (files: readonly object[]) => string[]
  /** What each path is: a folder, a program, an internet shortcut or another file. */
  classifyPaths: (
    paths: string[]
  ) => Promise<QuickLaunchResult<ClassifiedPath[]>>
  selectPath: (
    kind: 'folder' | 'app'
  ) => Promise<QuickLaunchResult<string | null>>
  getLaunchSettings: () => Promise<QuickLaunchResult<LaunchSettings>>
  setOpenAtLogin: (
    enabled: boolean
  ) => Promise<QuickLaunchResult<LaunchSettings>>
  /**
   * Pops a native menu up over the panel and answers with the id of the item chosen, or null when it
   * was dismissed. Without a point it opens at the mouse pointer.
   */
  showContextMenu: (
    items: ContextMenuItem[],
    point?: ContextMenuPoint
  ) => Promise<QuickLaunchResult<string | null>>
  /** Whether a shortcut can be had right now (it is tried and released), or why not. */
  checkShortcut: (
    accelerator: string
  ) => Promise<QuickLaunchResult<ShortcutCheckResult>>
  onActivate: (callback: (source?: ActivateSource) => void) => () => void
  onPrepareShow: (
    callback: (presentation: WindowPresentation) => Promise<void>
  ) => () => void
  /**
   * The ball's own channel for its language and theme. Only the ball's window may use it, and it
   * is all the ball can learn: the data channels above answer the panel alone.
   */
  getDockAppearance: () => Promise<QuickLaunchResult<DockAppearance>>
  onDockAppearance: (
    callback: (appearance: DockAppearance) => void
  ) => () => void
  onWindowState: (callback: (state: WindowSnapshot) => void) => () => void
  window: {
    activateDock: (
      mode: 'peek' | 'window'
    ) => Promise<QuickLaunchResult<WindowSnapshot>>
    setPeekBlocked: (
      blocked: boolean,
      keyboard: boolean
    ) => Promise<QuickLaunchResult<void>>
    dragDock: (drag: DockDrag) => Promise<QuickLaunchResult<{ moved: boolean }>>
    hide: () => Promise<QuickLaunchResult<void>>
    dismissAfterLaunch: () => Promise<QuickLaunchResult<void>>
    close: () => Promise<QuickLaunchResult<void>>
    togglePin: () => Promise<QuickLaunchResult<WindowSnapshot>>
    collapse: () => Promise<QuickLaunchResult<WindowSnapshot>>
    expand: () => Promise<QuickLaunchResult<WindowSnapshot>>
    setOpacity: (opacity: number) => Promise<QuickLaunchResult<WindowSnapshot>>
    /** Shows an opacity on the panel without saving it; `null` goes back to the saved one. */
    previewOpacity: (opacity: number | null) => Promise<QuickLaunchResult<void>>
    getState: () => Promise<QuickLaunchResult<WindowSnapshot>>
  }
}
