import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppData } from '../../shared/default-data'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import {
  DEFAULT_PANEL_WIDTH,
  resolveTabMode,
  stackedMinWidth,
} from '../../shared/layout-widths'
import { DOCK_BALL_SIZE, dockWindowSize } from '../../shared/dock-size'
import type {
  AppData,
  Prefs,
  WindowPresentation,
  WindowState,
} from '../../shared/types'
import { DOCK_SIZE } from '../dock-geometry'
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
    listenerCount(event: string): number {
      return (this.listeners.get(event) ?? []).length
    }
    removeAllListeners(): this {
      this.listeners.clear()
      return this
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
    // The fragment the page was loaded with ('' when there is none).
    loadedHash = ''
    // The address, when the page came from the development server instead of a file.
    loadedUrl: string | undefined
    loadURL(url: string): Promise<void> {
      this.loadedUrl = url
      return this.loadFile()
    }
    loadFile(
      _file?: string,
      options?: { query?: Record<string, string>; hash?: string }
    ): Promise<void> {
      this.loadedQuery = options?.query ?? {}
      this.loadedHash = options?.hash ?? ''
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
  // What Windows says about its own light or dark mode; it emits 'updated' when that changes.
  const nativeTheme = Object.assign(new Emitter(), {
    shouldUseDarkColors: false,
  })

  return { FakeWindow, Emitter, screen, nativeTheme, state }
})

vi.mock('electron', () => ({
  app: { getAppPath: () => 'C:\\app' },
  BrowserWindow: fake.FakeWindow,
  screen: fake.screen,
  nativeTheme: fake.nativeTheme,
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

// The work area of the fake display, and the places in it that follow from the size of the ball.
const AREA = { width: 1920, height: 1040 }
/** Where a ball docked to the right edge stands: 4 px off it. */
const RIGHT_EDGE_X = AREA.width - DOCK_SIZE - 4
/** Where a ball on the vertical middle of the work area stands. */
const MIDDLE_Y = Math.round((AREA.height - DOCK_SIZE) / 2)

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

/** What saving the settings does for the size of the ball: stored first, then applied. */
async function setBallSize(ballSize: number): Promise<void> {
  data().prefs.ballSize = ballSize
  await wm.applyBallSizePreference(ballSize)
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
  // The balls of earlier tests no longer listen to Windows, which starts every test in light mode.
  fake.nativeTheme.removeAllListeners()
  fake.nativeTheme.shouldUseDarkColors = false
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
    const saved = { x: RIGHT_EDGE_X, y: 500 }
    await boot({
      window: { collapsed: true, dockPosition: saved, dockEdge: 'right' },
    })

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(ball().getBounds()).toEqual({
      ...saved,
      width: DOCK_SIZE,
      height: DOCK_SIZE,
    })
    // Nothing had to be put right, so nothing was rewritten.
    expect(data().window.dockPosition).toBe(saved)
  })

  it('tells the ball which theme, language and size to use before showing it', async () => {
    await boot({
      prefs: { theme: 'dark', lang: 'en', ballSize: 48 },
      window: { collapsed: true, dockPosition: savedBall },
    })

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    const appearance = fake.state.sent.find(
      (message) =>
        message.windowId === ball().id &&
        message.channel === IPC_CHANNELS.dockAppearance
    )
    expect(appearance?.args[0]).toEqual({
      theme: 'dark',
      lang: 'en',
      ballSize: 48,
    })
  })

  it('loads the ball with the saved theme, language and size, so its first frame is right', async () => {
    await boot({
      prefs: { theme: 'dark', lang: 'ja', ballSize: 48 },
      window: { collapsed: true, dockPosition: savedBall },
    })

    expect(ball().loadedQuery).toEqual({
      view: 'dock',
      theme: 'dark',
      lang: 'ja',
      ball: '48',
    })
    // The panel's loading screen speaks the saved language too. It draws no ball.
    expect(panel().loadedQuery).toEqual({ theme: 'dark', lang: 'ja' })
  })

  it('makes the window of the ball as large as the saved ball needs', async () => {
    await boot({
      prefs: { ballSize: 64 },
      window: { collapsed: true, dockPosition: savedBall, dockEdge: null },
    })

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(dockWindowSize(64)).toBeGreaterThan(DOCK_SIZE)
    expect(ball().getBounds()).toEqual({
      ...savedBall,
      width: dockWindowSize(64),
      height: dockWindowSize(64),
    })
  })

  it('draws a saved size that is out of range at the nearest one the setting offers', async () => {
    await boot({
      prefs: { ballSize: 500 },
      window: { collapsed: true, dockPosition: savedBall, dockEdge: null },
    })

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(ball().loadedQuery.ball).toBe('64')
    expect(ball().getBounds()).toMatchObject({
      width: dockWindowSize(64),
      height: dockWindowSize(64),
    })
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
    // The pointer rests on the middle of the ball it has just pressed.
    fake.state.cursor = {
      x: bounds.x + DOCK_SIZE / 2,
      y: bounds.y + DOCK_SIZE / 2,
    }
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
      x: RIGHT_EDGE_X,
      y: MIDDLE_Y,
      width: DOCK_SIZE,
      height: DOCK_SIZE,
    })
    expect(panel().getBounds()).toEqual({
      x: RIGHT_EDGE_X - 8 - 400,
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

    expect(data().window.dockPosition).toEqual({
      x: RIGHT_EDGE_X,
      y: MIDDLE_Y,
    })
    expect(data().window.dockEdge).toBe('right')
    expect(data().window.bounds).toEqual({
      x: RIGHT_EDGE_X - 8 - 400,
      y: 160,
      w: 400,
      h: 720,
    })
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
      x: 1366 - 4 - DOCK_SIZE - 8 - 470,
      y: 12,
      width: 470,
      height: 728 - 24,
    })
    expect(ball().getBounds()).toMatchObject({
      x: 1366 - 4 - DOCK_SIZE,
      y: Math.round((728 - DOCK_SIZE) / 2),
    })
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
      window: { collapsed: true, dockPosition: { x: RIGHT_EDGE_X, y: 500 } },
    })
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))

    later()
    await wm.toggleMainWindow()

    expect(activations()).toEqual(['hotkey'])
  })

  it('says "other" for the ball, the tray and a second launch', async () => {
    await boot({
      window: { collapsed: true, dockPosition: { x: RIGHT_EDGE_X, y: 500 } },
    })
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))

    await wm.activateDock('window')
    await wm.collapseWindow()
    await wm.showMainWindow()

    expect(activations()).toEqual(['other', 'other'])
  })
})

// A panel with its ball beside it, both away from the screen edges: the ball stands 8 px to the
// right of the panel, top on top. A ball opens a panel it has no place for on its own right, so
// this pair is one that only stays as it is when its place is remembered.
const PAIR_PANEL = { x: 600, y: 100, width: 400, height: 600 }
const PAIR_BALL = { x: PAIR_PANEL.x + PAIR_PANEL.width + 8, y: PAIR_PANEL.y }
const BALL_SIZE = { width: DOCK_SIZE, height: DOCK_SIZE }

/** Starts with the panel at PAIR_PANEL and the ball at `ballAt`, both on screen. */
async function bootPair(
  ballAt: { x: number; y: number } = PAIR_BALL,
  prefs: Partial<Prefs> = {}
): Promise<void> {
  await boot({
    prefs,
    window: {
      bounds: {
        x: PAIR_PANEL.x,
        y: PAIR_PANEL.y,
        w: PAIR_PANEL.width,
        h: PAIR_PANEL.height,
      },
      dockPosition: ballAt,
      dockEdge: null,
    },
  })
  // With data that already existed the ball shows once the panel has been folded into it.
  await wm.collapseWindow()
  await wm.showMainWindow()
  expect(ball().isVisible()).toBe(true)
  expect(ball().getBounds()).toEqual({ ...ballAt, ...BALL_SIZE })
  expect(panel().isVisible()).toBe(true)
  expect(panel().getBounds()).toEqual(PAIR_PANEL)
}

/** One step of a drag of the panel by its title bar, as Windows reports it. */
function dragPanelTo(x: number, y: number): void {
  panel().emit('will-move')
  panel().setPosition(x, y)
  panel().emit('move')
}

/** The user lets go of the title bar. */
function releasePanel(): void {
  panel().emit('moved')
}

// A drag of the ball, as its page reports it: where the pointer went down, and how far it has
// gone since.
const BALL_PRESS = { x: 20, y: 20 }
const pressBall = () => wm.dragDock({ phase: 'start', ...BALL_PRESS })
const moveBallBy = (dx: number, dy: number) =>
  wm.dragDock({ phase: 'move', x: BALL_PRESS.x + dx, y: BALL_PRESS.y + dy })
const releaseBallAt = (dx: number, dy: number) =>
  wm.dragDock({ phase: 'end', x: BALL_PRESS.x + dx, y: BALL_PRESS.y + dy })

