import { describe, expect, it } from 'vitest'

import { LANGS } from '../../../../shared/types'
import { translations } from '../translations'
import { workspaceStrings } from '../workspace'

const DELETE_UNDO_KEYS = [
  'undo',
  'deleted_before',
  'deleted_after',
  'restored_before',
  'restored_after',
  'del_group_confirm_before',
  'del_group_confirm_middle',
  'del_group_confirm_after',
  'del_group_confirm_after_one',
  'del_lost_password_before',
  'del_lost_password_after',
]

describe('delete and undo strings', () => {
  it.each(LANGS)('are all translated for %s', (lang) => {
    for (const key of DELETE_UNDO_KEYS) {
      const value =
        workspaceStrings[lang][key] ?? translations[lang].strings[key]
      expect(value, `${lang}.${key}`).toBeTruthy()
    }
  })

  it('reads as a sentence around the group name and item count', () => {
    const sentence = (lang: (typeof LANGS)[number], count: number) => {
      const s = workspaceStrings[lang]
      return [
        s.del_group_confirm_before,
        'Work',
        s.del_group_confirm_middle,
        count,
        count === 1 ? s.del_group_confirm_after_one : s.del_group_confirm_after,
      ].join('')
    }

    expect(sentence('zh', 3)).toBe('删除分组「Work」及其中 3 个条目？')
    expect(sentence('en', 3)).toBe('Delete group "Work" and its 3 items?')
    expect(sentence('en', 1)).toBe('Delete group "Work" and its 1 item?')
    expect(sentence('ja', 3)).toBe(
      'グループ「Work」とその中の 3 件を削除しますか？'
    )
  })
})
