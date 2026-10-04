import { describe, expect, it } from 'vitest'

import { createDefaultAppData } from '../../shared/default-data'
import { ALL_TABS, LANGS, type AppData } from '../../shared/types'
import { buildMarkdown, markdownLabels } from '../markdown-export'

const WHEN = new Date(2026, 9, 5, 3, 40)

/** Made-up data with one of everything, and the awkward characters a real list has. */
function sample(): AppData {
  const data = createDefaultAppData('en')
  for (const tab of [
    'folders',
    'websites',
    'apps',
    'passwords',
    'commands',
    'notes',
  ] as const) {
    data[tab] = []
    data.loose[tab] = []
    data.topOrder[tab] = []
  }
  data.tasks = {}

  data.folders = [
    {
      id: 'g-design',
      name: 'Design *docs*',
      icon: '',
      open: true,
      items: [
        {
          id: 'f-1',
          kind: 'folder',
          name: 'Specs',
          icon: '',
          path: 'D:\\Work\\specs',
        },
      ],
    },
    { id: 'g-empty', name: 'Later', icon: '', open: true, items: [] },
  ]
  data.loose.folders = [
    {
      id: 'f-2',
      kind: 'folder',
      name: 'Downloads',
      icon: '',
      path: 'C:\\Users\\mika\\Downloads',
    },
    {
      id: 'f-3',
      kind: 'folder',
      name: 'Not in the order',
      icon: '',
      path: 'E:\\`odd`',
    },
  ]
  data.topOrder.folders = [
    { type: 'loose', id: 'f-2' },
    { type: 'group', id: 'g-design' },
    { type: 'group', id: 'g-empty' },
  ]

  data.loose.websites = [
    {
      id: 'w-1',
      kind: 'website',
      name: 'Wiki',
      icon: '',
      url: 'https://wiki.example.test/a_b?x=1',
    },
  ]
  data.topOrder.websites = [{ type: 'loose', id: 'w-1' }]

  data.loose.passwords = [
    {
      id: 'p-1',
      kind: 'password',
      name: 'Test server',
      icon: '',
      username: 'qa@example.test',
      password: 'p`ss word',
      note: 'first line\nsecond line',
    },
    {
      id: 'p-2',
      kind: 'password',
      name: 'From another PC',
      icon: '',
      username: 'someone',
      password: '',
      note: '',
      passwordLost: true,
    },
    {
      id: 'p-3',
      kind: 'password',
      name: 'No password yet',
      icon: '',
      username: '',
      password: '',
      note: '',
    },
  ]
  data.topOrder.passwords = [
    { type: 'loose', id: 'p-1' },
    { type: 'loose', id: 'p-2' },
    { type: 'loose', id: 'p-3' },
  ]

  data.loose.commands = [
    {
      id: 'c-1',
      kind: 'command',
      name: 'Flush DNS',
      icon: '',
      language: 'powershell',
      description: 'When a site does not resolve.',
      content: 'ipconfig /flushdns\n\n\nWrite-Host "```done```"',
    },
  ]
  data.topOrder.commands = [{ type: 'loose', id: 'c-1' }]

  data.loose.notes = [
    {
      id: 'n-1',
      kind: 'note',
      name: 'Shopping',
      icon: '',
      content: '# not a heading of the file\n\n\n- milk',
    },
  ]
  data.topOrder.notes = [{ type: 'loose', id: 'n-1' }]

  data.tasks = {
    '2026-10-06': [
      {
        id: 't-2',
        name: 'Ship it',
        icon: '',
        status: 'doing',
        open: true,
        subtasks: [
          { id: 's-1', name: 'Build', status: 'done' },
          { id: 's-2', name: 'Announce', status: 'skip' },
        ],
      },
    ],
    '2026-10-05': [
      {
        id: 't-1',
        name: 'Write notes',
        icon: '',
        status: 'done',
        open: false,
        subtasks: [],
      },
    ],
    '2026-10-07': [],
  }
  return data
}

const build = (includePasswords: boolean, lang: 'zh' | 'en' | 'ja' = 'en') =>
  buildMarkdown(sample(), {
    lang,
    includePasswords,
    exportedAt: WHEN,
    version: '3.1.1',
  })

