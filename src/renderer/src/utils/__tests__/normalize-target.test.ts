import { describe, expect, it } from 'vitest'

import {
  detectTarget,
  detectTargets,
  hostLabel,
  inferName,
  isWindowsPath,
  normalizeWebAddress,
  stripQuotes,
} from '../normalize-target'

describe('stripQuotes', () => {
  it.each([
    ['"C:\\Program Files\\App\\app.exe"', 'C:\\Program Files\\App\\app.exe'],
    ["'C:\\Work'", 'C:\\Work'],
    ['\u201cC:\\Work\u201d', 'C:\\Work'],
    ['  "C:\\Work"  ', 'C:\\Work'],
    ['" C:\\Work "', 'C:\\Work'],
    ['C:\\Work', 'C:\\Work'],
    ['  C:\\Work  ', 'C:\\Work'],
  ])('turns %j into %j', (raw, expected) => {
    expect(stripQuotes(raw)).toBe(expected)
  })

  it('leaves unpaired or mismatched quotes alone', () => {
    expect(stripQuotes('"C:\\Work')).toBe('"C:\\Work')
    expect(stripQuotes('C:\\Work"')).toBe('C:\\Work"')
    expect(stripQuotes('"C:\\Work\'')).toBe('"C:\\Work\'')
    expect(stripQuotes('"')).toBe('"')
  })

  it('removes only one pair', () => {
    expect(stripQuotes('""C:\\Work""')).toBe('"C:\\Work"')
  })
})

describe('isWindowsPath', () => {
  it.each([
    'C:\\Work',
    'c:/work/notes',
    'C:\\',
    'C:',
    'D:\\Tools\\App.exe',
    'C:\\Program Files (x86)\\App\\app.exe',
    '\\\\server\\share',
    '\\\\server\\share\\folder\\file.txt',
    '%USERPROFILE%\\Documents',
    '%ProgramFiles%/App/app.exe',
    'C:\\Users\\me\\Doc#1 [draft] & more',
  ])('accepts %j', (value) => {
    expect(isWindowsPath(value)).toBe(true)
  })

  it.each([
    '',
    '   ',
    'Work',
    'notepad.exe',
    'work\\notes',
    '.\\notes',
    '\\Windows',
    'https://example.com',
    'C:\\Work<1>',
    'C:\\Work|x',
    'C:\\what?',
    'C:\\star*',
    'C:\\quo"te',
    'C:\\Work:stream',
    'C:\\tab\there',
    // The long-path prefix is not supported: it holds a question mark.
    '\\\\?\\C:\\very\\long',
    '\\\\server',
    '\\\\',
    '%USERPROFILE',
  ])('rejects %j', (value) => {
    expect(isWindowsPath(value)).toBe(false)
  })
})

describe('normalizeWebAddress', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['  example.com/path?q=1  ', 'https://example.com/path?q=1'],
    ['www.example.com', 'https://www.example.com'],
    ['http://example.com', 'http://example.com'],
    ['HTTPS://Example.com/A', 'HTTPS://Example.com/A'],
    ['"https://example.com"', 'https://example.com'],
    // Local and private addresses answer on http; https would not connect.
    ['localhost', 'http://localhost'],
    ['localhost:3000', 'http://localhost:3000'],
    ['localhost:3000/app?x=1', 'http://localhost:3000/app?x=1'],
    ['127.0.0.1:8080', 'http://127.0.0.1:8080'],
    ['192.168.1.1', 'http://192.168.1.1'],
    ['192.168.1.1/admin', 'http://192.168.1.1/admin'],
    ['[::1]:3000', 'http://[::1]:3000'],
    // Not local: a name that merely starts like one.
    ['localhost.example.com', 'https://localhost.example.com'],
    ['192.168.1.1.example.com', 'https://192.168.1.1.example.com'],
    ['intranet', 'https://intranet'],
  ])('turns %j into %j', (raw, expected) => {
    expect(normalizeWebAddress(raw)).toBe(expected)
  })

  it.each([
    '',
    '   ',
    'file:///C:/test',
    'ftp://example.com',
    'javascript:alert(1)',
    'mailto:me@example.com',
    'exa mple.com',
    'https://exa mple.com',
    'http://',
    'https://',
    '://example.com',
  ])('rejects %j', (raw) => {
    expect(normalizeWebAddress(raw)).toBeNull()
  })
})

describe('hostLabel', () => {
  it('drops a leading www. and keeps the rest', () => {
    expect(hostLabel('https://www.example.com/a')).toBe('example.com')
    expect(hostLabel('https://docs.example.com')).toBe('docs.example.com')
    expect(hostLabel('http://localhost:3000')).toBe('localhost')
    expect(hostLabel('http://192.168.1.1/x')).toBe('192.168.1.1')
  })

  it('is empty for something that is not an address', () => {
    expect(hostLabel('not a url')).toBe('')
  })
})

