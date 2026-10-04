import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

import { afterEach, describe, expect, it } from 'vitest'

import {
  PORTABLE_DATA_DIRNAME,
  PORTABLE_MARKER_FILENAME,
  UNINSTALLER_FILENAME,
} from '../user-data-path'

interface MakePortable {
  DATA_DIRNAME: string
  FOLDER: string
  MARKER_FILENAME: string
  makePortable: (options: {
    unpackedDir: string
    outFile: string
    workDir: string
  }) => string
  systemTar: () => string
}

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
)
const read = (file: string): string =>
  fs.readFileSync(path.join(projectDir, file), 'utf8')
const nodeRequire = createRequire(import.meta.url)
const portable = nodeRequire(
  path.join(projectDir, 'scripts/make-portable.cjs')
) as MakePortable
const pkg = nodeRequire(path.join(projectDir, 'package.json')) as {
  scripts: Record<string, string>
}

// The zip is written by the tar of Windows, which is where a release is built.
const onWindows = process.platform === 'win32'

describe('scripts/make-portable.cjs', () => {
  const made: string[] = []
  afterEach(() => {
    for (const directory of made.splice(0))
      fs.rmSync(directory, { recursive: true, force: true })
  })

  /** A stand-in for release/<version>/win-unpacked. */
  function unpackedProgram(): { root: string; unpackedDir: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marubako-zip-test-'))
    made.push(root)
    const unpackedDir = path.join(root, 'win-unpacked')
    fs.mkdirSync(path.join(unpackedDir, 'resources'), { recursive: true })
    fs.writeFileSync(path.join(unpackedDir, 'Marubako.exe'), 'program')
    fs.writeFileSync(path.join(unpackedDir, 'resources', 'app.asar'), 'asar')
    return { root, unpackedDir }
  }

  it('names the marker file and the data folder as the program does', () => {
    expect(portable.MARKER_FILENAME).toBe(PORTABLE_MARKER_FILENAME)
    expect(portable.DATA_DIRNAME).toBe(PORTABLE_DATA_DIRNAME)
  })

  it.runIf(onWindows)(
    'zips the program in one folder, with the file that makes it portable and no data folder',
    () => {
      const { root, unpackedDir } = unpackedProgram()
      const outFile = path.join(root, 'Marubako-0.0.0-portable.zip')
      const workDir = path.join(root, 'portable')

      expect(portable.makePortable({ unpackedDir, outFile, workDir })).toBe(
        outFile
      )

      const target = path.join(root, 'unzipped')
      fs.mkdirSync(target)
      execFileSync(portable.systemTar(), ['-x', '-f', outFile, '-C', target])
      const folder = path.join(target, portable.FOLDER)
      expect(fs.readdirSync(target)).toEqual([portable.FOLDER])
      // No data folder: a new version is unpacked over the old one and must leave the data alone.
      expect(fs.readdirSync(folder).sort()).toEqual([
        'Marubako.exe',
        'portable.txt',
        'resources',
      ])
      expect(
        fs.readFileSync(path.join(folder, 'resources', 'app.asar'), 'utf8')
      ).toBe('asar')
      // Never the uninstaller: with it beside the program, the copy would not be portable.
      expect(fs.existsSync(path.join(folder, UNINSTALLER_FILENAME))).toBe(false)

      // The unpacked program itself is left as the builder made it, and nothing is left behind.
      expect(fs.readdirSync(unpackedDir).sort()).toEqual([
        'Marubako.exe',
        'resources',
      ])
      expect(fs.existsSync(path.join(workDir, portable.FOLDER))).toBe(false)
    }
  )

  it.runIf(onWindows)(
    'says in three languages what the file is for, where the data is, how to update and what happens to passwords',
    () => {
      const { root, unpackedDir } = unpackedProgram()
      const outFile = path.join(root, 'Marubako-0.0.0-portable.zip')
      portable.makePortable({
        unpackedDir,
        outFile,
        workDir: path.join(root, 'portable'),
      })
      fs.mkdirSync(path.join(root, 'unzipped'))
      execFileSync(portable.systemTar(), [
        '-x',
        '-f',
        outFile,
        '-C',
        path.join(root, 'unzipped'),
      ])
      const readme = fs.readFileSync(
        path.join(root, 'unzipped', portable.FOLDER, portable.MARKER_FILENAME),
        'utf8'
      )

      // Notepad on any Windows reads the three languages with the mark, and wants CRLF.
      expect(readme.charCodeAt(0)).toBe(0xfeff)
      expect(readme.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
      for (const sentence of [
        'Keep this file where it is',
        'unpack the',
        '请把这个文件留在原处',
        '选择替换文件',
        'このファイルはこのまま置いておいてください',
        '同じ場所に展開',
        'in the folder "data" beside it',
        'does not update itself',
        'the passwords have to be typed again',
        '都在旁边的 data 文件夹里',
        '不会自动更新',
        '密码需要重新填写',
        '隣の data フォルダ',
        '自動更新されません',
        'パスワードは入力し直す必要があります',
      ])
        expect(readme, sentence).toContain(sentence)
    }
  )

  it('refuses to zip when the program has not been built', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marubako-zip-test-'))
    made.push(root)

    expect(() =>
      portable.makePortable({
        unpackedDir: path.join(root, 'win-unpacked'),
        outFile: path.join(root, 'out.zip'),
        workDir: path.join(root, 'portable'),
      })
    ).toThrow(/npm run dist/)
    expect(fs.existsSync(path.join(root, 'out.zip'))).toBe(false)
  })

  it('is what npm run dist ends with, after the installer', () => {
    expect(pkg.scripts.dist).toMatch(
      /electron-builder .* && node scripts\/make-portable\.cjs$/
    )
  })
})

