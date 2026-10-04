import { IconWarning } from './icons'
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
  detail: string
  retryLabel: string
  title: string
  /** Extra class for the fallback, e.g. to give it an opaque background at the root. */
  fallbackClassName?: string
  /** Replaces the default "clear the error and render again" retry, e.g. with a window reload. */
  onRetry?: () => void
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

type ErrorBoundaryState = {
  hasError: boolean
  errorMessage: string | null
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Renderer error boundary caught an error.', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = (): void => {
    if (this.props.onRetry) {
      this.props.onRetry()
      return
    }

    this.setState({
      hasError: false,
      errorMessage: null,
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className={
            this.props.fallbackClassName
              ? `empty-state ${this.props.fallbackClassName}`
              : 'empty-state'
          }
          data-testid="error-boundary-fallback"
          role="alert"
        >
          <div className="empty-state-illustration tone-danger">
            <IconWarning aria-hidden="true" size={20} />
          </div>
          <div className="empty-state-title tone-danger">
            {this.props.title}
          </div>
          <div className="empty-state-description">{this.props.detail}</div>
          {this.state.errorMessage ? (
            <div
              className="empty-state-description"
              data-testid="error-boundary-message"
            >
              {this.state.errorMessage}
            </div>
          ) : null}
          <button
            className="primary-button danger"
            type="button"
            onClick={this.handleRetry}
          >
            {this.props.retryLabel}
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
