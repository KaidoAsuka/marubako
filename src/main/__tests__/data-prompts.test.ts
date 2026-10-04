import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Lang } from '../../shared/types'

const state = vi.hoisted(() => ({
  lang: undefined as Lang | undefined,
  locale: 'en-US',
  response: 0,
  options: undefined as undefined | Record<string, unknown>,
  parent: undefined as unknown,
  errorBox: undefined as undefined | [string, string],
}))

vi.mock('electron', () => ({
  app: { getLocale: () => state.locale },
  dialog: {
    // With a parent window the options are the second argument.
    showMessageBox: vi.fn(
      async (...args: Array<Record<string, unknown> | undefined>) => {
        state.options = args[args.length - 1] as Record<string, unknown>
        state.parent = args.length > 1 ? args[0] : undefined
        return { response: state.response }
      }
    ),
    showErrorBox: vi.fn((title: string, content: string) => {
      state.errorBox = [title, content]
    }),
  },
}))

vi.mock('../data-store', () => ({ getCachedLang: () => state.lang }))

import { InvalidBackupError, UnsupportedSchemaError } from '../data-normalize'
import {
  describeImportError,
  promptExportPasswords,
  promptImportConfirm,
  promptRecovery,
  promptSaveFailure,
  showStartupFailure,
} from '../data-prompts'
import { DataDecryptError } from '../encryption'

beforeEach(() => {
  state.lang = 'en'
  state.locale = 'en-US'
  state.response = 0
  state.options = undefined
  state.parent = undefined
  state.errorBox = undefined
})

const backup = {
  path: 'C:\\data\\backups\\quicklaunch-data-20261002.json',
  date: '2026-10-02',
  kind: 'daily' as const,
}

describe('promptRecovery', () => {
  it('offers quit, restore and start fresh when a backup exists', async () => {
    state.response = 1

    const choice = await promptRecovery({
      reason: 'parse',
      filePath: 'C:\\data\\quicklaunch-data.json',
      backups: [backup],
    })

    expect(choice).toEqual({ action: 'restore', backupPath: backup.path })
    expect(state.options?.buttons).toEqual([
      'Quit (keep the original file)',
      'Restore the backup of 2026-10-02',
      'Start with default data',
    ])
    expect(state.options?.defaultId).toBe(0)
    expect(state.options?.cancelId).toBe(0)
  })

  it('keeps quitting as the default and the cancel action', async () => {
    state.response = 0
    expect(
      await promptRecovery({
        reason: 'parse',
        filePath: 'x',
        backups: [backup],
      })
    ).toEqual({ action: 'exit' })
  })

  it('offers only quit and start fresh without a backup', async () => {
    state.response = 1

    const choice = await promptRecovery({
      reason: 'decrypt',
      filePath: 'C:\\data\\quicklaunch-data.json',
      backups: [],
    })

    expect(choice).toEqual({ action: 'fresh' })
    expect(state.options?.buttons).toHaveLength(2)
  })

  it('treats an unexpected answer as quitting', async () => {
    state.response = 7
    expect(
      await promptRecovery({ reason: 'parse', filePath: 'x', backups: [] })
    ).toEqual({ action: 'exit' })
  })

  it('explains the reason and names the file', async () => {
    await promptRecovery({
      reason: 'decrypt',
      filePath: 'C:\\data\\quicklaunch-data.json',
      backups: [],
    })

    expect(String(state.options?.message)).toContain('another computer')
    expect(String(state.options?.detail)).toContain(
      'C:\\data\\quicklaunch-data.json'
    )
  })

  it('does not mention a file when it is missing', async () => {
    await promptRecovery({
      reason: 'missing',
      filePath: 'C:\\data\\quicklaunch-data.json',
      backups: [backup],
    })

    expect(String(state.options?.detail)).not.toContain('quicklaunch-data.json')
  })

  it('speaks the system language until the data language is known', async () => {
    state.lang = undefined
    state.locale = 'ja-JP'
    await promptRecovery({ reason: 'parse', filePath: 'x', backups: [] })
    expect(String(state.options?.message)).toContain('データファイル')

    state.locale = 'zh-CN'
    await promptRecovery({ reason: 'parse', filePath: 'x', backups: [] })
    expect(String(state.options?.message)).toContain('数据文件')

    state.locale = 'de-DE'
    await promptRecovery({ reason: 'parse', filePath: 'x', backups: [] })
    expect(String(state.options?.message)).toContain('data file')
  })
})

describe('promptSaveFailure', () => {
  it('returns retry for the first button and quit for the second', async () => {
    state.response = 0
    expect(await promptSaveFailure('disk is full')).toBe('retry')
    expect(String(state.options?.detail)).toContain('disk is full')

    state.response = 1
    expect(await promptSaveFailure('disk is full')).toBe('quit')
  })
})

describe('describeImportError', () => {
  it('explains each kind of failure in the display language', () => {
    expect(describeImportError(new InvalidBackupError())).toContain(
      'not a Marubako data file'
    )
    expect(describeImportError(new SyntaxError('Unexpected token'))).toContain(
      'not valid JSON'
    )
    expect(describeImportError(new DataDecryptError())).toContain(
      'another computer'
    )
    expect(describeImportError(new UnsupportedSchemaError(3))).toContain(
      'newer version'
    )

    state.lang = 'zh'
    expect(describeImportError(new InvalidBackupError())).toContain('数据文件')
    state.lang = 'ja'
    expect(describeImportError(new InvalidBackupError())).toContain(
      'データファイル'
    )
  })

  it('passes other errors through unchanged', () => {
    expect(describeImportError(new Error('EACCES: permission denied'))).toBe(
      'EACCES: permission denied'
    )
    expect(describeImportError('plain')).toBe('plain')
  })
})

