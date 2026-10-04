// Records the animated demos of the README. It drives the built app with made-up data
// (demo-data.cjs), saves what the two windows show frame by frame, and writes down where the
// pointer was and which keys were pressed. make-gifs.py turns that into the GIFs.
//
//   npm run build
//   node tools/demo/record.cjs zh artifacts/demo     (and again with en)
//   python tools/demo/make-gifs.py artifacts/demo docs/images
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function todayKey() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** One recording session: the app, its two pages, and the scene being recorded. */
class Session {
  constructor(app, page, lang, outDir) {
    this.app = app
    this.page = page
    this.lang = lang
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
    const dir = path.join(this.outDir, this.lang, name)
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
    const { name, dir, frames, mouse, clicks, keys } = scene
    await fs.writeFile(
      path.join(dir, 'timeline.json'),
      JSON.stringify({ name, lang: this.lang, frames, mouse, clicks, keys })
    )
    this.scene = null
    console.log(`${this.lang}/${name}: ${frames.length} frames`)
  }

  now() {
    return Date.now() - this.scene.start
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
    const duration = Math.min(700, Math.max(220, distance * 1.6))
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

  /** Moves the pointer onto an element of the panel (or of the ball) and clicks it. */
  async click(locator, { page = this.page, role = 'panel', hold = 70 } = {}) {
    await locator.scrollIntoViewIfNeeded()
    const box = await locator.boundingBox()
    const origin = await this.bounds(role)
    const target = {
      x: Math.round(origin.x + box.x + box.width / 2),
      y: Math.round(origin.y + box.y + box.height / 2),
    }
    await this.glide(target, page, origin)
    await sleep(140)
    this.scene?.clicks.push({ t: this.now(), ...target })
    await page.mouse.down()
    await sleep(hold)
    await page.mouse.up()
  }

  async hover(locator, options) {
    const { page = this.page, role = 'panel' } = options ?? {}
    const box = await locator.boundingBox()
    const origin = await this.bounds(role)
    await this.glide(
      {
        x: Math.round(origin.x + box.x + box.width / 2),
        y: Math.round(origin.y + box.y + box.height / 2),
      },
      page,
      origin
    )
  }

  /** Puts the pointer somewhere without anyone watching (between scenes). */
  async park(role, dx, dy) {
    const origin = await this.bounds(role)
    this.cursor = { x: origin.x + dx, y: origin.y + dy }
    await this.page.mouse.move(dx, dy)
  }

  panelVisible() {
    return this.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())
        .isVisible()
    )
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
}

async function prepare(lang, outDir) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marubako-demo-'))
  const app = await electron.launch({
    args: [path.join(ROOT, 'out/main/index.js')],
    cwd: ROOT,
    env: {
      ...process.env,
      QUICKLAUNCH_E2E: '1',
      // A real first start: the look of a new installation, and the ball beside the panel.
      QUICKLAUNCH_FIRST_RUN: '1',
      QUICKLAUNCH_LOCALE: lang === 'zh' ? 'zh-CN' : 'en-US',
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

  await page.evaluate(
    async (demo) => {
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
    },
    demoData(lang, todayKey())
  )
  await page.reload()
  await page.getByTestId('app-root').waitFor()
  // Nothing is put on the real clipboard either.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    })
  })

  // The ball of a first start takes a moment to arrive. Then the panel is made lower (a GIF of the
  // full height would be mostly empty) and kept centred on the ball.
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

  return { session: new Session(app, page, lang, outDir), userDataDir }
}

/** The shortcut brings the panel out of the ball; a folder and a test page are one click each. */
async function sceneOpen(s) {
  const { page } = s
  await page.getByTestId('tab-folders').click()
  await page.getByTestId('dock-panel').click()
  await s.untilPanel(false)
  await sleep(700)
  const ball = await s.bounds('ball')
  s.cursor = { x: ball.x - 260, y: ball.y + 150 }

  await s.begin('open')
  await sleep(700)
  s.key(SHORTCUT, 1500)
  await sleep(450)
  // What the global shortcut does (it is not registered in a test run).
  await s.app.evaluate(({ app }) => app.emit('second-instance'))
  await s.untilPanel(true)
  await sleep(1100)
  await s.click(page.getByTestId('item-row-f-detail'))
  await sleep(1000)
  await s.click(page.getByTestId('tab-websites'))
  await sleep(700)
  await s.click(page.getByTestId('item-row-s-test-admin'))
  await sleep(1400)
  await s.end()
}

