// i18n-copy-8: one name per concept. The glossary at the top of translations.ts says which word
// each language uses; this test fails when a banned variant comes back into a string table, or when
// the English strings drift from sentence case. A failure names the key, the variant and the word
// to use instead.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GROUP_TABS, LANGS, type Lang } from '../../../../shared/types'
import { translations } from '../translations'
import { updateStrings } from '../updates'
import { workspaceStrings } from '../workspace'

/** Every string of a language, from every table, by key. */
function allStrings(lang: Lang): Array<[string, string]> {
  return Object.entries({
    ...translations[lang].strings,
    ...workspaceStrings[lang],
    ...updateStrings[lang],
  })
}

type Banned = { pattern: RegExp; use: string }

// What each language must not say any more, and what it says instead.
const BANNED: Record<Lang, Banned[]> = {
  zh: [
    { pattern: /备忘录/, use: '备忘' },
    { pattern: /笔记/, use: '备忘' },
    { pattern: /目录/, use: '文件夹' },
    { pattern: /项目/, use: '条目' },
    // 收起 is the panel folding into the ball; the tray is 隐藏到系统托盘.
    { pattern: /收[起到]{1,2}[^，。；、）)]{0,3}托盘/, use: '隐藏到系统托盘' },
    // 折叠 / 展开 are for long content (code, notes).
    { pattern: /收起代码/, use: '折叠代码' },
  ],
  en: [
    { pattern: /\bentr(?:y|ies)\b/i, use: 'item(s)' },
    { pattern: /\bdirector(?:y|ies)\b/i, use: 'folder(s)' },
    // Collapse is the panel folding into the bubble; the tray is "hide to the system tray";
    // long content is "Show more" / "Show less".
    {
      pattern: /\bfold(?:s|ed|ing)?\b/i,
      use: 'collapse (panel) or show less (content)',
    },
    { pattern: /\bpress again to hide\b/i, use: 'collapse' },
    { pattern: /\bhide panel\b/i, use: 'collapse panel' },
    { pattern: /\bhide after launching\b/i, use: 'collapse after launching' },
    { pattern: /\bcollapse code\b/i, use: 'show less code' },
    {
      pattern: /\bcollapse (?:to|into) the (?:system )?tray\b/i,
      use: 'hide to the system tray',
    },
  ],
  ja: [
    { pattern: /アイテム/, use: '項目' },
    { pattern: /ノート/, use: 'メモ' },
    { pattern: /フォルダー/, use: 'フォルダ' },
    // 収納 is the panel folding into the ball; the tray is システムトレイに隠す.
    { pattern: /トレイ[にへ]収納/, use: 'システムトレイに隠す' },
    // The ball is フローティングボタン; a bare ボタン could be any button.
    {
      pattern: /(?<!フローティング)ボタンに収納/,
      use: 'フローティングボタンに収納',
    },
  ],
}

describe('banned variants', () => {
  it.each(LANGS)('are absent from every string table (%s)', (lang) => {
    const found: string[] = []
    for (const [key, text] of allStrings(lang))
      for (const { pattern, use } of BANNED[lang])
        if (pattern.test(text))
          found.push(`${lang}.${key}: "${text}" has ${pattern}; say ${use}`)

    expect(found).toEqual([])
  })
})

describe('the seven categories have one name each', () => {
  const NAMES: Record<Lang, Record<string, string>> = {
    zh: {
      folders: '文件夹',
      websites: '网站',
      apps: '软件',
      passwords: '密码',
      commands: '命令',
      notes: '备忘',
      tasks: '任务',
    },
    en: {
      folders: 'Folders',
      websites: 'Sites',
      apps: 'Apps',
      passwords: 'Passwords',
      commands: 'Commands',
      notes: 'Notes',
      tasks: 'Tasks',
    },
    ja: {
      folders: 'フォルダ',
      websites: 'サイト',
      apps: 'アプリ',
      passwords: 'パスワード',
      commands: 'コマンド',
      notes: 'メモ',
      tasks: 'タスク',
    },
  }

  it.each(LANGS)(
    'are the same in the tab and in the page heading (%s)',
    (lang) => {
      const strings = {
        ...translations[lang].strings,
        ...workspaceStrings[lang],
      }

      for (const tab of [...GROUP_TABS, 'tasks'] as const) {
        expect(strings[`tab_${tab}`], `${lang}.tab_${tab}`).toBe(
          NAMES[lang][tab]
        )
        if (tab !== 'tasks')
          expect(strings[`sec_${tab}`], `${lang}.sec_${tab}`).toBe(
            NAMES[lang][tab]
          )
      }
    }
  )

  it('says Passwords, not Keys, so that it is not taken for API keys or keyboard shortcuts', () => {
    expect(translations.en.strings.tab_passwords).toBe('Passwords')
    expect(translations.ja.strings.tab_passwords).toBe('パスワード')
  })
})

