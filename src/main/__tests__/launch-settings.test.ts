import { beforeEach, describe, expect, it, vi } from 'vitest'

interface LoginItemOptions {
  openAtLogin?: boolean
  args?: string[]
}

const mocks = vi.hoisted(() => {
  // Mirrors the Windows registry: one Run entry that remembers the args it was written with.
  const registry: { openAtLogin: boolean; args: string[] } = {
    openAtLogin: false,
    args: [],
  }
  return {
    registry,
    app: {
      isPackaged: true,
      // Electron on Windows only reports openAtLogin when the args match the stored ones.
      getLoginItemSettings: vi.fn((options?: LoginItemOptions) => {
        const queried = options?.args ?? []
        const matches =
          queried.length === registry.args.length &&
          queried.every((arg, index) => arg === registry.args[index])
        return { openAtLogin: registry.openAtLogin && matches }
      }),
      setLoginItemSettings: vi.fn((options: LoginItemOptions) => {
        registry.openAtLogin = options.openAtLogin ?? false
        registry.args = options.args ?? []
      }),
    },
    // The accelerators other programs hold, and the ones this app holds (Windows gives a
    // combination to one owner only, this app included).
    taken: new Set<string>(),
    held: new Set<string>(),
    register: vi.fn(),
    unregister: vi.fn(),
    toggleMainWindow: vi.fn(async () => {}),
  }
})
mocks.register.mockImplementation((accelerator: string) => {
  if (mocks.taken.has(accelerator) || mocks.held.has(accelerator)) return false
  mocks.held.add(accelerator)
  return true
})
mocks.unregister.mockImplementation((accelerator: string) => {
  mocks.held.delete(accelerator)
})
vi.mock('electron', () => ({
  app: mocks.app,
  globalShortcut: { register: mocks.register, unregister: mocks.unregister },
}))
vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../window-manager', () => ({
  toggleMainWindow: mocks.toggleMainWindow,
}))
import type * as LaunchSettingsModule from '../launch-settings'

let ls: typeof LaunchSettingsModule

const registerCalls = (): string[] =>
  mocks.register.mock.calls.map((call) => call[0] as string)

describe('launch settings', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.app.isPackaged = true
    mocks.registry.openAtLogin = false
    mocks.registry.args = []
    mocks.taken.clear()
    mocks.held.clear()
    // Every test starts a fresh app: the module keeps what it registered.
    vi.resetModules()
    ls = await import('../launch-settings')
  })
  const { setOpenAtLogin, getLaunchSettings } = {
    setOpenAtLogin: (enabled: boolean) => ls.setOpenAtLogin(enabled),
    getLaunchSettings: () => ls.getLaunchSettings(),
  }
  it('registers the global shortcut and calls the window toggle', async () => {
    ls.registerLaunchShortcut()
    expect(mocks.register).toHaveBeenCalledWith(
      ls.LAUNCH_SHORTCUT,
      expect.any(Function)
    )
    const callback = (
      mocks.register.mock.calls[0] as unknown as [string, () => void]
    )[1]
    callback()
    expect(mocks.toggleMainWindow).toHaveBeenCalledOnce()
    expect(getLaunchSettings().shortcutAvailable).toBe(true)
  })
  it('reports shortcut conflicts without crashing', () => {
    mocks.taken.add(ls.LAUNCH_SHORTCUT)
    ls.registerLaunchShortcut()
    expect(getLaunchSettings().shortcutAvailable).toBe(false)
  })
  it('keeps development launches out of Windows login settings', () => {
    mocks.app.isPackaged = false
    expect(getLaunchSettings().canAutoStart).toBe(false)
    expect(() => setOpenAtLogin(true)).toThrow('installed')
    expect(mocks.app.setLoginItemSettings).not.toHaveBeenCalled()
  })
  it.skipIf(process.platform !== 'win32')(
    'starts silently at login when explicitly enabled',
    () => {
      setOpenAtLogin(true)
      expect(mocks.app.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
        args: ['--hidden'],
      })
    }
  )
  it.skipIf(process.platform !== 'win32')(
    'reports the login item as enabled after it was turned on, and disabled after it was turned off',
    () => {
      expect(getLaunchSettings().openAtLogin).toBe(false)
      expect(setOpenAtLogin(true).openAtLogin).toBe(true)
      expect(getLaunchSettings().openAtLogin).toBe(true)
      expect(setOpenAtLogin(false).openAtLogin).toBe(false)
      expect(getLaunchSettings().openAtLogin).toBe(false)
    }
  )
  it.skipIf(process.platform !== 'win32')(
    'reads an entry written by an earlier version with the same arguments',
    () => {
      mocks.registry.openAtLogin = true
      mocks.registry.args = ['--hidden']
      expect(getLaunchSettings().openAtLogin).toBe(true)
    }
  )
  it.skipIf(process.platform !== 'win32')(
    'reads and writes the login item with the same arguments',
    () => {
      setOpenAtLogin(true)
      getLaunchSettings()
      const written = mocks.app.setLoginItemSettings.mock.calls[0]?.[0]
      const read = mocks.app.getLoginItemSettings.mock.calls.at(-1)?.[0]
      expect(read?.args).toEqual(written?.args)
    }
  )
})

