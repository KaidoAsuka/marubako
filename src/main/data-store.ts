import fs from 'node:fs/promises'

import { app } from 'electron'
import log from 'electron-log/main'

import { createDefaultAppData } from '../shared/default-data'
import type {
  AppData,
  DataStatus,
  Lang,
  PasswordItem,
  StartupNotice,
  StartupNoticeKind,
  WindowState,
} from '../shared/types'
import {
  atomicWriteFile,
  atomicWriteFileSync,
  removeStaleTempFiles,
} from './atomic-file'
import {
  createPreImportBackup,
  dayStamp,
  ensureDailySnapshot,
  listBackups,
  refreshLastStartBackup,
  type BackupKind,
} from './backups'
import { getBackupDir, getDataFilePath, getWindowStateFilePath } from './config'
import {
  contentKey,
  parseDataFile,
  serializeDataFile,
  stringifyExport,
  systemPasswordCodec,
  type ParsedDataFile,
} from './data-file'
import { normalizeAppData, UnsupportedSchemaError } from './data-normalize'
import { DataDecryptError } from './encryption'
import { detectInitialLang } from './initial-lang'
import { normalizeWindowState } from './window-state'
import { createWriteQueue } from './write-queue'

export { normalizeAppData } from './data-normalize'
export { hasStoredPasswords } from './data-file'

export type RecoveryReason = 'parse' | 'decrypt' | 'schema' | 'missing'

export interface RecoveryBackup {
  path: string
  /** Local date of the backup, `YYYY-MM-DD`. */
  date: string
  kind: BackupKind
}

export interface RecoveryInfo {
  reason: RecoveryReason
  filePath: string
  /** Backups that were read successfully, newest first. */
  backups: RecoveryBackup[]
}

export type RecoveryChoice =
  | { action: 'exit' }
  | { action: 'fresh' }
  | { action: 'restore'; backupPath: string }

export interface LoadOptions {
  /** Asked when the data file cannot be used. Without it the newest backup, else default data. */
  chooseRecovery?: (info: RecoveryInfo) => Promise<RecoveryChoice>
}

/** The user chose to quit instead of replacing a data file that could not be read. */
export class DataLoadAbortedError extends Error {
  constructor() {
    super('Start-up was cancelled to keep the existing data file')
    this.name = 'DataLoadAbortedError'
  }
}

let cachedData: AppData | null = null
let loadPromise: Promise<AppData> | null = null
let lostPasswords = new Map<string, string>()
let notices: StartupNotice[] = []
let lastWrittenKey: string | null = null
let lastWrittenWindowKey: string | null = null
let snapshotDay: string | null = null
// True when this process started a new installation: there was no data file and no backup, so the
// sample data was created. A reset or a restore after a damaged file is not a new installation.
let freshInstall = false
// Bumped by the synchronous flush at session end; asynchronous writes started earlier then give up.
let syncEpoch = 0
const writeErrors: { data: string | null; window: string | null } = {
  data: null,
  window: null,
}
const statusListeners = new Set<(status: DataStatus) => void>()

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Whether this start created the data of a new installation (the first-run experience follows it). */
export function isFreshInstall(): boolean {
  return freshInstall
}

/** The display language, if the data has been loaded; used by the dialogs of the main process. */
export function getCachedLang(): Lang | undefined {
  return cachedData?.prefs.lang
}

export function getDataStatus(): DataStatus {
  return {
    writeError: writeErrors.data ?? writeErrors.window,
    notices: [...notices],
  }
}

function emitStatus(): void {
  const status = getDataStatus()
  for (const listener of statusListeners) {
    try {
      listener(status)
    } catch (error) {
      log.warn('Data status listener failed', error)
    }
  }
}

export function onDataStatusChange(
  listener: (status: DataStatus) => void
): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

function setNotice(notice: StartupNotice): void {
  notices = [...notices.filter((entry) => entry.kind !== notice.kind), notice]
  emitStatus()
}

