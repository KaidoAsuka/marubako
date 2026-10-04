import fs from 'node:fs/promises'
import path from 'node:path'

export const DAILY_SNAPSHOT_LIMIT = 7
export const PRE_IMPORT_LIMIT = 3

const DAILY_PATTERN = /^quicklaunch-data-(\d{8})\.json$/
const PRE_IMPORT_PATTERN = /^pre-import-\d+\.json$/

export type BackupKind = 'last-start' | 'daily' | 'pre-import'

export interface BackupFile {
  path: string
  kind: BackupKind
  /** Local date, `YYYY-MM-DD`, shown to the user. */
  date: string
  modifiedAt: number
}

export function lastStartBackupPath(dataFilePath: string): string {
  return `${dataFilePath}.bak`
}

export function dayStamp(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}${month}${day}`
}

function formatDate(date: Date): string {
  const stamp = dayStamp(date)
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`
}

export function dailySnapshotPath(backupDir: string, date: Date): string {
  return path.join(backupDir, `quicklaunch-data-${dayStamp(date)}.json`)
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/** Copies through a temporary file, so an interrupted copy never leaves a half-written backup. */
async function copyAtomically(from: string, to: string): Promise<void> {
  await fs.mkdir(path.dirname(to), { recursive: true })
  const temporary = `${to}.${process.pid}.tmp`
  try {
    await fs.copyFile(from, temporary)
    await fs.rename(temporary, to)
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

async function prune(
  directory: string,
  pattern: RegExp,
  keep: number
): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.readdir(directory)
  } catch {
    return
  }

  const stale = entries
    .filter((entry) => pattern.test(entry))
    .sort()
    .reverse()
    .slice(keep)
  await Promise.all(
    stale.map((entry) =>
      fs.rm(path.join(directory, entry), { force: true }).catch(() => {})
    )
  )
}

/** Keeps the data file as it was at the last successful start. Call only after it parsed. */
export async function refreshLastStartBackup(
  dataFilePath: string
): Promise<void> {
  await copyAtomically(dataFilePath, lastStartBackupPath(dataFilePath))
}

/**
 * Makes sure there is one copy per calendar day, taken from the file as it is on disk before the
 * first write of that day, and keeps the newest few. Returns true when a copy was made.
 */
export async function ensureDailySnapshot(
  dataFilePath: string,
  backupDir: string,
  now: Date = new Date()
): Promise<boolean> {
  const target = dailySnapshotPath(backupDir, now)
  if ((await exists(target)) || !(await exists(dataFilePath))) {
    return false
  }

  await copyAtomically(dataFilePath, target)
  await prune(backupDir, DAILY_PATTERN, DAILY_SNAPSHOT_LIMIT)
  return true
}

/** Copy of the current file taken right before an import replaces it. */
export async function createPreImportBackup(
  dataFilePath: string,
  backupDir: string,
  now: Date = new Date()
): Promise<string | null> {
  if (!(await exists(dataFilePath))) {
    return null
  }

  const target = path.join(backupDir, `pre-import-${now.getTime()}.json`)
  await copyAtomically(dataFilePath, target)
  await prune(backupDir, PRE_IMPORT_PATTERN, PRE_IMPORT_LIMIT)
  return target
}

/** Every backup there is, newest first. Nothing here is read or validated. */
export async function listBackups(
  dataFilePath: string,
  backupDir: string
): Promise<BackupFile[]> {
  const found: BackupFile[] = []

  const add = async (filePath: string, kind: BackupKind): Promise<void> => {
    try {
      const stat = await fs.stat(filePath)
      if (stat.isFile() && stat.size > 0) {
        found.push({
          path: filePath,
          kind,
          date: formatDate(stat.mtime),
          modifiedAt: stat.mtimeMs,
        })
      }
    } catch {
      // not there
    }
  }

  await add(lastStartBackupPath(dataFilePath), 'last-start')

  let entries: string[] = []
  try {
    entries = await fs.readdir(backupDir)
  } catch {
    // no backup folder yet
  }
  for (const entry of entries) {
    const kind = DAILY_PATTERN.test(entry)
      ? 'daily'
      : PRE_IMPORT_PATTERN.test(entry)
        ? 'pre-import'
        : null
    if (kind) await add(path.join(backupDir, entry), kind)
  }

  return found.sort((a, b) => b.modifiedAt - a.modifiedAt)
}
