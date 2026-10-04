import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

interface OwnerScript {
  TOKEN: string
  isValidGitHubUsername: (value: unknown) => boolean
  isSkipped: (relativePath: string) => boolean
  walkFiles: (root: string) => string[]
  replaceOwner: (
    root: string,
    owner: string,
    options?: { dryRun?: boolean; lister?: (root: string) => string[] }
  ) => string[]
  main: (
    argv: string[],
    root: string,
    out: { log: (text: string) => void; error: (text: string) => void }
  ) => number
}

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
)
const scriptPath = path.join(projectDir, 'scripts', 'set-github-owner.cjs')
const script = createRequire(import.meta.url)(scriptPath) as OwnerScript
// The test file, like the script, never spells the token out in one piece.
const TOKEN = 'GITHUB_USER_' + 'PLACEHOLDER'

let root: string

function write(relative: string, content: string | Buffer): void {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8')
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'marubako-owner-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('GitHub user names', () => {
  it.each(['octocat', 'Some-One', 'a', 'user123', 'a-b-c', 'x'.repeat(39)])(
    'accepts %s',
    (name) => {
      expect(script.isValidGitHubUsername(name)).toBe(true)
    }
  )

  it.each([
    '',
    '-lead',
    'trail-',
    'double--hyphen',
    'under_score',
    'dot.name',
    'has space',
    'slash/name',
    'x'.repeat(40),
    '$&',
    TOKEN.toLowerCase() + '!',
  ])('rejects %j', (name) => {
    expect(script.isValidGitHubUsername(name)).toBe(false)
  })

  it('rejects values that are not strings', () => {
    expect(script.isValidGitHubUsername(undefined)).toBe(false)
    expect(script.isValidGitHubUsername(42)).toBe(false)
  })
})

describe('replaceOwner', () => {
  it('replaces the token in every text file that has it and reports exactly those files', () => {
    write(
      'package.json',
      `{"homepage":"https://github.com/${TOKEN}/marubako"}\n`
    )
    write(
      'electron-builder.config.cjs',
      `owner: '${TOKEN}',\nrepo: 'marubako'\n`
    )
    write('build/installer.nsh', `"io.github.${TOKEN}.marubako" "${TOKEN}"\n`)
    write('.github/workflows/ci.yml', `repo: ${TOKEN}/marubako\n`)
    write('src/untouched.ts', 'export const nothing = 1\n')

    const changed = script.replaceOwner(root, 'octocat', {
      lister: script.walkFiles,
    })

    expect(changed.sort()).toEqual([
      '.github/workflows/ci.yml',
      'build/installer.nsh',
      'electron-builder.config.cjs',
      'package.json',
    ])
    expect(read('package.json')).toBe(
      '{"homepage":"https://github.com/octocat/marubako"}\n'
    )
    expect(read('electron-builder.config.cjs')).toBe(
      "owner: 'octocat',\nrepo: 'marubako'\n"
    )
    expect(read('build/installer.nsh')).toBe(
      '"io.github.octocat.marubako" "octocat"\n'
    )
    expect(read('src/untouched.ts')).toBe('export const nothing = 1\n')
    for (const file of changed) expect(read(file)).not.toContain(TOKEN)
  })

  it('replaces every occurrence in a file, not only the first', () => {
    write('a.md', `${TOKEN} and ${TOKEN}/x and ${TOKEN}\n`)

    script.replaceOwner(root, 'me', { lister: script.walkFiles })

    expect(read('a.md')).toBe('me and me/x and me\n')
  })

  it('keeps line endings and a byte order mark as they were', () => {
    write('crlf.txt', `﻿line ${TOKEN}\r\nnext ${TOKEN}\r\n`)

    script.replaceOwner(root, 'me', { lister: script.walkFiles })

    expect(read('crlf.txt')).toBe('﻿line me\r\nnext me\r\n')
  })

  it('never touches the review documents, node_modules, .git or binary files', () => {
    const text = `${TOKEN}\n`
    write('docs/review-2026-10-02/00-README.md', text)
    write('docs/CONTRIBUTING-extra.md', text)
    write('node_modules/pkg/index.js', text)
    write('src/node_modules/pkg/index.js', text)
    write('.git/config', text)
    write('resources/icons/logo.png', Buffer.from(`\0PNG${TOKEN}`))
    write('blob.dat', Buffer.from(`${TOKEN}\0binary`))

    const changed = script.replaceOwner(root, 'me', {
      lister: script.walkFiles,
    })

    expect(changed).toEqual(['docs/CONTRIBUTING-extra.md'])
    expect(read('docs/review-2026-10-02/00-README.md')).toBe(text)
    expect(read('node_modules/pkg/index.js')).toBe(text)
    expect(read('src/node_modules/pkg/index.js')).toBe(text)
    expect(read('.git/config')).toBe(text)
    expect(
      fs.readFileSync(path.join(root, 'resources/icons/logo.png')).toString()
    ).toContain(TOKEN)
    expect(fs.readFileSync(path.join(root, 'blob.dat')).toString()).toContain(
      TOKEN
    )
  })

  it('does not rewrite the script itself', () => {
    write('scripts/set-github-owner.cjs', `const t = '${TOKEN}'\n`)

    const changed = script.replaceOwner(root, 'me', {
      lister: script.walkFiles,
    })

    expect(changed).toEqual([])
    expect(read('scripts/set-github-owner.cjs')).toContain(TOKEN)
  })

  it('writes nothing in a dry run but still lists what it would change', () => {
    write('a.md', `${TOKEN}\n`)

    const changed = script.replaceOwner(root, 'me', {
      dryRun: true,
      lister: script.walkFiles,
    })

    expect(changed).toEqual(['a.md'])
    expect(read('a.md')).toBe(`${TOKEN}\n`)
  })

  it('is a no-op the second time', () => {
    write('a.md', `${TOKEN}\n`)
    script.replaceOwner(root, 'me', { lister: script.walkFiles })

    expect(
      script.replaceOwner(root, 'someone-else', { lister: script.walkFiles })
    ).toEqual([])
    expect(read('a.md')).toBe('me\n')
  })

  it('refuses an invalid user name before writing anything', () => {
    write('a.md', `${TOKEN}\n`)

    expect(() =>
      script.replaceOwner(root, '$&-bad', { lister: script.walkFiles })
    ).toThrow(/not a valid GitHub user name/)
    expect(read('a.md')).toBe(`${TOKEN}\n`)
  })
})

