import { resolveVisibleTab } from '../../../../shared/tabs'
import { DEFAULT_STARTUP_TAB } from '../../../../shared/types'
import { isValidDateKey, todayKey } from '../../utils/date'
import type { AppStoreCreator, ToastTone, UiSliceState } from '../store-types'

// How long a message stays in the feedback strip: one with a button needs time to be read and
// clicked, and errors deserve longer than a confirmation.
const TOAST_DURATION: Record<ToastTone, number> = {
  success: 1800,
  info: 2200,
  danger: 5000,
}
const TOAST_ACTION_DURATION = 6000
// What is left of a toast once the pointer or focus leaves it again.
const TOAST_RESUME_DURATION = 2000

let toastTimer: number | null = null

function clearToastTimer() {
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer)
    toastTimer = null
  }
}

function armToastTimer(duration: number, hide: () => void) {
  clearToastTimer()
  toastTimer = window.setTimeout(() => {
    toastTimer = null
    hide()
  }, duration)
}

export const createUiSlice: AppStoreCreator<UiSliceState> = (set, get) => ({
  currentTab: DEFAULT_STARTUP_TAB,
  selectedDate: todayKey(),
  commandOpen: false,
  setCommandOpen(commandOpen) {
    // Opening search starts from a clean slate. Closing it must leave the group popup alone,
    // because the window blur handler calls this too and a popup has to survive losing focus.
    set(
      commandOpen
        ? { commandOpen: true, widgetPopup: null }
        : { commandOpen: false }
    )
  },
  previewPrefs: null,
  setPreviewPrefs(previewPrefs) {
    set({ previewPrefs })
  },
  modal: null,
  toast: null,
  widgetPopup: null,
  revealedPasswordIds: [],
  expandedNoteIds: [],
  setCurrentTab(requested) {
    set((state) => {
      // A hidden category cannot be opened (a stale shortcut, a result that was open when it was
      // hidden): the first one that is shown stands in.
      const tab = resolveVisibleTab(requested, state.data?.prefs.hiddenTabs)

      return {
        currentTab: tab,
        widgetPopup: null,
        revealedPasswordIds: [],
        data: state.data
          ? {
              ...state.data,
              prefs: {
                ...state.data.prefs,
                lastTab: tab,
              },
            }
          : state.data,
      }
    })
  },
  setSelectedDate(date) {
    // A key that is not a real day (an old mistyped "0026-10-05" still in saved data, say) would
    // make the date bar throw; stay on the current day instead.
    if (!isValidDateKey(date)) return
    set({ selectedDate: date })
  },
  setModal(modal) {
    set({ modal })
  },
  showToast(message, tone = 'info', options) {
    set({
      toast: {
        message,
        tone,
        ...(options?.action ? { action: options.action } : {}),
        ...(options?.duration !== undefined
          ? { duration: options.duration }
          : {}),
      },
    })
    armToastTimer(
      options?.duration ??
        (options?.action ? TOAST_ACTION_DURATION : TOAST_DURATION[tone]),
      () => set({ toast: null })
    )
  },
  clearToast() {
    clearToastTimer()
    set({ toast: null })
  },
  pauseToast() {
    clearToastTimer()
  },
  resumeToast() {
    if (!get().toast) {
      return
    }

    armToastTimer(TOAST_RESUME_DURATION, () => set({ toast: null }))
  },
  togglePasswordReveal(itemId) {
    set((state) => ({
      revealedPasswordIds: state.revealedPasswordIds.includes(itemId)
        ? state.revealedPasswordIds.filter((id) => id !== itemId)
        : [...state.revealedPasswordIds, itemId],
    }))
  },
  toggleNoteExpanded(itemId) {
    set((state) => ({
      expandedNoteIds: state.expandedNoteIds.includes(itemId)
        ? state.expandedNoteIds.filter((id) => id !== itemId)
        : [...state.expandedNoteIds, itemId],
    }))
  },
  openWidgetPopup(tab, groupId) {
    set({ widgetPopup: { tab, groupId } })
  },
  closeWidgetPopup() {
    set({ widgetPopup: null })
  },
})
