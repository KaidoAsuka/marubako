import { beforeEach, describe, expect, it, vi } from 'vitest'

const system = vi.hoisted(() => ({
  locale: 'en-US' as string | Error,
  preferred: ['en-US'] as string[] | Error,
}))

vi.mock('electron', () => ({
  app: {
    getLocale: () => {
      if (system.locale instanceof Error) throw system.locale
      return system.locale
    },
    getPreferredSystemLanguages: () => {
      if (system.preferred instanceof Error) throw system.preferred
      return system.preferred
    },
  },
}))

import { detectInitialLang } from '../initial-lang'

beforeEach(() => {
  system.locale = 'en-US'
  system.preferred = ['en-US']
})

describe('detectInitialLang', () => {
  it.each([
    ['zh-CN', 'zh'],
    ['zh-TW', 'zh'],
    ['ja', 'ja'],
    ['ja-JP', 'ja'],
    ['en-US', 'en'],
    ['de-DE', 'en'],
    ['', 'en'],
  ])('a computer set to %j starts in %s', (locale, lang) => {
    system.locale = locale
    system.preferred = [locale]

    expect(detectInitialLang({})).toBe(lang)
  })

  it('asks the application locale first, then the preferred languages', () => {
    system.locale = ''
    system.preferred = ['ja-JP', 'en-US']

    expect(detectInitialLang({})).toBe('ja')
  })

  it('still starts when the system cannot be asked', () => {
    system.locale = new Error('no locale')
    system.preferred = new Error('no languages')

    expect(detectInitialLang({})).toBe('en')
    system.preferred = ['ja-JP']
    expect(detectInitialLang({})).toBe('ja')
  })

  it('lets QUICKLAUNCH_LOCALE pose as another computer', () => {
    system.locale = 'zh-CN'

    expect(detectInitialLang({ QUICKLAUNCH_LOCALE: 'ja-JP' })).toBe('ja')
    expect(detectInitialLang({ QUICKLAUNCH_LOCALE: 'en-GB' })).toBe('en')
  })

  it('starts the end-to-end runs in Chinese on any machine, unless a locale is posed', () => {
    system.locale = 'en-US'
    system.preferred = ['en-US']

    expect(detectInitialLang({ QUICKLAUNCH_E2E: '1' })).toBe('zh')
    expect(
      detectInitialLang({ QUICKLAUNCH_E2E: '1', QUICKLAUNCH_LOCALE: 'en-US' })
    ).toBe('en')
  })
})
