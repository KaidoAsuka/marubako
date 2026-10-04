import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppData, DataStatus } from '../../shared/types'
import { normalizeAppData } from '../data-normalize'
import type * as StoreModule from '../data-store'

const env = vi.hoisted(() => ({
  dir: '',
  keyId: 'k1',
  encryptionAvailable: true,
  // What the operating system says about the user's language (app.getLocale).
  locale: 'zh-CN',
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) =>
      name === 'userData' ? env.dir : `${env.dir}/${name}`,
    getLocale: () => env.locale,
  },
  safeStorage: {
    isEncryptionAvailable: () => env.encryptionAvailable,
    encryptString: (value: string) => Buffer.from(`${env.keyId}:${value}`),
    decryptString: (buffer: Buffer) => {
      const text = buffer.toString()
      if (!text.startsWith(`${env.keyId}:`)) throw new Error('wrong key')
      return text.slice(env.keyId.length + 1)
    },
  },
}))

vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

type Store = typeof StoreModule

let store: Store
const sessions: Store[] = []

const dataFile = () => path.join(env.dir, 'quicklaunch-data.json')
const windowFile = () => path.join(env.dir, 'window-state.json')
const backupDir = () => path.join(env.dir, 'backups')
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function startSession(keyId = env.keyId): Promise<Store> {
  env.keyId = keyId
  vi.resetModules()
  store = await import('../data-store')
  sessions.push(store)
  return store
}

async function readJson(file: string): Promise<any> {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}

function sampleData(): AppData {
  const data = normalizeAppData({
    prefs: { lang: 'en' },
    notes: [
      {
        id: 'note-group',
        name: 'Notes',
        items: [
          { id: 'note-1', name: 'Scratch', content: '  keep\tspacing\n' },
        ],
      },
    ],
    loose: {
      passwords: [
        {
          id: 'pw-1',
          name: 'Mail',
          username: 'me@example.com',
          password: 's3cret',
          note: '',
        },
      ],
    },
  })
  return data
}

async function writeLegacyFile(data: Record<string, unknown>): Promise<string> {
  const payload = Buffer.from(
    `${env.keyId}:${JSON.stringify(data, null, 2)}`
  ).toString('base64')
  const text = JSON.stringify({ version: 1, encrypted: true, payload })
  await fs.writeFile(dataFile(), text)
  return text
}

beforeEach(async () => {
  env.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'marubako-store-'))
  env.keyId = 'k1'
  env.encryptionAvailable = true
  env.locale = 'zh-CN'
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  // Timers of finished sessions must not write into a deleted directory.
  await Promise.all(
    sessions
      .splice(0)
      .map((session) => session.flushPendingWrite().catch(() => undefined))
  )
  await fs.rm(env.dir, { recursive: true, force: true })
})

describe('first start', () => {
  it('writes default data in the current file format and reports nothing', async () => {
    const { loadAppData, getDataStatus } = await startSession()

    const data = await loadAppData()

    expect(data.prefs.lang).toBe('zh')
    expect(getDataStatus()).toEqual({ writeError: null, notices: [] })
    const file = await readJson(dataFile())
    expect(file).toMatchObject({ format: 'quicklaunch-data', version: 2 })
    expect(file.data.window).toBeUndefined()
  })

  it.each([
    ['en-US', 'en', 'Work files'],
    ['de-DE', 'en', 'Work files'],
    ['ja-JP', 'ja', '仕事のファイル'],
    ['zh-TW', 'zh', '工作文件'],
  ])(
    'follows the system language: %s starts in %s with sample groups in it',
    async (locale, lang, firstGroup) => {
      env.locale = locale
      const { loadAppData } = await startSession()

      const data = await loadAppData()

      expect(data.prefs.lang).toBe(lang)
      expect(data.folders[0]?.name).toBe(firstGroup)
      // The placeholder path of the sample folders is resolved in every language.
      const desktop = data.folders[0]?.items[0]
      expect(desktop?.path).toBe(`${env.dir}/desktop`)
      expect((await readJson(dataFile())).data.prefs.lang).toBe(lang)
    }
  )

  it('is a fresh installation only when there was no data and no backup', async () => {
    const first = await startSession()
    expect(first.isFreshInstall()).toBe(false)
    await first.loadAppData()
    expect(first.isFreshInstall()).toBe(true)
    await first.flushPendingWrite()

    // The next start finds the file: it is the same installation.
    const second = await startSession()
    await second.loadAppData()
    expect(second.isFreshInstall()).toBe(false)
  })

  it('is not a fresh installation when a damaged file is replaced by default data', async () => {
    await fs.writeFile(dataFile(), '{ not json')
    const { loadAppData, isFreshInstall } = await startSession()

    await loadAppData()

    expect(isFreshInstall()).toBe(false)
  })

  it('keeps the language of data that already exists, whatever the system says', async () => {
    const first = await startSession()
    await first.updateAppData((current) => ({
      ...current,
      prefs: { ...current.prefs, lang: 'zh' },
    }))
    await first.flushPendingWrite()

    env.locale = 'en-US'
    const second = await startSession()
    const data = await second.loadAppData()

    expect(data.prefs.lang).toBe('zh')
    expect(data.folders[0]?.name).toBe('工作文件')
  })

  it('removes temporary files left by an interrupted write', async () => {
    const stale = `${dataFile()}.4242-7.tmp`
    await fs.writeFile(stale, 'half a file')
    const { loadAppData } = await startSession()

    await loadAppData()

    await expect(fs.access(stale)).rejects.toThrow()
  })
})