// The script launches the packaged exe, so it cannot run here.
describe('scripts/smoke-portable.cjs', () => {
  const script = read('scripts/smoke-portable.cjs')

  it('is syntactically valid', () => {
    expect(() => new vm.Script(script)).not.toThrow()
  })

  it('never points the program at a data folder: the program has to find its own', () => {
    expect(script).toMatch(/delete env\.QUICKLAUNCH_USER_DATA/)
    expect(script).not.toMatch(/QUICKLAUNCH_USER_DATA:/)
  })

  it('has the program stop if it is not portable, so that it cannot reach installed data', () => {
    expect(script).toMatch(/QUICKLAUNCH_REQUIRE_PORTABLE: '1'/)
    expect(script).toMatch(/notPortable\.status\)\.toBe\(2\)/)
  })

  it('checks that a key of another PC is kept, and that nothing starts when it cannot be', () => {
    expect(script).toMatch(/expect\(readBack\)\.toBe\('kept'\)/)
    expect(script).toMatch(/keyIn\(keptOf\(there\)\)\)\.toBe\(foreignKey\)/)
    expect(script).toMatch(/refused\.status\)\.toBe\(3\)/)
  })

  // Asked for updates, a portable copy only finds out which version is the newest.
  it('checks where the data went and that nothing is downloaded as an update', () => {
    expect(script).toMatch(/getPath\('userData'\)/)
    expect(script).toContain("['latest', 'available', 'error']")
    expect(script).not.toMatch(/'downloading'|'ready'/)
    expect(script).toContain(UNINSTALLER_FILENAME)
  })
})

describe('the portable copy in the workflows', () => {
  /** The position of each text in the file, in the order given: every one present, each after the last. */
  function expectInOrder(text: string, parts: string[]): void {
    let from = 0
    for (const part of parts) {
      const at = text.indexOf(part, from)
      expect(at, part).toBeGreaterThan(-1)
      from = at + part.length
    }
  }

  it('is made and started on every pull request', () => {
    expectInOrder(read('.github/workflows/ci.yml'), [
      'node scripts/smoke-packaged.cjs',
      'node scripts/make-portable.cjs',
      'node scripts/smoke-portable.cjs',
    ])
  })

  // A step that fails here must leave a release that is complete for whoever installs.
  it('comes after the installer and its notes, and is started before the release gets it', () => {
    expectInOrder(read('.github/workflows/release.yml'), [
      '--win nsis --publish always',
      '## Install',
      'node scripts/make-portable.cjs',
      'node scripts/smoke-portable.cjs',
      'gh release upload "$TAG" release/*/Marubako-*-portable.zip --clobber',
      "grep -q '^Marubako-.*-portable\\.zip$'",
      '## Portable',
    ])
  })
})

// "Start with Windows" is a registry value named after this id, and the uninstaller of the
// installed copy deletes the value of its own id (build/installer.nsh).
describe('the portable copy as an application of its own', () => {
  it('has an id of its own, set before anything reads it', () => {
    expect(read('src/main/config.ts')).toContain(
      'export const PORTABLE_APP_ID = `${APP_ID}.portable`'
    )
    const entry = read('src/main/index.ts')
    const setsId = entry.indexOf(
      'app.setAppUserModelId(isPortable() ? PORTABLE_APP_ID : APP_ID)'
    )
    expect(setsId).toBeGreaterThan(-1)
    expect(setsId).toBeLessThan(entry.indexOf('requestSingleInstanceLock'))
  })

  it('is left alone by the uninstaller, which removes the entry of the installed copy only', () => {
    const removed = [
      ...read('build/installer.nsh').matchAll(
        /DeleteRegValue HKCU "[^"]+" "([^"]+)"/g
      ),
    ].map((match) => match[1])

    expect(removed.length).toBeGreaterThan(0)
    expect(new Set(removed)).toEqual(new Set(['${APP_ID}']))
  })
})