describe('dragging the panel by its title bar takes the ball along', () => {
  it('moves the ball with every step, by as much as the panel has gone', async () => {
    await bootPair()

    dragPanelTo(PAIR_PANEL.x - 100, PAIR_PANEL.y + 20)
    expect(ball().getBounds()).toEqual({
      x: PAIR_BALL.x - 100,
      y: PAIR_BALL.y + 20,
      ...BALL_SIZE,
    })

    dragPanelTo(PAIR_PANEL.x - 250, PAIR_PANEL.y + 60)
    expect(ball().getBounds()).toEqual({
      x: PAIR_BALL.x - 250,
      y: PAIR_BALL.y + 60,
      ...BALL_SIZE,
    })
  })

  it('leaves the pair where the drag ended and remembers the place of both', async () => {
    await bootPair()

    dragPanelTo(PAIR_PANEL.x - 100, PAIR_PANEL.y + 20)
    dragPanelTo(PAIR_PANEL.x - 250, PAIR_PANEL.y + 60)
    releasePanel()

    await vi.waitFor(() =>
      expect(data().window.bounds).toEqual({
        x: PAIR_PANEL.x - 250,
        y: PAIR_PANEL.y + 60,
        w: PAIR_PANEL.width,
        h: PAIR_PANEL.height,
      })
    )
    expect(ball().getBounds()).toEqual({
      x: PAIR_BALL.x - 250,
      y: PAIR_BALL.y + 60,
      ...BALL_SIZE,
    })
    expect(data().window.dockPosition).toEqual({
      x: PAIR_BALL.x - 250,
      y: PAIR_BALL.y + 60,
    })
    expect(data().window.dockEdge).toBeNull()
    // It was a move, not a collapse.
    expect(panel().isVisible()).toBe(true)
    expect(wm.getWindowSnapshot().collapsed).toBe(false)
  })

  it('takes a ball off the edge it was docked to', async () => {
    fake.state.fresh = true
    await boot()
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(data().window.dockEdge).toBe('right')
    const start = panel().getBounds()

    dragPanelTo(start.x - 300, start.y + 30)
    releasePanel()

    await vi.waitFor(() => expect(data().window.dockEdge).toBeNull())
    expect(ball().getBounds()).toMatchObject({
      x: RIGHT_EDGE_X - 300,
      y: MIDDLE_Y + 30,
    })
    expect(data().window.dockPosition).toEqual({
      x: RIGHT_EDGE_X - 300,
      y: MIDDLE_Y + 30,
    })
  })

  it('keeps the ball on the screen when the panel is dragged partly off it, and loses nothing by it', async () => {
    await bootPair()

    // The ball stands at the top of the panel: 1000 px further down it would be below the screen.
    dragPanelTo(PAIR_PANEL.x, PAIR_PANEL.y + 1000)
    expect(ball().getBounds()).toEqual({
      x: PAIR_BALL.x,
      y: AREA.height - DOCK_SIZE,
      ...BALL_SIZE,
    })

    // On the way back the ball is beside the panel again: every step is measured from where the
    // drag began, not from the step before.
    dragPanelTo(PAIR_PANEL.x, PAIR_PANEL.y + 20)
    expect(ball().getBounds()).toMatchObject({
      x: PAIR_BALL.x,
      y: PAIR_BALL.y + 20,
    })
  })

  it('remembers the ball where the screen kept it', async () => {
    await bootPair()

    dragPanelTo(PAIR_PANEL.x, PAIR_PANEL.y + 1000)
    releasePanel()

    const kept = { x: PAIR_BALL.x, y: AREA.height - DOCK_SIZE }
    await vi.waitFor(() => expect(data().window.dockPosition).toEqual(kept))
    expect(ball().getBounds()).toMatchObject(kept)
  })

  it('takes a panel that is a pixel beside where the last step left it for the same drag', async () => {
    await bootPair()

    dragPanelTo(PAIR_PANEL.x - 100, PAIR_PANEL.y)
    // At a fractional display scale Windows can report the panel a pixel off.
    panel().setPosition(PAIR_PANEL.x - 101, PAIR_PANEL.y + 1)
    dragPanelTo(PAIR_PANEL.x - 200, PAIR_PANEL.y)

    expect(ball().getBounds()).toMatchObject({
      x: PAIR_BALL.x - 200,
      y: PAIR_BALL.y,
    })
  })

  it('begins a new drag when the panel is not where the last step left it', async () => {
    await bootPair()
    // A drag whose end was never reported...
    dragPanelTo(PAIR_PANEL.x - 100, PAIR_PANEL.y)
    // ...after which the panel was put somewhere else.
    panel().setPosition(200, 300)

    dragPanelTo(210, 300)

    // The ball has gone the 10 px of the new drag from where it stood, and no further.
    expect(ball().getBounds()).toMatchObject({
      x: PAIR_BALL.x - 100 + 10,
      y: PAIR_BALL.y,
    })
  })

  it('begins every drag anew: the second is measured from where the first one ended', async () => {
    await bootPair()
    dragPanelTo(PAIR_PANEL.x - 100, PAIR_PANEL.y + 20)
    releasePanel()

    dragPanelTo(PAIR_PANEL.x - 100 + 30, PAIR_PANEL.y + 20 + 5)
    releasePanel()

    await vi.waitFor(() =>
      expect(data().window.dockPosition).toEqual({
        x: PAIR_BALL.x - 70,
        y: PAIR_BALL.y + 25,
      })
    )
    expect(ball().getBounds()).toMatchObject({
      x: PAIR_BALL.x - 70,
      y: PAIR_BALL.y + 25,
    })
  })

  it('does not take a move of the panel the app made itself for a drag', async () => {
    await bootPair()

    panel().setPosition(PAIR_PANEL.x - 100, PAIR_PANEL.y)
    panel().emit('move')

    expect(ball().getBounds()).toMatchObject(PAIR_BALL)
  })

  it('leaves a ball that is not on screen alone', async () => {
    await boot({
      window: {
        bounds: { x: 600, y: 100, w: 400, h: 600 },
        dockPosition: PAIR_BALL,
        dockEdge: null,
      },
    })
    expect(ball().isVisible()).toBe(false)

    dragPanelTo(500, 150)
    releasePanel()

    await vi.waitFor(() =>
      expect(data().window.bounds).toMatchObject({ x: 500, y: 150 })
    )
    expect(ball().isVisible()).toBe(false)
    expect(ball().getBounds()).toMatchObject(PAIR_BALL)
    expect(data().window.dockPosition).toEqual(PAIR_BALL)
  })

  it('measures a drag whose beginning the ball missed from where the pair was last laid out', async () => {
    await boot({
      window: {
        bounds: { x: 600, y: 100, w: 400, h: 600 },
        dockPosition: PAIR_BALL,
        dockEdge: null,
      },
    })
    panel().emit('will-move')
    // The ball comes on screen while the panel is already under way.
    ball().showInactive()
    panel().setPosition(PAIR_PANEL.x + 100, PAIR_PANEL.y + 50)

    releasePanel()

    const beside = { x: PAIR_BALL.x + 100, y: PAIR_BALL.y + 50 }
    expect(ball().getBounds()).toMatchObject(beside)
    await vi.waitFor(() => expect(data().window.dockPosition).toEqual(beside))
  })

  it('still folds a panel that is let go at a screen edge into the ball there', async () => {
    await bootPair()

    dragPanelTo(0, 200)
    // On the way the ball has come along...
    expect(ball().getBounds()).toMatchObject({
      x: PAIR_BALL.x - PAIR_PANEL.x,
      y: PAIR_BALL.y + 100,
    })
    releasePanel()

    await vi.waitFor(() => expect(panel().isVisible()).toBe(false))
    // ...and at the release it goes to the edge, on the middle of where the panel was let go.
    expect(ball().getBounds()).toEqual({
      x: 4,
      y: Math.round(200 + PAIR_PANEL.height / 2 - DOCK_SIZE / 2),
      ...BALL_SIZE,
    })
    expect(ball().isVisible()).toBe(true)
    expect(wm.getWindowSnapshot().collapsed).toBe(true)
    await vi.waitFor(() => expect(data().window.dockEdge).toBe('left'))
  })

  it('puts the ball on whole pixels when a panel of odd height is let go at the edge', async () => {
    await boot({ window: { bounds: { x: 600, y: 100, w: 400, h: 601 } } })

    dragPanelTo(0, 200)
    releasePanel()

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    const { x, y } = ball().getBounds()
    expect(x).toBe(4)
    expect(Number.isInteger(y)).toBe(true)
    // The middle of the ball on the middle of the panel, to the nearest pixel.
    expect(y).toBe(Math.round(200 + 601 / 2 - DOCK_SIZE / 2))
    await vi.waitFor(() => expect(data().window.dockPosition).toEqual({ x, y }))
  })
})