describe('file format', () => {
  it('writes readable JSON, encrypts only passwords, and keeps the window out of it', async () => {
    const { loadAppData, saveAppData, flushPendingWrite } = await startSession()
    await loadAppData()

    await saveAppData(sampleData())
    await flushPendingWrite()

    const text = await fs.readFile(dataFile(), 'utf8')
    expect(text).not.toContain('s3cret')
    expect(text).toContain('passwordCiphertext')
    expect(text).toContain('  keep\\tspacing\\n')
    expect(JSON.parse(text).data.window).toBeUndefined()
  })

  it('reads its own file back, passwords included', async () => {
    const first = await startSession()
    await first.loadAppData()
    await first.saveAppData(sampleData())
    await first.flushPendingWrite()

    const second = await startSession()
    const data = await second.loadAppData()

    expect(data.loose.passwords[0]?.password).toBe('s3cret')
    expect(data.loose.passwords[0]?.passwordLost).toBeUndefined()
    expect(data.notes[0]?.items[0]?.content).toBe('  keep\tspacing\n')
  })

  it('migrates a file written by 2.5.8 and keeps the old file as a backup', async () => {
    const legacy = {
      ...sampleData(),
      window: {
        bounds: { x: 10, y: 20, w: 500, h: 600 },
        alwaysOnTop: true,
        opacity: 0.8,
        collapsed: false,
        preCollapseHeight: 600,
      },
    }
    const original = await writeLegacyFile(legacy)
    const { loadAppData, flushPendingWrite } = await startSession()

    const data = await loadAppData()
    await flushPendingWrite()

    expect(data.loose.passwords[0]?.password).toBe('s3cret')
    expect(data.window.bounds).toEqual({ x: 10, y: 20, w: 500, h: 600 })
    expect(await readJson(dataFile())).toMatchObject({
      format: 'quicklaunch-data',
      version: 2,
    })
    expect(await fs.readFile(`${dataFile()}.bak`, 'utf8')).toBe(original)
    const snapshots = await fs.readdir(backupDir())
    expect(snapshots).toHaveLength(1)
    expect(
      await fs.readFile(path.join(backupDir(), snapshots[0]!), 'utf8')
    ).toBe(original)
    expect((await readJson(windowFile())).window.bounds).toEqual({
      x: 10,
      y: 20,
      w: 500,
      h: 600,
    })
  })
})

describe('window position', () => {
  it('is saved in its own file and does not rewrite the data file', async () => {
    const session = await startSession()
    await session.loadAppData()
    await session.saveAppData(sampleData())
    await session.flushPendingWrite()
    const before = await fs.readFile(dataFile(), 'utf8')
    const modifiedBefore = (await fs.stat(dataFile())).mtimeMs

    await session.updateWindowData((state) => ({
      ...state,
      alwaysOnTop: true,
      bounds: { x: 5, y: 6, w: 700, h: 800 },
    }))
    await session.flushPendingWrite()

    expect(await fs.readFile(dataFile(), 'utf8')).toBe(before)
    expect((await fs.stat(dataFile())).mtimeMs).toBe(modifiedBefore)
    expect((await readJson(windowFile())).window).toMatchObject({
      alwaysOnTop: true,
      bounds: { x: 5, y: 6, w: 700, h: 800 },
    })

    const restarted = await startSession()
    expect((await restarted.loadAppData()).window.bounds).toEqual({
      x: 5,
      y: 6,
      w: 700,
      h: 800,
    })
  })

  it('does not write anything when nothing changed', async () => {
    const session = await startSession()
    const current = await session.loadAppData()
    await session.saveAppData(sampleData())
    await session.flushPendingWrite()
    const rename = vi.spyOn(fs, 'rename')

    await session.saveAppData(sampleData())
    await session.updateWindowData((state) => ({ ...state }))
    await session.updateWindowData(() => current.window)
    await session.flushPendingWrite()

    expect(rename).not.toHaveBeenCalled()
  })
})

