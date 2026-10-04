import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import RootErrorBoundary from '../RootErrorBoundary'

function ThrowingChild(): JSX.Element {
  throw new Error('prefs exploded')
}

function renderBroken(compact = false): void {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  render(
    <RootErrorBoundary compact={compact}>
      <ThrowingChild />
    </RootErrorBoundary>
  )
}

describe('RootErrorBoundary', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders its children when nothing fails', () => {
    render(
      <RootErrorBoundary>
        <p>ready</p>
      </RootErrorBoundary>
    )

    expect(screen.getByText('ready')).toBeInTheDocument()
    expect(screen.queryByTestId('error-boundary-fallback')).toBeNull()
  })

  it('shows a visible message with the failure and an opaque fallback class', () => {
    renderBroken()

    const fallback = screen.getByTestId('error-boundary-fallback')
    expect(fallback).toHaveAttribute('role', 'alert')
    expect(fallback).toHaveClass('root-error-fallback')
    expect(fallback).not.toHaveClass('root-error-compact')
    expect(screen.getByTestId('error-boundary-message')).toHaveTextContent(
      'prefs exploded'
    )
  })

  it('marks the fallback as compact for the dock window', () => {
    renderBroken(true)

    expect(screen.getByTestId('error-boundary-fallback')).toHaveClass(
      'root-error-fallback',
      'root-error-compact'
    )
  })

  it.each([
    ['zh-CN', '渲染异常', '重试'],
    ['ja-JP', 'レンダーエラー', '再試行'],
    ['en-US', 'Render error', 'Retry'],
    ['fr-FR', 'Render error', 'Retry'],
  ])('speaks the browser language %s', (language, title, retry) => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue(language)

    renderBroken()

    expect(screen.getByText(title)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: retry })).toBeInTheDocument()
  })

  it('reloads the window on retry because the failing state would only fail again', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US')
    renderBroken()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(reload).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument()
  })
})
