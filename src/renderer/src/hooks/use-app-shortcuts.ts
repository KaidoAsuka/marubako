import { useEffect } from 'react'

import { visibleTabs } from '../../../shared/tabs'
import { useAppStore } from '../store/use-app-store'
import { resolveLang } from '../i18n/resolve-lang'
import { workspaceStrings } from '../i18n/workspace'
import { todayKey } from '../utils/date'
import { onboardingActive } from './use-onboarding'

// The tip is a sentence and a half: it needs longer than a confirmation.
const DOCK_TIP_DURATION = 6000

// The day the tasks page last treated as "today". The app lives in the tray for days, so the
// selected date has to be carried over to the new day by hand, but only for a user who was still
// looking at the old "today" (someone browsing another day keeps that day).
let lastToday = todayKey()

function followToday(): void {
  const now = todayKey()
  if (now === lastToday) return
  const store = useAppStore.getState()
  if (store.selectedDate === lastToday) store.setSelectedDate(now)
  lastToday = now
}

export function useAppShortcuts(): void {
  useEffect(() => {
    const activate = () => {
      const store = useAppStore.getState()
      void store.refreshWindowState()
      store.setCommandOpen(false)
      // Recalling the panel always starts from a clean state; losing focus alone does not (see onBlur).
      store.closeWidgetPopup()
      // A hide that never reported a collapse (no ball: the shortcut hides to the tray) must not
      // bring revealed passwords back in clear text.
      useAppStore.setState({ revealedPasswordIds: [] })
      followToday()
    }
    const unsubscribe = window.quickLaunch.onActivate(activate)
    const unsubscribeState = window.quickLaunch.onWindowState((state) => {
      const store = useAppStore.getState()
      const previous = store.windowState
      useAppStore.setState({
        windowState: state,
        ...(state.collapsed ? { revealedPasswordIds: [] } : {}),
      })
      if (!state.collapsed) followToday()
      const strings = workspaceStrings[resolveLang(store.data?.prefs.lang)]
      if (
        !state.collapsed &&
        state.mode === 'peek' &&
        !localStorage.getItem('dock-hint-seen')
      ) {
        // While the first-run card is open it says the same thing (its second line); the tip is
        // for the user who has closed it, or who never had it.
        if (!onboardingActive()) {
          store.showToast(strings.dock_tip!, 'info', {
            duration: DOCK_TIP_DURATION,
          })
          localStorage.setItem('dock-hint-seen', '1')
        }
      } else if (
        !state.collapsed &&
        state.mode === 'window' &&
        previous.mode === 'peek'
      )
        store.showToast(strings.dock_kept_open!)
    })
    const onBlur = () => {
      const store = useAppStore.getState()
      store.setCommandOpen(false)
      // Only the temporary peek expansion folds away with its group popup. A window the user keeps
      // open, or one that lost focus to a dialog or the system file picker, keeps the popup.
      if (store.windowState.mode === 'peek' && !store.modal) {
        store.closeWidgetPopup()
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      const store = useAppStore.getState()
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k' &&
        !store.modal
      ) {
        event.preventDefault()
        store.setCommandOpen(!store.commandOpen)
        return
      }
      if (store.modal || store.commandOpen) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (store.widgetPopup) store.closeWidgetPopup()
        else void store.toggleCollapse()
        return
      }
      const editing =
        event.target instanceof HTMLElement &&
        (event.target.matches('input, textarea, select') ||
          event.target.isContentEditable)
      if (editing) return
      if (event.altKey && /^[1-7]$/.test(event.key)) {
        // Alt+number counts the categories that are shown, in order; a number beyond them does nothing.
        const target = visibleTabs(store.data?.prefs.hiddenTabs)[
          Number(event.key) - 1
        ]
        if (target) {
          event.preventDefault()
          store.setCurrentTab(target)
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        store.setModal(
          store.currentTab === 'tasks'
            ? { kind: 'task', date: store.selectedDate, taskId: null }
            : {
                kind: 'item',
                tab: store.currentTab,
                groupId: null,
                itemId: null,
              }
        )
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', followToday)
    // A panel left open or pinned across midnight gets no focus or activate event, and neither does
    // one coming back from sleep, so the day is also polled. It is one string compare.
    document.addEventListener('visibilitychange', followToday)
    const timer = window.setInterval(followToday, 30_000)
    return () => {
      unsubscribe()
      unsubscribeState()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', followToday)
      document.removeEventListener('visibilitychange', followToday)
      window.clearInterval(timer)
    }
  }, [])
}