describe('an unreadable data file', () => {
  const damaged = '{broken-data-with-user-content'

  it('is never replaced when the user chooses to quit', async () => {
    await fs.writeFile(dataFile(), damaged)
    const { loadAppData, DataLoadAbortedError } = await startSession()
    const chooseRecovery = vi.fn(async () => ({ action: 'exit' as const }))

    await expect(loadAppData({ chooseRecovery })).rejects.toBeInstanceOf(
      DataLoadAbortedError
    )

    expect(chooseRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'parse', backups: [] })
    )
    expect(await fs.readFile(dataFile(), 'utf8')).toBe(damaged)
    expect(
      (await fs.readdir(env.dir)).filter((name) => name.includes('recovery'))
    ).toEqual([])
  })

  it('is kept as a recovery copy before starting from default data', async () => {
    await fs.writeFile(dataFile(), damaged)
    const { loadAppData, getDataStatus } = await startSession()

    const data = await loadAppData({
      chooseRecovery: async () => ({ action: 'fresh' }),
    })

    expect(data.prefs.lang).toBe('zh')
    const recovery = (await fs.readdir(env.dir)).find((name) =>
      name.startsWith('quicklaunch-data.json.recovery-')
    )
    expect(await fs.readFile(path.join(env.dir, recovery!), 'utf8')).toBe(
      damaged
    )
    expect(getDataStatus().notices).toEqual([
      {
        kind: 'reset',
        reason: 'parse',
        recoveryPath: path.join(env.dir, recovery!),
      },
    ])
    expect(await readJson(dataFile())).toMatchObject({ version: 2 })
  })

  it('falls back to default data when nobody is asked and no backup exists', async () => {
    await fs.writeFile(dataFile(), damaged)
    const { loadAppData, getDataStatus } = await startSession()

    await loadAppData()

    expect(getDataStatus().notices[0]).toMatchObject({
      kind: 'reset',
      reason: 'parse',
    })
  })

  it('restores the newest automatic backup', async () => {
    const first = await startSession()
    await first.loadAppData()
    await first.saveAppData(sampleData())
    await first.flushPendingWrite()
    // The second start takes the backups from the good file.
    const second = await startSession()
    await second.loadAppData()
    await fs.writeFile(dataFile(), damaged)

    const third = await startSession()
    const chooseRecovery = vi.fn(
      async (info: { backups: { path: string }[] }) => ({
        action: 'restore' as const,
        backupPath: info.backups[0]!.path,
      })
    )
    const data = await third.loadAppData({ chooseRecovery })

    expect(chooseRecovery.mock.calls[0]![0].backups.length).toBeGreaterThan(0)
    expect(data.loose.passwords[0]?.password).toBe('s3cret')
    const notice = third.getDataStatus().notices[0]
    expect(notice).toMatchObject({ kind: 'restored' })
    expect(
      await fs.readFile(
        (notice as { recoveryPath: string }).recoveryPath,
        'utf8'
      )
    ).toBe(damaged)
    expect(await readJson(dataFile())).toMatchObject({ version: 2 })
  })

  it('offers the backups when the data file has disappeared', async () => {
    const first = await startSession()
    await first.loadAppData()
    await first.saveAppData(sampleData())
    await first.flushPendingWrite()
    const second = await startSession()
    await second.loadAppData()
    await fs.rm(dataFile())

    const third = await startSession()
    const chooseRecovery = vi.fn(
      async (info: { backups: { path: string }[] }) => ({
        action: 'restore' as const,
        backupPath: info.backups[0]!.path,
      })
    )
    const data = await third.loadAppData({ chooseRecovery })

    expect(chooseRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'missing' })
    )
    expect(data.loose.passwords[0]?.password).toBe('s3cret')
    expect(third.getDataStatus().notices[0]).toMatchObject({
      kind: 'restored',
      recoveryPath: '',
    })
  })

  it('is reported as undecryptable when it came from another computer', async () => {
    const original = await writeLegacyFile({ ...sampleData() })
    const { loadAppData } = await startSession('another-key')
    const chooseRecovery = vi.fn(async () => ({ action: 'exit' as const }))

    await expect(loadAppData({ chooseRecovery })).rejects.toThrow()

    expect(chooseRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'decrypt' })
    )
    expect(await fs.readFile(dataFile(), 'utf8')).toBe(original)
  })

  it('is reported when it was written by a newer version', async () => {
    const newer = JSON.stringify({
      format: 'quicklaunch-data',
      version: 3,
      data: {},
    })
    await fs.writeFile(dataFile(), newer)
    const { loadAppData } = await startSession()
    const chooseRecovery = vi.fn(async () => ({ action: 'exit' as const }))

    await expect(loadAppData({ chooseRecovery })).rejects.toThrow()

    expect(chooseRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'schema' })
    )
    expect(await fs.readFile(dataFile(), 'utf8')).toBe(newer)
  })

  it('is not treated as damaged when it merely cannot be opened', async () => {
    await fs.mkdir(dataFile())
    const { loadAppData } = await startSession()
    const chooseRecovery = vi.fn()

    await expect(loadAppData({ chooseRecovery })).rejects.toThrow()

    expect(chooseRecovery).not.toHaveBeenCalled()
  })
})

