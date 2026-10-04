import { describe, expect, it } from 'vitest'

import { parseStartupParams, toStartupQuery } from '../startup-params'
import { langFromLocale, resolveSystemLang } from '../system-lang'

describe('langFromLocale', () => {
  it.each([
    ['zh-CN', 'zh'],
    ['zh-TW', 'zh'],
    ['zh-Hant-HK', 'zh'],
    ['zh', 'zh'],
    ['ZH_cn', 'zh'],
    ['ja', 'ja'],
    ['ja-JP', 'ja'],
    ['ja_JP', 'ja'],
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['de-DE', 'en'],
    ['ko-KR', 'en'],
    ['fr', 'en'],
  ])('%s is %s', (locale, lang) => {
    expect(langFromLocale(locale)).toBe(lang)
  })

  it.each([undefined, null, '', '   ', 'x', 'zhuang'])(
    'falls back to English for %j',
    (locale) => {
      expect(langFromLocale(locale)).toBe('en')
    }
  )
})

describe('resolveSystemLang', () => {
  it('takes the first candidate that says anything', () => {
    expect(resolveSystemLang(['ja-JP', 'zh-CN', 'en-US'])).toBe('ja')
    expect(resolveSystemLang(['', undefined, null, 'zh-CN', 'en-US'])).toBe(
      'zh'
    )
  })

  it('does not look past an unsupported first language', () => {
    // A Korean computer is English here, even if Chinese is listed further down.
    expect(resolveSystemLang(['ko-KR', 'zh-CN'])).toBe('en')
  })

  it('is English when nothing is known', () => {
    expect(resolveSystemLang([])).toBe('en')
    expect(resolveSystemLang(['', '  '])).toBe('en')
  })
})

describe('startup parameters', () => {
  it('round-trip through a query string', () => {
    const query = toStartupQuery({ lang: 'ja', theme: 'light', firstRun: true })
    const search = `?${new URLSearchParams(query).toString()}`

    expect(parseStartupParams(search)).toEqual({
      lang: 'ja',
      theme: 'light',
      firstRun: true,
    })
  })

  it('leave out what is not given', () => {
    expect(toStartupQuery({ lang: 'en' })).toEqual({ lang: 'en' })
    expect(toStartupQuery({ firstRun: false })).toEqual({})
  })

  it('ignore values the app does not know', () => {
    expect(parseStartupParams('?lang=fr&theme=sepia&firstrun=yes')).toEqual({
      lang: null,
      theme: null,
      firstRun: false,
    })
    expect(parseStartupParams('')).toEqual({
      lang: null,
      theme: null,
      firstRun: false,
    })
  })
})
