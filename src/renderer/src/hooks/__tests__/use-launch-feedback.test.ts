import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LAUNCH_FAILED_MS,
  LAUNCH_WINDOW_MS,
  useLaunchFeedback,
} from '../use-launch-feedback'

function deferred() {
  let resolve!: (value: boolean) => void
  const promise = new Promise<boolean>((done) => {
    resolve = done
  })

  return { promise, resolve }
}

describe('useLaunchFeedback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('answers at once, before the launch has said anything', () => {
    const pending = deferred()
    const open = vi.fn(() => pending.promise)
    const { result } = renderHook(() => useLaunchFeedback())

    expect(result.current.state).toBe('idle')
    act(() => {
      void result.current.launch(open)
    })

    expect(result.current.state).toBe('launching')
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('swallows a second click while the first is still being answered', async () => {
    const open = vi.fn(async () => true)
    const { result } = renderHook(() => useLaunchFeedback())

    let first = false
    let second = true
    await act(async () => {
      first = await result.current.launch(open)
      second = await result.current.launch(open)
    })

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('is idle again 600ms after the click, not 600ms after the launch finished', async () => {
    const pending = deferred()
    const { result } = renderHook(() => useLaunchFeedback())

    act(() => {
      void result.current.launch(() => pending.promise)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
      pending.resolve(true)
    })
    expect(result.current.state).toBe('launching')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LAUNCH_WINDOW_MS - 100 - 1)
    })
    expect(result.current.state).toBe('launching')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(result.current.state).toBe('idle')
  })

  it('goes idle as soon as a slow launch is done, and clicks work again', async () => {
    const pending = deferred()
    const open = vi.fn(() => pending.promise)
    const { result } = renderHook(() => useLaunchFeedback())

    act(() => {
      void result.current.launch(open)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LAUNCH_WINDOW_MS + 300)
    })
    // Still launching: the program has not come up yet.
    expect(result.current.state).toBe('launching')
    await act(async () => {
      pending.resolve(true)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.state).toBe('idle')

    await act(async () => {
      await result.current.launch(open)
    })
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('shows a failed launch for 1.2 seconds, then goes idle', async () => {
    const { result } = renderHook(() => useLaunchFeedback())

    await act(async () => {
      await result.current.launch(async () => false)
    })
    expect(result.current.state).toBe('failed')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LAUNCH_FAILED_MS - 1)
    })
    expect(result.current.state).toBe('failed')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(result.current.state).toBe('idle')
  })

  it('lets a click through while failed, as a retry', async () => {
    const open = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const { result } = renderHook(() => useLaunchFeedback())

    await act(async () => {
      await result.current.launch(open)
    })
    expect(result.current.state).toBe('failed')

    let ran = false
    await act(async () => {
      ran = await result.current.launch(open)
    })

    expect(ran).toBe(true)
    expect(open).toHaveBeenCalledTimes(2)
    expect(result.current.state).toBe('launching')
    // The old red outline timer must not cut the new answer short.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LAUNCH_FAILED_MS)
    })
    expect(result.current.state).toBe('idle')
  })

  it('counts a launch that throws as a failure', async () => {
    const { result } = renderHook(() => useLaunchFeedback())

    await act(async () => {
      await result.current.launch(async () => {
        throw new Error('boom')
      })
    })

    expect(result.current.state).toBe('failed')
  })

  it('leaves no timer behind when the card goes away', async () => {
    const pending = deferred()
    const { result, unmount } = renderHook(() => useLaunchFeedback())

    act(() => {
      void result.current.launch(() => pending.promise)
    })
    unmount()
    await act(async () => {
      pending.resolve(true)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses a 600ms window and a 1.2s failure', () => {
    expect(LAUNCH_WINDOW_MS).toBe(600)
    expect(LAUNCH_FAILED_MS).toBe(1200)
  })
})
