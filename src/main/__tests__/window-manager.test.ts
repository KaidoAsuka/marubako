import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../shared/default-data'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { AppData, Prefs, WindowState } from '../../shared/types'
import type * as WindowManagerModule from '../window-manager'

type Listener = (...args: any[]) => void

// A just-enough Electron: windows keep their own visibility, focus and bounds, so the real
// window-manager state machine can be driven end to end without a desktop.
const fake = vi.hoisted(() => {
  class Emitter {
    private listeners = new Map<string, Listener[]>()
    on(event: string, listener: Listener): this {
      this.listeners.set(event, [
        ...(this.listeners.get(event) ?? []),
        listener,
      ])
      return this
    }
    once(event: string, listener: Listener): this {
      const wrapper: Listener = (...args) => {
        this.removeListener(event, wrapper)
        listener(...args)
      }
      return this.on(event, wrapper)
    }
    removeListener(event: string, listener: Listener): this {
      this.listeners.set(
        event,
        (this.listeners.get(event) ?? []).filter((entry) => entry !== listener)
      )
      return this
    }
    emit(event: string, ...args: unknown[]): boolean {
      const entries = this.listeners.get(event) ?? []
      for (const entry of [...entries]) entry(...args)
      return entries.length > 0
    }
  }

  let nextId = 1
  const sent: { windowId: number; channel: string; args: unknown[] }[] = []

  class FakeWebContents extends Emitter {
    id = nextId++
    constructor(private owner: { id: number }) {
      super()
    }
    send(channel: string, ...args: unknown[]): void {
      sent.push({ windowId: this.owner.id, channel, args })
      state.onSend?.(this, channel, args)
    }
    setWindowOpenHandler(): void {}
    getURL(): string {
      return 'file:///index.html'
    }
  }

  type Rect = { x: number; y: number; width: number; height: number }

  class FakeWindow extends Emitter {
    static nextWindowId = 1
    id = FakeWindow.nextWindowId++
    webContents = new FakeWebContents(this)
    options: Record<string, any>
    bounds: Rect
    visible = false
    minimized = false
    focused = false
    opacity = 1
    pinned: boolean
    destroyed = false
    constructor(options: Record<string, any>) {
      super()
      this.options = options
      this.pinned = options.alwaysOnTop === true
      this.bounds = {
        x: options.x ?? 0,
        y: options.y ?? 0,
        width: options.width ?? 800,
        height: options.height ?? 600,
      }
      state.windows.push(this)
    }
    get isPanel(): boolean {
      return this.options.resizable === true
    }
    loadedQuery: Record<string, string> = {}
    loadURL(): Promise<void> {
      return this.loadFile()
    }
    loadFile(
      _file?: string,
      options?: { query?: Record<string, string> }
    ): Promise<void> {
      this.loadedQuery = options?.query ?? {}
      queueMicrotask(() => this.emit('ready-to-show'))
      return Promise.resolve()
    }
    getBounds(): Rect {
      // Electron throws on any call to a destroyed window.
      if (this.destroyed) throw new Error('Object has been destroyed')
      return { ...this.bounds }
    }
    setBounds(bounds: Rect): void {
      this.bounds = { ...bounds }
    }
    setPosition(x: number, y: number): void {
      this.bounds = { ...this.bounds, x, y }
    }
    setOpacity(opacity: number): void {
      this.opacity = opacity
    }
    isVisible(): boolean {
      return this.visible
    }
    isMinimized(): boolean {
      return this.minimized
    }
    isFocused(): boolean {
      return this.focused
    }
    isAlwaysOnTop(): boolean {
      return this.pinned
    }
    setAlwaysOnTop(pinned: boolean): void {
      this.pinned = pinned
    }
    isResizable(): boolean {
      return this.isPanel
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    show(): void {
      this.visible = true
      this.focus()
    }
    showInactive(): void {
      this.visible = true
    }
    hide(): void {
      this.visible = false
      if (this.focused) this.blur()
    }
    minimize(): void {
      if (this.minimized) return
      this.minimized = true
      this.blur()
      this.emit('minimize')
    }
    restore(): void {
      if (!this.minimized) return
      this.minimized = false
      this.visible = true
      this.emit('restore')
      this.focus()
    }
    // Windows deactivates the old window first and then activates the new one.
    focus(): void {
      if (this.focused) return
      for (const other of state.windows)
        if (other !== this && other.focused) other.blur()
      this.focused = true
      this.emit('focus')
    }
    blur(): void {
      if (!this.focused) return
      this.focused = false
      this.emit('blur')
    }
    moveTop(): void {}
    destroy(): void {
      this.destroyed = true
      this.visible = false
      this.emit('closed')
    }
    // A 'close' listener may veto the close, as a real window's close event can be prevented.
    close(): void {
      let prevented = false
      this.emit('close', {
        preventDefault: () => {
          prevented = true
        },
      })
      if (!prevented) this.destroy()
    }
  }

  const state = {
    windows: [] as FakeWindow[],
    cursor: { x: 0, y: 0 },
    data: null as unknown,
    // Whether this start created the data of a new installation (data-store.isFreshInstall).
    fresh: false,
    onSend: undefined as
      | undefined
      | ((contents: FakeWebContents, channel: string, args: unknown[]) => void),
    sent,
  }

  const display = {
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  }
  const screen = {
    getDisplayMatching: () => display,
    getDisplayNearestPoint: () => display,
    getPrimaryDisplay: () => display,
    getCursorScreenPoint: () => state.cursor,
    on: () => {},
    removeListener: () => {},
  }

  return { FakeWindow, Emitter, screen, state }
})

vi.mock('electron', () => ({
  app: { getAppPath: () => 'C:\\app' },
  BrowserWindow: fake.FakeWindow,
  screen: fake.screen,
}))
vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('../launcher-menu', () => ({ createLauncherMenu: vi.fn() }))
vi.mock('../data-store', () => {
  const current = () => fake.state.data as AppData
  return {
    loadAppData: async () => current(),
    updateAppData: async (updater: (data: AppData) => AppData) => {
      fake.state.data = updater(current())
      return current()
    },
    updateWindowData: async (updater: (state: WindowState) => WindowState) => {
      fake.state.data = { ...current(), window: updater(current().window) }
      return current()
    },
    flushPendingWriteSync: () => {},
    isFreshInstall: () => fake.state.fresh,
  }
})

type WindowManager = typeof WindowManagerModule
type FakeWindowInstance = InstanceType<typeof fake.FakeWindow>

let wm: WindowManager

const panel = (): FakeWindowInstance =>
  fake.state.windows.find((window) => window.isPanel)!
const ball = (): FakeWindowInstance =>
  fake.state.windows.find((window) => !window.isPanel)!
const data = (): AppData => fake.state.data as AppData

/** Starts the app with the given preferences and last window state, as index.ts does. */
async function boot(
  options: {
    showBubble?: boolean
    prefs?: Partial<Prefs>
    window?: Partial<WindowState>
    hidden?: boolean
    peekCollapseDelay?: number
  } = {}
): Promise<void> {
  const initial = createDefaultAppData()
  initial.prefs = { ...initial.prefs, ...options.prefs }
  initial.prefs.showBubble = options.showBubble ?? true
  initial.prefs.peekCollapseDelay = options.peekCollapseDelay ?? 200
  initial.window = { ...initial.window, ...options.window }
  fake.state.data = initial
  process.argv = options.hidden
    ? [...originalArgv, '--hidden']
    : [...originalArgv]
  await wm.createMainWindow()
  // The ball window is prepared in the background right after the panel.
  await vi.waitFor(() => expect(fake.state.windows).toHaveLength(2))
  await vi.waitFor(() => expect(wm.getDockWindow()).not.toBeNull())
}

/** What saving the settings does: the store holds the new value, then the window manager is told. */
async function setBubblePreference(show: boolean): Promise<void> {
  data().prefs.showBubble = show
  await wm.applyBubblePreference(show)
}

/** Moves the clock past the shortcut debounce. */
function later(ms = 500): void {
  vi.setSystemTime(Date.now() + ms)
}

const originalArgv = [...process.argv]

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-03T10:00:00Z'))
  fake.state.windows.length = 0
  fake.state.fresh = false
  fake.state.sent.length = 0
  fake.state.cursor = { x: 5, y: 5 }
  vi.resetModules()
  wm = await import('../window-manager')
  // Every window answers the frame handshake at once, as a ready renderer does.
  fake.state.onSend = (contents, channel, args) => {
    if (channel === IPC_CHANNELS.prepareWindowShow)
      queueMicrotask(() =>
        wm.acknowledgeWindowFrame(contents.id, args[0] as number)
      )
  }
})

