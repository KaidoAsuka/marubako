import { useCallback, useEffect, useRef, useState } from 'react'

/** How long a button that was just used to copy stays in its "copied" state. */
export const COPY_FEEDBACK_MS = 1200

/**
 * Feedback for a copy button, on the button itself: `copied` is true for 1.2 seconds after
 * `mark()`. Copying again while it is still showing starts the second confirmation from scratch,
 * and `count` goes up each time so the caller can restart the tick's entrance.
 */
export function useCopyFeedback(
  duration = COPY_FEEDBACK_MS
): [copied: boolean, mark: () => void, count: number] {
  const [state, setState] = useState({ copied: false, count: 0 })
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const mark = useCallback(() => {
    window.clearTimeout(timer.current)
    setState((current) => ({ copied: true, count: current.count + 1 }))
    timer.current = window.setTimeout(
      () => setState((current) => ({ ...current, copied: false })),
      duration
    )
  }, [duration])

  return [state.copied, mark, state.count]
}
