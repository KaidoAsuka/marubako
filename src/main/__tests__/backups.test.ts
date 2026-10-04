import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DAILY_SNAPSHOT_LIMIT,
  PRE_IMPORT_LIMIT,
  createPreImportBackup,
  dailySnapshotPath,
  dayStamp,
  ensureDailySnapshot,
  lastStartBackupPath,
  listBackups,
  refreshLastStartBackup,
} from '../backups'

let root: string
let dataFile: string
let backupDir: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-backups-'))
  dataFile = path.join(root, 'quicklaunch-data.json')
  backupDir = path.join(root, 'backups')
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 })
})

async function names(directory: string): Promise<string[]> {
  return (await fs.readdir(directory)).sort()
}

async function read(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8')
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function setMtime(filePath: string, date: Date): Promise<void> {
  await fs.utimes(filePath, date, date)
}

/** A local-time date, so the expectations hold in every time zone. */
function day(offset: number, hour = 10): Date {
  return new Date(2026, 0, 1 + offset, hour)
}

describe('constants', () => {
  it('keep the newest 7 daily snapshots and 3 pre-import backups', () => {
    expect(DAILY_SNAPSHOT_LIMIT).toBe(7)
    expect(PRE_IMPORT_LIMIT).toBe(3)
  })
})

describe('lastStartBackupPath', () => {
  it('appends .bak to the data file path', () => {
    expect(lastStartBackupPath('C:\\data\\quicklaunch-data.json')).toBe(
      'C:\\data\\quicklaunch-data.json.bak'
    )
  })
})

describe('dayStamp', () => {
  it('formats the local date as zero-padded YYYYMMDD', () => {
    expect(dayStamp(new Date(2026, 0, 5, 10))).toBe('20260105')
    expect(dayStamp(new Date(2026, 10, 15, 10))).toBe('20261115')
    expect(dayStamp(new Date(2026, 11, 31, 10))).toBe('20261231')
  })

  it('uses the local calendar day around midnight', () => {
    expect(dayStamp(new Date(2026, 0, 5, 0, 0, 0, 0))).toBe('20260105')
    expect(dayStamp(new Date(2026, 0, 5, 23, 59, 59, 999))).toBe('20260105')
    expect(dayStamp(new Date(2026, 0, 6, 0, 0, 0, 0))).toBe('20260106')
  })
})

describe('dailySnapshotPath', () => {
  it('puts a dated file in the backup directory', () => {
    expect(dailySnapshotPath(backupDir, new Date(2026, 0, 5, 10))).toBe(
      path.join(backupDir, 'quicklaunch-data-20260105.json')
    )
  })
})

describe('refreshLastStartBackup', () => {
  it('copies the data file next to itself as .bak', async () => {
    await fs.writeFile(dataFile, '{"v":1}')

    await refreshLastStartBackup(dataFile)

    expect(await read(`${dataFile}.bak`)).toBe('{"v":1}')
    expect(await read(dataFile)).toBe('{"v":1}')
  })

  it('overwrites the previous backup completely', async () => {
    await fs.writeFile(dataFile, 'first version with a long tail')
    await refreshLastStartBackup(dataFile)
    await fs.writeFile(dataFile, 'second')

    await refreshLastStartBackup(dataFile)

    expect(await read(`${dataFile}.bak`)).toBe('second')
  })

  it('copies the exact bytes, including non-ASCII text and line endings', async () => {
    const content = '{"note":"世界 🔑\\r\\n"}\r\n'
    await fs.writeFile(dataFile, content)

    await refreshLastStartBackup(dataFile)

    expect(await read(`${dataFile}.bak`)).toBe(content)
  })

  it('leaves no temporary file behind', async () => {
    await fs.writeFile(dataFile, 'data')

    await refreshLastStartBackup(dataFile)
    await refreshLastStartBackup(dataFile)

    expect(await names(root)).toEqual([
      'quicklaunch-data.json',
      'quicklaunch-data.json.bak',
    ])
  })

  it('rejects when the data file is missing, and keeps the previous backup', async () => {
    await fs.writeFile(`${dataFile}.bak`, 'previous good backup')

    await expect(refreshLastStartBackup(dataFile)).rejects.toThrow()

    expect(await read(`${dataFile}.bak`)).toBe('previous good backup')
    expect(await names(root)).toEqual(['quicklaunch-data.json.bak'])
  })

  it('rejects and removes its temporary file when the backup cannot be put in place', async () => {
    await fs.writeFile(dataFile, 'data')
    // A directory where the backup should go makes the final rename fail, after the copy was made.
    await fs.mkdir(`${dataFile}.bak`)

    await expect(refreshLastStartBackup(dataFile)).rejects.toThrow()

    expect(await names(root)).toEqual([
      'quicklaunch-data.json',
      'quicklaunch-data.json.bak',
    ])
    expect((await fs.stat(`${dataFile}.bak`)).isDirectory()).toBe(true)
    expect(await read(dataFile)).toBe('data')
  })
})

describe('ensureDailySnapshot', () => {
  it('copies the data file into the backup directory, creating it, and returns true', async () => {
    await fs.writeFile(dataFile, '{"day":1}')
    const now = new Date(2026, 0, 5, 10)

    const created = await ensureDailySnapshot(dataFile, backupDir, now)

    expect(created).toBe(true)
    expect(await names(backupDir)).toEqual(['quicklaunch-data-20260105.json'])
    expect(await read(dailySnapshotPath(backupDir, now))).toBe('{"day":1}')
  })

  it('takes only one snapshot per day and does not overwrite it later that day', async () => {
    await fs.writeFile(dataFile, 'morning')
    await ensureDailySnapshot(dataFile, backupDir, new Date(2026, 0, 5, 8))
    await fs.writeFile(dataFile, 'evening, changed')

    const again = await ensureDailySnapshot(
      dataFile,
      backupDir,
      new Date(2026, 0, 5, 20)
    )

    expect(again).toBe(false)
    expect(await names(backupDir)).toEqual(['quicklaunch-data-20260105.json'])
    expect(
      await read(path.join(backupDir, 'quicklaunch-data-20260105.json'))
    ).toBe('morning')
  })

  it('takes a new snapshot on the next day', async () => {
    await fs.writeFile(dataFile, 'day one')
    await ensureDailySnapshot(dataFile, backupDir, new Date(2026, 0, 5, 23, 59))
    await fs.writeFile(dataFile, 'day two')

    const next = await ensureDailySnapshot(
      dataFile,
      backupDir,
      new Date(2026, 0, 6, 0, 1)
    )

    expect(next).toBe(true)
    expect(await names(backupDir)).toEqual([
      'quicklaunch-data-20260105.json',
      'quicklaunch-data-20260106.json',
    ])
    expect(
      await read(path.join(backupDir, 'quicklaunch-data-20260106.json'))
    ).toBe('day two')
  })

  it('returns false and creates nothing when there is no data file', async () => {
    const created = await ensureDailySnapshot(dataFile, backupDir, day(0))

    expect(created).toBe(false)
    expect(await exists(backupDir)).toBe(false)
  })

  it('leaves no temporary file behind', async () => {
    await fs.writeFile(dataFile, 'data')

    await ensureDailySnapshot(dataFile, backupDir, day(0))

    expect(
      (await names(backupDir)).filter((name) => name.endsWith('.tmp'))
    ).toEqual([])
  })

  it('keeps only the 7 newest daily snapshots once an 8th is created', async () => {
    await fs.writeFile(dataFile, 'data')

    for (let offset = 0; offset < 7; offset += 1) {
      await ensureDailySnapshot(dataFile, backupDir, day(offset))
    }
    expect(await names(backupDir)).toHaveLength(7)

    const created = await ensureDailySnapshot(dataFile, backupDir, day(7))

    expect(created).toBe(true)
    expect(await names(backupDir)).toEqual([
      'quicklaunch-data-20260102.json',
      'quicklaunch-data-20260103.json',
      'quicklaunch-data-20260104.json',
      'quicklaunch-data-20260105.json',
      'quicklaunch-data-20260106.json',
      'quicklaunch-data-20260107.json',
      'quicklaunch-data-20260108.json',
    ])
  })

  it('orders days correctly across month and year boundaries when pruning', async () => {
    await fs.writeFile(dataFile, 'data')

    // Dec 28 2026 .. Jan 4 2027 is eight consecutive days.
    for (let offset = 0; offset < 8; offset += 1) {
      await ensureDailySnapshot(
        dataFile,
        backupDir,
        new Date(2026, 11, 28 + offset, 10)
      )
    }

    expect(await names(backupDir)).toEqual([
      'quicklaunch-data-20261229.json',
      'quicklaunch-data-20261230.json',
      'quicklaunch-data-20261231.json',
      'quicklaunch-data-20270101.json',
      'quicklaunch-data-20270102.json',
      'quicklaunch-data-20270103.json',
      'quicklaunch-data-20270104.json',
    ])
  })

  it('prunes a backlog of old snapshots down to the limit and keeps the new one', async () => {
    await fs.mkdir(backupDir)
    for (let index = 1; index <= 9; index += 1) {
      await fs.writeFile(
        path.join(backupDir, `quicklaunch-data-2025010${index}.json`),
        'old'
      )
    }
    await fs.writeFile(dataFile, 'current')

    await ensureDailySnapshot(dataFile, backupDir, day(0))

    const remaining = await names(backupDir)
    expect(remaining).toHaveLength(7)
    expect(remaining).toContain('quicklaunch-data-20260101.json')
    expect(remaining).not.toContain('quicklaunch-data-20250101.json')
    expect(remaining).not.toContain('quicklaunch-data-20250103.json')
    expect(remaining).toContain('quicklaunch-data-20250109.json')
  })

  it('does not touch or count unrelated files in the backup folder', async () => {
    await fs.mkdir(backupDir)
    const unrelated = [
      'notes.txt',
      'pre-import-1700000000000.json',
      'quicklaunch-data-20250101.json.bak',
      'quicklaunch-data-2025.json',
      'quicklaunch-data-20250101.json.123.tmp',
      'other-20250101.json',
    ]
    for (const name of unrelated) {
      await fs.writeFile(path.join(backupDir, name), name)
    }
    await fs.writeFile(dataFile, 'data')

    for (let offset = 0; offset < 8; offset += 1) {
      await ensureDailySnapshot(dataFile, backupDir, day(offset))
    }

    const remaining = await names(backupDir)
    for (const name of unrelated) {
      expect(remaining).toContain(name)
      expect(await read(path.join(backupDir, name))).toBe(name)
    }
    expect(
      remaining.filter((name) => /^quicklaunch-data-\d{8}\.json$/.test(name))
    ).toHaveLength(7)
  })
})

describe('createPreImportBackup', () => {
  it('returns null and creates nothing when there is no data file', async () => {
    const result = await createPreImportBackup(dataFile, backupDir, day(0))

    expect(result).toBeNull()
    expect(await exists(backupDir)).toBe(false)
  })

  it('copies the current file to pre-import-<ms>.json and returns its path', async () => {
    await fs.writeFile(dataFile, '{"before":"import"}')
    const now = new Date(1_700_000_000_000)

    const result = await createPreImportBackup(dataFile, backupDir, now)

    expect(result).toBe(path.join(backupDir, 'pre-import-1700000000000.json'))
    expect(await read(result as string)).toBe('{"before":"import"}')
    expect(await names(backupDir)).toEqual(['pre-import-1700000000000.json'])
  })

  it('takes a separate backup for every import, even on the same day', async () => {
    await fs.writeFile(dataFile, 'a')
    const first = await createPreImportBackup(
      dataFile,
      backupDir,
      new Date(1_700_000_000_000)
    )
    await fs.writeFile(dataFile, 'b')
    const second = await createPreImportBackup(
      dataFile,
      backupDir,
      new Date(1_700_000_000_500)
    )

    expect(first).not.toBe(second)
    expect(await read(first as string)).toBe('a')
    expect(await read(second as string)).toBe('b')
  })

  it('keeps only the newest 3 pre-import backups', async () => {
    for (let index = 0; index < 5; index += 1) {
      await fs.writeFile(dataFile, `version ${index}`)
      await createPreImportBackup(
        dataFile,
        backupDir,
        new Date(1_700_000_000_000 + index * 1000)
      )
    }

    expect(await names(backupDir)).toEqual([
      'pre-import-1700000002000.json',
      'pre-import-1700000003000.json',
      'pre-import-1700000004000.json',
    ])
    expect(
      await read(path.join(backupDir, 'pre-import-1700000004000.json'))
    ).toBe('version 4')
    expect(
      await read(path.join(backupDir, 'pre-import-1700000002000.json'))
    ).toBe('version 2')
  })

  it('does not touch daily snapshots or other files, and daily pruning does not touch it', async () => {
    await fs.writeFile(dataFile, 'data')
    for (let offset = 0; offset < 3; offset += 1) {
      await ensureDailySnapshot(dataFile, backupDir, day(offset))
    }
    await fs.writeFile(path.join(backupDir, 'notes.txt'), 'keep')

    for (let index = 0; index < 5; index += 1) {
      await createPreImportBackup(
        dataFile,
        backupDir,
        new Date(1_700_000_000_000 + index)
      )
    }

    const remaining = await names(backupDir)
    expect(
      remaining.filter((name) => name.startsWith('quicklaunch-data-'))
    ).toHaveLength(3)
    expect(
      remaining.filter((name) => name.startsWith('pre-import-'))
    ).toHaveLength(3)
    expect(remaining).toContain('notes.txt')

    // And the other way round: a new daily snapshot beyond the limit leaves pre-imports alone.
    for (let offset = 3; offset < 9; offset += 1) {
      await ensureDailySnapshot(dataFile, backupDir, day(offset))
    }
    expect(
      (await names(backupDir)).filter((name) => name.startsWith('pre-import-'))
    ).toHaveLength(3)
  })

  it('leaves no temporary file behind', async () => {
    await fs.writeFile(dataFile, 'data')

    await createPreImportBackup(dataFile, backupDir, day(0))

    expect(
      (await names(backupDir)).filter((name) => name.endsWith('.tmp'))
    ).toEqual([])
  })
})

describe('listBackups', () => {
  it('returns .bak, daily and pre-import backups newest first by modification time', async () => {
    const bak = `${dataFile}.bak`
    const daily = path.join(backupDir, 'quicklaunch-data-20260103.json')
    const olderDaily = path.join(backupDir, 'quicklaunch-data-20260102.json')
    const preImport = path.join(backupDir, 'pre-import-1700000000000.json')
    await fs.mkdir(backupDir)
    for (const file of [bak, daily, olderDaily, preImport]) {
      await fs.writeFile(file, 'content')
    }
    await setMtime(olderDaily, new Date(2026, 0, 2, 12))
    await setMtime(bak, new Date(2026, 0, 3, 12))
    await setMtime(preImport, new Date(2026, 0, 4, 12))
    await setMtime(daily, new Date(2026, 0, 5, 12))

    const backups = await listBackups(dataFile, backupDir)

    expect(backups.map((entry) => [entry.kind, entry.path])).toEqual([
      ['daily', daily],
      ['pre-import', preImport],
      ['last-start', bak],
      ['daily', olderDaily],
    ])
    expect(backups.map((entry) => entry.date)).toEqual([
      '2026-01-05',
      '2026-01-04',
      '2026-01-03',
      '2026-01-02',
    ])
  })

  it('reports modifiedAt as the file modification time in milliseconds', async () => {
    await fs.writeFile(dataFile, 'data')
    await fs.writeFile(`${dataFile}.bak`, 'data')
    await setMtime(`${dataFile}.bak`, new Date(2026, 0, 3, 12))

    const [entry] = await listBackups(dataFile, backupDir)

    expect(entry?.modifiedAt).toBe((await fs.stat(`${dataFile}.bak`)).mtimeMs)
    expect(entry?.modifiedAt).toBe(new Date(2026, 0, 3, 12).getTime())
  })

  it('shows the local date of the modification time, not the date in the file name', async () => {
    await fs.mkdir(backupDir)
    const late = path.join(backupDir, 'quicklaunch-data-20250101.json')
    const early = path.join(backupDir, 'quicklaunch-data-20250102.json')
    await fs.writeFile(late, 'x')
    await fs.writeFile(early, 'x')
    await setMtime(late, new Date(2026, 0, 5, 23, 30))
    await setMtime(early, new Date(2026, 0, 6, 0, 30))

    const backups = await listBackups(dataFile, backupDir)

    expect(backups.map((entry) => [entry.path, entry.date])).toEqual([
      [early, '2026-01-06'],
      [late, '2026-01-05'],
    ])
  })

  it('zero-pads month and day in the date', async () => {
    await fs.writeFile(`${dataFile}.bak`, 'x')
    await setMtime(`${dataFile}.bak`, new Date(2026, 2, 7, 9))

    const [entry] = await listBackups(dataFile, backupDir)

    expect(entry?.date).toBe('2026-03-07')
  })

  it('skips empty files', async () => {
    await fs.mkdir(backupDir)
    await fs.writeFile(`${dataFile}.bak`, '')
    await fs.writeFile(
      path.join(backupDir, 'quicklaunch-data-20260101.json'),
      ''
    )
    await fs.writeFile(
      path.join(backupDir, 'pre-import-1700000000000.json'),
      ''
    )
    const good = path.join(backupDir, 'quicklaunch-data-20260102.json')
    await fs.writeFile(good, 'x')

    const backups = await listBackups(dataFile, backupDir)

    expect(backups.map((entry) => entry.path)).toEqual([good])
  })

  it('skips files and folders whose names do not match a backup pattern', async () => {
    await fs.mkdir(backupDir)
    const ignored = [
      'notes.txt',
      'quicklaunch-data-2026.json',
      'quicklaunch-data-20260105.json.tmp',
      'quicklaunch-data-20260105.json.bak',
      'pre-import-abc.json',
      'pre-import-.json',
      'pre-import-1.json.bak',
      'copy-of-quicklaunch-data-20260105.json',
    ]
    for (const name of ignored) {
      await fs.writeFile(path.join(backupDir, name), 'content')
    }
    // A directory named like a backup is not a backup.
    await fs.mkdir(path.join(backupDir, 'quicklaunch-data-20260101.json'))
    const good = path.join(backupDir, 'pre-import-1700000000000.json')
    await fs.writeFile(good, 'content')

    const backups = await listBackups(dataFile, backupDir)

    expect(backups.map((entry) => entry.path)).toEqual([good])
  })

  it('works when the backup directory does not exist', async () => {
    await fs.writeFile(`${dataFile}.bak`, 'x')

    const backups = await listBackups(dataFile, backupDir)

    expect(backups.map((entry) => entry.kind)).toEqual(['last-start'])
  })

  it('returns an empty list when there are no backups at all', async () => {
    await expect(listBackups(dataFile, backupDir)).resolves.toEqual([])
  })

  it('does not list the data file itself', async () => {
    await fs.writeFile(dataFile, 'data')

    await expect(listBackups(dataFile, backupDir)).resolves.toEqual([])
  })

  it('lists what the other functions created', async () => {
    await fs.writeFile(dataFile, 'data')
    await refreshLastStartBackup(dataFile)
    await ensureDailySnapshot(dataFile, backupDir, day(0))
    await createPreImportBackup(
      dataFile,
      backupDir,
      new Date(1_700_000_000_000)
    )

    const backups = await listBackups(dataFile, backupDir)

    expect(backups.map((entry) => entry.kind).sort()).toEqual([
      'daily',
      'last-start',
      'pre-import',
    ])
  })
})
