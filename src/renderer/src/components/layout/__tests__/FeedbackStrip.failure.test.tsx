import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import { useAppStore } from '../../../store/use-app-store'
import FeedbackStrip from '../FeedbackStrip'

const state = () => useAppStore.getState()
const strip = () => screen.getByTestId('feedback-strip')

// An entry that would not open: a failure with a button. It is still a failure (red), unlike the
// "Deleted, Undo" message, which is neutral.
describe('FeedbackStrip with a failure that offers a button', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    })
    const data = createDefaultAppData()
    data.prefs.lang = 'en'
    useAppStore.setState({
      data,
      dataStatus: { writeError: null, notices: [] },
      toast: null,
    })
    state().clearToast()
  })

  afterEach(() => {
    cleanup()
    state().clearToast()
    vi.useRealTimers()
  })

  it('keeps the red kind of a failure and shows its button', () => {
    render(<FeedbackStrip />)
    const run = vi.fn()

    act(() => {
      state().showToast('Can’t find “Designs”', 'danger', {
        action: { label: 'Edit', run },
        duration: 12_000,
      })
    })

    expect(strip()).toHaveAttribute('data-kind', 'danger')
    expect(strip()).toHaveAttribute('data-open', 'true')
    fireEvent.click(screen.getByTestId('feedback-action'))
    expect(run).toHaveBeenCalledTimes(1)
    expect(state().toast).toBeNull()
  })

  it('stays for the duration it was given, not the short one of a plain message', () => {
    render(<FeedbackStrip />)

    act(() => {
      state().showToast('Can’t find “Designs”', 'danger', {
        action: { label: 'Edit', run: () => {} },
        duration: 12_000,
      })
    })
    act(() => {
      vi.advanceTimersByTime(11_000)
    })
    expect(state().toast?.message).toBe('Can’t find “Designs”')

    act(() => {
      vi.advanceTimersByTime(1_500)
    })
    expect(state().toast).toBeNull()
  })

  it('still draws a message with a button that is not a failure as the neutral kind', () => {
    render(<FeedbackStrip />)

    act(() => {
      state().showToast('Deleted “x”', 'info', {
        action: { label: 'Undo', run: () => {} },
      })
    })

    expect(strip()).toHaveAttribute('data-kind', 'undo')
  })
})
