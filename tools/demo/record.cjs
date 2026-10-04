// Step 1 of the README demos: records what the real app shows.
//
// It drives the built app with made-up data (demo-data.cjs), saves what the panel and the ball draw
// frame by frame, and writes down where the pointer was, what was clicked, which keys were pressed
// and when each beat of the story happened. Step 2 (render.cjs) puts those recordings on a staged
// desktop with a camera; step 3 (make-gifs.py) writes the GIFs.
//
//   npm run build
//   node tools/demo/record.cjs artifacts/demo
//   node tools/demo/render.cjs artifacts/demo
//   python tools/demo/make-gifs.py artifacts/demo docs/images
//
// record.cjs and render.cjs take the name of one scene as a last argument (open, copy, search,
// view, ball) and then leave the other scenes as they are.
//
// The app runs on a temporary data folder and opens nothing: the three "open" requests are answered
// without starting a program, and nothing is written to the clipboard. The windows do appear on the
// screen while it records; leave the mouse alone until it has finished.
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const { _electron: electron } = require('@playwright/test')

const { demoData } = require('./demo-data.cjs')

const ROOT = path.resolve(__dirname, '../..')
const PANEL_HEIGHT = 600
const SHORTCUT = 'Ctrl + Shift + Space'
// The windows are drawn at twice their size, so that the camera of the stage can move in on them.
const SCALE = 2

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function todayKey() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** One recording session: the app, its two pages, and the scene being recorded. */
class Session {
  constructor(app, page, outDir) {
    this.app = app
    this.page = page
    this.outDir = outDir
    this.cursor = { x: 0, y: 0 }
    this.scene = null
  }

  get bubble() {
    return this.app.windows().find((window) => window !== this.page)
  }

