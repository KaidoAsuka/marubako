import { describe, expect, it } from 'vitest'

import { DEFAULT_SHORTCUT, formatAccelerator } from '../accelerator'
import { createDefaultAppData } from '../default-data'
import { LANGS, type AnyGroupItem, type AppData, type Group } from '../types'

/** The sample groups of every category, in the order of the tabs. */
function sampleGroups(data: AppData): Group<AnyGroupItem>[] {
  return [
    ...data.folders,
    ...data.websites,
    ...data.apps,
    ...data.passwords,
    ...data.notes,
    ...data.commands,
  ]
}

/**
 * Every string the user can read in the sample data: group names, entry names, the note, the note
 * of the sample account and the description of the sample command.
 */
function sampleWords(data: AppData): string[] {
  const groups = sampleGroups(data)
  return [
    ...groups.map((group) => group.name),
    ...groups.flatMap((group) => group.items.map((item) => item.name)),
    ...groups.flatMap((group) =>
      group.items.map((item) =>
        item.kind === 'note'
          ? item.content
          : item.kind === 'password'
            ? item.note
            : item.kind === 'command'
              ? item.description
              : ''
      )
    ),
  ]
}

const HAN = /\p{Script=Han}/u
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u

describe('sample data of a new installation', () => {
  it('has a Chinese interface unless asked otherwise (the normaliser and many tests rely on it)', () => {
    expect(createDefaultAppData().prefs.lang).toBe('zh')
    expect(createDefaultAppData()).toEqual(createDefaultAppData('zh'))
  })

  it.each(LANGS)('stores the language it is made in (%s)', (lang) => {
    expect(createDefaultAppData(lang).prefs.lang).toBe(lang)
  })

  it.each(LANGS)(
    'starts light, in graphite, as a list, with Ctrl+Shift+Space (%s)',
    (lang) => {
      const { prefs } = createDefaultAppData(lang)

      expect(prefs.theme).toBe('light')
      expect(prefs.background).toBe('minimal')
      expect(prefs.viewMode).toBe('list')
      expect(prefs.shortcut).toBe(DEFAULT_SHORTCUT)
      expect(formatAccelerator(prefs.shortcut)).toBe('Ctrl + Shift + Space')
      expect(prefs.shortcutEnabled).toBe(true)
    }
  )

  // One set of samples, in English, whatever language the first start picks: the guess of the
  // language can then never leave samples in a language the user did not expect.
  it.each(LANGS)(
    'has the English sample words, with no Chinese or Japanese characters (%s)',
    (lang) => {
      const data = createDefaultAppData(lang)

      expect(sampleGroups(data).map((group) => group.name)).toEqual([
        'Work files',
        'Personal',
        'Everyday tools',
        'Fun',
        'Terminals',
        'Accounts',
        'Notes',
        'Network',
      ])
      expect(data.folders[0]?.items.map((item) => item.name)).toEqual([
        'Desktop',
        'Documents',
      ])
      expect(data.apps[0]?.items.map((item) => item.name)).toEqual([
        'PowerShell',
        'Command Prompt',
      ])
      expect(data.passwords[0]?.items[0]?.name).toBe('Example account')
      expect(data.notes[0]?.items[0]?.name).toBe('How to use')
      expect(data.commands[0]?.items[0]?.name).toBe('Flush the DNS cache')
      for (const word of sampleWords(data)) {
        expect(word, word).not.toMatch(HAN)
        expect(word, word).not.toMatch(KANA)
      }
    }
  )

  it.each(LANGS)(
    'is the same in every language apart from the language itself (%s)',
    (lang) => {
      const data = createDefaultAppData(lang)

      expect({ ...data, prefs: { ...data.prefs, lang: 'en' } }).toEqual(
        createDefaultAppData('en')
      )
    }
  )

  it('has the same sample sites everywhere', () => {
    for (const lang of LANGS) {
      const data = createDefaultAppData(lang)

      expect(
        data.websites.flatMap((group) => group.items.map((item) => item.name))
      ).toEqual(['Google', 'GitHub', 'YouTube'])
    }
  })

  it('opens the same sample sites in every language', () => {
    const urls = (lang: 'zh' | 'en' | 'ja') =>
      createDefaultAppData(lang)
        .websites.flatMap((group) => group.items)
        .map((item) => (item.kind === 'website' ? item.url : ''))

    expect(urls('en')).toEqual([
      'https://google.com',
      'https://github.com',
      'https://youtube.com',
    ])
    expect(urls('zh')).toEqual(urls('en'))
    expect(urls('ja')).toEqual(urls('en'))
  })

  it('keeps what the data store resolves real folders by, in every language', () => {
    for (const lang of LANGS) {
      const folders = createDefaultAppData(lang).folders.flatMap(
        (group) => group.items
      )

      expect(
        folders.map((item) => [item.id, item.kind === 'folder' && item.path])
      ).toEqual([
        ['folder-desktop', 'C:\\Users\\用户名\\Desktop'],
        ['folder-documents', 'C:\\Users\\用户名\\Documents'],
        ['folder-downloads', 'C:\\Users\\用户名\\Downloads'],
      ])
    }
  })

  it.each(LANGS)(
    'has two terminals every Windows computer has as sample apps (%s)',
    (lang) => {
      const { apps, topOrder } = createDefaultAppData(lang)

      expect(apps.map((group) => group.id)).toEqual(['grp-apps-terminals'])
      expect(apps[0]?.open).toBe(true)
      expect(apps[0]?.items.map((item) => [item.id, item.path])).toEqual([
        [
          'app-powershell',
          '%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        ],
        ['app-cmd', '%SystemRoot%\\System32\\cmd.exe'],
      ])
      for (const item of apps[0]?.items ?? []) expect(item.kind).toBe('app')
      expect(topOrder.apps).toEqual([
        { type: 'group', id: 'grp-apps-terminals' },
      ])
    }
  )

  it.each(LANGS)(
    'has one sample account, with a made-up password and a note that says so (%s)',
    (lang) => {
      const { passwords, topOrder } = createDefaultAppData(lang)

      expect(passwords.map((group) => group.id)).toEqual([
        'grp-passwords-default',
      ])
      expect(passwords[0]?.items).toHaveLength(1)
      expect(passwords[0]?.items[0]).toMatchObject({
        id: 'password-example',
        kind: 'password',
        username: 'you@example.com',
        password: 'example-password',
      })
      expect(passwords[0]?.items[0]?.name).not.toBe('')
      expect(passwords[0]?.items[0]?.note).not.toBe('')
      expect(topOrder.passwords).toEqual([
        { type: 'group', id: 'grp-passwords-default' },
      ])
    }
  )

  it.each(LANGS)(
    'has one sample command, a PowerShell line that flushes the DNS cache (%s)',
    (lang) => {
      const { commands, topOrder } = createDefaultAppData(lang)

      expect(commands.map((group) => group.id)).toEqual([
        'grp-commands-default',
      ])
      expect(commands[0]?.items).toHaveLength(1)
      expect(commands[0]?.items[0]).toMatchObject({
        id: 'command-flush-dns',
        kind: 'command',
        content: 'ipconfig /flushdns',
        language: 'powershell',
      })
      expect(commands[0]?.items[0]?.name).not.toBe('')
      expect(commands[0]?.items[0]?.description).not.toBe('')
      expect(topOrder.commands).toEqual([
        { type: 'group', id: 'grp-commands-default' },
      ])
    }
  )

  it('says in plain words what the samples are', () => {
    const english = createDefaultAppData('en')

    expect(english.apps[0]?.name).toBe('Terminals')
    expect(english.apps[0]?.items.map((item) => item.name)).toEqual([
      'PowerShell',
      'Command Prompt',
    ])
    expect(english.passwords[0]?.name).toBe('Accounts')
    expect(english.passwords[0]?.items[0]?.name).toBe('Example account')
    expect(english.passwords[0]?.items[0]?.note).toContain('sample')
    expect(english.commands[0]?.name).toBe('Network')
    expect(english.commands[0]?.items[0]?.name).toBe('Flush the DNS cache')
  })

  it('has nothing outside the sample groups and no tasks', () => {
    for (const lang of LANGS) {
      const data = createDefaultAppData(lang)

      expect(data.loose).toEqual({
        folders: [],
        websites: [],
        apps: [],
        passwords: [],
        notes: [],
        commands: [],
      })
      expect(data.tasks).toEqual({})
    }
  })

  it('has the same groups, order and icons in every language', () => {
    const shape = (data: AppData) => ({
      groups: sampleGroups(data).map((group) => [
        group.id,
        group.icon,
        group.open,
        group.items.map((item) => [item.id, item.kind, item.icon]),
      ]),
      topOrder: data.topOrder,
    })

    expect(
      sampleGroups(createDefaultAppData('zh')).map((group) => group.id)
    ).toEqual([
      'grp-folders-work',
      'grp-folders-life',
      'grp-sites-tools',
      'grp-sites-fun',
      'grp-apps-terminals',
      'grp-passwords-default',
      'grp-notes-default',
      'grp-commands-default',
    ])
    // The sample sites differ for Chinese (see above); everything else is the same everywhere.
    const withoutSites = (data: AppData) =>
      shape({
        ...data,
        websites: data.websites.map((group) => ({ ...group, items: [] })),
      })
    for (const lang of LANGS)
      expect(withoutSites(createDefaultAppData(lang))).toEqual(
        withoutSites(createDefaultAppData('zh'))
      )
    expect(shape(createDefaultAppData('ja'))).toEqual(
      shape(createDefaultAppData('en'))
    )
  })

  it('gives every entry a unique id and a tile icon', () => {
    for (const lang of LANGS) {
      const data = createDefaultAppData(lang)
      const groups = sampleGroups(data)
      const items = groups.flatMap((group): AnyGroupItem[] => group.items)
      const ids = [...groups, ...items].map((entry) => entry.id)

      expect(new Set(ids).size).toBe(ids.length)
      for (const entry of [...groups, ...items])
        expect(entry.icon, entry.id).toMatch(/^tile:/)
    }
  })

  it('makes a new copy every time, so that one test cannot change the data of another', () => {
    const first = createDefaultAppData('ja')
    first.passwords[0]?.items.splice(0)
    first.folders[0]!.name = 'changed'

    expect(createDefaultAppData('ja').passwords[0]?.items).toHaveLength(1)
    expect(createDefaultAppData('en').folders[0]?.name).toBe('Work files')
  })

  it('describes the real behaviour of Esc: the ball, not the tray', () => {
    const note = (lang: 'zh' | 'en' | 'ja') =>
      (createDefaultAppData(lang).notes[0]?.items[0] as { content: string })
        .content

    expect(note('en')).toContain('bubble')
    expect(note('en')).not.toContain('tray')
    // Every first start reads the same note.
    expect(note('zh')).toBe(note('en'))
    expect(note('ja')).toBe(note('en'))
  })
})
