// i18n-copy-1: a Japanese interface must not draw its kanji with the Chinese letterforms of the
// Chinese UI font, and the loading shell in index.html carries no words of any one language.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { lastValue, loadCascade, readStyle } from './css-utils'

const cascade = loadCascade()

// The font the user chose (--font-user, set on the root element by App.tsx) stands in front of both
// stacks; 'Segoe UI' takes its place while none is chosen.
const USER_FONT = "var(--font-user, 'Segoe UI')"

describe('the Japanese font stack', () => {
  it('puts the Japanese UI fonts before anything that would draw the kanji in Chinese forms', () => {
    const stack = lastValue(cascade, ':root:lang(ja)', '--sans') ?? ''

    expect(stack).toContain("'Yu Gothic UI'")
    expect(stack).toContain("'Meiryo UI'")
    expect(stack).not.toContain('YaHei')
    // Only the user's own choice comes before them. After it Latin text keeps the interface font,
    // and what the chosen font has no glyph for falls to the Japanese fonts, not to a Chinese one.
    expect(stack).toBe(
      `${USER_FONT}, 'Segoe UI', 'Yu Gothic UI', 'Meiryo UI', system-ui, sans-serif`
    )
  })

  it('beats the plain :root rule, and leaves the Chinese and English stack as it was behind the font of the user', () => {
    expect(lastValue(cascade, ':root', '--sans')).toBe(
      `${USER_FONT}, 'Segoe UI', 'Microsoft YaHei UI', system-ui, sans-serif`
    )
  })
})

describe('the font the user chose', () => {
  it.each([':root', ':root:lang(ja)'])(
    'is the first family of %s, with the interface font in its place when there is none',
    (selector) => {
      const stack = lastValue(cascade, selector, '--sans') ?? ''

      expect(stack.startsWith(`${USER_FONT}, `)).toBe(true)
      // Once, and nowhere else: a second mention would put it behind the fonts of the language.
      expect(stack.split('--font-user')).toHaveLength(2)
    }
  )

  it('is not given a value by any stylesheet: only the setting sets it', () => {
    for (const rule of cascade)
      expect(rule.body, rule.selector).not.toMatch(/--font-user\s*:/)
  })
})

describe('the first-run card styles', () => {
  const css = readStyle('onboarding.css')

  it('uses the colour tokens only', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
  })

  it('is a neutral card with a plain line: the accent is for what is selected', () => {
    expect(lastValue(cascade, '.onboarding-card', 'background')).toBe(
      'var(--card-bg)'
    )
    expect(lastValue(cascade, '.onboarding-card', 'border')).toBe(
      '1px solid var(--line)'
    )
  })
})

describe('the lines of the card and the guidance of an empty category', () => {
  it('fills the tick of a finished line with the solid accent and white, an open one is an empty ring', () => {
    expect(
      lastValue(
        cascade,
        '.onboarding-step[data-done] .onboarding-check',
        'background'
      )
    ).toBe('var(--accent-solid)')
    expect(lastValue(cascade, '.onboarding-check', 'color')).toBe(
      'var(--on-accent)'
    )
    expect(lastValue(cascade, '.onboarding-check', 'border')).toBe(
      '1px solid var(--line-strong)'
    )
  })

  it('dims a finished line, and breaks a Japanese line between phrases', () => {
    expect(lastValue(cascade, '.onboarding-step[data-done]', 'color')).toBe(
      'var(--text-dim)'
    )
    expect(lastValue(cascade, '.onboarding-step-text', 'word-break')).toBe(
      'auto-phrase'
    )
  })

  it('folds by the height of a grid row and its opacity, with the motion tokens', () => {
    const transition =
      lastValue(cascade, '.onboarding-card', 'transition') ?? ''

    expect(transition).toContain('grid-template-rows var(--motion-normal)')
    expect(transition).toContain('opacity var(--motion-normal)')
    expect(
      lastValue(cascade, '.onboarding-card[data-folding]', 'grid-template-rows')
    ).toBe('0fr')
  })

  it('draws the guidance of an empty category at 12px in the readable grey', () => {
    expect(lastValue(cascade, '.empty-state-description', 'font-size')).toBe(
      '12px'
    )
    expect(lastValue(cascade, '.empty-state-description', 'color')).toBe(
      'var(--text-mid)'
    )
  })
})

describe('the loading shell in index.html', () => {
  const html = readFileSync(
    resolve(process.cwd(), 'src/renderer/index.html'),
    'utf8'
  )
  const body = html.slice(html.indexOf('<body>'))

  it('has no Chinese, Japanese or English sentence: it shows before the language is known', () => {
    expect(body).not.toMatch(/[\p{Script=Han}\p{Script=Hiragana}]/u)
    expect(body).not.toContain('startup-subtitle')
    expect(body).not.toMatch(/Preparing/)
  })
})
