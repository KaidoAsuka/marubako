import path from 'node:path'

import { app, BrowserWindow, screen } from 'electron'
import log from 'electron-log/main'

import { MIN_OPACITY } from '../shared/types'
import type {
  ActivateSource,
  DockDrag,
  DockEdge,
  DockPosition,
  Lang,
  Prefs,
  WindowBounds,
  WindowSnapshot,
  WindowPresentation,
  WindowState,
} from '../shared/types'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import {
  DEFAULT_PANEL_WIDTH,
  resolveTabMode,
  stackedMinWidth,
} from '../shared/layout-widths'
import { toStartupQuery } from '../shared/startup-params'
import { visibleTabs } from '../shared/tabs'
import {
  flushPendingWriteSync,
  isFreshInstall,
  loadAppData,
  updateAppData,
  updateWindowData,
} from './data-store'
import {
  MIN_EXPANDED_HEIGHT,
  MIN_EXPANDED_WIDTH,
  WINDOW_MARGIN,
} from './config'
import { getDefaultWindowSize } from './default-window-size'
import { firstRunExperienceEnabled } from './first-run'
import { getLaunchWindowState } from './window-state'
import { attachEditMenu } from './edit-menu'
import { createLauncherMenu } from './launcher-menu'
import { motionTimeScale } from './motion-scale'
import { onSystemThemeChange, resolveThemeSetting } from './system-theme'
import {
  DOCK_SIZE,
  DOCK_SNAP_DISTANCE,
  fitsInArea,
  getDockBounds,
  getDockEdge,
  getExpandedPosition,
  getFirstRunLayout,
  isAtScreenEdge,
  redockToEdge,
  standsBeside,
} from './dock-geometry'

let mainWindow: BrowserWindow | null = null
let creatingMainWindow: Promise<BrowserWindow> | null = null
let dockWindow: BrowserWindow | null = null
let creatingDockWindow: Promise<BrowserWindow> | null = null
let windowTransition: Promise<void> | null = null
let dockDragOrigin: {
  pointer: DockPosition
  window: Electron.Rectangle
  // Where the open panel stood when the drag began; it travels with the ball. Null without one.
  panel: Electron.Rectangle | null
  moved: boolean
  cursor: DockPosition
  native: boolean
  armed: boolean
} | null = null
// A drag of the panel by its title bar, while the ball is on screen: where the two stood when it
// began, and where the panel was last seen. The ball follows by the distance the panel has gone.
let panelDrag: {
  panel: Electron.Rectangle
  dock: Electron.Rectangle
  last: Electron.Rectangle
} | null = null
let dockDragTimer: NodeJS.Timeout | undefined
let dockEdge: DockEdge = null
let panelOpacity = 1
let expandedAnchor: {
  dock: DockPosition
  edge: DockEdge
  panel: Electron.Rectangle
} | null = null
let manuallyMoving = false
let lastToggleAt = Number.NEGATIVE_INFINITY
let collapsedState = false
let openMode: 'peek' | 'window' = 'window'
let peekBlocked = false
let launcherMenuOpen = false
let keyboardPoint: DockPosition | null = null
let outsideSince = 0
let peekTimer: NodeJS.Timeout | undefined
let isQuitting = false
// Whether the floating ball exists (Prefs.showBubble). Cached because the 'moved' handler is
// synchronous; every async path re-reads the preference and refreshes it.
let showBubblePref = true
// A press on the ball takes focus from the panel in the same instant, so what the panel was doing
// is noted when the ball gains focus (window-ux-6).
let panelBlurredAt = Number.NEGATIVE_INFINITY
let panelWasFront: { front: boolean; at: number } | null = null
// The panel's renderer paints nothing, and so answers no animation frame request, until the panel
// has been on screen once. After a restart into the ball that first appearance cannot be animated.
let panelPainted = false
let hiddenToTrayNotifier: (() => void) | undefined
let nextFrameToken = 0
const pendingFrames = new Map<
  number,
  { senderId: number; resolve: () => void }
>()
// How much wider than the tab names need a panel is made when it is widened for them, so that
// rounding to device pixels cannot tip the tabs back to icons.
const TAB_NAMES_SPARE_WIDTH = 10
// A pointer within this distance of the panel or ball only slipped off it; give it more time.
const PEEK_NEAR_DISTANCE = 28
const PEEK_NEAR_GRACE = 450
// The panel counts as having been in front if it lost focus this shortly before the ball got it.
const PANEL_FRONT_BLUR_MS = 250
const PRESS_STALE_MS = 5000

/** Registers what runs once everything, ball included, has been hidden to the tray. */
export function setHiddenToTrayNotifier(
  notify: (() => void) | undefined
): void {
  hiddenToTrayNotifier = notify
}

export function prepareToQuit(): void {
  isQuitting = true
  clearDockDrag()
  clearInterval(peekTimer)
}

function notifyWindowState(): void {
  for (const window of [mainWindow, dockWindow])
    if (window && !window.isDestroyed())
      window.webContents.send(
        IPC_CHANNELS.windowStateChanged,
        getWindowSnapshot()
      )
}

export function setLauncherMenuOpen(visible: boolean): void {
  launcherMenuOpen = visible
  outsideSince = 0
}

export function setPeekBlocked(blocked: boolean, keyboard: boolean): void {
  peekBlocked = blocked
  if (keyboard) keyboardPoint = screen.getCursorScreenPoint()
  outsideSince = 0
}

async function checkPeekLeave(): Promise<void> {
  if (
    openMode !== 'peek' ||
    collapsedState ||
    windowTransition ||
    peekBlocked ||
    launcherMenuOpen ||
    dockDragOrigin ||
    manuallyMoving ||
    !mainWindow?.isVisible() ||
    mainWindow.isMinimized() ||
    mainWindow.isAlwaysOnTop()
  ) {
    outsideSince = 0
    return
  }
  const pointer = screen.getCursorScreenPoint()
  if (keyboardPoint) {
    if (
      Math.hypot(pointer.x - keyboardPoint.x, pointer.y - keyboardPoint.y) < 5
    )
      return
    keyboardPoint = null
  }
  // Without a ball (it is only ever absent while quitting or while it is being rebuilt) there is
  // nothing to measure the pointer against, so leave the panel as it is rather than throw every tick.
  if (!dockWindow || dockWindow.isDestroyed()) {
    outsideSince = 0
    return
  }
  const panel = mainWindow.getBounds()
  const bubble = dockWindow.getBounds()
  // Six pixels of tolerance bridge the eight-pixel gap without treating the
  // empty desktop above or below the ball as part of the launcher.
  const inside = (bounds: Electron.Rectangle) =>
    pointer.x >= bounds.x - 6 &&
    pointer.x <= bounds.x + bounds.width + 6 &&
    pointer.y >= bounds.y - 6 &&
    pointer.y <= bounds.y + bounds.height + 6
  if (inside(panel) || inside(bubble)) {
    outsideSince = 0
    return
  }
  const near = (bounds: Electron.Rectangle) =>
    pointer.x >= bounds.x - PEEK_NEAR_DISTANCE &&
    pointer.x <= bounds.x + bounds.width + PEEK_NEAR_DISTANCE &&
    pointer.y >= bounds.y - PEEK_NEAR_DISTANCE &&
    pointer.y <= bounds.y + bounds.height + PEEK_NEAR_DISTANCE
  if (!outsideSince) outsideSince = Date.now()
  // The store is already loaded here. Read its current in-memory preferences
  // so a saved/imported delay takes effect without restarting the app.
  const data = await loadAppData()
  const delay = data.prefs.peekCollapseDelay
  // Just past the edge is most likely a slip, so it gets a longer grace; a pointer that is clearly
  // away follows the user's own delay. 0 still means immediately in both. The clock is not reset
  // when the pointer moves from the near zone to the far one, so the wait never adds up.
  const grace =
    delay === 0
      ? 0
      : near(panel) || near(bubble)
        ? Math.max(delay, PEEK_NEAR_GRACE)
        : delay
  if (Date.now() - outsideSince >= grace) {
    outsideSince = 0
    void collapseWindow().catch((error) =>
      log.warn('Could not close temporary panel', error)
    )
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min
  }

  return Math.max(min, Math.min(max, value))
}