describe('dragging the ball takes the open panel along', () => {
  it('moves the panel with every step, by as much as the ball has gone', async () => {
    await bootPair()
    await pressBall()

    expect(await moveBallBy(100, 50)).toEqual({ moved: true })
    expect(ball().getBounds()).toEqual({
      x: PAIR_BALL.x + 100,
      y: PAIR_BALL.y + 50,
      ...BALL_SIZE,
    })
    expect(panel().getBounds()).toEqual({
      ...PAIR_PANEL,
      x: PAIR_PANEL.x + 100,
      y: PAIR_PANEL.y + 50,
    })

    await moveBallBy(-300, 200)
    expect(ball().getBounds()).toMatchObject({
      x: PAIR_BALL.x - 300,
      y: PAIR_BALL.y + 200,
    })
    expect(panel().getBounds()).toEqual({
      ...PAIR_PANEL,
      x: PAIR_PANEL.x - 300,
      y: PAIR_PANEL.y + 200,
    })
  })

  it('leaves the panel in its place beside the ball when the drag ends, and remembers both', async () => {
    await bootPair()
    await pressBall()
    await moveBallBy(-300, 200)

    expect(await releaseBallAt(-300, 200)).toEqual({ moved: true })

    expect(ball().getBounds()).toEqual({
      x: PAIR_BALL.x - 300,
      y: PAIR_BALL.y + 200,
      ...BALL_SIZE,
    })
    // Still on the left of the ball, top on top: not laid out afresh on its right.
    expect(panel().getBounds()).toEqual({
      ...PAIR_PANEL,
      x: PAIR_PANEL.x - 300,
      y: PAIR_PANEL.y + 200,
    })
    expect(data().window.bounds).toEqual({
      x: PAIR_PANEL.x - 300,
      y: PAIR_PANEL.y + 200,
      w: PAIR_PANEL.width,
      h: PAIR_PANEL.height,
    })
    expect(data().window.dockPosition).toEqual({
      x: PAIR_BALL.x - 300,
      y: PAIR_BALL.y + 200,
    })
    expect(data().window.dockEdge).toBeNull()
  })

  it('shifts the panel with the ball when the ball snaps to a screen edge', async () => {
    await bootPair()
    // The ball is let go 10 px short of where it stands when docked to the right edge.
    const dx = RIGHT_EDGE_X - 10 - PAIR_BALL.x
    await pressBall()
    await moveBallBy(dx, 0)
    expect(panel().getBounds().x).toBe(PAIR_PANEL.x + dx)

    await releaseBallAt(dx, 0)

    expect(ball().getBounds()).toMatchObject({
      x: RIGHT_EDGE_X,
      y: PAIR_BALL.y,
    })
    // The panel makes the same 10 px, so the gap between the two is what it was; it is not
    // centred on the ball as a panel that is laid out afresh would be.
    expect(panel().getBounds()).toEqual({
      ...PAIR_PANEL,
      x: PAIR_PANEL.x + dx + 10,
    })
    expect(ball().getBounds().x - panel().getBounds().x).toBe(
      PAIR_BALL.x - PAIR_PANEL.x
    )
    expect(data().window.dockEdge).toBe('right')
    expect(data().window.bounds).toMatchObject({
      x: PAIR_PANEL.x + dx + 10,
      y: PAIR_PANEL.y,
    })
  })

  it('lays the panel out afresh when its place beside the ball is off the screen', async () => {
    await bootPair()
    // The panel stands on the left of the ball: at the left edge there is no room for it there.
    const dx = 10 - PAIR_BALL.x
    const dy = 400
    await pressBall()
    await moveBallBy(dx, dy)
    // It has come along, most of it off the screen...
    expect(panel().getBounds()).toEqual({
      ...PAIR_PANEL,
      x: PAIR_PANEL.x + dx,
      y: PAIR_PANEL.y + dy,
    })

    await releaseBallAt(dx, dy)

    expect(ball().getBounds()).toMatchObject({ x: 4, y: PAIR_BALL.y + dy })
    // ...and is put on the other side of the docked ball, on the ball's middle.
    const laidOut = {
      x: 4 + DOCK_SIZE + 8,
      y: Math.round(PAIR_BALL.y + dy + DOCK_SIZE / 2 - PAIR_PANEL.height / 2),
    }
    expect(panel().getBounds()).toEqual({
      ...laidOut,
      width: PAIR_PANEL.width,
      height: PAIR_PANEL.height,
    })
    expect(data().window.dockEdge).toBe('left')
    expect(data().window.bounds).toMatchObject(laidOut)
  })

  it('follows the pointer of the system once the press has become a drag', async () => {
    await bootPair()
    // Pressed 10 px into the ball; from then on the pointer is read from the system.
    const press = { x: 10, y: 12 }
    await wm.dragDock({ phase: 'start', ...press, offset: press })
    fake.state.cursor = {
      x: PAIR_BALL.x + press.x + 150,
      y: PAIR_BALL.y + press.y + 80,
    }

    expect(await wm.dragDock({ phase: 'track', ...press })).toEqual({
      moved: true,
    })

    const followed = {
      ...PAIR_PANEL,
      x: PAIR_PANEL.x + 150,
      y: PAIR_PANEL.y + 80,
    }
    expect(ball().getBounds()).toMatchObject({
      x: PAIR_BALL.x + 150,
      y: PAIR_BALL.y + 80,
    })
    expect(panel().getBounds()).toEqual(followed)

    await wm.dragDock({ phase: 'end', x: press.x + 150, y: press.y + 80 })
    expect(panel().getBounds()).toEqual(followed)
  })

  it('keeps the size of both windows through a drag at a fractional display scale', async () => {
    await bootPair()
    // At 125% or 150% Windows hands a window that is only given a new position back a pixel
    // larger, every time.
    for (const window of [panel(), ball()])
      window.setPosition = (x: number, y: number) => {
        window.bounds = {
          x,
          y,
          width: window.bounds.width + 1,
          height: window.bounds.height + 1,
        }
      }

    await pressBall()
    for (let step = 1; step <= 5; step += 1) {
      await moveBallBy(step * 20, step * 10)
      // Neither has grown on the way: every step gives both windows their size again.
      expect(ball().getBounds(), `step ${step}`).toMatchObject(BALL_SIZE)
      expect(panel().getBounds(), `step ${step}`).toMatchObject({
        width: PAIR_PANEL.width,
        height: PAIR_PANEL.height,
      })
    }
    await releaseBallAt(100, 50)

    expect(ball().getBounds()).toEqual({
      x: PAIR_BALL.x + 100,
      y: PAIR_BALL.y + 50,
      ...BALL_SIZE,
    })
    expect(panel().getBounds()).toEqual({
      ...PAIR_PANEL,
      x: PAIR_PANEL.x + 100,
      y: PAIR_PANEL.y + 50,
    })
    expect(data().window.bounds).toEqual({
      x: PAIR_PANEL.x + 100,
      y: PAIR_PANEL.y + 50,
      w: PAIR_PANEL.width,
      h: PAIR_PANEL.height,
    })
  })

  it('does not move a panel that is folded into the ball', async () => {
    await bootPair()
    await wm.collapseWindow()

    await pressBall()
    await moveBallBy(200, 50)
    await releaseBallAt(200, 50)

    expect(ball().getBounds()).toMatchObject({
      x: PAIR_BALL.x + 200,
      y: PAIR_BALL.y + 50,
    })
    expect(panel().isVisible()).toBe(false)
    expect(panel().getBounds()).toEqual(PAIR_PANEL)
    expect(data().window.dockPosition).toEqual({
      x: PAIR_BALL.x + 200,
      y: PAIR_BALL.y + 50,
    })
  })

  it('moves neither window for a press that never became a drag', async () => {
    await bootPair()
    await pressBall()

    expect(await releaseBallAt(2, 2)).toEqual({ moved: false })

    expect(ball().getBounds()).toEqual({ ...PAIR_BALL, ...BALL_SIZE })
    expect(panel().getBounds()).toEqual(PAIR_PANEL)
    expect(data().window.dockEdge).toBeNull()
  })
})

