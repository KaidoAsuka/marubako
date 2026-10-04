import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COPY_FEEDBACK_MS, useCopyFeedback } from '../use-copy-feedback'

describe('useCopyFeedback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows "copied" for 1.2 seconds, then goes back', () => {
    const { result } = renderHook(() => useCopyFeedback())

    expect(result.current[0]).toBe(false)
    act(() => result.current[1]())
    expect(result.current[0]).toBe(true)

    act(() => {
      vi.advanceTimersByTime(COPY_FEEDBACK_MS - 1)
    })
    expect(result.current[0]).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current[0]).toBe(false)
    expect(COPY_FEEDBACK_MS).toBe(1200)
  })

  it('starts the second confirmation from scratch when copying again while it still shows', () => {
    const { result } = renderHook(() => useCopyFeedback())

    act(() => result.current[1]())
    const first = result.current[2]
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    act(() => result.current[1]())

    // The count goes up, so the tick's entrance can be played again.
    expect(result.current[2]).toBe(first + 1)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current[0]).toBe(true)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current[0]).toBe(false)
  })

  it('keeps one confirmation per button: two hooks do not share a state', () => {
    const user = renderHook(() => useCopyFeedback())
    const password = renderHook(() => useCopyFeedback())

    act(() => user.result.current[1]())
    act(() => password.result.current[1]())

    expect(user.result.current[0]).toBe(true)
    expect(password.result.current[0]).toBe(true)
    act(() => {
      vi.advanceTimersByTime(COPY_FEEDBACK_MS)
    })
    expect(user.result.current[0]).toBe(false)
    expect(password.result.current[0]).toBe(false)
  })

  it('takes another duration, and leaves no timer behind when it goes away', () => {
    const { result, unmount } = renderHook(() => useCopyFeedback(300))

    act(() => result.current[1]())
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current[0]).toBe(false)

    act(() => result.current[1]())
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
