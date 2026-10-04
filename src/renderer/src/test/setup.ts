import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

import { createDefaultAppData } from '../../../shared/default-data'

Object.assign(window, {
  quickLaunch: {
    loadData: vi.fn(async () => ({
      ok: true,
      data: createDefaultAppData(),
    })),
    saveData: vi.fn(async (data) => ({
      ok: true,
      data: {
        data,
        savedAt: new Date().toISOString(),
      },
    })),
    exportData: vi.fn(async () => ({
      ok: true,
      data: {
        canceled: false,
        filePath: 'C:\\backup\\marubako-export.json',
        exportedAt: new Date().toISOString(),
        passwordsIncluded: true,
      },
    })),
    importData: vi.fn(async () => ({
      ok: true,
      data: {
        canceled: true,
      },
    })),
    getDataStatus: vi.fn(async () => ({
      ok: true,
      data: { writeError: null, notices: [] },
    })),
    dismissDataNotice: vi.fn(async () => ({
      ok: true,
      data: { writeError: null, notices: [] },
    })),
    retryDataSave: vi.fn(async () => ({
      ok: true,
      data: { writeError: null, notices: [] },
    })),
    onDataStatus: vi.fn(() => () => {}),
    openPath: vi.fn(async () => ({ ok: true, data: '' })),
    openApp: vi.fn(async () => ({ ok: true, data: '' })),
    openUrl: vi.fn(async () => ({ ok: true, data: undefined })),
    getFileIcon: vi.fn(async () => ({ ok: true, data: null })),
    checkForUpdates: vi.fn(async () => ({
      ok: true,
      data: { status: 'latest', version: '2.5.8' },
    })),
    installUpdate: vi.fn(async () => ({ ok: true, data: undefined })),
    getAppInfo: vi.fn(async () => ({ ok: true, data: { version: '2.5.8' } })),
    openIssuesPage: vi.fn(async () => ({ ok: true, data: undefined })),
    selectPath: vi.fn(async () => ({ ok: true, data: null })),
    getLaunchSettings: vi.fn(async () => ({
      ok: true,
      data: {
        openAtLogin: false,
        canAutoStart: false,
        shortcut: 'Ctrl + Alt + Space',
        shortcutAvailable: true,
      },
    })),
    showContextMenu: vi.fn(async () => ({ ok: true, data: null })),
    checkShortcut: vi.fn(async () => ({
      ok: true,
      data: { status: 'free' },
    })),
    setOpenAtLogin: vi.fn(async (enabled: boolean) => ({
      ok: true,
      data: {
        openAtLogin: enabled,
        canAutoStart: true,
        shortcut: 'Ctrl + Alt + Space',
        shortcutAvailable: true,
      },
    })),
    onActivate: vi.fn(() => () => {}),
    onPrepareShow: vi.fn(() => () => {}),
    getDockAppearance: vi.fn(async () => ({
      ok: true,
      data: { lang: 'zh', theme: 'dark' },
    })),
    onDockAppearance: vi.fn(() => () => {}),
    onWindowState: vi.fn(() => () => {}),
    window: {
      setPeekBlocked: vi.fn(async () => ({ ok: true, data: undefined })),
      activateDock: vi.fn(async () => ({
        ok: true,
        data: {
          alwaysOnTop: false,
          collapsed: false,
          opacity: 1,
          mode: 'peek',
        },
      })),
      dragDock: vi.fn(async () => ({ ok: true, data: { moved: false } })),
      dismissAfterLaunch: vi.fn(async () => ({ ok: true, data: undefined })),
      hide: vi.fn(async () => ({ ok: true, data: null })),
      close: vi.fn(async () => ({ ok: true, data: null })),
      togglePin: vi.fn(async () => ({
        ok: true,
        data: {
          alwaysOnTop: true,
          collapsed: false,
          opacity: 1,
        },
      })),
      collapse: vi.fn(async () => ({
        ok: true,
        data: {
          alwaysOnTop: true,
          collapsed: true,
          opacity: 1,
        },
      })),
      expand: vi.fn(async () => ({
        ok: true,
        data: {
          alwaysOnTop: true,
          collapsed: false,
          opacity: 1,
        },
      })),
      setOpacity: vi.fn(async (opacity: number) => ({
        ok: true,
        data: {
          alwaysOnTop: true,
          collapsed: false,
          opacity,
        },
      })),
      previewOpacity: vi.fn(async () => ({ ok: true, data: undefined })),
      getState: vi.fn(async () => ({
        ok: true,
        data: {
          alwaysOnTop: true,
          collapsed: false,
          opacity: 1,
        },
      })),
    },
  },
})
