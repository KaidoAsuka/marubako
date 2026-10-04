import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import { useAppStore } from '../use-app-store'

describe('useAppStore', () => {
  beforeEach(() => {
    const data = createDefaultAppData()
    data.folders = [
      {
        id: 'group-folders-test',
        name: 'Work',
        icon: 'W',
        open: true,
        items: [
          {
            id: 'folder-item-test',
            kind: 'folder',
            name: 'Docs',
            path: 'C:\\Work\\Docs',
            icon: 'D',
          },
        ],
      },
      {
        id: 'group-folders-next',
        name: 'Personal',
        icon: 'P',
        open: true,
        items: [],
      },
    ]
    data.loose.folders = []
    data.topOrder.folders = [
      { type: 'group', id: 'group-folders-test' },
      { type: 'group', id: 'group-folders-next' },
    ]

    useAppStore.setState({
      data,
      loading: false,
      saving: false,
      error: null,
      currentTab: 'folders',
      selectedDate: '2026-04-10',
      modal: null,
      toast: null,
      widgetPopup: { tab: 'folders', groupId: 'group-folders-test' },
      revealedPasswordIds: [],
      expandedNoteIds: [],
      appIcons: {},
      windowState: {
        alwaysOnTop: true,
        collapsed: false,
        opacity: 1,
      },
    })

    vi.clearAllMocks()
  })

  it('moves a grouped item back to the loose collection', async () => {
    await useAppStore
      .getState()
      .moveGroupItemToLoose('folders', 'group-folders-test', 'folder-item-test')

    const state = useAppStore.getState()

    expect(state.data?.folders[0]?.items).toHaveLength(0)
    expect(state.data?.loose.folders.map((item) => item.id)).toEqual([
      'folder-item-test',
    ])
    expect(window.quickLaunch.saveData).toHaveBeenCalledTimes(1)
  })

  it('starts on the first tab even when the persisted lastTab is tasks', async () => {
    const persistedData = createDefaultAppData()
    persistedData.prefs.lastTab = 'tasks'

    vi.mocked(window.quickLaunch.loadData).mockResolvedValue({
      ok: true,
      data: persistedData,
    })

    await useAppStore.getState().loadData()

    const state = useAppStore.getState()

    expect(state.currentTab).toBe('folders')
    expect(state.data?.prefs.lastTab).toBe('folders')
  })

  it('inserts a grouped item after the target top entry when moving it loose', async () => {
    await useAppStore
      .getState()
      .moveGroupItemToLooseAt(
        'folders',
        'group-folders-test',
        'folder-item-test',
        { type: 'group', id: 'group-folders-next' },
        'after'
      )

    const state = useAppStore.getState()

    expect(state.data?.topOrder.folders).toEqual([
      { type: 'group', id: 'group-folders-test' },
      { type: 'group', id: 'group-folders-next' },
      { type: 'loose', id: 'folder-item-test' },
    ])
  })

  it('keeps a top-level group after the hovered target when placement is after', async () => {
    await useAppStore
      .getState()
      .reorderTopEntries(
        'folders',
        'group:group-folders-next',
        'group:group-folders-test',
        'after'
      )

    const state = useAppStore.getState()

    expect(state.data?.topOrder.folders).toEqual([
      { type: 'group', id: 'group-folders-test' },
      { type: 'group', id: 'group-folders-next' },
    ])
  })

  it('moves a loose item into a group relative to an existing item', async () => {
    useAppStore.setState((state) => ({
      data: state.data
        ? {
            ...state.data,
            loose: {
              ...state.data.loose,
              folders: [
                {
                  id: 'folder-item-loose',
                  kind: 'folder',
                  name: 'Loose',
                  path: 'C:\\Loose',
                  icon: 'L',
                },
              ],
            },
            topOrder: {
              ...state.data.topOrder,
              folders: [
                { type: 'group', id: 'group-folders-test' },
                { type: 'loose', id: 'folder-item-loose' },
                { type: 'group', id: 'group-folders-next' },
              ],
            },
          }
        : null,
    }))

    await useAppStore
      .getState()
      .moveItemRelative(
        'folders',
        null,
        'folder-item-loose',
        'group-folders-test',
        'folder-item-test',
        'before'
      )

    const state = useAppStore.getState()

    expect(state.data?.loose.folders).toHaveLength(0)
    expect(state.data?.folders[0]?.items.map((item) => item.id)).toEqual([
      'folder-item-loose',
      'folder-item-test',
    ])
  })

  it('moves a grouped item relative to another grouped item in a different group', async () => {
    useAppStore.setState((state) => ({
      data: state.data
        ? {
            ...state.data,
            folders: state.data.folders.map((group) =>
              group.id === 'group-folders-next'
                ? {
                    ...group,
                    items: [
                      {
                        id: 'folder-item-target',
                        kind: 'folder',
                        name: 'Target',
                        path: 'C:\\Target',
                        icon: 'T',
                      },
                    ],
                  }
                : group
            ),
          }
        : null,
    }))

    await useAppStore
      .getState()
      .moveItemRelative(
        'folders',
        'group-folders-test',
        'folder-item-test',
        'group-folders-next',
        'folder-item-target',
        'before'
      )

    const state = useAppStore.getState()

    expect(state.data?.folders[0]?.items).toHaveLength(0)
    expect(state.data?.folders[1]?.items.map((item) => item.id)).toEqual([
      'folder-item-test',
      'folder-item-target',
    ])
  })

  it('exports the current data through the preload bridge', async () => {
    await useAppStore.getState().exportData({ successMessage: 'Exported' })

    expect(window.quickLaunch.exportData).toHaveBeenCalledTimes(1)
    // The backup that can be imported again, unless another format is asked for.
    expect(window.quickLaunch.exportData).toHaveBeenCalledWith(
      useAppStore.getState().data,
      'json'
    )
    expect(useAppStore.getState().toast).toEqual({
      message: 'Exported',
      tone: 'success',
    })
  })

  it('asks for the list for reading when the export is to be Markdown', async () => {
    await useAppStore
      .getState()
      .exportData({ format: 'markdown', successMessage: 'List exported' })

    expect(window.quickLaunch.exportData).toHaveBeenCalledTimes(1)
    expect(window.quickLaunch.exportData).toHaveBeenCalledWith(
      useAppStore.getState().data,
      'markdown'
    )
    expect(useAppStore.getState().toast).toEqual({
      message: 'List exported',
      tone: 'success',
    })
  })

  it('replaces store data from an imported backup and clears transient ui state', async () => {
    const imported = createDefaultAppData()
    imported.folders = [
      {
        id: 'group-imported',
        name: 'Imported',
        icon: 'I',
        open: true,
        items: [],
      },
    ]
    imported.topOrder.folders = [{ type: 'group', id: 'group-imported' }]

    vi.mocked(window.quickLaunch.importData).mockResolvedValue({
      ok: true,
      data: {
        canceled: false,
        data: imported,
        filePath: 'C:\\backup\\import.json',
        importedAt: new Date().toISOString(),
      },
    })

    useAppStore.setState({
      widgetPopup: { tab: 'folders', groupId: 'group-folders-test' },
      revealedPasswordIds: ['password-1'],
      expandedNoteIds: ['note-1'],
    })

    await useAppStore.getState().importData({ successMessage: 'Imported' })

    const state = useAppStore.getState()

    expect(state.data?.folders.map((group) => group.id)).toEqual([
      'group-imported',
    ])
    expect(state.data?.prefs.lastTab).toBe('folders')
    expect(state.widgetPopup).toBeNull()
    expect(state.revealedPasswordIds).toEqual([])
    expect(state.expandedNoteIds).toEqual([])
    expect(state.toast).toEqual({
      message: 'Imported',
      tone: 'success',
    })
  })
})