export function acknowledgeWindowFrame(senderId: number, token: number): void {
  const pending = pendingFrames.get(token)
  if (pending?.senderId === senderId) pending.resolve()
}

async function presentWindow(
  window: BrowserWindow,
  presentation: WindowPresentation
): Promise<void> {
  const token = ++nextFrameToken
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      pendingFrames.delete(token)
      resolve()
    }
    const timer = setTimeout(() => {
      log.warn(
        'Timed out preparing window frame',
        window.id,
        presentation.stage
      )
      finish()
    }, 2000)
    pendingFrames.set(token, {
      senderId: window.webContents.id,
      resolve: finish,
    })
    window.webContents.send(IPC_CHANNELS.prepareWindowShow, token, presentation)
  })
}

async function animateMode(
  expanding: boolean,
  timeScale: number
): Promise<void> {
  const panel = mainWindow!
  const bubble = dockWindow!
  const panelBounds = panel.getBounds()
  const bubbleBounds = bubble.getBounds()
  const direction = expanding ? 'expand' : 'collapse'
  const panelPresentation: WindowPresentation = {
    stage: 'prepare',
    direction,
    surface: 'panel',
    origin: {
      x: bubbleBounds.x - panelBounds.x,
      y: bubbleBounds.y - panelBounds.y,
    },
    timeScale,
  }
  const bubblePresentation: WindowPresentation = {
    ...panelPresentation,
    surface: 'bubble',
    origin: { x: 0, y: 0 },
    stationary: bubble.isVisible(),
  }
  const incoming = expanding ? panel : bubble
  const outgoing = expanding ? bubble : panel
  const incomingPresentation = expanding
    ? panelPresentation
    : bubblePresentation
  const outgoingPresentation = expanding
    ? bubblePresentation
    : panelPresentation
  // Prime a fully transparent native surface before making it visible. CapturePage
  // and show/hide at full opacity can expose a stale DWM surface on Windows.
  const stationaryIncoming = !expanding && bubblePresentation.stationary
  if (!stationaryIncoming) incoming.setOpacity(0)
  await Promise.all([
    presentWindow(panel, panelPresentation),
    presentWindow(bubble, bubblePresentation),
  ])
  if (!stationaryIncoming) {
    incoming.showInactive()
    await presentWindow(incoming, { ...incomingPresentation, stage: 'shown' })
  }
  incoming.setOpacity(expanding ? panelOpacity : 1)
  // The panel takes keys and clicks as soon as it appears, not when the spring ends.
  if (expanding) panel.focus()
  bubble.moveTop()
  await Promise.all([
    presentWindow(incoming, { ...incomingPresentation, stage: 'animate' }),
    presentWindow(outgoing, { ...outgoingPresentation, stage: 'animate' }),
  ])
  if (!expanding) outgoing.hide()
  outgoing.setOpacity(expanding ? 1 : panelOpacity)
  await Promise.all([
    presentWindow(incoming, { ...incomingPresentation, stage: 'reset' }),
    presentWindow(outgoing, { ...outgoingPresentation, stage: 'reset' }),
  ])
  if (expanding) bubble.moveTop()
}

/**
 * Brings only the ball to the look of the state the panel is in, without presenting the panel:
 * for the moments the panel is already hidden or minimized, where its renderer cannot paint and
 * every stage of animateMode would wait out its two-second timeout. `collapse` makes the ball a
 * full ball (showing it first when it was hidden), `expand` makes it the small dot beside a panel.
 */
async function settleBubble(
  direction: 'collapse' | 'expand',
  motion: number
): Promise<void> {
  const bubble = dockWindow
  if (!bubble || bubble.isDestroyed()) return
  const stationary = bubble.isVisible()
  const presentation: WindowPresentation = {
    stage: 'prepare',
    direction,
    surface: 'bubble',
    origin: { x: 0, y: 0 },
    timeScale: motionTimeScale(motion),
    stationary,
  }
  if (!stationary) bubble.setOpacity(0)
  await presentWindow(bubble, presentation)
  if (!stationary) {
    bubble.showInactive()
    await presentWindow(bubble, { ...presentation, stage: 'shown' })
  }
  bubble.setOpacity(1)
  bubble.moveTop()
  await presentWindow(bubble, { ...presentation, stage: 'animate' })
  await presentWindow(bubble, { ...presentation, stage: 'reset' })
}

function getSafeWindowBounds(
  savedBounds?: WindowBounds,
  preferredDisplay?: Electron.Display,
  // Only a window that has never been sized takes the default size, which depends on the language.
  lang: Lang = 'zh'
) {
  const display =
    preferredDisplay ??
    (savedBounds
      ? screen.getDisplayMatching({
          x: savedBounds.x,
          y: savedBounds.y,
          width: savedBounds.w,
          height: savedBounds.h,
        })
      : screen.getPrimaryDisplay())

  const workArea = display.workArea
  const maxWidth = Math.max(
    MIN_EXPANDED_WIDTH,
    workArea.width - WINDOW_MARGIN * 2
  )
  const maxHeight = Math.max(
    MIN_EXPANDED_HEIGHT,
    workArea.height - WINDOW_MARGIN * 2
  )
  const fallback = getDefaultWindowSize(lang, workArea)
  const width = clamp(
    savedBounds?.w ?? fallback.width,
    MIN_EXPANDED_WIDTH,
    maxWidth
  )
  const height = clamp(
    savedBounds?.h ?? fallback.height,
    Math.min(MIN_EXPANDED_HEIGHT, maxHeight),
    maxHeight
  )
  const x = clamp(
    savedBounds?.x ?? workArea.x + Math.round((workArea.width - width) / 2),
    workArea.x,
    workArea.x + workArea.width - width
  )
  const y = clamp(
    savedBounds?.y ?? workArea.y + Math.round((workArea.height - height) / 2),
    workArea.y,
    workArea.y + workArea.height - height
  )

  return {
    x,
    y,
    width,
    height,
    minWidth: MIN_EXPANDED_WIDTH,
    minHeight: Math.min(MIN_EXPANDED_HEIGHT, maxHeight),
  }
}

