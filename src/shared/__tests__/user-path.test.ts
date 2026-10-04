import { describe, expect, it } from 'vitest'

import {
  cleanPathInput,
  expandEnvironmentVariables,
  resolveEntryPath,
} from '../user-path'

describe('cleanPathInput', () => {
  it('leaves a clean path alone', () => {
    for (const path of [
      String.raw`C:\Work`,
      String.raw`C:\Program Files\App\app.exe`,
      'C:\\',
      String.raw`D:\Mixed/Slashes\ok`,
      '/mnt/relative',
      String.raw`relative\dir`,
    ]) {
      expect(cleanPathInput(path), path).toBe(path)
    }
  })

  it('removes the quotes of "Copy as path"', () => {
    expect(cleanPathInput(String.raw`"C:\Program Files\App\app.exe"`)).toBe(
      String.raw`C:\Program Files\App\app.exe`
    )
    expect(cleanPathInput('"C:\\Dir\\"')).toBe('C:\\Dir\\')
  })

  it('removes single and curly quotes that wrap the whole path', () => {
    expect(cleanPathInput(String.raw`'C:\Work'`)).toBe(String.raw`C:\Work`)
    expect(cleanPathInput('\u201cC:\\Work\u201d')).toBe('C:\\Work')
    expect(cleanPathInput('\u2018C:\\Work\u2019')).toBe('C:\\Work')
  })

  it('removes a double quote that lost its partner, which no Windows path can contain', () => {
    expect(cleanPathInput(String.raw`"C:\Work`)).toBe(String.raw`C:\Work`)
    expect(cleanPathInput(String.raw`C:\Work"`)).toBe(String.raw`C:\Work`)
  })

  it('keeps an apostrophe that belongs to a name', () => {
    expect(cleanPathInput(String.raw`C:\O'Brien\notes`)).toBe(
      String.raw`C:\O'Brien\notes`
    )
    expect(cleanPathInput(String.raw`C:\Users\Bob's`)).toBe(
      String.raw`C:\Users\Bob's`
    )
    // A single quote on one side is part of the name, not a wrapper.
    expect(cleanPathInput(String.raw`'C:\Work`)).toBe(String.raw`'C:\Work`)
  })

  it('removes whitespace around the path, quotes inside the whitespace, and whitespace inside the quotes', () => {
    expect(cleanPathInput(`  C:\\Work \t`)).toBe('C:\\Work')
    expect(cleanPathInput(`  "C:\\Work"  `)).toBe('C:\\Work')
    expect(cleanPathInput(`" C:\\Work "`)).toBe('C:\\Work')
    expect(cleanPathInput('C:\\Work\r\n')).toBe('C:\\Work')
    expect(cleanPathInput('\u00a0C:\\Work\u00a0')).toBe('C:\\Work')
  })

  it('removes several layers, but only the outside ones', () => {
    expect(cleanPathInput(String.raw`"'C:\Work'"`)).toBe(String.raw`C:\Work`)
    expect(cleanPathInput(String.raw`C:\a "quoted" dir`)).toBe(
      String.raw`C:\a "quoted" dir`
    )
  })

  it('removes the invisible marks that copying from a file’s Properties adds', () => {
    expect(cleanPathInput('\u202aC:\\Work\\file.txt')).toBe(
      'C:\\Work\\file.txt'
    )
    expect(cleanPathInput('\ufeffC:\\Work')).toBe('C:\\Work')
    expect(cleanPathInput('C:\\Wo\u200brk')).toBe('C:\\Work')
    expect(cleanPathInput('"\u202aC:\\Work"')).toBe('C:\\Work')
  })

  it('turns a file: URL into a path', () => {
    expect(cleanPathInput('file:///C:/Users/me/My%20Files/a.txt')).toBe(
      String.raw`C:\Users\me\My Files\a.txt`
    )
    expect(cleanPathInput('file:///C:/Work')).toBe(String.raw`C:\Work`)
    expect(cleanPathInput('FILE:///c:/Work')).toBe(String.raw`c:\Work`)
    expect(cleanPathInput('file:/C:/Work')).toBe(String.raw`C:\Work`)
    expect(cleanPathInput('file:C:/Work')).toBe(String.raw`C:\Work`)
    expect(cleanPathInput('file://localhost/C:/Work')).toBe(String.raw`C:\Work`)
    expect(cleanPathInput('file:///C:/%E4%B8%AD%E6%96%87')).toBe(
      String.raw`C:\中文`
    )
    expect(cleanPathInput('  "file:///C:/Work"  ')).toBe(String.raw`C:\Work`)
  })

  it('turns a file: URL with a host into a UNC path', () => {
    expect(cleanPathInput('file://server/share/dir/a%20b.txt')).toBe(
      String.raw`\\server\share\dir\a b.txt`
    )
    expect(cleanPathInput('file://server/share')).toBe(
      String.raw`\\server\share`
    )
  })

  it('drops the query and fragment of a file: URL, and keeps a stray percent sign', () => {
    expect(cleanPathInput('file:///C:/Work/a.html#top')).toBe(
      String.raw`C:\Work\a.html`
    )
    expect(cleanPathInput('file:///C:/100%/x')).toBe(String.raw`C:\100%\x`)
  })

  it('keeps UNC paths, with or without quotes', () => {
    expect(cleanPathInput(String.raw`\\server\share\dir`)).toBe(
      String.raw`\\server\share\dir`
    )
    expect(cleanPathInput(String.raw`"\\server\share\dir"`)).toBe(
      String.raw`\\server\share\dir`
    )
    expect(cleanPathInput(String.raw`\\?\C:\Very\Long`)).toBe(
      String.raw`\\?\C:\Very\Long`
    )
    expect(cleanPathInput('//server/share')).toBe('//server/share')
  })

  it('keeps %VARIABLES% as typed: they are expanded when the entry is opened', () => {
    expect(cleanPathInput(String.raw`"%USERPROFILE%\Documents"`)).toBe(
      String.raw`%USERPROFILE%\Documents`
    )
  })

  it('gives nothing for nothing', () => {
    for (const empty of ['', '   ', '""', '" "', "''", '\u202a']) {
      expect(cleanPathInput(empty), JSON.stringify(empty)).toBe('')
    }
  })

  it('does not touch text that only looks like a file: URL', () => {
    expect(cleanPathInput(String.raw`C:\files\file:x`)).toBe(
      String.raw`C:\files\file:x`
    )
  })
})