describe('passwords that cannot be decrypted here', () => {
  async function saveWithOldKey(): Promise<string> {
    const first = await startSession('old-key')
    await first.loadAppData()
    await first.saveAppData(sampleData())
    await first.flushPendingWrite()
    return (await readJson(dataFile())).data.loose.passwords[0]
      .passwordCiphertext
  }

  it('stay empty but keep their ciphertext through later saves', async () => {
    const ciphertext = await saveWithOldKey()

    const second = await startSession('new-key')
    const data = await second.loadAppData()

    expect(data.loose.passwords[0]).toMatchObject({
      id: 'pw-1',
      password: '',
      passwordLost: true,
    })
    expect(second.getDataStatus().notices).toEqual([
      { kind: 'passwordsLost', count: 1 },
    ])

    const saved = await second.saveAppData({
      ...data,
      prefs: { ...data.prefs, theme: 'light' },
    })
    await second.flushPendingWrite()

    expect(saved.loose.passwords[0]?.passwordLost).toBe(true)
    const file = await readJson(dataFile())
    expect(file.data.prefs.theme).toBe('light')
    expect(file.data.loose.passwords[0].passwordCiphertext).toBe(ciphertext)
  })

  it('are replaced once the user types a new password', async () => {
    const ciphertext = await saveWithOldKey()
    const second = await startSession('new-key')
    const data = await second.loadAppData()
    const draft = structuredClone(data)
    draft.loose.passwords[0]!.password = 'fresh'

    const saved = await second.saveAppData(draft)
    await second.flushPendingWrite()

    expect(saved.loose.passwords[0]?.passwordLost).toBeUndefined()
    const stored = (await readJson(dataFile())).data.loose.passwords[0]
    expect(stored.passwordCiphertext).not.toBe(ciphertext)
    const third = await startSession('new-key')
    expect((await third.loadAppData()).loose.passwords[0]?.password).toBe(
      'fresh'
    )
  })

  it('are forgotten when the entry is deleted', async () => {
    await saveWithOldKey()
    const second = await startSession('new-key')
    const data = await second.loadAppData()
    const draft = structuredClone(data)
    draft.loose.passwords = []

    await second.saveAppData(draft)
    await second.flushPendingWrite()

    const text = await fs.readFile(dataFile(), 'utf8')
    expect(text).not.toContain('passwordCiphertext')
  })

  it('are still readable when the key comes back', async () => {
    await saveWithOldKey()
    const second = await startSession('new-key')
    const data = await second.loadAppData()
    await second.saveAppData({
      ...data,
      prefs: { ...data.prefs, theme: 'light' },
    })
    await second.flushPendingWrite()

    const third = await startSession('old-key')
    expect((await third.loadAppData()).loose.passwords[0]?.password).toBe(
      's3cret'
    )
  })

  it('are written as plain text only when encryption is unavailable, never lost', async () => {
    env.encryptionAvailable = false
    const first = await startSession()
    await first.loadAppData()
    await first.saveAppData(sampleData())
    await first.flushPendingWrite()

    const stored = (await readJson(dataFile())).data.loose.passwords[0]
    expect(stored.password).toBe('s3cret')
    expect(stored.passwordCiphertext).toBeUndefined()
  })
})

describe('writing to disk', () => {
  it('reports a failed write, keeps the previous file, and recovers on retry', async () => {
    const session = await startSession()
    await session.loadAppData()
    await session.saveAppData(sampleData())
    await session.flushPendingWrite()
    const before = await fs.readFile(dataFile(), 'utf8')
    const updates: DataStatus[] = []
    session.onDataStatusChange((status) => updates.push(status))
    const rename = vi
      .spyOn(fs, 'rename')
      .mockRejectedValue(
        Object.assign(new Error('disk is full'), { code: 'ENOSPC' })
      )

    const draft = sampleData()
    draft.prefs.theme = 'light'
    await session.saveAppData(draft)
    await expect(session.flushPendingWrite()).rejects.toThrow('disk is full')

    expect(session.getDataStatus().writeError).toContain('disk is full')
    expect(updates.at(-1)?.writeError).toContain('disk is full')
    expect(await fs.readFile(dataFile(), 'utf8')).toBe(before)
    expect(
      (await fs.readdir(env.dir)).filter((name) => name.endsWith('.tmp'))
    ).toEqual([])

    rename.mockRestore()
    const status = await session.retryDataSave()

    expect(status.writeError).toBeNull()
    expect((await readJson(dataFile())).data.prefs.theme).toBe('light')
    expect(updates.at(-1)?.writeError).toBeNull()
  })

  it('writes the last change even when it arrives during a write', async () => {
    const session = await startSession()
    await session.loadAppData()
    const original = fs.rename.bind(fs)
    let active = 0
    let maxActive = 0
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await sleep(80)
      try {
        return await original(from, to)
      } finally {
        active -= 1
      }
    })

    const first = sampleData()
    first.prefs.theme = 'light'
    await session.saveAppData(first)
    const flushing = session.flushPendingWrite()
    await sleep(25)
    const second = sampleData()
    second.prefs.theme = 'dark'
    second.prefs.lang = 'ja'
    await session.saveAppData(second)
    await Promise.all([flushing, session.flushPendingWrite()])

    const stored = (await readJson(dataFile())).data
    expect(stored.prefs).toMatchObject({ theme: 'dark', lang: 'ja' })
    expect(maxActive).toBe(1)
  })

  it('flushes pending changes synchronously when the session ends', async () => {
    const session = await startSession()
    await session.loadAppData()
    await session.saveAppData(sampleData())
    await session.updateWindowData((state) => ({ ...state, alwaysOnTop: true }))

    session.flushPendingWriteSync()

    const stored = await readJson(dataFile())
    expect(stored.data.loose.passwords[0].passwordCiphertext).toBeTruthy()
    expect((await readJson(windowFile())).window.alwaysOnTop).toBe(true)
    const rename = vi.spyOn(fs, 'rename')
    await session.flushPendingWrite()
    expect(rename).not.toHaveBeenCalled()
  })

  it('refuses to save something that is not data', async () => {
    const session = await startSession()
    const before = await session.loadAppData()

    await expect(session.saveAppData(null as never)).rejects.toThrow(TypeError)
    await expect(session.saveAppData([] as never)).rejects.toThrow(TypeError)

    expect(await session.loadAppData()).toBe(before)
  })
})