afterEach(() => {
  wm.prepareToQuit()
  vi.useRealTimers()
  process.argv = [...originalArgv]
})

describe('the right-click menu of the panel', () => {
  it('is registered on the panel and not left to Electron, which draws none', async () => {
    await boot()

    const listeners = (
      panel().webContents as unknown as { listeners: Map<string, unknown[]> }
    ).listeners
    expect(listeners.get('context-menu')).toHaveLength(1)
  })

  it('goes with spellcheck off, as the fields hold paths, addresses and commands', async () => {
    await boot()

    expect(panel().options.webPreferences.spellcheck).toBe(false)
  })
})

// Electron 35 and later give frameless transparent windows on Windows 11 their own rounded
// corners and a native shadow unless told otherwise. Both windows draw their own shape (the
// panel's CSS radius, the round ball), so a native corner or shadow would show as a frame or a
// white edge around it.
describe('the transparent windows draw their own shape', () => {
  it.each([
    ['panel', () => panel()],
    ['ball', () => ball()],
  ])(
    'the %s asks for no native rounded corners and no native shadow',
    async (_name, getWindow) => {
      await boot()
      const { options } = getWindow()

      expect(options.transparent).toBe(true)
      expect(options.frame).toBe(false)
      expect(options.roundedCorners).toBe(false)
      expect(options.hasShadow).toBe(false)
    }
  )
})

