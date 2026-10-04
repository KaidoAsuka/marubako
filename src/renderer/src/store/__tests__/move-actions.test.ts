import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { AppData, FolderItem } from '../../../../shared/types'
import { translations } from '../../i18n/translations'
import { workspaceStrings } from '../../i18n/workspace'
import { moveEntry } from '../move-actions'
import { clearUndoRecord } from '../undo'
import { useAppStore } from '../use-app-store'

const t = (lang: 'zh' | 'en' | 'ja') => (key: string) =>
  workspaceStrings[lang][key] ?? translations[lang].strings[key] ?? key
const tz = t('zh')
const te = t('en')

function folder(id: string): FolderItem {
  return {
    id,
    kind: 'folder',
    name: `Folder ${id}`,
    icon: 'F',
    path: `C:\\${id}`,
  }
}

function seedData(): AppData {
  const data = createDefaultAppData()
  data.folders = [
    {
      id: 'g-work',
      name: 'Work',
      icon: 'W',
      open: true,
      items: [folder('a1'), folder('a2'), folder('a3')],
    },
    {
      id: 'g-home',
      name: 'Home',
      icon: 'H',
      open: true,
      items: [folder('h1')],
    },
    { id: 'g-noname', name: '', icon: 'N', open: true, items: [] },
  ]
  data.loose.folders = [folder('l1'), folder('l2'), folder('l3')]
  data.topOrder.folders = [
    { type: 'loose', id: 'l1' },
    { type: 'group', id: 'g-work' },
    { type: 'loose', id: 'l2' },
    { type: 'group', id: 'g-home' },
    { type: 'group', id: 'g-noname' },
    { type: 'loose', id: 'l3' },
  ]

  return data
}

const state = () => useAppStore.getState()
const looseIds = () => state().data!.loose.folders.map((item) => item.id)
const itemIds = (groupId: string) =>
  state()
    .data!.folders.find((group) => group.id === groupId)!
    .items.map((item) => item.id)
const topOrder = () =>
  state().data!.topOrder.folders.map((entry) => `${entry.type}:${entry.id}`)

