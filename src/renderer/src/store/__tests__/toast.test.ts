import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '../use-app-store'

const state = () => useAppStore.getState()

describe('toast durations and pausing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    state().clearToast()
  })

  afterEach(() => {
    state().clearToast()
    vi.useRealTimers()
  })

  it.each([
    ['success', 1800],
    ['info', 2200],
    ['danger', 5000],
  ] as const)('keeps a %s toast for %i ms', (tone, duration) => {
    state().showToast('hello', tone)

    vi.advanceTimersByTime(duration - 1)
    expect(state().toast?.message).toBe('hello')
    vi.advanceTimersByTime(1)
    expect(state().toast).toBeNull()
  })

  it('defaults to the info duration', () => {
    state().showToast('hello')

    vi.advanceTimersByTime(2199)
    expect(state().toast).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(state().toast).toBeNull()
  })

  it('keeps a toast with an action for six seconds whatever its tone', () => {
    const run = vi.fn()
    state().showToast('deleted', 'success', { action: { label: 'Undo', run } })

    expect(state().toast).toEqual({
      message: 'deleted',
      tone: 'success',
      action: { label: 'Undo', run },
    })
    vi.advanceTimersByTime(5999)
    expect(state().toast).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(state().toast).toBeNull()
  })

  it('lets a caller choose the duration', () => {
    state().showToast('long', 'info', { duration: 10_000 })

    vi.advanceTimersByTime(9999)
    expect(state().toast?.duration).toBe(10_000)
    vi.advanceTimersByTime(1)
    expect(state().toast).toBeNull()
  })

  it('stops the timer while paused and resumes with two seconds left', () => {
    state().showToast('deleted', 'info', {
      action: { label: 'Undo', run: () => {} },
    })

    vi.advanceTimersByTime(1000)
    state().pauseToast()
    vi.advanceTimersByTime(60_000)
    expect(state().toast).not.toBeNull()

    state().resumeToast()
    vi.advanceTimersByTime(1999)
    expect(state().toast).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(state().toast).toBeNull()
  })

  it('ignores a resume when no toast is showing', () => {
    state().resumeToast()

    state().showToast('later', 'info')
    vi.advanceTimersByTime(2200)
    expect(state().toast).toBeNull()
  })

  it('replaces the previous toast and its timer', () => {
    state().showToast('first', 'danger')
    vi.advanceTimersByTime(4000)
    state().showToast('second', 'success')

    vi.advanceTimersByTime(1799)
    expect(state().toast?.message).toBe('second')
    vi.advanceTimersByTime(1)
    expect(state().toast).toBeNull()
  })
})