describe('the panel opens where it last stood beside the ball', () => {
  const display = fake.screen.getPrimaryDisplay()
  const workArea = { ...display.workArea }

  afterEach(() => {
    display.workArea = { ...workArea }
  })

  it('comes back to its place, not to the side the ball would pick for it', async () => {
    await bootPair()
    await wm.collapseWindow()
    expect(panel().isVisible()).toBe(false)

    await wm.showMainWindow()

    // On the left of the ball, as it was. Laid out afresh it would stand on the right.
    expect(panel().getBounds()).toEqual(PAIR_PANEL)
    expect(ball().getBounds()).toEqual({ ...PAIR_BALL, ...BALL_SIZE })
    expect(data().window.bounds).toEqual({
      x: PAIR_PANEL.x,
      y: PAIR_PANEL.y,
      w: PAIR_PANEL.width,
      h: PAIR_PANEL.height,
    })
  })

  it('comes back to where a drag of the panel left the pair', async () => {
    await bootPair()
    dragPanelTo(PAIR_PANEL.x - 250, PAIR_PANEL.y + 60)
    releasePanel()
    await wm.collapseWindow()

    await wm.showMainWindow('peek')

    expect(panel().getBounds()).toEqual({
      ...PAIR_PANEL,
      x: PAIR_PANEL.x - 250,
      y: PAIR_PANEL.y + 60,
    })
    expect(ball().getBounds()).toMatchObject({
      x: PAIR_BALL.x - 250,
      y: PAIR_BALL.y + 60,
    })
  })

  it('comes back to where a drag of the ball left the pair', async () => {
    await bootPair()
    await pressBall()
    await moveBallBy(-300, 200)
    await releaseBallAt(-300, 200)
    await wm.collapseWindow()

    await wm.showMainWindow()

    expect(panel().getBounds()).toEqual({
      ...PAIR_PANEL,
      x: PAIR_PANEL.x - 300,
      y: PAIR_PANEL.y + 200,
    })
  })

  it('is laid out afresh once the ball has been moved without it', async () => {
    await bootPair()
    await wm.collapseWindow()
    await pressBall()
    await moveBallBy(200, 50)
    await releaseBallAt(200, 50)

    await wm.showMainWindow()

    // Where a free ball opens a panel: on its right, top on top, 8 px apart.
    expect(panel().getBounds()).toEqual({
      x: PAIR_BALL.x + 200 + DOCK_SIZE + 8,
      y: PAIR_BALL.y + 50,
      width: PAIR_PANEL.width,
      height: PAIR_PANEL.height,
    })
  })

  it('is laid out afresh when the screen no longer has room for it there', async () => {
    await bootPair()
    await wm.collapseWindow()
    // The work area has become lower than the place of the panel needs (another screen, a
    // taller taskbar).
    display.workArea = { x: 0, y: 0, width: 1920, height: 650 }

    await wm.showMainWindow()

    expect(panel().getBounds()).toEqual({
      x: PAIR_BALL.x + DOCK_SIZE + 8,
      y: 650 - PAIR_PANEL.height,
      width: PAIR_PANEL.width,
      height: PAIR_PANEL.height,
    })
  })

  it.each([
    [1, -1],
    [2, 2],
    [-2, 1],
  ])(
    'still comes back to its place when the ball is reported %i and %i px off where it was put',
    async (dx, dy) => {
      await bootPair()
      await wm.collapseWindow()
      // On a scaled display Windows can hand a window back a pixel or two beside its place.
      ball().setPosition(PAIR_BALL.x + dx, PAIR_BALL.y + dy)

      await wm.showMainWindow()

      expect(panel().getBounds()).toEqual(PAIR_PANEL)
    }
  )

  it('takes a ball that is 3 px off for one that was moved', async () => {
    await bootPair()
    await wm.collapseWindow()
    ball().setPosition(PAIR_BALL.x - 3, PAIR_BALL.y)

    await wm.showMainWindow()

    expect(panel().getBounds()).toEqual({
      ...PAIR_PANEL,
      x: PAIR_BALL.x - 3 + DOCK_SIZE + 8,
    })
  })

  it('is laid out beside a ball that was dragged away from it before the restart', async () => {
    // The panel was folded into the ball, the ball dragged across the screen, the app closed:
    // the saved panel is where it last stood, nowhere near the saved ball.
    const savedBall = { x: 1200, y: 300 }
    await boot({
      window: {
        collapsed: true,
        bounds: { x: 100, y: 50, w: 400, h: 600 },
        dockPosition: savedBall,
        dockEdge: null,
      },
    })
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(ball().getBounds()).toMatchObject(savedBall)

    await wm.activateDock('window')

    const beside = { x: savedBall.x + DOCK_SIZE + 8, y: savedBall.y }
    expect(panel().getBounds()).toEqual({ ...beside, width: 400, height: 600 })
    expect(data().window.bounds).toEqual({ ...beside, w: 400, h: 600 })
    // From now on that is its place.
    await wm.collapseWindow()
    await wm.showMainWindow()
    expect(panel().getBounds()).toEqual({ ...beside, width: 400, height: 600 })
  })

  it('is laid out afresh when its remembered place would cover the ball', async () => {
    // The saved ball stands inside the saved panel.
    const savedBall = { x: 700, y: 300 }
    await boot({
      window: {
        collapsed: true,
        bounds: { x: 600, y: 100, w: 400, h: 600 },
        dockPosition: savedBall,
        dockEdge: null,
      },
    })
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))

    await wm.activateDock('window')

    expect(panel().getBounds()).toEqual({
      x: savedBall.x + DOCK_SIZE + 8,
      y: savedBall.y,
      width: 400,
      height: 600,
    })
    expect(ball().getBounds()).toMatchObject(savedBall)
  })

  it('is laid out afresh after it was resized across the ball', async () => {
    await bootPair()
    // The user drags the right edge of the panel past the ball: the ball now stands in it.
    panel().setBounds({ ...PAIR_PANEL, width: PAIR_PANEL.width + 200 })
    panel().emit('resized')
    await wm.collapseWindow()

    await wm.showMainWindow()

    expect(panel().getBounds()).toEqual({
      ...PAIR_PANEL,
      x: PAIR_BALL.x + DOCK_SIZE + 8,
      width: PAIR_PANEL.width + 200,
    })
    expect(ball().getBounds()).toMatchObject(PAIR_BALL)
  })
})

describe('at launch a ball saved at a screen edge is put flush against it', () => {
  // Where a ball 16 px larger than the one of today stood when it was docked to the right edge.
  const savedForLargerBall = { x: RIGHT_EDGE_X - 16, y: 500 }

  it('moves the ball to the edge and remembers the new place', async () => {
    await boot({
      window: {
        collapsed: true,
        dockPosition: savedForLargerBall,
        dockEdge: 'right',
      },
    })

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(ball().getBounds()).toEqual({
      x: RIGHT_EDGE_X,
      y: 500,
      ...BALL_SIZE,
    })
    expect(data().window.dockPosition).toEqual({ x: RIGHT_EDGE_X, y: 500 })
    expect(data().window.dockEdge).toBe('right')
    expect(data().window.collapsed).toBe(true)
  })

  it('lays the saved panel out beside the ball again, at the size it was saved with', async () => {
    await boot({
      window: {
        bounds: { x: savedForLargerBall.x - 8 - 760, y: 300, w: 760, h: 600 },
        dockPosition: savedForLargerBall,
        dockEdge: 'right',
      },
    })

    // 8 px to the left of the ball and on its middle, as a docked ball opens its panel.
    const place = {
      x: RIGHT_EDGE_X - 8 - 760,
      y: Math.round(500 + DOCK_SIZE / 2 - 600 / 2),
    }
    expect(panel().getBounds()).toEqual({ ...place, width: 760, height: 600 })
    expect(data().window.bounds).toEqual({ ...place, w: 760, h: 600 })

    // The two are a pair: folding and opening moves neither.
    await wm.collapseWindow()
    expect(ball().getBounds()).toMatchObject({ x: RIGHT_EDGE_X, y: 500 })
    await wm.showMainWindow()
    expect(panel().getBounds()).toEqual({ ...place, width: 760, height: 600 })
  })

  it('puts a ball saved at the left edge 4 px off it', async () => {
    await boot({
      window: {
        collapsed: true,
        dockPosition: { x: 20, y: 300 },
        dockEdge: 'left',
      },
    })

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(ball().getBounds()).toMatchObject({ x: 4, y: 300 })
    expect(data().window.dockPosition).toEqual({ x: 4, y: 300 })
    expect(data().window.dockEdge).toBe('left')
  })

  it('takes a panel that was laid out for the larger ball for one that stood beside it', async () => {
    // On the right of a left-docked ball that was 16 px wider, the gap of 8 px further on.
    const savedBall = { x: 20, y: 400 }
    await boot({
      window: {
        bounds: {
          x: savedBall.x + DOCK_SIZE + 16 + 8,
          y: 100,
          w: 760,
          h: 600,
        },
        dockPosition: savedBall,
        dockEdge: 'left',
      },
    })

    expect(panel().getBounds()).toEqual({
      x: 4 + DOCK_SIZE + 8,
      y: Math.round(400 + DOCK_SIZE / 2 - 600 / 2),
      width: 760,
      height: 600,
    })
    expect(data().window.dockPosition).toEqual({ x: 4, y: 400 })
  })

  it('leaves a panel the user put somewhere else where it is, and only moves the ball', async () => {
    const bounds = { x: 100, y: 50, w: 760, h: 720 }
    await boot({
      window: {
        bounds,
        dockPosition: savedForLargerBall,
        dockEdge: 'right',
      },
    })

    expect(panel().getBounds()).toEqual({
      x: 100,
      y: 50,
      width: 760,
      height: 720,
    })
    expect(data().window.bounds).toBe(bounds)
    expect(data().window.dockPosition).toEqual({ x: RIGHT_EDGE_X, y: 500 })
    // The ball is at the edge when it shows.
    await wm.collapseWindow()
    expect(ball().getBounds()).toMatchObject({ x: RIGHT_EDGE_X, y: 500 })
  })

  it('leaves the panel where it is with the ball turned off, though it stood beside the ball', async () => {
    const bounds = {
      x: savedForLargerBall.x - 8 - 760,
      y: 300,
      w: 760,
      h: 600,
    }
    await boot({
      showBubble: false,
      window: {
        bounds,
        dockPosition: savedForLargerBall,
        dockEdge: 'right',
      },
    })

    expect(panel().getBounds()).toEqual({
      x: bounds.x,
      y: 300,
      width: 760,
      height: 600,
    })
    expect(data().window.bounds).toBe(bounds)
    // The ball is still put right, for the day it is turned on again.
    expect(data().window.dockPosition).toEqual({ x: RIGHT_EDGE_X, y: 500 })
  })

  it('leaves a ball that is already flush alone, and the panel where the user put it', async () => {
    const bounds = { x: 100, y: 50, w: 760, h: 720 }
    const dockPosition = { x: RIGHT_EDGE_X, y: 500 }
    await boot({ window: { bounds, dockPosition, dockEdge: 'right' } })

    expect(panel().getBounds()).toEqual({
      x: 100,
      y: 50,
      width: 760,
      height: 720,
    })
    // Nothing was rewritten: these are the very objects that were loaded.
    expect(data().window.bounds).toBe(bounds)
    expect(data().window.dockPosition).toBe(dockPosition)
  })

  it('leaves a free ball where it is, however near the edge', async () => {
    await boot({
      window: {
        collapsed: true,
        dockPosition: savedForLargerBall,
        dockEdge: null,
      },
    })

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(ball().getBounds()).toMatchObject(savedForLargerBall)
    expect(data().window.dockPosition).toEqual(savedForLargerBall)
    expect(data().window.dockEdge).toBeNull()
  })
})