/**
 * Where the ball belongs once the panel has been dragged to `bounds`: as far from where it stood
 * as the panel is from where it stood, kept on the screen.
 */
function ballBesideDraggedPanel(
  origin: { panel: Electron.Rectangle; dock: Electron.Rectangle },
  bounds: Electron.Rectangle
): Electron.Rectangle {
  const position = {
    x: origin.dock.x + bounds.x - origin.panel.x,
    y: origin.dock.y + bounds.y - origin.panel.y,
  }
  return getDockBounds(
    screen.getDisplayMatching({
      ...position,
      width: DOCK_SIZE,
      height: DOCK_SIZE,
    }).workArea,
    position
  )
}

// How far from the ball a saved panel may stand and still count as laid out beside it: the gap,
// rounding, and the 16 pixels by which the ball of earlier versions was larger.
const SAVED_PANEL_SLACK = 18

/**
 * A ball saved as docked to an edge is put flush against that edge for the size the ball has now
 * (it was larger in earlier versions, and a screen can change). A panel that stood beside it is
 * laid out beside it again; one the user put somewhere else (while the ball was off screen, or
 * turned off) stays where it is. Anything else is returned as it is.
 */
function withRedockedBall(
  state: WindowState,
  showBubble: boolean
): WindowState {
  const { dockPosition, dockEdge, bounds } = state
  if (!dockPosition || !dockEdge) return state
  const area = screen.getDisplayMatching({
    ...dockPosition,
    width: DOCK_SIZE,
    height: DOCK_SIZE,
  }).workArea
  const dock = redockToEdge(area, dockPosition, dockEdge)
  if (dock.x === dockPosition.x) return state
  if (
    !bounds ||
    !showBubble ||
    !standsBeside(
      { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h },
      dockPosition,
      SAVED_PANEL_SLACK
    )
  )
    return { ...state, dockPosition: dock }
  const panel = getExpandedPosition(
    area,
    dock,
    { width: bounds.w, height: bounds.h },
    dockEdge
  )
  return {
    ...state,
    dockPosition: dock,
    bounds: { ...bounds, x: panel.x, y: panel.y },
  }
}

/**
 * A panel that was never resized still has the default width of the language it first opened in.
 * In a language with longer category names that width shows icons only (data from a version that
 * did not widen the panel when the language was changed): such a panel is given the width the
 * names need, growing away from the ball. A width the user chose is never touched.
 */
function withRoomForTabNames(state: WindowState, prefs: Prefs): WindowState {
  const { bounds, dockPosition } = state
  if (!bounds) return state
  const untouched = Object.values(DEFAULT_PANEL_WIDTH).some(
    (width) => Math.abs(bounds.w - width) <= 2
  )
  const tabCount = visibleTabs(prefs.hiddenTabs).length
  if (
    !untouched ||
    resolveTabMode(prefs.lang, Math.round(bounds.w / prefs.zoom), tabCount) !==
      'icons'
  )
    return state
  const width = Math.ceil(
    (stackedMinWidth(prefs.lang, tabCount) + TAB_NAMES_SPARE_WIDTH) * prefs.zoom
  )
  const ballOnTheRight =
    dockPosition !== undefined && dockPosition.x >= bounds.x + bounds.w
  // Never past the left edge of its screen: what is saved here is where the window will be.
  const area = screen.getDisplayMatching({
    x: bounds.x,
    y: bounds.y,
    width: bounds.w,
    height: bounds.h,
  }).workArea
  return {
    ...state,
    bounds: {
      ...bounds,
      w: width,
      x: ballOnTheRight
        ? Math.max(area.x, bounds.x + bounds.w - width)
        : bounds.x,
    },
  }
}

async function persistWindowBounds(): Promise<void> {
  if (!mainWindow) {
    return
  }

  const bounds = mainWindow.getBounds()

  await updateWindowData((windowState) => ({
    ...windowState,
    bounds: {
      x: bounds.x,
      y: bounds.y,
      w: bounds.width,
      h: bounds.height,
    },
    preCollapseHeight:
      bounds.height < MIN_EXPANDED_HEIGHT
        ? windowState.preCollapseHeight
        : bounds.height,
  }))
}

async function loadRenderer(
  window: BrowserWindow,
  dock = false,
  // What a window needs to draw its first frame in the right theme and language (the panel's
  // loading screen as much as the ball).
  appearance: Record<string, string> = {}
): Promise<void> {
  const rendererUrl =
    process.env.ELECTRON_RENDERER_URL ||
    (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined'
      ? MAIN_WINDOW_VITE_DEV_SERVER_URL
      : undefined)
  // The panel's loading screen is painted before any script runs; the fragment is how its
  // stylesheet learns that the first frame is light (startup.css).
  const hash = !dock && appearance.theme === 'light' ? 'startup-light' : ''
  if (rendererUrl) {
    const url = new URL(rendererUrl)
    if (dock) url.searchParams.set('view', 'dock')
    for (const [key, value] of Object.entries(appearance))
      url.searchParams.set(key, value)
    url.hash = hash
    await window.loadURL(url.toString())
    return
  }

  await window.loadFile(path.join(__dirname, '../renderer/index.html'), {
    query: dock ? { view: 'dock', ...appearance } : { ...appearance },
    ...(hash ? { hash } : {}),
  })
}

export function createMainWindow(): Promise<BrowserWindow> {
  if (creatingMainWindow) return creatingMainWindow
  if (mainWindow && !mainWindow.isDestroyed())
    return Promise.resolve(mainWindow)
  creatingMainWindow = buildMainWindow().finally(() => {
    creatingMainWindow = null
  })
  return creatingMainWindow
}

/** The window state of a new installation: the panel and the ball docked beside each other. */
function withFirstRunLayout(state: WindowState, lang: Lang): WindowState {
  const area = screen.getPrimaryDisplay().workArea
  const size = getDefaultWindowSize(lang, area)
  const { dock, panel, edge } = getFirstRunLayout(area, size)
  return {
    ...state,
    bounds: { x: panel.x, y: panel.y, w: size.width, h: size.height },
    dockPosition: dock,
    dockEdge: edge,
  }
}