describe('importing a backup', () => {
  it('rejects files that are not Marubako data and changes nothing', async () => {
    const session = await startSession()
    await session.loadAppData()
    await session.saveAppData(sampleData())
    await session.flushPendingWrite()
    const before = await fs.readFile(dataFile(), 'utf8')

    for (const content of [
      '[]',
      '{}',
      '{"name":"app","version":"1.0.0"}',
      'null',
      'not json at all',
    ]) {
      const file = path.join(env.dir, 'other.json')
      await fs.writeFile(file, content)
      await expect(session.importAppData(file)).rejects.toThrow()
    }

    expect(await fs.readFile(dataFile(), 'utf8')).toBe(before)
    const backups = await fs.readdir(backupDir()).catch(() => [] as string[])
    expect(backups.filter((name) => name.startsWith('pre-import-'))).toEqual([])
  })

  it("backs up the current data first and keeps this computer's window", async () => {
    const session = await startSession()
    await session.loadAppData()
    await session.saveAppData(sampleData())
    await session.updateWindowData((state) => ({
      ...state,
      bounds: { x: 1, y: 2, w: 640, h: 480 },
    }))
    await session.flushPendingWrite()
    const before = await fs.readFile(dataFile(), 'utf8')

    const imported = normalizeAppData({
      prefs: { lang: 'ja' },
      window: { bounds: { x: 900, y: 900, w: 300, h: 300 } },
      loose: { notes: [{ id: 'imported', name: 'From backup', content: 'x' }] },
    })
    const file = path.join(env.dir, 'export.json')
    await fs.writeFile(file, JSON.stringify(imported))

    const saved = await session.importAppData(file)

    expect(saved.prefs.lang).toBe('ja')
    expect(saved.loose.notes[0]?.id).toBe('imported')
    expect(saved.loose.passwords).toEqual([])
    expect(saved.window.bounds).toEqual({ x: 1, y: 2, w: 640, h: 480 })
    const backups = (await fs.readdir(backupDir())).filter((name) =>
      name.startsWith('pre-import-')
    )
    expect(backups).toHaveLength(1)
    expect(await fs.readFile(path.join(backupDir(), backups[0]!), 'utf8')).toBe(
      before
    )
    expect((await readJson(dataFile())).data.prefs.lang).toBe('ja')
  })
})

describe('status', () => {
  it('lets a notice be dismissed and tells listeners', async () => {
    await fs.writeFile(dataFile(), '{broken')
    const session = await startSession()
    await session.loadAppData()
    const seen: DataStatus[] = []
    const stop = session.onDataStatusChange((status) => seen.push(status))

    const status = session.dismissNotice('reset')
    stop()
    session.dismissNotice('restored')

    expect(status.notices).toEqual([])
    expect(seen).toHaveLength(1)
    expect(seen[0]?.notices).toEqual([])
  })
})

describe('the end of a Windows session', () => {
  it('writes the newest data even while an older write is stuck, and the older write gives up', async () => {
    const session = await startSession()
    await session.loadAppData()
    // Stall before the point where the write decides whether it may still commit.
    const original = fs.open.bind(fs)
    vi.spyOn(fs, 'open').mockImplementation(((
      ...args: Parameters<typeof fs.open>
    ) => sleep(150).then(() => original(...args))) as typeof fs.open)

    const first = sampleData()
    first.prefs.theme = 'light'
    await session.saveAppData(first)
    const flushing = session.flushPendingWrite()
    await sleep(40)
    const second = sampleData()
    second.prefs.theme = 'dark'
    second.prefs.lang = 'ja'
    await session.saveAppData(second)

    session.flushPendingWriteSync()

    const atLogoff = JSON.parse(readFileSync(dataFile(), 'utf8'))
    expect(atLogoff.data.prefs).toMatchObject({ theme: 'dark', lang: 'ja' })
    await flushing
    await session.flushPendingWrite()
    expect((await readJson(dataFile())).data.prefs).toMatchObject({
      theme: 'dark',
      lang: 'ja',
    })
    expect(
      (await fs.readdir(env.dir)).filter((name) => name.endsWith('.tmp'))
    ).toEqual([])
    expect(session.getDataStatus().writeError).toBeNull()
  })

  it('writes the last change even when its asynchronous write has not finished yet', async () => {
    const session = await startSession()
    await session.loadAppData()
    // Stall before the point where the write decides whether it may still commit.
    const original = fs.open.bind(fs)
    vi.spyOn(fs, 'open').mockImplementation(((
      ...args: Parameters<typeof fs.open>
    ) => sleep(150).then(() => original(...args))) as typeof fs.open)
    const edit = sampleData()
    edit.prefs.theme = 'light'
    await session.saveAppData(edit)
    const flushing = session.flushPendingWrite()
    await sleep(40)

    session.flushPendingWriteSync()

    expect(JSON.parse(readFileSync(dataFile(), 'utf8')).data.prefs.theme).toBe(
      'light'
    )
    await flushing
  })
})

