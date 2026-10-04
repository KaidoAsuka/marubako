import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LANGS, type Lang } from '../../shared/types'

const state = vi.hoisted(() => ({
  lang: undefined as Lang | undefined,
  locale: 'en-US',
}))

vi.mock('electron', () => ({ app: { getLocale: () => state.locale } }))
vi.mock('../data-store', () => ({ getCachedLang: () => state.lang }))

import { getUiLang, mainStrings, mainText } from '../main-strings'

beforeEach(() => {
  state.lang = undefined
  state.locale = 'en-US'
})

describe('the language of the main process', () => {
  it('is the saved language, whatever the system says', () => {
    state.locale = 'de-DE'
    for (const lang of LANGS) {
      state.lang = lang
      expect(getUiLang()).toBe(lang)
    }
  })

  it('follows the system language until the data has been loaded, else English', () => {
    for (const [locale, expected] of [
      ['zh-CN', 'zh'],
      ['zh-TW', 'zh'],
      ['ja-JP', 'ja'],
      ['en-GB', 'en'],
      ['de-DE', 'en'],
      ['', 'en'],
    ] as const) {
      state.locale = locale
      expect(getUiLang(), locale).toBe(expected)
    }
  })

  it('picks the sentences up again when the language is changed', () => {
    state.lang = 'zh'
    expect(mainText().cancel).toBe('取消')
    state.lang = 'ja'
    expect(mainText().cancel).toBe('キャンセル')
    state.lang = 'en'
    expect(mainText().cancel).toBe('Cancel')
  })
})

describe('the sentences', () => {
  it.each(LANGS)(
    'are all there in %s, and none is an English leftover',
    (lang) => {
      const text = mainStrings[lang]
      for (const [key, value] of Object.entries(text)) {
        const sample = typeof value === 'function' ? value('x.json') : value
        expect(sample.trim(), `${lang}.${key}`).not.toBe('')
        if (lang !== 'en' && key !== 'dialogTitle') {
          expect(sample, `${lang}.${key} is untranslated`).not.toBe(
            typeof mainStrings.en[key as keyof typeof text] === 'function'
              ? (
                  mainStrings.en[key as keyof typeof text] as (
                    n: string
                  ) => string
                )('x.json')
              : mainStrings.en[key as keyof typeof text]
          )
        }
      }
    }
  )

  it('have the same keys in every language', () => {
    for (const lang of LANGS) {
      expect(Object.keys(mainStrings[lang]).sort(), lang).toEqual(
        Object.keys(mainStrings.en).sort()
      )
    }
  })
})
