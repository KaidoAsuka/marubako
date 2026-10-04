import type { WindowSnapshot } from '../../../../shared/types'
import type { AppStoreCreator, WindowSliceState } from '../store-types'

export const DEFAULT_WINDOW_STATE: WindowSnapshot = {
  alwaysOnTop: false,
  collapsed: false,
  opacity: 1,
}

export const createWindowSlice: AppStoreCreator<WindowSliceState> = (
  set,
  get
) => ({
  windowState: DEFAULT_WINDOW_STATE,
  appIcons: {},
  async hydrateIcons(paths) {
    const missingPaths = paths.filter(
      (targetPath) => !(targetPath in get().appIcons)
    )
    if (!missingPaths.length) {
      return
    }

    const entries = await Promise.all(
      missingPaths.map(async (targetPath) => {
        const result = await window.quickLaunch.getFileIcon(targetPath)
        return [targetPath, result.ok ? result.data : null] as const
      })
    )

    set((state) => ({
      appIcons: {
        ...state.appIcons,
        ...Object.fromEntries(entries),
      },
    }))
  },
  async refreshWindowState() {
    const result = await window.quickLaunch.window.getState()
    if (result.ok) {
      set({ windowState: result.data })
    }
  },
  async togglePin() {
    const result = await window.quickLaunch.window.togglePin()
    if (result.ok) {
      set({ windowState: result.data })
    }
  },
  async toggleCollapse() {
    const current = get().windowState
    if (!current.collapsed) set({ revealedPasswordIds: [] })
    const result = current.collapsed
      ? await window.quickLaunch.window.expand()
      : await window.quickLaunch.window.collapse()

    if (result.ok) {
      set({ windowState: result.data })
    }
  },
  async setOpacity(opacity) {
    const result = await window.quickLaunch.window.setOpacity(opacity)
    if (result.ok) {
      set((state) => ({
        windowState: result.data,
        data: state.data
          ? {
              ...state.data,
              prefs: {
                ...state.data.prefs,
                opacity: result.data.opacity,
              },
              window: {
                ...state.data.window,
                opacity: result.data.opacity,
              },
            }
          : state.data,
      }))
    }
  },
  async previewOpacity(opacity) {
    // A preview is only a look; a failure to show it must not get in the way of the dialog.
    await window.quickLaunch.window.previewOpacity(opacity).catch(() => null)
  },
  async hideWindow() {
    const result = await window.quickLaunch.window.hide()
    if (!result.ok) {
      get().showToast(result.error, 'danger')
      return
    }
    set({ revealedPasswordIds: [] })
  },
  async dismissAfterLaunch() {
    // The main process decides: fold into the floating ball, or go to the tray when it is off.
    const result = await window.quickLaunch.window.dismissAfterLaunch()
    if (!result.ok) {
      get().showToast(result.error, 'danger')
      return
    }
    set({ revealedPasswordIds: [] })
  },
  async closeWindow() {
    await window.quickLaunch.window.close()
  },
})