async function buildMainWindow(): Promise<BrowserWindow> {
  const data = await loadAppData()
  showBubblePref = data.prefs.showBubble
  const hiddenLaunch = process.argv.includes('--hidden')
  const repairedState = getLaunchWindowState(data.window)
  // The ball comes back when it was the last state. An auto-start (--hidden) brings it up as well,
  // so a silent start still leaves the launcher on screen. With the ball turned off nothing
  // collapses, whatever was saved.
  const startCollapsed =
    showBubblePref && (repairedState.collapsed || hiddenLaunch)
  const resolvedState =
    repairedState.collapsed === startCollapsed
      ? repairedState
      : { ...repairedState, collapsed: startCollapsed }
  // A new installation shows the ball from the first second, as the dot beside the open panel, and
  // puts the pair where it will rest (the right edge). Only a window that was never placed.
  const firstRunBubble =
    showBubblePref &&
    !startCollapsed &&
    !resolvedState.bounds &&
    !resolvedState.dockPosition &&
    firstRunExperienceEnabled() &&
    isFreshInstall()
  const launchWindowState = firstRunBubble
    ? withFirstRunLayout(resolvedState, data.prefs.lang)
    : withRoomForTabNames(
        withRedockedBall(resolvedState, showBubblePref),
        data.prefs
      )

  if (launchWindowState !== data.window) {
    await updateWindowData(() => launchWindowState)
  }

  collapsedState = startCollapsed
  const bounds = getSafeWindowBounds(
    launchWindowState.bounds,
    undefined,
    data.prefs.lang
  )
  if (launchWindowState.dockPosition) {
    expandedAnchor = {
      dock: launchWindowState.dockPosition,
      edge: launchWindowState.dockEdge ?? null,
      panel: bounds,
    }
  }

  mainWindow = new BrowserWindow({
    icon: path.join(app.getAppPath(), 'icon.ico'),
    show: false,
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    thickFrame: false,
    // Electron 35 and later round a frameless transparent window and give it a native shadow on
    // Windows 11 by default. The panel draws its own corners (CSS) and needs neither.
    roundedCorners: false,
    hasShadow: false,
    resizable: true,
    alwaysOnTop: launchWindowState.alwaysOnTop,
    skipTaskbar: false,
    minWidth: MIN_EXPANDED_WIDTH,
    minHeight: bounds.minHeight,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      // The fields hold paths, addresses, usernames and commands: red squiggles under those only
      // get in the way. (Nothing in the app suggests corrections either.)
      spellcheck: false,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  })

  // On Windows, the constructor can round a restored size differently at high DPI.
  mainWindow.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  })

  panelOpacity = data.prefs.opacity
  mainWindow.setOpacity(panelOpacity)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  // Block navigation away from the app, but let the page reload itself (the error screen's Retry).
  mainWindow.webContents.on('will-navigate', (event) => {
    if (event.url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })
  // Electron draws no context menu of its own: give the text fields cut / copy / paste / select all.
  attachEditMenu(mainWindow.webContents, setLauncherMenuOpen)

  mainWindow.webContents.on('did-finish-load', () => {
    log.info('Renderer loaded', mainWindow?.webContents.getURL())
  })

  mainWindow.once('ready-to-show', () => {
    if (hiddenLaunch || startCollapsed) return
    mainWindow?.show()
    panelPainted = true
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting && process.env.QUICKLAUNCH_E2E !== '1') {
      event.preventDefault()
      void hideWindow()
    }
  })
  mainWindow.on('closed', () => {
    clearInterval(peekTimer)
    peekTimer = undefined
    mainWindow = null
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      log.error('Renderer failed to load', {
        errorCode,
        errorDescription,
        validatedURL,
      })
    }
  )

  mainWindow.on('will-move', () => {
    // Windows reports every step of a title-bar drag here, before the panel moves, and does not
    // say when a drag begins. A new one is recognised by the panel not standing where the last
    // step left it; where the panel and the ball stand at that moment is what the ball's following
    // is measured from.
    const bounds = mainWindow?.getBounds()
    if (
      bounds &&
      (!panelDrag ||
        Math.abs(bounds.x - panelDrag.last.x) > 1 ||
        Math.abs(bounds.y - panelDrag.last.y) > 1)
    )
      panelDrag = dockWindow?.isVisible()
        ? { panel: bounds, dock: dockWindow.getBounds(), last: bounds }
        : null
    manuallyMoving = true
  })
  mainWindow.on('move', () => {
    // The ball travels with a panel the user is dragging, step by step, so the two move as one.
    // (The app's own moves of the panel report here as well; they are not a drag.)
    if (!manuallyMoving || !panelDrag || !mainWindow) return
    const bounds = mainWindow.getBounds()
    panelDrag.last = bounds
    if (dockWindow?.isVisible())
      dockWindow.setBounds(ballBesideDraggedPanel(panelDrag, bounds))
  })
  mainWindow.on('moved', () => {
    const bounds = mainWindow?.getBounds()
    const drag = panelDrag
    panelDrag = null
    // Without the ball there is nothing to dock into, so dragging to the edge must not hide the panel.
    const dockOnRelease =
      showBubblePref &&
      manuallyMoving &&
      bounds &&
      mainWindow?.isVisible() &&
      isAtScreenEdge(bounds, screen.getDisplayMatching(bounds).workArea)
    if (manuallyMoving && !dockOnRelease && bounds && dockWindow?.isVisible()) {
      // A drag whose steps were not reported is measured from where the pair was last laid out.
      const origin =
        drag ??
        (expandedAnchor
          ? { panel: expandedAnchor.panel, dock: dockWindow.getBounds() }
          : null)
      if (origin) {
        const dock = ballBesideDraggedPanel(origin, bounds)
        dockWindow.setBounds(dock)
        dockEdge = null
        expandedAnchor = { dock, edge: null, panel: bounds }
        void updateWindowData((state) => ({
          ...state,
          dockPosition: { x: dock.x, y: dock.y },
          dockEdge: null,
        }))
      }
    }
    manuallyMoving = false
    void persistWindowBounds()
    if (dockOnRelease) {
      const area = screen.getDisplayMatching(bounds).workArea
      void collapseWindow({
        x:
          Math.abs(bounds.x - area.x) <= DOCK_SNAP_DISTANCE
            ? area.x
            : area.x + area.width - DOCK_SIZE,
        y: Math.round(bounds.y + bounds.height / 2 - DOCK_SIZE / 2),
      })
    }
  })

  mainWindow.on('resized', () => {
    // Dragging the left or top edge changes x/y but only fires 'resized' (never 'moved'). Keep the
    // panel anchor on the real bounds, otherwise the next title-bar drag would move the ball by
    // the resize offset as well.
    const bounds = mainWindow?.getBounds()
    if (bounds && expandedAnchor)
      expandedAnchor = { ...expandedAnchor, panel: bounds }
    void persistWindowBounds()
  })

  mainWindow.on('blur', () => {
    panelBlurredAt = Date.now()
  })
  // The taskbar button and Win+D minimize the panel without going through the app. The ball stays
  // (it is permanent) and shows the collapsed state until the panel is restored.
  mainWindow.on('minimize', () => {
    void panelMinimized().catch((error) =>
      log.warn('Could not follow a minimized panel', error)
    )
  })
  mainWindow.on('restore', () => {
    void panelRestored().catch((error) =>
      log.warn('Could not follow a restored panel', error)
    )
  })

  // Windows logoff or shutdown does not fire before-quit, so write whatever is pending right now.
  mainWindow.on('session-end', () => {
    try {
      flushPendingWriteSync()
    } catch (error) {
      log.error('Failed to save application data at session end', error)
    }
  })

  await loadRenderer(
    mainWindow,
    false,
    toStartupQuery({
      lang: data.prefs.lang,
      theme: resolveThemeSetting(data.prefs.theme),
      firstRun: firstRunExperienceEnabled() && isFreshInstall(),
    })
  )
  peekTimer = setInterval(() => {
    void checkPeekLeave().catch((error) =>
      log.warn('Could not check temporary panel dismissal', error)
    )
  }, 40)
  peekTimer.unref()
  void createDockWindow()
    .then(() =>
      startCollapsed
        ? showRestoredBubble()
        : firstRunBubble
          ? showFirstRunBubble()
          : undefined
    )
    .catch((error) => log.warn('Could not prepare floating bubble', error))

  const recoverDockPosition = () => {
    if (dockWindow) {
      const position = dockWindow.getBounds()
      dockWindow.setBounds(
        getDockBounds(screen.getDisplayMatching(position).workArea, position)
      )
    }
  }
  screen.on('display-removed', recoverDockPosition)
  screen.on('display-metrics-changed', recoverDockPosition)
  mainWindow.once('closed', () => {
    screen.removeListener('display-removed', recoverDockPosition)
    screen.removeListener('display-metrics-changed', recoverDockPosition)
  })

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function runWindowTransition(operation: () => Promise<void>): Promise<void> {
  const transition = (windowTransition ?? Promise.resolve())
    .catch(() => {})
    .then(operation)
  windowTransition = transition
  return transition.finally(() => {
    if (windowTransition === transition) windowTransition = null
  })
}

