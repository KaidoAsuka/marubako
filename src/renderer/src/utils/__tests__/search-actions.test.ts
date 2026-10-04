import { describe, expect, it } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { AnyGroupItem } from '../../../../shared/types'
import { copyTextOf, primaryAction } from '../search-actions'
import { searchEntries, type SearchResult } from '../search'

function resultFor(item: AnyGroupItem): SearchResult {
  return {
    key: `x:item:${item.id}`,
    type: 'item',
    tab: 'notes',
    groupId: null,
    groupName: '',
    name: item.name,
    icon: item.icon,
    detail: '',
    item,
  }
}

describe('what Enter does with a search result', () => {
  it.each([
    [{ id: 'f', kind: 'folder', name: 'F', icon: 'x', path: 'C:\\x' }, 'open'],
    [
      { id: 'w', kind: 'website', name: 'W', icon: 'x', url: 'https://x' },
      'open',
    ],
    [{ id: 'a', kind: 'app', name: 'A', icon: 'x', path: 'C:\\a.exe' }, 'open'],
    [
      {
        id: 'c',
        kind: 'command',
        name: 'C',
        icon: 'x',
        content: 'ls',
        language: 'bash',
        description: '',
      },
      'copy',
    ],
    [{ id: 'n', kind: 'note', name: 'N', icon: 'x', content: 'text' }, 'copy'],
    [
      {
        id: 'p',
        kind: 'password',
        name: 'P',
        icon: 'x',
        username: 'u',
        password: 'secret',
        note: '',
      },
      'copyPassword',
    ],
  ] as const)('is %j → %s', (item, action) => {
    expect(primaryAction(resultFor(item as AnyGroupItem))).toBe(action)
  })

  it('opens the editor for an entry with nothing to copy', () => {
    expect(
      primaryAction(
        resultFor({
          id: 'n',
          kind: 'note',
          name: 'N',
          icon: 'x',
          content: '',
        })
      )
    ).toBe('edit')
    expect(
      primaryAction(
        resultFor({
          id: 'p',
          kind: 'password',
          name: 'P',
          icon: 'x',
          username: 'u',
          password: '',
          note: '',
          passwordLost: true,
        })
      )
    ).toBe('edit')
  })

  it('shows a group or a task', () => {
    const data = createDefaultAppData()
    data.tasks['2026-10-04'] = [
      {
        id: 't',
        name: 'Plan',
        icon: 'T',
        status: 'todo',
        open: true,
        subtasks: [],
      },
    ]

    expect(primaryAction(searchEntries(data, 'plan')[0]!)).toBe('view')
    expect(primaryAction(searchEntries(data, 'Notes')[0]!)).toBe('view')
  })
})

describe('what a copy action puts on the clipboard', () => {
  it('is the password of a password entry, the content of a command or a note', () => {
    expect(
      copyTextOf(
        resultFor({
          id: 'p',
          kind: 'password',
          name: 'P',
          icon: 'x',
          username: 'user',
          password: 'secret',
          note: 'hint',
        })
      )
    ).toBe('secret')
    expect(
      copyTextOf(
        resultFor({
          id: 'c',
          kind: 'command',
          name: 'C',
          icon: 'x',
          content: 'Get-Process\nGet-Service',
          language: 'powershell',
          description: 'd',
        })
      )
    ).toBe('Get-Process\nGet-Service')
    expect(
      copyTextOf(
        resultFor({
          id: 'n',
          kind: 'note',
          name: 'N',
          icon: 'x',
          content: 'text',
        })
      )
    ).toBe('text')
  })

  it('is empty for what is launched, and for a group or a task', () => {
    expect(
      copyTextOf(
        resultFor({
          id: 'w',
          kind: 'website',
          name: 'W',
          icon: 'x',
          url: 'https://x',
        })
      )
    ).toBe('')
    const data = createDefaultAppData()
    expect(copyTextOf(searchEntries(data, 'Notes')[0]!)).toBe('')
  })
})
