import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ErrorBoundary from '../ErrorBoundary'

function ThrowingChild(): JSX.Element {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders a fallback when a child throws during render', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      return
    })

    render(
      <ErrorBoundary
        detail="Please restart the window."
        retryLabel="Retry"
        title="Render error"
      >
        <ThrowingChild />
      </ErrorBoundary>
    )

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument()
    expect(screen.getByText('Render error')).toBeInTheDocument()
    expect(screen.getByText('Please restart the window.')).toBeInTheDocument()
    expect(screen.getByTestId('error-boundary-message')).toHaveTextContent(
      'boom'
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('retries rendering children after the error state is cleared', () => {
    let shouldThrow = true
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      return
    })

    function FlakyChild(): JSX.Element {
      if (shouldThrow) {
        throw new Error('temporary failure')
      }

      return <div>Recovered</div>
    }

    render(
      <ErrorBoundary
        detail="Please restart the window."
        retryLabel="Retry"
        title="Render error"
      >
        <FlakyChild />
      </ErrorBoundary>
    )

    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(screen.getByText('Recovered')).toBeInTheDocument()
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('adds the fallback class and lets the caller replace the retry action', () => {
    const onRetry = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => {
      return
    })

    render(
      <ErrorBoundary
        detail="Please restart the window."
        fallbackClassName="root-error-fallback"
        retryLabel="Retry"
        title="Render error"
        onRetry={onRetry}
      >
        <ThrowingChild />
      </ErrorBoundary>
    )

    expect(screen.getByTestId('error-boundary-fallback')).toHaveClass(
      'empty-state',
      'root-error-fallback'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument()
  })
})