async function createDockWindow(): Promise<BrowserWindow> {
  if (creatingDockWindow) return creatingDockWindow
  if (dockWindow && !dockWindow.isDestroyed()) return dockWindow
  creatingDockWindow = (async () => {
    const data = await loadAppData()
    const area = screen.getDisplayMatching(mainWindow!.getBounds()).workArea
    const position = data.window.dockPosition ?? mainWindow!.getBounds()
    const bounds = getDockBounds(
      screen.getDisplayMatching({
        ...position,
        width: DOCK_SIZE,
        height: DOCK_SIZE,
      }).workArea,
      position
    )
    dockEdge =
      data.window.dockEdge === undefined
        ? getDockEdge(area, bounds)
        : data.window.dockEdge
    const window = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      thickFrame: false,
      // Same as the panel: the ball is a round shape of its own, with no native frame effects.
      roundedCorners: false,
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      backgroundColor: '#00000000',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        preload: path.join(__dirname, '../preload/index.js'),
      },
    })
    dockWindow = window
    window.setBounds(bounds)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => {
      if (event.url !== window.webContents.getURL()) event.preventDefault()
    })
    window.webContents.on('context-menu', (_event, params) => {
      void createLauncherMenu(showMainWindow, setLauncherMenuOpen)
        .then((menu) => {
          if (window.isDestroyed()) return
          // With a window given, popup() takes coordinates relative to that window's content,
          // which is exactly what the context-menu params carry. Screen coordinates would put
          // the menu at roughly twice the ball's offset from the screen origin.
          menu.popup({
            window,
            x: params.x,
            y: params.y,
            sourceType: params.menuSourceType,
          })
        })
        .catch((error) =>
          log.warn('Could not open launcher context menu', error)
        )
    })
    // Alt+F4 or the system menu's Close on the focused ball must not destroy it: with the panel
    // folded away it would leave nothing on screen. Only quitting, and the e2e harness that
    // shuts the app down by closing its windows (as for the panel), may close it.
    window.on('close', (event) => {
      if (!isQuitting && process.env.QUICKLAUNCH_E2E !== '1')
        event.preventDefault()
    })
    // With the theme set to follow the system, the ball changes with Windows as the panel does.
    const stopFollowingTheme = onSystemThemeChange(() => {
      void loadAppData()
        .then(({ prefs }) => {
          if (!window.isDestroyed()) sendDockAppearance(window, prefs)
        })
        .catch((error) => log.warn('Could not follow the system theme', error))
    })
    window.on('closed', () => {
      stopFollowingTheme()
      dockWindow = null
      clearDockDrag()
    })
    window.on('blur', () => {
      if (dockDragOrigin)
        void dragDock({ phase: 'end', ...screen.getCursorScreenPoint() })
    })
    window.on('focus', () => {
      // Windows deactivates the panel just before it activates the ball, so the panel's own
      // focus state is usually already gone here; its blur time says whether it was in front.
      panelWasFront = {
        front:
          !!mainWindow?.isFocused() ||
          Date.now() - panelBlurredAt < PANEL_FRONT_BLUR_MS,
        at: Date.now(),
      }
    })
    const ready = new Promise<void>((resolve) =>
      window.once('ready-to-show', resolve)
    )
    try {
      await Promise.all([
        loadRenderer(window, true, {
          theme: resolveThemeSetting(data.prefs.theme),
          lang: data.prefs.lang,
        }),
        ready,
      ])
    } catch (error) {
      window.destroy()
      throw error
    }
    return window
  })().finally(() => {
    creatingDockWindow = null
  })
  return creatingDockWindow
}

export function getDockWindow(): BrowserWindow | null {
  return dockWindow
}

/** Tells the ball how to dress: the language, and the theme the setting comes to right now. */
function sendDockAppearance(
  window: BrowserWindow,
  prefs: Pick<Prefs, 'lang' | 'theme'>
): void {
  window.webContents.send(IPC_CHANNELS.dockAppearance, {
    theme: resolveThemeSetting(prefs.theme),
    lang: prefs.lang,
  })
}