  /** The bounds and visibility of both windows, as the main process has them. */
  windows() {
    return this.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => ({
        role: window.isResizable() ? 'panel' : 'ball',
        visible: window.isVisible(),
        bounds: window.getBounds(),
      }))
    )
  }

  async bounds(role) {
    const found = (await this.windows()).find((window) => window.role === role)
    return found.bounds
  }

  /** What both windows show right now, as PNG, with where they are. */
  capture() {
    return this.app.evaluate(async ({ BrowserWindow }) => {
      const shots = []
      for (const window of BrowserWindow.getAllWindows()) {
        const shot = {
          role: window.isResizable() ? 'panel' : 'ball',
          visible: window.isVisible(),
          bounds: window.getBounds(),
          opacity: window.getOpacity(),
          png: null,
        }
        if (shot.visible && shot.opacity > 0) {
          try {
            shot.png = (await window.capturePage()).toPNG().toString('base64')
          } catch {
            // The window went away in between: the frame simply has no picture of it.
          }
        }
        shots.push(shot)
      }
      return shots
    })
  }

  async begin(name) {
    const dir = path.join(this.outDir, 'recorded', name)
    await fs.rm(dir, { recursive: true, force: true })
    await fs.mkdir(dir, { recursive: true })
    const scene = {
      name,
      dir,
      start: Date.now(),
      frames: [],
      mouse: [{ t: 0, ...this.cursor }],
      clicks: [],
      keys: [],
      marks: {},
      running: true,
    }
    this.scene = scene
    scene.loop = (async () => {
      let index = 0
      while (scene.running) {
        const t = Date.now() - scene.start
        const shots = await this.capture()
        const frame = { t, windows: [] }
        for (const shot of shots) {
          let file = null
          if (shot.png) {
            file = `f${String(index).padStart(4, '0')}-${shot.role}.png`
            await fs.writeFile(
              path.join(dir, file),
              Buffer.from(shot.png, 'base64')
            )
          }
          frame.windows.push({
            role: shot.role,
            visible: shot.visible,
            bounds: shot.bounds,
            opacity: shot.opacity,
            file,
          })
        }
        scene.frames.push(frame)
        index += 1
      }
    })()
  }

  async end() {
    const scene = this.scene
    scene.running = false
    await scene.loop
    const { name, dir, frames, mouse, clicks, keys, marks } = scene
    await fs.writeFile(
      path.join(dir, 'timeline.json'),
      JSON.stringify({ name, frames, mouse, clicks, keys, marks })
    )
    this.scene = null
    console.log(`${name}: ${frames.length} frames`)
  }

  now() {
    return Date.now() - this.scene.start
  }

  /** Names this moment of the scene; the stage hangs its own events on these. */
  mark(name) {
    this.scene.marks[name] = this.now()
  }

  note(point) {
    this.cursor = point
    if (this.scene) this.scene.mouse.push({ t: this.now(), ...point })
  }

  /** Shows a key combination under the windows for a moment. */
  key(text, duration = 1100) {
    this.scene.keys.push({ t: this.now(), text, duration })
  }

  /** Moves the pointer to a screen point, the way a hand does: quickly, then slowing down. */
  async glide(target, page, origin) {
    const from = { ...this.cursor }
    const distance = Math.hypot(target.x - from.x, target.y - from.y)
    const duration = Math.min(700, Math.max(240, distance * 1.7))
    const begin = Date.now()
    for (;;) {
      const progress = Math.min(1, (Date.now() - begin) / duration)
      const eased = 1 - (1 - progress) ** 3
      const point = {
        x: Math.round(from.x + (target.x - from.x) * eased),
        y: Math.round(from.y + (target.y - from.y) * eased),
      }
      this.note(point)
      await page.mouse.move(point.x - origin.x, point.y - origin.y)
      if (progress >= 1) break
      await sleep(12)
    }
  }

  /**
   * Moves the pointer onto an element of the panel (or of the ball). `at` says where in the
   * element, as shares of its width and height (the middle by default: a row is pointed at beside
   * its text, a tab on its icon).
   */
  async point(
    locator,
    { page = this.page, role = 'panel', at = [0.5, 0.5] } = {}
  ) {
    await locator.scrollIntoViewIfNeeded()
    const box = await locator.boundingBox()
    const origin = await this.bounds(role)
    const target = {
      x: Math.round(origin.x + box.x + box.width * at[0]),
      y: Math.round(origin.y + box.y + box.height * at[1]),
    }
    await this.glide(target, page, origin)
    return target
  }

  /** Points at an element and clicks it. `mark` names the moment of the click. */
  async click(locator, { mark, ...where } = {}) {
    const page = where.page ?? this.page
    const target = await this.point(locator, where)
    await sleep(160)
    this.scene?.clicks.push({ t: this.now(), ...target })
    if (mark) this.mark(mark)
    await page.mouse.down()
    await sleep(70)
    await page.mouse.up()
  }

  /**
   * The middle of the empty stretch of the title bar, in the panel: the pointer rests there, and
   * holds the panel there to drag it, without lighting a button up.
   */
  restSpot() {
    return this.page.evaluate(() => {
      const actions = globalThis.document.querySelector('.titlebar-actions')
      const box = actions.getBoundingClientRect()
      const before = actions.previousElementSibling.getBoundingClientRect()
      return {
        x: Math.round((before.right + box.left) / 2),
        y: Math.round(box.top + box.height / 2),
      }
    })
  }

  /**
   * Puts the pointer there without anyone watching (between scenes), and takes the keyboard focus
   * off whatever had it: a focus ring left from the scene before is not part of the story.
   */
  async park() {
    const origin = await this.bounds('panel')
    const spot = await this.restSpot()
    this.cursor = { x: origin.x + spot.x, y: origin.y + spot.y }
    await this.page.mouse.move(spot.x, spot.y)
    await this.blur()
  }

  /**
   * While Windows drags a window, the page in it hears nothing of the mouse. The drag of the demo
   * is made of single steps, so the page is told to ignore the mouse for as long as it lasts.
   */
  async deaf(on) {
    await this.page.evaluate((deaf) => {
      const root = globalThis.document.documentElement
      root.style.pointerEvents = deaf ? 'none' : ''
    }, on)
  }

  blur() {
    return this.page.evaluate(() => globalThis.document.activeElement?.blur())
  }

  panelVisible() {
    return this.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())
        .isVisible()
    )
  }

  /** Every scene starts from the open panel, whatever the scene before it left. */
  async ensurePanel() {
    if (await this.panelVisible()) return
    await this.summon()
    await this.untilPanel(true)
  }

  async untilPanel(visible) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ((await this.panelVisible()) === visible) return
      await sleep(50)
    }
    throw new Error(
      `the panel did not become ${visible ? 'visible' : 'hidden'}`
    )
  }

  /** What the global shortcut does (it is not registered in a test run). */
  summon() {
    return this.app.evaluate(({ app }) => app.emit('second-instance'))
  }
}