describe('a failed import', () => {
  it('leaves the previous data in memory and on disk', async () => {
    const session = await startSession()
    await session.loadAppData()
    await session.saveAppData(sampleData())
    await session.flushPendingWrite()
    const before = await fs.readFile(dataFile(), 'utf8')
    const file = path.join(env.dir, 'export.json')
    await fs.writeFile(
      file,
      JSON.stringify(normalizeAppData({ prefs: { lang: 'ja' }, notes: [] }))
    )
    const original = fs.rename.bind(fs)
    const rename = vi
      .spyOn(fs, 'rename')
      .mockImplementation(async (from, to) => {
        if (String(to) === dataFile()) {
          throw Object.assign(new Error('disk is full'), { code: 'ENOSPC' })
        }
        return original(from, to)
      })

    await expect(session.importAppData(file)).rejects.toThrow('disk is full')

    expect((await session.loadAppData()).prefs.lang).toBe('en')
    expect(await fs.readFile(dataFile(), 'utf8')).toBe(before)
    rename.mockRestore()
    const status = await session.retryDataSave()
    expect(status.writeError).toBeNull()
    expect(await fs.readFile(dataFile(), 'utf8')).toBe(before)
    expect((await session.loadAppData()).loose.passwords[0]?.password).toBe(
      's3cret'
    )
  })
})

describe('importing between computers', () => {
  it('carries passwords through an export made under another key', async () => {
    const first = await startSession('computer-a')
    await first.loadAppData()
    await first.saveAppData(sampleData())
    await first.flushPendingWrite()
    const exportFile = path.join(env.dir, 'export.json')
    await first.exportAppDataFile(await first.loadAppData(), exportFile, {
      includePasswords: true,
    })
    const oldDir = env.dir

    env.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'marubako-store-'))
    const second = await startSession('computer-b')
    await second.loadAppData()
    const imported = await second.importAppData(exportFile)
    await second.flushPendingWrite()

    expect(imported.loose.passwords[0]?.password).toBe('s3cret')
    const text = await fs.readFile(dataFile(), 'utf8')
    expect(text).not.toContain('s3cret')
    const third = await startSession('computer-b')
    expect((await third.loadAppData()).loose.passwords[0]?.password).toBe(
      's3cret'
    )
    await fs.rm(oldDir, { recursive: true, force: true })
  })

  it('keeps passwords of an imported data file that this computer cannot read', async () => {
    const first = await startSession('computer-a')
    await first.loadAppData()
    await first.saveAppData(sampleData())
    await first.flushPendingWrite()
    const copy = path.join(env.dir, 'copied-data-file.json')
    await fs.copyFile(dataFile(), copy)
    const ciphertext = (await readJson(copy)).data.loose.passwords[0]
      .passwordCiphertext

    const second = await startSession('computer-b')
    await second.loadAppData()
    const imported = await second.importAppData(copy)

    expect(imported.loose.passwords[0]).toMatchObject({
      password: '',
      passwordLost: true,
    })
    expect(second.getDataStatus().notices).toContainEqual({
      kind: 'passwordsLost',
      count: 1,
    })
    const draft = structuredClone(imported)
    draft.prefs.theme = 'light'
    await second.saveAppData(draft)
    await second.flushPendingWrite()
    expect(
      (await readJson(dataFile())).data.loose.passwords[0].passwordCiphertext
    ).toBe(ciphertext)
  })

  it('puts an edit that was not on disk yet into the backup made before importing', async () => {
    const session = await startSession()
    await session.loadAppData()
    await session.saveAppData(sampleData())
    await session.flushPendingWrite()
    const edit = sampleData()
    edit.prefs.theme = 'light'
    await session.saveAppData(edit)
    const file = path.join(env.dir, 'export.json')
    await fs.writeFile(
      file,
      JSON.stringify(normalizeAppData({ prefs: {}, tasks: {} }))
    )

    await session.importAppData(file)

    const backups = (await fs.readdir(backupDir())).filter((name) =>
      name.startsWith('pre-import-')
    )
    expect(backups).toHaveLength(1)
    expect(
      (await readJson(path.join(backupDir(), backups[0]!))).data.prefs.theme
    ).toBe('light')
  })
})

