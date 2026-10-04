// flow-4 / product-ux-11: the first-run card and the guidance of the empty categories, in three
// languages. The card is small: every line has to fit on at most three lines of the default window.
import { describe, expect, it } from 'vitest'

import { GROUP_TABS, LANGS } from '../../../../shared/types'
import { workspaceStrings } from '../workspace'

const CARD_KEYS = [
  'onboard_title',
  'onboard_done',
  'onboard_drop',
  'onboard_bubble',
  'onboard_hotkey',
  'onboard_dismiss',
]
const EMPTY_KEYS = [...GROUP_TABS, 'tasks'].map((tab) => `empty_${tab}`)

// Characters that fit on three lines of the card at the default window width (zh and ja 400 px,
// en 470 px; the text column is the window less about 90 px), with a margin.
const LINE_LIMIT = { zh: 60, ja: 60, en: 125 } as const

describe('the first-run card strings', () => {
  it.each(LANGS)('are all there, none empty (%s)', (lang) => {
    for (const key of CARD_KEYS)
      expect(workspaceStrings[lang][key], `${lang}.${key}`).toBeTruthy()
  })

  it.each(LANGS)('name the shortcut exactly once (%s)', (lang) => {
    expect(
      workspaceStrings[lang].onboard_hotkey!.split('{shortcut}')
    ).toHaveLength(2)
  })

  it.each(LANGS)(
    'keep every line short enough for three lines (%s)',
    (lang) => {
      for (const key of ['onboard_drop', 'onboard_bubble', 'onboard_hotkey'])
        expect(
          workspaceStrings[lang][key]!.length,
          `${lang}.${key}`
        ).toBeLessThanOrEqual(LINE_LIMIT[lang])
    }
  )

  it('teach the two ways to open the ball, as the e2e specs and the hover hint spell them', () => {
    expect(workspaceStrings.zh.onboard_bubble).toContain('单击')
    expect(workspaceStrings.zh.onboard_bubble).toContain('双击保持打开')
    expect(workspaceStrings.en.onboard_bubble).toContain('click it to peek')
    expect(workspaceStrings.en.onboard_bubble).toContain(
      'double-click to keep open'
    )
    expect(workspaceStrings.ja.onboard_bubble).toContain('クリックで一時表示')
    expect(workspaceStrings.ja.onboard_bubble).toContain(
      'ダブルクリックで開いたまま'
    )
  })

  it('no longer carry the welcome toast, which the card replaced', () => {
    for (const lang of LANGS) {
      expect(workspaceStrings[lang].welcome_hint).toBeUndefined()
      expect(workspaceStrings[lang].welcome_shortcut).toBeUndefined()
    }
  })
})

describe('the guidance of an empty category', () => {
  it.each(LANGS)(
    'has a sentence for every category and for tasks (%s)',
    (lang) => {
      for (const key of EMPTY_KEYS) {
        const sentence = workspaceStrings[lang][key]

        expect(sentence, `${lang}.${key}`).toBeTruthy()
        // One sentence: one full stop at the end, none in the middle.
        expect(sentence!.slice(0, -1), `${lang}.${key}`).not.toMatch(/[.。]/)
      }
    }
  )

  it.each(LANGS)(
    'is the same kind of text in every language, not a tagline (%s)',
    (lang) => {
      for (const key of EMPTY_KEYS)
        expect(
          workspaceStrings[lang][key]!.length,
          `${lang}.${key}`
        ).toBeGreaterThan(lang === 'en' ? 30 : 12)
    }
  )
})
