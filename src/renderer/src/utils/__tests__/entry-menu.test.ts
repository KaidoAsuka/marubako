import { describe, expect, it } from 'vitest'

import { validateContextMenu } from '../../../../shared/context-menu'
import { createDefaultAppData } from '../../../../shared/default-data'
import type { AppData, FolderItem } from '../../../../shared/types'
import { translations } from '../../i18n/translations'
import { workspaceStrings } from '../../i18n/workspace'
import { buildEntryMenu, type EntryTarget } from '../entry-menu'

const t = (lang: 'zh' | 'en' | 'ja') => (key: string) =>
  workspaceStrings[lang][key] ?? translations[lang].strings[key] ?? key
const te = t('en')

function folder(id: string): FolderItem {
  return { id, kind: 'folder', name: id, icon: 'F', path: `C:\\${id}` }
}

function seed(): AppData {
  const data = createDefaultAppData()
  data.folders = [
    { id: 'g1', name: 'Work', icon: 'W', open: true, items: [folder('a1')] },
    { id: 'g2', name: 'Home', icon: 'H', open: true, items: [] },
    { id: 'g3', name: '', icon: 'N', open: true, items: [] },
  ]
  data.loose.folders = [folder('l1')]
  data.websites = []
  data.loose.websites = [
    {
      id: 'w1',
      kind: 'website',
      name: 'Site',
      icon: 'S',
      url: 'https://x.test',
    },
  ]
  data.passwords = [
    { id: 'pg', name: 'Logins', icon: 'L', open: true, items: [] },
  ]
  data.loose.passwords = [
    {
      id: 'p1',
      kind: 'password',
      name: 'Mail',
      icon: 'K',
      username: 'me@x.test',
      password: 'secret',
      note: '',
    },
  ]
  data.loose.commands = [
    {
      id: 'c1',
      kind: 'command',
      name: 'Cmd',
      icon: 'C',
      content: 'ls',
      language: 'bash',
      description: '',
    },
  ]
  data.loose.notes = [
    { id: 'n1', kind: 'note', name: 'Note', icon: 'N', content: 'x' },
  ]

  return data
}

const labels = (items: ReturnType<typeof validateContextMenu>) =>
  items.map((item) => item.label ?? item.type)

function menuOf(target: EntryTarget, viewMode: 'grid' | 'list' = 'grid') {
  return buildEntryMenu(seed(), target, { t: te, viewMode })!
}

describe('the menu of a standalone entry that is launched', () => {
  const menu = menuOf({
    kind: 'item',
    tab: 'folders',
    groupId: null,
    itemId: 'l1',
  })

  it('opens, renames or edits (F2), moves to a group, and deletes (Del)', () => {
    expect(labels(menu.items)).toEqual([
      'Open',
      'separator',
      'Rename / edit…',
      'Move to',
      'separator',
      'Delete',
    ])
    expect(menu.items.find((item) => item.id === 'rename')?.accelerator).toBe(
      'F2'
    )
    expect(menu.items.find((item) => item.id === 'delete')?.accelerator).toBe(
      'Delete'
    )
  })

  it('offers every group as a place to move to, and no "standalone" since it already is', () => {
    const move = menu.items.find((item) => item.label === 'Move to')!

    expect(move.submenu!.map((item) => item.label)).toEqual([
      'Work',
      'Home',
      'Unnamed group',
    ])
    expect(move.submenu!.map((item) => item.id)).toEqual([
      'move:group:g1',
      'move:group:g2',
      'move:group:g3',
    ])
  })

  it('is a menu the main process accepts', () => {
    expect(() => validateContextMenu(menu.items)).not.toThrow()
  })
})

describe('the menu of an entry inside a group', () => {
  const menu = menuOf({
    kind: 'item',
    tab: 'folders',
    groupId: 'g1',
    itemId: 'a1',
  })

  it('offers the standalone entries first, then the other groups, never its own', () => {
    const move = menu.items.find((item) => item.label === 'Move to')!

    expect(move.submenu!.map((item) => item.label)).toEqual([
      'Standalone items',
      'Home',
      'Unnamed group',
    ])
    expect(move.submenu![0]!.id).toBe('move:loose')
  })

  it('has no "Move to" when there is nowhere else to go', () => {
    const data = seed()
    data.folders = [data.folders[0]!]
    data.loose.folders = []
    // Standalone items are still a place to go for an entry in a group.
    const inGroup = buildEntryMenu(
      data,
      { kind: 'item', tab: 'folders', groupId: 'g1', itemId: 'a1' },
      { t: te, viewMode: 'grid' }
    )!
    expect(labels(inGroup.items)).toContain('Move to')

    // A standalone entry with no group at all has no destination.
    data.folders = []
    data.loose.folders = [folder('l1')]
    const loose = buildEntryMenu(
      data,
      { kind: 'item', tab: 'folders', groupId: null, itemId: 'l1' },
      { t: te, viewMode: 'grid' }
    )!
    expect(labels(loose.items)).not.toContain('Move to')
  })
})

