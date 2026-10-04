import { useEffect, useState } from 'react'

import type { ShortcutCheckResult } from '../../../shared/types'

/** What trying a shortcut on the system found out: a verdict, or that the question could not be asked. */
export type ShortcutCheck =
  | { accelerator: string; state: 'checking' }
  | { accelerator: string; state: 'done'; result: ShortcutCheckResult }
  | { accelerator: string; state: 'failed' }

type Answer = {
  accelerator: string
  result: ShortcutCheckResult | null
}

/**
 * Tries a launch shortcut chosen in the settings against the operating system (through the main
 * process), so a combination another program holds is found out when it is chosen and not after Save.
 * Only a combination different from the saved one is tried: the saved one is the one the app holds.
 * `blocked` is true while the choice cannot be saved: it is being checked, or it is taken.
 */
export function useShortcutCheck(
  accelerator: string,
  enabled: boolean,
  savedAccelerator: string
): { check: ShortcutCheck | null; blocked: boolean } {
  // The last answer that came back, and for which combination. An answer for an earlier choice is
  // simply not the answer for this one.
  const [answer, setAnswer] = useState<Answer | null>(null)
  const changed = enabled && accelerator !== savedAccelerator

  useEffect(() => {
    if (!changed) return undefined
    let current = true
    const remember = (result: ShortcutCheckResult | null) => {
      if (current) setAnswer({ accelerator, result })
    }
    void window.quickLaunch
      .checkShortcut(accelerator)
      .then((reply) => remember(reply.ok ? reply.data : null))
      .catch(() => remember(null))

    return () => {
      current = false
    }
  }, [changed, accelerator])

  if (!changed) return { check: null, blocked: false }
  const own = answer?.accelerator === accelerator ? answer : null
  const check: ShortcutCheck =
    own === null
      ? { accelerator, state: 'checking' }
      : own.result === null
        ? { accelerator, state: 'failed' }
        : { accelerator, state: 'done', result: own.result }
  const blocked =
    check.state === 'checking' ||
    (check.state === 'done' && check.result.status === 'taken')

  return { check, blocked }
}