describe('the ball is permanent while showBubble is on', () => {
  it('collapse leaves the ball and hides the panel', async () => {
    await boot()
    expect(ball().isVisible()).toBe(false)

    const snapshot = await wm.collapseWindow()

    expect(snapshot.collapsed).toBe(true)
    expect(panel().isVisible()).toBe(false)
    expect(ball().isVisible()).toBe(true)
    expect(data().window.collapsed).toBe(true)
  })

  it('close to tray hides only the panel and keeps or shows the ball, remembering the collapsed state', async () => {
    await boot()
    expect(ball().isVisible()).toBe(false)

    await wm.hideWindow()

    expect(panel().isVisible()).toBe(false)
    expect(ball().isVisible()).toBe(true)
    expect(wm.getWindowSnapshot().collapsed).toBe(true)
    expect(data().window.collapsed).toBe(true)
  })

  it('close to tray keeps a ball that is already showing next to the open panel', async () => {
    await boot()
    await wm.collapseWindow()
    await wm.showMainWindow()
    expect(ball().isVisible()).toBe(true)

    await wm.hideWindow()

    expect(panel().isVisible()).toBe(false)
    expect(ball().isVisible()).toBe(true)
  })

  it('close to tray shows the ball where it was last left, not at the panel corner', async () => {
    await boot({ window: { dockPosition: { x: 300, y: 400 }, dockEdge: null } })
    await wm.hideWindow()

    expect(ball().getBounds()).toMatchObject({ x: 300, y: 400 })
  })

  it('never hides the ball through a chain of shortcut, close, recall and second-instance operations', async () => {
    await boot()
    await wm.collapseWindow()
    const operations: [string, () => Promise<unknown>][] = [
      ['recall from the ball', () => wm.showMainWindow()],
      ['close to tray', () => wm.hideWindow()],
      ['second launch', () => wm.showMainWindow()],
      ['collapse (Esc / logo)', () => wm.collapseWindow()],
      ['shortcut opens', () => wm.toggleMainWindow()],
      ['shortcut closes', () => wm.toggleMainWindow()],
      ['tray click', () => wm.showMainWindow()],
      ['dismiss after launch', () => wm.dismissAfterLaunch()],
      ['peek from the ball', () => wm.activateDock('peek')],
      ['peek dismissed', () => wm.activateDock('peek')],
      ['window from the ball', () => wm.activateDock('window')],
      ['close to tray again', () => wm.hideWindow()],
    ]
    for (const [label, operation] of operations) {
      later()
      // The shortcut only collapses a focused panel.
      if (label === 'shortcut closes') panel().focus()
      await operation()
      expect(ball().isVisible(), label).toBe(true)
    }
  })

  it('the panel close event (Alt+F4, taskbar close) leaves the ball', async () => {
    await boot()
    await wm.collapseWindow()
    await wm.showMainWindow()
    const previous = process.env.QUICKLAUNCH_E2E
    delete process.env.QUICKLAUNCH_E2E
    try {
      const prevented = vi.fn()
      panel().emit('close', { preventDefault: prevented })
      expect(prevented).toHaveBeenCalled()
      await vi.waitFor(() => expect(panel().isVisible()).toBe(false))
    } finally {
      if (previous !== undefined) process.env.QUICKLAUNCH_E2E = previous
    }
    expect(ball().isVisible()).toBe(true)
  })

  it('the ball close event (Alt+F4 or system Close on the focused ball) does not destroy it', async () => {
    await boot()
    await wm.collapseWindow()
    ball().focus()
    const previous = process.env.QUICKLAUNCH_E2E
    delete process.env.QUICKLAUNCH_E2E
    try {
      ball().close()
    } finally {
      if (previous !== undefined) process.env.QUICKLAUNCH_E2E = previous
    }

    expect(ball().destroyed).toBe(false)
    expect(wm.getDockWindow()).toBe(ball())
    expect(ball().isVisible()).toBe(true)
    expect(panel().isVisible()).toBe(false)
    // Still the one thing on screen, and still able to bring the panel back.
    await wm.activateDock('window')
    expect(panel().isVisible()).toBe(true)
    expect(ball().isVisible()).toBe(true)
  })

  it('the ball can still be closed while quitting', async () => {
    await boot()
    await wm.collapseWindow()
    const previous = process.env.QUICKLAUNCH_E2E
    delete process.env.QUICKLAUNCH_E2E
    try {
      wm.prepareToQuit()
      ball().close()
    } finally {
      if (previous !== undefined) process.env.QUICKLAUNCH_E2E = previous
    }

    expect(ball().destroyed).toBe(true)
    expect(wm.getDockWindow()).toBeNull()
  })

  it('the ball close is not vetoed under the e2e harness, like the panel close', async () => {
    await boot()
    const previous = process.env.QUICKLAUNCH_E2E
    process.env.QUICKLAUNCH_E2E = '1'
    try {
      ball().close()
    } finally {
      if (previous === undefined) delete process.env.QUICKLAUNCH_E2E
      else process.env.QUICKLAUNCH_E2E = previous
    }

    expect(ball().destroyed).toBe(true)
  })

  it('recalling from the ball after close to tray brings the panel back and keeps the ball', async () => {
    await boot()
    await wm.hideWindow()

    await wm.showMainWindow()

    expect(panel().isVisible()).toBe(true)
    expect(ball().isVisible()).toBe(true)
    expect(wm.getWindowSnapshot().collapsed).toBe(false)
  })

  it('collapsing a panel that is already collapsed to a visible ball changes nothing', async () => {
    await boot()
    await wm.collapseWindow()

    await wm.collapseWindow()
    await wm.hideWindow()

    expect(ball().isVisible()).toBe(true)
    expect(panel().isVisible()).toBe(false)
  })

  it('dismiss after launch collapses to the ball', async () => {
    await boot()
    await wm.collapseWindow()
    await wm.activateDock('window')
    expect(panel().isVisible()).toBe(true)

    await wm.dismissAfterLaunch()

    expect(panel().isVisible()).toBe(false)
    expect(ball().isVisible()).toBe(true)
  })

  it('dismiss after launch shows the ball even when the panel was opened without it', async () => {
    await boot()
    expect(ball().isVisible()).toBe(false)

    await wm.dismissAfterLaunch()

    expect(panel().isVisible()).toBe(false)
    expect(ball().isVisible()).toBe(true)
  })

  it('does not run the panel through the animation handshake just to hide it', async () => {
    await boot()
    await wm.collapseWindow()
    await wm.showMainWindow()
    fake.state.sent.length = 0

    await wm.hideWindow()

    const panelMessages = fake.state.sent.filter(
      (message) =>
        message.windowId === panel().id &&
        message.channel === IPC_CHANNELS.prepareWindowShow
    )
    expect(panelMessages).toEqual([])
  })
})