/**
 * Keeps the "passwords could not be decrypted" notice truthful as the user fixes them. A notice
 * the user dismissed is never brought back unless `allowCreate` says new passwords were just lost.
 */
function syncLostNotice(allowCreate: boolean): void {
  const count = lostPasswords.size
  const existing = notices.find((notice) => notice.kind === 'passwordsLost')

  if (count === 0) {
    if (existing) {
      notices = notices.filter((notice) => notice.kind !== 'passwordsLost')
      emitStatus()
    }
    return
  }
  if (!existing && !allowCreate) return
  if (existing?.kind === 'passwordsLost' && existing.count === count) return
  setNotice({ kind: 'passwordsLost', count })
}

export function dismissNotice(kind: StartupNoticeKind): DataStatus {
  notices = notices.filter((notice) => notice.kind !== kind)
  emitStatus()
  return getDataStatus()
}

function passwordItems(data: AppData): PasswordItem[] {
  return [
    ...data.passwords.flatMap((group) => group.items),
    ...data.loose.passwords,
  ]
}

/** Marks passwords that are empty because they could not be decrypted, and forgets deleted ones. */
function applyLostFlags(data: AppData): void {
  const present = new Set<string>()
  for (const item of passwordItems(data)) {
    present.add(item.id)
    if (item.password === '' && lostPasswords.has(item.id)) {
      item.passwordLost = true
    } else {
      delete item.passwordLost
      if (item.password !== '') lostPasswords.delete(item.id)
    }
  }
  for (const id of lostPasswords.keys()) {
    if (!present.has(id)) lostPasswords.delete(id)
  }
}

async function writeMain(): Promise<void> {
  const snapshot = cachedData
  if (!snapshot) return

  const key = contentKey(snapshot)
  if (key === lastWrittenKey) return

  const epoch = syncEpoch
  const filePath = getDataFilePath()
  const today = dayStamp(new Date())
  if (snapshotDay !== today) {
    try {
      await ensureDailySnapshot(filePath, getBackupDir())
      snapshotDay = today
    } catch (error) {
      log.warn('Could not create the daily data backup', error)
    }
  }

  const committed = await atomicWriteFile(
    filePath,
    serializeDataFile(snapshot, systemPasswordCodec, lostPasswords),
    { shouldCommit: () => epoch === syncEpoch }
  )
  if (!committed) return
  lastWrittenKey = key
  log.info('Saved application data to disk')
}

function windowFileContent(windowState: WindowState): string {
  return JSON.stringify({ version: 1, window: windowState }, null, 2)
}

async function writeWindowState(): Promise<void> {
  const windowState = cachedData?.window
  if (!windowState) return

  const key = JSON.stringify(windowState)
  if (key === lastWrittenWindowKey) return

  const epoch = syncEpoch
  const committed = await atomicWriteFile(
    getWindowStateFilePath(),
    windowFileContent(windowState),
    { shouldCommit: () => epoch === syncEpoch }
  )
  if (!committed) return
  lastWrittenWindowKey = key
}

const mainQueue = createWriteQueue({
  write: writeMain,
  onSuccess: () => {
    if (writeErrors.data !== null) {
      writeErrors.data = null
      emitStatus()
    }
  },
  onError: (error) => {
    log.error('Failed to save application data', error)
    writeErrors.data = describeError(error)
    emitStatus()
  },
})

const windowQueue = createWriteQueue({
  write: writeWindowState,
  onSuccess: () => {
    if (writeErrors.window !== null) {
      writeErrors.window = null
      emitStatus()
    }
  },
  onError: (error) => {
    log.error('Failed to save the window position', error)
    writeErrors.window = describeError(error)
    emitStatus()
  },
})