describe('promptExportPasswords', () => {
  it('offers the three answers, "without passwords" first and as the default', async () => {
    await promptExportPasswords(null)

    expect(state.options?.buttons).toEqual([
      'Export without passwords',
      'Export with passwords',
      'Cancel',
    ])
    expect(state.options?.defaultId).toBe(0)
    expect(state.options?.cancelId).toBe(2)
  })

  it.each([
    [0, 'without-passwords'],
    [1, 'with-passwords'],
    [2, 'cancel'],
    [9, 'cancel'],
  ] as const)('answer %i means %s', async (response, expected) => {
    state.response = response

    expect(await promptExportPasswords(null)).toBe(expected)
  })

  it('says the file is not encrypted, what is in it, where not to put it and how to move passwords', async () => {
    await promptExportPasswords(null)

    const text = `${String(state.options?.message)} ${String(state.options?.detail)}`
    expect(text).toContain('not encrypted')
    expect(text).toContain('every password in plain text')
    expect(text).toContain('cloud-synced folder')
    expect(text).toContain('send it to others')
    expect(text).toContain('another computer')
    expect(text).toContain('Export with passwords')
  })

  it('is modal to the given window', async () => {
    const parent = { id: 'main' }

    await promptExportPasswords(parent as never)

    expect(state.parent).toBe(parent)
  })

  it.each([
    ['zh', ['不含密码导出', '含密码导出', '取消'], '不加密', '网盘同步目录'],
    [
      'ja',
      ['パスワードなしで書き出す', 'パスワードを含めて書き出す', 'キャンセル'],
      '暗号化されません',
      'クラウド同期フォルダー',
    ],
  ] as const)('speaks %s', async (lang, buttons, message, detail) => {
    state.lang = lang

    await promptExportPasswords(null)

    expect(state.options?.buttons).toEqual(buttons)
    expect(String(state.options?.message)).toContain(message)
    expect(String(state.options?.detail)).toContain(detail)
  })
})

describe('promptImportConfirm', () => {
  const file = {
    name: 'marubako-export-2026-10-03.json',
    passwordsOmitted: false,
  }

  it('asks to replace the data, names the file and defaults to Cancel', async () => {
    state.response = 0

    expect(await promptImportConfirm(null, file)).toBe(true)

    expect(state.options?.buttons).toEqual(['Import', 'Cancel'])
    expect(state.options?.defaultId).toBe(1)
    expect(state.options?.cancelId).toBe(1)
    expect(String(state.options?.message)).toContain(
      'replaces all current data'
    )
    expect(String(state.options?.detail)).toContain(file.name)
    expect(String(state.options?.detail)).toContain('backed up')
  })

  it('does not import on Cancel or when the box is closed', async () => {
    for (const response of [1, 5]) {
      state.response = response
      expect(await promptImportConfirm(null, file)).toBe(false)
    }
  })

  it('warns about a file without passwords, and only about one', async () => {
    await promptImportConfirm(null, file)
    expect(String(state.options?.detail)).not.toContain('no passwords')

    await promptImportConfirm(null, { ...file, passwordsOmitted: true })
    expect(String(state.options?.detail)).toContain('contains no passwords')
    expect(String(state.options?.detail)).toContain('empty password')
  })

  it.each([
    ['zh', '这个文件不含密码', '备份'],
    ['ja', 'パスワードが含まれていません', 'バックアップ'],
  ] as const)('speaks %s', async (lang, note, backup) => {
    state.lang = lang

    await promptImportConfirm(null, { ...file, passwordsOmitted: true })

    expect(String(state.options?.detail)).toContain(note)
    expect(String(state.options?.detail)).toContain(backup)
  })
})

describe('showStartupFailure', () => {
  const logPath = 'C:\\Users\\me\\AppData\\Roaming\\Marubako\\logs\\main.log'

  it.each([
    ['en', 'Marubako could not start', 'Reason: boom', 'Details were written'],
    ['zh', 'Marubako 无法启动', '原因：boom', '详细信息已写入日志'],
    [
      'ja',
      'Marubako を起動できません',
      '原因: boom',
      '詳細はログに記録されました',
    ],
  ] as const)(
    'says in %s that it could not start, why, and where the log is',
    async (lang, title, reason, where) => {
      state.lang = lang

      showStartupFailure(new Error('boom'), logPath)

      const [shownTitle, shownContent] = state.errorBox ?? ['', '']
      expect(shownTitle).toBe(title)
      expect(shownContent).toContain(reason)
      expect(shownContent).toContain(where)
      expect(shownContent).toContain(logPath)
    }
  )

  it('speaks the system language when the data never loaded', () => {
    state.lang = undefined
    state.locale = 'ja-JP'

    showStartupFailure('plain text', logPath)

    expect(state.errorBox?.[0]).toBe('Marubako を起動できません')
    expect(state.errorBox?.[1]).toContain('原因: plain text')
  })
})