export async function showMainWindow(
  mode: 'peek' | 'window' = 'window',
  // Who asked, told to the panel: the first-run card ticks its line about the shortcut.
  source: ActivateSource = 'other'
): Promise<void> {
  await runWindowTransition(async () => {
    const window = await createMainWindow()
    const fromBubble =
      (collapsedState || !window.isVisible() || window.isMinimized()) &&
      dockWindow?.isVisible()
    if (fromBubble && dockWindow) {
      const dock = dockWindow.getBounds()
      const display = screen.getDisplayMatching(dock)
      const current = window.getBounds()
      // The panel opens where it last stood beside the ball. It is laid out afresh when the ball
      // has been moved since (a pixel or two is only rounding on a scaled display), when the
      // remembered place is not beside the ball (the panel was moved or resized while the ball was
      // off screen), or when the screen has no room for the panel there any more.
      const remembered =
        expandedAnchor &&
        Math.abs(expandedAnchor.dock.x - dock.x) <= 2 &&
        Math.abs(expandedAnchor.dock.y - dock.y) <= 2
          ? { ...current, x: expandedAnchor.panel.x, y: expandedAnchor.panel.y }
          : null
      const origin =
        remembered &&
        standsBeside(remembered, dock) &&
        fitsInArea(remembered, display.workArea)
          ? { x: remembered.x, y: remembered.y }
          : getExpandedPosition(display.workArea, dock, current, dockEdge)
      const target = getSafeWindowBounds(
        {
          ...origin,
          w: current.width,
          h: current.height,
        },
        display
      )
      if (
        current.x !== target.x ||
        current.y !== target.y ||
        current.width !== target.width ||
        current.height !== target.height
      ) {
        window.setBounds({
          x: target.x,
          y: target.y,
          width: target.width,
          height: target.height,
        })
        await persistWindowBounds()
      }
      expandedAnchor = {
        dock: { x: dock.x, y: dock.y },
        edge: dockEdge,
        panel: window.getBounds(),
      }
    }
    clearDockDrag()
    collapsedState = false
    openMode = mode
    outsideSince = 0
    keyboardPoint = null
    await updateWindowData((state) => ({ ...state, collapsed: false }))
    window.webContents.send(IPC_CHANNELS.activateLauncher, source)
    if (window.isMinimized()) window.restore()
    notifyWindowState()
    if (fromBubble && panelPainted) {
      const data = await loadAppData()
      await animateMode(true, motionTimeScale(data.prefs.motion))
    } else {
      window.show()
      window.focus()
      if (dockWindow?.isVisible()) dockWindow.moveTop()
      // Only the ball has anything to animate when the panel is appearing for the first time.
      if (fromBubble)
        await settleBubble('expand', (await loadAppData()).prefs.motion)
    }
    panelPainted = true
  })
}

export async function toggleMainWindow(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastToggleAt
  lastToggleAt = now
  if (windowTransition || elapsed < 350) return
  if (mainWindow?.isVisible() && mainWindow.isFocused()) {
    await collapseWindow()
    return
  }
  await showMainWindow('window', 'hotkey')
}

async function readShowBubble(): Promise<boolean> {
  showBubblePref = (await loadAppData()).prefs.showBubble
  return showBubblePref
}

/**
 * "Close to tray": the panel goes away at once. The ball is permanent, so with it enabled it stays
 * (or appears) where it was left and the collapsed state is remembered for the next start; only
 * with the ball turned off do both windows hide.
 */
export async function hideWindow(): Promise<void> {
  if (mainWindow && !isQuitting && (await readShowBubble())) {
    await collapseWindow(undefined, 'hide')
    return
  }
  await runWindowTransition(async () => {
    clearDockDrag()
    openMode = 'window'
    outsideSince = 0
    collapsedState = false
    mainWindow?.hide()
    dockWindow?.hide()
    await updateWindowData((state) => ({ ...state, collapsed: false }))
    notifyWindowState()
    try {
      if (!isQuitting) hiddenToTrayNotifier?.()
    } catch (error) {
      log.warn('Could not announce the hidden launcher', error)
    }
  })
}

/** What "hide after launching" does: fold into the ball, or go to the tray when there is none. */
export async function dismissAfterLaunch(): Promise<void> {
  await collapseWindow()
}

/**
 * Applies a changed "show the floating ball" preference at once. Turning it off hides the ball and
 * turns a temporary panel into an ordinary window; if the panel was folded into the ball it comes
 * back, so that the user is never left with nothing on screen.
 */
export async function applyBubblePreference(show: boolean): Promise<void> {
  showBubblePref = show
  // Called on every save: do nothing unless there is a ball (or a panel folded into one) to undo.
  if (show || (!dockWindow?.isVisible() && !collapsedState)) return
  try {
    await runWindowTransition(async () => {
      if (isQuitting || !mainWindow) return
      clearDockDrag()
      openMode = 'window'
      outsideSince = 0
      const panelAway =
        collapsedState || !mainWindow.isVisible() || mainWindow.isMinimized()
      if (panelAway) {
        collapsedState = false
        await updateWindowData((state) => ({ ...state, collapsed: false }))
        mainWindow.webContents.send(IPC_CHANNELS.activateLauncher, 'other')
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
      }
      dockWindow?.hide()
      notifyWindowState()
    })
  } catch (error) {
    log.warn('Could not apply the floating ball preference', error)
  }
}

// The taskbar button and Win+D minimize the panel without going through the app. Keep the ball
// consistent: it shows the collapsed state while the panel is minimized and the expanded one again
// once the panel is restored.
async function panelMinimized(): Promise<void> {
  if (isQuitting) return
  // Without the ball a minimized panel is just a minimized panel.
  await collapseWindow(undefined, 'minimized')
}

async function panelRestored(): Promise<void> {
  await runWindowTransition(async () => {
    if (isQuitting || !mainWindow || mainWindow.isMinimized()) return
    // A restore the app asked for (showMainWindow) has already updated the state.
    if (!collapsedState) return
    collapsedState = false
    openMode = 'window'
    outsideSince = 0
    await updateWindowData((state) => ({ ...state, collapsed: false }))
    notifyWindowState()
    if (dockWindow?.isVisible())
      await settleBubble('expand', (await loadAppData()).prefs.motion)
  })
}

/** Shows the ball that was the last state before a restart, once its window is ready. */
async function showRestoredBubble(): Promise<void> {
  await runWindowTransition(async () => {
    // Whatever the user did while the ball was being prepared has the last word.
    if (!collapsedState || isQuitting) return
    const window = await createDockWindow()
    if (window.isVisible()) return
    const data = await loadAppData()
    // The panel never shows during this start, so the ball must not wait for its renderer: it is
    // placed at the saved position by createDockWindow and only has to be shown.
    sendDockAppearance(window, data.prefs)
    window.showInactive()
    window.moveTop()
  })
}

/**
 * The ball of a new installation: it appears beside the open panel as the small dot (the state
 * the panel being open gives it), so that the first screen already shows the pair.
 */
async function showFirstRunBubble(): Promise<void> {
  await runWindowTransition(async () => {
    // Whatever the user did while the ball was being prepared has the last word.
    if (collapsedState || isQuitting || !showBubblePref) return
    const window = await createDockWindow()
    if (window.isVisible()) return
    const data = await loadAppData()
    sendDockAppearance(window, data.prefs)
    await settleBubble('expand', data.prefs.motion)
  })
}

export async function closeWindow(): Promise<void> {
  if (isQuitting) mainWindow?.close()
  else await hideWindow()
}