describe('the folding words', () => {
  it('keep the panel, the tray and long content apart in every language', () => {
    const strings = (lang: Lang) => ({
      ...translations[lang].strings,
      ...workspaceStrings[lang],
    })

    // The panel folds into the ball.
    expect(strings('zh').dock_panel).toContain('收起')
    expect(strings('en').dock_close).toContain('Collapse')
    expect(strings('ja').dock_panel).toContain('収納')
    // The tray hides the panel.
    expect(strings('zh').hide_to_tray).toBe('隐藏到系统托盘')
    expect(strings('en').hide_to_tray).toBe('Hide to system tray')
    expect(strings('ja').hide_to_tray).toBe('システムトレイに隠す')
    // Long content folds and unfolds.
    expect(strings('zh').cmd_collapse).toBe('折叠代码')
    expect(strings('en').cmd_collapse).toBe('Show less code')
    expect(strings('ja').cmd_collapse).toBe('コードを折りたたむ')
    // What the two "auto" settings and the shortcut really do: the panel folds into the ball.
    expect(strings('en').shortcut_hint).toContain('collapse')
    expect(strings('en').shortcut_escape).toContain('collapse')
    expect(strings('en').hide_after_launch).toMatch(/collapse/i)
  })
})

/** Title Case: two or more words, every one of them capitalised. */
function isTitleCase(text: string): boolean {
  const proper = new Set([
    'Marubako',
    'Windows',
    'Edge',
    'Chrome',
    'URL',
    'URLs',
    'Esc',
    'Ctrl',
    'Alt',
    'Shift',
    'Tab',
    'Enter',
    'Quit',
  ])
  const words = text
    .split(/\s+/)
    .filter((word) => /^[A-Za-z][A-Za-z'-]*$/.test(word))
    .filter((word) => word.length > 1 && !proper.has(word))

  return words.length >= 2 && words.every((word) => /^[A-Z]/.test(word))
}

describe('English capitalisation', () => {
  it('is sentence case in every table: "Add item", not "Add Item"; no shouting either', () => {
    const offenders = allStrings('en')
      .filter(([, text]) => isTitleCase(text))
      .map(([key, text]) => `en.${key}: "${text}"`)

    expect(offenders).toEqual([])
  })

  it('notices Title Case when it is there', () => {
    expect(isTitleCase('New Group')).toBe(true)
    expect(isTitleCase('MY SPACE')).toBe(true)
    expect(isTitleCase('Folders & Files')).toBe(true)
    expect(isTitleCase('New group')).toBe(false)
    expect(isTitleCase('Open Marubako')).toBe(false)
    expect(isTitleCase('Start with Windows')).toBe(false)
    expect(isTitleCase('Edge')).toBe(false)
  })
})

describe('the glossary is written down', () => {
  it('sits at the top of translations.ts, where the strings are', () => {
    const source = readFileSync(
      resolve(__dirname, '../translations.ts'),
      'utf8'
    )
    const top = source.slice(0, source.indexOf('export const translations'))

    expect(top).toContain('GLOSSARY')
    for (const word of [
      '悬浮球',
      '隐藏到系统托盘',
      '折叠',
      'Passwords',
      'パスワード',
    ])
      expect(top, word).toContain(word)
  })
})

describe('the README', () => {
  const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8')

  it('uses the Chinese words of the glossary', () => {
    const found = BANNED.zh
      .filter(({ pattern }) => pattern.test(readme))
      // The README also speaks of folders of the disk ("目录") and of source and data directories.
      .filter(({ pattern }) => !pattern.test('目录'))
      .map(({ pattern, use }) => `${pattern}: say ${use}`)

    expect(found).toEqual([])
  })
})

// The README is a short introduction of the product; the rules for whoever changes the text are in
// the contributing guide.
describe('the contributing guide', () => {
  const guide = readFileSync(resolve(process.cwd(), 'CONTRIBUTING.md'), 'utf8')

  it('names the glossary, so that the next change finds it', () => {
    expect(guide).toContain('translations.ts')
    expect(guide).toContain('glossary.test.ts')
  })
})