async function prepare(outDir) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marubako-demo-'))
  const app = await electron.launch({
    args: [
      `--force-device-scale-factor=${SCALE}`,
      path.join(ROOT, 'out/main/index.js'),
    ],
    cwd: ROOT,
    env: {
      ...process.env,
      QUICKLAUNCH_E2E: '1',
      // A real first start: the look of a new installation, and the ball beside the panel.
      QUICKLAUNCH_FIRST_RUN: '1',
      QUICKLAUNCH_LOCALE: 'en-US',
      QUICKLAUNCH_USER_DATA: userDataDir,
    },
  })
  const page = await app.firstWindow()
  await page.getByTestId('app-root').waitFor()

  // Nothing is really opened: the three requests are answered as done.
  await app.evaluate(({ ipcMain }) => {
    for (const channel of [
      'system-open-path',
      'system-open-app',
      'system-open-url',
    ]) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, async () => ({ ok: true, data: '' }))
    }
  })

  await page.evaluate(async (demo) => {
    // The card of a first start is put away for good (use-onboarding.ts keeps it under this key).
    localStorage.setItem(
      'onboarding-v1',
      JSON.stringify({
        dismissed: true,
        baseline: [],
        bubble: true,
        hotkey: true,
      })
    )
    const loaded = await globalThis.quickLaunch.loadData()
    await globalThis.quickLaunch.saveData({ ...loaded.data, ...demo })
  }, demoData(todayKey()))
  await page.reload()
  await page.getByTestId('app-root').waitFor()
  // Nothing is put on the real clipboard either.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    })
  })

  // The ball of a first start takes a moment to arrive. Then the panel is made lower (a picture of
  // the full height would be mostly empty) and kept centred on the ball.
  await sleep(1800)
  await app.evaluate(({ BrowserWindow }, height) => {
    const all = BrowserWindow.getAllWindows()
    const panel = all.find((window) => window.isResizable())
    const ball = all.find((window) => !window.isResizable())
    const bounds = panel.getBounds()
    const dock = ball.getBounds()
    panel.setBounds({
      ...bounds,
      y: Math.round(dock.y + dock.height / 2 - height / 2),
      height,
    })
    panel.emit('resized')
  }, PANEL_HEIGHT)
  await sleep(400)

  return { session: new Session(app, page, outDir), userDataDir }
}

// Where rows and tabs are clicked: a row beside its text, a tab on its icon.
const ROW = [0.62, 0.5]
const TAB = [0.5, 0.32]

/** The shortcut brings the panel out of the ball; a folder and a test page are one click each. */
async function sceneOpen(s) {
  const { page } = s
  await s.ensurePanel()
  await page.getByTestId('tab-folders').click()
  await s.blur()
  await page.getByTestId('dock-panel').click()
  await s.untilPanel(false)
  await sleep(700)
  const ball = await s.bounds('ball')
  s.cursor = { x: ball.x - 330, y: ball.y + 140 }

  await s.begin('open')
  await sleep(1100)
  s.key(SHORTCUT, 1500)
  s.mark('summon')
  await sleep(450)
  await s.summon()
  await s.untilPanel(true)
  await sleep(1300)
  await s.click(page.getByTestId('item-row-f-detail'), {
    mark: 'open-folder',
    at: ROW,
  })
  // The stage shows the folder opening in a file manager during this pause.
  await sleep(3800)
  s.mark('folder-shown')
  await s.click(page.getByTestId('tab-websites'), { at: TAB })
  await sleep(700)
  await s.click(page.getByTestId('item-row-s-test-admin'), {
    mark: 'open-site',
    at: ROW,
  })
  await sleep(2700)
  await s.end()
}

/** Accounts of every environment: user name, password and a command are one click each. */
async function sceneCopy(s) {
  const { page } = s
  await s.ensurePanel()
  await page.getByTestId('tab-passwords').click()
  await sleep(500)
  await s.park()

  await s.begin('copy')
  await sleep(1500)
  await s.click(page.getByTestId('copy-username-p-admin'), {
    mark: 'copy-user',
  })
  // The stage pastes into the sign-in page of its browser during these pauses.
  await sleep(2900)
  s.mark('copy-user-end')
  await s.click(page.getByTestId('copy-item-p-admin'), { mark: 'copy-pass' })
  await sleep(4900)
  s.mark('copy-pass-end')
  await s.click(page.getByTestId('tab-commands'), { at: TAB })
  await sleep(800)
  await s.click(page.getByTestId('copy-item-c-logs'), { mark: 'copy-cmd' })
  await sleep(4300)
  await s.end()
}

/** Ctrl+K finds anything in any category. */
async function sceneSearch(s) {
  const { page } = s
  await s.ensurePanel()
  await page.getByTestId('tab-folders').click()
  await sleep(500)
  await s.park()

  await s.begin('search')
  await sleep(800)
  s.key('Ctrl + K', 1200)
  s.mark('search')
  await sleep(350)
  await page.keyboard.press('Control+k')
  await page.getByTestId('command-input').waitFor()
  await sleep(700)
  s.mark('typing')
  for (const letter of 'test') {
    await page.keyboard.insertText(letter)
    await sleep(190)
  }
  await sleep(1500)
  s.key('Enter', 900)
  await sleep(300)
  await page.keyboard.press('Enter')
  s.mark('open-result')
  await s.blur()
  await sleep(2900)
  await s.end()
}

/**
 * One button shows the entries as a grid: the groups become tiles, and a tile opens its group. The
 * same button brings the list back.
 */