describe('applying a changed ball size at once', () => {
  // The largest ball the setting offers; its window is larger than the one of the default ball.
  const LARGE = 64
  const LARGE_SIZE = dockWindowSize(LARGE)
  const LARGE_WINDOW = { width: LARGE_SIZE, height: LARGE_SIZE }

  type Rect = { x: number; y: number; width: number; height: number }

  /** What the ball was told about its look, in the order it was told. */
  const appearances = () =>
    fake.state.sent
      .filter(
        (message) =>
          message.windowId === ball().id &&
          message.channel === IPC_CHANNELS.dockAppearance
      )
      .map((message) => message.args[0])

  /** Starts with the panel folded into a ball at `dockPosition`. */
  async function bootBall(
    dockPosition: { x: number; y: number },
    dockEdge: WindowState['dockEdge'] = null
  ): Promise<void> {
    await boot({ window: { collapsed: true, dockPosition, dockEdge } })
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(ball().getBounds()).toEqual({ ...dockPosition, ...BALL_SIZE })
  }

  /**
   * The window of the ball grew or shrank around its middle. It moves in steps of four pixels,
   * which are whole screen pixels at the display scales of Windows (125%, 150%), so the middle is
   * where it was to within two pixels.
   */
  function expectSameMiddle(
    before: Rect,
    after: Rect,
    axes: Array<'x' | 'y'> = ['x', 'y']
  ): void {
    for (const axis of axes) {
      const side = axis === 'x' ? 'width' : 'height'
      const moved = after[axis] - before[axis]
      expect(Math.abs(moved) % 4, `${axis} moved by ${moved}`).toBe(0)
      expect(
        Math.abs(
          after[axis] + after[side] / 2 - (before[axis] + before[side] / 2)
        ),
        `the middle on ${axis}`
      ).toBeLessThanOrEqual(2)
    }
  }

  /** A window went from `before` to `target` in steps of four pixels: it is there to within two. */
  function expectMovedTo(
    before: Rect,
    after: Rect,
    target: { x: number; y: number }
  ): void {
    for (const axis of ['x', 'y'] as const) {
      const moved = after[axis] - before[axis]
      expect(Math.abs(moved) % 4, `${axis} moved by ${moved}`).toBe(0)
      expect(
        Math.abs(after[axis] - target[axis]),
        `the place on ${axis}`
      ).toBeLessThanOrEqual(2)
    }
  }

  it('has a larger window to give: the tests below would say nothing otherwise', () => {
    expect(LARGE_SIZE).toBeGreaterThan(DOCK_SIZE)
  })

  it('keeps a ball docked to the right edge flush against it, and remembers the new place', async () => {
    await bootBall({ x: RIGHT_EDGE_X, y: 500 }, 'right')
    const before = ball().getBounds()

    await setBallSize(LARGE)

    const after = ball().getBounds()
    // 4 px off the edge as before, to the pixel, and on the same middle.
    expect(after).toMatchObject({
      x: AREA.width - LARGE_SIZE - 4,
      ...LARGE_WINDOW,
    })
    expectSameMiddle(before, after, ['y'])
    expect(data().window.dockPosition).toEqual({ x: after.x, y: after.y })
    expect(data().window.dockEdge).toBe('right')
    // It is still the ball the panel is folded into.
    expect(ball().isVisible()).toBe(true)
    expect(panel().isVisible()).toBe(false)
    expect(data().window.collapsed).toBe(true)
  })

  it('keeps a ball docked to the left edge 4 px off it', async () => {
    await bootBall({ x: 4, y: 500 }, 'left')
    const before = ball().getBounds()

    await setBallSize(LARGE)

    const after = ball().getBounds()
    expect(after).toMatchObject({ x: 4, ...LARGE_WINDOW })
    expectSameMiddle(before, after, ['y'])
    expect(data().window.dockPosition).toEqual({ x: 4, y: after.y })
    expect(data().window.dockEdge).toBe('left')
  })

  it('keeps the middle of a free ball where it was, and remembers the new place', async () => {
    await bootBall({ x: 300, y: 420 })
    const before = ball().getBounds()

    await setBallSize(LARGE)

    const after = ball().getBounds()
    expect(after).toMatchObject(LARGE_WINDOW)
    expectSameMiddle(before, after)
    // The window grew, so its corner went up and to the left.
    expect(after.x).toBeLessThan(before.x)
    expect(after.y).toBeLessThan(before.y)
    expect(data().window.dockPosition).toEqual({ x: after.x, y: after.y })
    expect(data().window.dockEdge).toBeNull()
  })

  // Every size of the slider whose window differs from the one before it.
  it.each([
    [DOCK_BALL_SIZE, 32],
    [DOCK_BALL_SIZE, 36],
    [DOCK_BALL_SIZE, 48],
    [DOCK_BALL_SIZE, 62],
    [LARGE, 48],
    [LARGE, 34],
    [LARGE, DOCK_BALL_SIZE],
    [LARGE, 24],
  ])(
    'keeps the middle of a free ball from %i px to %i px',
    async (from, to) => {
      await bootBall({ x: 300, y: 420 })
      await setBallSize(from)
      const before = ball().getBounds()
      expect(before).toMatchObject({ width: dockWindowSize(from) })

      await setBallSize(to)

      const after = ball().getBounds()
      expect(after).toMatchObject({
        width: dockWindowSize(to),
        height: dockWindowSize(to),
      })
      expectSameMiddle(before, after)
    }
  )

  // Growing and shrinking move the ball by the same amount: trying sizes out does not walk it
  // across the screen.
  it.each([24, 32, 36, 48, 62, LARGE])(
    'is back where it was when the size goes to %i px and back, however often',
    async (other) => {
      await bootBall({ x: 300, y: 420 })

      for (let round = 0; round < 3; round += 1) {
        await setBallSize(other)
        await setBallSize(DOCK_BALL_SIZE)

        expect(ball().getBounds(), `round ${round}`).toEqual({
          x: 300,
          y: 420,
          ...BALL_SIZE,
        })
      }
      expect(data().window.dockPosition).toEqual({ x: 300, y: 420 })
    }
  )

  it('keeps a ball that grows at the bottom of the screen on the screen', async () => {
    await bootBall({ x: 300, y: AREA.height - DOCK_SIZE })
    const before = ball().getBounds()

    await setBallSize(LARGE)

    const after = ball().getBounds()
    expect(after).toMatchObject({
      y: AREA.height - LARGE_SIZE,
      ...LARGE_WINDOW,
    })
    expectSameMiddle(before, after, ['x'])
  })

  it('lays a panel that stood beside a docked ball out beside it again', async () => {
    fake.state.fresh = true
    await boot()
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    const before = panel().getBounds()
    expect(before.x + before.width + 8).toBe(RIGHT_EDGE_X)

    await setBallSize(LARGE)

    const dock = ball().getBounds()
    expect(dock).toMatchObject({
      x: AREA.width - LARGE_SIZE - 4,
      ...LARGE_WINDOW,
    })
    expectSameMiddle({ x: RIGHT_EDGE_X, y: MIDDLE_Y, ...BALL_SIZE }, dock, [
      'y',
    ])
    // 8 px to the left of the larger ball and on its middle, as a docked ball opens its panel. The
    // panel goes there from where it stood in steps of four pixels, like the ball: it is in that
    // place to within two.
    const placed = panel().getBounds()
    expect(placed).toMatchObject({
      width: before.width,
      height: before.height,
    })
    expectMovedTo(before, placed, {
      x: dock.x - 8 - before.width,
      y: Math.round(dock.y + LARGE_SIZE / 2 - before.height / 2),
    })
    expect(data().window.bounds).toEqual({
      x: placed.x,
      y: placed.y,
      w: placed.width,
      h: placed.height,
    })

    // The two are a pair again: folding and opening moves neither.
    await wm.collapseWindow()
    expect(ball().getBounds()).toEqual(dock)
    await wm.showMainWindow()
    expect(panel().getBounds()).toEqual(placed)
  })

  it('lays a panel that stood beside a free ball out beside it again, 8 px from it', async () => {
    await bootPair()

    await setBallSize(LARGE)

    const dock = ball().getBounds()
    expect(dock).toMatchObject(LARGE_WINDOW)
    expectSameMiddle({ ...PAIR_BALL, ...BALL_SIZE }, dock)
    // Where it stood the grown ball would reach into it. It stays on the side of the ball it stood
    // on, the left, as far from it as it was (the gap, to within the two pixels a step of four
    // leaves): it does not jump across the ball. That place is remembered.
    const moved = panel().getBounds()
    expect(moved).toMatchObject({
      width: PAIR_PANEL.width,
      height: PAIR_PANEL.height,
    })
    expect(moved.x + moved.width).toBeLessThanOrEqual(dock.x)
    const gap = dock.x - (moved.x + moved.width)
    expect(Math.abs(gap - 8)).toBeLessThanOrEqual(2)
    expect(Math.abs(moved.x - PAIR_PANEL.x) % 4).toBe(0)
    expect(Math.abs(moved.y - PAIR_PANEL.y) % 4).toBe(0)
    expect(moved.y).toBeLessThan(dock.y + dock.height)
    expect(moved.y + moved.height).toBeGreaterThan(dock.y)
    expect(data().window.bounds).toEqual({
      x: moved.x,
      y: moved.y,
      w: moved.width,
      h: moved.height,
    })

    await wm.collapseWindow()
    await wm.showMainWindow()
    expect(panel().getBounds()).toEqual(moved)
    expect(ball().getBounds()).toEqual(dock)
  })

  // At a display scale of 125% a window that does not start on a whole screen pixel reports a
  // pixel more than it was given. What it reports must never become its size.
  it('gives the panel it moves the size it was saved with, not the pixel more the window reports', async () => {
    await bootPair()
    panel().setBounds({ ...PAIR_PANEL, height: PAIR_PANEL.height + 1 })
    expect(data().window.bounds).toMatchObject({ h: PAIR_PANEL.height })

    await setBallSize(LARGE)

    expect(panel().getBounds()).toMatchObject({
      width: PAIR_PANEL.width,
      height: PAIR_PANEL.height,
    })
    expect(data().window.bounds).toMatchObject({
      w: PAIR_PANEL.width,
      h: PAIR_PANEL.height,
    })
    // It did move: the size above is the one it was given, not one it was left with.
    expect(panel().getBounds().x).not.toBe(PAIR_PANEL.x)
  })

  it('leaves a panel that stood somewhere else where it is', async () => {
    const bounds = { x: 100, y: 50, w: 760, h: 720 }
    await boot({
      window: { bounds, dockPosition: { x: 1200, y: 300 }, dockEdge: null },
    })

    await setBallSize(LARGE)

    expect(panel().getBounds()).toEqual({
      x: 100,
      y: 50,
      width: 760,
      height: 720,
    })
    // Nothing about the panel was rewritten: this is the very object that was loaded.
    expect(data().window.bounds).toBe(bounds)
    // The ball is not on screen, and is made ready for the next time the panel folds into it.
    expect(ball().isVisible()).toBe(false)
    const dock = ball().getBounds()
    expect(dock).toMatchObject(LARGE_WINDOW)
    expectSameMiddle({ x: 1200, y: 300, ...BALL_SIZE }, dock)
    expect(data().window.dockPosition).toEqual({ x: dock.x, y: dock.y })
  })

  it('leaves the panel where it is while the ball is turned off, though it stood beside the ball', async () => {
    await bootPair()
    await setBubblePreference(false)
    expect(ball().isVisible()).toBe(false)

    await setBallSize(LARGE)

    expect(panel().getBounds()).toEqual(PAIR_PANEL)
    // The ball is still given its size, for the day it is turned on again.
    expect(ball().getBounds()).toMatchObject(LARGE_WINDOW)
    expect(ball().isVisible()).toBe(false)
  })

  it('tells the ball how large to draw itself in its new window', async () => {
    await bootBall({ x: 300, y: 420 })
    fake.state.sent.length = 0

    await setBallSize(LARGE)

    expect(appearances()).toEqual([
      { theme: 'light', lang: 'zh', ballSize: LARGE },
    ])
  })

  it('only tells the ball its size when the window stays as large as it was', async () => {
    await bootPair()
    const saved = data().window
    fake.state.sent.length = 0
    // The smallest ball has the window of the default one: Windows makes none smaller.
    expect(dockWindowSize(24)).toBe(DOCK_SIZE)

    await setBallSize(24)

    expect(appearances()).toEqual([
      { theme: 'light', lang: 'zh', ballSize: 24 },
    ])
    expect(ball().getBounds()).toEqual({ ...PAIR_BALL, ...BALL_SIZE })
    expect(panel().getBounds()).toEqual(PAIR_PANEL)
    // Nothing was moved, so nothing was written.
    expect(data().window).toBe(saved)
  })

  it('places what comes afterwards by the new size', async () => {
    await bootBall({ x: 300, y: 120 })
    await setBallSize(LARGE)
    const dock = ball().getBounds()

    await wm.activateDock('window')

    // Where a free ball opens its panel: on its right, top on top, 8 px from its window.
    expect(panel().getBounds()).toMatchObject({
      x: dock.x + LARGE_SIZE + 8,
      y: dock.y,
    })
    expect(ball().getBounds()).toEqual(dock)
  })

  it('tells the panel the side of the window of the ball, for its animation to find the centre of the ball', async () => {
    await boot()
    await setBallSize(LARGE)
    fake.state.sent.length = 0

    await wm.collapseWindow()

    const presentations = fake.state.sent
      .filter(
        (message) =>
          message.windowId === panel().id &&
          message.channel === IPC_CHANNELS.prepareWindowShow
      )
      .map((message) => message.args[1] as WindowPresentation)
    expect(presentations.length).toBeGreaterThan(0)
    for (const presentation of presentations)
      expect(presentation.dockSize, presentation.stage).toBe(LARGE_SIZE)
  })

  it('does nothing once the app is quitting', async () => {
    await bootBall({ x: 300, y: 420 })
    const saved = data().window
    fake.state.sent.length = 0

    wm.prepareToQuit()
    await setBallSize(LARGE)

    expect(ball().getBounds()).toEqual({ x: 300, y: 420, ...BALL_SIZE })
    expect(data().window).toBe(saved)
    expect(appearances()).toEqual([])
  })

  it('moves the saved ball of a start that has no ball window yet', async () => {
    const initial = createDefaultAppData()
    initial.window = {
      ...initial.window,
      dockPosition: { x: RIGHT_EDGE_X, y: 500 },
      dockEdge: 'right',
    }
    fake.state.data = initial

    await setBallSize(LARGE)

    expect(fake.state.windows).toHaveLength(0)
    const saved = data().window.dockPosition!
    expect(saved.x).toBe(AREA.width - LARGE_SIZE - 4)
    expectSameMiddle(
      { x: RIGHT_EDGE_X, y: 500, ...BALL_SIZE },
      { ...saved, ...LARGE_WINDOW },
      ['y']
    )
    expect(data().window.dockEdge).toBe('right')
  })
})

