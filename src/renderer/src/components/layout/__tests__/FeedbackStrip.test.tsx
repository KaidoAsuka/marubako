import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../../shared/default-data'
import type { DataStatus } from '../../../../../shared/types'
import { useAppStore } from '../../../store/use-app-store'
import FeedbackStrip from '../FeedbackStrip'

const state = () => useAppStore.getState()
const strip = () => screen.getByTestId('feedback-strip')
const noStatus: DataStatus = { writeError: null, notices: [] }

function setWriteError(writeError: string | null): void {
  act(() => {
    useAppStore.setState({ dataStatus: { writeError, notices: [] } })
  })
}

describe('FeedbackStrip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    // jsdom has no matchMedia; the presence snapshot uses it to respect reduced motion.
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
    useAppStore.setState({ data, dataStatus: noStatus, toast: null })
    state().clearToast()
  })

  afterEach(() => {
    cleanup()
    state().clearToast()
    useAppStore.setState({ dataStatus: noStatus })
    vi.useRealTimers()
  })

  describe('with nothing to say', () => {
    it('is closed and empty, with no button to tab to', () => {
      render(<FeedbackStrip />)

      expect(strip()).not.toHaveAttribute('data-open')
      expect(strip()).not.toHaveAttribute('data-kind')
      expect(strip()).toHaveTextContent('')
      expect(screen.queryByRole('button')).toBeNull()
    })

    it('keeps a polite live region in the page for the messages to come', () => {
      render(<FeedbackStrip />)

      const region = screen.getByRole('status')
      expect(region).toHaveAttribute('aria-live', 'polite')
      expect(region).toBeEmptyDOMElement()
    })
  })

  describe('messages', () => {
    it.each([
      ['info', 'info'],
      ['success', 'success'],
      ['danger', 'danger'],
    ] as const)('shows a %s message in a strip of that kind', (tone, kind) => {
      render(<FeedbackStrip />)
      act(() => state().showToast('Something happened', tone))

      expect(strip()).toHaveAttribute('data-open', 'true')
      expect(strip()).toHaveAttribute('data-kind', kind)
      expect(screen.getByRole('status')).toHaveTextContent('Something happened')
      expect(screen.queryByRole('button')).toBeNull()
    })

    it('goes away after its time and keeps the words on screen while it closes', () => {
      render(<FeedbackStrip />)
      act(() => state().showToast('Export finished', 'success'))

      act(() => {
        vi.advanceTimersByTime(1800)
      })
      expect(strip()).not.toHaveAttribute('data-open')
      // Closing takes a moment; an empty strip shrinking would look like a glitch.
      expect(strip()).toHaveTextContent('Export finished')

      act(() => {
        vi.advanceTimersByTime(300)
      })
      expect(strip()).toHaveTextContent('')
    })

    it('reuses one live region for every message, so a change of text is announced', () => {
      render(<FeedbackStrip />)
      const region = screen.getByRole('status')

      act(() => state().showToast('First', 'info'))
      expect(screen.getByRole('status')).toBe(region)
      act(() => state().showToast('Second', 'info'))
      expect(screen.getByRole('status')).toBe(region)
      expect(region).toHaveTextContent('Second')
    })

    it('carries the whole text in its title, for a message cut off at two lines', () => {
      render(<FeedbackStrip />)
      const long =
        'ENOENT: no such file or directory, open C:\\a\\very\\long\\path'
      act(() => state().showToast(long, 'danger'))

      expect(screen.getByRole('status')).toHaveAttribute('title', long)
    })
  })

  describe('an undo message', () => {
    it('renders the action as a real button and runs it once, closing the strip', () => {
      const run = vi.fn()
      render(<FeedbackStrip />)
      act(() =>
        state().showToast('Deleted', 'info', { action: { label: 'Undo', run } })
      )

      expect(strip()).toHaveAttribute('data-kind', 'undo')
      const button = screen.getByRole('button', { name: 'Undo' })
      expect(button.tagName).toBe('BUTTON')
      expect(button).toHaveAttribute('type', 'button')
      expect(button).toHaveClass('feedback-action')

      fireEvent.click(button)

      expect(run).toHaveBeenCalledTimes(1)
      expect(state().toast).toBeNull()
      expect(strip()).not.toHaveAttribute('data-open')
    })

    it('stays six seconds when left alone', () => {
      render(<FeedbackStrip />)
      act(() =>
        state().showToast('Deleted', 'info', {
          action: { label: 'Undo', run: () => {} },
        })
      )

      act(() => {
        vi.advanceTimersByTime(5999)
      })
      expect(strip()).toHaveAttribute('data-open', 'true')
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(strip()).not.toHaveAttribute('data-open')
    })

    it('keeps absorbing clicks for half a second after the button was used', () => {
      render(<FeedbackStrip />)
      expect(screen.queryByTestId('feedback-shield')).toBeNull()
      act(() =>
        state().showToast('Deleted', 'info', {
          action: { label: 'Undo', run: () => {} },
        })
      )

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

      // The strip is closing, yet the spot still takes the second click of a double-click.
      expect(strip()).not.toHaveAttribute('data-open')
      const shield = screen.getByTestId('feedback-shield')
      expect(shield).toHaveAttribute('aria-hidden', 'true')
      act(() => {
        vi.advanceTimersByTime(499)
      })
      expect(screen.getByTestId('feedback-shield')).toBe(shield)
      act(() => {
        vi.advanceTimersByTime(2)
      })
      expect(screen.queryByTestId('feedback-shield')).toBeNull()
    })

    it('pauses the countdown while hovered and resumes with two seconds left', () => {
      render(<FeedbackStrip />)
      act(() =>
        state().showToast('Deleted', 'info', {
          action: { label: 'Undo', run: () => {} },
        })
      )
      const body = screen.getByText('Deleted').closest('.feedback-body')!

      act(() => {
        vi.advanceTimersByTime(3000)
      })
      fireEvent.mouseEnter(body)
      act(() => {
        vi.advanceTimersByTime(30_000)
      })
      expect(state().toast).not.toBeNull()

      fireEvent.mouseLeave(body)
      act(() => {
        vi.advanceTimersByTime(1999)
      })
      expect(state().toast).not.toBeNull()
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(state().toast).toBeNull()
    })

    it('pauses the countdown while the button has keyboard focus', () => {
      render(<FeedbackStrip />)
      act(() =>
        state().showToast('Deleted', 'info', {
          action: { label: 'Undo', run: () => {} },
        })
      )
      const button = screen.getByRole('button', { name: 'Undo' })

      act(() => {
        button.focus()
      })
      act(() => {
        vi.advanceTimersByTime(30_000)
      })
      expect(state().toast).not.toBeNull()

      act(() => {
        button.blur()
      })
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(state().toast).toBeNull()
    })
  })

  describe('a failed disk write', () => {
    it('stays as an alert with a Retry button until the write works again', () => {
      render(<FeedbackStrip />)
      setWriteError('EPERM: access denied')

      expect(strip()).toHaveAttribute('data-open', 'true')
      expect(strip()).toHaveAttribute('data-kind', 'error')
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(
        'Disk write failed: Your latest changes are NOT saved yet. EPERM: access denied'
      )
      expect(screen.getByTestId('feedback-retry')).toHaveTextContent('Retry')

      // Persistent: no timer takes it away.
      act(() => {
        vi.advanceTimersByTime(120_000)
      })
      expect(strip()).toHaveAttribute('data-open', 'true')

      setWriteError(null)
      expect(strip()).not.toHaveAttribute('data-open')
    })

    it('retries on demand, and keeps the error when the retry fails again', async () => {
      vi.mocked(window.quickLaunch.retryDataSave).mockResolvedValueOnce({
        ok: true,
        data: { writeError: 'still disk full', notices: [] },
      })
      render(<FeedbackStrip />)
      setWriteError('disk full')

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      })

      expect(window.quickLaunch.retryDataSave).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('alert')).toHaveTextContent('still disk full')
      expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
    })

    it('goes away when the retry works', async () => {
      render(<FeedbackStrip />)
      setWriteError('disk full')

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      })

      expect(window.quickLaunch.retryDataSave).toHaveBeenCalledTimes(1)
      expect(strip()).not.toHaveAttribute('data-open')
    })

    it('cannot be retried twice at once', async () => {
      let finish: (value: unknown) => void = () => {}
      vi.mocked(window.quickLaunch.retryDataSave).mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }) as never
      )
      render(<FeedbackStrip />)
      setWriteError('disk full')

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled()

      await act(async () => {
        finish({ ok: true, data: { writeError: 'disk full', notices: [] } })
      })
      expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
    })

    it('puts the click shield up after a retry too, whether or not it worked', async () => {
      vi.mocked(window.quickLaunch.retryDataSave).mockResolvedValueOnce({
        ok: true,
        data: { writeError: 'disk full', notices: [] },
      })
      render(<FeedbackStrip />)
      setWriteError('disk full')

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      })

      // The error is still open, but a second click of a double-click must not land on a Retry
      // button that has just been replaced under the pointer.
      expect(strip()).toHaveAttribute('data-open', 'true')
      expect(screen.getByTestId('feedback-shield')).toBeInTheDocument()
    })
  })

  describe('a message and a failed write together', () => {
    it('shows the message while it lasts and the error again afterwards', () => {
      render(<FeedbackStrip />)
      setWriteError('disk full')
      expect(strip()).toHaveAttribute('data-kind', 'error')

      act(() =>
        state().showToast('Deleted', 'info', {
          action: { label: 'Undo', run: () => {} },
        })
      )
      expect(strip()).toHaveAttribute('data-kind', 'undo')
      expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
      expect(screen.queryByRole('alert')).toBeNull()

      act(() => {
        vi.advanceTimersByTime(6000)
      })
      expect(strip()).toHaveAttribute('data-open', 'true')
      expect(strip()).toHaveAttribute('data-kind', 'error')
      expect(screen.getByRole('alert')).toHaveTextContent('disk full')
    })

    it('does not close between the two', () => {
      render(<FeedbackStrip />)
      setWriteError('disk full')
      act(() => state().showToast('Copied', 'info'))

      act(() => {
        vi.advanceTimersByTime(2200)
      })

      expect(strip()).toHaveAttribute('data-open', 'true')
    })
  })

  it('speaks the language of the data', () => {
    const data = createDefaultAppData()
    data.prefs.lang = 'zh'
    useAppStore.setState({ data })
    render(<FeedbackStrip />)
    setWriteError('disk full')

    expect(screen.getByRole('alert')).toHaveTextContent(
      '磁盘写入失败：最新的修改尚未保存。 disk full'
    )
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })
})