/**
 * A change of language, zoom or shown categories must not take the names off the tabs. When the
 * names stood whole before the change and the same window would now show icons only (English names
 * are longer than Chinese ones), the panel is widened to what the names need
 * (shared/layout-widths.ts). The side next to the ball stays where it is.
 */
export async function keepTabNamesVisible(
  before: Prefs,
  after: Prefs
): Promise<void> {
  const window = mainWindow
  if (!window || window.isDestroyed() || isQuitting) return
  const bounds = window.getBounds()
  const tabModeWith = (prefs: Prefs) =>
    resolveTabMode(
      prefs.lang,
      Math.round(bounds.width / prefs.zoom),
      visibleTabs(prefs.hiddenTabs).length
    )
  if (tabModeWith(before) === 'icons' || tabModeWith(after) !== 'icons') return
  const area = screen.getDisplayMatching(bounds).workArea
  const needed = Math.ceil(
    (stackedMinWidth(after.lang, visibleTabs(after.hiddenTabs).length) +
      TAB_NAMES_SPARE_WIDTH) *
      after.zoom
  )
  const width = Math.min(
    needed,
    Math.max(MIN_EXPANDED_WIDTH, area.width - WINDOW_MARGIN * 2)
  )
  if (width <= bounds.width) return
  const ball = dockWindow?.isVisible() ? dockWindow.getBounds() : null
  const ballOnTheRight = ball !== null && ball.x >= bounds.x + bounds.width
  const x = clamp(
    ballOnTheRight ? bounds.x + bounds.width - width : bounds.x,
    area.x,
    area.x + area.width - width
  )
  window.setBounds({ ...bounds, x, width })
  if (expandedAnchor)
    expandedAnchor = { ...expandedAnchor, panel: window.getBounds() }
  await persistWindowBounds()
}

export async function togglePin(): Promise<WindowSnapshot> {
  const next = !(mainWindow?.isAlwaysOnTop() ?? false)
  mainWindow?.setAlwaysOnTop(next)
  if (dockWindow?.isVisible()) dockWindow.moveTop()
  await updateWindowData((windowState) => ({
    ...windowState,
    alwaysOnTop: next,
  }))
  notifyWindowState()
  return getWindowSnapshot()
}

export async function setWindowOpacity(
  opacity: number
): Promise<WindowSnapshot> {
  const nextOpacity = Math.max(MIN_OPACITY, Math.min(1, opacity))
  panelOpacity = nextOpacity
  mainWindow?.setOpacity(nextOpacity)

  await updateAppData((current) => ({
    ...current,
    prefs: {
      ...current.prefs,
      opacity: nextOpacity,
    },
    window: {
      ...current.window,
      opacity: nextOpacity,
    },
  }))

  return getWindowSnapshot()
}

/**
 * Shows an opacity on the panel while the settings dialog is open, without saving it and without
 * changing what the window animations fade to. `null` puts the saved opacity back (the dialog was
 * cancelled or closed); a save has already stored the new one by then.
 */
export function previewPanelOpacity(opacity: number | null): void {
  if (opacity === null) {
    mainWindow?.setOpacity(panelOpacity)
    return
  }
  if (typeof opacity !== 'number' || !Number.isFinite(opacity))
    throw new Error('Invalid opacity')
  mainWindow?.setOpacity(Math.max(MIN_OPACITY, Math.min(1, opacity)))
}

/**
 * Folds the panel into the ball. `exit` says how the panel goes: `animate` shrinks it into the
 * ball, `hide` removes it at once ("close to tray"), `minimized` leaves it where the user put it
 * (the taskbar). Without the ball (showBubble off) all three go to the tray instead.
 */
export async function collapseWindow(
  position?: DockPosition,
  exit: 'animate' | 'hide' | 'minimized' = 'animate'
): Promise<WindowSnapshot> {
  // Without the ball there is nothing to collapse into. This is decided before the transition below
  // is queued: hideWindow queues one of its own and would wait on this one forever.
  if (!isQuitting && !(await readShowBubble())) {
    if (exit !== 'minimized') await hideWindow()
    return getWindowSnapshot()
  }
  await runWindowTransition(async () => {
    if (!mainWindow || isQuitting) return
    // The panel may have been restored while this waited for its turn.
    if (exit === 'minimized' && !mainWindow.isMinimized()) return
    if (collapsedState && dockWindow?.isVisible() && !position) {
      if (exit === 'hide') mainWindow.hide()
      return
    }
    const window = await createDockWindow()
    const data = await loadAppData()
    const panelBounds = mainWindow.getBounds()
    // While the ball is on screen it already sits where it belongs; the panel's corner says
    // nothing about it (it changes when the panel is resized from its left or top edge).
    const keepBubble = !position && window.isVisible()
    const keepAnchor =
      !position &&
      !keepBubble &&
      expandedAnchor &&
      panelBounds.x === expandedAnchor.panel.x &&
      panelBounds.y === expandedAnchor.panel.y
    const target =
      position ??
      (keepBubble
        ? window.getBounds()
        : keepAnchor
          ? expandedAnchor!.dock
          : panelBounds)
    const bounds = getDockBounds(
      screen.getDisplayMatching({
        ...target,
        width: DOCK_SIZE,
        height: DOCK_SIZE,
      }).workArea,
      target,
      !!position
    )
    // A ball that stays where it is keeps its edge docking as well.
    dockEdge = position
      ? getDockEdge(screen.getDisplayMatching(bounds).workArea, bounds)
      : keepBubble
        ? dockEdge
        : keepAnchor
          ? expandedAnchor!.edge
          : null
    clearDockDrag()
    window.setBounds(bounds)
    sendDockAppearance(window, data.prefs)
    collapsedState = true
    openMode = 'window'
    outsideSince = 0
    await persistWindowBounds()
    await updateWindowData((state) => ({
      ...state,
      collapsed: true,
      dockPosition: { x: bounds.x, y: bounds.y },
      dockEdge,
    }))
    notifyWindowState()
    if (exit === 'animate') {
      await animateMode(false, motionTimeScale(data.prefs.motion))
      return
    }
    // The panel is gone (or stays in the taskbar) without a transition: only the ball settles.
    if (exit === 'hide') mainWindow.hide()
    await settleBubble('collapse', data.prefs.motion)
  })
  return getWindowSnapshot()
}

export async function expandWindow(): Promise<WindowSnapshot> {
  await showMainWindow()
  return getWindowSnapshot()
}

/**
 * Whether a click on the ball should bring the panel forward rather than fold it away: only for a
 * window the user keeps open (not a temporary or pinned panel) that was not in front when the
 * ball was pressed, since other windows may be covering it. Windows cannot say whether a window is
 * covered, so "was not focused" is the best available stand-in.
 */
