import { describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../shared/default-data'
import {
  DEFAULT_GROUP_ICONS,
  DEFAULT_ITEM_ICONS,
  DEFAULT_TASK_ICON,
} from '../../shared/default-icons'
import { GROUP_TABS } from '../../shared/types'
import type { AppData } from '../../shared/types'
import {
  CURRENT_SCHEMA_VERSION,
  InvalidBackupError,
  UnsupportedSchemaError,
  assertLooksLikeAppData,
  hasWindowState,
  normalizeAppData,
  unwrapPersistedData,
} from '../data-normalize'

function prefsOf(prefs: unknown): AppData['prefs'] {
  return normalizeAppData({ prefs }).prefs
}

function prefValue(key: string, value: unknown): unknown {
  return (prefsOf({ [key]: value }) as unknown as Record<string, unknown>)[key]
}

const defaultPrefs = createDefaultAppData().prefs

describe('normalizeAppData: prefs', () => {
  it('uses the defaults when prefs are missing', () => {
    expect(normalizeAppData({}).prefs).toEqual(defaultPrefs)
  })

  it.each([
    ['null', null],
    ['an array', []],
    ['an array with entries', [{ lang: 'en' }]],
    ['a string', 'dark'],
    ['a number', 5],
    ['true', true],
  ])('uses the defaults when prefs is %s', (_label, value) => {
    expect(prefsOf(value)).toEqual(defaultPrefs)
  })

  it('keeps every valid value', () => {
    const valid = {
      lang: 'ja',
      theme: 'light',
      background: 'forest',
      browser: 'edge',
      zoom: 1.2,
      opacity: 0.6,
      motion: 1.8,
      peekCollapseDelay: 400,
      viewMode: 'list',
      lastTab: 'tasks',
      hiddenTabs: ['apps', 'notes'],
      shortcut: 'CommandOrControl+Alt+Q',
      shortcutEnabled: false,
      hideAfterLaunch: true,
      showBubble: false,
    }

    expect(prefsOf(valid)).toEqual(valid)
  })

  describe('lang', () => {
    it.each(['zh', 'en', 'ja'])('keeps %s', (lang) => {
      expect(prefsOf({ lang }).lang).toBe(lang)
    })

    it.each([
      ['fr', 'fr'],
      ['zh-CN', 'zh-CN'],
      ['constructor', 'constructor'],
      ['__proto__', '__proto__'],
      ['a number', 1],
      ['null', null],
      ['an empty string', ''],
      ['upper case', 'EN'],
    ])('falls back to zh for %s', (_label, lang) => {
      expect(prefsOf({ lang }).lang).toBe('zh')
    })
  })

  it.each([
    ['theme', 'light', 'dark', 'blue'],
    ['background', 'ocean', 'aurora', 'neon'],
    ['browser', 'chrome', 'default', 'firefox'],
    ['viewMode', 'list', 'grid', 'cards'],
    ['lastTab', 'tasks', 'folders', 'settings'],
  ])(
    '%s keeps a valid value and falls back for an invalid one',
    (key, valid, fallback, invalid) => {
      expect(prefValue(key, valid)).toBe(valid)
      for (const bad of [invalid, 3, null, {}, '']) {
        expect(prefValue(key, bad)).toBe(fallback)
      }
    }
  )

  it.each(['folders', 'websites', 'apps', 'passwords', 'commands', 'notes'])(
    'accepts %s as the last tab',
    (lastTab) => {
      expect(prefsOf({ lastTab }).lastTab).toBe(lastTab)
    }
  )

  describe('zoom', () => {
    it.each([
      [0.01, 0.8],
      [0, 0.8],
      [-3, 0.8],
      [0.8, 0.8],
      [1, 1],
      [1.2, 1.2],
      [1.4, 1.4],
      [50, 1.4],
    ])('clamps %s to %s', (input, expected) => {
      expect(prefsOf({ zoom: input }).zoom).toBe(expected)
    })

    it.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['-Infinity', Number.NEGATIVE_INFINITY],
      ['a numeric string', '1.2'],
      ['null', null],
      ['an object', {}],
    ])('falls back to the default 1 for %s', (_label, zoom) => {
      expect(prefsOf({ zoom }).zoom).toBe(1)
    })
  })

  describe('opacity', () => {
    it.each([
      [0.5, 0.5],
      [1, 1],
      [0.4, 0.4],
      // Below 40% the window is nearly invisible; an older version allowed 20%.
      [0.2, 0.4],
      [0.05, 0.4],
      [-1, 0.4],
      [5, 1],
    ])('clamps %s to %s', (input, expected) => {
      expect(prefsOf({ opacity: input }).opacity).toBe(expected)
    })

    it.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['a string', '0.5'],
      ['null', null],
    ])('falls back to 1 for %s', (_label, opacity) => {
      expect(prefsOf({ opacity }).opacity).toBe(1)
    })

    it('falls back to the opacity of a legacy window block when prefs have none', () => {
      const data = normalizeAppData({ window: { opacity: 0.6 } })

      expect(data.prefs.opacity).toBe(0.6)
      expect(data.window.opacity).toBe(0.6)
    })

    it('prefers the prefs opacity over the legacy window opacity', () => {
      const data = normalizeAppData({
        prefs: { opacity: 0.9 },
        window: { opacity: 0.6 },
      })

      expect(data.prefs.opacity).toBe(0.9)
    })
  })

  describe('motion', () => {
    it.each([
      [1.5, 1.5],
      [0.75, 0.75],
      [2.2, 2.2],
      [0.1, 0.75],
      [9, 2.2],
    ])('clamps %s to %s', (input, expected) => {
      expect(prefsOf({ motion: input }).motion).toBe(expected)
    })

    it.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['a string', '1.5'],
      ['null', null],
    ])('falls back to the default 1.35 for %s', (_label, motion) => {
      expect(prefsOf({ motion }).motion).toBe(1.35)
    })
  })

  describe('peekCollapseDelay', () => {
    it.each([
      [0, 0],
      [400, 400],
      [150.4, 150],
      [150.6, 151],
      [-5, 0],
      [99_999, 2000],
      [2000, 2000],
      [1999.6, 2000],
    ])('turns %s into %s', (input, expected) => {
      expect(prefsOf({ peekCollapseDelay: input }).peekCollapseDelay).toBe(
        expected
      )
    })

    it.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['a string', '300'],
      ['null', null],
    ])('falls back to the default 200 for %s', (_label, value) => {
      expect(prefsOf({ peekCollapseDelay: value }).peekCollapseDelay).toBe(200)
    })
  })

  it('only accepts a real boolean for hideAfterLaunch', () => {
    expect(prefsOf({ hideAfterLaunch: true }).hideAfterLaunch).toBe(true)
    expect(prefsOf({ hideAfterLaunch: false }).hideAfterLaunch).toBe(false)
    expect(prefsOf({ hideAfterLaunch: 'yes' }).hideAfterLaunch).toBe(false)
    expect(prefsOf({ hideAfterLaunch: 1 }).hideAfterLaunch).toBe(false)
  })

  describe('showBubble', () => {
    it('is on by default, so the ball stays for users who never touched the setting', () => {
      expect(defaultPrefs.showBubble).toBe(true)
      expect(normalizeAppData({}).prefs.showBubble).toBe(true)
      expect(prefsOf({}).showBubble).toBe(true)
    })

    it('only accepts a real boolean', () => {
      expect(prefsOf({ showBubble: true }).showBubble).toBe(true)
      expect(prefsOf({ showBubble: false }).showBubble).toBe(false)
    })

    it.each([
      ['a string', 'no'],
      ['the number 0', 0],
      ['null', null],
      ['an object', {}],
    ])('falls back to on for %s', (_label, value) => {
      expect(prefsOf({ showBubble: value }).showBubble).toBe(true)
    })
  })

  describe('shortcut', () => {
    it('is Ctrl+Alt+Space, switched on, for data written before the setting existed', () => {
      expect(defaultPrefs.shortcut).toBe('CommandOrControl+Alt+Space')
      expect(defaultPrefs.shortcutEnabled).toBe(true)
      expect(prefsOf({ lang: 'en' }).shortcut).toBe(
        'CommandOrControl+Alt+Space'
      )
      expect(prefsOf({ lang: 'en' }).shortcutEnabled).toBe(true)
    })

    it('keeps an acceptable shortcut, written canonically', () => {
      expect(prefsOf({ shortcut: 'CommandOrControl+Alt+Q' }).shortcut).toBe(
        'CommandOrControl+Alt+Q'
      )
      expect(prefsOf({ shortcut: 'alt+control+f10' }).shortcut).toBe(
        'CommandOrControl+Alt+F10'
      )
    })

    it.each([
      ['a bare key', 'K'],
      ['one modifier', 'Ctrl+K'],
      ['Windows own', 'Ctrl+Alt+Delete'],
      ['nonsense', 'hello'],
      ['an empty string', ''],
      ['a number', 7],
      ['null', null],
      ['an object', {}],
    ])('falls back to the default for %s', (_label, shortcut) => {
      expect(prefsOf({ shortcut }).shortcut).toBe('CommandOrControl+Alt+Space')
    })

    it('only accepts a real boolean for the switch', () => {
      expect(prefsOf({ shortcutEnabled: false }).shortcutEnabled).toBe(false)
      expect(prefsOf({ shortcutEnabled: true }).shortcutEnabled).toBe(true)
      for (const value of ['no', 0, null, {}])
        expect(prefsOf({ shortcutEnabled: value }).shortcutEnabled).toBe(true)
    })

    it('keeps the choice while the shortcut is off', () => {
      const prefs = prefsOf({
        shortcut: 'CommandOrControl+Alt+Q',
        shortcutEnabled: false,
      })

      expect(prefs.shortcut).toBe('CommandOrControl+Alt+Q')
      expect(prefs.shortcutEnabled).toBe(false)
    })
  })

  describe('hiddenTabs', () => {
    it('hides nothing by default, so every category shows for users who never touched the setting', () => {
      expect(defaultPrefs.hiddenTabs).toEqual([])
      // Data written before the setting existed has no such key.
      expect(prefsOf({ lang: 'en' }).hiddenTabs).toEqual([])
      expect(normalizeAppData({}).prefs.hiddenTabs).toEqual([])
    })

    it('keeps valid categories once each, in the fixed category order', () => {
      expect(
        prefsOf({ hiddenTabs: ['tasks', 'notes', 'tasks'] }).hiddenTabs
      ).toEqual(['notes', 'tasks'])
    })

    it.each([
      ['a string', 'notes'],
      ['null', null],
      ['an object', { notes: true }],
      ['a number', 3],
    ])('hides nothing for %s', (_label, value) => {
      expect(prefsOf({ hiddenTabs: value }).hiddenTabs).toEqual([])
    })

    it('drops values that are not categories', () => {
      expect(
        prefsOf({ hiddenTabs: ['settings', 4, null, 'notes'] }).hiddenTabs
      ).toEqual(['notes'])
    })

    it('keeps at least one category visible', () => {
      const all = [
        'folders',
        'websites',
        'apps',
        'passwords',
        'commands',
        'notes',
        'tasks',
      ]

      expect(prefsOf({ hiddenTabs: all }).hiddenTabs).toEqual(all.slice(1))
    })

    it('moves a last tab that is hidden to the first visible category', () => {
      expect(prefsOf({ lastTab: 'notes', hiddenTabs: ['notes'] }).lastTab).toBe(
        'folders'
      )
      expect(
        prefsOf({ lastTab: 'notes', hiddenTabs: ['folders', 'notes'] }).lastTab
      ).toBe('websites')
      expect(prefsOf({ lastTab: 'tasks', hiddenTabs: ['notes'] }).lastTab).toBe(
        'tasks'
      )
    })

    it('survives a round trip through normalisation without changing', () => {
      const once = prefsOf({ hiddenTabs: ['commands', 'tasks'] })

      expect(normalizeAppData({ prefs: once }).prefs.hiddenTabs).toEqual([
        'commands',
        'tasks',
      ])
    })

    it('never deletes the data of a hidden category', () => {
      const raw = createDefaultAppData()
      raw.prefs.hiddenTabs = ['notes']

      const data = normalizeAppData(raw)

      expect(data.prefs.hiddenTabs).toEqual(['notes'])
      expect(data.notes[0]?.items[0]?.id).toBe('note-usage')
    })
  })

  it('drops unknown preference keys', () => {
    const prefs = prefsOf({ lang: 'en', injected: 'x' })

    expect(Object.keys(prefs).sort()).toEqual(Object.keys(defaultPrefs).sort())
  })
})

