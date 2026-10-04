import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { AppData, FolderItem } from '../../../../shared/types'
import { translations } from '../../i18n/translations'
import { workspaceStrings } from '../../i18n/workspace'
import { deleteEntity, undoLastDeletion } from '../delete-actions'
import { UNDO_WINDOW_MS, clearUndoRecord, getUndoRecord } from '../undo'
import { useAppStore } from '../use-app-store'

const t = (key: string) =>
  workspaceStrings.zh[key] ?? translations.zh.strings[key] ?? key

function folder(id: string): FolderItem {
  return {
    id,
    kind: 'folder',
    name: `Folder ${id}`,
    icon: '📁',
    path: `C:\\${id}`,
  }
}

function seedData(): AppData {
  const data = createDefaultAppData()
  data.folders = [
    {
      id: 'g-work',
      name: 'Work',
      icon: '💼',
      open: true,
      items: [folder('a1'), folder('a2'), folder('a3')],
    },
    { id: 'g-empty', name: 'Empty', icon: '📂', open: true, items: [] },
  ]
  data.loose.folders = [folder('l1'), folder('l2'), folder('l3')]
  data.topOrder.folders = [
    { type: 'loose', id: 'l1' },
    { type: 'group', id: 'g-work' },
    { type: 'loose', id: 'l2' },
    { type: 'group', id: 'g-empty' },
    { type: 'loose', id: 'l3' },
  ]
  return data
}

const state = () => useAppStore.getState()
const looseIds = () => state().data!.loose.folders.map((item) => item.id)
const groupIds = () => state().data!.folders.map((group) => group.id)
const topOrder = () =>
  state().data!.topOrder.folders.map((entry) => `${entry.type}:${entry.id}`)
const workItemIds = () =>
  state()
    .data!.folders.find((group) => group.id === 'g-work')!
    .items.map((item) => item.id)

const ORIGINAL_TOP_ORDER = [
  'loose:l1',
  'group:g-work',
  'loose:l2',
  'group:g-empty',
  'loose:l3',
]

