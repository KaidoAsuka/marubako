import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('electron-log/main', () => ({ default: log }))

import {
  scheduleUpdateChecks,
  shouldCheckForUpdates,
  startUpdateChecks,
  UPDATE_CHECK_DELAY_MS,
  UPDATE_CHECK_INTERVAL_MS,
} from '../update-schedule'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

beforeEach(() => {
  vi.useFakeTimers()
  log.warn.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('when the program asks for updates by itself', () => {
  it.each([
    [{ isPackaged: true, isE2E: false }, true],
    [{ isPackaged: false, isE2E: false }, false],
    [{ isPackaged: true, isE2E: true }, false],
    [{ isPackaged: false, isE2E: true }, false],
  ])('%j: %s', (state, expected) => {
    expect(shouldCheckForUpdates(state)).toBe(expected)
  })

  // A portable copy installs nothing, but it says when there is a newer version: it asks on the
  // same schedule. What its check does is for auto-updater.ts to say; nothing here tells the two
  // kinds of copy apart, and a caller that still says "portable" is not held back by it.
  it('asks from a portable copy as from an installed one', () => {
    const portable = { isPackaged: true, isE2E: false, isPortable: true }

    expect(shouldCheckForUpdates(portable)).toBe(true)
  })

  it('waits about half a minute after start-up and then a day', () => {
    expect(UPDATE_CHECK_DELAY_MS).toBe(30_000)
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(24 * HOUR)
  })
})

describe('the timed checks', () => {
  it('does not ask before the delay, and asks once when it is over', () => {
    const check = vi.fn(async () => undefined)
    scheduleUpdateChecks(check)

    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS - 1)
    expect(check).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('asks at most once in 24 hours while the program stays open', () => {
    const check = vi.fn(async () => undefined)
    scheduleUpdateChecks(check)
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)

    vi.advanceTimersByTime(24 * HOUR - 1)
    expect(check).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    expect(check).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(24 * HOUR)
    expect(check).toHaveBeenCalledTimes(3)
  })

  it('can be stopped before the first check and between two', () => {
    const early = vi.fn(async () => undefined)
    const stopEarly = scheduleUpdateChecks(early)
    stopEarly()
    vi.advanceTimersByTime(2 * UPDATE_CHECK_INTERVAL_MS)
    expect(early).not.toHaveBeenCalled()

    const late = vi.fn(async () => undefined)
    const stopLate = scheduleUpdateChecks(late)
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
    stopLate()
    vi.advanceTimersByTime(3 * UPDATE_CHECK_INTERVAL_MS)
    expect(late).toHaveBeenCalledTimes(1)
  })

  it('only logs a check that fails, and keeps its schedule', async () => {
    const check = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    scheduleUpdateChecks(check)

    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_DELAY_MS)
    expect(log.warn).toHaveBeenCalledWith(
      'Update check failed',
      expect.any(Error)
    )

    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('does not keep the process alive', () => {
    const unref = vi.fn()
    const realSetTimeout = globalThis.setTimeout
    const realSetInterval = globalThis.setInterval
    const handle = { unref, ref: vi.fn(), hasRef: () => false }
    globalThis.setTimeout = vi.fn((callback: () => void) => {
      callback()
      return handle
    }) as unknown as typeof setTimeout
    globalThis.setInterval = vi.fn(
      () => handle
    ) as unknown as typeof setInterval

    try {
      scheduleUpdateChecks(async () => undefined)
    } finally {
      globalThis.setTimeout = realSetTimeout
      globalThis.setInterval = realSetInterval
    }

    // The first timer and the repeating one are both released.
    expect(unref).toHaveBeenCalledTimes(2)
  })
})

describe('starting the checks at start-up', () => {
  it('schedules them for an installed build', () => {
    const check = vi.fn(async () => undefined)

    const stop = startUpdateChecks({ isPackaged: true, isE2E: false, check })
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)

    expect(stop).toBeTypeOf('function')
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('schedules them for a portable copy as well, which then finds out about newer versions', () => {
    const check = vi.fn(async () => undefined)
    const portable = { isPackaged: true, isE2E: false, isPortable: true }

    const stop = startUpdateChecks({ ...portable, check })
    vi.advanceTimersByTime(UPDATE_CHECK_DELAY_MS)
    expect(check).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS)

    expect(stop).toBeTypeOf('function')
    expect(check).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['a development build', { isPackaged: false, isE2E: false }],
    ['an e2e run', { isPackaged: true, isE2E: true }],
  ])('never schedules anything for %s', (_name, state) => {
    const check = vi.fn(async () => undefined)

    const stop = startUpdateChecks({ ...state, check })
    vi.advanceTimersByTime(3 * UPDATE_CHECK_INTERVAL_MS)

    expect(stop).toBeNull()
    expect(check).not.toHaveBeenCalled()
  })

  it('takes a shorter timing when asked, for the tests', () => {
    const check = vi.fn(async () => undefined)

    startUpdateChecks({
      isPackaged: true,
      isE2E: false,
      check,
      delayMs: 10,
      intervalMs: 100,
    })
    vi.advanceTimersByTime(10)
    expect(check).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(100)
    expect(check).toHaveBeenCalledTimes(2)
  })
})
