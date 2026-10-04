import { describe, expect, it } from 'vitest'

import { translations } from '../translations'

describe('motion setting label', () => {
  // The stored value is a duration multiplier: a larger number makes animations
  // slower, so a label that promises "speed" points the slider the wrong way.
  it.each([
    ['zh', '动效时长'],
    ['en', 'Animation duration'],
    ['ja', 'アニメーション時間'],
  ] as const)('names a duration in %s', (lang, label) => {
    expect(translations[lang].strings.motion).toBe(label)
  })

  it.each(['zh', 'en', 'ja'] as const)(
    'does not call the duration a speed in %s',
    (lang) => {
      expect(translations[lang].strings.motion).not.toMatch(
        /速度|speed|スピード/i
      )
    }
  )
})
