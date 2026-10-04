import { useEffect, useRef } from 'react'

import { undoLastDeletion } from '../store/delete-actions'
import { getUndoRecord } from '../store/undo'
import { useAppStore } from '../store/use-app-store'
import { useI18n } from './use-i18n'

/** Ctrl+Z (Cmd+Z) undoes the most recent deletion, unless the key belongs to a text field or dialog. */
export function useUndoShortcut(): void {
  const { t } = useI18n()
  const translate = useRef(t)

  useEffect(() => {
    translate.current = t
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== 'z'
      ) {
        return
      }

      const store = useAppStore.getState()
      if (store.modal || store.commandOpen) {
        return
      }

      // Text fields keep their own undo.
      if (
        event.target instanceof HTMLElement &&
        (event.target.matches('input, textarea, select') ||
          event.target.isContentEditable)
      ) {
        return
      }

      if (!getUndoRecord()) {
        return
      }

      event.preventDefault()
      void undoLastDeletion((key) => translate.current(key))
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
