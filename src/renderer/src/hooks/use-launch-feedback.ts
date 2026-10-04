import { useCallback, useEffect, useRef, useState } from 'react'

export type LaunchState = 'idle' | 'launching' | 'failed'

/**
 * How long a card answers a click with "sent", and how long it swallows another click. The target
 * program takes a moment to appear, and a Windows double-click would otherwise open it twice.
 * motion.css draws its confirmation ring for the same time (`launchRing`): keep the two equal.
 */
export const LAUNCH_WINDOW_MS = 600
/** How long a failed launch keeps its red outline. */
export const LAUNCH_FAILED_MS = 1200

/**
 * Per-card feedback for opening an entry. The state goes on the card as `data-launch`.
 *
 * - A click answers at once (`launching`), before the main process has said anything, and
 *   further clicks are swallowed until the window is over.
 * - A launch that reports failure turns the card `failed` for 1.2 seconds. A click during that
 *   time is a retry and is let through: the problem may already be fixed.
 */
export function useLaunchFeedback(): {
  state: LaunchState
  /** Runs `open` for a click and returns whether it ran: false when the click was swallowed. */
  launch: (open: () => Promise<boolean>) => Promise<boolean>
} {
  const [state, setState] = useState<LaunchState>('idle')
  const phase = useRef<LaunchState>('idle')
  const timer = useRef<number | undefined>(undefined)
  const alive = useRef(true)

  const settle = useCallback((next: LaunchState) => {
    phase.current = next
    setState(next)
  }, [])

  useEffect(() => {
    alive.current = true

    return () => {
      alive.current = false
      window.clearTimeout(timer.current)
    }
  }, [])

  const launch = useCallback(
    async (open: () => Promise<boolean>): Promise<boolean> => {
      if (phase.current === 'launching') return false

      window.clearTimeout(timer.current)
      const startedAt = Date.now()
      settle('launching')

      const opened = await open().catch(() => false)
      if (!alive.current) return true

      window.clearTimeout(timer.current)
      if (opened) {
        const remaining = Math.max(
          0,
          LAUNCH_WINDOW_MS - (Date.now() - startedAt)
        )
        timer.current = window.setTimeout(() => settle('idle'), remaining)
      } else {
        settle('failed')
        timer.current = window.setTimeout(
          () => settle('idle'),
          LAUNCH_FAILED_MS
        )
      }

      return true
    },
    [settle]
  )

  return { state, launch }
}
