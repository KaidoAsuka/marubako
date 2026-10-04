import path from 'node:path'

import {
  app,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron'

import log from 'electron-log/main'

import { validateContextMenu, validateMenuPoint } from '../shared/context-menu'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  AppData,
  DockDrag,
  Prefs,
  QuickLaunchResult,
  StartupNoticeKind,
} from '../shared/types'
import { AppError } from './app-error'
import { checkForUpdatesNow, installDownloadedUpdate } from './auto-updater'
import { classifyPaths } from './classify-paths'
import { ISSUES_URL } from './config'
import { showContextMenu } from './context-menu'
import {
  describeImportError,
  promptExportPasswords,
  promptImportConfirm,
} from './data-prompts'
import {
  applyLaunchShortcut,
  checkLaunchShortcut,
  getLaunchSettings,
  retryLaunchShortcut,
  setOpenAtLogin,
} from './launch-settings'
import { mainText } from './main-strings'
import { resolveThemeSetting } from './system-theme'
import { getFileIcon, openApp, openPath, openUrl } from './browser'
import {
  dismissNotice,
  exportAppDataFile,
  getDataStatus,
  flushPendingWrite,
  hasStoredPasswords,
  importAppData,
  loadAppData,
  normalizeAppData,
  onDataStatusChange,
  readImportSummary,
  retryDataSave,
  saveAppData,
} from './data-store'
import { refreshTrayMenu } from './tray'
import {
  closeWindow,
  acknowledgeWindowFrame,
  applyBubblePreference,
  collapseWindow,
  activateDock,
  dismissAfterLaunch,
  setPeekBlocked,
  dragDock,
  expandWindow,
  getDockWindow,
  getWindowSnapshot,
  hideWindow,
  keepTabNamesVisible,
  previewPanelOpacity,
  setWindowOpacity,
  togglePin,
} from './window-manager'
import { getMainWindow } from './window-manager'

const NOTICE_KINDS: StartupNoticeKind[] = ['reset', 'restored', 'passwordsLost']

/** The language changed: the tray menu is rebuilt in the background, a failure is only logged. */
function refreshMenusSoon(): void {
  void refreshTrayMenu().catch((error) =>
    log.warn('Could not refresh the tray menu', error)
  )
}

/** Widening the panel for the tab names is a nicety: it never turns a save into a failure. */
async function keepTabNamesVisibleSafely(
  before: Prefs,
  after: Prefs
): Promise<void> {
  try {
    await keepTabNamesVisible(before, after)
  } catch (error) {
    log.warn('Could not widen the panel for the category names', error)
  }
}

function toResult<T>(value: T): QuickLaunchResult<T> {
  return {
    ok: true,
    data: value,
  }
}

/**
 * The user's data, passwords included, is for the panel alone. The ball's page shares the panel's
 * preload and so can call every channel; each channel that reads, changes or exports the data
 * therefore checks who is asking. The ball gets its own small channel for what it needs.
 */
function assertFromMainWindow(event: IpcMainInvokeEvent): void {
  if (event.sender !== getMainWindow()?.webContents)
    throw new Error('Invalid data request')
}

function toError(error: unknown): QuickLaunchResult<never> {
  const message = error instanceof Error ? error.message : String(error)
  log.warn('A request from the window failed:', message)
  // The code only comes from where a failure is understood (AppError), never from guessing at the
  // text: an export that fails with ENOENT must not be told "edit the entry".
  return {
    ok: false,
    error: message,
    ...(error instanceof AppError ? { code: error.code } : {}),
  }
}