async function readWindowStateFile(
  fallbackOpacity: number
): Promise<WindowState | null> {
  try {
    const text = await fs.readFile(getWindowStateFilePath(), 'utf8')
    const parsed: unknown = JSON.parse(
      text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
    )
    const windowState = (parsed as { window?: unknown } | null)?.window
    if (typeof windowState !== 'object' || windowState === null) return null
    return normalizeWindowState(windowState, fallbackOpacity)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn('Ignoring unreadable window-state file', error)
    }
    return null
  }
}

type ReadResult =
  | { ok: true; parsed: ParsedDataFile }
  | { ok: false; reason: RecoveryReason; error: unknown }

async function readDataFile(filePath: string): Promise<ReadResult> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: false, reason: 'missing', error }
    }
    // Locked or no permission: do not treat it as damaged. Startup reports the error instead.
    throw error
  }

  try {
    return { ok: true, parsed: parseDataFile(raw) }
  } catch (error) {
    const reason: RecoveryReason =
      error instanceof DataDecryptError
        ? 'decrypt'
        : error instanceof UnsupportedSchemaError
          ? 'schema'
          : 'parse'
    return { ok: false, reason, error }
  }
}

interface LoadedBackup extends RecoveryBackup {
  parsed: ParsedDataFile
}

async function readBackups(filePath: string): Promise<LoadedBackup[]> {
  const loaded: LoadedBackup[] = []
  for (const backup of await listBackups(filePath, getBackupDir())) {
    try {
      const parsed = parseDataFile(await fs.readFile(backup.path, 'utf8'))
      loaded.push({
        path: backup.path,
        date: backup.date,
        kind: backup.kind,
        parsed,
      })
    } catch (error) {
      log.warn('Skipping a backup that cannot be read', backup.path, error)
    }
  }
  return loaded
}

/** Data for a new installation: the sample entries speak the language of the computer. */
function starterData(): AppData {
  return normalizeAppData(createDefaultAppData(detectInitialLang()))
}

async function recover(
  filePath: string,
  reason: RecoveryReason,
  error: unknown,
  options: LoadOptions
): Promise<{ parsed: ParsedDataFile; notice: StartupNotice | null }> {
  const backups = await readBackups(filePath)

  if (reason === 'missing' && backups.length === 0) {
    freshInstall = true
    return {
      parsed: {
        data: starterData(),
        lostPasswords: new Map(),
        format: 'file',
        hadWindowState: false,
        passwordsOmitted: false,
      },
      notice: null,
    }
  }

  log.error('Data file cannot be used', reason, error)
  const choice: RecoveryChoice = options.chooseRecovery
    ? await options.chooseRecovery({
        reason,
        filePath,
        backups: backups.map(({ path, date, kind }) => ({ path, date, kind })),
      })
    : backups[0]
      ? { action: 'restore', backupPath: backups[0].path }
      : { action: 'fresh' }

  if (choice.action === 'exit') {
    throw new DataLoadAbortedError()
  }

  // Keep the original before anything replaces it. If this fails, nothing has been touched.
  let recoveryPath = ''
  if (reason !== 'missing') {
    recoveryPath = `${filePath}.recovery-${Date.now()}`
    await fs.copyFile(filePath, recoveryPath)
    log.error(
      'Existing data could not be loaded; recovery copy saved',
      recoveryPath
    )
  }

  const restoreFrom =
    choice.action === 'restore'
      ? backups.find((backup) => backup.path === choice.backupPath)
      : undefined
  if (restoreFrom) {
    return {
      parsed: restoreFrom.parsed,
      notice: {
        kind: 'restored',
        backupPath: restoreFrom.path,
        backupDate: restoreFrom.date,
        recoveryPath,
      },
    }
  }

  return {
    parsed: {
      data: starterData(),
      lostPasswords: new Map(),
      format: 'file',
      hadWindowState: false,
      passwordsOmitted: false,
    },
    notice:
      reason === 'missing' ? null : { kind: 'reset', reason, recoveryPath },
  }
}