describe('buildMarkdown', () => {
  it('opens in Notepad: a byte order mark, Windows line ends, one at the end', () => {
    const text = build(false)

    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(text.endsWith('\r\n')).toBe(true)
    expect(text.endsWith('\r\n\r\n')).toBe(false)
  })

  it('says what it is, when it was made, and that it cannot be imported', () => {
    const lines = build(false).slice(1).split('\r\n')

    expect(lines[0]).toBe('# Marubako data list')
    expect(lines[2]).toBe('Exported: 2026-10-05 03:40 (Marubako 3.1.1)')
    expect(lines[4]).toMatch(/^> This file is for reading only/)
    expect(lines[6]).toBe('> This file holds no passwords.')
  })

  it('lists every category with its count, in the order of the tabs', () => {
    const headings = build(false)
      .split('\r\n')
      .filter((line) => line.startsWith('## '))

    expect(headings).toEqual([
      '## Folders (3)',
      '## Sites (1)',
      '## Apps (0)',
      '## Passwords (3)',
      '## Commands (1)',
      '## Notes (1)',
      '## Tasks (2)',
    ])
  })

  it('follows the order of the panel, and leaves out nothing the order does not name', () => {
    const text = build(false)
    const folders = text.slice(
      text.indexOf('## Folders'),
      text.indexOf('## Sites')
    )

    expect(folders.split('\r\n').filter(Boolean)).toEqual([
      '## Folders (3)',
      '### Standalone items',
      '- **Downloads**: `C:\\Users\\mika\\Downloads`',
      '### Design \\*docs\\*',
      '- **Specs**: `D:\\Work\\specs`',
      '### Later',
      '(empty)',
      '### Standalone items',
      // A path with backticks in it is still shown exactly.
      '- **Not in the order**: `` E:\\`odd` ``',
    ])
    expect(text).toContain('## Apps (0)\r\n\r\n(empty)\r\n')
  })

  it('leaves the passwords out unless they are asked for', () => {
    const text = build(false)

    expect(text).not.toContain('p`ss word')
    expect(text).toContain('  - Password: (not exported)')
    expect(text).toContain('> This file holds no passwords.')
  })

  it('writes the passwords exactly when they are asked for, and says so at the top', () => {
    const text = build(true)
    const passwords = text.slice(
      text.indexOf('## Passwords'),
      text.indexOf('## Commands')
    )

    expect(text).toContain(
      '> Careful: this file holds passwords in plain text. Keep it safe.'
    )
    expect(passwords.split('\r\n').filter(Boolean)).toEqual([
      '## Passwords (3)',
      '### Standalone items',
      '- **Test server**',
      '  - Username: `qa@example.test`',
      '  - Password: ``p`ss word``',
      '  - Note:',
      '    first line',
      '    second line',
      '- **From another PC**',
      '  - Username: `someone`',
      '  - Password: (cannot be read on this PC; it has to be typed again)',
      '- **No password yet**',
      '  - Username: (empty)',
      '  - Password: (empty)',
    ])
  })

  it('keeps commands and notes exactly as they are, empty lines and backticks included', () => {
    const text = build(false)

    expect(text).toContain(
      [
        '#### Flush DNS',
        '',
        'When a site does not resolve.',
        '',
        '````powershell',
        'ipconfig /flushdns',
        '',
        '',
        'Write-Host "```done```"',
        '````',
      ].join('\r\n')
    )
    // A line of a note that looks like a heading stays inside its block.
    expect(text).toContain(
      [
        '#### Shopping',
        '',
        '```',
        '# not a heading of the file',
        '',
        '',
        '- milk',
        '```',
      ].join('\r\n')
    )
  })

  it('lists the tasks by day, oldest first, with their state', () => {
    const text = build(false)

    expect(text.slice(text.indexOf('## Tasks')).split('\r\n')).toEqual([
      '## Tasks (2)',
      '',
      '### 2026-10-05',
      '',
      '- [x] Write notes',
      '',
      '### 2026-10-06',
      '',
      '- [ ] Ship it (In progress)',
      '  - [x] Build',
      '  - [ ] Announce (Skipped)',
      '',
    ])
  })

  it.each(LANGS)('speaks the language of the interface (%s)', (lang) => {
    const text = build(true, lang)
    const labels = markdownLabels[lang]

    expect(text).toContain(`# ${labels.title}`)
    for (const tab of ALL_TABS)
      expect(text).toContain(`## ${labels.tabs[tab]} (`)
    expect(text).toContain(`  - ${labels.username}: `)
    expect(text).toContain(`(${labels.status.doing})`)
  })
})

describe('the words of the list', () => {
  const flat = (lang: (typeof LANGS)[number]): Record<string, string> => {
    const { tabs, status, exported, ...rest } = markdownLabels[lang]
    return {
      ...rest,
      exported: exported('WHEN', 'VERSION'),
      ...Object.fromEntries(
        Object.entries(tabs).map(([key, value]) => [`tab.${key}`, value])
      ),
      ...Object.fromEntries(
        Object.entries(status).map(([key, value]) => [`status.${key}`, value])
      ),
    }
  }

  it('are all there in every language', () => {
    for (const lang of LANGS) {
      expect(Object.keys(flat(lang)).sort(), lang).toEqual(
        Object.keys(flat('en')).sort()
      )
      for (const [key, value] of Object.entries(flat(lang)))
        expect(value.trim(), `${lang}.${key}`).not.toBe('')
    }
  })

  it('are translated: nothing in Chinese or Japanese is the English text', () => {
    for (const lang of ['zh', 'ja'] as const)
      for (const [key, value] of Object.entries(flat(lang)))
        expect(value, `${lang}.${key}`).not.toBe(flat('en')[key])
  })

  // The glossary of the interface (i18n/translations.ts): one name for each category.
  it('name the categories as the interface does', () => {
    expect(Object.values(markdownLabels.zh.tabs)).toEqual([
      '文件夹',
      '网站',
      '软件',
      '密码',
      '命令',
      '备忘',
      '任务',
    ])
    expect(Object.values(markdownLabels.ja.tabs)).toEqual([
      'フォルダ',
      'サイト',
      'アプリ',
      'パスワード',
      'コマンド',
      'メモ',
      'タスク',
    ])
  })
})
