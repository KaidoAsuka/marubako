export interface WriteQueueOptions {
  /** Writes the newest data to disk. It reads its snapshot when called, not when scheduled. */
  write: () => Promise<void>
  /** Debounce between the last change and the write. */
  delayMs?: number
  /** Waits before automatic retries after a failed write; the last value repeats. */
  retryDelaysMs?: number[]
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

export interface WriteQueue {
  /** Marks the data as changed and (re)starts the debounce. */
  schedule: () => void
  /** Resolves once everything scheduled so far is on disk; rejects if the last attempt fails. */
  flush: () => Promise<void>
  isDirty: () => boolean
  /** Returns whether there was pending data and forgets it; for writers that write it themselves. */
  takeDirty: () => boolean
}

const DEFAULT_RETRY_DELAYS_MS = [1000, 5000, 30000]

/**
 * One writer at a time, with a dirty flag instead of one promise per change. A change that arrives
 * while a write is running is written by the same loop afterwards, so the last change always
 * reaches the disk and two writes never touch the file together.
 */
export function createWriteQueue({
  write,
  delayMs = 300,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  onSuccess,
  onError,
}: WriteQueueOptions): WriteQueue {
  let dirty = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let writing: Promise<void> | null = null
  let failures = 0

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function start(delay: number): void {
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      // A failure is reported through onError and retried by drain itself.
      drain().catch(() => undefined)
    }, delay)
    // A pending retry must not keep the process alive; quitting flushes explicitly.
    timer.unref?.()
  }

  function scheduleRetry(): void {
    if (!dirty || timer) return
    const delay =
      retryDelaysMs[Math.min(failures - 1, retryDelaysMs.length - 1)] ??
      DEFAULT_RETRY_DELAYS_MS[0]!
    start(delay)
  }

  function drain(): Promise<void> {
    if (writing) return writing
    const current = (async () => {
      while (dirty) {
        dirty = false
        try {
          await write()
        } catch (error) {
          dirty = true
          failures += 1
          onError?.(error)
          scheduleRetry()
          throw error
        }
        failures = 0
        onSuccess?.()
      }
    })().finally(() => {
      if (writing === current) writing = null
    })
    writing = current
    return current
  }

  return {
    schedule() {
      dirty = true
      start(delayMs)
    },
    async flush() {
      clearTimer()
      if (writing) await writing.catch(() => undefined)
      while (dirty) await drain()
    },
    isDirty: () => dirty,
    takeDirty() {
      clearTimer()
      const was = dirty
      dirty = false
      return was
    },
  }
}
