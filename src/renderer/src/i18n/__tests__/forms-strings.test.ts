import { describe, expect, it } from 'vitest'

import { LANGS } from '../../../../shared/types'
import { workspaceStrings } from '../workspace'

// Every string the forms package (iteration 5) added. A key missing in one language would render as
// the raw key, so each language has to carry all of them, and the Japanese must not be a copy of the
// English.
const FORMS_KEYS = [
  'discard_prompt',
  'discard_keep',
  'discard_confirm',
  'invalid_path_format',
  'f_date',
  'task_added_to',
  'task_all_done',
  'task_mark_done',
  'task_subtask_reopened',
  'task_reopen',
  'item_save_hint_continue',
  'item_name_auto_placeholder',
  'added_named',
  'added_many',
  'added_items',
  'added_skipped',
  'added_exists',
  'moved_named',
  'drop_hint',
  'drop_hint_group',
  'drop_unsupported',
]

const HAS_JAPANESE = /[぀-ヿ一-鿿]/

describe('forms strings', () => {
  it.each(LANGS)('are all translated for %s', (lang) => {
    for (const key of FORMS_KEYS) {
      expect(workspaceStrings[lang][key], `${lang}.${key}`).toBeTruthy()
    }
  })

  it('carry the same {placeholders} in every language', () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

    for (const key of FORMS_KEYS) {
      const zh = placeholders(workspaceStrings.zh[key]!)
      expect(placeholders(workspaceStrings.en[key]!), key).toEqual(zh)
      expect(placeholders(workspaceStrings.ja[key]!), key).toEqual(zh)
    }
  })

  it('are real Japanese, not the English text again', () => {
    for (const key of FORMS_KEYS) {
      const ja = workspaceStrings.ja[key]!
      expect(ja, key).toMatch(HAS_JAPANESE)
      expect(ja, key).not.toBe(workspaceStrings.en[key])
    }
  })
})