describe('delete with undo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearUndoRecord()
    state().clearToast()
    useAppStore.setState({
      data: seedData(),
      loading: false,
      saving: false,
      error: null,
      currentTab: 'folders',
      modal: null,
      toast: null,
      widgetPopup: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    clearUndoRecord()
    state().clearToast()
  })

  it('deletes a loose item at once and offers an undo in the toast', async () => {
    await deleteEntity({ kind: 'loose', tab: 'folders', itemId: 'l2' }, t)

    expect(looseIds()).toEqual(['l1', 'l3'])
    expect(state().modal).toBeNull()
    expect(window.quickLaunch.saveData).toHaveBeenCalledTimes(1)
    expect(state().toast?.message).toBe('已删除「Folder l2」')
    expect(state().toast?.action?.label).toBe('撤销')
  })

  it('puts a loose item back at its original index and top-order position', async () => {
    await deleteEntity({ kind: 'loose', tab: 'folders', itemId: 'l2' }, t)
    expect(topOrder()).not.toContain('loose:l2')

    state().toast!.action!.run()
    await vi.waitFor(() => expect(looseIds()).toEqual(['l1', 'l2', 'l3']))

    expect(topOrder()).toEqual(ORIGINAL_TOP_ORDER)
    expect(getUndoRecord()).toBeNull()
  })

  it('puts a grouped item back at its original index', async () => {
    await deleteEntity(
      { kind: 'groupItem', tab: 'folders', groupId: 'g-work', itemId: 'a2' },
      t
    )
    expect(workItemIds()).toEqual(['a1', 'a3'])

    await undoLastDeletion(t)

    expect(workItemIds()).toEqual(['a1', 'a2', 'a3'])
    expect(topOrder()).toEqual(ORIGINAL_TOP_ORDER)
  })

  it('deletes an empty group at once and restores it in place', async () => {
    await deleteEntity({ kind: 'group', tab: 'folders', groupId: 'g-empty' }, t)

    expect(state().modal).toBeNull()
    expect(groupIds()).toEqual(['g-work'])
    expect(state().toast?.action).toBeDefined()

    await undoLastDeletion(t)

    expect(groupIds()).toEqual(['g-work', 'g-empty'])
    expect(topOrder()).toEqual(ORIGINAL_TOP_ORDER)
  })

  it('asks one confirmation naming the group and its item count before deleting a group that has items', async () => {
    await deleteEntity({ kind: 'group', tab: 'folders', groupId: 'g-work' }, t)

    const modal = state().modal
    expect(modal?.kind).toBe('confirm')
    if (modal?.kind !== 'confirm') throw new Error('expected a confirm modal')
    expect(modal.title).toBe('删除分组「Work」及其中 3 个条目？')
    expect(groupIds()).toEqual(['g-work', 'g-empty'])
    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()

    modal.onConfirm()
    await vi.waitFor(() => expect(groupIds()).toEqual(['g-empty']))
    expect(state().modal).toBeNull()
    expect(state().toast?.message).toBe('已删除「Work」')
    expect(state().toast?.action?.label).toBe('撤销')

    await undoLastDeletion(t)

    const restored = state().data!.folders[0]!
    expect(restored.id).toBe('g-work')
    expect(restored.items.map((item) => item.id)).toEqual(['a1', 'a2', 'a3'])
    expect(topOrder()).toEqual(ORIGINAL_TOP_ORDER)
  })

  it('never asks for confirmation for single items', async () => {
    await deleteEntity(
      { kind: 'groupItem', tab: 'folders', groupId: 'g-work', itemId: 'a1' },
      t
    )

    expect(state().modal).toBeNull()
    expect(workItemIds()).toEqual(['a2', 'a3'])
  })

  it('keeps edits that happened after the delete by restoring only the entity', async () => {
    await deleteEntity({ kind: 'loose', tab: 'folders', itemId: 'l2' }, t)

    // Something outside updateData changes unrelated data while the undo is pending.
    useAppStore.setState((current) => ({
      data: {
        ...current.data!,
        prefs: { ...current.data!.prefs, zoom: 1.3 },
      },
    }))

    await undoLastDeletion(t)

    expect(looseIds()).toEqual(['l1', 'l2', 'l3'])
    expect(state().data!.prefs.zoom).toBe(1.3)
  })

  it('keeps only the most recent deletion', async () => {
    await deleteEntity({ kind: 'loose', tab: 'folders', itemId: 'l1' }, t)
    await deleteEntity({ kind: 'loose', tab: 'folders', itemId: 'l3' }, t)
    expect(looseIds()).toEqual(['l2'])

    await undoLastDeletion(t)
    expect(looseIds()).toEqual(['l2', 'l3'])

    // Nothing is left to undo: a second undo must not bring l1 back.
    expect(getUndoRecord()).toBeNull()
    expect(await undoLastDeletion(t)).toBe(false)
    expect(looseIds()).toEqual(['l2', 'l3'])
  })

  it('keeps the undo available after the toast has gone away', async () => {
    vi.useFakeTimers()
    await deleteEntity({ kind: 'loose', tab: 'folders', itemId: 'l2' }, t)

    await vi.advanceTimersByTimeAsync(6100)
    expect(state().toast).toBeNull()
    expect(getUndoRecord()).not.toBeNull()

    expect(await undoLastDeletion(t)).toBe(true)
    expect(looseIds()).toEqual(['l1', 'l2', 'l3'])
  })

  it('drops the undo, and the toast that offers it, on the next ordinary data change', async () => {
    await deleteEntity({ kind: 'loose', tab: 'folders', itemId: 'l2' }, t)
    const staleAction = state().toast!.action!

    await state().updateData((draft) => {
      draft.prefs.zoom = 1.2
    })

    expect(getUndoRecord()).toBeNull()
    expect(state().toast).toBeNull()
    expect(await undoLastDeletion(t)).toBe(false)
    staleAction.run()
    await Promise.resolve()
    expect(looseIds()).toEqual(['l1', 'l3'])
    expect(state().data!.prefs.zoom).toBe(1.2)
  })

  it('drops the undo when data is imported', async () => {
    await deleteEntity({ kind: 'loose', tab: 'folders', itemId: 'l2' }, t)
    const imported = seedData()
    imported.loose.folders = [folder('x1')]
    imported.topOrder.folders = [{ type: 'loose', id: 'x1' }]
    vi.mocked(window.quickLaunch.importData).mockResolvedValueOnce({
      ok: true,
      data: {
        canceled: false,
        data: imported,
        filePath: 'C:\\backup.json',
        importedAt: new Date().toISOString(),
      },
    })

    await state().importData()

    expect(looseIds()).toEqual(['x1'])
    expect(getUndoRecord()).toBeNull()
    expect(await undoLastDeletion(t)).toBe(false)
    expect(looseIds()).toEqual(['x1'])
  })

  it('drops the undo when the data is loaded again', async () => {
    await deleteEntity({ kind: 'loose', tab: 'folders', itemId: 'l2' }, t)

    await state().loadData()

    expect(getUndoRecord()).toBeNull()
    expect(state().toast).toBeNull()
  })

  it('forgets the deletion five minutes later', async () => {
    vi.useFakeTimers()
    await deleteEntity({ kind: 'loose', tab: 'folders', itemId: 'l2' }, t)

    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1000)
    expect(getUndoRecord()).not.toBeNull()

    await vi.advanceTimersByTimeAsync(1001)
    expect(getUndoRecord()).toBeNull()
    expect(await undoLastDeletion(t)).toBe(false)
    expect(looseIds()).toEqual(['l1', 'l3'])
  })

  it('keeps the record and reports the error when restoring cannot be saved', async () => {
    await deleteEntity({ kind: 'loose', tab: 'folders', itemId: 'l2' }, t)
    vi.mocked(window.quickLaunch.saveData).mockResolvedValueOnce({
      ok: false,
      error: 'disk full',
    })

    expect(await undoLastDeletion(t)).toBe(false)

    expect(looseIds()).toEqual(['l1', 'l3'])
    expect(state().toast?.tone).toBe('danger')
    expect(getUndoRecord()).not.toBeNull()
    expect(await undoLastDeletion(t)).toBe(true)
    expect(looseIds()).toEqual(['l1', 'l2', 'l3'])
  })

  it('does not offer an undo when the delete itself could not be saved', async () => {
    vi.mocked(window.quickLaunch.saveData).mockResolvedValueOnce({
      ok: false,
      error: 'disk full',
    })

    await deleteEntity({ kind: 'loose', tab: 'folders', itemId: 'l2' }, t)

    expect(looseIds()).toEqual(['l1', 'l2', 'l3'])
    expect(getUndoRecord()).toBeNull()
    expect(state().toast?.tone).toBe('danger')
    expect(state().toast?.action).toBeUndefined()
  })

  it('shows the restored entity by switching to its tab', async () => {
    await deleteEntity({ kind: 'loose', tab: 'folders', itemId: 'l2' }, t)
    state().setCurrentTab('tasks')

    await undoLastDeletion(t)

    expect(state().currentTab).toBe('folders')
    expect(state().toast?.message).toBe('已恢复「Folder l2」')
  })

  describe('a password this computer cannot decrypt', () => {
    function seedLostPassword() {
      const data = state().data!
      data.loose.passwords = [
        {
          id: 'pw-lost',
          kind: 'password',
          name: 'Old mail',
          icon: '🔑',
          username: 'me',
          password: '',
          note: '',
          passwordLost: true,
        },
        {
          id: 'pw-fine',
          kind: 'password',
          name: 'Fine',
          icon: '🔑',
          username: 'me',
          password: 'x',
          note: '',
        },
      ]
      data.topOrder.passwords = [
        { type: 'loose', id: 'pw-lost' },
        { type: 'loose', id: 'pw-fine' },
      ]
      useAppStore.setState({ data, currentTab: 'passwords' })
    }

    it('asks first, names the entry, and is deleted without an undo', async () => {
      seedLostPassword()

      await deleteEntity(
        { kind: 'loose', tab: 'passwords', itemId: 'pw-lost' },
        t
      )

      const modal = state().modal
      expect(modal).toMatchObject({ kind: 'confirm' })
      expect((modal as { title: string }).title).toContain('Old mail')
      expect((modal as { title: string }).title).toContain('无法撤销')
      expect(state().data!.loose.passwords).toHaveLength(2)
      ;(modal as { onConfirm: () => void }).onConfirm()
      await vi.waitFor(() =>
        expect(state().data!.loose.passwords.map((item) => item.id)).toEqual([
          'pw-fine',
        ])
      )

      expect(getUndoRecord()).toBeNull()
      expect(state().toast?.action).toBeUndefined()
      expect(state().toast?.message).toContain('Old mail')
    })

    it('does not ask for a password that decrypted fine, and still offers an undo', async () => {
      seedLostPassword()

      await deleteEntity(
        { kind: 'loose', tab: 'passwords', itemId: 'pw-fine' },
        t
      )

      expect(state().modal).toBeNull()
      expect(getUndoRecord()).not.toBeNull()
      expect(state().toast?.action).toBeDefined()
    })

    it('asks first for a group that holds one, and offers no undo', async () => {
      seedLostPassword()
      const data = state().data!
      data.passwords = [
        {
          id: 'g-pw',
          name: 'Mail',
          icon: '📂',
          open: true,
          items: [structuredClone(data.loose.passwords[0]!)],
        },
      ]
      data.topOrder.passwords.push({ type: 'group', id: 'g-pw' })
      useAppStore.setState({ data })

      await deleteEntity(
        { kind: 'group', tab: 'passwords', groupId: 'g-pw' },
        t
      )

      expect((state().modal as { title: string }).title).toContain('Mail')
      expect((state().modal as { title: string }).title).toContain('无法撤销')
      ;(state().modal as { onConfirm: () => void }).onConfirm()
      await vi.waitFor(() => expect(state().data!.passwords).toHaveLength(0))
      expect(getUndoRecord()).toBeNull()
    })
  })
})