describe('with showBubble off nothing is left but the tray', () => {
  it('collapse goes straight to the tray without a transition deadlock', async () => {
    await boot({ showBubble: false })

    const snapshot = await wm.collapseWindow()

    expect(snapshot.collapsed).toBe(false)
    expect(panel().isVisible()).toBe(false)
    expect(ball().isVisible()).toBe(false)
    expect(data().window.collapsed).toBe(false)

    later()
    await wm.showMainWindow()
    expect(panel().isVisible()).toBe(true)
    expect(ball().isVisible()).toBe(false)
  })

  it('a collapse with a drop position hides too, rather than showing a ball', async () => {
    await boot({ showBubble: false })

    await wm.collapseWindow({ x: 0, y: 300 })

    expect(panel().isVisible()).toBe(false)
    expect(ball().isVisible()).toBe(false)
  })

  it('close to tray hides everything and forgets the collapsed state', async () => {
    await boot({ showBubble: false })

    await wm.hideWindow()

    expect(panel().isVisible()).toBe(false)
    expect(ball().isVisible()).toBe(false)
    expect(data().window.collapsed).toBe(false)
  })

  it('the shortcut, second launch and dismiss after launch never show a ball', async () => {
    await boot({ showBubble: false })
    for (const operation of [
      () => wm.toggleMainWindow(),
      () => wm.showMainWindow(),
      () => wm.dismissAfterLaunch(),
      () => wm.showMainWindow(),
      () => wm.hideWindow(),
    ]) {
      later()
      panel().focus()
      await operation()
      expect(ball().isVisible()).toBe(false)
    }
  })

  it('reports that everything went to the tray so the first-time hint can be shown', async () => {
    const notified = vi.fn()
    wm.setHiddenToTrayNotifier(notified)
    await boot({ showBubble: false })

    await wm.hideWindow()
    expect(notified).toHaveBeenCalledTimes(1)

    later()
    await wm.showMainWindow()
    await wm.collapseWindow()
    expect(notified).toHaveBeenCalledTimes(2)
  })

  it('stays silent about the tray while the ball is still there', async () => {
    const notified = vi.fn()
    wm.setHiddenToTrayNotifier(notified)
    await boot()

    await wm.hideWindow()
    later()
    await wm.showMainWindow()
    await wm.collapseWindow()

    expect(notified).not.toHaveBeenCalled()
  })

  it('does not dock a dragged panel into a ball', async () => {
    await boot({ showBubble: false })
    const window = panel()
    window.visible = true
    window.setPosition(0, 100)
    window.emit('will-move')
    window.emit('moved')
    await vi.advanceTimersByTimeAsync(10)

    expect(window.isVisible()).toBe(true)
    expect(ball().isVisible()).toBe(false)
    expect(wm.getWindowSnapshot().collapsed).toBe(false)
  })

  it('still docks a dragged panel at the screen edge while showBubble is on', async () => {
    await boot()
    const window = panel()
    window.visible = true
    window.setPosition(0, 100)
    window.emit('will-move')
    window.emit('moved')

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(window.isVisible()).toBe(false)
  })
})

describe('the panel opacity', () => {
  it('previews an opacity on the window without saving it', async () => {
    await boot()

    wm.previewPanelOpacity(0.6)

    expect(panel().opacity).toBe(0.6)
    expect(data().prefs.opacity).toBe(1)
    expect(wm.getWindowSnapshot().opacity).toBe(1)
  })

  it('puts the saved opacity back when the preview ends', async () => {
    await boot({ prefs: { opacity: 0.8 } })
    expect(panel().opacity).toBe(0.8)

    wm.previewPanelOpacity(0.5)
    expect(panel().opacity).toBe(0.5)
    wm.previewPanelOpacity(null)

    expect(panel().opacity).toBe(0.8)
  })

  it('keeps a saved opacity as the one to go back to', async () => {
    await boot()

    wm.previewPanelOpacity(0.5)
    await wm.setWindowOpacity(0.7)
    wm.previewPanelOpacity(null)

    expect(panel().opacity).toBe(0.7)
    expect(data().prefs.opacity).toBe(0.7)
  })

  it('refuses a value that is not a number', async () => {
    await boot()

    expect(() => wm.previewPanelOpacity(Number.NaN)).toThrow('Invalid opacity')
    expect(() => wm.previewPanelOpacity('0.5' as unknown as number)).toThrow(
      'Invalid opacity'
    )
  })

  it('does not go below 40%, whether previewed or saved', async () => {
    await boot()

    wm.previewPanelOpacity(0.1)
    expect(panel().opacity).toBe(0.4)
    await wm.setWindowOpacity(0.1)

    expect(panel().opacity).toBe(0.4)
    expect(data().prefs.opacity).toBe(0.4)
  })
})

describe('applying the preference at once', () => {
  it('turning it off hides a ball that is showing next to an open panel and keeps the panel', async () => {
    await boot()
    await wm.collapseWindow()
    await wm.showMainWindow('peek')
    expect(ball().isVisible()).toBe(true)

    await setBubblePreference(false)

    expect(ball().isVisible()).toBe(false)
    expect(panel().isVisible()).toBe(true)
    // A temporary panel would fold into a ball that is no longer there.
    expect(wm.getWindowSnapshot().mode).toBe('window')
  })

  it('turning it off while the panel is collapsed to the ball brings the panel back', async () => {
    await boot()
    await wm.collapseWindow()
    expect(panel().isVisible()).toBe(false)

    await setBubblePreference(false)

    expect(panel().isVisible()).toBe(true)
    expect(ball().isVisible()).toBe(false)
    expect(wm.getWindowSnapshot().collapsed).toBe(false)
    expect(data().window.collapsed).toBe(false)
  })

  it('a later collapse follows the new value without restarting', async () => {
    await boot()
    await setBubblePreference(false)

    await wm.collapseWindow()

    expect(panel().isVisible()).toBe(false)
    expect(ball().isVisible()).toBe(false)

    await setBubblePreference(true)
    later()
    await wm.showMainWindow()
    await wm.collapseWindow()

    expect(ball().isVisible()).toBe(true)
  })
})