describe('normalizeAppData: window state', () => {
  it('migrates legacy flat window coordinates into bounds', () => {
    const data = normalizeAppData({
      window: { x: 10, y: 20, width: 800, height: 600, alwaysOnTop: true },
    })

    expect(data.window.bounds).toEqual({ x: 10, y: 20, w: 800, h: 600 })
    expect(data.window.alwaysOnTop).toBe(true)
  })

  it.each([['x'], [5], [[]], [null]])(
    'ignores a window block that is %j',
    (windowBlock) => {
      const data = normalizeAppData({ window: windowBlock })

      expect(data.window.bounds).toBeUndefined()
      expect(data.window.collapsed).toBe(false)
    }
  )
})

describe('normalizeAppData: structure guards', () => {
  it.each([
    ['an object', {}],
    ['a string', 'x'],
    ['null', null],
    ['a number', 5],
    ['true', true],
  ])('treats a collection that is %s as empty', (_label, value) => {
    const data = normalizeAppData({
      folders: value,
      websites: value,
      apps: value,
      passwords: value,
      notes: value,
      commands: value,
    })

    for (const tab of GROUP_TABS) expect(data[tab]).toEqual([])
  })

  it.each([
    ['a string', 'x'],
    ['an array', []],
    ['an array with entries', [1, 2]],
    ['null', null],
    ['a number', 5],
  ])('treats loose being %s as empty', (_label, loose) => {
    const data = normalizeAppData({ loose })

    for (const tab of GROUP_TABS) expect(data.loose[tab]).toEqual([])
  })

  it('treats a loose collection that is not an array as empty', () => {
    const data = normalizeAppData({
      loose: { websites: 'x', folders: {}, apps: 5, notes: null },
    })

    for (const tab of GROUP_TABS) expect(data.loose[tab]).toEqual([])
  })

  it('does not throw on groups that are null, numbers or strings, and still returns valid groups', () => {
    const data = normalizeAppData({
      folders: [null, 5, 'x', true, []],
    })

    expect(data.folders).toHaveLength(5)
    for (const group of data.folders) {
      expect(group.id).toMatch(/^folders-group-/)
      expect(group.name).toBe('')
      expect(group.icon).toBe(DEFAULT_GROUP_ICONS.folders)
      expect(group.open).toBe(true)
      expect(group.items).toEqual([])
    }
    expect(new Set(data.folders.map((group) => group.id)).size).toBe(5)
  })

  it('treats a group whose items is not an array as having no items', () => {
    const data = normalizeAppData({
      notes: [
        { id: 'a', items: 'x' },
        { id: 'b', items: {} },
        { id: 'c', items: null },
      ],
    })

    expect(data.notes.map((group) => group.items)).toEqual([[], [], []])
  })

  it('turns non-object items into empty but valid items with ids', () => {
    const data = normalizeAppData({
      folders: [{ id: 'g', items: [null, 'x', 5, []] }],
      loose: { folders: [null, 'x'] },
    })

    const items = [...(data.folders[0]?.items ?? []), ...data.loose.folders]
    expect(items).toHaveLength(6)
    for (const item of items) {
      expect(item).toEqual({
        id: expect.stringMatching(/^folder-/),
        kind: 'folder',
        name: '',
        icon: DEFAULT_ITEM_ICONS.folders,
        path: '',
      })
    }
    expect(new Set(items.map((item) => item.id)).size).toBe(6)
  })

  it('gives every kind of empty item its own defaults', () => {
    const data = normalizeAppData({
      folders: [{ id: 'g1', items: [null] }],
      websites: [{ id: 'g2', items: [null] }],
      apps: [{ id: 'g3', items: [null] }],
      passwords: [{ id: 'g4', items: [null] }],
      notes: [{ id: 'g5', items: [null] }],
      commands: [{ id: 'g6', items: [null] }],
    })

    expect(data.folders[0]?.items[0]).toMatchObject({
      kind: 'folder',
      icon: DEFAULT_ITEM_ICONS.folders,
      path: '',
    })
    expect(data.websites[0]?.items[0]).toMatchObject({
      kind: 'website',
      icon: DEFAULT_ITEM_ICONS.websites,
      url: '',
    })
    expect(data.apps[0]?.items[0]).toMatchObject({
      kind: 'app',
      icon: DEFAULT_ITEM_ICONS.apps,
      path: '',
    })
    expect(data.passwords[0]?.items[0]).toMatchObject({
      kind: 'password',
      icon: DEFAULT_ITEM_ICONS.passwords,
      username: '',
      password: '',
      note: '',
    })
    expect(data.notes[0]?.items[0]).toMatchObject({
      kind: 'note',
      icon: DEFAULT_ITEM_ICONS.notes,
      content: '',
    })
    expect(data.commands[0]?.items[0]).toMatchObject({
      kind: 'command',
      icon: DEFAULT_ITEM_ICONS.commands,
      content: '',
      language: 'powershell',
      description: '',
    })
  })

  it('keeps valid fields exactly, including whitespace in notes and commands', () => {
    const content = '  line one\n\tline two  \n\n'
    const data = normalizeAppData({
      notes: [
        {
          id: 'g',
          name: ' Spaced ',
          icon: '🔥',
          open: false,
          items: [{ id: 'n', name: 'Note', icon: '🔥', content }],
        },
      ],
      commands: [
        {
          id: 'c',
          items: [
            {
              id: 'cmd',
              name: 'Run',
              content,
              language: 'bash',
              description: 'Does things',
            },
          ],
        },
      ],
    })

    expect(data.notes[0]).toEqual({
      id: 'g',
      name: ' Spaced ',
      icon: '🔥',
      open: false,
      items: [{ id: 'n', kind: 'note', name: 'Note', icon: '🔥', content }],
    })
    expect(data.commands[0]?.items[0]).toEqual({
      id: 'cmd',
      kind: 'command',
      name: 'Run',
      icon: DEFAULT_ITEM_ICONS.commands,
      content,
      language: 'bash',
      description: 'Does things',
    })
  })

  it('blanks names that are only whitespace and replaces blank icons', () => {
    const data = normalizeAppData({
      websites: [
        {
          id: 'g',
          name: '   ',
          icon: '  ',
          items: [
            { id: 'w', name: '\t', icon: '', url: 'https://example.com' },
          ],
        },
      ],
    })

    expect(data.websites[0]?.name).toBe('')
    expect(data.websites[0]?.icon).toBe(DEFAULT_GROUP_ICONS.websites)
    expect(data.websites[0]?.items[0]).toMatchObject({
      name: '',
      icon: DEFAULT_ITEM_ICONS.websites,
      url: 'https://example.com',
    })
  })

  it('generates an id for ids that are missing, blank or not strings, and keeps real ones', () => {
    const data = normalizeAppData({
      folders: [
        { items: [{ id: 'keep' }, { id: '   ' }, { id: 5 }, {}] },
        { id: 'group-keep' },
        { id: '' },
      ],
    })

    const ids = [
      ...(data.folders[0]?.items.map((item) => item.id) ?? []),
      ...data.folders.map((group) => group.id),
    ]
    expect(ids).toContain('keep')
    expect(ids).toContain('group-keep')
    for (const id of ids) expect(id.trim()).not.toBe('')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('repairs an unknown command language', () => {
    const data = normalizeAppData({
      loose: {
        commands: [{ language: 'cobol' }, { language: 5 }, { language: 'sql' }],
      },
    })

    expect(data.loose.commands.map((item) => item.language)).toEqual([
      'powershell',
      'powershell',
      'sql',
    ])
  })

  it('drops fields it does not know about', () => {
    const data = normalizeAppData({
      loose: {
        websites: [
          {
            id: 'w',
            url: 'https://x.test',
            evil: '<script>',
            passwordCiphertext: 'x',
          },
        ],
      },
    })

    expect(data.loose.websites[0]).toEqual({
      id: 'w',
      kind: 'website',
      name: '',
      icon: DEFAULT_ITEM_ICONS.websites,
      url: 'https://x.test',
    })
  })
})

describe('normalizeAppData: topOrder', () => {
  const source = {
    folders: [
      { id: 'g1', items: [] },
      { id: 'g2', items: [] },
    ],
    loose: { folders: [{ id: 'l1' }, { id: 'l2' }] },
  }

  it('is built from groups followed by loose items when missing', () => {
    const data = normalizeAppData(source)

    expect(data.topOrder.folders).toEqual([
      { type: 'group', id: 'g1' },
      { type: 'group', id: 'g2' },
      { type: 'loose', id: 'l1' },
      { type: 'loose', id: 'l2' },
    ])
    for (const tab of GROUP_TABS) {
      if (tab !== 'folders') expect(data.topOrder[tab]).toEqual([])
    }
  })

  it.each([
    ['an array', []],
    ['a string', 'x'],
    ['a number', 5],
    ['null', null],
    ['an array of garbage', [null, 5, 'x', { type: 'group', id: 'g2' }]],
  ])('is rebuilt without throwing when topOrder is %s', (_label, topOrder) => {
    const data = normalizeAppData({ ...source, topOrder })

    expect(data.topOrder.folders).toEqual([
      { type: 'group', id: 'g1' },
      { type: 'group', id: 'g2' },
      { type: 'loose', id: 'l1' },
      { type: 'loose', id: 'l2' },
    ])
  })

  it('is rebuilt without throwing when its entries are garbage', () => {
    const data = normalizeAppData({
      ...source,
      topOrder: {
        folders: [
          null,
          5,
          'x',
          [],
          {},
          { type: 'group' },
          { type: 'group', id: '' },
          { type: 'group', id: 5 },
          { type: 'weird', id: 'g1' },
        ],
        websites: 'x',
        apps: {},
        passwords: 5,
        notes: null,
      },
    })

    expect(data.topOrder.folders).toEqual([
      { type: 'group', id: 'g1' },
      { type: 'group', id: 'g2' },
      { type: 'loose', id: 'l1' },
      { type: 'loose', id: 'l2' },
    ])
    expect(data.topOrder.websites).toEqual([])
  })

  it('keeps a valid saved order', () => {
    const data = normalizeAppData({
      ...source,
      topOrder: {
        folders: [
          { type: 'loose', id: 'l2' },
          { type: 'group', id: 'g2' },
          { type: 'loose', id: 'l1' },
          { type: 'group', id: 'g1' },
        ],
      },
    })

    expect(data.topOrder.folders).toEqual([
      { type: 'loose', id: 'l2' },
      { type: 'group', id: 'g2' },
      { type: 'loose', id: 'l1' },
      { type: 'group', id: 'g1' },
    ])
  })

  it('drops duplicates and entries for things that do not exist, and appends what is missing', () => {
    const data = normalizeAppData({
      ...source,
      topOrder: {
        folders: [
          { type: 'group', id: 'g2' },
          { type: 'group', id: 'g2' },
          { type: 'group', id: 'ghost' },
          { type: 'loose', id: 'ghost' },
          // right id, wrong type: g1 is a group, not a loose item
          { type: 'loose', id: 'g1' },
          { type: 'loose', id: 'l1' },
        ],
      },
    })

    expect(data.topOrder.folders).toEqual([
      { type: 'group', id: 'g2' },
      { type: 'loose', id: 'l1' },
      { type: 'group', id: 'g1' },
      { type: 'loose', id: 'l2' },
    ])
  })

  it('strips extra fields from order entries', () => {
    const data = normalizeAppData({
      ...source,
      topOrder: { folders: [{ type: 'group', id: 'g1', extra: true }] },
    })

    expect(data.topOrder.folders[0]).toEqual({ type: 'group', id: 'g1' })
  })
})

describe('normalizeAppData: tasks', () => {
  it.each([
    ['an array', []],
    ['an array with entries', [{ id: 't' }]],
    ['a string', 'x'],
    ['null', null],
    ['a number', 5],
  ])('treats tasks being %s as empty', (_label, tasks) => {
    expect(normalizeAppData({ tasks }).tasks).toEqual({})
  })

  it('treats a day whose tasks are not an array as having none', () => {
    const data = normalizeAppData({
      tasks: { '2026-01-05': 'x', '2026-01-06': null, '2026-01-07': {} },
    })

    expect(data.tasks).toEqual({
      '2026-01-05': [],
      '2026-01-06': [],
      '2026-01-07': [],
    })
  })

  it('treats non-array subtasks as empty and turns non-object tasks into valid ones', () => {
    const data = normalizeAppData({
      tasks: {
        '2026-01-05': [
          { id: 't1', name: 'One', subtasks: 'x' },
          { id: 't2', subtasks: {} },
          null,
          'x',
        ],
      },
    })

    const [first, second, third, fourth] = data.tasks['2026-01-05'] ?? []
    expect(first?.subtasks).toEqual([])
    expect(second?.subtasks).toEqual([])
    for (const task of [third, fourth]) {
      expect(task).toEqual({
        id: expect.stringMatching(/^task-/),
        name: '',
        icon: DEFAULT_TASK_ICON,
        status: 'todo',
        open: true,
        subtasks: [],
      })
    }
  })

  it('falls back to todo for unknown statuses and keeps valid ones', () => {
    const data = normalizeAppData({
      tasks: {
        d: [
          {
            id: 't',
            status: 'finished',
            subtasks: [
              { id: 's1', status: 'nope' },
              { id: 's2', status: 5 },
              { id: 's3' },
              { id: 's4', status: 'doing' },
              { id: 's5', status: 'skip' },
              { id: 's6', status: 'done' },
            ],
          },
          { id: 't2', status: 'doing' },
          { id: 't3', status: 'skip' },
          { id: 't4', status: 'done' },
          { id: 't5', status: 'todo' },
        ],
      },
    })

    const tasks = data.tasks.d ?? []
    expect(tasks.map((task) => task.status)).toEqual([
      'todo',
      'doing',
      'skip',
      'done',
      'todo',
    ])
    expect(tasks[0]?.subtasks.map((subtask) => subtask.status)).toEqual([
      'todo',
      'todo',
      'todo',
      'doing',
      'skip',
      'done',
    ])
  })

  it('gives subtasks ids and keeps their names', () => {
    const data = normalizeAppData({
      tasks: { d: [{ id: 't', subtasks: [{ name: 'Step' }, 'x', null] }] },
    })

    const subtasks = data.tasks.d?.[0]?.subtasks ?? []
    expect(subtasks.map((subtask) => subtask.name)).toEqual(['Step', '', ''])
    for (const subtask of subtasks) expect(subtask.id).toMatch(/^subtask-/)
    expect(new Set(subtasks.map((subtask) => subtask.id)).size).toBe(3)
  })

  it('keeps well-formed tasks unchanged', () => {
    const task = {
      id: 't1',
      name: 'Write tests',
      icon: '🧪',
      status: 'doing',
      open: false,
      subtasks: [{ id: 's1', name: 'Unit', status: 'done' }],
    }

    expect(normalizeAppData({ tasks: { '2026-01-05': [task] } }).tasks).toEqual(
      {
        '2026-01-05': [task],
      }
    )
  })
})

describe('normalizeAppData: schemaVersion and input shape', () => {
  it('writes the current schema version', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2)
    expect(normalizeAppData({}).schemaVersion).toBe(2)
  })

  it.each([
    ['missing', undefined],
    ['2', 2],
    ['1', 1],
    ['0', 0],
    ['a string', '99'],
    ['null', null],
  ])('accepts a schemaVersion that is %s', (_label, schemaVersion) => {
    const data = normalizeAppData(
      schemaVersion === undefined ? {} : { schemaVersion }
    )

    expect(data.schemaVersion).toBe(2)
  })

  it.each([3, 4, 99])(
    'throws UnsupportedSchemaError for version %s',
    (version) => {
      try {
        normalizeAppData({ schemaVersion: version })
        expect.unreachable('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(UnsupportedSchemaError)
        expect(error).toBeInstanceOf(Error)
        expect((error as UnsupportedSchemaError).version).toBe(version)
        expect((error as Error).name).toBe('UnsupportedSchemaError')
        expect((error as Error).message).toContain(String(version))
      }
    }
  )

  it('throws for newer data even when it is wrapped in { version, data }', () => {
    expect(() =>
      normalizeAppData({ version: 1, data: { schemaVersion: 3 } })
    ).toThrow(UnsupportedSchemaError)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'x'],
    ['a number', 5],
    ['an array', []],
    ['true', true],
  ])('returns the default data for input that is %s', (_label, input) => {
    const data = normalizeAppData(input)

    expect(data.schemaVersion).toBe(2)
    expect(data.prefs).toEqual(defaultPrefs)
    expect(data).toEqual(createDefaultAppData())
  })

  it('returns a fresh default object every time', () => {
    const first = normalizeAppData(null)
    first.folders.length = 0
    first.prefs.lang = 'en'

    const second = normalizeAppData(null)

    expect(second.folders.length).toBeGreaterThan(0)
    expect(second.prefs.lang).toBe('zh')
  })

  it('does not return the starter data for an empty object', () => {
    const data = normalizeAppData({})

    expect(data.folders).toEqual([])
    expect(data.notes).toEqual([])
    expect(data.tasks).toEqual({})
  })

  it('unwraps { version, data } before normalizing', () => {
    const data = normalizeAppData({
      version: 1,
      data: { prefs: { lang: 'en' }, loose: { notes: [{ id: 'n' }] } },
    })

    expect(data.prefs.lang).toBe('en')
    expect(data.loose.notes[0]?.id).toBe('n')
  })

  it('is idempotent', () => {
    const once = normalizeAppData({
      prefs: { lang: 'en', zoom: 99 },
      folders: [{ items: [null] }],
      loose: { websites: [{ url: 'https://x.test' }] },
      tasks: { d: [{ subtasks: [null] }] },
    })

    expect(normalizeAppData(once)).toEqual(once)
  })

  it('does not modify its input', () => {
    const input = {
      prefs: { lang: 'fr', zoom: 99 },
      folders: [{ items: [null] }],
      topOrder: { folders: [null] },
    }
    const copy = structuredClone(input)

    normalizeAppData(input)

    expect(input).toEqual(copy)
  })
})

