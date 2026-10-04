import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from './test-utils'
import { dragNativeMouse } from './native-mouse'
import { DOCK_SIZE } from '../src/shared/dock-size'

// Exercise the leave timer with deterministic cursor coordinates while the
// user's desktop remains interactive. Real OS dragging is verified separately.
async function movePointer(
  context: AppContext,
  point: { x: number; y: number }
) {
  await context.electronApp.evaluate(({ screen }, point) => {
    const memory = globalThis as typeof globalThis & {
      peekPointer?: {
        point: typeof point
        read: typeof screen.getCursorScreenPoint
      }
    }
    memory.peekPointer ??= {
      point,
      read: screen.getCursorScreenPoint.bind(screen),
    }
    memory.peekPointer.point = point
    screen.getCursorScreenPoint = () => memory.peekPointer!.point
  }, point)
}

async function state(context: AppContext) {
  return context.electronApp.evaluate(async ({ BrowserWindow, screen }) => {
    const panel = BrowserWindow.getAllWindows().find((window) =>
      window.isResizable()
    )!
    const bubble = BrowserWindow.getAllWindows().find(
      (window) => !window.isResizable()
    )!
    return {
      visible: panel.isVisible(),
      ready:
        panel.isVisible() &&
        !(await panel.webContents.executeJavaScript(
          "document.getElementById('root')?.dataset.presentation"
        )),
      pinned: panel.isAlwaysOnTop(),
      panel: panel.getBounds(),
      bubble: bubble.getBounds(),
      bubbleVisible: bubble.isVisible(),
      area: screen.getDisplayMatching(panel.getBounds()).workArea,
    }
  })
}

async function collapse(context: AppContext) {
  await context.page.evaluate(() => window.quickLaunch.window.collapse())
  const bubble = context.electronApp
    .windows()
    .find((page) => page !== context.page)!
  await expect(bubble.getByTestId('dock-bubble')).toBeVisible()
  return bubble
}

async function openPeek(context: AppContext) {
  const bubble = await collapse(context)
  const bounds = (await state(context)).bubble
  await movePointer(context, {
    x: bounds.x + DOCK_SIZE / 2,
    y: bounds.y + DOCK_SIZE / 2,
  })
  await bubble.getByTestId('dock-bubble').click()
  await expect.poll(async () => (await state(context)).ready).toBe(true)
  return bubble
}

async function outside(context: AppContext, offset = 0) {
  const area = (await state(context)).area
  await movePointer(context, { x: area.x + 10 + offset, y: area.y + 10 })
}

test('temporary right-side expansion flips inward and repeatedly returns to the untouched bubble', async () => {
  const context = await launchApp()
  try {
    const bubble = await collapse(context)
    const before = await state(context)
    const anchor = {
      x: before.area.x + before.area.width - 180,
      y: before.area.y + before.area.height - 130,
    }
    await bubble.evaluate(
      async ({ from, to, half }) => {
        const api = window.quickLaunch.window
        await api.dragDock({
          phase: 'start',
          x: from.x + half,
          y: from.y + half,
        })
        await api.dragDock({
          phase: 'move',
          x: to.x + half,
          y: to.y + half,
        })
        await api.dragDock({
          phase: 'end',
          x: to.x + half,
          y: to.y + half,
        })
      },
      { from: before.bubble, to: anchor, half: DOCK_SIZE / 2 }
    )
    for (let count = 0; count < 3; count++) {
      await movePointer(context, {
        x: anchor.x + DOCK_SIZE / 2,
        y: anchor.y + DOCK_SIZE / 2,
      })
      await bubble.getByTestId('dock-bubble').click()
      await expect.poll(async () => (await state(context)).ready).toBe(true)
      const expanded = await state(context)
      expect(expanded.bubble).toMatchObject(anchor)
      expect(expanded.bubbleVisible).toBe(true)
      expect(expanded.panel.x + expanded.panel.width).toBeLessThan(anchor.x)
      expect(expanded.panel.y + expanded.panel.height).toBeLessThanOrEqual(
        expanded.area.y + expanded.area.height
      )
      await expect(bubble.getByTestId('dock-bubble')).toHaveAttribute(
        'aria-expanded',
        'true'
      )
      // This desktop strip is within the combined bounding rectangle, but is
      // outside both the panel and the actual ball. It must dismiss the peek.
      await movePointer(context, {
        x: anchor.x + DOCK_SIZE / 2,
        y: expanded.panel.y + 60,
      })
      await expect.poll(async () => (await state(context)).visible).toBe(false)
      expect((await state(context)).bubble).toMatchObject(anchor)
      const data = await context.page.evaluate(() =>
        window.quickLaunch.loadData()
      )
      expect(data.ok && data.data.window.dockEdge).toBe(null)
      expect(data.ok && data.data.window.dockPosition).toEqual(anchor)
    }
  } finally {
    await closeApp(context)
  }
})

