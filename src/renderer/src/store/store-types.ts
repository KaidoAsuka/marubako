import type { StateCreator } from 'zustand'

import type {
  AppData,
  DataStatus,
  GridTab,
  GroupTab,
  Prefs,
  StartupNoticeKind,
  Tab,
  TopEntry,
  WindowSnapshot,
} from '../../../shared/types'

export type ToastTone = 'success' | 'info' | 'danger'

export type ItemFocusField = 'name' | 'path' | 'url'

export type ModalState =
  | {
      kind: 'group'
      tab: GroupTab
      groupId: string | null
    }
  | {
      kind: 'item'
      tab: GroupTab
      groupId: string | null
      itemId: string | null
      /** The field to put the cursor in, e.g. the path of an entry that failed to open. */
      focus?: ItemFocusField
    }
  | {
      kind: 'task'
      date: string
      taskId: string | null
    }
  | {
      kind: 'subtask'
      date: string
      taskId: string
      subtaskId: string | null
    }
  | {
      kind: 'settings'
    }
  | {
      kind: 'confirm'
      title: string
      confirmLabel?: string
      onConfirm: () => void
    }

export type ToastAction = {
  label: string
  run: () => void
}

/**
 * A short-lived message. It is shown in the feedback strip at the bottom of the window
 * (FeedbackStrip.tsx); the name is from the floating toast it replaced.
 */
export type ToastState = {
  message: string
  tone: ToastTone
  /** A button inside the toast, e.g. "Undo". */
  action?: ToastAction
  /** Set only when the caller chose a duration; otherwise `showToast` picks one from the tone. */
  duration?: number
}

export type ShowToastOptions = {
  action?: ToastAction
  /** Milliseconds before the toast hides itself. */
  duration?: number
}

/**
 * Appearance settings shown while the settings dialog is open, before they are saved. They override
 * `data.prefs` where the interface reads them and are dropped when the dialog closes.
 */
export type PreviewPrefs = Partial<
  Pick<Prefs, 'theme' | 'background' | 'zoom' | 'motion'>
>

type WidgetPopupState = {
  tab: GridTab
  groupId: string
}

export type UpdateDataOptions = {
  successMessage?: string
}

export type ExportDataOptions = UpdateDataOptions & {
  /** Said instead of `successMessage` when the file was written without passwords. */
  withoutPasswordsMessage?: string
}

