import { describe, expect, it } from 'vitest'

import { LANGS } from '../../../../shared/types'
import { workspaceStrings } from '../workspace'

const FRAME_KEYS = [
  'view_mode',
  'view_mode_hint',
  'view_mode_grid',
  'view_mode_list',
  'tab_summary',
  'tab_summary_tasks',
]

describe('frame strings (layout, iteration 4)', () => {
  it.each(LANGS)('are all translated for %s', (lang) => {
    for (const key of FRAME_KEYS)
      expect(workspaceStrings[lang][key], `${lang}.${key}`).toBeTruthy()
  })

  it.each(LANGS)(
    'keep every placeholder of the tab summaries in %s',
    (lang) => {
      const strings = workspaceStrings[lang]

      for (const placeholder of ['{name}', '{groups}', '{items}', '{n}'])
        expect(strings.tab_summary, `${lang} ${placeholder}`).toContain(
          placeholder
        )
      for (const placeholder of ['{name}', '{open}', '{n}'])
        expect(strings.tab_summary_tasks, `${lang} ${placeholder}`).toContain(
          placeholder
        )
    }
  )

  it('no longer sends the user to a logo at the top left of the title bar', () => {
    // The title bar has no logo any more: the collapse button is on the right.
    expect(workspaceStrings.zh.dock_guide).not.toContain('左上')
    expect(workspaceStrings.en.dock_guide).not.toContain('top-left')
    expect(workspaceStrings.ja.dock_guide).not.toContain('左上')
  })

  it('has dropped the strings of the per-page switch and filter box', () => {
    for (const lang of LANGS) {
      expect(workspaceStrings[lang].view_grid).toBeUndefined()
      expect(workspaceStrings[lang].view_list).toBeUndefined()
      expect(workspaceStrings[lang].filter_current).toBeUndefined()
    }
  })
})