describe('normalizeAppData: passwords', () => {
  const groupedWith = (item: unknown): unknown => ({
    passwords: [{ id: 'g', items: [item] }],
  })
  const looseWith = (item: unknown): unknown => ({
    loose: { passwords: [item] },
  })
  const placements = [
    ['grouped', groupedWith, (data: AppData) => data.passwords[0]?.items[0]],
    ['loose', looseWith, (data: AppData) => data.loose.passwords[0]],
  ] as const

  describe.each(placements)('%s password items', (_label, wrap, pick) => {
    it('prefers a plaintext password over ciphertext and does not decrypt', () => {
      const decryptPassword = vi.fn(() => 'from ciphertext')
      const onPasswordLost = vi.fn()

      const data = normalizeAppData(
        wrap({ id: 'p', password: 'plain', passwordCiphertext: 'abc' }),
        { decryptPassword, onPasswordLost }
      )

      expect(pick(data)).toMatchObject({ id: 'p', password: 'plain' })
      expect(decryptPassword).not.toHaveBeenCalled()
      expect(onPasswordLost).not.toHaveBeenCalled()
    })

    it('decrypts the ciphertext through the context', () => {
      const decryptPassword = vi.fn((ciphertext: string) => `<${ciphertext}>`)
      const onPasswordLost = vi.fn()

      const data = normalizeAppData(
        wrap({ id: 'p', username: 'alice', passwordCiphertext: 'abc' }),
        { decryptPassword, onPasswordLost }
      )

      expect(decryptPassword).toHaveBeenCalledTimes(1)
      expect(decryptPassword).toHaveBeenCalledWith('abc')
      expect(pick(data)).toEqual({
        id: 'p',
        kind: 'password',
        name: '',
        icon: DEFAULT_ITEM_ICONS.passwords,
        username: 'alice',
        password: '<abc>',
        note: '',
      })
      expect(onPasswordLost).not.toHaveBeenCalled()
    })

    it('reports a password that cannot be decrypted once, with its id and raw ciphertext', () => {
      const decryptPassword = vi.fn(() => {
        throw new Error('wrong key')
      })
      const onPasswordLost = vi.fn()

      const data = normalizeAppData(
        wrap({ id: 'p', passwordCiphertext: 'locked==' }),
        { decryptPassword, onPasswordLost }
      )

      expect(pick(data)).toMatchObject({ id: 'p', password: '' })
      expect(onPasswordLost).toHaveBeenCalledTimes(1)
      expect(onPasswordLost).toHaveBeenCalledWith('p', 'locked==')
    })

    it('reports the generated id when the stored item had none', () => {
      const onPasswordLost = vi.fn()

      const data = normalizeAppData(wrap({ passwordCiphertext: 'locked==' }), {
        decryptPassword: () => {
          throw new Error('wrong key')
        },
        onPasswordLost,
      })

      const id = pick(data)?.id
      expect(id).toMatch(/^password-/)
      expect(onPasswordLost).toHaveBeenCalledWith(id, 'locked==')
    })

    it('treats a password with ciphertext but no decryptor as lost', () => {
      const onPasswordLost = vi.fn()

      const data = normalizeAppData(
        wrap({ id: 'p', passwordCiphertext: 'abc' }),
        { onPasswordLost }
      )

      expect(pick(data)).toMatchObject({ password: '' })
      expect(onPasswordLost).toHaveBeenCalledTimes(1)
      expect(onPasswordLost).toHaveBeenCalledWith('p', 'abc')
    })

    it('does not throw when nobody is listening for lost passwords', () => {
      const data = normalizeAppData(
        wrap({ id: 'p', passwordCiphertext: 'abc' })
      )

      expect(pick(data)).toMatchObject({ password: '' })
    })

    it.each([
      ['an empty string', ''],
      ['absent', undefined],
      ['null', null],
      ['a number', 5],
      ['an object', {}],
    ])(
      'gives an empty password and no callback when the ciphertext is %s',
      (_l, ciphertext) => {
        const decryptPassword = vi.fn(() => 'x')
        const onPasswordLost = vi.fn()
        const item =
          ciphertext === undefined
            ? { id: 'p' }
            : { id: 'p', passwordCiphertext: ciphertext }

        const data = normalizeAppData(wrap(item), {
          decryptPassword,
          onPasswordLost,
        })

        expect(pick(data)).toMatchObject({ id: 'p', password: '' })
        expect(decryptPassword).not.toHaveBeenCalled()
        expect(onPasswordLost).not.toHaveBeenCalled()
      }
    )

    it('never carries the ciphertext or the runtime lost flag into the data', () => {
      const data = normalizeAppData(
        wrap({ id: 'p', passwordCiphertext: 'abc', passwordLost: true }),
        { decryptPassword: () => 'secret' }
      )

      const item = pick(data) as unknown as Record<string, unknown>
      expect(item).not.toHaveProperty('passwordCiphertext')
      expect(item).not.toHaveProperty('passwordLost')
    })
  })

  it('handles several items, decrypting the good ones and reporting only the bad ones', () => {
    const onPasswordLost = vi.fn()

    const data = normalizeAppData(
      {
        passwords: [
          {
            id: 'g',
            items: [
              { id: 'a', passwordCiphertext: 'good-a' },
              { id: 'b', passwordCiphertext: 'bad-b' },
            ],
          },
        ],
        loose: {
          passwords: [
            { id: 'c', passwordCiphertext: 'good-c' },
            { id: 'd', passwordCiphertext: 'bad-d' },
            { id: 'e', password: 'plain-e' },
          ],
        },
      },
      {
        decryptPassword: (ciphertext) => {
          if (ciphertext.startsWith('bad')) throw new Error('wrong key')
          return ciphertext.toUpperCase()
        },
        onPasswordLost,
      }
    )

    expect(data.passwords[0]?.items.map((item) => item.password)).toEqual([
      'GOOD-A',
      '',
    ])
    expect(data.loose.passwords.map((item) => item.password)).toEqual([
      'GOOD-C',
      '',
      'plain-e',
    ])
    expect(onPasswordLost.mock.calls).toEqual([
      ['b', 'bad-b'],
      ['d', 'bad-d'],
    ])
  })
})

