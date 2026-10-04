import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { AppData, Tab } from '../../../../shared/types'
import { useAppStore } from '../use-app-store'

const state = () => useAppStore.getState()

function load(hiddenTabs: Tab[], currentTab: Tab = 'folders'): void {
  const data = createDefaultAppData()
  data.prefs.hiddenTabs = hiddenTabs
  useAppStore.setState({
    data,
    loading: false,
    saving: false,
    error: null,
    currentTab,
    widgetPopup: null,
    modal: null,
    toast: null,
  })
}

describe('hidden categories in the store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    load([])
  })

  it('starts on the first category that is shown', async () => {
    const persisted = createDefaultAppData()
    persisted.prefs.hiddenTabs = ['folders', 'websites']
    vi.mocked(window.quickLaunch.loadData).mockResolvedValue({
      ok: true,
      data: persisted,
    })

    await state().loadData()

    expect(state().currentTab).toBe('apps')
    expect(state().data?.prefs.lastTab).toBe('apps')
  })

  it('does not open a hidden category', () => {
    load(['notes'])

    state().setCurrentTab('notes')

    expect(state().currentTab).toBe('folders')
    expect(state().data?.prefs.lastTab).toBe('folders')
  })

  it('opens a category that is shown', () => {
    load(['notes'])

    state().setCurrentTab('tasks')

    expect(state().currentTab).toBe('tasks')
  })

  it('switches to the first shown category when the one being looked at gets hidden', async () => {
    load([], 'notes')

    await state().updateData((draft) => {
      draft.prefs.hiddenTabs = ['notes']
    })

    expect(state().currentTab).toBe('folders')
    expect(state().data?.prefs.lastTab).toBe('folders')
    const saved = vi.mocked(window.quickLaunch.saveData).mock
      .calls[0]![0] as AppData
    expect(saved.prefs.hiddenTabs).toEqual(['notes'])
    expect(saved.prefs.lastTab).toBe('folders')
  })

  it('stays on the current category when another one gets hidden', async () => {
    load([], 'passwords')

    await state().updateData((draft) => {
      draft.prefs.hiddenTabs = ['notes']
    })

    expect(state().currentTab).toBe('passwords')
  })

  it('closes a group popup that belonged to the hidden category', async () => {
    load([], 'apps')
    useAppStore.setState({ widgetPopup: { tab: 'apps', groupId: 'g' } })

    await state().updateData((draft) => {
      draft.prefs.hiddenTabs = ['apps']
    })

    expect(state().currentTab).toBe('folders')
    expect(state().widgetPopup).toBeNull()
  })

  it('keeps the data of a hidden category and brings it back when shown again', async () => {
    load([])
    await state().updateData((draft) => {
      draft.loose.notes.push({
        id: 'keep-me',
        kind: 'note',
        name: 'Keep',
        icon: 'N',
        content: 'still here',
      })
    })

    await state().updateData((draft) => {
      draft.prefs.hiddenTabs = ['notes']
    })
    expect(state().data?.loose.notes.map((item) => item.id)).toEqual([
      'keep-me',
    ])

    await state().updateData((draft) => {
      draft.prefs.hiddenTabs = []
    })
    expect(state().data?.prefs.hiddenTabs).toEqual([])
    expect(state().data?.loose.notes.map((item) => item.id)).toEqual([
      'keep-me',
    ])
  })

  it('keeps one category visible even if a caller asks to hide all', async () => {
    load([])

    await state().updateData((draft) => {
      draft.prefs.hiddenTabs = [
        'folders',
        'websites',
        'apps',
        'passwords',
        'commands',
        'notes',
        'tasks',
      ]
    })

    expect(state().data?.prefs.hiddenTabs).not.toContain('folders')
    expect(state().currentTab).toBe('folders')
  })

  it('lands on a shown category after an import that hides the one being looked at', async () => {
    load([], 'tasks')
    const imported = createDefaultAppData()
    imported.prefs.hiddenTabs = ['tasks']
    vi.mocked(window.quickLaunch.importData).mockResolvedValue({
      ok: true,
      data: {
        canceled: false,
        data: imported,
        filePath: 'C:\\backup.json',
        importedAt: new Date().toISOString(),
      },
    })

    await state().importData()

    expect(state().currentTab).toBe('folders')
    expect(state().data?.prefs.lastTab).toBe('folders')
  })
})
