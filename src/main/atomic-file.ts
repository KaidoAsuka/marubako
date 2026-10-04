import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

// Antivirus and indexers briefly hold files on Windows, which shows up as these codes on rename.
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RENAME_ATTEMPTS = 5
const RENAME_RETRY_DELAY_MS = 50

let tempCounter = 0

function nextTempPath(filePath: string): string {
  tempCounter += 1
  return `${filePath}.${process.pid}-${tempCounter}.tmp`
}

function isRetryable(error: unknown): boolean {
  return RETRYABLE_RENAME_CODES.has(
    (error as NodeJS.ErrnoException)?.code ?? ''
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await fs.rename(from, to)
      return
    } catch (error) {
      if (!isRetryable(error) || attempt >= RENAME_ATTEMPTS) throw error
      await sleep(RENAME_RETRY_DELAY_MS)
    }
  }
}

function renameWithRetrySync(from: string, to: string): void {
  for (let attempt = 1; ; attempt += 1) {
    try {
      renameSync(from, to)
      return
    } catch (error) {
      if (!isRetryable(error) || attempt >= RENAME_ATTEMPTS) throw error
      sleepSync(RENAME_RETRY_DELAY_MS)
    }
  }
}

export interface AtomicWriteOptions {
  /**
   * Asked right before the rename. Returning false abandons the write: the temporary file is
   * removed and the target is not touched. Lets a newer synchronous write fence off an older
   * asynchronous one that is still in flight.
   */
  shouldCommit?: () => boolean
}

/**
 * Writes `content` to a temporary file in the same directory, flushes it to disk, then renames it
 * over `filePath`. The target is either the old file or the complete new file, never a partial one.
 * On failure the temporary file is removed and the target is left untouched.
 * Resolves to false when `shouldCommit` abandoned the write, otherwise true.
 */
export async function atomicWriteFile(
  filePath: string,
  content: string,
  { shouldCommit }: AtomicWriteOptions = {}
): Promise<boolean> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = nextTempPath(filePath)

  try {
    const handle = await fs.open(tempPath, 'w')
    try {
      await handle.writeFile(content, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    if (shouldCommit && !shouldCommit()) {
      await fs.rm(tempPath, { force: true })
      return false
    }
    await renameWithRetry(tempPath, filePath)
    return true
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

/** Synchronous twin of atomicWriteFile, for the few moments the process cannot await (logoff). */
export function atomicWriteFileSync(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = nextTempPath(filePath)

  try {
    const descriptor = openSync(tempPath, 'w')
    try {
      writeSync(descriptor, content, null, 'utf8')
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    renameWithRetrySync(tempPath, filePath)
  } catch (error) {
    rmSync(tempPath, { force: true })
    throw error
  }
}

/** Removes `<name>.<pid>-<n>.tmp` leftovers of writes that were interrupted by a crash or kill. */
export async function removeStaleTempFiles(filePath: string): Promise<void> {
  const directory = path.dirname(filePath)
  const prefix = `${path.basename(filePath)}.`
  let entries: string[]
  try {
    entries = await fs.readdir(directory)
  } catch {
    return
  }

  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(prefix) && entry.endsWith('.tmp'))
      .map((entry) =>
        fs.rm(path.join(directory, entry), { force: true }).catch(() => {})
      )
  )
}
