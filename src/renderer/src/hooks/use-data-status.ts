import { useEffect } from 'react'

import { useAppStore } from '../store/use-app-store'

/** Keeps the store's `dataStatus` in sync with the status main pushes whenever it changes. */
export function useDataStatus(): void {
  useEffect(() => {
    const unsubscribe = window.quickLaunch.onDataStatus((dataStatus) => {
      useAppStore.setState({ dataStatus })
    })

    return unsubscribe
  }, [])
}