describe('an export without passwords', () => {
  async function exportWithoutPasswords(session: Store): Promise<string> {
    await session.loadAppData()
    await session.saveAppData(sampleData())
    await session.flushPendingWrite()
    const file = path.join(env.dir, 'export-without-passwords.json')
    await session.exportAppDataFile(await session.loadAppData(), file, {
      includePasswords: false,
    })
    return file
  }

  it('holds no password at all and says so', async () => {
    const session = await startSession()
    const file = await exportWithoutPasswords(session)

    const text = await fs.readFile(file, 'utf8')
    expect(text).not.toContain('s3cret')
    expect((await readJson(file)).passwordsOmitted).toBe(true)
    expect((await readJson(file)).loose.passwords[0]).toMatchObject({
      name: 'Mail',
      username: 'me@example.com',
      password: '',
    })
    // What was exported is a copy: the live data keeps its password.
    expect((await session.loadAppData()).loose.passwords[0]?.password).toBe(
      's3cret'
    )
  })

  it('is told apart from an export with passwords before it is imported', async () => {
    const session = await startSession()
    const without = await exportWithoutPasswords(session)
    const withPasswords = path.join(env.dir, 'export-with-passwords.json')
    await session.exportAppDataFile(
      await session.loadAppData(),
      withPasswords,
      {
        includePasswords: true,
      }
    )

    expect(await session.readImportSummary(without)).toEqual({
      passwordsOmitted: true,
    })
    expect(await session.readImportSummary(withPasswords)).toEqual({
      passwordsOmitted: false,
    })
    expect(await fs.readFile(withPasswords, 'utf8')).toContain('s3cret')
  })

  it('refuses a file that is not a data file, like an import would', async () => {
    const session = await startSession()
    await session.loadAppData()
    const file = path.join(env.dir, 'other.json')
    await fs.writeFile(file, JSON.stringify({ hello: 'world' }))

    await expect(session.readImportSummary(file)).rejects.toThrow(
      'not a Marubako data file'
    )
  })

  it('leaves every password empty after an import, with the data backed up first', async () => {
    const session = await startSession()
    const file = await exportWithoutPasswords(session)

    const imported = await session.importAppData(file)
    await session.flushPendingWrite()

    expect(imported.loose.passwords[0]).toMatchObject({
      name: 'Mail',
      password: '',
    })
    expect((await session.loadAppData()).loose.passwords[0]?.password).toBe('')
    // The data that was replaced, passwords included, is in the backup made before the import.
    const backups = (await fs.readdir(backupDir())).filter((name) =>
      name.startsWith('pre-import-')
    )
    expect(backups).toHaveLength(1)
    const backed = await readJson(path.join(backupDir(), backups[0]!))
    expect(backed.data.loose.passwords[0].passwordCiphertext).toBeTruthy()
  })
})

describe('the passwords notice', () => {
  async function startWithLostPassword() {
    const first = await startSession('old-key')
    await first.loadAppData()
    await first.saveAppData(sampleData())
    await first.flushPendingWrite()
    const second = await startSession('new-key')
    const data = await second.loadAppData()
    return { second, data }
  }

  it('goes away once the password is typed again', async () => {
    const { second, data } = await startWithLostPassword()
    const seen: DataStatus[] = []
    second.onDataStatusChange((status) => seen.push(status))
    expect(second.getDataStatus().notices).toHaveLength(1)

    const draft = structuredClone(data)
    draft.loose.passwords[0]!.password = 'fresh'
    await second.saveAppData(draft)

    expect(second.getDataStatus().notices).toEqual([])
    expect(seen.at(-1)?.notices).toEqual([])
  })

  it('is never brought back after the user dismissed it', async () => {
    const { second, data } = await startWithLostPassword()
    second.dismissNotice('passwordsLost')

    const draft = structuredClone(data)
    draft.prefs.theme = 'light'
    await second.saveAppData(draft)

    expect(second.getDataStatus().notices).toEqual([])
  })

  it('is cleared by an import that brings no lost passwords', async () => {
    const { second } = await startWithLostPassword()
    const file = path.join(env.dir, 'export.json')
    await fs.writeFile(
      file,
      JSON.stringify(normalizeAppData({ prefs: {}, tasks: {} }))
    )

    await second.importAppData(file)

    expect(second.getDataStatus().notices).toEqual([])
  })
})

describe('daily backups while the app keeps running', () => {
  it('takes one at the first write of a new day, from the file as it was before', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 3, 12, 0, 0))
    const first = await startSession()
    await first.loadAppData()
    await first.saveAppData(sampleData())
    await first.flushPendingWrite()
    const second = await startSession()
    await second.loadAppData()
    const dayOne = await fs.readFile(dataFile(), 'utf8')

    vi.setSystemTime(new Date(2026, 9, 4, 0, 5, 0))
    const edit = sampleData()
    edit.prefs.theme = 'light'
    await second.saveAppData(edit)
    await second.flushPendingWrite()

    const snapshot = path.join(backupDir(), 'quicklaunch-data-20261004.json')
    expect(await fs.readFile(snapshot, 'utf8')).toBe(dayOne)
    expect((await readJson(dataFile())).data.prefs.theme).toBe('light')
    expect(await fs.readdir(backupDir())).toContain(
      'quicklaunch-data-20261003.json'
    )
  })

  it('does not copy the same day twice', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 3, 12, 0, 0))
    const first = await startSession()
    await first.loadAppData()
    await first.saveAppData(sampleData())
    await first.flushPendingWrite()
    const second = await startSession()
    await second.loadAppData()
    const snapshot = path.join(backupDir(), 'quicklaunch-data-20261003.json')
    const taken = await fs.readFile(snapshot, 'utf8')

    const edit = sampleData()
    edit.prefs.theme = 'light'
    await second.saveAppData(edit)
    await second.flushPendingWrite()

    expect(await fs.readFile(snapshot, 'utf8')).toBe(taken)
  })
})