test('saved auto-collapse delay changes leave timing without restarting', async () => {
  const context = await launchApp()
  try {
    await context.page.getByTestId('open-settings').click()
    await context.page.getByTestId('settings-tab-behavior').click()
    const delay = context.page.getByTestId('peek-collapse-delay')
    await expect(delay).toHaveValue('200')
    await delay.press('End')
    await context.page.getByTestId('settings-save').click()
    const bubble = await openPeek(context)
    await outside(context)
    await context.page.waitForTimeout(600)
    // The previous fixed 400ms timer would already be closing at this point.
    expect((await state(context)).ready).toBe(true)

    await bubble.evaluate(() =>
      window.quickLaunch.window.activateDock('window')
    )
    await context.page.getByTestId('open-settings').click()
    await context.page.getByTestId('settings-tab-behavior').click()
    await expect(delay).toHaveValue('2000')
    await delay.press('Home')
    await expect(delay).toHaveAttribute('aria-valuetext', '立即')
    await context.page.getByTestId('settings-save').click()
    const saved = await context.page.evaluate(() =>
      window.quickLaunch.loadData()
    )
    expect(saved.ok && saved.data.prefs.peekCollapseDelay).toBe(0)

    await openPeek(context)
    await outside(context)
    await expect
      .poll(async () => (await state(context)).visible, {
        timeout: 1000,
        intervals: [40],
      })
      .toBe(false)
  } finally {
    await closeApp(context)
  }
})

test('pin suspends temporary dismissal, unpin resumes it, and double-click opens an ordinary persistent window', async () => {
  const context = await launchApp()
  try {
    const bubble = await openPeek(context)
    await expect(bubble.getByTestId('dock-bubble')).toHaveAttribute(
      'title',
      /双击保持打开/
    )
    await context.page.getByTestId('toggle-pin').click()
    await outside(context)
    await context.page.waitForTimeout(750)
    expect((await state(context)).visible).toBe(true)
    expect((await state(context)).pinned).toBe(true)
    await context.page.getByTestId('toggle-pin').click()
    await expect.poll(async () => (await state(context)).visible).toBe(false)
    const anchor = (await state(context)).bubble
    await movePointer(context, {
      x: anchor.x + DOCK_SIZE / 2,
      y: anchor.y + DOCK_SIZE / 2,
    })
    await bubble.getByTestId('dock-bubble').dblclick({ delay: 90 })
    await expect
      .poll(async () => {
        const snapshot = await context.page.evaluate(() =>
          window.quickLaunch.window.getState()
        )
        return snapshot.ok && snapshot.data.mode
      })
      .toBe('window')
    await expect.poll(async () => (await state(context)).ready).toBe(true)
    await outside(context)
    await context.page.waitForTimeout(750)
    expect((await state(context)).visible).toBe(true)
    expect((await state(context)).pinned).toBe(false)
    expect((await state(context)).bubble).toEqual(anchor)
    await context.page.getByTestId('close-window').click()
    // Close to tray hides the panel only; the ball is permanent unless the setting turns it off.
    await expect.poll(async () => (await state(context)).visible).toBe(false)
    expect((await state(context)).bubbleVisible).toBe(true)
    await context.electronApp.evaluate(({ app }) => app.emit('second-instance'))
    await expect.poll(async () => (await state(context)).ready).toBe(true)
    await context.page.waitForTimeout(750)
    expect((await state(context)).visible).toBe(true)
    expect((await state(context)).bubbleVisible).toBe(true)
  } finally {
    await closeApp(context)
  }
})