describe('the launch shortcut setting', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.taken.clear()
    mocks.held.clear()
    vi.resetModules()
    ls = await import('../launch-settings')
  })

  const config = (shortcut: string, shortcutEnabled = true) => ({
    shortcut,
    shortcutEnabled,
  })

  describe('at start-up', () => {
    it('registers the configured shortcut and reports it as it reads to the user', () => {
      ls.registerLaunchShortcut(config('CommandOrControl+Alt+Q'))

      expect(registerCalls()).toEqual(['CommandOrControl+Alt+Q'])
      expect(ls.getLaunchSettings()).toMatchObject({
        shortcut: 'Ctrl + Alt + Q',
        shortcutAccelerator: 'CommandOrControl+Alt+Q',
        shortcutAvailable: true,
        shortcutEnabled: true,
      })
    })

    it('does not fall back to another combination when the configured one is taken', () => {
      mocks.taken.add('CommandOrControl+Alt+Space')

      ls.registerLaunchShortcut(config('CommandOrControl+Alt+Space'))

      // Only the choice was tried: the old fallbacks (Ctrl+Shift+Space, Ctrl+Alt+Q) took keys
      // away from other programs without the user knowing.
      expect(registerCalls()).toEqual(['CommandOrControl+Alt+Space'])
      expect(ls.getLaunchSettings()).toMatchObject({
        shortcut: 'Ctrl + Alt + Space',
        shortcutAvailable: false,
        shortcutEnabled: true,
      })
      expect(mocks.held.size).toBe(0)
    })

    it('registers nothing when the shortcut is switched off, and still says which one it is', () => {
      ls.registerLaunchShortcut(config('CommandOrControl+Alt+Q', false))

      expect(mocks.register).not.toHaveBeenCalled()
      expect(ls.getLaunchSettings()).toMatchObject({
        shortcut: 'Ctrl + Alt + Q',
        shortcutAvailable: false,
        shortcutEnabled: false,
      })
    })

    it('uses the default for a stored shortcut that is not an acceptable one', () => {
      ls.registerLaunchShortcut(config('Ctrl+K'))

      expect(registerCalls()).toEqual(['CommandOrControl+Alt+Space'])
    })

    it('defaults to Ctrl+Alt+Space switched on', () => {
      ls.registerLaunchShortcut()

      expect(registerCalls()).toEqual(['CommandOrControl+Alt+Space'])
      expect(ls.getLaunchSettings().shortcutEnabled).toBe(true)
    })

    it('survives Electron refusing an accelerator by throwing', () => {
      mocks.register.mockImplementationOnce(() => {
        throw new Error('Error processing argument at index 0')
      })

      ls.registerLaunchShortcut(config('CommandOrControl+Alt+Space'))

      expect(ls.getLaunchSettings().shortcutAvailable).toBe(false)
    })
  })

  describe('changing it', () => {
    it('lets go of the old combination and takes the new one, and nothing else', () => {
      ls.registerLaunchShortcut(config('CommandOrControl+Alt+Space'))
      mocks.held.add('Ctrl+Something+Else') // another registration of this app

      const settings = ls.applyLaunchShortcut(config('CommandOrControl+Alt+Q'))

      expect(mocks.unregister).toHaveBeenCalledTimes(1)
      expect(mocks.unregister).toHaveBeenCalledWith(
        'CommandOrControl+Alt+Space'
      )
      expect(mocks.held.has('CommandOrControl+Alt+Q')).toBe(true)
      expect(mocks.held.has('CommandOrControl+Alt+Space')).toBe(false)
      expect(mocks.held.has('Ctrl+Something+Else')).toBe(true)
      expect(settings).toMatchObject({
        shortcut: 'Ctrl + Alt + Q',
        shortcutAvailable: true,
      })
    })

    it('does not register again for a save that changed something else', () => {
      ls.registerLaunchShortcut(config('CommandOrControl+Alt+Space'))
      mocks.register.mockClear()
      mocks.unregister.mockClear()

      ls.applyLaunchShortcut(config('CommandOrControl+Alt+Space'))
      ls.applyLaunchShortcut(config('Ctrl+Alt+Space')) // the same, spelled differently

      expect(mocks.register).not.toHaveBeenCalled()
      expect(mocks.unregister).not.toHaveBeenCalled()
    })

    it('lets go of the shortcut when it is switched off, and takes it again when it is switched on', () => {
      ls.registerLaunchShortcut(config('CommandOrControl+Alt+Space'))

      expect(
        ls.applyLaunchShortcut(config('CommandOrControl+Alt+Space', false))
      ).toMatchObject({ shortcutAvailable: false, shortcutEnabled: false })
      expect(mocks.held.size).toBe(0)

      expect(
        ls.applyLaunchShortcut(config('CommandOrControl+Alt+Space'))
      ).toMatchObject({ shortcutAvailable: true, shortcutEnabled: true })
      expect(mocks.held.has('CommandOrControl+Alt+Space')).toBe(true)
    })

    it('reports a combination that turned out to be taken, with nothing registered', () => {
      ls.registerLaunchShortcut(config('CommandOrControl+Alt+Space'))
      mocks.taken.add('CommandOrControl+Alt+Q')

      const settings = ls.applyLaunchShortcut(config('CommandOrControl+Alt+Q'))

      expect(settings).toMatchObject({
        shortcut: 'Ctrl + Alt + Q',
        shortcutAvailable: false,
        shortcutEnabled: true,
      })
      expect(mocks.held.size).toBe(0)
    })

    it('only remembers a change made before start-up (the e2e runs never register)', () => {
      const settings = ls.applyLaunchShortcut(config('CommandOrControl+Alt+Q'))

      expect(mocks.register).not.toHaveBeenCalled()
      expect(settings).toMatchObject({
        shortcut: 'Ctrl + Alt + Q',
        shortcutAvailable: false,
      })
    })

    it('tells the listeners (the tray tooltip) when the registration changes, and only then', () => {
      const listener = vi.fn()
      ls.onLaunchShortcutChange(listener)
      ls.registerLaunchShortcut(config('CommandOrControl+Alt+Space'))
      expect(listener).toHaveBeenCalledTimes(1)

      ls.applyLaunchShortcut(config('CommandOrControl+Alt+Space'))
      expect(listener).toHaveBeenCalledTimes(1)

      ls.applyLaunchShortcut(config('CommandOrControl+Alt+Q'))
      expect(listener).toHaveBeenCalledTimes(2)

      ls.applyLaunchShortcut(config('CommandOrControl+Alt+Q', false))
      expect(listener).toHaveBeenCalledTimes(3)
    })

    it('stops telling a listener that unsubscribed', () => {
      const listener = vi.fn()
      const stop = ls.onLaunchShortcutChange(listener)
      stop()

      ls.registerLaunchShortcut(config('CommandOrControl+Alt+Space'))

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('trying again', () => {
    it('registers the shortcut once the program that had it has let go', () => {
      mocks.taken.add('CommandOrControl+Alt+Space')
      ls.registerLaunchShortcut(config('CommandOrControl+Alt+Space'))
      expect(ls.getLaunchSettings().shortcutAvailable).toBe(false)

      mocks.taken.clear()
      ls.retryLaunchShortcut()

      expect(ls.getLaunchSettings().shortcutAvailable).toBe(true)
    })

    it('leaves a working or switched-off shortcut alone', () => {
      ls.registerLaunchShortcut(config('CommandOrControl+Alt+Space'))
      mocks.register.mockClear()
      ls.retryLaunchShortcut()
      expect(mocks.register).not.toHaveBeenCalled()

      ls.applyLaunchShortcut(config('CommandOrControl+Alt+Space', false))
      ls.retryLaunchShortcut()
      expect(mocks.register).not.toHaveBeenCalled()
    })
  })

  describe('checking a combination before it is saved', () => {
    it('says a free one is free, and leaves it unregistered', () => {
      ls.registerLaunchShortcut(config('CommandOrControl+Alt+Space'))

      expect(ls.checkLaunchShortcut('Ctrl+Alt+Q')).toEqual({ status: 'free' })
      expect(mocks.held.has('CommandOrControl+Alt+Q')).toBe(false)
    })

    it('says a taken one is taken', () => {
      mocks.taken.add('CommandOrControl+Alt+Q')

      expect(ls.checkLaunchShortcut('Ctrl+Alt+Q')).toEqual({ status: 'taken' })
    })

    it('says the one in use now is the current one, without touching it', () => {
      ls.registerLaunchShortcut(config('CommandOrControl+Alt+Space'))
      mocks.register.mockClear()
      mocks.unregister.mockClear()

      expect(ls.checkLaunchShortcut('Ctrl+Alt+Space')).toEqual({
        status: 'current',
      })
      expect(mocks.register).not.toHaveBeenCalled()
      expect(mocks.unregister).not.toHaveBeenCalled()
      expect(mocks.held.has('CommandOrControl+Alt+Space')).toBe(true)
    })

    it.each([
      ['Ctrl+K', 'modifiers'],
      ['Ctrl+Alt+Delete', 'reserved'],
      ['nonsense', 'format'],
      ['', 'format'],
    ] as const)(
      'says %j is invalid (%s) without asking the system',
      (input, problem) => {
        expect(ls.checkLaunchShortcut(input)).toEqual({
          status: 'invalid',
          problem,
        })
        expect(mocks.register).not.toHaveBeenCalled()
      }
    )

    it('treats an input that is not text as invalid', () => {
      expect(ls.checkLaunchShortcut(42)).toEqual({
        status: 'invalid',
        problem: 'format',
      })
    })
  })
})
