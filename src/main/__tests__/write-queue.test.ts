import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createWriteQueue } from '../write-queue'
import type { WriteQueueOptions } from '../write-queue'

type Step = 'ok' | Error

/**
 * A fake data file. `data` is what the app currently holds; each write records the value it saw
 * when it was called, like the real write reads its snapshot when called.
 */
function createHarness(
  options: Partial<Omit<WriteQueueOptions, 'write'>> = {},
  latencyMs = 0
) {
  const state = {
    data: 0,
    running: 0,
    maxRunning: 0,
    written: [] as number[],
    /** Outcome of the next writes, first in first out; empty means success. */
    plan: [] as Step[],
    hold: false,
    gates: [] as Array<() => void>,
  }

  const write = vi.fn(async (): Promise<void> => {
    state.running += 1
    state.maxRunning = Math.max(state.maxRunning, state.running)
    const snapshot = state.data
    try {
      if (latencyMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, latencyMs))
      }
      if (state.hold) {
        await new Promise<void>((resolve) => state.gates.push(resolve))
      }
      const step = state.plan.shift() ?? 'ok'
      if (step !== 'ok') throw step
      state.written.push(snapshot)
    } finally {
      state.running -= 1
    }
  })
  const onSuccess = vi.fn()
  const onError = vi.fn()
  const queue = createWriteQueue({ write, onSuccess, onError, ...options })

  return {
    state,
    write,
    onSuccess,
    onError,
    queue,
    /** Lets every write that is waiting on the hold finish, and stops holding. */
    release(): void {
      state.hold = false
      for (const open of state.gates.splice(0)) open()
    },
  }
}

