import { describe, expect, it } from 'vitest'

import { LANGS } from '../../../../shared/types'
import { translations } from '../translations'
import { workspaceStrings } from '../workspace'

describe('feedback strip strings', () => {
  it.each(LANGS)(
    'keep the line that moved to the settings data page (%s)',
    (lang) => {
      expect(workspaceStrings[lang].local_data, lang).toBeTruthy()
    }
  )

  it.each(LANGS)(
    'no longer carry what only the status bar and the "saved" toast used (%s)',
    (lang) => {
      for (const key of ['tray_open', 'workspace_recall', 'saving_data']) {
        expect(workspaceStrings[lang][key], `${lang}.${key}`).toBeUndefined()
      }
      expect(translations[lang].strings.saved, `${lang}.saved`).toBeUndefined()
    }
  )
})
