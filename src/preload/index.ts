import { contextBridge, ipcRenderer, webUtils } from 'electron'

import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { QuickLaunchApi } from '../shared/preload-api'

const api: QuickLaunchApi = {
  loadData: () => ipcRenderer.invoke(IPC_CHANNELS.loadData),
  saveData: (data) => ipcRenderer.invoke(IPC_CHANNELS.saveData, data),
  exportData: (data) => ipcRenderer.invoke(IPC_CHANNELS.exportData, data),
  importData: () => ipcRenderer.invoke(IPC_CHANNELS.importData),
  getDataStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getDataStatus),
  dismissDataNotice: (kind) =>
    ipcRenderer.invoke(IPC_CHANNELS.dismissDataNotice, kind),
  retryDataSave: () => ipcRenderer.invoke(IPC_CHANNELS.retryDataSave),
  onDataStatus: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      status: Parameters<typeof callback>[0]
    ) => callback(status)
    ipcRenderer.on(IPC_CHANNELS.dataStatusChanged, listener)
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.dataStatusChanged, listener)
  },
  openPath: (targetPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.openPath, targetPath),
  openApp: (targetPath) => ipcRenderer.invoke(IPC_CHANNELS.openApp, targetPath),
  openUrl: (url, browser) =>
    ipcRenderer.invoke(IPC_CHANNELS.openUrl, url, browser),
  getFileIcon: (targetPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.getFileIcon, targetPath),
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates),
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.installUpdate),
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo),
  openIssuesPage: () => ipcRenderer.invoke(IPC_CHANNELS.openIssuesPage),
  getDroppedPaths: (files) =>
    files
      .map((file) => {
        try {
          return webUtils.getPathForFile(
            file as Parameters<typeof webUtils.getPathForFile>[0]
          )
        } catch {
          return ''
        }
      })
      .filter(Boolean),
  classifyPaths: (paths) =>
    ipcRenderer.invoke(IPC_CHANNELS.classifyPaths, paths),
  selectPath: (kind) => ipcRenderer.invoke(IPC_CHANNELS.selectPath, kind),
  getLaunchSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getLaunchSettings),
  showContextMenu: (items, point) =>
    ipcRenderer.invoke(IPC_CHANNELS.showContextMenu, items, point),
  checkShortcut: (accelerator) =>
    ipcRenderer.invoke(IPC_CHANNELS.checkShortcut, accelerator),
  setOpenAtLogin: (enabled) =>
    ipcRenderer.invoke(IPC_CHANNELS.setOpenAtLogin, enabled),
  onActivate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, source?: unknown) =>
      callback(source === 'hotkey' ? 'hotkey' : 'other')
    ipcRenderer.on(IPC_CHANNELS.activateLauncher, listener)
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.activateLauncher, listener)
  },
  onPrepareShow: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      token: number,
      presentation: Parameters<
        Parameters<QuickLaunchApi['onPrepareShow']>[0]
      >[0]
    ) => {
      void callback(presentation).then(() =>
        ipcRenderer.send(IPC_CHANNELS.windowFrameReady, token)
      )
    }
    ipcRenderer.on(IPC_CHANNELS.prepareWindowShow, listener)
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.prepareWindowShow, listener)
  },
  getDockAppearance: () => ipcRenderer.invoke(IPC_CHANNELS.getDockAppearance),
  onDockAppearance: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      appearance: Parameters<typeof callback>[0]
    ) => callback(appearance)
    ipcRenderer.on(IPC_CHANNELS.dockAppearance, listener)
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.dockAppearance, listener)
  },
  onWindowState: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: Parameters<typeof callback>[0]
    ) => callback(state)
    ipcRenderer.on(IPC_CHANNELS.windowStateChanged, listener)
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.windowStateChanged, listener)
  },
  window: {
    activateDock: (mode) => ipcRenderer.invoke(IPC_CHANNELS.activateDock, mode),
    setPeekBlocked: (blocked, keyboard) =>
      ipcRenderer.invoke(IPC_CHANNELS.setPeekBlocked, blocked, keyboard),
    dragDock: (drag) => ipcRenderer.invoke(IPC_CHANNELS.dragDock, drag),
    hide: () => ipcRenderer.invoke(IPC_CHANNELS.hideWindow),
    dismissAfterLaunch: () =>
      ipcRenderer.invoke(IPC_CHANNELS.dismissAfterLaunch),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.closeWindow),
    togglePin: () => ipcRenderer.invoke(IPC_CHANNELS.togglePin),
    collapse: () => ipcRenderer.invoke(IPC_CHANNELS.collapseWindow),
    expand: () => ipcRenderer.invoke(IPC_CHANNELS.expandWindow),
    setOpacity: (opacity) =>
      ipcRenderer.invoke(IPC_CHANNELS.setOpacity, opacity),
    previewOpacity: (opacity) =>
      ipcRenderer.invoke(IPC_CHANNELS.previewOpacity, opacity),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.getWindowState),
  },
}

contextBridge.exposeInMainWorld('quickLaunch', api)