describe('command line', () => {
  function run(argv: string[]): {
    code: number
    logs: string[]
    errors: string[]
  } {
    const logs: string[] = []
    const errors: string[] = []
    const code = script.main(argv, root, {
      log: (text) => logs.push(text),
      error: (text) => errors.push(text),
    })
    return { code, logs, errors }
  }

  it('prints the changed files and exits 0', () => {
    write('a.md', `${TOKEN}\n`)
    write('b/c.md', `${TOKEN}\n`)
    write('d.md', 'nothing\n')

    const { code, logs, errors } = run(['octocat'])

    expect(code).toBe(0)
    expect(errors).toEqual([])
    expect(logs.join('\n')).toContain('Changed 2 file(s)')
    expect(logs.join('\n')).toContain('a.md')
    expect(logs.join('\n')).toContain('b/c.md')
    expect(logs.join('\n')).not.toContain('d.md')
    expect(read('a.md')).toBe('octocat\n')
  })

  it('says so when there is nothing to replace', () => {
    write('a.md', 'nothing\n')

    const { code, logs } = run(['octocat'])

    expect(code).toBe(0)
    expect(logs.join('\n')).toMatch(/nothing changed/i)
  })

  it('supports --dry-run', () => {
    write('a.md', `${TOKEN}\n`)

    const { code, logs } = run(['octocat', '--dry-run'])

    expect(code).toBe(0)
    expect(logs.join('\n')).toContain('Would change 1 file(s)')
    expect(read('a.md')).toBe(`${TOKEN}\n`)
  })

  it('fails with a usage message when the user name is missing or wrong', () => {
    write('a.md', `${TOKEN}\n`)

    const none = run([])
    const bad = run(['not a name'])
    const extra = run(['one', 'two'])

    expect(none.code).toBe(2)
    expect(none.errors.join('\n')).toContain('Usage:')
    expect(bad.code).toBe(2)
    expect(bad.errors.join('\n')).toContain('not a valid GitHub user name')
    expect(extra.code).toBe(2)
    expect(read('a.md')).toBe(`${TOKEN}\n`)
  })
})

describe('the real project', () => {
  it('skips the review documents and itself, and never contains the token in one piece', () => {
    expect(script.TOKEN).toBe(TOKEN)
    expect(script.isSkipped('docs/review-2026-10-02/00-README.md')).toBe(true)
    expect(script.isSkipped('scripts/set-github-owner.cjs')).toBe(true)
    expect(script.isSkipped('node_modules/electron/package.json')).toBe(true)
    expect(script.isSkipped('docs/other.md')).toBe(false)
    expect(script.isSkipped('electron-builder.config.cjs')).toBe(false)
    expect(fs.readFileSync(scriptPath, 'utf8')).not.toContain(TOKEN)
    expect(
      fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
    ).not.toContain(TOKEN)
  })

  // Once the script has been run on the project nothing is left to find, so this only looks at
  // what a run over the real checkout would and would not touch, and that a dry run writes nothing.
  it('keeps away from the review documents and itself in the real checkout, without writing', () => {
    const before = fs.readFileSync(
      path.join(projectDir, 'electron-builder.config.cjs'),
      'utf8'
    )

    const changed = script.replaceOwner(projectDir, 'octocat', { dryRun: true })

    expect(changed).not.toContain('scripts/set-github-owner.cjs')
    expect(
      changed.some((file) => file.startsWith('docs/review-2026-10-02/'))
    ).toBe(false)
    expect(
      fs.readFileSync(
        path.join(projectDir, 'electron-builder.config.cjs'),
        'utf8'
      )
    ).toBe(before)
  })
})