export function registerIpcHandlers(): void {
  onDataStatusChange((status) => {
    // The status names files on disk; like the data itself it is the panel's business.
    const main = getMainWindow()
    if (main && !main.isDestroyed()) {
      main.webContents.send(IPC_CHANNELS.dataStatusChanged, status)
    }
  })
  ipcMain.handle(IPC_CHANNELS.getDataStatus, (event) => {
    try {
      assertFromMainWindow(event)
      return toResult(getDataStatus())
    } catch (error) {
      return toError(error)
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.dismissDataNotice,
    (event, kind: StartupNoticeKind) => {
      try {
        assertFromMainWindow(event)
        if (!NOTICE_KINDS.includes(kind)) throw new Error('Invalid notice')
        return toResult(dismissNotice(kind))
      } catch (error) {
        return toError(error)
      }
    }
  )
  ipcMain.handle(IPC_CHANNELS.retryDataSave, async (event) => {
    try {
      assertFromMainWindow(event)
      return toResult(await retryDataSave())
    } catch (error) {
      return toError(error)
    }
  })
  // The ball asks here instead of loading the data: language and theme, nothing else.
  ipcMain.handle(IPC_CHANNELS.getDockAppearance, async (event) => {
    try {
      if (event.sender !== getDockWindow()?.webContents)
        throw new Error('Invalid dock sender')
      const { prefs } = await loadAppData()
      return toResult({
        lang: prefs.lang,
        theme: resolveThemeSetting(prefs.theme),
      })
    } catch (error) {
      return toError(error)
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.activateDock,
    async (event, mode: 'peek' | 'window') => {
      try {
        if (
          event.sender !== getDockWindow()?.webContents ||
          !['peek', 'window'].includes(mode)
        )
          throw new Error('Invalid dock activation')
        return toResult(await activateDock(mode))
      } catch (error) {
        return toError(error)
      }
    }
  )
  ipcMain.handle(
    IPC_CHANNELS.setPeekBlocked,
    (event, blocked: boolean, keyboard: boolean) => {
      try {
        if (
          event.sender !== getMainWindow()?.webContents ||
          typeof blocked !== 'boolean' ||
          typeof keyboard !== 'boolean'
        )
          throw new Error('Invalid panel interaction')
        setPeekBlocked(blocked, keyboard)
        return toResult(undefined)
      } catch (error) {
        return toError(error)
      }
    }
  )
  ipcMain.on(IPC_CHANNELS.windowFrameReady, (event, token: number) => {
    acknowledgeWindowFrame(event.sender.id, token)
  })
  ipcMain.handle(IPC_CHANNELS.dragDock, async (event, drag: DockDrag) => {
    try {
      if (event.sender !== getDockWindow()?.webContents)
        throw new Error('Invalid dock sender')
      return toResult(await dragDock(drag))
    } catch (error) {
      return toError(error)
    }
  })
  ipcMain.handle(IPC_CHANNELS.getLaunchSettings, () => {
    // Looking at the settings is a good moment to take the shortcut again if the program that had
    // it has let go since.
    retryLaunchShortcut()
    return toResult(getLaunchSettings())
  })
  ipcMain.handle(
    IPC_CHANNELS.showContextMenu,
    async (event, items: unknown, point: unknown) => {
      try {
        const panel = getMainWindow()
        if (!panel || event.sender !== panel.webContents)
          throw new Error('Invalid panel sender')

        return toResult(
          await showContextMenu(
            panel,
            validateContextMenu(items),
            validateMenuPoint(point)
          )
        )
      } catch (error) {
        return toError(error)
      }
    }
  )
  ipcMain.handle(IPC_CHANNELS.checkShortcut, (event, accelerator: string) => {
    try {
      if (event.sender !== getMainWindow()?.webContents)
        throw new Error('Invalid panel sender')
      return toResult(checkLaunchShortcut(accelerator))
    } catch (error) {
      return toError(error)
    }
  })
  ipcMain.handle(IPC_CHANNELS.setOpenAtLogin, (_event, enabled: boolean) => {
    try {
      return toResult(setOpenAtLogin(enabled))
    } catch (error) {
      return toError(error)
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.selectPath,
    async (_event, kind: 'folder' | 'app') => {
      try {
        if (kind !== 'folder' && kind !== 'app')
          throw new Error('Invalid path type')
        const text = mainText()
        const options: OpenDialogOptions = {
          title:
            kind === 'folder' ? text.selectFolderTitle : text.selectAppTitle,
          properties: [kind === 'folder' ? 'openDirectory' : 'openFile'],
          ...(kind === 'app'
            ? {
                filters: [
                  {
                    name: text.appFilesName,
                    extensions: ['exe', 'lnk', 'bat', 'cmd'],
                  },
                  { name: text.allFilesName, extensions: ['*'] },
                ],
              }
            : {}),
        }
        const parent = getMainWindow()
        const result = parent
          ? await dialog.showOpenDialog(parent, options)
          : await dialog.showOpenDialog(options)
        return toResult(result.canceled ? null : (result.filePaths[0] ?? null))
      } catch (error) {
        return toError(error)
      }
    }
  )
  ipcMain.handle(IPC_CHANNELS.loadData, async (event) => {
    try {
      assertFromMainWindow(event)
      return toResult(await loadAppData())
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.saveData, async (event, data: AppData) => {
    try {
      assertFromMainWindow(event)
      const current = await loadAppData()
      const saved = await saveAppData({
        ...data,
        window: current.window,
      })
      // The menu of the tray icon was built in the language of the moment.
      if (saved.prefs.lang !== current.prefs.lang) refreshMenusSoon()
      // Saving the settings turns the ball off or on at once, without a restart, and registers a
      // changed launch shortcut (or lets go of it) in the same breath.
      await applyBubblePreference(saved.prefs.showBubble)
      applyLaunchShortcut(saved.prefs)
      // Another language (or zoom, or set of categories) must not leave the tabs without names.
      await keepTabNamesVisibleSafely(current.prefs, saved.prefs)
      return toResult({
        data: saved,
        savedAt: new Date().toISOString(),
      })
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.exportData, async (event, data: AppData) => {
    try {
      assertFromMainWindow(event)
      const parentWindow = getMainWindow()
      const exported = normalizeAppData(data)
      // The file is plain text. Before one that would hold passwords is written, the user is told
      // so and decides; "without passwords" is the default answer.
      let includePasswords = true
      if (hasStoredPasswords(exported)) {
        const choice = await promptExportPasswords(parentWindow)
        if (choice === 'cancel') return toResult({ canceled: true })
        includePasswords = choice === 'with-passwords'
      }

      const text = mainText()
      const dateStamp = new Date().toISOString().slice(0, 10)
      const options: SaveDialogOptions = {
        title: text.exportDialogTitle,
        buttonLabel: text.exportDialogButton,
        defaultPath: path.join(
          app.getPath('documents'),
          `marubako-export-${dateStamp}.json`
        ),
        filters: [{ name: text.jsonFilesName, extensions: ['json'] }],
      }
      const dialogResult = parentWindow
        ? await dialog.showSaveDialog(parentWindow, options)
        : await dialog.showSaveDialog(options)

      if (dialogResult.canceled || !dialogResult.filePath) {
        return toResult({ canceled: true })
      }

      await exportAppDataFile(exported, dialogResult.filePath, {
        includePasswords,
      })

      return toResult({
        canceled: false,
        filePath: dialogResult.filePath,
        exportedAt: new Date().toISOString(),
        passwordsIncluded: includePasswords,
      })
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.importData, async (event) => {
    try {
      assertFromMainWindow(event)
      const text = mainText()
      const options: OpenDialogOptions = {
        title: text.importDialogTitle,
        buttonLabel: text.importDialogButton,
        properties: ['openFile'],
        // Backups end in .json, but .bak and .recovery-* copies do not.
        filters: [
          { name: text.jsonFilesName, extensions: ['json'] },
          { name: text.allFilesName, extensions: ['*'] },
        ],
      }
      const parentWindow = getMainWindow()
      const dialogResult = parentWindow
        ? await dialog.showOpenDialog(parentWindow, options)
        : await dialog.showOpenDialog(options)

      const filePath = dialogResult.filePaths[0]
      if (dialogResult.canceled || !filePath) {
        return toResult({ canceled: true })
      }

      // Check the file first (a wrong file is refused before anyone is asked anything), then ask
      // with what the file holds: the question names it and says if its passwords were left out.
      const { passwordsOmitted } = await readImportSummary(filePath)
      const confirmed = await promptImportConfirm(parentWindow, {
        name: path.basename(filePath),
        passwordsOmitted,
      })
      if (!confirmed) return toResult({ canceled: true })

      const prefsBefore = (await loadAppData()).prefs
      const imported = await importAppData(filePath)
      if (imported.prefs.lang !== prefsBefore.lang) refreshMenusSoon()
      // The window on this computer keeps its own transparency; apply the imported preference.
      await setWindowOpacity(imported.prefs.opacity)
      await applyBubblePreference(imported.prefs.showBubble)
      applyLaunchShortcut(imported.prefs)
      // The imported language may have longer category names than the window was sized for.
      await keepTabNamesVisibleSafely(prefsBefore, imported.prefs)

      return toResult({
        canceled: false,
        data: await loadAppData(),
        filePath,
        importedAt: new Date().toISOString(),
      })
    } catch (error) {
      return { ok: false as const, error: describeImportError(error) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.hideWindow, async () => {
    try {
      await hideWindow()
      return toResult(undefined)
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.dismissAfterLaunch, async (event) => {
    try {
      if (event.sender !== getMainWindow()?.webContents)
        throw new Error('Invalid panel sender')
      await dismissAfterLaunch()
      return toResult(undefined)
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.closeWindow, async () => {
    try {
      await closeWindow()
      return toResult(undefined)
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.togglePin, async () => {
    try {
      return toResult(await togglePin())
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.collapseWindow, async () => {
    try {
      return toResult(await collapseWindow())
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.expandWindow, async () => {
    try {
      return toResult(await expandWindow())
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.setOpacity, async (_event, opacity: number) => {
    try {
      return toResult(await setWindowOpacity(opacity))
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.previewOpacity,
    (event, opacity: number | null) => {
      try {
        if (event.sender !== getMainWindow()?.webContents)
          throw new Error('Invalid panel sender')
        if (opacity !== null && typeof opacity !== 'number')
          throw new Error('Invalid opacity')
        previewPanelOpacity(opacity)
        return toResult(undefined)
      } catch (error) {
        return toError(error)
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.getWindowState, async () => {
    try {
      return toResult(getWindowSnapshot())
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.openPath, async (_event, targetPath: string) => {
    try {
      return toResult(await openPath(targetPath))
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.openApp, async (_event, targetPath: string) => {
    try {
      return toResult(await openApp(targetPath))
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.openUrl,
    async (_event, targetUrl: string, browser) => {
      try {
        await openUrl(targetUrl, browser)
        return toResult(undefined)
      } catch (error) {
        return toError(error)
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.getFileIcon,
    async (_event, targetPath: string) => {
      try {
        return toResult(await getFileIcon(targetPath))
      } catch (error) {
        return toError(error)
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.classifyPaths, async (event, paths: unknown) => {
    try {
      // The panel adds what is dropped or pasted on it; nobody else has a reason to ask.
      if (event.sender !== getMainWindow()?.webContents)
        throw new Error('Invalid panel sender')
      return toResult(await classifyPaths(paths))
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.checkForUpdates, async (event) => {
    try {
      assertFromMainWindow(event)
      return toResult(await checkForUpdatesNow())
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.installUpdate, async (event) => {
    try {
      assertFromMainWindow(event)
      // What is pending is on disk before the installer takes over, as for any quit.
      await flushPendingWrite()
      if (!installDownloadedUpdate()) {
        throw new Error('No update has been downloaded')
      }
      return toResult(undefined)
    } catch (error) {
      return toError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.getAppInfo, (event) => {
    try {
      assertFromMainWindow(event)
      return toResult({ version: app.getVersion() })
    } catch (error) {
      return toError(error)
    }
  })

  // The address is fixed here: the window can ask for this page and no other.
  ipcMain.handle(IPC_CHANNELS.openIssuesPage, async (event) => {
    try {
      assertFromMainWindow(event)
      const { prefs } = await loadAppData()
      await openUrl(ISSUES_URL, prefs.browser)
      return toResult(undefined)
    } catch (error) {
      return toError(error)
    }
  })
}
