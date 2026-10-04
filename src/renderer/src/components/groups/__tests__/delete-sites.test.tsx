import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { AppData, FolderItem } from '../../../../../shared/types'
import { clearUndoRecord, getUndoRecord } from '../../../store/undo'
import { useAppStore } from '../../../store/use-app-store'
import GridItem from '../../items/GridItem'
import ItemRow from '../../items/ItemRow'
import FolderWidget from '../FolderWidget'
import GroupCard from '../GroupCard'
import LooseWidget from '../LooseWidget'

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
      items: [folder('a1'), folder('a2')],
    },
    { id: 'g-empty', name: 'Empty', icon: '📂', open: true, items: [] },
  ]
  data.loose.folders = [folder('l1'), folder('l2')]
  data.topOrder.folders = [
    { type: 'group', id: 'g-work' },
    { type: 'loose', id: 'l1' },
    { type: 'group', id: 'g-empty' },
    { type: 'loose', id: 'l2' },
  ]
  return data
}

const state = () => useAppStore.getState()
const toastAction = () => state().toast?.action

describe('delete sites share one delete-with-undo flow', () => {
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
      appIcons: {},
    })
  })

  afterEach(() => {
    cleanup()
    clearUndoRecord()
    state().clearToast()
  })

  describe('FolderWidget', () => {
    const renderWidget = (groupId: string, name: string, count: number) =>
      render(
        <FolderWidget
          tab="folders"
          groupId={groupId}
          name={name}
          icon="💼"
          count={count}
          previewIcons={[]}
        />
      )

    it('confirms once, naming the group and its item count, when it holds items', async () => {
      renderWidget('g-work', 'Work', 2)

      fireEvent.click(screen.getByRole('button', { name: '删除' }))

      const modal = state().modal
      expect(modal).toMatchObject({
        kind: 'confirm',
        title: '删除分组「Work」及其中 2 个条目？',
      })
      expect(state().data!.folders.map((group) => group.id)).toEqual([
        'g-work',
        'g-empty',
      ])

      if (modal?.kind !== 'confirm') throw new Error('expected a confirm modal')
      modal.onConfirm()
      await vi.waitFor(() =>
        expect(state().data!.folders.map((group) => group.id)).toEqual([
          'g-empty',
        ])
      )
      expect(toastAction()?.label).toBe('撤销')
    })

    it('deletes an empty group immediately, with an undo', async () => {
      renderWidget('g-empty', 'Empty', 0)

      fireEvent.click(screen.getByRole('button', { name: '删除' }))

      expect(state().modal).toBeNull()
      await vi.waitFor(() =>
        expect(state().data!.folders.map((group) => group.id)).toEqual([
          'g-work',
        ])
      )
      expect(state().toast?.message).toBe('已删除「Empty」')
      expect(toastAction()?.label).toBe('撤销')
      expect(getUndoRecord()?.kind).toBe('group')
    })
  })

  it('LooseWidget deletes at once and can be undone from the toast', async () => {
    render(<LooseWidget tab="folders" item={folder('l1')} />)

    fireEvent.click(screen.getByRole('button', { name: '删除' }))

    expect(state().modal).toBeNull()
    await vi.waitFor(() =>
      expect(state().data!.loose.folders.map((item) => item.id)).toEqual(['l2'])
    )
    expect(state().toast?.message).toBe('已删除「Folder l1」')

    toastAction()!.run()
    await vi.waitFor(() =>
      expect(state().data!.loose.folders.map((item) => item.id)).toEqual([
        'l1',
        'l2',
      ])
    )
    expect(state().data!.topOrder.folders[1]).toEqual({
      type: 'loose',
      id: 'l1',
    })
  })

  it('GridItem deletes a grouped item at once', async () => {
    render(<GridItem tab="folders" groupId="g-work" item={folder('a1')} />)

    fireEvent.click(screen.getByTestId('delete-item-a1'))

    expect(state().modal).toBeNull()
    await vi.waitFor(() =>
      expect(state().data!.folders[0]!.items.map((item) => item.id)).toEqual([
        'a2',
      ])
    )
    expect(toastAction()?.label).toBe('撤销')
    expect(getUndoRecord()).toMatchObject({
      kind: 'groupItem',
      groupId: 'g-work',
      index: 0,
    })
  })

  describe('ItemRow', () => {
    it('deletes a loose item at once instead of confirming', async () => {
      render(<ItemRow tab="folders" groupId={null} item={folder('l2')} />)

      fireEvent.click(screen.getByTestId('delete-item-l2'))

      expect(state().modal).toBeNull()
      await vi.waitFor(() =>
        expect(state().data!.loose.folders.map((item) => item.id)).toEqual([
          'l1',
        ])
      )
      expect(getUndoRecord()?.kind).toBe('loose')
      expect(toastAction()?.label).toBe('撤销')
    })

    it('deletes a grouped item at once instead of confirming', async () => {
      render(<ItemRow tab="folders" groupId="g-work" item={folder('a2')} />)

      fireEvent.click(screen.getByTestId('delete-item-a2'))

      expect(state().modal).toBeNull()
      await vi.waitFor(() =>
        expect(state().data!.folders[0]!.items.map((item) => item.id)).toEqual([
          'a1',
        ])
      )
      expect(getUndoRecord()?.kind).toBe('groupItem')
    })
  })

  describe('GroupCard', () => {
    it('confirms once, naming the group and its item count, when it holds items', () => {
      const group = seedData().folders[0]!
      render(<GroupCard tab="folders" group={group} />)

      fireEvent.click(screen.getByTestId('delete-group-g-work'))

      expect(state().modal).toMatchObject({
        kind: 'confirm',
        title: '删除分组「Work」及其中 2 个条目？',
      })
      expect(state().data!.folders).toHaveLength(2)
    })

    it('deletes an empty group immediately, with an undo', async () => {
      const group = seedData().folders[1]!
      render(<GroupCard tab="folders" group={group} />)

      fireEvent.click(screen.getByTestId('delete-group-g-empty'))

      expect(state().modal).toBeNull()
      await vi.waitFor(() =>
        expect(state().data!.folders.map((entry) => entry.id)).toEqual([
          'g-work',
        ])
      )
      expect(toastAction()?.label).toBe('撤销')
    })
  })
})
