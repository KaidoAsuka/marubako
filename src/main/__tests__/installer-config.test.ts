import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

interface BuilderConfig {
  appId: string
  nsis: { include?: string }
}

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
)
const config = createRequire(import.meta.url)(
  path.join(projectDir, 'electron-builder.config.cjs')
) as BuilderConfig

function installerPath(): string {
  const include = config.nsis.include
  if (!include) throw new Error('nsis.include is not configured')
  return path.resolve(projectDir, include)
}

const rawScript = (): Buffer => fs.readFileSync(installerPath())
function readInstallerScript(): string {
  return rawScript().toString('utf8').replace(/^﻿/, '')
}

/** The part of the script between the guard line and the `${endIf}` that closes it. */
function guardedBlock(script: string, guard: string): string {
  const start = script.indexOf(guard)
  if (start === -1) throw new Error(`no ${guard}`)
  let depth = 0
  const token = /\$\{(if|ifNot|endIf)\}/gi
  token.lastIndex = start
  for (let match = token.exec(script); match; match = token.exec(script)) {
    depth += /^endif$/i.test(match[1] ?? '') ? -1 : 1
    if (depth === 0) return script.slice(start, match.index)
  }
  throw new Error('the guard is never closed')
}

/** Non-comment lines that start with the given NSIS instruction. */
function instructions(script: string, name: string): string[] {
  return script
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => new RegExp(`^${name}\\b`, 'i').test(line))
}

const GUARD = '${ifNot} ${isUpdated}'

describe('NSIS installer customisation', () => {
  it('includes an installer script that exists on disk', () => {
    expect(config.nsis.include).toBeTypeOf('string')
    expect(fs.existsSync(installerPath())).toBe(true)
  })

  it('is UTF-8 with a byte order mark: NSIS reads the Chinese and Japanese text only then', () => {
    const bytes = rawScript()

    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(/[^\x00-\x7f]/.test(readInstallerScript())).toBe(true)
  })

  it('defines the uninstall step and does all of it only when uninstalling, never on an upgrade', () => {
    const script = readInstallerScript()
    expect(script).toContain('!macro customUnInstall')
    const body = script.slice(script.indexOf('!macro customUnInstall'))
    const guarded = guardedBlock(body, GUARD)

    // Everything that changes something sits inside the guard.
    for (const name of ['DeleteRegValue', 'RMDir', 'MessageBox']) {
      const all = instructions(body, name)
      expect(all.length, name).toBeGreaterThan(0)
      expect(instructions(guarded, name), name).toEqual(all)
    }
    // The guard is the first thing the macro does.
    expect(
      body.slice(body.indexOf('!macro customUnInstall') + 22).trimStart()
    ).toMatch(/^\$\{ifNot\} \$\{isUpdated\}/)
  })
})

describe('the start-with-Windows entry (extra-9)', () => {
  it('is removed from the per-user Run entry and its StartupApproved flag, by the app user model id', () => {
    const script = readInstallerScript()
    const deletions = instructions(script, 'DeleteRegValue')
    const runKey = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run'
    const approvedKey =
      'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'

    expect(deletions).toHaveLength(2)
    expect(deletions).toEqual(
      expect.arrayContaining([
        `DeleteRegValue HKCU "${runKey}" "\${APP_ID}"`,
        `DeleteRegValue HKCU "${approvedKey}" "\${APP_ID}"`,
      ])
    )
    expect(script).not.toMatch(/HKLM|HKEY_LOCAL_MACHINE|SHELL_CONTEXT/)
    expect(script).not.toMatch(/DeleteRegKey/)
  })

  it('takes the value name from the builder, so it cannot drift from the appId the app registers', () => {
    const script = readInstallerScript()
    const mainConfig = fs.readFileSync(
      path.join(projectDir, 'src/main/config.ts'),
      'utf8'
    )

    // electron-builder defines APP_ID as the appId; the app uses the same text as its user model id.
    expect(script).not.toContain(config.appId)
    expect(script).not.toMatch(/io\.github\./)
    expect(/export const APP_ID = '([^']+)'/.exec(mainConfig)?.[1]).toBe(
      config.appId
    )
  })
})

