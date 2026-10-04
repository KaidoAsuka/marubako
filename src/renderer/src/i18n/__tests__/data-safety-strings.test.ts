import { describe, expect, it } from 'vitest'

import { LANGS } from '../../../../shared/types'
import { workspaceStrings } from '../workspace'

const DATA_SAFETY_KEYS = [
  'data_write_failed',
  'data_write_unsaved',
  'data_retry',
  'data_reset_decrypt',
  'data_reset_parse',
  'data_reset_schema',
  'data_reset_started',
  'data_restored_before',
  'data_restored_after',
  'data_recovery_path',
  'data_passwords_lost_one',
  'data_passwords_lost_many',
  'data_open_folder',
  'data_import_backup',
  'data_dismiss',
  'pwd_lost',
  'pwd_lost_hint',
]

describe('data safety strings', () => {
  it.each(LANGS)('are all translated for %s', (lang) => {
    for (const key of DATA_SAFETY_KEYS) {
      expect(workspaceStrings[lang][key], `${lang}.${key}`).toBeTruthy()
    }
  })
})