test('editing and keyboard navigation protect temporary panels until interaction finishes', async () => {
  const context = await launchApp()
  try {
    await openPeek(context)
    await context.page.getByTestId('add-loose-item-folders').click()
    await context.page.getByTestId('item-name-input').fill('离开也保留编辑')
    await context.page.getByTestId('item-path-input').fill('C:\\Windows')
    await outside(context)
    await context.page.waitForTimeout(750)
    expect((await state(context)).visible).toBe(true)
    await expect(context.page.getByTestId('item-name-input')).toHaveValue(
      '离开也保留编辑'
    )
    await context.page.getByTestId('item-save').click()
    await expect.poll(async () => (await state(context)).visible).toBe(false)
    const bubble = context.electronApp
      .windows()
      .find((page) => page !== context.page)!
    // Keyboard users can open without first moving the OS pointer onto the ball.
    await bubble.evaluate(() => window.quickLaunch.window.activateDock('peek'))
    await context.page.keyboard.press('Alt+3')
    await context.page.waitForTimeout(750)
    expect((await state(context)).visible).toBe(true)
    await expect(context.page.getByTestId('tab-apps')).toHaveClass(/active/)
    await outside(context, 40)
    await expect.poll(async () => (await state(context)).visible).toBe(false)
  } finally {
    await closeApp(context)
  }
})

test('dragging the visible anchor moves its open panel and does not turn drag release into a click', async () => {
  const context = await launchApp()
  try {
    const bubble = await collapse(context)
    const initial = (await state(context)).bubble
    await movePointer(context, {
      x: initial.x + DOCK_SIZE / 2,
      y: initial.y + DOCK_SIZE / 2,
    })
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect.poll(async () => (await state(context)).ready).toBe(true)
    const before = await state(context)
    await context.electronApp.evaluate(({ screen }) => {
      const memory = globalThis as typeof globalThis & {
        peekPointer?: { read: typeof screen.getCursorScreenPoint }
      }
      if (memory.peekPointer)
        screen.getCursorScreenPoint = memory.peekPointer.read
      delete memory.peekPointer
    })
    await dragNativeMouse(
      context,
      {
        x: before.bubble.x + DOCK_SIZE / 2,
        y: before.bubble.y + DOCK_SIZE / 2,
      },
      {
        x: before.bubble.x + DOCK_SIZE / 2 + 80,
        y: before.bubble.y + DOCK_SIZE / 2 + 40,
      }
    )
    await expect
      .poll(async () => (await state(context)).bubble.x)
      .toBe(before.bubble.x + 80)
    expect((await state(context)).visible).toBe(true)
    await context.page.getByTestId('dock-panel').click()
    await expect.poll(async () => (await state(context)).visible).toBe(false)
    expect((await state(context)).bubble).toMatchObject({
      x: before.bubble.x + 80,
      y: before.bubble.y + 40,
    })
  } finally {
    await closeApp(context)
  }
})

/** The pointer position just beyond the panel's far edge, away from the ball. */
async function pointerBeyondPanel(
  context: AppContext,
  distance: number
): Promise<{ x: number; y: number }> {
  const { panel, bubble } = await state(context)
  const rightOfBall = panel.x > bubble.x
  return {
    x: rightOfBall ? panel.x + panel.width + distance : panel.x - distance,
    y: panel.y + Math.round(panel.height / 2),
  }
}

async function snapshot(context: AppContext) {
  const result = await context.page.evaluate(() =>
    window.quickLaunch.window.getState()
  )
  return result.ok ? result.data : undefined
}

async function mode(context: AppContext) {
  return (await snapshot(context))?.mode
}

// The window stays visible for the whole collapse animation, so "has the collapse started" is read
// from the state the main process reports, which flips the moment it begins.
async function collapseStarted(context: AppContext) {
  return (await snapshot(context))?.collapsed
}