describe('restoring the ball after a restart', () => {
  const savedBall = { x: 300, y: 420 }

  it('starts with the ball and without the panel when the last state was collapsed', async () => {
    await boot({
      window: { collapsed: true, dockPosition: savedBall, dockEdge: null },
    })

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(panel().isVisible()).toBe(false)
    expect(ball().getBounds()).toMatchObject(savedBall)
    expect(wm.getWindowSnapshot().collapsed).toBe(true)
    expect(data().window.collapsed).toBe(true)
  })

  it('restores the ball on the saved screen edge', async () => {
    await boot({
      window: {
        collapsed: true,
        dockPosition: { x: 1920 - 56 - 4, y: 500 },
        dockEdge: 'right',
      },
    })

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(ball().getBounds()).toMatchObject({ x: 1860, y: 500 })
  })

  it('tells the ball which theme and language to use before showing it', async () => {
    await boot({
      prefs: { theme: 'light', lang: 'en' },
      window: { collapsed: true, dockPosition: savedBall },
    })

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    const appearance = fake.state.sent.find(
      (message) =>
        message.windowId === ball().id &&
        message.channel === IPC_CHANNELS.dockAppearance
    )
    expect(appearance?.args[0]).toEqual({ theme: 'light', lang: 'en' })
  })

  it('loads the ball with the saved theme and language, so its first frame is right', async () => {
    await boot({
      prefs: { theme: 'light', lang: 'ja' },
      window: { collapsed: true, dockPosition: savedBall },
    })

    expect(ball().loadedQuery).toEqual({
      view: 'dock',
      theme: 'light',
      lang: 'ja',
    })
    // The panel's loading screen speaks the saved language too.
    expect(panel().loadedQuery).toEqual({ theme: 'light', lang: 'ja' })
  })

  it('tells the panel it is a new installation, so that it can show the first-run card', async () => {
    fake.state.fresh = true
    await boot({ prefs: { theme: 'dark', lang: 'en' } })

    expect(panel().loadedQuery).toEqual({
      theme: 'dark',
      lang: 'en',
      firstrun: '1',
    })
  })

  it('does not announce a first run to the panel in an e2e run, unless the spec asks for it', async () => {
    const { QUICKLAUNCH_E2E: e2e, QUICKLAUNCH_FIRST_RUN: firstRun } =
      process.env
    process.env.QUICKLAUNCH_E2E = '1'
    delete process.env.QUICKLAUNCH_FIRST_RUN
    fake.state.fresh = true
    try {
      await boot({ prefs: { theme: 'dark', lang: 'en' } })

      expect(panel().loadedQuery).toEqual({ theme: 'dark', lang: 'en' })
    } finally {
      if (e2e === undefined) delete process.env.QUICKLAUNCH_E2E
      else process.env.QUICKLAUNCH_E2E = e2e
      if (firstRun !== undefined) process.env.QUICKLAUNCH_FIRST_RUN = firstRun
    }
  })

  it('announces it again in an e2e run that opts in, and never for data that already existed', async () => {
    const { QUICKLAUNCH_E2E: e2e, QUICKLAUNCH_FIRST_RUN: firstRun } =
      process.env
    process.env.QUICKLAUNCH_E2E = '1'
    process.env.QUICKLAUNCH_FIRST_RUN = '1'
    try {
      fake.state.fresh = true
      await boot({ prefs: { theme: 'dark', lang: 'en' } })
      expect(panel().loadedQuery).toEqual({
        theme: 'dark',
        lang: 'en',
        firstrun: '1',
      })
      wm.prepareToQuit()

      fake.state.windows.length = 0
      vi.resetModules()
      wm = await import('../window-manager')
      fake.state.fresh = false
      await boot({ prefs: { theme: 'dark', lang: 'en' } })
      expect(panel().loadedQuery).toEqual({ theme: 'dark', lang: 'en' })
    } finally {
      if (e2e === undefined) delete process.env.QUICKLAUNCH_E2E
      else process.env.QUICKLAUNCH_E2E = e2e
      if (firstRun === undefined) delete process.env.QUICKLAUNCH_FIRST_RUN
      else process.env.QUICKLAUNCH_FIRST_RUN = firstRun
    }
  })

  it('does not run the animation handshake for a panel that was never shown', async () => {
    await boot({ window: { collapsed: true, dockPosition: savedBall } })
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))

    const handshakes = fake.state.sent.filter(
      (message) => message.channel === IPC_CHANNELS.prepareWindowShow
    )
    expect(handshakes).toEqual([])
  })

  it('the restored ball opens the panel like any other ball', async () => {
    await boot({ window: { collapsed: true, dockPosition: savedBall } })
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))

    await wm.activateDock('peek')

    expect(panel().isVisible()).toBe(true)
    expect(ball().isVisible()).toBe(true)
    expect(wm.getWindowSnapshot()).toMatchObject({
      collapsed: false,
      mode: 'peek',
    })
  })

  // A panel that has never been on screen paints nothing, so it cannot answer the frame handshake:
  // animating its first appearance would wait out a two-second timeout per stage.
  it('does not run the frame handshake with a panel that has never been on screen', async () => {
    await boot({ window: { collapsed: true, dockPosition: savedBall } })
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    fake.state.sent.length = 0

    await wm.activateDock('peek')

    const toPanel = fake.state.sent.filter(
      (message) =>
        message.windowId === panel().id &&
        message.channel === IPC_CHANNELS.prepareWindowShow
    )
    expect(toPanel).toEqual([])
    // The ball still turns into the dot beside the panel.
    const toBall = fake.state.sent.filter(
      (message) =>
        message.windowId === ball().id &&
        message.channel === IPC_CHANNELS.prepareWindowShow
    )
    expect(toBall.map((message) => message.args[1])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ direction: 'expand', surface: 'bubble' }),
      ])
    )
  })

  it('animates later expansions again once the panel has been on screen', async () => {
    await boot({ window: { collapsed: true, dockPosition: savedBall } })
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    await wm.activateDock('window')
    await wm.collapseWindow()
    fake.state.sent.length = 0
    later()

    await wm.activateDock('window')

    const toPanel = fake.state.sent.filter(
      (message) =>
        message.windowId === panel().id &&
        message.channel === IPC_CHANNELS.prepareWindowShow
    )
    expect(toPanel.length).toBeGreaterThan(0)
  })

  it('an auto-start (--hidden) without a ball in the saved state still brings the ball up', async () => {
    await boot({ hidden: true })

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(panel().isVisible()).toBe(false)
    expect(wm.getWindowSnapshot().collapsed).toBe(true)
  })

  it('an auto-start restores a collapsed ball too', async () => {
    await boot({
      hidden: true,
      window: { collapsed: true, dockPosition: savedBall },
    })

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(panel().isVisible()).toBe(false)
    expect(ball().getBounds()).toMatchObject(savedBall)
  })

  it('a normal start from an expanded state still shows the panel', async () => {
    await boot()

    expect(panel().isVisible()).toBe(true)
    expect(wm.getWindowSnapshot().collapsed).toBe(false)
  })

  it('with the ball turned off the panel is shown even if the saved state says collapsed', async () => {
    await boot({
      showBubble: false,
      window: { collapsed: true, dockPosition: savedBall },
    })

    expect(panel().isVisible()).toBe(true)
    expect(ball().isVisible()).toBe(false)
    expect(wm.getWindowSnapshot().collapsed).toBe(false)
    expect(data().window.collapsed).toBe(false)
  })

  it('an auto-start with the ball turned off shows nothing', async () => {
    await boot({ showBubble: false, hidden: true })
    await vi.advanceTimersByTimeAsync(10)

    expect(panel().isVisible()).toBe(false)
    expect(ball().isVisible()).toBe(false)
  })
})