describe('the menu by kind of entry', () => {
  it('opens a website or an app like a folder', () => {
    const menu = menuOf({
      kind: 'item',
      tab: 'websites',
      groupId: null,
      itemId: 'w1',
    })

    expect(labels(menu.items)[0]).toBe('Open')
  })

  it('copies the password and the username of a password entry, each only if there is one', () => {
    const menu = menuOf({
      kind: 'item',
      tab: 'passwords',
      groupId: null,
      itemId: 'p1',
    })

    expect(menu.items.slice(0, 2)).toEqual([
      { id: 'copy-password', label: 'Copy password', enabled: true },
      { id: 'copy-username', label: 'Copy username', enabled: true },
    ])

    const data = seed()
    data.loose.passwords[0]!.password = ''
    data.loose.passwords[0]!.username = ''
    const empty = buildEntryMenu(
      data,
      { kind: 'item', tab: 'passwords', groupId: null, itemId: 'p1' },
      { t: te, viewMode: 'grid' }
    )!
    expect(empty.items.slice(0, 2)).toMatchObject([
      { id: 'copy-password', enabled: false },
      { id: 'copy-username', enabled: false },
    ])
  })

  it('copies the code of a command and the text of a note', () => {
    const command = menuOf({
      kind: 'item',
      tab: 'commands',
      groupId: null,
      itemId: 'c1',
    })
    const note = menuOf({
      kind: 'item',
      tab: 'notes',
      groupId: null,
      itemId: 'n1',
    })

    expect(command.items[0]).toEqual({ id: 'copy-content', label: 'Copy code' })
    expect(note.items[0]).toEqual({ id: 'copy-content', label: 'Copy' })
  })

  it('has nothing else before rename when it has no primary action', () => {
    const data = seed()
    data.loose.websites = []
    expect(
      buildEntryMenu(
        data,
        { kind: 'item', tab: 'websites', groupId: null, itemId: 'w1' },
        { t: te, viewMode: 'grid' }
      )
    ).toBeNull()
  })
})

describe('the menu of a group', () => {
  it('opens (in the grid), renames and deletes', () => {
    const menu = menuOf({ kind: 'group', tab: 'folders', groupId: 'g1' })

    expect(labels(menu.items)).toEqual([
      'Open',
      'Rename…',
      'separator',
      'Delete',
    ])
    expect(menu.items.find((item) => item.id === 'rename')?.accelerator).toBe(
      'F2'
    )
  })

  it('does not offer to open a group in the list, where it is open or shut already', () => {
    const menu = menuOf(
      { kind: 'group', tab: 'folders', groupId: 'g1' },
      'list'
    )

    expect(labels(menu.items)).toEqual(['Rename…', 'separator', 'Delete'])
  })

  it('does not offer to open a group of the pages that have no popup', () => {
    const menu = menuOf({ kind: 'group', tab: 'passwords', groupId: 'pg' })

    expect(labels(menu.items)).toEqual(['Rename…', 'separator', 'Delete'])
  })
})

describe('what a chosen item means', () => {
  const { actionFor } = menuOf({
    kind: 'item',
    tab: 'folders',
    groupId: 'g1',
    itemId: 'a1',
  })

  it.each([
    ['open', { type: 'open' }],
    ['copy-password', { type: 'copy', what: 'password' }],
    ['copy-username', { type: 'copy', what: 'username' }],
    ['copy-content', { type: 'copy', what: 'content' }],
    ['rename', { type: 'rename' }],
    ['delete', { type: 'delete' }],
    ['move:loose', { type: 'move', toGroupId: null }],
    ['move:group:g2', { type: 'move', toGroupId: 'g2' }],
    ['move:group:with:colons', { type: 'move', toGroupId: 'with:colons' }],
  ])('reads %s', (id, action) => {
    expect(actionFor(id)).toEqual(action)
  })

  it('reads nothing for an id the menu never had', () => {
    expect(actionFor('format-disk')).toBeNull()
    expect(actionFor('')).toBeNull()
  })
})

describe('the limits of the menu', () => {
  it('never offers more places to move to than a menu may hold, and keeps the labels short', () => {
    const data = seed()
    data.folders = Array.from({ length: 60 }, (_, n) => ({
      id: `g${n}`,
      name: `Group ${n} ${'x'.repeat(120)}`,
      icon: 'G',
      open: true,
      items: [],
    }))

    const menu = buildEntryMenu(
      data,
      { kind: 'item', tab: 'folders', groupId: null, itemId: 'l1' },
      { t: te, viewMode: 'grid' }
    )!

    // Accepted by the main process as it is.
    expect(() => validateContextMenu(menu.items)).not.toThrow()
    const move = menu.items.find((item) => item.label === 'Move to')!
    expect(move.submenu!.length).toBeLessThanOrEqual(40)
    expect(move.submenu![0]!.label!.length).toBeLessThanOrEqual(80)
    expect(move.submenu![0]!.label!.endsWith('…')).toBe(true)
  })

  it('is null when the entry or group is not in the data', () => {
    const data = seed()

    for (const target of [
      { kind: 'item', tab: 'folders', groupId: null, itemId: 'ghost' },
      { kind: 'item', tab: 'folders', groupId: 'g-gone', itemId: 'a1' },
      { kind: 'group', tab: 'folders', groupId: 'g-gone' },
    ] as const)
      expect(
        buildEntryMenu(data, target, { t: te, viewMode: 'grid' }),
        JSON.stringify(target)
      ).toBeNull()
  })

  it.each(['zh', 'en', 'ja'] as const)(
    'has words in %s for every item',
    (lang) => {
      const menu = buildEntryMenu(
        seed(),
        { kind: 'item', tab: 'folders', groupId: 'g1', itemId: 'a1' },
        { t: t(lang), viewMode: 'grid' }
      )!
      const all = menu.items.flatMap((item) => [item, ...(item.submenu ?? [])])

      for (const item of all) {
        if (item.type === 'separator') continue
        // A missing string would show as its own key (menu_rename, ...).
        expect(item.label, `${lang} ${item.id}`).not.toMatch(/^[a-z_]+$/)
      }
    }
  )
})
