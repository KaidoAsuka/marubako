import { describe, expect, it } from 'vitest'
import { createDefaultAppData } from '../../../../shared/default-data'
import { searchEntries } from '../search'

describe('searchEntries', () => {
  it('finds scripts by content, language and usage notes', () => {
    const data = createDefaultAppData()
    data.loose.commands.push({
      id: 'cmd',
      kind: 'command',
      name: 'Audit',
      icon: '⌘',
      content: '# header\n' + ' '.repeat(200) + 'Get-Process',
      language: 'powershell',
      description: 'Check running tools',
    })
    expect(searchEntries(data, 'get-process')[0]).toMatchObject({
      tab: 'commands',
      type: 'item',
    })
    expect(searchEntries(data, 'powershell running')[0]?.name).toBe('Audit')
  })
  it('finds grouped and loose items across categories using multiple terms', () => {
    const data = createDefaultAppData()
    data.loose.apps.push({
      id: 'editor',
      kind: 'app',
      name: 'VS Code',
      icon: 'C',
      path: 'C:\\Tools\\code.exe',
    })
    expect(searchEntries(data, 'tools code')[0]?.name).toBe('VS Code')
    expect(searchEntries(data, 'github')[0]?.tab).toBe('websites')
    expect(searchEntries(data, '全局唤起')[0]?.tab).toBe('notes')
  })
  it('ranks an exact item name above a match in metadata', () => {
    const data = createDefaultAppData()
    data.loose.notes.push({
      id: 'github-note',
      kind: 'note',
      name: 'Other',
      icon: 'N',
      content: 'GitHub instructions',
    })
    expect(searchEntries(data, 'github').map((entry) => entry.name)).toEqual([
      'GitHub',
      'Other',
    ])
  })
  it('never indexes passwords or includes them in result details', () => {
    const data = createDefaultAppData()
    data.loose.passwords.push({
      id: 'account',
      kind: 'password',
      name: 'Mail',
      icon: 'K',
      username: 'user@example.com',
      password: 'private-value',
      note: 'private-hint',
    })
    expect(searchEntries(data, 'private-value')).toEqual([])
    expect(searchEntries(data, 'private-hint')).toEqual([])
    expect(searchEntries(data, 'mail')[0]?.detail).toBe('user@example.com')
  })
  it('finds tasks by subtask names and keeps their date', () => {
    const data = createDefaultAppData()
    data.tasks['2026-10-01'] = [
      {
        id: 'task',
        name: 'Release',
        icon: 'T',
        status: 'todo',
        open: true,
        subtasks: [{ id: 'sub', name: 'Check installer', status: 'todo' }],
      },
    ]
    expect(searchEntries(data, 'installer')[0]).toMatchObject({
      type: 'task',
      date: '2026-10-01',
      name: 'Release',
    })
  })
})

describe('searchEntries and hidden categories', () => {
  function withEntries() {
    const data = createDefaultAppData()
    data.loose.notes.push({
      id: 'note-hidden',
      kind: 'note',
      name: 'Zebra note',
      icon: 'N',
      content: 'striped',
    })
    data.loose.websites.push({
      id: 'site-zebra',
      kind: 'website',
      name: 'Zebra site',
      icon: 'S',
      url: 'https://zebra.test',
    })
    data.tasks['2026-10-01'] = [
      {
        id: 'task-zebra',
        name: 'Feed the zebra',
        icon: 'T',
        status: 'todo',
        open: true,
        subtasks: [],
      },
    ]
    return data
  }

  it('finds entries of every category when nothing is hidden', () => {
    const tabs = searchEntries(withEntries(), 'zebra').map((entry) => entry.tab)

    expect(tabs.sort()).toEqual(['notes', 'tasks', 'websites'])
  })

  it('leaves out the entries and groups of a hidden category', () => {
    const data = withEntries()
    data.prefs.hiddenTabs = ['notes']
    // A group of a hidden category matches by its name too.
    data.notes[0]!.name = 'Zebra shelf'

    const results = searchEntries(data, 'zebra')

    expect(results.map((entry) => entry.tab).sort()).toEqual([
      'tasks',
      'websites',
    ])
    expect(results.some((entry) => entry.key.startsWith('notes:'))).toBe(false)
  })

  it('leaves out the tasks when the task page is hidden', () => {
    const data = withEntries()
    data.prefs.hiddenTabs = ['tasks']

    const results = searchEntries(data, 'zebra')

    expect(results.map((entry) => entry.tab).sort()).toEqual([
      'notes',
      'websites',
    ])
  })

  it('does not list a hidden category in the suggestions of an empty search either', () => {
    const data = withEntries()
    data.prefs.hiddenTabs = ['notes', 'websites', 'tasks']

    const tabs = new Set(searchEntries(data, '').map((entry) => entry.tab))

    expect(tabs.has('notes')).toBe(false)
    expect(tabs.has('websites')).toBe(false)
    expect(tabs.has('tasks')).toBe(false)
    expect(tabs.has('folders')).toBe(true)
  })

  it('finds the entries again once the category is shown', () => {
    const data = withEntries()
    data.prefs.hiddenTabs = ['notes']
    expect(searchEntries(data, 'striped')).toEqual([])

    data.prefs.hiddenTabs = []

    expect(searchEntries(data, 'striped').map((entry) => entry.name)).toEqual([
      'Zebra note',
    ])
  })
})