describe('minimizing the panel from the taskbar', () => {
  it('keeps the ball showing and in the collapsed look while the panel is minimized', async () => {
    await boot()
    await wm.collapseWindow()
    await wm.showMainWindow()
    expect(wm.getWindowSnapshot().collapsed).toBe(false)

    panel().minimize()

    await vi.waitFor(() => expect(wm.getWindowSnapshot().collapsed).toBe(true))
    expect(ball().isVisible()).toBe(true)
  })

  it('brings the ball up when the panel was minimized without one', async () => {
    await boot()
    expect(ball().isVisible()).toBe(false)

    panel().minimize()

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
  })

  it('restoring from the taskbar syncs the state back to expanded and keeps the ball', async () => {
    await boot()
    await wm.collapseWindow()
    await wm.showMainWindow()
    panel().minimize()
    await vi.waitFor(() => expect(wm.getWindowSnapshot().collapsed).toBe(true))

    panel().restore()

    await vi.waitFor(() => expect(wm.getWindowSnapshot().collapsed).toBe(false))
    expect(ball().isVisible()).toBe(true)
    expect(data().window.collapsed).toBe(false)
  })

  it('recalling the minimized panel from the ball restores it once', async () => {
    await boot()
    await wm.collapseWindow()
    await wm.showMainWindow()
    panel().minimize()
    await vi.waitFor(() => expect(wm.getWindowSnapshot().collapsed).toBe(true))

    await wm.activateDock('peek')
    await vi.advanceTimersByTimeAsync(10)

    expect(panel().isMinimized()).toBe(false)
    expect(panel().isVisible()).toBe(true)
    expect(ball().isVisible()).toBe(true)
    expect(wm.getWindowSnapshot().collapsed).toBe(false)
  })

  it('with the ball turned off a minimize changes nothing about the ball', async () => {
    await boot({ showBubble: false })

    panel().minimize()
    await vi.advanceTimersByTimeAsync(10)

    expect(ball().isVisible()).toBe(false)
    expect(wm.getWindowSnapshot().collapsed).toBe(false)
  })
})

describe('a click on the ball while the panel is behind other windows (window-ux-6)', () => {
  async function openAsWindow(): Promise<void> {
    await boot()
    await wm.collapseWindow()
    later()
    await wm.activateDock('window')
    expect(wm.getWindowSnapshot().mode).toBe('window')
    expect(panel().isVisible()).toBe(true)
  }

  it('brings an unfocused panel to the front instead of collapsing it', async () => {
    await openAsWindow()
    panel().focus()
    // The user works in another application for a while; the panel is still visible behind it.
    panel().blur()
    later(5000)

    ball().focus()
    const snapshot = await wm.activateDock('peek')

    expect(snapshot.collapsed).toBe(false)
    expect(panel().isVisible()).toBe(true)
    expect(panel().isFocused()).toBe(true)
    expect(ball().isVisible()).toBe(true)
  })

  it('still collapses a panel that was in front when the ball was pressed', async () => {
    await openAsWindow()
    panel().focus()
    later(5000)

    // Pressing the ball takes focus from the panel in the same instant.
    ball().focus()
    const snapshot = await wm.activateDock('peek')

    expect(snapshot.collapsed).toBe(true)
    expect(panel().isVisible()).toBe(false)
  })

  it('still collapses a pinned panel, which cannot be hidden behind other windows', async () => {
    await openAsWindow()
    await wm.togglePin()
    panel().blur()
    later(5000)

    ball().focus()
    const snapshot = await wm.activateDock('peek')

    expect(snapshot.collapsed).toBe(true)
  })

  it('still collapses a temporary panel, which only exists while the pointer is on it', async () => {
    await boot()
    await wm.collapseWindow()
    later()
    await wm.activateDock('peek')
    expect(wm.getWindowSnapshot().mode).toBe('peek')
    panel().blur()
    later(5000)

    ball().focus()
    const snapshot = await wm.activateDock('peek')

    expect(snapshot.collapsed).toBe(true)
  })

  it('forgets the focus of an earlier press', async () => {
    await openAsWindow()
    panel().focus()
    panel().blur()
    later(5000)
    ball().focus()
    await wm.activateDock('peek')
    expect(panel().isFocused()).toBe(true)

    // The panel is in front now and no new focus event reaches the ball (the ball already held the
    // OS focus, or the press came from the keyboard), so the earlier press must not be read again:
    // the next click collapses the panel instead of raising it a second time.
    const snapshot = await wm.activateDock('peek')

    expect(snapshot.collapsed).toBe(true)
  })
})

