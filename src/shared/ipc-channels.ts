import type { ContextMenuItem, ContextMenuPoint } from './context-menu'
import type {
  AppData,
  AppInfo,
  BrowserPreference,
  ClassifiedPath,
  DataStatus,
  DockAppearance,
  DockDrag,
  ExportDataResult,
  ImportDataResult,
  LaunchSettings,
  QuickLaunchResult,
  SaveDataResult,
  ShortcutCheckResult,
  StartupNoticeKind,
  UpdateCheckResult,
  WindowSnapshot,
} from './types'

export const IPC_CHANNELS = {
  loadData: 'data-load',
  saveData: 'data-save',
  exportData: 'data-export',
  importData: 'data-import',
  hideWindow: 'window-hide',
  dismissAfterLaunch: 'window-dismiss-after-launch',
  closeWindow: 'window-close',
  togglePin: 'window-toggle-pin',
  collapseWindow: 'window-collapse',
  expandWindow: 'window-expand',
  setOpacity: 'window-set-opacity',
  previewOpacity: 'window-preview-opacity',
  getWindowState: 'window-get-state',
  openPath: 'system-open-path',
  openApp: 'system-open-app',
  openUrl: 'system-open-url',
  getFileIcon: 'system-get-file-icon',
  checkForUpdates: 'updater-check-now',
  installUpdate: 'updater-install-now',
  getAppInfo: 'app-get-info',
  openIssuesPage: 'app-open-issues',
  selectPath: 'system-select-path',
  getLaunchSettings: 'launch-get-settings',
  setOpenAtLogin: 'launch-set-login',
  checkShortcut: 'launch-check-shortcut',
  showContextMenu: 'menu-show-context',
  activateLauncher: 'launcher-activate',
  dragDock: 'window-drag-dock',
  activateDock: 'window-activate-dock',
  setPeekBlocked: 'window-peek-blocked',
  windowStateChanged: 'window-state-changed',
  dockAppearance: 'dock-appearance',
  getDockAppearance: 'dock-get-appearance',
  prepareWindowShow: 'window-prepare-show',
  windowFrameReady: 'window-frame-ready',
  getDataStatus: 'data-get-status',
  dataStatusChanged: 'data-status-changed',
  dismissDataNotice: 'data-dismiss-notice',
  retryDataSave: 'data-retry-save',
  classifyPaths: 'system-classify-paths',
} as const

export interface IpcChannelMap {
  'window-drag-dock': {
    args: [DockDrag]
    return: QuickLaunchResult<{ moved: boolean }>
  }
  'system-select-path': {
    args: ['folder' | 'app']
    return: QuickLaunchResult<string | null>
  }
  'launch-get-settings': {
    args: []
    return: QuickLaunchResult<LaunchSettings>
  }
  'launch-set-login': {
    args: [boolean]
    return: QuickLaunchResult<LaunchSettings>
  }
  'dock-get-appearance': {
    args: []
    return: QuickLaunchResult<DockAppearance>
  }
  'menu-show-context': {
    args: [ContextMenuItem[], ContextMenuPoint | undefined]
    return: QuickLaunchResult<string | null>
  }
  'launch-check-shortcut': {
    args: [string]
    return: QuickLaunchResult<ShortcutCheckResult>
  }
  'data-load': {
    args: []
    return: QuickLaunchResult<AppData>
  }
  'data-save': {
    args: [AppData]
    return: QuickLaunchResult<SaveDataResult>
  }
  'data-get-status': {
    args: []
    return: QuickLaunchResult<DataStatus>
  }
  'data-dismiss-notice': {
    args: [StartupNoticeKind]
    return: QuickLaunchResult<DataStatus>
  }
  'data-retry-save': {
    args: []
    return: QuickLaunchResult<DataStatus>
  }
  'data-export': {
    args: [AppData]
    return: QuickLaunchResult<ExportDataResult>
  }
  'data-import': {
    args: []
    return: QuickLaunchResult<ImportDataResult>
  }
  'window-hide': {
    args: []
    return: QuickLaunchResult<void>
  }
  'window-dismiss-after-launch': {
    args: []
    return: QuickLaunchResult<void>
  }
  'window-close': {
    args: []
    return: QuickLaunchResult<void>
  }
  'window-toggle-pin': {
    args: []
    return: QuickLaunchResult<WindowSnapshot>
  }
  'window-collapse': {
    args: []
    return: QuickLaunchResult<WindowSnapshot>
  }
  'window-expand': {
    args: []
    return: QuickLaunchResult<WindowSnapshot>
  }
  'window-set-opacity': {
    args: [number]
    return: QuickLaunchResult<WindowSnapshot>
  }
  'window-preview-opacity': {
    args: [number | null]
    return: QuickLaunchResult<void>
  }
  'window-get-state': {
    args: []
    return: QuickLaunchResult<WindowSnapshot>
  }
  'system-open-path': {
    args: [string]
    return: QuickLaunchResult<string>
  }
  'system-open-app': {
    args: [string]
    return: QuickLaunchResult<string>
  }
  'system-open-url': {
    args: [string, BrowserPreference]
    return: QuickLaunchResult<void>
  }
  'system-get-file-icon': {
    args: [string]
    return: QuickLaunchResult<string | null>
  }
  'updater-check-now': {
    args: []
    return: QuickLaunchResult<UpdateCheckResult>
  }
  'updater-install-now': {
    args: []
    return: QuickLaunchResult<void>
  }
  'app-get-info': {
    args: []
    return: QuickLaunchResult<AppInfo>
  }
  'app-open-issues': {
    args: []
    return: QuickLaunchResult<void>
  }
  'system-classify-paths': {
    args: [string[]]
    return: QuickLaunchResult<ClassifiedPath[]>
  }
}
