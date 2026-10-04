import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { DataStatus } from '../../../../shared/types'
import { useAppStore } from '../use-app-store'

const emptyStatus: DataStatus = { writeError: null, notices: [] }
const failedStatus: DataStatus = {
  writeError: 'EPERM: operation not permitted',
  notices: [{ kind: 'passwordsLost', count: 2 }],
}

describe('data status in the store', () => {
  beforeEach(() => {
    useAppStore.setState({
      data: createDefaultAppData(),
      loading: false,
      saving: false,
      error: null,
      dataStatus: emptyStatus,
      currentTab: 'folders',
      toast: null,
    })
    vi.clearAllMocks()
  })

  it('stores the status returned by refreshDataStatus', async () => {
    vi.mocked(window.quickLaunch.getDataStatus).mockResolvedValueOnce({
      ok: true,
      data: failedStatus,
    })

    await useAppStore.getState().refreshDataStatus()

    expect(useAppStore.getState().dataStatus).toEqual(failedStatus)
  })

  it('keeps the previous status when reading it fails', async () => {
    useAppStore.setState({ dataStatus: failedStatus })
    vi.mocked(window.quickLaunch.getDataStatus).mockResolvedValueOnce({
      ok: false,
      error: 'nope',
    })
    await useAppStore.getState().refreshDataStatus()
    expect(useAppStore.getState().dataStatus).toEqual(failedStatus)

    vi.mocked(window.quickLaunch.getDataStatus).mockRejectedValueOnce(
      new Error('ipc closed')
    )
    await expect(
      useAppStore.getState().refreshDataStatus()
    ).resolves.toBeUndefined()
    expect(useAppStore.getState().dataStatus).toEqual(failedStatus)
  })

  it('reads the status once loading the data succeeded', async () => {
    vi.mocked(window.quickLaunch.getDataStatus).mockResolvedValueOnce({
      ok: true,
      data: {
        writeError: null,
        notices: [{ kind: 'passwordsLost', count: 1 }],
      },
    })

    await useAppStore.getState().loadData()

    expect(window.quickLaunch.getDataStatus).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().dataStatus.notices).toEqual([
      { kind: 'passwordsLost', count: 1 },
    ])
  })

  it('does not read the status when loading the data failed', async () => {
    vi.mocked(window.quickLaunch.loadData).mockResolvedValueOnce({
      ok: false,
      error: 'unreadable',
    })

    await useAppStore.getState().loadData()

    expect(window.quickLaunch.getDataStatus).not.toHaveBeenCalled()
  })

  it('dismisses a notice through the bridge and keeps the returned status', async () => {
    useAppStore.setState({ dataStatus: failedStatus })
    vi.mocked(window.quickLaunch.dismissDataNotice).mockResolvedValueOnce({
      ok: true,
      data: { writeError: failedStatus.writeError, notices: [] },
    })

    await useAppStore.getState().dismissNotice('passwordsLost')

    expect(window.quickLaunch.dismissDataNotice).toHaveBeenCalledWith(
      'passwordsLost'
    )
    expect(useAppStore.getState().dataStatus).toEqual({
      writeError: failedStatus.writeError,
      notices: [],
    })
  })

  it('reports a failed dismissal without touching the status', async () => {
    useAppStore.setState({ dataStatus: failedStatus })
    vi.mocked(window.quickLaunch.dismissDataNotice).mockResolvedValueOnce({
      ok: false,
      error: 'cannot dismiss',
    })

    await useAppStore.getState().dismissNotice('passwordsLost')

    expect(useAppStore.getState().dataStatus).toEqual(failedStatus)
    expect(useAppStore.getState().toast).toEqual({
      message: 'cannot dismiss',
      tone: 'danger',
    })
  })

  it('clears the write error when a retry succeeds and keeps it when it fails again', async () => {
    useAppStore.setState({ dataStatus: failedStatus })

    await useAppStore.getState().retryDataSave()
    expect(window.quickLaunch.retryDataSave).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().dataStatus).toEqual(emptyStatus)

    vi.mocked(window.quickLaunch.retryDataSave).mockResolvedValueOnce({
      ok: true,
      data: failedStatus,
    })
    await useAppStore.getState().retryDataSave()
    expect(useAppStore.getState().dataStatus.writeError).toBe(
      failedStatus.writeError
    )
  })

  it('reports a retry that could not even be started', async () => {
    useAppStore.setState({ dataStatus: failedStatus })
    vi.mocked(window.quickLaunch.retryDataSave).mockResolvedValueOnce({
      ok: false,
      error: 'retry unavailable',
    })

    await useAppStore.getState().retryDataSave()

    expect(useAppStore.getState().dataStatus).toEqual(failedStatus)
    expect(useAppStore.getState().toast?.message).toBe('retry unavailable')
  })

  it('does not clear a disk write error when a later edit succeeds', async () => {
    useAppStore.setState({ dataStatus: failedStatus })

    await useAppStore.getState().updateData((draft) => {
      draft.prefs.zoom = 1.1
    })

    const state = useAppStore.getState()
    expect(window.quickLaunch.saveData).toHaveBeenCalledTimes(1)
    expect(state.error).toBeNull()
    expect(state.dataStatus.writeError).toBe(failedStatus.writeError)
  })

  it('still rolls the edit back when saving is rejected outright', async () => {
    const before = useAppStore.getState().data
    vi.mocked(window.quickLaunch.saveData).mockResolvedValueOnce({
      ok: false,
      error: 'rejected',
    })

    await useAppStore.getState().updateData((draft) => {
      draft.prefs.zoom = 1.2
    })

    const state = useAppStore.getState()
    expect(state.data).toBe(before)
    expect(state.error).toBe('rejected')
    expect(state.dataStatus).toEqual(emptyStatus)
  })

  it('does not say "saved" while the last write to disk failed', async () => {
    useAppStore.setState({ dataStatus: failedStatus })

    await useAppStore
      .getState()
      .updateData((draft) => void (draft.prefs.theme = 'light'), {
        successMessage: 'Saved',
      })

    expect(useAppStore.getState().toast).toBeNull()
  })

  it('says "saved" when nothing is wrong', async () => {
    await useAppStore
      .getState()
      .updateData((draft) => void (draft.prefs.theme = 'light'), {
        successMessage: 'Saved',
      })

    expect(useAppStore.getState().toast).toMatchObject({
      message: 'Saved',
      tone: 'success',
    })
  })
})