describe('unwrapPersistedData', () => {
  it('unwraps { version, data }', () => {
    const inner = { schemaVersion: 2, folders: [] }

    expect(unwrapPersistedData({ version: 1, data: inner })).toBe(inner)
    expect(unwrapPersistedData({ version: 2, data: inner, other: 1 })).toBe(
      inner
    )
  })

  it('leaves plain data alone', () => {
    const plain = { schemaVersion: 2, folders: [] }

    expect(unwrapPersistedData(plain)).toBe(plain)
  })

  it.each([
    ['a string', 'x'],
    ['an array', [1]],
    ['null', null],
    ['a number', 5],
  ])('does not unwrap when data is %s', (_label, data) => {
    const wrapper = { version: 1, data }

    expect(unwrapPersistedData(wrapper)).toBe(wrapper)
  })

  it('does not unwrap an object that has data but no version', () => {
    const value = { data: { a: 1 } }

    expect(unwrapPersistedData(value)).toBe(value)
  })

  it.each([
    [null],
    [undefined],
    ['x'],
    [5],
    [[]],
    [[{ version: 1, data: {} }]],
  ])('returns %j unchanged', (value) => {
    expect(unwrapPersistedData(value)).toBe(value)
  })
})

describe('assertLooksLikeAppData', () => {
  it.each([
    ['prefs and tasks', { prefs: {}, tasks: {} }],
    ['two collections', { folders: [], websites: [] }],
    ['a collection and loose items', { passwords: [], loose: {} }],
    ['loose items and a top order', { loose: {}, topOrder: {} }],
    ['the default app data', createDefaultAppData()],
    ['two markers among unrelated keys', { name: 'x', notes: [], tasks: {} }],
    [
      'markers plus a schema version',
      { schemaVersion: 2, prefs: {}, notes: [] },
    ],
  ])('accepts %s', (_label, value) => {
    expect(() => assertLooksLikeAppData(value)).not.toThrow()
  })

  it.each([
    ['an array', []],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'x'],
    ['a number', 5],
    ['an empty object', {}],
    ['a package.json', { name: 'x', version: '1.0.0' }],
    ['a string schema version only', { schemaVersion: '2' }],
    ['a schema version alone', { schemaVersion: 2 }],
    [
      'a schema version next to unrelated keys',
      { schemaVersion: 1, name: 'x', stuff: [1, 2] },
    ],
    ['a single prefs object', { prefs: {} }],
    ['a single folders list', { folders: [] }],
    ['a single generic notes list', { name: 'x', notes: [] }],
    ['a single tasks object', { tasks: {} }],
    ['a schema version alone', { schemaVersion: 2 }],
    [
      'a schema version next to unrelated keys',
      { schemaVersion: 1, name: 'x', stuff: [1, 2] },
    ],
    ['a single prefs object', { prefs: {} }],
    ['a single folders list', { folders: [] }],
    ['a single generic notes list', { name: 'x', notes: [] }],
    ['a single tasks object', { tasks: {} }],
    ['folders that is an object', { folders: {} }],
    ['folders that is a string', { folders: 'x' }],
    ['notes that is null', { notes: null }],
    ['prefs that is an array', { prefs: [] }],
    ['prefs that is a string', { prefs: 'x' }],
    ['loose that is a string', { loose: 'x' }],
    ['tasks that is an array', { tasks: [] }],
    ['topOrder that is null', { topOrder: null }],
    [
      'a good marker next to a malformed collection',
      { schemaVersion: 2, passwords: {} },
    ],
  ])('rejects %s', (_label, value) => {
    try {
      assertLooksLikeAppData(value)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidBackupError)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).name).toBe('InvalidBackupError')
    }
  })
})