async function loadFromDisk(options: LoadOptions): Promise<AppData> {
  const filePath = getDataFilePath()
  await Promise.all([
    removeStaleTempFiles(filePath),
    removeStaleTempFiles(getWindowStateFilePath()),
  ])

  const result = await readDataFile(filePath)
  let parsed: ParsedDataFile
  let replacedFile = false

  if (result.ok) {
    parsed = result.parsed
    try {
      await refreshLastStartBackup(filePath)
      await ensureDailySnapshot(filePath, getBackupDir())
      snapshotDay = dayStamp(new Date())
    } catch (error) {
      log.warn('Could not refresh the data backups', error)
    }
  } else {
    const recovered = await recover(
      filePath,
      result.reason,
      result.error,
      options
    )
    parsed = recovered.parsed
    replacedFile = true
    if (recovered.notice) setNotice(recovered.notice)
    // The file on disk is about to be replaced, so it must not become today's snapshot.
    snapshotDay = dayStamp(new Date())
  }

  const data = parsed.data
  resolveStarterPaths(data)
  lostPasswords = new Map(parsed.lostPasswords)
  applyLostFlags(data)
  syncLostNotice(true)

  const storedWindow = await readWindowStateFile(data.prefs.opacity)
  if (storedWindow) {
    data.window = storedWindow
    lastWrittenWindowKey = JSON.stringify(storedWindow)
  } else {
    lastWrittenWindowKey = null
  }

  cachedData = data
  const migratingFormat = result.ok && parsed.format !== 'file'
  lastWrittenKey = result.ok && !migratingFormat ? contentKey(data) : null
  if (replacedFile || migratingFormat) {
    // Write the new file now: a restored or migrated file must not wait for the next edit. A
    // failure here is already in the status and retried; it must not stop the app from starting.
    mainQueue.schedule()
    await mainQueue.flush().catch(() => undefined)
  }
  if (!storedWindow && parsed.hadWindowState) {
    // First start after the window position moved out of the data file: carry it over.
    windowQueue.schedule()
  }

  return data
}

export function loadAppData(options: LoadOptions = {}): Promise<AppData> {
  if (cachedData) {
    return Promise.resolve(cachedData)
  }

  loadPromise ??= loadFromDisk(options).finally(() => {
    loadPromise = null
  })
  return loadPromise
}

function resolveStarterPaths(data: AppData): void {
  const starterPaths: Record<string, string> = {
    'folder-desktop': app.getPath('desktop'),
    'folder-documents': app.getPath('documents'),
    'folder-downloads': app.getPath('downloads'),
  }
  for (const item of [
    ...data.folders.flatMap((group) => group.items),
    ...data.loose.folders,
  ]) {
    const resolved = starterPaths[item.id]
    if (resolved && item.path.startsWith('C:\\Users\\用户名\\'))
      item.path = resolved
  }
}

export function parseAppDataFile(raw: string): AppData {
  return parseDataFile(raw, { strict: false }).data
}

export async function saveAppData(data: AppData): Promise<AppData> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new TypeError('Invalid application data')
  }

  const previous = await loadAppData()
  const next = normalizeAppData(data)
  applyLostFlags(next)
  syncLostNotice(false)
  cachedData = next

  if (contentKey(previous) !== contentKey(next)) {
    mainQueue.schedule()
  }
  if (JSON.stringify(previous.window) !== JSON.stringify(next.window)) {
    windowQueue.schedule()
  }
  return next
}

export async function updateAppData(
  updater: (current: AppData) => AppData
): Promise<AppData> {
  const current = await loadAppData()
  return saveAppData(updater(current))
}

/** Changes only the window position and size; the main data file is not touched. */
export async function updateWindowData(
  updater: (windowState: WindowState) => WindowState
): Promise<AppData> {
  const current = await loadAppData()
  const next = normalizeWindowState(
    updater(current.window),
    current.window.opacity
  )
  if (JSON.stringify(next) === JSON.stringify(current.window)) {
    return current
  }

  cachedData = { ...current, window: next }
  windowQueue.schedule()
  return cachedData
}

