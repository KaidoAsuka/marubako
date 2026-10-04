import log from 'electron-log/main'

/** The first check waits this long after start-up, so it never competes with opening the window. */
export const UPDATE_CHECK_DELAY_MS = 30_000
/** After the first one, a program that stays open asks at most once a day. */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Whether the program asks for updates by itself. A development build has no installed feed and
 * the e2e runs must never reach for the network. (A portable copy asks as well: it installs
 * nothing, but says when there is a newer version.)
 */
export function shouldCheckForUpdates({
  isPackaged,
  isE2E,
}: {
  isPackaged: boolean
  isE2E: boolean
}): boolean {
  return isPackaged && !isE2E
}

/**
 * Runs `check` once after the delay and then every interval. Returns a function that stops it.
 * The timers do not keep the process alive; a failed check is only logged.
 */
export function scheduleUpdateChecks(
  check: () => Promise<unknown>,
  {
    delayMs = UPDATE_CHECK_DELAY_MS,
    intervalMs = UPDATE_CHECK_INTERVAL_MS,
  }: { delayMs?: number; intervalMs?: number } = {}
): () => void {
  let interval: ReturnType<typeof setInterval> | undefined
  const run = (): void => {
    void check().catch((error) => log.warn('Update check failed', error))
  }
  const first = setTimeout(() => {
    run()
    interval = setInterval(run, intervalMs)
    interval.unref()
  }, delayMs)
  first.unref()

  return () => {
    clearTimeout(first)
    if (interval) clearInterval(interval)
  }
}

/**
 * The start-up entry: schedules the checks unless this is a development build or an e2e run.
 * Returns the stop function, or null when nothing was scheduled.
 */
export function startUpdateChecks({
  isPackaged,
  isE2E,
  check,
  ...timing
}: {
  isPackaged: boolean
  isE2E: boolean
  check: () => Promise<unknown>
  delayMs?: number
  intervalMs?: number
}): (() => void) | null {
  if (!shouldCheckForUpdates({ isPackaged, isE2E })) return null
  return scheduleUpdateChecks(check, timing)
}
