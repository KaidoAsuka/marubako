import { useEffect, useState } from 'react'

// Keep the final content visible for the exit animation, while callers disable
// interaction and release focus immediately. Reopening cancels pending removal.
export function usePresenceSnapshot<T>(value: T | null) {
  const [state, setState] = useState({ value, snapshot: value, revision: 0 })

  if (value !== state.value) {
    setState({
      value,
      snapshot: value ?? state.snapshot,
      revision:
        value !== null && state.value === null
          ? state.revision + 1
          : state.revision,
    })
  }

  useEffect(() => {
    if (value !== null) return

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const remove = () =>
      setState((current) =>
        current.value === null ? { ...current, snapshot: null } : current
      )

    const duration = getComputedStyle(document.documentElement)
      .getPropertyValue('--motion-fast')
      .trim()
    const milliseconds = duration.endsWith('ms')
      ? parseFloat(duration)
      : parseFloat(duration) * 1000
    const timer = window.setTimeout(
      remove,
      media.matches
        ? 0
        : (Number.isFinite(milliseconds) ? milliseconds : 120) + 32
    )
    const onPreferenceChange = () => {
      if (media.matches) remove()
    }
    media.addEventListener('change', onPreferenceChange)
    return () => {
      window.clearTimeout(timer)
      media.removeEventListener('change', onPreferenceChange)
    }
  }, [value])

  return {
    snapshot: value ?? state.snapshot,
    exiting: value === null,
    revision: state.revision,
  }
}