describe('expandEnvironmentVariables', () => {
  const env = {
    USERPROFILE: String.raw`C:\Users\me`,
    AppData: String.raw`C:\Users\me\AppData\Roaming`,
    'ProgramFiles(x86)': String.raw`C:\Program Files (x86)`,
    TRICKY: '%USERPROFILE%',
    EMPTY: '',
  }

  it('expands a variable, whatever the case of its name', () => {
    expect(
      expandEnvironmentVariables(String.raw`%USERPROFILE%\Docs`, env)
    ).toBe(String.raw`C:\Users\me\Docs`)
    expect(
      expandEnvironmentVariables(String.raw`%userprofile%\Docs`, env)
    ).toBe(String.raw`C:\Users\me\Docs`)
    expect(expandEnvironmentVariables(String.raw`%APPDATA%\x`, env)).toBe(
      String.raw`C:\Users\me\AppData\Roaming\x`
    )
  })

  it('expands several variables, and names with parentheses', () => {
    expect(
      expandEnvironmentVariables(
        String.raw`%ProgramFiles(x86)%\App;%USERPROFILE%`,
        env
      )
    ).toBe(String.raw`C:\Program Files (x86)\App;C:\Users\me`)
  })

  it('leaves a variable that is not defined exactly as written', () => {
    expect(expandEnvironmentVariables(String.raw`%NOPE%\x`, env)).toBe(
      String.raw`%NOPE%\x`
    )
  })

  it('expands in one pass only: what a variable contains is not expanded again', () => {
    expect(expandEnvironmentVariables('%TRICKY%', env)).toBe('%USERPROFILE%')
  })

  it('expands a variable that is empty to nothing', () => {
    expect(expandEnvironmentVariables(String.raw`a%EMPTY%b`, env)).toBe('ab')
  })

  it('does not take a lone percent sign, or text between percent signs, for a variable', () => {
    for (const text of [
      '100%',
      'C:\\50% off\\x',
      'a % b % c',
      '%',
      '%%',
      String.raw`%A B%`,
      String.raw`%C:\x%`,
    ]) {
      expect(expandEnvironmentVariables(text, env), text).toBe(text)
    }
  })

  it('ignores the other shells’ syntaxes', () => {
    for (const text of ['$HOME/x', '$env:USERPROFILE', '${USERPROFILE}', '~']) {
      expect(expandEnvironmentVariables(text, env), text).toBe(text)
    }
  })

  it('works on an empty environment', () => {
    expect(expandEnvironmentVariables('%USERPROFILE%', {})).toBe(
      '%USERPROFILE%'
    )
  })
})

describe('resolveEntryPath', () => {
  const env = { USERPROFILE: String.raw`C:\Users\me` }

  it('cleans, then expands', () => {
    expect(resolveEntryPath(String.raw` "%USERPROFILE%\Docs" `, env)).toBe(
      String.raw`C:\Users\me\Docs`
    )
  })

  it('makes a path from a file: URL and keeps UNC paths', () => {
    expect(resolveEntryPath('file:///C:/Work', env)).toBe(String.raw`C:\Work`)
    expect(resolveEntryPath(String.raw`"\\nas\share"`, env)).toBe(
      String.raw`\\nas\share`
    )
  })
})