async function tick(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('debounce', () => {
  it('does not write synchronously or before the default 300 ms delay, then writes once', async () => {
    const { queue, write } = createHarness()

    queue.schedule()
    expect(write).not.toHaveBeenCalled()
    await tick(299)
    expect(write).not.toHaveBeenCalled()
    await tick(1)

    expect(write).toHaveBeenCalledTimes(1)
  })

  it('collapses changes within the delay into one write and restarts the delay each time', async () => {
    const { queue, write } = createHarness()

    queue.schedule()
    await tick(200)
    queue.schedule()
    await tick(200)
    queue.schedule()
    await tick(299)
    expect(write).not.toHaveBeenCalled()
    await tick(1)
    expect(write).toHaveBeenCalledTimes(1)

    await tick(10_000)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('honours a custom delay', async () => {
    const { queue, write } = createHarness({ delayMs: 50 })

    queue.schedule()
    await tick(49)
    expect(write).not.toHaveBeenCalled()
    await tick(1)

    expect(write).toHaveBeenCalledTimes(1)
  })

  it('is dirty from schedule() until the write has finished', async () => {
    const { queue, state, release } = createHarness()
    state.hold = true

    expect(queue.isDirty()).toBe(false)
    queue.schedule()
    expect(queue.isDirty()).toBe(true)
    await tick(300)
    // The data being written is no longer pending.
    expect(queue.isDirty()).toBe(false)
    release()
    await tick(0)

    expect(queue.isDirty()).toBe(false)
  })

  it('writes the data as it is when the write runs, not when it was scheduled', async () => {
    const { queue, state } = createHarness()

    state.data = 1
    queue.schedule()
    state.data = 2
    await tick(300)

    expect(state.written).toEqual([2])
  })

  it('calls onSuccess once per completed write and never onError', async () => {
    const { queue, onSuccess, onError } = createHarness()

    queue.schedule()
    await tick(300)
    queue.schedule()
    await tick(300)

    expect(onSuccess).toHaveBeenCalledTimes(2)
    expect(onError).not.toHaveBeenCalled()
  })
})

describe('one writer at a time', () => {
  it('writes a change that arrives during a write afterwards, in the same loop', async () => {
    const { queue, state, write, release } = createHarness()
    state.hold = true
    state.data = 1

    queue.schedule()
    await tick(300)
    expect(write).toHaveBeenCalledTimes(1)
    expect(state.running).toBe(1)

    state.data = 2
    queue.schedule()
    // The debounce fires while the first write is still running: no second writer may start.
    await tick(300)
    expect(write).toHaveBeenCalledTimes(1)
    expect(state.running).toBe(1)

    release()
    await tick(1)

    expect(write).toHaveBeenCalledTimes(2)
    expect(state.written).toEqual([1, 2])
    expect(state.maxRunning).toBe(1)
    expect(queue.isDirty()).toBe(false)

    // The loop already wrote the change, so the debounce timer must not write it a third time.
    await tick(10_000)
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('coalesces many changes during one slow write into a single follow-up write of the latest data', async () => {
    const { queue, state, write, release } = createHarness()
    state.hold = true
    state.data = 1

    queue.schedule()
    await tick(300)
    for (const value of [2, 3, 4, 5]) {
      state.data = value
      queue.schedule()
      await tick(50)
    }
    release()
    await tick(1)

    expect(write).toHaveBeenCalledTimes(2)
    expect(state.written).toEqual([1, 5])
    expect(state.maxRunning).toBe(1)
  })

  it('never overlaps writes under a steady stream of changes and ends with the latest data', async () => {
    const { queue, state, write } = createHarness({ delayMs: 50 }, 250)

    for (let value = 1; value <= 20; value += 1) {
      state.data = value
      queue.schedule()
      await tick(100)
    }
    const done = queue.flush()
    await tick(1000)
    await done

    expect(state.maxRunning).toBe(1)
    expect(state.written.at(-1)).toBe(20)
    expect(write.mock.calls.length).toBeGreaterThan(1)
    expect(write.mock.calls.length).toBeLessThan(20)
    expect(queue.isDirty()).toBe(false)
  })
})

describe('flush', () => {
  it('resolves without writing when nothing is pending', async () => {
    const { queue, write } = createHarness()

    await queue.flush()

    expect(write).not.toHaveBeenCalled()
  })

  it('writes pending data immediately and cancels the debounce timer', async () => {
    const { queue, state, write } = createHarness()
    state.data = 7

    queue.schedule()
    await queue.flush()

    expect(write).toHaveBeenCalledTimes(1)
    expect(state.written).toEqual([7])
    expect(vi.getTimerCount()).toBe(0)
    await tick(10_000)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('does not write again when the data was already flushed', async () => {
    const { queue, write } = createHarness()

    queue.schedule()
    await queue.flush()
    await queue.flush()

    expect(write).toHaveBeenCalledTimes(1)
  })

  it('waits for an in-flight write and then writes what changed meanwhile', async () => {
    const { queue, state, write, release } = createHarness()
    state.hold = true
    state.data = 1
    queue.schedule()
    await tick(300)
    expect(write).toHaveBeenCalledTimes(1)

    state.data = 2
    queue.schedule()
    let settled = false
    const flushed = queue.flush().then(() => {
      settled = true
    })
    await tick(0)
    expect(settled).toBe(false)
    expect(write).toHaveBeenCalledTimes(1)

    release()
    await flushed

    expect(settled).toBe(true)
    expect(state.written).toEqual([1, 2])
    expect(state.maxRunning).toBe(1)
    expect(queue.isDirty()).toBe(false)
  })

  it('waits for an in-flight write but does not write again when nothing changed', async () => {
    const { queue, state, write, release } = createHarness()
    state.hold = true
    queue.schedule()
    await tick(300)

    const flushed = queue.flush()
    release()
    await flushed

    expect(write).toHaveBeenCalledTimes(1)
  })
})

describe('failures and automatic retries', () => {
  const failure = new Error('disk full')

  it('reports the error, stays dirty and retries after 1 s, 5 s, 30 s and then every 30 s', async () => {
    const { queue, state, write, onError, onSuccess } = createHarness()
    state.plan.push(failure, failure, failure, failure, failure)

    queue.schedule()
    await tick(299)
    expect(write).toHaveBeenCalledTimes(0)
    await tick(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenLastCalledWith(failure)
    expect(queue.isDirty()).toBe(true)
    expect(onSuccess).not.toHaveBeenCalled()

    await tick(999)
    expect(write).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(write).toHaveBeenCalledTimes(2)

    await tick(4999)
    expect(write).toHaveBeenCalledTimes(2)
    await tick(1)
    expect(write).toHaveBeenCalledTimes(3)

    await tick(29_999)
    expect(write).toHaveBeenCalledTimes(3)
    await tick(1)
    expect(write).toHaveBeenCalledTimes(4)

    await tick(29_999)
    expect(write).toHaveBeenCalledTimes(4)
    await tick(1)
    expect(write).toHaveBeenCalledTimes(5)

    expect(onError).toHaveBeenCalledTimes(5)
    expect(queue.isDirty()).toBe(true)
  })

  it('calls onSuccess after recovery, and the failure count starts over', async () => {
    const { queue, state, write, onError, onSuccess } = createHarness()
    state.plan.push(failure, failure, failure)

    queue.schedule()
    await tick(300) // fails, next wait 1 s
    await tick(1000) // fails, next wait 5 s
    await tick(5000) // fails, next wait 30 s
    expect(write).toHaveBeenCalledTimes(3)

    await tick(30_000) // succeeds
    expect(write).toHaveBeenCalledTimes(4)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(3)
    expect(queue.isDirty()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)

    // A new failure is back at the shortest wait.
    state.plan.push(failure)
    queue.schedule()
    await tick(300)
    expect(write).toHaveBeenCalledTimes(5)
    await tick(999)
    expect(write).toHaveBeenCalledTimes(5)
    await tick(1)
    expect(write).toHaveBeenCalledTimes(6)
    expect(onSuccess).toHaveBeenCalledTimes(2)
  })

  it('uses custom retry delays and repeats the last one', async () => {
    const { queue, state, write } = createHarness({
      retryDelaysMs: [10, 20],
    })
    state.plan.push(failure, failure, failure, failure)

    queue.schedule()
    await tick(300)
    expect(write).toHaveBeenCalledTimes(1)
    await tick(10)
    expect(write).toHaveBeenCalledTimes(2)
    await tick(19)
    expect(write).toHaveBeenCalledTimes(2)
    await tick(1)
    expect(write).toHaveBeenCalledTimes(3)
    await tick(19)
    expect(write).toHaveBeenCalledTimes(3)
    await tick(1)
    expect(write).toHaveBeenCalledTimes(4)
  })

  it('falls back to a 1 s retry when no retry delays are configured', async () => {
    const { queue, state, write } = createHarness({ retryDelaysMs: [] })
    state.plan.push(failure)

    queue.schedule()
    await tick(300)
    expect(write).toHaveBeenCalledTimes(1)
    await tick(999)
    expect(write).toHaveBeenCalledTimes(1)
    await tick(1)

    expect(write).toHaveBeenCalledTimes(2)
  })

  it('keeps the failed change and writes the newest data on the retry', async () => {
    const { queue, state } = createHarness()
    state.plan.push(failure)
    state.data = 1

    queue.schedule()
    await tick(300)
    state.data = 2
    await tick(1000)

    expect(state.written).toEqual([2])
    expect(queue.isDirty()).toBe(false)
  })

  it('goes back to the normal debounce when a change arrives while waiting to retry', async () => {
    const { queue, state, write } = createHarness()
    state.plan.push(failure, failure)

    queue.schedule()
    await tick(300) // fails at t=300, retry would be due at t=1300
    expect(write).toHaveBeenCalledTimes(1)

    await tick(500) // t=800
    queue.schedule() // debounce due at t=1100
    await tick(299)
    expect(write).toHaveBeenCalledTimes(1)
    await tick(1) // t=1100: fails again
    expect(write).toHaveBeenCalledTimes(2)

    // The change did not reset the failure count: the next wait is the second one, 5 s.
    await tick(4999)
    expect(write).toHaveBeenCalledTimes(2)
    await tick(1)
    expect(write).toHaveBeenCalledTimes(3)
    expect(queue.isDirty()).toBe(false)
  })

  describe('flush after a failure', () => {
    it('retries once straight away and resolves when that works', async () => {
      const { queue, state, write, onSuccess } = createHarness()
      state.plan.push(failure)
      queue.schedule()
      await tick(300)
      expect(write).toHaveBeenCalledTimes(1)

      await queue.flush()

      expect(write).toHaveBeenCalledTimes(2)
      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(queue.isDirty()).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('retries once and rejects with the write error when it fails again', async () => {
      const { queue, state, write, onError } = createHarness()
      const second = new Error('still full')
      state.plan.push(failure, second)
      queue.schedule()
      await tick(300)

      await expect(queue.flush()).rejects.toBe(second)

      // One retry, not a busy loop.
      expect(write).toHaveBeenCalledTimes(2)
      expect(onError).toHaveBeenCalledTimes(2)
      expect(queue.isDirty()).toBe(true)
    })

    it('rejects when the data was never written and the first attempt fails', async () => {
      const { queue, state, write } = createHarness()
      state.plan.push(failure)
      queue.schedule()

      await expect(queue.flush()).rejects.toBe(failure)

      expect(write).toHaveBeenCalledTimes(1)
      expect(queue.isDirty()).toBe(true)
    })

    it('can be flushed again once the problem is gone', async () => {
      const { queue, state } = createHarness()
      state.plan.push(failure)
      state.data = 5
      queue.schedule()
      await expect(queue.flush()).rejects.toBe(failure)

      await queue.flush()

      expect(state.written).toEqual([5])
      expect(queue.isDirty()).toBe(false)
    })

    it('retries after an in-flight write fails while flushing, and resolves when the retry works', async () => {
      const { queue, state, write, release, onError, onSuccess } =
        createHarness()
      state.hold = true
      state.plan.push(failure)
      queue.schedule()
      await tick(300)
      expect(write).toHaveBeenCalledTimes(1)

      const flushed = queue.flush()
      release()
      await flushed

      expect(write).toHaveBeenCalledTimes(2)
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(queue.isDirty()).toBe(false)
      // The retry timer armed by the failure must not cause another write.
      await tick(60_000)
      expect(write).toHaveBeenCalledTimes(2)
    })

    it('rejects when the in-flight write and the retry both fail', async () => {
      const { queue, state, write, release } = createHarness()
      const second = new Error('second')
      state.hold = true
      state.plan.push(failure, second)
      queue.schedule()
      await tick(300)

      const flushed = queue.flush()
      const outcome = expect(flushed).rejects.toBe(second)
      release()
      await outcome

      expect(write).toHaveBeenCalledTimes(2)
    })
  })
})

describe('takeDirty', () => {
  it('reports pending data, forgets it and cancels the write', async () => {
    const { queue, write } = createHarness()

    queue.schedule()
    expect(queue.takeDirty()).toBe(true)

    expect(queue.isDirty()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    await tick(10_000)
    expect(write).not.toHaveBeenCalled()
  })

  it('returns false when nothing is pending, and a second call after a take also returns false', async () => {
    const { queue, write } = createHarness()

    expect(queue.takeDirty()).toBe(false)
    queue.schedule()
    expect(queue.takeDirty()).toBe(true)
    expect(queue.takeDirty()).toBe(false)

    await queue.flush()
    expect(write).not.toHaveBeenCalled()
  })

  it('can schedule again after taking', async () => {
    const { queue, write } = createHarness()
    queue.schedule()
    queue.takeDirty()

    queue.schedule()
    await tick(300)

    expect(write).toHaveBeenCalledTimes(1)
  })

  it('takes the data of a failed write and cancels its retry', async () => {
    const { queue, state, write } = createHarness()
    state.plan.push(new Error('disk full'))
    queue.schedule()
    await tick(300)
    expect(queue.isDirty()).toBe(true)

    expect(queue.takeDirty()).toBe(true)

    expect(queue.isDirty()).toBe(false)
    await tick(60_000)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('does not count a write that is already in flight as pending', async () => {
    const { queue, state, release } = createHarness()
    state.hold = true
    queue.schedule()
    await tick(300)

    expect(queue.takeDirty()).toBe(false)

    release()
    await tick(1)
    expect(state.written).toEqual([0])
  })

  it('stops the running loop from writing a change that arrived during a write', async () => {
    const { queue, state, write, release } = createHarness()
    state.hold = true
    queue.schedule()
    await tick(300)
    queue.schedule()

    expect(queue.takeDirty()).toBe(true)
    release()
    await tick(1)
    await tick(10_000)

    expect(write).toHaveBeenCalledTimes(1)
  })
})