/** Accounts of every environment: user name, password and a command are one click each. */
async function sceneCopy(s) {
  const { page } = s
  await page.getByTestId('tab-passwords').click()
  await sleep(500)
  await s.park('panel', 60, 420)

  await s.begin('copy')
  await sleep(700)
  await s.click(page.getByTestId('copy-username-p-admin'))
  await sleep(1100)
  await s.click(page.getByTestId('copy-item-p-admin'))
  await sleep(1100)
  await s.click(page.getByTestId('copy-item-p-test-db'))
  await sleep(1000)
  await s.click(page.getByTestId('tab-commands'))
  await sleep(800)
  await s.click(page.getByTestId('copy-item-c-logs'))
  await sleep(1500)
  await s.end()
}

/** Ctrl+K finds anything in any category. */
async function sceneSearch(s) {
  const { page, lang } = s
  await page.getByTestId('tab-folders').click()
  await sleep(500)
  await s.park('panel', 200, 500)

  await s.begin('search')
  await sleep(600)
  s.key('Ctrl + K', 1200)
  await sleep(350)
  await page.keyboard.press('Control+k')
  await page.getByTestId('command-input').waitFor()
  await sleep(700)
  for (const letter of lang === 'zh' ? ['测', '试'] : [...'test']) {
    await page.keyboard.insertText(letter)
    await sleep(lang === 'zh' ? 420 : 170)
  }
  await sleep(1100)
  for (let step = 0; step < 2; step += 1) {
    s.key('↓', 500)
    await page.keyboard.press('ArrowDown')
    await sleep(420)
  }
  await sleep(500)
  s.key('Enter', 900)
  await sleep(250)
  await page.keyboard.press('Enter')
  await sleep(1500)
  await s.end()
}

/** The panel folds into the ball, comes back, and the two move as one. */
async function sceneBall(s) {
  const { page, app } = s
  if (!(await s.panelVisible())) {
    await app.evaluate(({ app: running }) => running.emit('second-instance'))
    await s.untilPanel(true)
  }
  await page.getByTestId('tab-folders').click()
  await sleep(600)
  await s.park('panel', 150, 380)

  await s.begin('ball')
  await sleep(600)
  await s.click(page.getByTestId('dock-panel'))
  await s.untilPanel(false)
  await sleep(1100)

  // A double click on the ball opens the panel to stay.
  const bubble = s.bubble
  const dock = await s.bounds('ball')
  const centre = {
    x: Math.round(dock.x + dock.width / 2),
    y: Math.round(dock.y + dock.height / 2),
  }
  await s.glide(centre, bubble, dock)
  await sleep(250)
  for (let press = 0; press < 2; press += 1) {
    s.scene.clicks.push({ t: s.now(), ...centre })
    await bubble.mouse.down()
    await sleep(50)
    await bubble.mouse.up()
    await sleep(110)
  }
  await s.untilPanel(true)
  await sleep(1200)

  // Dragging the panel by its title bar takes the ball along. Windows moves a window itself while
  // it is dragged; here the same steps are reported to the app one by one.
  const panel = await s.bounds('panel')
  const grip = { x: panel.x + Math.round(panel.width * 0.62), y: panel.y + 18 }
  await s.glide(grip, page, panel)
  await sleep(300)
  s.scene.clicks.push({ t: s.now(), ...grip })
  const travel = { x: -150, y: 46 }
  const steps = 26
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
    s.note({ x: grip.x + dx, y: grip.y + dy })
    await sleep(22)
  }
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((candidate) => candidate.isResizable())
      .emit('moved')
  })
  await sleep(1400)
  await s.end()
}

async function main() {
  const lang = process.argv[2] === 'en' ? 'en' : 'zh'
  const outDir = path.resolve(process.argv[3] ?? 'artifacts/demo')
  const { session, userDataDir } = await prepare(lang, outDir)
  try {
    await sceneOpen(session)
    await sceneCopy(session)
    await sceneSearch(session)
    await sceneBall(session)
  } finally {
    await session.app.close().catch(() => {})
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
