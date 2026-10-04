import { useEffect, useState } from 'react'

const QUERY = '(prefers-color-scheme: dark)'

function readSystemDark(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY).matches
    : false
}

/**
 * Whether Windows is in its dark mode, kept up to date: the theme setting "follow the system" is
 * drawn from this, and the interface changes with Windows without a restart.
 */
export function useSystemDark(): boolean {
  const [dark, setDark] = useState(readSystemDark)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia(QUERY)
    const update = () => setDark(media.matches)
    update()
    media.addEventListener('change', update)

    return () => media.removeEventListener('change', update)
  }, [])

  return dark
}
