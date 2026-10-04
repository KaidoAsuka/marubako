import { cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { FolderItem } from '../../../../shared/types'
import { translations } from '../../i18n/translations'
import { workspaceStrings } from '../../i18n/workspace'
import { deleteEntity } from '../../store/delete-actions'
import { clearUndoRecord, getUndoRecord } from '../../store/undo'
import { useAppStore } from '../../store/use-app-store'
import { useUndoShortcut } from '../use-undo-shortcut'

function folder(id: string): FolderItem {
  return {
    id,
    kind: 'folder',
    name: `Folder ${id}`,
    icon: '📁',
    path: `C:\\${id}`,
  }
}

const t = (key: string) =>
  workspaceStrings.zh[key] ?? translations.zh.strings[key] ?? key

const state = () => useAppStore.getState()
const looseIds = () => state().data!.loose.folders.map((item) => item.id)

async function deleteLooseItem() {
  await deleteEntity({ kind: 'loose', tab: 'folders', itemId: 'l2' }, t)
}

describe('Ctrl+Z undo shortcut', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    clearUndoRecord()
    const data = createDefaultAppData()
    data.loose.folders = [folder('l1'), folder('l2'), folder('l3')]
    data.topOrder.folders = [
      { type: 'loose', id: 'l1' },
      { type: 'loose', id: 'l2' },
      { type: 'loose', id: 'l3' },
    ]
    useAppStore.setState({
      data,
      loading: false,
      saving: false,
      error: null,
      currentTab: 'folders',
      modal: null,
      commandOpen: false,
      toast: null,
    })
    await deleteLooseItem()
    expect(looseIds()).toEqual(['l1', 'l3'])
  })

  afterEach(() => {
    cleanup()
    clearUndoRecord()
    state().clearToast()
    document.body.innerHTML = ''
  })

  it('undoes the last deletion', async () => {
    renderHook(useUndoShortcut)

    const notCancelled = fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    expect(notCancelled).toBe(false)
    await vi.waitFor(() => expect(looseIds()).toEqual(['l1', 'l2', 'l3']))
    expect(getUndoRecord()).toBeNull()
  })

  it('also answers to the Command key', async () => {
    renderHook(useUndoShortcut)

    fireEvent.keyDown(window, { key: 'Z', metaKey: true })

    await vi.waitFor(() => expect(looseIds()).toEqual(['l1', 'l2', 'l3']))
  })

  it.each([
    ['an input', () => document.createElement('input')],
    ['a textarea', () => document.createElement('textarea')],
    ['a select', () => document.createElement('select')],
    [
      'a contenteditable element',
      () => {
        const element = document.createElement('div')
        element.contentEditable = 'true'
        // jsdom does not implement isContentEditable; the shortcut relies on it.
        Object.defineProperty(element, 'isContentEditable', { value: true })
        return element
      },
    ],
  ])('leaves Ctrl+Z to %s', async (_label, create) => {
    renderHook(useUndoShortcut)
    const field = create()
    document.body.append(field)

    const notCancelled = fireEvent.keyDown(field, { key: 'z', ctrlKey: true })

    expect(notCancelled).toBe(true)
    await Promise.resolve()
    expect(looseIds()).toEqual(['l1', 'l3'])
    expect(getUndoRecord()).not.toBeNull()
  })

  it('does nothing while a modal is open', async () => {
    useAppStore.setState({
      modal: { kind: 'settings' },
    })
    renderHook(useUndoShortcut)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await Promise.resolve()
    expect(looseIds()).toEqual(['l1', 'l3'])
  })

  it('does nothing while the command palette is open', async () => {
    useAppStore.setState({ commandOpen: true })
    renderHook(useUndoShortcut)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await Promise.resolve()
    expect(looseIds()).toEqual(['l1', 'l3'])
  })

  it('ignores other chords and a missing modifier', async () => {
    renderHook(useUndoShortcut)

    fireEvent.keyDown(window, { key: 'z' })
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })

    await Promise.resolve()
    expect(looseIds()).toEqual(['l1', 'l3'])
  })

  it('leaves the key alone when there is nothing to undo', () => {
    clearUndoRecord()
    renderHook(useUndoShortcut)

    const notCancelled = fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    expect(notCancelled).toBe(true)
  })

  it('stops listening once unmounted', async () => {
    const { unmount } = renderHook(useUndoShortcut)
    unmount()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    await Promise.resolve()
    expect(looseIds()).toEqual(['l1', 'l3'])
  })
})