async function undo(): Promise<void> {
  state().toast!.action!.run()
  await vi.waitFor(() => expect(state().saving).toBe(false))
  // The undo runs behind the toast button: let its save settle.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('moveEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearUndoRecord()
    useAppStore.setState({
      data: seedData(),
      currentTab: 'folders',
      loading: false,
      saving: false,
      error: null,
      toast: null,
    })
  })

  it('moves a standalone entry into a group, at its end', async () => {
    const moved = await moveEntry('folders', 'l2', null, 'g-work', tz)

    expect(moved).toBe(true)
    expect(itemIds('g-work')).toEqual(['a1', 'a2', 'a3', 'l2'])
    expect(looseIds()).toEqual(['l1', 'l3'])
    expect(topOrder()).not.toContain('loose:l2')
  })

  it('moves an entry from one group to another', async () => {
    await moveEntry('folders', 'a2', 'g-work', 'g-home', tz)

    expect(itemIds('g-work')).toEqual(['a1', 'a3'])
    expect(itemIds('g-home')).toEqual(['h1', 'a2'])
  })

  it('moves an entry out of its group to the standalone entries', async () => {
    await moveEntry('folders', 'a1', 'g-work', null, tz)

    expect(itemIds('g-work')).toEqual(['a2', 'a3'])
    expect(looseIds()).toEqual(['l1', 'l2', 'l3', 'a1'])
    expect(topOrder().at(-1)).toBe('loose:a1')
  })

  it('does nothing for the group it is already in, or one that does not exist', async () => {
    expect(await moveEntry('folders', 'a1', 'g-work', 'g-work', tz)).toBe(false)
    expect(await moveEntry('folders', 'l1', null, null, tz)).toBe(false)
    expect(await moveEntry('folders', 'l1', null, 'g-gone', tz)).toBe(false)
    expect(await moveEntry('folders', 'ghost', null, 'g-work', tz)).toBe(false)

    expect(window.quickLaunch.saveData).not.toHaveBeenCalled()
    expect(state().toast).toBeNull()
  })

  it('does not move an entry from a group it is not in', async () => {
    expect(await moveEntry('folders', 'a1', 'g-home', 'g-work', tz)).toBe(false)
    expect(itemIds('g-work')).toEqual(['a1', 'a2', 'a3'])
  })

  describe('the message', () => {
    it.each([
      ['zh', '已移到「Work」'],
      ['en', 'Moved to "Work"'],
      ['ja', '「Work」に移動しました'],
    ] as const)('says where it went, in %s', async (lang, message) => {
      await moveEntry('folders', 'l1', null, 'g-work', t(lang))

      expect(state().toast?.message).toBe(message)
      expect(state().toast?.tone).toBe('info')
      expect(state().toast?.action?.label).toBe(
        { zh: '撤销', en: 'Undo', ja: '元に戻す' }[lang]
      )
    })

    it('names the standalone entries when that is where it went', async () => {
      await moveEntry('folders', 'a1', 'g-work', null, te)

      expect(state().toast?.message).toBe('Moved to "Standalone items"')
    })

    it('does not leave a group without a name unnamed', async () => {
      await moveEntry('folders', 'l1', null, 'g-noname', te)

      expect(state().toast?.message).toBe('Moved to "Unnamed group"')
    })

    it('says nothing when the move could not be saved', async () => {
      vi.mocked(window.quickLaunch.saveData).mockResolvedValueOnce({
        ok: false,
        error: 'disk full',
      })

      const moved = await moveEntry('folders', 'l1', null, 'g-work', tz)

      expect(moved).toBe(false)
      // The data was put back, and the toast is the error.
      expect(itemIds('g-work')).toEqual(['a1', 'a2', 'a3'])
      expect(state().toast?.tone).toBe('danger')
    })
  })

  describe('undo', () => {
    it('puts a standalone entry back at its old place among the others', async () => {
      const before = topOrder()
      await moveEntry('folders', 'l2', null, 'g-work', tz)

      await undo()

      expect(looseIds()).toEqual(['l1', 'l2', 'l3'])
      expect(itemIds('g-work')).toEqual(['a1', 'a2', 'a3'])
      expect(topOrder()).toEqual(before)
    })

    it('puts an entry back at its old index in its old group', async () => {
      await moveEntry('folders', 'a2', 'g-work', 'g-home', tz)

      await undo()

      expect(itemIds('g-work')).toEqual(['a1', 'a2', 'a3'])
      expect(itemIds('g-home')).toEqual(['h1'])
    })

    it('puts an entry that left its group back into it', async () => {
      await moveEntry('folders', 'a1', 'g-work', null, tz)

      await undo()

      expect(itemIds('g-work')).toEqual(['a1', 'a2', 'a3'])
      expect(looseIds()).toEqual(['l1', 'l2', 'l3'])
    })

    it('keeps a rename made after the move', async () => {
      await moveEntry('folders', 'a2', 'g-work', 'g-home', tz)
      await state().updateData((draft) => {
        draft.folders.find((group) => group.id === 'g-home')!.items[1]!.name =
          'Renamed'
      })

      await undo()

      expect(
        state().data!.folders.find((group) => group.id === 'g-work')!.items[1]
          ?.name
      ).toBe('Renamed')
    })

    it('does nothing when the entry was deleted in between', async () => {
      await moveEntry('folders', 'l2', null, 'g-work', tz)
      const undoToast = state().toast!.action!
      await state().updateData((draft) => {
        draft.folders.find((group) => group.id === 'g-work')!.items.pop()
      })

      undoToast.run()
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(looseIds()).toEqual(['l1', 'l3'])
      expect(itemIds('g-work')).toEqual(['a1', 'a2', 'a3'])
    })

    it('does nothing twice if pressed twice', async () => {
      await moveEntry('folders', 'a1', 'g-work', 'g-home', tz)
      const run = state().toast!.action!.run

      run()
      await new Promise((resolve) => setTimeout(resolve, 20))
      run()
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(itemIds('g-work')).toEqual(['a1', 'a2', 'a3'])
      expect(itemIds('g-home')).toEqual(['h1'])
    })
  })

  it('works in every category, not only folders', async () => {
    const data = createDefaultAppData()
    data.notes = [
      { id: 'g1', name: 'One', icon: 'N', open: true, items: [] },
      { id: 'g2', name: 'Two', icon: 'N', open: true, items: [] },
    ]
    data.loose.notes = [
      { id: 'n1', kind: 'note', name: 'Note', icon: 'N', content: 'text' },
    ]
    useAppStore.setState({ data })

    await moveEntry('notes', 'n1', null, 'g2', te)

    expect(
      state().data!.notes.find((group) => group.id === 'g2')!.items
    ).toHaveLength(1)
    expect(state().data!.loose.notes).toHaveLength(0)
  })
})
