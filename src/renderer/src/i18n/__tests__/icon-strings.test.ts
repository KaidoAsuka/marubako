import { describe, expect, it } from 'vitest'

import { LANGS } from '../../../../shared/types'
import catalog from '../../assets/tile-catalog.json'
import { translations } from '../translations'
import { workspaceStrings } from '../workspace'

const PICKER_KEYS = [
  'icon_choose',
  'icon_picker',
  'icon_search',
  'icon_search_hint',
  'icon_search_empty',
  'icon_color',
  'icon_glyph_list',
  'icon_custom',
  'icon_custom_placeholder',
  ...catalog.categories.map((_, index) => `tile_cat_${index}`),
  ...catalog.colors.map((_, index) => `tile_color_${index}`),
]

function text(lang: (typeof LANGS)[number], key: string): string | undefined {
  return workspaceStrings[lang][key] ?? translations[lang].strings[key]
}

describe('icon picker strings', () => {
  it.each(LANGS)('are all translated for %s', (lang) => {
    for (const key of PICKER_KEYS) {
      expect(text(lang, key), `${lang}.${key}`).toBeTruthy()
    }
  })

  it('names the 10 categories and 12 colours the same as the catalog in Chinese and English', () => {
    catalog.categories.forEach((category, index) => {
      expect(text('zh', `tile_cat_${index}`)).toBe(category.zh)
      expect(text('en', `tile_cat_${index}`)).toBe(category.en)
    })
    catalog.colors.forEach((colour, index) => {
      expect(text('zh', `tile_color_${index}`)).toBe(colour.zh)
    })
  })

  it('does not leave Chinese in the English strings or copy English into the Japanese ones', () => {
    for (const key of PICKER_KEYS) {
      expect(text('en', key), `en.${key}`).not.toMatch(/[一-鿿]/)
    }
    // The Japanese interface may mention the keyword languages, but must not be a copy of English.
    for (const key of PICKER_KEYS.filter((entry) =>
      entry.startsWith('icon_')
    )) {
      expect(text('ja', key), `ja.${key}`).not.toBe(text('en', key))
    }
  })
})