describe('leaving a temporary panel (flow-10)', () => {
  let panelRect: { x: number; y: number; width: number; height: number }

  async function openPeek(peekCollapseDelay: number): Promise<void> {
    // The leave check runs on a 40 ms timer, so this needs the full fake clock.
    vi.useRealTimers()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T10:00:00Z'))
    await boot({ peekCollapseDelay })
    await wm.collapseWindow()
    const bounds = ball().getBounds()
    fake.state.cursor = { x: bounds.x + 28, y: bounds.y + 28 }
    await wm.activateDock('peek')
    expect(wm.getWindowSnapshot()).toMatchObject({
      collapsed: false,
      mode: 'peek',
    })
    panelRect = panel().getBounds()
  }

  async function wait(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms)
  }

  const open = () => panel().isVisible() && !wm.getWindowSnapshot().collapsed

  it('keeps the panel open when the pointer rests 15 px outside it for 300 ms', async () => {
    await openPeek(200)
    fake.state.cursor = {
      x: panelRect.x + panelRect.width + 15,
      y: panelRect.y + 200,
    }

    await wait(300)

    expect(open()).toBe(true)
  })

  it('closes it after 450 ms in that near zone', async () => {
    await openPeek(200)
    fake.state.cursor = {
      x: panelRect.x + panelRect.width + 15,
      y: panelRect.y + 200,
    }

    await wait(520)

    expect(open()).toBe(false)
    expect(ball().isVisible()).toBe(true)
  })

  it('closes it within the user delay when the pointer is 100 px away', async () => {
    await openPeek(200)
    fake.state.cursor = {
      x: panelRect.x + panelRect.width + 100,
      y: panelRect.y + 200,
    }

    await wait(300)

    expect(open()).toBe(false)
  })

  it('does not wait longer than the near grace in total when the pointer slides out slowly', async () => {
    await openPeek(200)
    fake.state.cursor = {
      x: panelRect.x + panelRect.width + 15,
      y: panelRect.y + 200,
    }
    await wait(300)
    expect(open()).toBe(true)

    // Crossing into the far zone must not restart the clock.
    fake.state.cursor = {
      x: panelRect.x + panelRect.width + 100,
      y: panelRect.y + 200,
    }
    await wait(80)

    expect(open()).toBe(false)
  })

  it('treats a delay of 0 as immediately in both zones', async () => {
    await openPeek(0)
    fake.state.cursor = {
      x: panelRect.x + panelRect.width + 15,
      y: panelRect.y + 200,
    }

    await wait(100)

    expect(open()).toBe(false)
  })

  it('never makes the near zone shorter than a long user delay', async () => {
    await openPeek(1000)
    fake.state.cursor = {
      x: panelRect.x + panelRect.width + 15,
      y: panelRect.y + 200,
    }

    await wait(900)
    expect(open()).toBe(true)
    await wait(200)
    expect(open()).toBe(false)
  })

  async function peekWarnings(): Promise<unknown[][]> {
    const log = (await import('electron-log/main')).default
    return vi
      .mocked(log.warn)
      .mock.calls.filter(
        ([message]) => message === 'Could not check temporary panel dismissal'
      )
  }

  it('does not throw on every tick when the ball window is gone', async () => {
    await openPeek(200)
    ball().destroy()
    expect(wm.getDockWindow()).toBeNull()
    fake.state.cursor = {
      x: panelRect.x + panelRect.width + 100,
      y: panelRect.y + 200,
    }

    await wait(500)

    expect(await peekWarnings()).toEqual([])
  })

  it('does not throw on every tick when the ball window is destroyed but not yet forgotten', async () => {
    await openPeek(200)
    // Electron destroys a window before it emits 'closed'; a tick can land in between.
    ball().destroyed = true
    fake.state.cursor = {
      x: panelRect.x + panelRect.width + 100,
      y: panelRect.y + 200,
    }

    await wait(500)

    expect(await peekWarnings()).toEqual([])
  })

  it('stays open while the pointer comes back inside the grace', async () => {
    await openPeek(200)
    const outsideNear = {
      x: panelRect.x + panelRect.width + 15,
      y: panelRect.y + 200,
    }
    fake.state.cursor = outsideNear
    await wait(300)
    fake.state.cursor = { x: panelRect.x + 100, y: panelRect.y + 100 }
    await wait(100)
    fake.state.cursor = outsideNear
    await wait(300)

    expect(open()).toBe(true)
  })
})

describe('the size and place of the panel (layout, iteration 4)', () => {
  const display = fake.screen.getPrimaryDisplay()
  const workArea = { ...display.workArea }

  afterEach(() => {
    display.workArea = { ...workArea }
  })

  const saved = { x: 100, y: 50, w: 760, h: 720 }

  it('opens a new installation slender, 400 x 720 in Chinese, in the middle of the work area', async () => {
    await boot()

    expect(panel().getBounds()).toEqual({
      x: Math.round((1920 - 400) / 2),
      y: Math.round((1040 - 720) / 2),
      width: 400,
      height: 720,
    })
  })

  it.each([
    ['zh', 400],
    ['ja', 400],
    ['en', 470],
  ] as const)(
    'gives a new installation in %s the width its names need: %i',
    async (lang, width) => {
      await boot({ prefs: { lang } })

      expect(panel().getBounds()).toMatchObject({ width, height: 720 })
    }
  )

  it('caps the height to what a small screen leaves after the margins', async () => {
    display.workArea = { x: 0, y: 0, width: 1366, height: 728 }

    await boot()

    expect(panel().getBounds()).toMatchObject({
      width: 400,
      height: 728 - 24,
      y: 12,
    })
  })

  it('keeps the size the user saved, however different from the new default', async () => {
    await boot({ window: { bounds: saved } })

    expect(panel().getBounds()).toEqual({
      x: 100,
      y: 50,
      width: 760,
      height: 720,
    })
  })

  it('does not rewrite the saved bounds when the window opens', async () => {
    await boot({ window: { bounds: saved } })

    expect(data().window.bounds).toEqual(saved)
  })

  it('keeps a saved size in every language', async () => {
    await boot({ prefs: { lang: 'en' }, window: { bounds: saved } })

    expect(panel().getBounds()).toMatchObject({ width: 760, height: 720 })
  })

  it('still allows the panel to be made as narrow as the stacked row and the icon row need', async () => {
    await boot()

    expect(panel().options.minWidth).toBe(320)
  })

  it('opens the ball and the temporary panel at the same size as the window', async () => {
    await boot()
    await wm.collapseWindow()

    await wm.activateDock('peek')

    expect(panel().getBounds()).toMatchObject({ width: 400, height: 720 })
  })
})

