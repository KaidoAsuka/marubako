import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DataStatus } from '../../../../shared/types'
import { useAppStore } from '../../store/use-app-store'
import { useDataStatus } from '../use-data-status'

describe('useDataStatus', () => {
  let push: (status: DataStatus) => void
  const unsubscribe = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({ dataStatus: { writeError: null, notices: [] } })
    vi.mocked(window.quickLaunch.onDataStatus).mockImplementation(
      (callback) => {
        push = callback
        return unsubscribe
      }
    )
  })

  it('copies every status pushed by the main process into the store', () => {
    renderHook(useDataStatus)

    act(() => {
      push({ writeError: 'disk full', notices: [] })
    })
    expect(useAppStore.getState().dataStatus.writeError).toBe('disk full')

    act(() => {
      push({
        writeError: null,
        notices: [{ kind: 'passwordsLost', count: 3 }],
      })
    })
    expect(useAppStore.getState().dataStatus).toEqual({
      writeError: null,
      notices: [{ kind: 'passwordsLost', count: 3 }],
    })
  })

  it('stops listening when the app unmounts', () => {
    const { unmount } = renderHook(useDataStatus)
    expect(window.quickLaunch.onDataStatus).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