describe('inferName', () => {
  it('names a website after its host', () => {
    expect(inferName('websites', 'https://www.github.com/anthropics')).toBe(
      'github.com'
    )
    expect(inferName('websites', 'github.com')).toBe('github.com')
    expect(inferName('websites', '"localhost:3000"')).toBe('localhost')
  })

  it('names a program after its file, without the extension', () => {
    expect(inferName('apps', 'C:\\Tools\\Editor.exe')).toBe('Editor')
    expect(inferName('apps', '"C:\\Tools\\Editor.LNK"')).toBe('Editor')
    expect(inferName('apps', 'C:\\Tools\\run.cmd')).toBe('run')
    expect(inferName('apps', 'C:\\Tools\\Editor.v2.exe')).toBe('Editor.v2')
    expect(inferName('apps', 'C:\\Tools\\tool.jar')).toBe('tool.jar')
  })

  it('names a folder after its last segment, keeping a dot in it', () => {
    expect(inferName('folders', 'C:\\Work\\Project.v2')).toBe('Project.v2')
    expect(inferName('folders', 'C:\\Work\\Reports\\')).toBe('Reports')
    expect(inferName('folders', '\\\\server\\share\\team')).toBe('team')
    expect(inferName('folders', 'D:/photos/2024')).toBe('2024')
    expect(inferName('folders', 'C:\\')).toBe('C:')
  })

  it('is empty when there is nothing to name it after', () => {
    expect(inferName('websites', '')).toBe('')
    expect(inferName('websites', 'not a site')).toBe('')
    expect(inferName('folders', '   ')).toBe('')
    expect(inferName('apps', '""')).toBe('')
  })
})

describe('detectTarget', () => {
  it('takes a web address with its scheme', () => {
    expect(detectTarget('https://example.com/a?b=1')).toEqual({
      kind: 'website',
      target: 'https://example.com/a?b=1',
    })
    expect(detectTarget('  http://localhost:3000  ')).toEqual({
      kind: 'website',
      target: 'http://localhost:3000',
    })
    expect(detectTarget('"https://example.com"')).toEqual({
      kind: 'website',
      target: 'https://example.com',
    })
  })

  it('takes a drive path or a network share, quoted or not', () => {
    expect(detectTarget('C:\\Work')).toEqual({
      kind: 'path',
      target: 'C:\\Work',
    })
    expect(detectTarget('"C:\\Program Files\\App\\app.exe"')).toEqual({
      kind: 'path',
      target: 'C:\\Program Files\\App\\app.exe',
    })
    expect(detectTarget('d:/photos')).toEqual({
      kind: 'path',
      target: 'd:/photos',
    })
    expect(detectTarget('\\\\server\\share\\team')).toEqual({
      kind: 'path',
      target: '\\\\server\\share\\team',
    })
  })

  it.each([
    '',
    '   ',
    'example.com',
    'hello world',
    'see https://example.com for details',
    'C:',
    'C:Work',
    '%USERPROFILE%\\Documents',
    'Work\\notes',
    'ftp://example.com/file',
    'file:///C:/Work',
    'https://exa mple.com',
    'C:\\Work\nD:\\Other',
    '12345',
    'C:\\bad|path',
  ])('ignores %j', (text) => {
    expect(detectTarget(text)).toBeNull()
  })
})

describe('detectTargets', () => {
  it('reads one target per line, as Explorer copies a multiple selection', () => {
    expect(
      detectTargets('"C:\\Work\\a.txt"\r\n"C:\\Work\\b folder"\r\n')
    ).toEqual([
      { kind: 'path', target: 'C:\\Work\\a.txt' },
      { kind: 'path', target: 'C:\\Work\\b folder' },
    ])
  })

  it('mixes addresses and paths, and lists a repeated one once', () => {
    expect(
      detectTargets('https://example.com\nC:\\Work\n\nhttps://example.com\n')
    ).toEqual([
      { kind: 'website', target: 'https://example.com' },
      { kind: 'path', target: 'C:\\Work' },
    ])
  })

  it('takes a single line the same way detectTarget does', () => {
    expect(detectTargets('http://localhost:3000')).toEqual([
      { kind: 'website', target: 'http://localhost:3000' },
    ])
  })

  it('is empty as soon as one line is not a target: that is text, not a list', () => {
    expect(detectTargets('C:\\Work\nsome notes about it')).toEqual([])
    expect(detectTargets('Meeting at 3\nhttps://example.com')).toEqual([])
    expect(detectTargets('')).toEqual([])
    expect(detectTargets('\n\n')).toEqual([])
  })

  it('refuses an absurd amount of lines', () => {
    const many = Array.from({ length: 101 }, (_, i) => `C:\\Work\\${i}`)
    expect(detectTargets(many.join('\n'))).toEqual([])
  })
})
