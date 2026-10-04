import { describe, expect, it } from 'vitest'

import { LANGS } from '../../../../shared/types'
import { extraStrings } from '../extras'
import { safetyStrings } from '../safety'
import { translations } from '../translations'
import { updateStrings } from '../updates'
import { workspaceStrings } from '../workspace'

// The strings of 3.1.1: the size of the ball, the font, the list for reading (Markdown), the lines
// about the data on the data page of the settings, and the notice of a newer version in a portable
// copy. A key that is taken out or renamed shows here.
const KEYS = [
  'ball_size',
  'ball_size_hint',
  'font_family',
  'font_family_default',
  'font_family_hint',
  'font_family_unavailable',
  'font_family_missing',
  'export_markdown',
  'export_markdown_success',
  'export_markdown_success_no_passwords',
  'open_data_folder',
  'data_help_keep',
  'data_help_export',
  'data_help_markdown',
  'data_help_import',
  'data_help_backups',
  'update_available',
  'update_open_download',
]

/** What the caller replaces in a string, by key. */
const PLACEHOLDERS: Record<string, string> = {
  font_family_missing: '{font}',
  update_available: '{version}',
}

describe('the strings of 3.1.1 (extras.ts)', () => {
  it.each(LANGS)('are all there in %s, and no others', (lang) => {
    expect(Object.keys(extraStrings[lang]).sort()).toEqual([...KEYS].sort())
  })

  it('have the same keys in every language', () => {
    const zhKeys = Object.keys(extraStrings.zh).sort()

    for (const lang of LANGS)
      expect(Object.keys(extraStrings[lang]).sort(), lang).toEqual(zhKeys)
  })

  it.each(LANGS)(
    'are filled in, with no space left at either end, in %s',
    (lang) => {
      for (const [key, value] of Object.entries(extraStrings[lang])) {
        expect(value.trim(), `${lang}.${key}`).not.toBe('')
        expect(value, `${lang}.${key}`).toBe(value.trim())
      }
    }
  )

  it.each(['zh', 'ja'] as const)(
    'are translated into %s: none is the English text',
    (lang) => {
      for (const key of KEYS)
        expect(extraStrings[lang][key], `${lang}.${key}`).not.toBe(
          extraStrings.en[key]
        )
    }
  )

  it.each(['zh', 'ja'] as const)(
    'are written in the script of %s, not left as English sentences',
    (lang) => {
      for (const key of KEYS)
        expect(extraStrings[lang][key], `${lang}.${key}`).toMatch(
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
        )
    }
  )

  it('carry the placeholder where the caller puts a value in, and nowhere else', () => {
    for (const lang of LANGS)
      for (const [key, value] of Object.entries(extraStrings[lang])) {
        const placeholder = PLACEHOLDERS[key]
        if (placeholder) {
          expect(value, `${lang}.${key}`).toContain(placeholder)
          expect(value.split(placeholder), `${lang}.${key}`).toHaveLength(2)
        } else expect(value, `${lang}.${key}`).not.toMatch(/[{}]/)
      }
  })

  // use-i18n reads safety.ts and updates.ts before this table, and workspace.ts and
  // translations.ts after it: a key in two tables would show one text and hide the other.
  it.each(LANGS)('share no key with another table in %s', (lang) => {
    const others = {
      safety: safetyStrings[lang],
      updates: updateStrings[lang],
      workspace: workspaceStrings[lang],
      translations: translations[lang].strings,
    }

    for (const [table, strings] of Object.entries(others))
      for (const key of KEYS)
        expect(key in strings, `${key} is also in ${table}`).toBe(false)
  })

  it('call the ball by its one name in each language', () => {
    for (const key of ['ball_size', 'ball_size_hint']) {
      expect(extraStrings.zh[key], key).toContain('悬浮球')
      expect(extraStrings.en[key], key).toMatch(/bubble/i)
      expect(extraStrings.ja[key], key).toContain('フローティングボタン')
    }
  })

  it('say that the list cannot be imported again, where the list is explained', () => {
    expect(extraStrings.zh.data_help_markdown).toContain('不能再导入')
    expect(extraStrings.en.data_help_markdown).toContain(
      'cannot be imported again'
    )
    expect(extraStrings.ja.data_help_markdown).toContain(
      '読み込むことはできません'
    )
  })

  it('say that the automatic backups do not take the place of an export', () => {
    expect(extraStrings.zh.data_help_backups).toContain('不能代替导出')
    expect(extraStrings.en.data_help_backups).toContain(
      'do not replace an export'
    )
    expect(extraStrings.ja.data_help_backups).toContain(
      '書き出しの代わりにはなりません'
    )
    // Seven days of them, in every language.
    for (const lang of LANGS)
      expect(extraStrings[lang].data_help_backups, lang).toContain('7')
  })

  it('say that a portable copy does not update itself, and that the data stays', () => {
    expect(extraStrings.zh.update_available).toMatch(/不会自己更新.*数据会保留/)
    expect(extraStrings.en.update_available).toMatch(
      /does not update itself.*Your data stays/
    )
    expect(extraStrings.ja.update_available).toMatch(
      /自動更新されません.*データはそのまま残ります/
    )
  })
})