test('a pointer that slips 15 px out of a temporary panel does not start closing it, one that leaves for 100 px does', async () => {
  const context = await launchApp()
  try {
    await openPeek(context)
    // Near zone: a slip off the edge gets a longer grace than the 200 ms default.
    await movePointer(context, await pointerBeyondPanel(context, 15))
    await context.page.waitForTimeout(300)
    expect(await collapseStarted(context)).toBe(false)
    expect((await state(context)).visible).toBe(true)

    // Far zone: leaving for real follows the user's own delay.
    await movePointer(context, await pointerBeyondPanel(context, 100))
    await expect
      .poll(() => collapseStarted(context), { timeout: 600, intervals: [40] })
      .toBe(true)
    await expect.poll(async () => (await state(context)).visible).toBe(false)
    expect((await state(context)).bubbleVisible).toBe(true)
  } finally {
    await closeApp(context)
  }
})

test('the near zone still lets go of the panel after its grace', async () => {
  const context = await launchApp()
  try {
    await openPeek(context)
    await movePointer(context, await pointerBeyondPanel(context, 15))
    await context.page.waitForTimeout(250)
    expect(await collapseStarted(context)).toBe(false)
    await expect
      .poll(() => collapseStarted(context), { timeout: 1500, intervals: [40] })
      .toBe(true)
  } finally {
    await closeApp(context)
  }
})

test('a double-click on the ball while a temporary panel is open turns it into a kept-open window without collapsing', async () => {
  const context = await launchApp()
  try {
    const bubble = await openPeek(context)
    // The click that opened the panel must not pair up with the double-click below (500 ms window).
    await context.page.waitForTimeout(550)
    // Every state the main process pushes to the panel while the double-click happens.
    await context.page.evaluate(() => {
      const seen: boolean[] = []
      Object.assign(window, { collapseStates: seen })
      window.quickLaunch.onWindowState((state) => seen.push(state.collapsed))
    })
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect.poll(() => mode(context)).toBe('window')
    await context.page.waitForTimeout(600)
    const states = await context.page.evaluate(
      () => (window as unknown as { collapseStates: boolean[] }).collapseStates
    )
    // It was never collapsed and re-opened on the way.
    expect(states).not.toContain(true)
    expect((await state(context)).visible).toBe(true)
    await outside(context)
    await context.page.waitForTimeout(750)
    expect((await state(context)).visible).toBe(true)
  } finally {
    await closeApp(context)
  }
})

test('two clicks 480 ms apart still count as a double click and keep the panel open', async () => {
  const context = await launchApp()
  try {
    const bubble = await collapse(context)
    const anchor = (await state(context)).bubble
    await movePointer(context, {
      x: anchor.x + DOCK_SIZE / 2,
      y: anchor.y + DOCK_SIZE / 2,
    })
    // Timed inside the ball's page: Playwright's own click latency would eat the margin.
    await bubble.evaluate(async () => {
      const button = document.querySelector('[data-testid="dock-bubble"]')!
      const click = () => {
        const init = {
          pointerId: 1,
          button: 0,
          buttons: 1,
          bubbles: true,
          screenX: 100,
          screenY: 100,
          clientX: 25,
          clientY: 25,
        }
        button.dispatchEvent(new PointerEvent('pointerdown', init))
        window.dispatchEvent(
          new PointerEvent('pointerup', { ...init, buttons: 0 })
        )
      }
      click()
      await new Promise((resolve) => setTimeout(resolve, 470))
      click()
    })
    await expect.poll(() => mode(context)).toBe('window')
    await expect.poll(async () => (await state(context)).ready).toBe(true)
    await outside(context)
    await context.page.waitForTimeout(750)
    expect((await state(context)).visible).toBe(true)
  } finally {
    await closeApp(context)
  }
})

test('a single click on the ball collapses an open temporary panel after the short double-click wait', async () => {
  const context = await launchApp()
  try {
    const bubble = await openPeek(context)
    // A second click inside the 500 ms double-click window would keep the panel open instead.
    await context.page.waitForTimeout(550)
    await bubble.getByTestId('dock-bubble').click()
    await expect.poll(async () => (await state(context)).visible).toBe(false)
    expect((await state(context)).bubbleVisible).toBe(true)
  } finally {
    await closeApp(context)
  }
})