export interface AppStore {
  data: AppData | null
  loading: boolean
  saving: boolean
  error: string | null
  /** Disk-level state owned by the main process; unlike `error` it survives later edits. */
  dataStatus: DataStatus
  /**
   * Goes up each time the data is replaced as a whole (loaded, imported), not when it is edited.
   * A form holding unsaved edits follows the data only across such a replacement.
   */
  dataEpoch: number
  currentTab: Tab
  selectedDate: string
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
  /** The appearance being previewed by the open settings dialog, or null. */
  previewPrefs: PreviewPrefs | null
  setPreviewPrefs: (preview: PreviewPrefs | null) => void
  modal: ModalState | null
  toast: ToastState | null
  windowState: WindowSnapshot
  widgetPopup: WidgetPopupState | null
  revealedPasswordIds: string[]
  expandedNoteIds: string[]
  appIcons: Record<string, string | null>
  loadData: () => Promise<void>
  updateData: (
    mutator: (draft: AppData) => void,
    options?: UpdateDataOptions
  ) => Promise<void>
  exportData: (options?: ExportDataOptions) => Promise<void>
  importData: (options?: UpdateDataOptions) => Promise<void>
  refreshDataStatus: () => Promise<void>
  dismissNotice: (kind: StartupNoticeKind) => Promise<void>
  retryDataSave: () => Promise<void>
  setCurrentTab: (tab: Tab) => void
  setSelectedDate: (date: string) => void
  setModal: (modal: ModalState | null) => void
  showToast: (
    message: string,
    tone?: ToastTone,
    options?: ShowToastOptions
  ) => void
  clearToast: () => void
  /** Stop the hide timer while the pointer or keyboard focus is on the toast. */
  pauseToast: () => void
  /** Hide the toast after a short grace period, once the pointer or focus has left it. */
  resumeToast: () => void
  togglePasswordReveal: (itemId: string) => void
  toggleNoteExpanded: (itemId: string) => void
  reorderTopEntries: (
    tab: GroupTab,
    activeId: string,
    overId: string,
    position?: 'before' | 'after'
  ) => Promise<void>
  moveLooseItemToGroup: (
    tab: GroupTab,
    itemId: string,
    groupId: string
  ) => Promise<void>
  moveGroupItemToLoose: (
    tab: GroupTab,
    groupId: string,
    itemId: string
  ) => Promise<void>
  moveGroupItemToLooseAt: (
    tab: GroupTab,
    groupId: string,
    itemId: string,
    targetEntry: TopEntry | null,
    position?: 'before' | 'after'
  ) => Promise<void>
  moveGroupItemToGroup: (
    tab: GroupTab,
    sourceGroupId: string,
    itemId: string,
    targetGroupId: string
  ) => Promise<void>
  moveItemToGroup: (
    tab: GroupTab,
    sourceGroupId: string | null,
    itemId: string,
    targetGroupId: string
  ) => Promise<void>
  moveItemToLooseAt: (
    tab: GroupTab,
    sourceGroupId: string | null,
    itemId: string,
    targetEntry: TopEntry | null,
    position?: 'before' | 'after'
  ) => Promise<void>
  moveItemRelative: (
    tab: GroupTab,
    sourceGroupId: string | null,
    itemId: string,
    targetGroupId: string | null,
    targetItemId: string,
    position?: 'before' | 'after'
  ) => Promise<void>
  reorderGroups: (
    tab: GroupTab,
    activeId: string,
    overId: string
  ) => Promise<void>
  reorderItems: (
    tab: GroupTab,
    groupId: string | null,
    activeId: string,
    overId: string
  ) => Promise<void>
  reorderTasks: (
    date: string,
    activeId: string,
    overId: string
  ) => Promise<void>
  reorderSubtasks: (
    date: string,
    taskId: string,
    activeId: string,
    overId: string
  ) => Promise<void>
  openWidgetPopup: (tab: GridTab, groupId: string) => void
  closeWidgetPopup: () => void
  hydrateIcons: (paths: string[]) => Promise<void>
  refreshWindowState: () => Promise<void>
  togglePin: () => Promise<void>
  toggleCollapse: () => Promise<void>
  setOpacity: (opacity: number) => Promise<void>
  /** Shows an opacity on the panel without saving it; null goes back to the saved one. */
  previewOpacity: (opacity: number | null) => Promise<void>
  hideWindow: () => Promise<void>
  dismissAfterLaunch: () => Promise<void>
  closeWindow: () => Promise<void>
}

export type DataSliceState = Pick<
  AppStore,
  | 'data'
  | 'loading'
  | 'saving'
  | 'error'
  | 'dataStatus'
  | 'dataEpoch'
  | 'loadData'
  | 'updateData'
  | 'exportData'
  | 'importData'
  | 'refreshDataStatus'
  | 'dismissNotice'
  | 'retryDataSave'
>

export type UiSliceState = Pick<
  AppStore,
  | 'currentTab'
  | 'selectedDate'
  | 'commandOpen'
  | 'setCommandOpen'
  | 'previewPrefs'
  | 'setPreviewPrefs'
  | 'modal'
  | 'toast'
  | 'widgetPopup'
  | 'revealedPasswordIds'
  | 'expandedNoteIds'
  | 'setCurrentTab'
  | 'setSelectedDate'
  | 'setModal'
  | 'showToast'
  | 'clearToast'
  | 'pauseToast'
  | 'resumeToast'
  | 'togglePasswordReveal'
  | 'toggleNoteExpanded'
  | 'openWidgetPopup'
  | 'closeWidgetPopup'
>

export type DndSliceState = Pick<
  AppStore,
  | 'reorderTopEntries'
  | 'moveLooseItemToGroup'
  | 'moveGroupItemToLoose'
  | 'moveGroupItemToLooseAt'
  | 'moveGroupItemToGroup'
  | 'moveItemToGroup'
  | 'moveItemToLooseAt'
  | 'moveItemRelative'
  | 'reorderGroups'
  | 'reorderItems'
  | 'reorderTasks'
  | 'reorderSubtasks'
>

export type WindowSliceState = Pick<
  AppStore,
  | 'windowState'
  | 'appIcons'
  | 'hydrateIcons'
  | 'refreshWindowState'
  | 'togglePin'
  | 'toggleCollapse'
  | 'setOpacity'
  | 'previewOpacity'
  | 'hideWindow'
  | 'dismissAfterLaunch'
  | 'closeWindow'
>

export type AppStoreCreator<T> = StateCreator<AppStore, [], [], T>
