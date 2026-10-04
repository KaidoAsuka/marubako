import type { ReactNode } from 'react'

import type { Lang } from '../../../../shared/types'
import { translations } from '../../i18n/translations'
import ErrorBoundary from './ErrorBoundary'

// No store data exists at the root, so the language comes from the browser instead of prefs.
function languageFromNavigator(): Lang {
  const code = navigator.language.toLowerCase()
  if (code.startsWith('zh')) return 'zh'
  if (code.startsWith('ja')) return 'ja'
  return 'en'
}

type Props = {
  children: ReactNode
  /** The dock window is a tiny bubble, so only the retry button is shown there. */
  compact?: boolean
}

/** Last line of defence: a render failure shows a visible message instead of an empty transparent window. */
export default function RootErrorBoundary({
  children,
  compact = false,
}: Props): JSX.Element {
  const strings = translations[languageFromNavigator()].strings

  return (
    <ErrorBoundary
      detail={strings['errorBoundary.detail'] ?? ''}
      fallbackClassName={`root-error-fallback${compact ? ' root-error-compact' : ''}`}
      retryLabel={strings['errorBoundary.retry'] ?? 'Retry'}
      title={strings['errorBoundary.title'] ?? ''}
      onRetry={() => window.location.reload()}
    >
      {children}
    </ErrorBoundary>
  )
}