/** Resolves when everything changed so far is on disk; rejects if a write keeps failing. */
export async function flushPendingWrite(): Promise<void> {
  const results = await Promise.allSettled([
    mainQueue.flush(),
    windowQueue.flush(),
  ])
  const failure = results.find((result) => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
}

/** For the moments the process cannot wait (Windows logoff): writes whatever is pending, now. */
export function flushPendingWriteSync(): void {
  if (!cachedData) return

  // Cancel the timers, but decide by content, not by the queues' dirty flags: a write that is
  // already in flight has cleared its flag without having reached the disk yet.
  mainQueue.takeDirty()
  windowQueue.takeDirty()
  const data = cachedData
  const dataKey = contentKey(data)
  const windowKey = JSON.stringify(data.window)
  if (dataKey === lastWrittenKey && windowKey === lastWrittenWindowKey) return

  // Fence off asynchronous writes that started earlier and would land after this one.
  syncEpoch += 1
  const failures: unknown[] = []
  if (dataKey !== lastWrittenKey) {
    try {
      atomicWriteFileSync(
        getDataFilePath(),
        serializeDataFile(data, systemPasswordCodec, lostPasswords)
      )
      lastWrittenKey = dataKey
    } catch (error) {
      failures.push(error)
    }
  }
  if (windowKey !== lastWrittenWindowKey) {
    try {
      atomicWriteFileSync(
        getWindowStateFilePath(),
        windowFileContent(data.window)
      )
      lastWrittenWindowKey = windowKey
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures[0] !== undefined) throw failures[0]
}

export async function retryDataSave(): Promise<DataStatus> {
  try {
    await flushPendingWrite()
  } catch {
    // The failure is already in the status.
  }
  return getDataStatus()
}

export interface ExportOptions {
  /**
   * An export is plain JSON. With `true` it holds every password in plain text; with `false` the
   * passwords are blanked and the file records that they were left out. There is no default: the
   * caller has to say which, after the user has been told what the file will contain.
   */
  includePasswords: boolean
}

export async function exportAppDataFile(
  data: AppData,
  filePath: string,
  { includePasswords }: ExportOptions
): Promise<void> {
  await atomicWriteFile(
    filePath,
    stringifyExport(normalizeAppData(data), includePasswords)
  )
}

/** Reads and validates a data file without changing anything. */
export async function importAppDataFile(filePath: string): Promise<AppData> {
  return parseDataFile(await fs.readFile(filePath, 'utf8')).data
}

/** What the user has to know before a file replaces the data; throws like an import would. */
export async function readImportSummary(
  filePath: string
): Promise<{ passwordsOmitted: boolean }> {
  const { passwordsOmitted } = parseDataFile(
    await fs.readFile(filePath, 'utf8')
  )
  return { passwordsOmitted }
}

/**
 * Replaces the user's data with the contents of a backup file. The file is checked first, the
 * current data is copied aside, and the position of the window on this computer is kept. If the
 * new data cannot be written, the previous data stays in place, so memory and disk agree.
 */
export async function importAppData(filePath: string): Promise<AppData> {
  const parsed = parseDataFile(await fs.readFile(filePath, 'utf8'))
  const current = await loadAppData()

  await flushPendingWrite()
  await createPreImportBackup(getDataFilePath(), getBackupDir())

  const previousLost = lostPasswords
  lostPasswords = new Map(parsed.lostPasswords)
  parsed.data.window = current.window
  try {
    const saved = await saveAppData(parsed.data)
    await flushPendingWrite()
    syncLostNotice(true)
    return saved
  } catch (error) {
    cachedData = current
    lostPasswords = previousLost
    // The queue is still dirty; its next run finds the content unchanged on disk and settles.
    mainQueue.schedule()
    throw error
  }
}
