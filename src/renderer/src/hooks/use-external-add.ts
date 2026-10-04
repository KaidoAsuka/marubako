import { useEffect, useRef, useState } from 'react'

import type { GroupTab } from '../../../shared/types'
import { addFromTargets, type TargetInput } from '../store/entry-actions'
import { useAppStore } from '../store/use-app-store'
import { detectTargets } from '../utils/normalize-target'
import { fillTemplate } from '../utils/tab-summary'
import { useI18n } from './use-i18n'

/** What an outside drag carries that we can add: files and folders, or a link. */
function carriesTargets(data: DataTransfer | null): data is DataTransfer {
  if (!data) return false
  const types = Array.from(data.types)
  return types.includes('Files') || types.includes('text/uri-list')
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') || target.isContentEditable)
  )
}

/** The paths and addresses in a drop or a paste, read the same way for both. */
function readTargets(data: DataTransfer): TargetInput {
  const files = Array.from(data.files)
  const filePaths =
    files.length > 0 ? window.quickLaunch.getDroppedPaths(files) : []
  if (filePaths.length > 0) return { paths: filePaths, urls: [] }

  // A link dragged from a browser carries it as a uri-list ("#" lines are comments in that format);
  // pasted text carries it as plain text, one target per line.
  const text = (data.getData('text/uri-list') || data.getData('text/plain'))
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('#'))
    .join('\n')
  const input: TargetInput = { paths: [], urls: [] }
  for (const found of detectTargets(text)) {
    ;(found.kind === 'website' ? input.urls : input.paths).push(found.target)
  }

  return input
}

/** Where a drop or a paste goes: the open group popup, if there is one. */
function popupGroup(): { tab: GroupTab; id: string } | null {
  const popup = useAppStore.getState().widgetPopup
  return popup ? { tab: popup.tab, id: popup.groupId } : null
}

/**
 * Adding without a form: Ctrl+V on the panel adds what is on the clipboard (a link, a path), and
 * a file, a folder or a link dropped on the panel is added too. A group card under the pointer, or
 * the open group popup, takes it into that group; anything else lands loose in the category that
 * fits what it is, and the view follows. Returns the words to show while something is dragged over
 * the panel, null when nothing is.
 */
export function useExternalAdd(): { dropLabel: string | null } {
  const { t } = useI18n()
  const translate = useRef(t)
  useEffect(() => {
    translate.current = t
  })
  const [dropLabel, setDropLabel] = useState<string | null>(null)

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || !event.clipboardData) return
      const state = useAppStore.getState()
      // Typing, a dialog or the search box means the paste is meant for that.
      if (!state.data || state.modal || state.commandOpen) return
      if (isEditable(event.target)) return

      const input = readTargets(event.clipboardData)
      if (input.paths.length === 0 && input.urls.length === 0) return

      event.preventDefault()
      void addFromTargets(input, translate.current, {
        into: popupGroup(),
        quiet: true,
      })
    }

    let depth = 0
    let highlighted: Element | null = null
    let idle: number | undefined
    const highlight = (element: Element | null) => {
      if (highlighted === element) return
      highlighted?.classList.remove('external-drop-target')
      element?.classList.add('external-drop-target')
      highlighted = element
    }
    const finish = () => {
      depth = 0
      window.clearTimeout(idle)
      highlight(null)
      setDropLabel(null)
      document.body.classList.remove('external-drag-active')
    }
    // The group a drop at this spot would go into, and the words that say so.
    const aim = (target: EventTarget | null) => {
      const state = useAppStore.getState()
      const into = popupGroup()
      const card =
        !into && target instanceof Element
          ? target.closest('[data-top-entry-type="group"]')
          : null
      const groupId = into?.id ?? card?.getAttribute('data-top-entry-id')
      const tab = into?.tab ?? state.currentTab
      const group =
        groupId && tab !== 'tasks'
          ? state.data?.[tab].find((entry) => entry.id === groupId)
          : undefined

      return {
        card: group ? card : null,
        label: group
          ? fillTemplate(translate.current('drop_hint_group'), {
              name: group.name,
            })
          : translate.current('drop_hint'),
        into: group && tab !== 'tasks' ? { tab, id: group.id } : null,
      }
    }
    const acceptsDrops = () => {
      const state = useAppStore.getState()
      return Boolean(state.data) && !state.modal && !state.commandOpen
    }

    const onDragEnter = (event: DragEvent) => {
      if (!carriesTargets(event.dataTransfer) || !acceptsDrops()) return
      depth += 1
      // The temporary panel must not fold away under the pointer that is about to drop on it.
      document.body.classList.add('external-drag-active')
    }
    const onDragOver = (event: DragEvent) => {
      if (!carriesTargets(event.dataTransfer) || !acceptsDrops()) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      document.body.classList.add('external-drag-active')
      const { card, label } = aim(event.target)
      highlight(card)
      setDropLabel(label)
      // dragover keeps coming while the drag is over the window; if it stops, the drag has left.
      window.clearTimeout(idle)
      idle = window.setTimeout(finish, 600)
    }
    const onDragLeave = (event: DragEvent) => {
      if (!carriesTargets(event.dataTransfer)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) finish()
    }
    const onDrop = (event: DragEvent) => {
      if (!carriesTargets(event.dataTransfer) || !acceptsDrops()) {
        finish()
        return
      }
      event.preventDefault()
      const { into } = aim(event.target)
      const input = readTargets(event.dataTransfer)
      finish()
      void addFromTargets(input, translate.current, { into })
    }

    window.addEventListener('paste', onPaste)
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragend', finish)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', finish)
      finish()
    }
  }, [])

  return { dropLabel }
}