describe('backups and recovery', () => {
  const damaged = '{broken-data-with-user-content'

  async function twoGoodStarts() {
    const first = await startSession()
    await first.loadAppData()
    await first.saveAppData(sampleData())
    await first.flushPendingWrite()
    const second = await startSession()
    await second.loadAppData()
    return fs.readFile(dataFile(), 'utf8')
  }

  it('never lets a damaged data file overwrite the last-start backup', async () => {
    const good = await twoGoodStarts()
    await fs.writeFile(dataFile(), damaged)

    const quitting = await startSession()
    await quitting
      .loadAppData({ chooseRecovery: async () => ({ action: 'exit' }) })
      .catch(() => undefined)
    const fresh = await startSession()
    await fresh.loadAppData({
      chooseRecovery: async () => ({ action: 'fresh' }),
    })

    expect(await fs.readFile(`${dataFile()}.bak`, 'utf8')).toBe(good)
  })

  it('skips a backup that cannot be read and offers the next one first', async () => {
    await twoGoodStarts()
    await fs.writeFile(dataFile(), damaged)
    await fs.writeFile(`${dataFile()}.bak`, 'garbage, not a data file')
    const later = new Date(Date.now() + 60_000)
    await fs.utimes(`${dataFile()}.bak`, later, later)
    const session = await startSession()
    const chooseRecovery = vi.fn(
      async (info: { backups: { path: string }[] }) => ({
        action: 'restore' as const,
        backupPath: info.backups[0]!.path,
      })
    )

    const data = await session.loadAppData({ chooseRecovery })

    const offered = chooseRecovery.mock.calls[0]![0].backups
    expect(offered.map((backup) => path.basename(backup.path))).not.toContain(
      'quicklaunch-data.json.bak'
    )
    expect(path.basename(offered[0]!.path)).toMatch(
      /^quicklaunch-data-\d{8}\.json$/
    )
    expect(data.loose.passwords[0]?.password).toBe('s3cret')
  })

  it('restores the newest backup by itself when nobody is asked', async () => {
    await twoGoodStarts()
    await fs.writeFile(dataFile(), damaged)
    const session = await startSession()

    const data = await session.loadAppData()

    expect(data.loose.passwords[0]?.password).toBe('s3cret')
    expect(session.getDataStatus().notices[0]).toMatchObject({
      kind: 'restored',
    })
  })

  it('never copies a damaged file into a daily backup', async () => {
    await fs.writeFile(dataFile(), damaged)
    const session = await startSession()
    await session.loadAppData({
      chooseRecovery: async () => ({ action: 'fresh' }),
    })
    const edit = sampleData()
    edit.prefs.theme = 'light'
    await session.saveAppData(edit)
    await session.flushPendingWrite()

    const names = await fs.readdir(backupDir()).catch(() => [] as string[])
    for (const name of names) {
      expect(await fs.readFile(path.join(backupDir(), name), 'utf8')).not.toBe(
        damaged
      )
    }
  })

  it('reads a data file saved with a byte order mark without calling it damaged', async () => {
    const first = await startSession()
    await first.loadAppData()
    await first.saveAppData(sampleData())
    await first.flushPendingWrite()
    const text = await fs.readFile(dataFile(), 'utf8')
    await fs.writeFile(dataFile(), String.fromCharCode(0xfeff) + text)
    const chooseRecovery = vi.fn()

    const second = await startSession()
    const data = await second.loadAppData({ chooseRecovery })

    expect(chooseRecovery).not.toHaveBeenCalled()
    expect(data.loose.passwords[0]?.password).toBe('s3cret')
    expect(second.getDataStatus().notices).toEqual([])
  })
})

describe('the window-state file', () => {
  it('is ignored when it is garbage, and the app still starts', async () => {
    await fs.writeFile(windowFile(), '{not json')
    const { loadAppData } = await startSession()

    const data = await loadAppData()

    expect(data.window.bounds).toBeUndefined()
    expect(data.prefs.lang).toBe('zh')
  })

  it('is read when it starts with a byte order mark', async () => {
    const first = await startSession()
    await first.loadAppData()
    await first.updateWindowData((state) => ({
      ...state,
      bounds: { x: 7, y: 8, w: 640, h: 480 },
    }))
    await first.flushPendingWrite()
    const text = await fs.readFile(windowFile(), 'utf8')
    await fs.writeFile(windowFile(), String.fromCharCode(0xfeff) + text)

    const second = await startSession()

    expect((await second.loadAppData()).window.bounds).toEqual({
      x: 7,
      y: 8,
      w: 640,
      h: 480,
    })
  })
})