describe('at launch a panel that was never resized gets the width its tab names need', () => {
  /** The width the names of `lang` are given: what they need and ten pixels to spare. */
  const roomFor = (lang: Prefs['lang'], zoom = 1, tabCount = 7) =>
    Math.ceil((stackedMinWidth(lang, tabCount) + 10) * zoom)

  it('widens the 400 px a Chinese start opened at for English, whose names are longer', async () => {
    await boot({
      prefs: { lang: 'en' },
      window: { bounds: { x: 100, y: 50, w: 400, h: 720 } },
    })

    const width = roomFor('en')
    expect(width).toBe(470)
    expect(panel().getBounds()).toEqual({ x: 100, y: 50, width, height: 720 })
    expect(data().window.bounds).toEqual({ x: 100, y: 50, w: width, h: 720 })
    // What it is for: at 400 the English tabs are icons only, now they have their names.
    expect(resolveTabMode('en', 400)).toBe('icons')
    expect(resolveTabMode('en', width)).toBe('stacked')
  })

  it('grows to the left when the saved ball is on the right of the panel: its right edge stays', async () => {
    await boot({
      prefs: { lang: 'en' },
      window: {
        bounds: { x: 600, y: 100, w: 400, h: 600 },
        dockPosition: PAIR_BALL,
        dockEdge: null,
      },
    })

    const width = roomFor('en')
    expect(panel().getBounds()).toEqual({
      x: 600 + 400 - width,
      y: 100,
      width,
      height: 600,
    })
    expect(panel().getBounds().x + width).toBe(PAIR_BALL.x - 8)
  })

  it('never grows past the left edge of the screen: what is saved is where the window is', async () => {
    await boot({
      prefs: { lang: 'en' },
      window: {
        bounds: { x: 10, y: 100, w: 400, h: 600 },
        dockPosition: { x: 10 + 400 + 8, y: 100 },
        dockEdge: null,
      },
    })

    const width = roomFor('en')
    expect(panel().getBounds()).toEqual({ x: 0, y: 100, width, height: 600 })
    expect(data().window.bounds).toEqual({ x: 0, y: 100, w: width, h: 600 })
  })

  it('keeps its left edge when the saved ball is on its left', async () => {
    await boot({
      prefs: { lang: 'en' },
      window: {
        bounds: { x: 600, y: 100, w: 400, h: 600 },
        dockPosition: { x: 600 - 8 - DOCK_SIZE, y: 100 },
        dockEdge: null,
      },
    })

    expect(panel().getBounds()).toEqual({
      x: 600,
      y: 100,
      width: roomFor('en'),
      height: 600,
    })
  })

  it('widens the panel beside a ball that was put back to the edge', async () => {
    const savedBall = { x: RIGHT_EDGE_X - 16, y: 500 }
    await boot({
      prefs: { lang: 'en' },
      window: {
        bounds: { x: savedBall.x - 8 - 400, y: 220, w: 400, h: 600 },
        dockPosition: savedBall,
        dockEdge: 'right',
      },
    })

    const width = roomFor('en')
    expect(panel().getBounds()).toMatchObject({
      x: RIGHT_EDGE_X - 8 - width,
      width,
    })
    expect(data().window.dockPosition).toEqual({ x: RIGHT_EDGE_X, y: 500 })
  })

  it('leaves 400 px alone in Chinese, where the names fit', async () => {
    const bounds = { x: 100, y: 50, w: 400, h: 720 }
    await boot({ window: { bounds } })

    expect(panel().getBounds()).toEqual({
      x: 100,
      y: 50,
      width: 400,
      height: 720,
    })
    expect(data().window.bounds).toBe(bounds)
  })

  it.each([380, 397, 403, 440])(
    'leaves a width the user chose alone, though it shows icons only: %i in English',
    async (w) => {
      const bounds = { x: 100, y: 50, w, h: 720 }
      await boot({ prefs: { lang: 'en' }, window: { bounds } })

      expect(resolveTabMode('en', w)).toBe('icons')
      expect(panel().getBounds()).toMatchObject({ x: 100, width: w })
      expect(data().window.bounds).toBe(bounds)
    }
  )

  it.each([398, 402])(
    'takes a width within 2 px of a default one for a panel nobody resized: %i',
    async (w) => {
      await boot({
        prefs: { lang: 'en' },
        window: { bounds: { x: 100, y: 50, w, h: 720 } },
      })

      expect(panel().getBounds()).toMatchObject({
        x: 100,
        width: roomFor('en'),
      })
    }
  )

  it('knows the default widths of every language as widths nobody chose', async () => {
    // The English default, zoomed until its names no longer fit.
    await boot({
      prefs: { lang: 'en', zoom: 1.2 },
      window: {
        bounds: { x: 100, y: 50, w: DEFAULT_PANEL_WIDTH.en, h: 720 },
      },
    })

    const width = roomFor('en', 1.2)
    expect(resolveTabMode('en', Math.round(DEFAULT_PANEL_WIDTH.en / 1.2))).toBe(
      'icons'
    )
    expect(panel().getBounds()).toMatchObject({ x: 100, width })
    expect(resolveTabMode('en', Math.round(width / 1.2))).toBe('stacked')
  })

  it('does not widen for categories that are hidden: fewer names need less room', async () => {
    const bounds = { x: 100, y: 50, w: 400, h: 720 }
    await boot({
      prefs: {
        lang: 'en',
        hiddenTabs: ['apps', 'passwords', 'commands', 'notes'],
      },
      window: { bounds },
    })

    expect(panel().getBounds()).toMatchObject({ x: 100, width: 400 })
    expect(data().window.bounds).toBe(bounds)
  })

  it('leaves a new installation to its first-run layout', async () => {
    fake.state.fresh = true
    await boot({ prefs: { lang: 'en' } })
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))

    expect(panel().getBounds()).toMatchObject({
      x: RIGHT_EDGE_X - 8 - DEFAULT_PANEL_WIDTH.en,
      width: DEFAULT_PANEL_WIDTH.en,
    })
  })
})

