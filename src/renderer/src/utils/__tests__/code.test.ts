import { describe, expect, it } from 'vitest'
import { highlightCode, indentCode } from '../code'

describe('code editing', () => {
  it('inserts indentation at the caret without changing surrounding code', () => {
    expect(indentCode('echo hi', 5, 5)).toEqual({
      value: 'echo   hi',
      start: 7,
      end: 7,
    })
  })
  it('indents selected lines and preserves a trailing newline', () => {
    expect(indentCode('a\nb\nc', 0, 4)).toEqual({
      value: '  a\n  b\nc',
      start: 2,
      end: 8,
    })
  })
  it('outdents tabs and spaces with the caret at the start of a line', () => {
    expect(indentCode('  print(1)', 0, 0, true)).toEqual({
      value: 'print(1)',
      start: 0,
      end: 0,
    })
    expect(indentCode('\tprint(1)', 1, 1, true).value).toBe('print(1)')
  })
  it('round trips a selection through indent and outdent', () => {
    const value = '# hello\n  print("世界")\n\n'
    const next = indentCode(value, 0, value.length)
    expect(indentCode(next.value, next.start, next.end, true).value).toBe(value)
  })
})

describe('code preview', () => {
  it('preserves every character including markup, tabs and trailing lines', () => {
    const value = '# comment\nif x < 2:\n\tprint("<script>&世界")\n'
    const tokens = highlightCode(value, 'python')
    expect(tokens.map((token) => token.text).join('')).toBe(value)
    expect(tokens).toContainEqual({ text: '# comment', kind: 'comment' })
    expect(tokens).toContainEqual({ text: 'if', kind: 'keyword' })
    expect(tokens).toContainEqual({ text: '2', kind: 'number' })
  })
  it('keeps plain text unchanged', () => {
    expect(highlightCode('a # b', 'plaintext')).toEqual([{ text: 'a # b' }])
  })
})
