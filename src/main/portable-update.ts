import { app, net } from 'electron'
import log from 'electron-log/main'

import type { UpdateCheckResult } from '../shared/types'
import { REPOSITORY_URL } from './config'

/**
 * The small file every release carries for the updater of the installed copy. Its `version` line
 * names the newest release.
 */
export const LATEST_MANIFEST_URL = `${REPOSITORY_URL}/releases/latest/download/latest.yml`
/** Where the newest release is downloaded by hand. */
export const RELEASES_URL = `${REPOSITORY_URL}/releases/latest`

const CHECK_TIMEOUT_MS = 15_000

/** The version a `latest.yml` names, or null when the text is not one. */
export function versionInManifest(text: string): string | null {
  return /^version:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/m.exec(text)?.[1] ?? null
}

/** Whether `candidate` is a later release than `current`: x.y.z, compared number by number. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const numbers = (version: string): number[] =>
    version.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const [one, other] = [numbers(candidate), numbers(current)]
  for (let index = 0; index < 3; index++) {
    const difference = (one[index] ?? 0) - (other[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return false
}

async function fetchManifest(url: string): Promise<string> {
  const response = await net.fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

/**
 * What a portable copy does instead of updating itself: it asks GitHub which version is the newest
 * one and says so. That one small file is all it downloads, and nothing is installed. Like the
 * check of the installed copy it never throws: a failed check is the `error` status.
 */
export async function checkPortableUpdate(
  fetchText: (url: string) => Promise<string> = fetchManifest
): Promise<UpdateCheckResult> {
  try {
    const version = versionInManifest(await fetchText(LATEST_MANIFEST_URL))
    if (!version) throw new Error('The update manifest names no version')
    return isNewerVersion(version, app.getVersion())
      ? { status: 'available', version }
      : { status: 'latest', version: app.getVersion() }
  } catch (error) {
    log.warn('Version check of the portable copy failed', error)
    return { status: 'error' }
  }
}
