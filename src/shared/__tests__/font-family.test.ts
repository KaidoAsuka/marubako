import { describe, expect, it } from 'vitest'

import {
  fontFamilyCss,
  MAX_FONT_FAMILY_LENGTH,
  normalizeFontFamily,
} from '../font-family'

describe('normalizeFontFamily', () => {
  it.each([
    'Segoe UI',
    'Microsoft YaHei UI',
    'Yu Gothic UI',
    'Source Han Sans SC',
    'Arial',
    // Names with digits, hyphens, dots, commas and brackets exist.
    'Bahnschrift SemiBold-2',
    'HGP創英角ﾎﾟｯﾌﾟ体',
    'Franklin Gothic (Medium), Italic',
  ])('keeps the family name %s as it is', (family) => {
    expect(normalizeFontFamily(family)).toBe(family)
  })

  // A family is known under the name of its own language as well.
  it.each(['微软雅黑', '思源黑体 CN', '游ゴシック', 'メイリオ', '맑은 고딕'])(
    'keeps the name %s, which is not written in Latin letters',
    (family) => {
      expect(normalizeFontFamily(family)).toBe(family)
    }
  )

  // The name is written into a stylesheet value between quotes: none of these may end it.
  it.each([
    ['a double quote', 'Aria"l', 'Arial'],
    ['a single quote', "Aria'l", 'Arial'],
    ['a backslash', 'Aria\\l', 'Arial'],
    ['a semicolon', 'Arial;', 'Arial'],
    ['braces', '{Arial}', 'Arial'],
    ['angle brackets', '<Arial>', 'Arial'],
    ['a line break', 'Ari\nal', 'Arial'],
    ['a tab', 'Ari\tal', 'Arial'],
    ['a NUL and an escape character', 'A\u0000rial\u001b', 'Arial'],
  ])('drops %s', (_label, value, expected) => {
    expect(normalizeFontFamily(value)).toBe(expected)
  })

  it('leaves nothing of a value that tries to close the declaration and open a rule', () => {
    const cleaned = normalizeFontFamily(
      'x"; } * { background: url("https://example.com/?") } </style><script>'
    )

    expect(cleaned).not.toMatch(/["'\\;{}<>]/)
    expect(cleaned).toBe(
      'x  *  background: url(https://example.com/?)  /stylescript'
    )
  })

  it('takes the spaces off both ends, and keeps those inside the name', () => {
    expect(normalizeFontFamily('  Yu Gothic UI \t')).toBe('Yu Gothic UI')
    // Also the spaces a dropped character leaves at an end.
    expect(normalizeFontFamily('" Arial "')).toBe('Arial')
  })

  it('is empty for a name that is only spaces or only dropped characters', () => {
    expect(normalizeFontFamily('')).toBe('')
    expect(normalizeFontFamily('   ')).toBe('')
    expect(normalizeFontFamily('"\';{}<>\\')).toBe('')
  })

  it('cuts a name off at 80 characters: a longer one was not a family name', () => {
    expect(MAX_FONT_FAMILY_LENGTH).toBe(80)
    expect(normalizeFontFamily('a'.repeat(80))).toBe('a'.repeat(80))
    expect(normalizeFontFamily('a'.repeat(81))).toBe('a'.repeat(80))
    expect(normalizeFontFamily('字'.repeat(500))).toHaveLength(80)
  })

  it.each([
    ['a number', 12],
    ['null', null],
    ['undefined', undefined],
    ['true', true],
    ['a list', ['Arial']],
    ['an object', { family: 'Arial' }],
  ])('is empty for %s: not a name', (_label, value) => {
    expect(normalizeFontFamily(value)).toBe('')
  })

  it('leaves a clean name unchanged when it is cleaned again', () => {
    for (const value of ['  Aria"l; ', 'Yu Gothic UI', '{<微软雅黑>}']) {
      const once = normalizeFontFamily(value)

      expect(normalizeFontFamily(once)).toBe(once)
    }
  })
})

describe('fontFamilyCss', () => {
  it('writes the name between double quotes, as one family', () => {
    expect(fontFamilyCss('Yu Gothic UI')).toBe('"Yu Gothic UI"')
    expect(fontFamilyCss('微软雅黑')).toBe('"微软雅黑"')
    // A generic word such as serif is a family name here too, not the keyword.
    expect(fontFamilyCss('serif')).toBe('"serif"')
  })

  it('is empty for the default, so that nothing is set', () => {
    expect(fontFamilyCss('')).toBe('')
    expect(fontFamilyCss('   ')).toBe('')
  })

  it('cleans the name itself: a value that was never normalized cannot leave the quotes', () => {
    expect(fontFamilyCss('Arial", serif; color: red')).toBe(
      '"Arial, serif color: red"'
    )
    expect(fontFamilyCss('"')).toBe('')
  })
})