describe('a change of language, zoom or categories keeps the names on the tabs', () => {
  const display = fake.screen.getPrimaryDisplay()
  const workArea = { ...display.workArea }

  afterEach(() => {
    display.workArea = { ...workArea }
  })

  const prefs = (changes: Partial<Prefs> = {}): Prefs => ({
    ...createDefaultAppData().prefs,
    ...changes,
  })
  /** The width the names of `lang` are given: what they need and ten pixels to spare. */
  const roomFor = (lang: Prefs['lang'], zoom = 1, tabCount = 7) =>
    Math.ceil((stackedMinWidth(lang, tabCount) + 10) * zoom)

  it('widens a 400 px panel for English, whose names are longer than the Chinese ones', async () => {
    await boot()
    const before = panel().getBounds()
    expect(before.width).toBe(400)

    await wm.keepTabNamesVisible(prefs({ lang: 'zh' }), prefs({ lang: 'en' }))

    const width = roomFor('en')
    expect(width).toBeGreaterThan(400)
    // No ball on screen: the panel keeps its left edge.
    expect(panel().getBounds()).toEqual({ ...before, width })
    expect(resolveTabMode('en', width)).toBe('stacked')
    expect(data().window.bounds).toEqual({
      x: before.x,
      y: before.y,
      w: width,
      h: before.height,
    })
  })

  it('grows away from a ball on its right: the edge next to the ball stays', async () => {
    await bootPair()

    await wm.keepTabNamesVisible(prefs({ lang: 'zh' }), prefs({ lang: 'en' }))

    const width = roomFor('en')
    const widened = {
      ...PAIR_PANEL,
      x: PAIR_PANEL.x + PAIR_PANEL.width - width,
      width,
    }
    expect(panel().getBounds()).toEqual(widened)
    expect(ball().getBounds()).toEqual({ ...PAIR_BALL, ...BALL_SIZE })
    expect(data().window.bounds).toMatchObject({ x: widened.x, w: width })

    // The wider panel is what the ball opens from now on, in that same place.
    await wm.collapseWindow()
    await wm.showMainWindow()
    expect(panel().getBounds()).toEqual(widened)
  })

  it('grows to the right with the ball on its left', async () => {
    await bootPair({ x: PAIR_PANEL.x - 8 - DOCK_SIZE, y: PAIR_PANEL.y })

    await wm.keepTabNamesVisible(prefs({ lang: 'zh' }), prefs({ lang: 'en' }))

    expect(panel().getBounds()).toEqual({
      ...PAIR_PANEL,
      width: roomFor('en'),
    })
  })

  it('widens for a larger zoom, by what the names need at that zoom', async () => {
    await boot()
    const before = panel().getBounds()

    await wm.keepTabNamesVisible(prefs({ zoom: 1 }), prefs({ zoom: 1.4 }))

    const width = roomFor('zh', 1.4)
    expect(resolveTabMode('zh', Math.round(400 / 1.4))).toBe('icons')
    expect(panel().getBounds()).toEqual({ ...before, width })
    expect(resolveTabMode('zh', Math.round(width / 1.4))).toBe('stacked')
  })

  it('widens when hidden categories are shown again', async () => {
    const hiddenTabs: Prefs['hiddenTabs'] = [
      'apps',
      'passwords',
      'commands',
      'notes',
    ]
    await boot({
      prefs: { lang: 'en', hiddenTabs },
      window: { bounds: { x: 100, y: 50, w: 400, h: 720 } },
    })
    // Three names fit in 400 px.
    expect(panel().getBounds().width).toBe(400)

    await wm.keepTabNamesVisible(
      prefs({ lang: 'en', hiddenTabs }),
      prefs({ lang: 'en', hiddenTabs: [] })
    )

    expect(panel().getBounds()).toEqual({
      x: 100,
      y: 50,
      width: roomFor('en'),
      height: 720,
    })
  })

  it('needs less room for fewer categories', async () => {
    await boot({
      prefs: { lang: 'en' },
      window: { bounds: { x: 100, y: 50, w: 330, h: 720 } },
    })
    const three: Prefs['hiddenTabs'] = [
      'apps',
      'passwords',
      'commands',
      'notes',
    ]
    const five: Prefs['hiddenTabs'] = ['commands', 'notes']
    expect(resolveTabMode('en', 330, 3)).not.toBe('icons')
    expect(resolveTabMode('en', 330, 5)).toBe('icons')

    await wm.keepTabNamesVisible(
      prefs({ lang: 'en', hiddenTabs: three }),
      prefs({ lang: 'en', hiddenTabs: five })
    )

    const width = roomFor('en', 1, 5)
    expect(width).toBeLessThan(roomFor('en'))
    expect(panel().getBounds()).toMatchObject({ x: 100, width })
    expect(resolveTabMode('en', width, 5)).not.toBe('icons')
  })

  it('leaves the panel alone while the names still fit', async () => {
    await boot()
    const before = panel().getBounds()
    const saved = data().window.bounds

    // Japanese names fit in 400 px, and so do the Chinese ones a little larger.
    await wm.keepTabNamesVisible(prefs({ lang: 'zh' }), prefs({ lang: 'ja' }))
    await wm.keepTabNamesVisible(prefs({ zoom: 1 }), prefs({ zoom: 1.2 }))
    await wm.keepTabNamesVisible(prefs(), prefs({ theme: 'dark' }))

    expect(panel().getBounds()).toEqual(before)
    expect(data().window.bounds).toBe(saved)
  })

  it('does not bring back names the user had already given up for a narrow panel', async () => {
    await boot({
      prefs: { lang: 'en' },
      window: { bounds: { x: 100, y: 50, w: 380, h: 720 } },
    })

    await wm.keepTabNamesVisible(
      prefs({ lang: 'en' }),
      prefs({ lang: 'en', zoom: 1.2 })
    )
    await wm.keepTabNamesVisible(prefs({ lang: 'en' }), prefs({ lang: 'ja' }))

    expect(panel().getBounds()).toMatchObject({ x: 100, width: 380 })
  })

  it('keeps the widened panel on the screen', async () => {
    await boot({ window: { bounds: { x: 1500, y: 50, w: 400, h: 720 } } })

    await wm.keepTabNamesVisible(prefs({ lang: 'zh' }), prefs({ lang: 'en' }))

    const width = roomFor('en')
    expect(panel().getBounds()).toEqual({
      x: AREA.width - width,
      y: 50,
      width,
      height: 720,
    })
  })

  it('does not make the panel wider than the screen has room for', async () => {
    display.workArea = { x: 0, y: 0, width: 480, height: 800 }
    await boot()
    expect(panel().getBounds()).toMatchObject({
      x: (480 - 400) / 2,
      width: 400,
    })

    await wm.keepTabNamesVisible(prefs({ lang: 'zh' }), prefs({ lang: 'en' }))

    // 12 px of margin on both sides is what a panel may take of a screen.
    expect(panel().getBounds()).toMatchObject({ x: 24, width: 480 - 24 })
  })

  it('does nothing before there is a panel, and nothing while the app is quitting', async () => {
    await expect(
      wm.keepTabNamesVisible(prefs({ lang: 'zh' }), prefs({ lang: 'en' }))
    ).resolves.toBeUndefined()
    expect(fake.state.windows).toHaveLength(0)

    await boot()
    const before = panel().getBounds()
    wm.prepareToQuit()
    await wm.keepTabNamesVisible(prefs({ lang: 'zh' }), prefs({ lang: 'en' }))

    expect(panel().getBounds()).toEqual(before)
  })
})

