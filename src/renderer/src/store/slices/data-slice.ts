import {
  firstVisibleTab,
  normalizeHiddenTabs,
  resolveVisibleTab,
} from '../../../../shared/tabs'
import type { DataStatus, Tab } from '../../../../shared/types'
import { reconcileAllTopOrders } from '../data-helpers'
import type { AppStore, AppStoreCreator, DataSliceState } from '../store-types'
import { clearUndoRecord } from '../undo'
import { DEFAULT_WINDOW_STATE } from './window-slice'

const EMPTY_DATA_STATUS: DataStatus = { writeError: null, notices: [] }

// The tab to show for data that was just loaded or imported: the one being looked at when it is still
// shown, otherwise the first category that is. `lastTab` follows it.
function withActiveTab(data: AppStore['data'], currentTab?: Tab) {
  if (!data) {
    return data
  }

  const hiddenTabs = normalizeHiddenTabs(data.prefs.hiddenTabs)
  return {
    ...data,
    prefs: {
      ...data.prefs,
      hiddenTabs,
      lastTab: currentTab
        ? resolveVisibleTab(currentTab, hiddenTabs)
        : firstVisibleTab(hiddenTabs),
    },
  }
}

// The pending undo describes where an entity sat in the data as it was. Any other change (or a
// wholesale replacement of the data) may invalidate that, so it is dropped together with the toast
// that still offers it. The undo itself takes its record first, so it never trips over this.
function dropPendingUndo(get: () => AppStore) {
  const dropped = clearUndoRecord()
  if (dropped?.toastAction && get().toast?.action === dropped.toastAction) {
    get().clearToast()
  }
}

export const createDataSlice: AppStoreCreator<DataSliceState> = (set, get) => ({
  data: null,
  loading: true,
  saving: false,
  error: null,
  dataStatus: EMPTY_DATA_STATUS,
  dataEpoch: 0,
  async loadData() {
    set({ loading: true, error: null })

    const [dataResult, windowResult] = await Promise.all([
      window.quickLaunch.loadData(),
      window.quickLaunch.window.getState(),
    ])

    if (!dataResult.ok) {
      set({
        loading: false,
        error: dataResult.error,
      })
      return
    }

    dropPendingUndo(get)
    const loaded = withActiveTab(dataResult.data)
    set({
      data: loaded,
      dataEpoch: get().dataEpoch + 1,
      currentTab: loaded?.prefs.lastTab ?? firstVisibleTab([]),
      loading: false,
      error: null,
      windowState: windowResult.ok ? windowResult.data : DEFAULT_WINDOW_STATE,
    })

    await get().refreshDataStatus()
  },
  async updateData(mutator, options) {
    const current = get().data
    if (!current) {
      return
    }

    dropPendingUndo(get)

    const next = structuredClone(current)
    mutator(next)
    reconcileAllTopOrders(next)
    next.prefs.hiddenTabs = normalizeHiddenTabs(next.prefs.hiddenTabs)
    // Hiding the category being looked at moves to the first one that is shown.
    const previousTab = get().currentTab
    const visibleTab = resolveVisibleTab(previousTab, next.prefs.hiddenTabs)
    next.prefs.lastTab = visibleTab

    set({
      data: next,
      ...(visibleTab !== previousTab
        ? { currentTab: visibleTab, widgetPopup: null, revealedPasswordIds: [] }
        : {}),
      saving: true,
      error: null,
    })

    const result = await window.quickLaunch.saveData(next)
    if (!result.ok) {
      set({
        data: current,
        currentTab: previousTab,
        saving: false,
        error: result.error,
      })
      get().showToast(result.error, 'danger')
      return
    }

    set({
      data: result.data.data,
      saving: false,
      error: null,
    })

    // The main process accepts a change before it is on disk. While a write is failing, a green
    // message next to the not-saved error line of the strip would be a lie, so say nothing.
    if (options?.successMessage && !get().dataStatus.writeError) {
      get().showToast(options.successMessage, 'success')
    }
  },
  async exportData(options) {
    const current = get().data
    if (!current) {
      return
    }

    set({ saving: true, error: null })

    const result = await window.quickLaunch.exportData(current)
    if (!result.ok) {
      set({ saving: false, error: result.error })
      get().showToast(result.error, 'danger')
      return
    }

    set({ saving: false, error: null })

    if (!result.data.canceled) {
      const message = result.data.passwordsIncluded
        ? options?.successMessage
        : (options?.withoutPasswordsMessage ?? options?.successMessage)
      if (message) get().showToast(message, 'success')
    }
  },
  async importData(options) {
    const current = get().data
    if (!current) {
      return
    }

    set({ saving: true, error: null })

    const result = await window.quickLaunch.importData()
    if (!result.ok) {
      set({ saving: false, error: result.error })
      get().showToast(result.error, 'danger')
      return
    }

    if (result.data.canceled) {
      set({ saving: false, error: null })
      return
    }

    dropPendingUndo(get)
    const imported = withActiveTab(result.data.data, get().currentTab)
    set({
      data: imported,
      dataEpoch: get().dataEpoch + 1,
      currentTab: imported?.prefs.lastTab ?? get().currentTab,
      saving: false,
      error: null,
      widgetPopup: null,
      revealedPasswordIds: [],
      expandedNoteIds: [],
    })

    if (options?.successMessage) {
      get().showToast(options.successMessage, 'success')
    }
  },
  async refreshDataStatus() {
    try {
      const result = await window.quickLaunch.getDataStatus()
      if (result.ok) {
        set({ dataStatus: result.data })
      }
    } catch {
      // The status is advisory and main pushes every change, so a failed read must not break loading.
    }
  },
  async dismissNotice(kind) {
    const result = await window.quickLaunch.dismissDataNotice(kind)
    if (!result.ok) {
      get().showToast(result.error, 'danger')
      return
    }

    set({ dataStatus: result.data })
  },
  async retryDataSave() {
    const result = await window.quickLaunch.retryDataSave()
    if (!result.ok) {
      get().showToast(result.error, 'danger')
      return
    }

    // A retry that fails again still resolves ok, with `writeError` left set.
    set({ dataStatus: result.data })
  },
})