describe('hasWindowState', () => {
  it('is true when the data has a window object', () => {
    expect(hasWindowState({ window: {} })).toBe(true)
    expect(
      hasWindowState({ window: { bounds: { x: 1, y: 2, w: 3, h: 4 } } })
    ).toBe(true)
  })

  it('is true when the data is wrapped', () => {
    expect(hasWindowState({ version: 1, data: { window: { x: 1 } } })).toBe(
      true
    )
  })

  it.each([
    ['no window', { schemaVersion: 2 }],
    ['a null window', { window: null }],
    ['an array window', { window: [] }],
    ['a string window', { window: 'x' }],
    ['a number window', { window: 5 }],
    ['an empty wrapper', { version: 1, data: {} }],
    [
      'a window next to the wrapper instead of inside it',
      { version: 1, data: {}, window: {} },
    ],
    ['null', null],
    ['a string', 'x'],
    ['an array', []],
  ])('is false for %s', (_label, value) => {
    expect(hasWindowState(value)).toBe(false)
  })
})

describe('normalizeAppData: default icons', () => {
  const TILE_VALUE = /^tile:[a-z0-9-]+:(?:0|[1-9]\d?)$/
  const kinds = [
    ['folders', 'folder'],
    ['websites', 'website'],
    ['apps', 'app'],
    ['passwords', 'password'],
    ['notes', 'note'],
    ['commands', 'command'],
  ] as const

  it('uses tiles, not emoji, as the defaults, one colour per category', () => {
    const values = [
      ...Object.values(DEFAULT_ITEM_ICONS),
      ...Object.values(DEFAULT_GROUP_ICONS),
      DEFAULT_TASK_ICON,
    ]

    for (const value of values) expect(value).toMatch(TILE_VALUE)
    expect(new Set(Object.values(DEFAULT_ITEM_ICONS)).size).toBe(6)
    // A category's groups share the colour of its items.
    for (const tab of GROUP_TABS) {
      expect(DEFAULT_GROUP_ICONS[tab].split(':')[2]).toBe(
        DEFAULT_ITEM_ICONS[tab].split(':')[2]
      )
    }
  })

  it.each(kinds)(
    'gives a %s item without any icon its own tile',
    (tab, kind) => {
      const blank = { id: 'x', name: 'n' }
      const data = normalizeAppData({
        [tab]: [{ id: 'g', items: [blank, { ...blank, id: 'y', icon: '' }] }],
        loose: { [tab]: [{ ...blank, id: 'z', icon: '   ' }] },
      })
      const items = [...(data[tab][0]?.items ?? []), ...data.loose[tab]]

      expect(items).toHaveLength(3)
      for (const item of items) {
        expect(item.kind).toBe(kind)
        expect(item.icon).toBe(DEFAULT_ITEM_ICONS[tab])
      }
    }
  )

  it('gives groups and tasks without an icon a tile', () => {
    const data = normalizeAppData({
      folders: [{ id: 'a' }],
      websites: [{ id: 'b', icon: '' }],
      apps: [{ id: 'c' }],
      passwords: [{ id: 'd' }],
      notes: [{ id: 'e', icon: ' ' }],
      commands: [{ id: 'f' }],
      tasks: { '2026-01-05': [{ id: 't' }, { id: 'u', icon: '' }] },
    })

    for (const tab of GROUP_TABS) {
      expect(data[tab][0]?.icon).toBe(DEFAULT_GROUP_ICONS[tab])
    }
    expect(data.tasks['2026-01-05']?.map((task) => task.icon)).toEqual([
      DEFAULT_TASK_ICON,
      DEFAULT_TASK_ICON,
    ])
  })

  it('never changes an icon that is already there: old emoji, text and tile values stay as stored', () => {
    const stored = [
      '📁',
      '🌐',
      '🚀',
      '🔑',
      '📝',
      '⌘',
      '🎯',
      '🧪',
      'AB',
      ' 📁 ',
      'tile:folder:0',
      'tile:not-in-catalog:99',
    ]
    const build = (icon: string) => ({
      folders: [
        {
          id: 'g',
          icon,
          items: [{ id: 'i', icon, name: 'n', path: 'C:/x' }],
        },
      ],
      loose: { notes: [{ id: 'n', icon, name: 'n', content: '' }] },
      tasks: { '2026-01-05': [{ id: 't', icon, name: 'n', status: 'todo' }] },
    })

    for (const icon of stored) {
      const data = normalizeAppData(build(icon))

      expect(data.folders[0]?.icon).toBe(icon)
      expect(data.folders[0]?.items[0]?.icon).toBe(icon)
      expect(data.loose.notes[0]?.icon).toBe(icon)
      expect(data.tasks['2026-01-05']?.[0]?.icon).toBe(icon)
      // And normalising the result again changes nothing.
      expect(normalizeAppData(JSON.parse(JSON.stringify(data)))).toEqual(data)
    }
  })

  it('leaves the sample data on tiles, so a fresh install needs no emoji font', () => {
    const data = createDefaultAppData()
    const icons = [
      ...GROUP_TABS.flatMap((tab) =>
        data[tab].flatMap((group) => [
          group.icon,
          ...group.items.map((item) => item.icon),
        ])
      ),
    ]

    expect(icons.length).toBeGreaterThan(5)
    for (const icon of icons) expect(icon).toMatch(TILE_VALUE)
  })
})