describe('the theme the windows are told is the one that is drawn', () => {
  const savedBall = { x: 300, y: 420 }

  /** What a ball of the default size is told about its look. */
  const look = (theme: 'light' | 'dark', lang: Prefs['lang']) => ({
    theme,
    lang,
    ballSize: DOCK_BALL_SIZE,
  })

  /** What the ball was told about its look, in the order it was told. */
  const appearances = () =>
    fake.state.sent
      .filter(
        (message) =>
          message.windowId === ball().id &&
          message.channel === IPC_CHANNELS.dockAppearance
      )
      .map((message) => message.args[0])

  /** Windows switches between its light and its dark mode, and says so. */
  function switchSystem(dark: boolean): void {
    fake.nativeTheme.shouldUseDarkColors = dark
    fake.nativeTheme.emit('updated')
  }

  it.each([
    [true, 'dark'],
    [false, 'light'],
  ] as const)(
    'loads both windows with what "system" comes to (Windows dark: %s): %s',
    async (systemDark, theme) => {
      fake.nativeTheme.shouldUseDarkColors = systemDark

      await boot({ prefs: { theme: 'system', lang: 'en' } })

      expect(panel().loadedQuery).toEqual({ theme, lang: 'en' })
      expect(ball().loadedQuery).toEqual({
        view: 'dock',
        theme,
        lang: 'en',
        ball: String(DOCK_BALL_SIZE),
      })
    }
  )

  it('does not let Windows change a theme the user chose', async () => {
    fake.nativeTheme.shouldUseDarkColors = true

    await boot({ prefs: { theme: 'light' } })

    expect(panel().loadedQuery.theme).toBe('light')
    expect(ball().loadedQuery.theme).toBe('light')
  })

  it('tells a restored ball the theme "system" comes to', async () => {
    fake.nativeTheme.shouldUseDarkColors = true

    await boot({
      prefs: { theme: 'system', lang: 'en' },
      window: { collapsed: true, dockPosition: savedBall },
    })

    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(appearances()).toEqual([look('dark', 'en')])
  })

  it('tells the ball of a new installation, and a ball the panel folds into', async () => {
    fake.nativeTheme.shouldUseDarkColors = true
    fake.state.fresh = true
    await boot({ prefs: { theme: 'system' } })
    await vi.waitFor(() => expect(ball().isVisible()).toBe(true))
    expect(appearances()).toEqual([look('dark', 'zh')])

    // Windows goes light while the panel is open; the next collapse dresses the ball for it.
    fake.nativeTheme.shouldUseDarkColors = false
    fake.state.sent.length = 0
    await wm.collapseWindow()

    expect(appearances()).toEqual([look('light', 'zh')])
  })

  it('tells the ball again when Windows switches its mode', async () => {
    await boot({ prefs: { theme: 'system', lang: 'ja' } })
    await wm.collapseWindow()
    fake.state.sent.length = 0

    switchSystem(true)
    await vi.waitFor(() => expect(appearances()).toEqual([look('dark', 'ja')]))

    switchSystem(false)
    await vi.waitFor(() =>
      expect(appearances()).toEqual([look('dark', 'ja'), look('light', 'ja')])
    )
  })

  it('follows a setting that was changed after the start', async () => {
    await boot({ prefs: { theme: 'dark' } })
    await wm.collapseWindow()
    fake.state.sent.length = 0
    // The user picks "follow the system" in the settings; Windows is in light mode.
    data().prefs.theme = 'system'

    switchSystem(false)

    await vi.waitFor(() => expect(appearances()).toEqual([look('light', 'zh')]))
  })

  it('keeps a chosen theme on the ball whatever Windows switches to', async () => {
    await boot({ prefs: { theme: 'light' } })
    await wm.collapseWindow()
    fake.state.sent.length = 0

    switchSystem(true)

    await vi.waitFor(() => expect(appearances().length).toBeGreaterThan(0))
    for (const appearance of appearances())
      expect(appearance).toEqual(look('light', 'zh'))
  })

  it('stops listening to Windows once the ball is gone', async () => {
    await boot({ prefs: { theme: 'system' } })
    expect(fake.nativeTheme.listenerCount('updated')).toBe(1)
    fake.state.sent.length = 0
    const gone = ball()

    wm.prepareToQuit()
    gone.close()

    expect(gone.destroyed).toBe(true)
    expect(fake.nativeTheme.listenerCount('updated')).toBe(0)
    switchSystem(true)
    await vi.advanceTimersByTimeAsync(10)
    expect(
      fake.state.sent.filter(
        (message) => message.channel === IPC_CHANNELS.dockAppearance
      )
    ).toEqual([])
  })

  describe('the first frame of the panel', () => {
    it('is marked as light for the light theme, and only the panel is', async () => {
      await boot({ prefs: { theme: 'light' } })

      expect(panel().loadedHash).toBe('startup-light')
      expect(ball().loadedHash).toBe('')
    })

    it('is not marked for the dark theme', async () => {
      await boot({ prefs: { theme: 'dark' } })

      expect(panel().loadedHash).toBe('')
      expect(ball().loadedHash).toBe('')
    })

    it.each([
      [false, 'startup-light'],
      [true, ''],
    ] as const)(
      'follows Windows for "system" (dark: %s): %j',
      async (systemDark, hash) => {
        fake.nativeTheme.shouldUseDarkColors = systemDark

        await boot({ prefs: { theme: 'system' } })

        expect(panel().loadedHash).toBe(hash)
        expect(ball().loadedHash).toBe('')
      }
    )

    it('carries the mark in the address when the page comes from the development server', async () => {
      const previous = process.env.ELECTRON_RENDERER_URL
      process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/'
      try {
        await boot({ prefs: { theme: 'light', lang: 'en' } })

        const panelUrl = new URL(panel().loadedUrl!)
        expect(panelUrl.hash).toBe('#startup-light')
        expect(panelUrl.searchParams.get('theme')).toBe('light')
        expect(panelUrl.searchParams.get('lang')).toBe('en')
        const ballUrl = new URL(ball().loadedUrl!)
        expect(ballUrl.hash).toBe('')
        expect(ballUrl.searchParams.get('view')).toBe('dock')
        expect(ballUrl.searchParams.get('theme')).toBe('light')
      } finally {
        if (previous === undefined) delete process.env.ELECTRON_RENDERER_URL
        else process.env.ELECTRON_RENDERER_URL = previous
      }
    })
  })
})