function panelNeedsRaising(): boolean {
  const press = panelWasFront
  panelWasFront = null
  return (
    openMode === 'window' &&
    !!mainWindow &&
    !mainWindow.isAlwaysOnTop() &&
    press !== null &&
    !press.front &&
    Date.now() - press.at < PRESS_STALE_MS
  )
}

export async function activateDock(
  mode: 'peek' | 'window'
): Promise<WindowSnapshot> {
  const raise = panelNeedsRaising()
  if (
    mode === 'peek' &&
    !windowTransition &&
    mainWindow?.isVisible() &&
    !mainWindow.isMinimized() &&
    !collapsedState
  ) {
    if (!raise) return collapseWindow()
    await showMainWindow('window')
    return getWindowSnapshot()
  }
  await showMainWindow(mode)
  return getWindowSnapshot()
}

function clearDockDrag(): void {
  if (dockDragTimer) clearInterval(dockDragTimer)
  dockDragTimer = undefined
  dockDragOrigin = null
}

function moveDockToPointer(
  pointer: DockPosition,
  originPointer: DockPosition
): void {
  if (!dockDragOrigin || !dockWindow?.isVisible()) return
  const dx = pointer.x - originPointer.x
  const dy = pointer.y - originPointer.y
  if (!dockDragOrigin.moved && Math.hypot(dx, dy) < 5) return
  dockDragOrigin.moved = true
  const area = screen.getDisplayNearestPoint(pointer).workArea
  const bounds = getDockBounds(area, {
    x: Math.round(dockDragOrigin.window.x + dx),
    y: Math.round(dockDragOrigin.window.y + dy),
  })
  // Both windows are given their size with every step: at a fractional display scale a window
  // that is only told a new position comes out a pixel larger each time.
  dockWindow.setBounds(bounds)
  // An open panel travels with the ball and keeps its place beside it, so the two move as one.
  const panel = dockDragOrigin.panel
  if (panel && mainWindow?.isVisible() && !collapsedState)
    mainWindow.setBounds({
      x: panel.x + bounds.x - dockDragOrigin.window.x,
      y: panel.y + bounds.y - dockDragOrigin.window.y,
      width: panel.width,
      height: panel.height,
    })
}

export async function dragDock(drag: DockDrag): Promise<{ moved: boolean }> {
  if (
    !drag ||
    !['start', 'track', 'move', 'end'].includes(drag.phase) ||
    !Number.isFinite(drag.x) ||
    !Number.isFinite(drag.y)
  ) {
    throw new Error('Invalid dock drag')
  }
  if (!dockWindow?.isVisible() || windowTransition) return { moved: false }
  if (drag.phase === 'start') {
    clearDockDrag()
    const bounds = dockWindow.getBounds()
    dockDragOrigin = {
      pointer: { x: drag.x, y: drag.y },
      // Capture the press position, rather than a cursor sample taken after IPC
      // latency. Local CSS coordinates match this unzoomed window's DIP bounds.
      cursor:
        drag.offset &&
        Number.isFinite(drag.offset.x) &&
        Number.isFinite(drag.offset.y)
          ? { x: bounds.x + drag.offset.x, y: bounds.y + drag.offset.y }
          : screen.getCursorScreenPoint(),
      window: bounds,
      panel:
        mainWindow?.isVisible() && !mainWindow.isMinimized() && !collapsedState
          ? mainWindow.getBounds()
          : null,
      moved: false,
      native: true,
      armed: false,
    }
    // Read the OS cursor in Electron's display coordinates. A moving native
    // window can stop delivering reliable Chromium pointer moves.
    dockDragTimer = setInterval(() => {
      if (dockDragOrigin?.armed)
        moveDockToPointer(screen.getCursorScreenPoint(), dockDragOrigin.cursor)
    }, 16)
    dockDragTimer.unref()
    return { moved: false }
  }
  if (!dockDragOrigin) return { moved: false }
  if (drag.phase === 'track') {
    // A click never arms native tracking. Begin only after Chromium observes an
    // actual held-pointer movement, so later cursor motion cannot move a click.
    dockDragOrigin.armed = true
    moveDockToPointer(screen.getCursorScreenPoint(), dockDragOrigin.cursor)
    return { moved: dockDragOrigin.moved }
  }
  if (drag.phase === 'move') {
    // Also support explicit drag samples from callers; normal mouse dragging
    // uses the native cursor loop after the one-time track message.
    clearInterval(dockDragTimer)
    dockDragOrigin.native = false
    moveDockToPointer(
      { x: Math.round(drag.x), y: Math.round(drag.y) },
      dockDragOrigin.pointer
    )
    return { moved: dockDragOrigin.moved }
  }
  if (dockDragOrigin.native)
    moveDockToPointer(
      {
        x: dockDragOrigin.cursor.x + drag.x - dockDragOrigin.pointer.x,
        y: dockDragOrigin.cursor.y + drag.y - dockDragOrigin.pointer.y,
      },
      dockDragOrigin.cursor
    )
  else
    moveDockToPointer(
      { x: Math.round(drag.x), y: Math.round(drag.y) },
      dockDragOrigin.pointer
    )
  const moved = dockDragOrigin.moved
  const panelOrigin = dockDragOrigin.panel
  const releasedPosition = dockWindow.getBounds()
  clearDockDrag()
  const area = screen.getDisplayMatching(releasedPosition).workArea
  const bounds = getDockBounds(area, releasedPosition, moved)
  if (moved) dockEdge = getDockEdge(area, bounds)
  dockWindow.setBounds(bounds)
  if (moved && mainWindow?.isVisible() && !collapsedState) {
    const followed = mainWindow.getBounds()
    // The size the panel had when the drag began: what it reports now may be a pixel off.
    const panel = {
      ...followed,
      width: panelOrigin?.width ?? followed.width,
      height: panelOrigin?.height ?? followed.height,
    }
    // The panel came along with the ball. It stays in its place beside the ball (the snap to an
    // edge included) when the screen has room for it there; otherwise it is laid out afresh.
    const beside = {
      ...panel,
      x: panel.x + bounds.x - releasedPosition.x,
      y: panel.y + bounds.y - releasedPosition.y,
    }
    const position =
      panelOrigin && fitsInArea(beside, area)
        ? { x: beside.x, y: beside.y }
        : getExpandedPosition(area, bounds, panel, dockEdge)
    mainWindow.setBounds({ ...panel, x: position.x, y: position.y })
    expandedAnchor = {
      dock: { x: bounds.x, y: bounds.y },
      edge: dockEdge,
      panel: mainWindow.getBounds(),
    }
    await persistWindowBounds()
  }
  await updateWindowData((state) => ({
    ...state,
    dockPosition: { x: bounds.x, y: bounds.y },
    dockEdge,
  }))
  return { moved }
}

export function getWindowSnapshot(): WindowSnapshot {
  return {
    opacity: panelOpacity,
    alwaysOnTop: mainWindow?.isAlwaysOnTop() ?? false,
    collapsed: collapsedState,
    mode: openMode,
  }
}