describe('the data folder at uninstall (release-repo-11)', () => {
  const body = (): string => {
    const script = readInstallerScript()
    return guardedBlock(
      script.slice(script.indexOf('!macro customUnInstall')),
      GUARD
    )
  }

  it('asks first, and "No" is the default: Enter, closing the box and a silent uninstall all keep the data', () => {
    const [box, ...others] = instructions(body(), 'MessageBox')

    expect(others).toEqual([])
    expect(box).toMatch(/\bMB_YESNO\b/)
    expect(box).toMatch(/\bMB_DEFBUTTON2\b/)
    // Not /SD: the one-click uninstaller is already silent when this runs, and /SD would answer
    // the box at once without showing it. The command line decides instead.
    expect(box).not.toMatch(/\/SD\b/)
    expect(body()).toMatch(/\$\{GetOptions\} \$R0 "\/S" \$R1/)
    expect(box).toMatch(/\bIDNO marubakoKeepData$/)
  })

  it('deletes the data folder only after the question and only when the answer was Yes', () => {
    const text = body()
    const box = text.indexOf('MessageBox')
    const skipLabel = text.indexOf('marubakoKeepData:')
    const dataDeletion = text.indexOf(
      'RMDir /r "$APPDATA\\${APP_PACKAGE_NAME}"'
    )

    expect(box).toBeGreaterThan(-1)
    expect(dataDeletion).toBeGreaterThan(box)
    expect(skipLabel).toBeGreaterThan(dataDeletion)
    // Nothing between the question and the deletion can jump over the label by another route.
    const between = text.slice(box, dataDeletion)
    expect(between.match(/\b(Goto|Call)\b/gi)).toBeNull()
  })

  it('is only asked when there is data, and is about the folder Electron uses for this package', () => {
    const text = body()

    expect(text).toContain('${FileExists} "$APPDATA\\${APP_PACKAGE_NAME}\\*.*"')
    // Only the two folders of this program are ever deleted, never %APPDATA% itself.
    expect(instructions(text, 'RMDir').sort()).toEqual([
      'RMDir /r "$APPDATA\\${APP_PACKAGE_NAME}"',
      'RMDir /r "$LOCALAPPDATA\\${APP_PACKAGE_NAME}-updater"',
    ])
  })

  it('looks in the current user’s application data even for a per-machine install, and puts the context back', () => {
    const text = body()

    expect(text).toContain('SetShellVarContext current')
    expect(text.lastIndexOf('SetShellVarContext all')).toBeGreaterThan(
      text.lastIndexOf('RMDir')
    )
  })

  it.each([
    ['zh', 0x04, '数据', '密码', '选择“否”'],
    ['ja', 0x11, 'データ', 'パスワード', '「いいえ」'],
    ['en', null, 'data', 'passwords', 'Choose No'],
  ] as const)(
    'asks in %s: it names the data, the passwords and what "No" does',
    (_lang, languageId, data, passwords, no) => {
      const text = body()
      const message = instructions(text, 'StrCpy \\$marubakoDataPrompt').find(
        (line) => line.includes(data) && line.includes(passwords)
      )

      expect(message).toBeDefined()
      expect(message).toContain('Marubako')
      expect(message).toContain(no)
      if (languageId !== null)
        expect(text).toContain(
          `$2 = 0x${languageId.toString(16).padStart(2, '0')}`
        )
    }
  )

  it('picks the language from the Windows display language, with English for every other', () => {
    const text = body()

    expect(text).toContain('GetUserDefaultUILanguage')
    expect(text).toMatch(/IntOp \$2 \$2 & 0x3FF/)
    expect(text).toMatch(/\$\{else\}[\s\S]*Also delete the data Marubako keeps/)
  })
})