async function sceneView(s) {
  const { page } = s
  await s.ensurePanel()
  await page.getByTestId('tab-websites').click()
  await sleep(500)
  await s.park()
  // The pointer waits on the desktop, level with the window row: on its way to the button it
  // crosses the search field and nothing else.
  const panel = await s.bounds('panel')
  s.cursor = { x: panel.x - 70, y: panel.y + 24 }

  await s.begin('view')
  await sleep(1700)
  await s.click(page.getByTestId('toggle-view-mode'), { mark: 'grid' })
  await sleep(2300)
  // Between the name of the tile and its right end, where its two small buttons come up.
  await s.click(page.getByTestId('folder-widget-g-docs'), {
    mark: 'group',
    at: [0.6, 0.56],
  })
  // The pointer goes on to one of the entries of the group, as a hand would.
  await sleep(800)
  await s.point(page.getByTestId('grid-item-s-wiki'), { at: [0.5, 0.7] })
  await sleep(1500)
  await s.click(page.locator('.widget-popup-close'), { mark: 'close' })
  await sleep(900)
  await s.click(page.getByTestId('toggle-view-mode'), { mark: 'list' })
  await sleep(2500)
  await s.end()
}

/** The panel folds into the ball, comes back, and the two move as one. */
async function sceneBall(s) {
  const { page, app } = s
  await s.ensurePanel()
  await page.getByTestId('tab-folders').click()
  await sleep(600)
  await s.park()

  await s.begin('ball')
  await sleep(1000)
  await s.click(page.getByTestId('dock-panel'), { mark: 'collapse' })
  await s.untilPanel(false)
  await sleep(3900)

  // A double click on the ball opens the panel to stay. The pointer stops with its tip just off
  // the middle of the ball, so that the ball is not hidden under it. The panel is brought up the
  // way the double click does it (a real one would first show the hint of a temporary panel).
  const bubble = s.bubble
  const dock = await s.bounds('ball')
  const onBall = {
    x: Math.round(dock.x + dock.width / 2) + 7,
    y: Math.round(dock.y + dock.height / 2) + 7,
  }
  await s.glide(onBall, bubble, dock)
  await sleep(600)
  s.mark('expand')
  s.key('Double-click', 1000)
  s.scene.clicks.push({ t: s.now(), ...onBall })
  await sleep(170)
  s.scene.clicks.push({ t: s.now(), ...onBall })
  await s.summon()
  await s.untilPanel(true)
  await sleep(1700)

  // Dragging the panel by its title bar takes the ball along. Windows moves a window itself while
  // it is dragged; here the same steps are reported to the app one by one.
  const panel = await s.bounds('panel')
  const hold = await s.restSpot()
  const grip = { x: panel.x + hold.x, y: panel.y + hold.y }
  await s.glide(grip, page, panel)
  // The camera pulls back to the whole screen before the drag begins.
  await sleep(1300)
  s.mark('drag')
  s.key('Drag', 1500)
  await s.deaf(true)
  const travel = { x: -520, y: 70 }
  const steps = 44
  for (let step = 1; step <= steps; step += 1) {
    const eased = 1 - (1 - step / steps) ** 2
    const dx = Math.round(travel.x * eased)
    const dy = Math.round(travel.y * eased)
    await app.evaluate(
      ({ BrowserWindow }, bounds) => {
        const window = BrowserWindow.getAllWindows().find((candidate) =>
          candidate.isResizable()
        )
        window.emit('will-move', { preventDefault() {} }, window.getBounds())
        window.setBounds(bounds)
      },
      { ...panel, x: panel.x + dx, y: panel.y + dy }
    )
    await page.mouse.move(hold.x, hold.y)
    s.note({ x: grip.x + dx, y: grip.y + dy })
    await sleep(22)
  }
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((candidate) => candidate.isResizable())
      .emit('moved')
  })
  await s.deaf(false)
  // The page hears the mouse again, and learns first of all that the pointer is on the title bar.
  await page.mouse.move(hold.x, hold.y + 1)
  await page.mouse.move(hold.x, hold.y)
  s.mark('drag-end')
  await sleep(1000)

  // Collapsed where it was left: the ball stays there, and the desktop is empty again.
  await s.click(page.getByTestId('dock-panel'), { mark: 'collapse-again' })
  await s.untilPanel(false)
  await sleep(2000)
  await s.end()
}

const SCENES = {
  open: sceneOpen,
  copy: sceneCopy,
  search: sceneSearch,
  view: sceneView,
  ball: sceneBall,
}

async function main() {
  const outDir = path.resolve(process.argv[2] ?? 'artifacts/demo')
  const only = process.argv[3]
  if (only && !SCENES[only]) {
    throw new Error(`no scene named ${only}: ${Object.keys(SCENES).join(', ')}`)
  }
  const { session, userDataDir } = await prepare(outDir)
  try {
    for (const [name, scene] of Object.entries(SCENES)) {
      if (!only || only === name) await scene(session)
    }
  } finally {
    await session.app.close().catch(() => {})
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