describe('a new installation shows the ball from the first second (flow-4)', () => {
  const display = fake.screen.getPrimaryDisplay()
  const workArea = { ...display.workArea }

  afterEach(() => {
    display.workArea = { ...workArea }
  })

  /** Boots as the very first start of a new installation. */
  async function bootFresh(
    options: Parameters<typeof boot>[0] = {}
  ): Promise<void> {
    fake.state.fresh = true
    await boot(options)
  }

  it('docks the ball to the right edge, centred, with the panel beside it', async () => {
    await bootFresh()
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))

    // 1920 x 1040 work area: the ball at the right edge, the panel in the place the ball would
    // open it (8 px gap), both on the vertical middle.
    expect(ball().getBounds()).toEqual({
      x: 1860,
      y: 492,
      width: 56,
      height: 56,
    })
    expect(panel().getBounds()).toEqual({
      x: 1860 - 8 - 400,
      y: Math.round((1040 - 720) / 2),
      width: 400,
      height: 720,
    })
    expect(panel().isVisible()).toBe(true)
  })

  it('shows the ball as the dot that stands for an open panel, not as a full ball', async () => {
    await bootFresh()
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))

    const presentations = fake.state.sent
      .filter(
        (message) =>
          message.windowId === ball().id &&
          message.channel === IPC_CHANNELS.prepareWindowShow
      )
      .map((message) => message.args[1])
    expect(presentations.length).toBeGreaterThan(0)
    for (const presentation of presentations)
      expect(presentation).toMatchObject({
        direction: 'expand',
        surface: 'bubble',
      })
    expect(wm.getWindowSnapshot().collapsed).toBe(false)
  })

  it('remembers the place of both, so that a restart finds them where they were', async () => {
    await bootFresh()
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))

    expect(data().window.dockPosition).toEqual({ x: 1860, y: 492 })
    expect(data().window.dockEdge).toBe('right')
    expect(data().window.bounds).toEqual({ x: 1452, y: 160, w: 400, h: 720 })
    expect(data().window.collapsed).toBe(false)
  })

  it('makes the pair a pair: collapsing leaves the ball where it is and expanding brings the panel back to the same place', async () => {
    await bootFresh()
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    const panelBounds = panel().getBounds()
    const ballBounds = ball().getBounds()

    await wm.collapseWindow()
    expect(panel().isVisible()).toBe(false)
    expect(ball().getBounds()).toEqual(ballBounds)

    await wm.showMainWindow()
    expect(panel().getBounds()).toEqual(panelBounds)
    expect(ball().getBounds()).toEqual(ballBounds)
  })

  it('uses the width of the language and respects a small screen', async () => {
    display.workArea = { x: 0, y: 0, width: 1366, height: 728 }

    await bootFresh({ prefs: { lang: 'en' } })
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))

    expect(panel().getBounds()).toEqual({
      x: 1366 - 4 - 56 - 8 - 470,
      y: 12,
      width: 470,
      height: 728 - 24,
    })
    expect(ball().getBounds()).toMatchObject({ x: 1306, y: 336 })
  })

  it('leaves everything as it was for data that already existed', async () => {
    await boot()

    expect(ball().isVisible()).toBe(false)
    expect(panel().getBounds().x).toBe(Math.round((1920 - 400) / 2))
    expect(data().window.dockPosition).toBeUndefined()
  })

  it('leaves a window the user has placed alone, whatever the installation', async () => {
    await bootFresh({
      window: { bounds: { x: 100, y: 50, w: 760, h: 720 } },
    })

    expect(panel().getBounds()).toMatchObject({ x: 100, y: 50 })
    expect(ball().isVisible()).toBe(false)
  })

  it('shows no ball when the ball is turned off, and opens in the middle as before', async () => {
    await bootFresh({ showBubble: false })

    expect(ball().isVisible()).toBe(false)
    expect(panel().getBounds().x).toBe(Math.round((1920 - 400) / 2))
  })

  it('does not touch the end-to-end runs unless a spec opts in', async () => {
    const { QUICKLAUNCH_E2E: e2e, QUICKLAUNCH_FIRST_RUN: firstRun } =
      process.env
    process.env.QUICKLAUNCH_E2E = '1'
    delete process.env.QUICKLAUNCH_FIRST_RUN
    try {
      await bootFresh()

      expect(ball().isVisible()).toBe(false)
      expect(panel().getBounds().x).toBe(Math.round((1920 - 400) / 2))
    } finally {
      if (e2e === undefined) delete process.env.QUICKLAUNCH_E2E
      else process.env.QUICKLAUNCH_E2E = e2e
      if (firstRun !== undefined) process.env.QUICKLAUNCH_FIRST_RUN = firstRun
    }
  })

  it('a collapse that comes before the ball is ready wins: the panel is gone and the ball is the full ball', async () => {
    fake.state.fresh = true
    await boot()
    await wm.collapseWindow()

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(panel().isVisible()).toBe(false)
    expect(wm.getWindowSnapshot().collapsed).toBe(true)
  })
})

describe('who brought the panel up (flow-4: the card ticks the shortcut line)', () => {
  const activations = () =>
    fake.state.sent
      .filter(
        (message) =>
          message.windowId === panel().id &&
          message.channel === IPC_CHANNELS.activateLauncher
      )
      .map((message) => message.args[0])

  it('says "hotkey" for the global shortcut', async () => {
    await boot({
      window: { collapsed: true, dockPosition: { x: 1860, y: 500 } },
    })
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))

    later()
    await wm.toggleMainWindow()

    expect(activations()).toEqual(['hotkey'])
  })

  it('says "other" for the ball, the tray and a second launch', async () => {
    await boot({
      window: { collapsed: true, dockPosition: { x: 1860, y: 500 } },
    })
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))

    await wm.activateDock('window')
    await wm.collapseWindow()
    await wm.showMainWindow()

    expect(activations()).toEqual(['other', 'other'])
  })
})
