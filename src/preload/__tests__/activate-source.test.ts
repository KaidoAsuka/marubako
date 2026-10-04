// The panel is told who brought it up (the global shortcut or anything else): the first-run card
// ticks its shortcut line on the first kind only.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { QuickLaunchApi } from '../../shared/preload-api'

const bridge = vi.hoisted(() => ({
  api: undefined as unknown,
  listeners: new Map<string, (...args: unknown[]) => void>(),
  removed: [] as string[],
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: unknown) => {
      bridge.api = api
    },
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      bridge.listeners.set(channel, listener)
    },
    removeListener: (channel: string) => {
      bridge.removed.push(channel)
      bridge.listeners.delete(channel)
    },
  },
}))

beforeEach(async () => {
  bridge.listeners.clear()
  bridge.removed.length = 0
  vi.resetModules()
  await import('../index')
})

describe('onActivate', () => {
  const send = (...args: unknown[]) =>
    bridge.listeners.get(IPC_CHANNELS.activateLauncher)!({}, ...args)

  it('passes "hotkey" on, and nothing else but "other"', () => {
    const callback = vi.fn()
    ;(bridge.api as QuickLaunchApi).onActivate(callback)

    send('hotkey')
    send('other')
    send()
    send({ evil: true })
    send('Hotkey')

    expect(callback.mock.calls).toEqual([
      ['hotkey'],
      ['other'],
      ['other'],
      ['other'],
      ['other'],
    ])
  })

  it('stops listening when unsubscribed', () => {
    const unsubscribe = (bridge.api as QuickLaunchApi).onActivate(vi.fn())

    unsubscribe()

    expect(bridge.removed).toEqual([IPC_CHANNELS.activateLauncher])
  })
})
