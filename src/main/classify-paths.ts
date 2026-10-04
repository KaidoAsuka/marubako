import { open, stat, type FileHandle } from 'node:fs/promises'
import path from 'node:path'

import type { ClassifiedPath } from '../shared/types'

// Programs, shortcuts and scripts: what the "Programs" category is for.
const APP_EXTENSIONS = new Set(['.exe', '.lnk', '.bat', '.cmd'])
const MAX_PATHS = 200
const MAX_PATH_LENGTH = 32_768
// An internet shortcut is a few lines of text; anything bigger is not one.
const MAX_SHORTCUT_BYTES = 64 * 1024
// A network share that does not answer must not hold the add flow up.
const STAT_TIMEOUT_MS = 3000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      }
    )
  })
}

/** The address inside a Windows internet shortcut (.url), or null when it has no http(s) one. */
export async function readInternetShortcut(
  file: string
): Promise<string | null> {
  let handle: FileHandle | undefined
  try {
    handle = await open(file, 'r')
    const buffer = Buffer.alloc(MAX_SHORTCUT_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, MAX_SHORTCUT_BYTES, 0)
    const text = buffer.toString('utf8', 0, bytesRead)
    const match = /^URL=(.+)$/im.exec(text)
    const address = match?.[1]?.trim()
    if (!address) return null
    const parsed = new URL(address)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.href
      : null
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => {})
  }
}

async function classifyOne(target: string): Promise<ClassifiedPath | null> {
  const stats = await withTimeout(stat(target), STAT_TIMEOUT_MS)
  if (!stats) return null
  if (stats.isDirectory()) return { kind: 'folder', target }
  if (!stats.isFile()) return null

  const extension = path.extname(target).toLowerCase()
  if (APP_EXTENSIONS.has(extension)) return { kind: 'app', target }
  if (extension === '.url') {
    const address = await readInternetShortcut(target)
    return address ? { kind: 'website', target: address } : null
  }

  // Any other file: it opens with its own program, like a folder opens in Explorer.
  return { kind: 'file', target }
}

/**
 * Decides what each dropped or pasted path is, by looking at it: a folder, a program, an internet
 * shortcut (whose address is read out), or some other file. A path that does not exist, is not
 * absolute or cannot be read is left out. The input comes from a renderer, so it is checked.
 */
export async function classifyPaths(paths: unknown): Promise<ClassifiedPath[]> {
  if (!Array.isArray(paths)) throw new Error('Invalid paths')

  const classified: ClassifiedPath[] = []
  for (const raw of paths.slice(0, MAX_PATHS)) {
    if (
      typeof raw !== 'string' ||
      raw.length === 0 ||
      raw.length > MAX_PATH_LENGTH ||
      !path.isAbsolute(raw)
    ) {
      continue
    }
    const entry = await classifyOne(raw)
    if (entry) classified.push(entry)
  }

  return classified
}
