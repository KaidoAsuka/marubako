import { useEffect } from 'react'
import { useAppStore } from '../store/use-app-store'

/** Protect editing, dialogs, menus and dragging from pointer-leave dismissal. */
export function usePeekInteraction(): void {
  useEffect(() => {
    let pressed = false
    let lastBlocked: boolean | undefined
    const report = (keyboard = false) => {
      const state = useAppStore.getState()
      const focused = document.activeElement
      const editing =
        document.hasFocus() &&
        focused instanceof HTMLElement &&
        (focused.matches('input, textarea, select') ||
          focused.isContentEditable)
      const blocked = Boolean(
        state.modal ||
        state.commandOpen ||
        state.widgetPopup ||
        state.saving ||
        editing ||
        pressed ||
        document.body.classList.contains('dnd-active') ||
        // A file or link is being dragged in from outside, to be dropped on the panel.
        document.body.classList.contains('external-drag-active')
      )
      if (blocked === lastBlocked && !keyboard) return
      lastBlocked = blocked
      void window.quickLaunch.window
        .setPeekBlocked(blocked, keyboard)
        .catch(() => {})
    }
    const focus = () => queueMicrotask(() => report())
    const down = () => {
      pressed = true
      report()
    }
    const up = () => {
      pressed = false
      report()
    }
    const key = () => report(true)
    const observer = new MutationObserver(() => report())
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    })
    const unsubscribe = useAppStore.subscribe(() => report())
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', focus)
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    window.addEventListener('blur', up)
    window.addEventListener('keydown', key, true)
    report()
    return () => {
      observer.disconnect()
      unsubscribe()
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', focus)
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      window.removeEventListener('blur', up)
      window.removeEventListener('keydown', key, true)
    }
  }, [])
}
