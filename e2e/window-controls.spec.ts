import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { IPC_CHANNELS } from '../src/shared/ipc-channels'
import { closeApp, launchApp, type AppContext } from './test-utils'
import { dragNativeMouse } from './native-mouse'
import { getExpandedPosition } from '../src/main/dock-geometry'
import { DOCK_BALL_SIZE, DOCK_SIZE } from '../src/shared/dock-size'
import {
  ROW_MIN_WIDTH,
  SEARCH_ICON_BELOW_WIDTH,
} from '../src/shared/layout-widths'

async function getBubble(
  context: AppContext,
  waitUntilShown = true
): Promise<Page> {
  await expect.poll(() => context.electronApp.windows().length).toBe(2)
  const bubble = context.electronApp
    .windows()
    .find((page) => page !== context.page)!
  await expect(bubble.getByTestId('dock-bubble')).toBeVisible()
  if (waitUntilShown) {
    await expect
      .poll(async () => {
        const state = await windowState(context)
        return state.bubbleVisible && !state.panelVisible
      })
      .toBe(true)
  }
  return bubble
}

async function windowState(context: AppContext) {
  return context.electronApp.evaluate(async ({ BrowserWindow, screen }) => {
    const windows = BrowserWindow.getAllWindows()
    const panel = windows.find((window) => window.isResizable())
    const bubble = windows.find((window) => !window.isResizable())
    const presentation = await panel!.webContents.executeJavaScript(
      "document.getElementById('root')?.dataset.presentation ?? ''"
    )
    return {
      panelVisible: panel!.isVisible(),
      panelReady: panel!.isVisible() && !presentation,
      panelBounds: panel!.getBounds(),
      panelSize: panel!.getSize(),
      panelOnTop: panel!.isAlwaysOnTop(),
      bubbleVisible: bubble?.isVisible(),
      bubbleOnTop: bubble?.isAlwaysOnTop(),
      bubbleFocusable: bubble?.isFocusable(),
      bounds: bubble?.getBounds(),
      area: bubble
        ? screen.getDisplayMatching(bubble.getBounds()).workArea
        : undefined,
    }
  })
}

test('docks to an always-on-top bubble and restores the same panel without resizing', async () => {
  const context = await launchApp()
  try {
    await context.page.getByTestId('tab-commands').click()
    const expandedSize = (await windowState(context)).panelSize
    const expandedBounds = (await windowState(context)).panelBounds
    await context.page.getByTestId('dock-panel').click()
    const bubble = await getBubble(context)
    await expect
      .poll(async () => (await windowState(context)).panelVisible)
      .toBe(false)
    const compact = await windowState(context)
    expect(compact.panelSize).toEqual(expandedSize)
    expect(compact.bubbleOnTop).toBe(true)
    expect(compact.bubbleFocusable).toBe(true)
    expect(compact.bounds!.width).toBe(DOCK_SIZE)
    expect(compact.bounds!.height).toBe(DOCK_SIZE)
    expect(compact.bounds!.x).toBe(expandedBounds.x)
    expect(compact.bounds!.y).toBe(expandedBounds.y)
    await bubble.screenshot({ path: 'artifacts/dock-bubble.png' })
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    await expect(context.page.getByTestId('tab-commands')).toHaveClass(/active/)
    await expect(context.page.getByTestId('command-input')).toHaveCount(0)
    expect((await windowState(context)).panelSize).toEqual(expandedSize)
    expect((await windowState(context)).bubbleVisible).toBe(true)
    await context.page.screenshot({
      path: 'artifacts/dock-workspace.png',
      animations: 'disabled',
    })
  } finally {
    await closeApp(context)
  }
})

test('snaps a dragged bubble to the opposite edge and remembers it across restart and edits', async () => {
  const first = await launchApp()
  const userDataDir = first.userDataDir
  try {
    await first.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())!
        .setSize(820, 600)
    )
    await first.page.getByTestId('dock-panel').click()
    const bubble = await getBubble(first)
    const state = await windowState(first)
    const point = {
      x: state.bounds!.x + DOCK_SIZE / 2,
      y: state.bounds!.y + DOCK_SIZE / 2,
    }
    const destination = { x: state.area!.x + 38, y: state.area!.y + 200 }
    const results = await bubble.evaluate(
      async ({ point, destination }) => {
        const api = window.quickLaunch.window
        return [
          await api.dragDock({ phase: 'start', ...point }),
          await api.dragDock({ phase: 'move', ...destination }),
          await api.dragDock({ phase: 'end', ...destination }),
        ]
      },
      { point, destination }
    )
    expect(results.every((result) => result.ok)).toBe(true)
    const moved = await windowState(first)
    expect(moved.bounds!.x).toBe(moved.area!.x + 4)
    expect(moved.bounds!.y).toBe(moved.area!.y + 200 - DOCK_SIZE / 2)
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect
      .poll(async () => (await windowState(first)).panelReady)
      .toBe(true)
    await first.page.getByTestId('add-loose-item-folders').click()
    await first.page.getByTestId('item-name-input').fill('悬浮测试')
    await first.page.getByTestId('item-path-input').fill('C:\\Windows')
    await first.page.getByTestId('item-save').click()
    const data = await first.page.evaluate(() => window.quickLaunch.loadData())
    expect(data.ok && data.data.window.dockPosition!.x).toBe(moved.area!.x + 4)
    await first.page.getByTestId('dock-panel').click()
  } finally {
    await closeApp(first, { cleanup: false })
  }
  const second = await launchApp(userDataDir)
  try {
    // The ball was the last state, so it comes back by itself and the panel stays hidden.
    await getBubble(second)
    const restored = await windowState(second)
    expect(restored.panelSize).toEqual([820, 600])
    expect(restored.bounds!.x).toBe(restored.area!.x + 4)
    expect(restored.bounds!.y).toBe(restored.area!.y + 200 - DOCK_SIZE / 2)
  } finally {
    await closeApp(second)
  }
})

test('native edge dragging docks the panel and reopening does not activate search', async () => {
  const context = await launchApp()
  try {
    await context.page.keyboard.press('Control+k')
    await expect(context.page.getByTestId('command-input')).toBeVisible()
    await context.page.keyboard.press('Escape')
    await context.electronApp.evaluate(({ BrowserWindow, screen }) => {
      const panel = BrowserWindow.getAllWindows().find((window) =>
        window.isResizable()
      )!
      const area = screen.getDisplayMatching(panel.getBounds()).workArea
      panel.setPosition(area.x, area.y + 100)
      panel.emit('will-move', { preventDefault() {} }, panel.getBounds())
      panel.emit('moved')
    })
    await getBubble(context)
    await expect
      .poll(async () => (await windowState(context)).panelVisible)
      .toBe(false)
    await context.electronApp.evaluate(({ app }) => app.emit('second-instance'))
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    await expect(context.page.getByTestId('command-input')).toHaveCount(0)
    await context.page.keyboard.press('Control+k')
    await expect(context.page.getByTestId('command-input')).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('dragging the bubble moves it without opening the panel on release', async () => {
  const context = await launchApp()
  try {
    await context.page.getByTestId('dock-panel').click()
    const bubble = await getBubble(context)
    const button = bubble.getByTestId('dock-bubble')
    const initial = await windowState(context)
    const start = {
      x: initial.bounds!.x + DOCK_SIZE / 2,
      y: initial.bounds!.y + DOCK_SIZE / 2,
    }
    await dragNativeMouse(context, start, { x: start.x + 100, y: start.y + 60 })
    await expect
      .poll(async () => (await windowState(context)).bounds!.y)
      .toBe(initial.bounds!.y + 60)
    expect((await windowState(context)).bounds!.x).toBe(initial.bounds!.x + 100)
    await expect(button).not.toHaveClass(/dragging/)
    expect((await windowState(context)).panelVisible).toBe(false)
    const anchor = (await windowState(context)).bounds!
    await button.dblclick()
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    expect((await windowState(context)).panelBounds).toMatchObject({
      ...getExpandedPosition(initial.area!, anchor, initial.panelBounds, null),
    })
  } finally {
    await closeApp(context)
  }
})

test('real mouse dragging snaps at either edge and subsequent clicks still expand', async () => {
  const context = await launchApp()
  try {
    for (const edge of ['left', 'right'] as const) {
      await context.page.getByTestId('dock-panel').click()
      const bubble = await getBubble(context)
      const state = await windowState(context)
      const targetX =
        edge === 'left'
          ? state.area!.x + 10
          : state.area!.x + state.area!.width - DOCK_SIZE - 10
      await dragNativeMouse(
        context,
        {
          x: state.bounds!.x + DOCK_SIZE / 2,
          y: state.bounds!.y + DOCK_SIZE / 2,
        },
        { x: targetX + DOCK_SIZE / 2, y: state.area!.y + 250 }
      )
      const expectedX =
        edge === 'left'
          ? state.area!.x + 4
          : state.area!.x + state.area!.width - DOCK_SIZE - 4
      await expect
        .poll(async () => (await windowState(context)).bounds!.x)
        .toBe(expectedX)
      await expect(bubble.getByTestId('dock-bubble')).not.toHaveClass(
        /dragging/
      )
      await bubble.getByTestId('dock-bubble').dblclick()
      await expect
        .poll(async () => (await windowState(context)).panelReady)
        .toBe(true)
      const expanded = await windowState(context)
      const expectedPanelX =
        edge === 'left'
          ? state.area!.x + 4 + DOCK_SIZE + 8
          : expectedX - expanded.panelBounds.width - 8
      expect(expanded.panelBounds.x).toBe(expectedPanelX)
      await expect(context.page.getByTestId('command-input')).toHaveCount(0)
    }
  } finally {
    await closeApp(context)
  }
})

test('the window row keeps the search at the left and the buttons at the right, and the restored pin controls the panel', async () => {
  const context = await launchApp()
  try {
    const pin = context.page.getByTestId('toggle-pin')
    await expect(pin).toBeVisible()
    await expect(pin).toHaveAttribute('aria-pressed', 'false')
    await pin.click()
    expect((await windowState(context)).panelOnTop).toBe(true)
    await pin.click()
    expect((await windowState(context)).panelOnTop).toBe(false)
    await expect(context.page.getByTestId('toggle-collapse')).toHaveCount(0)
    // In Chinese the tabs go side by side from ROW_MIN_WIDTH.zh: below that "new group" and "add" sit
    // beside the search, above it they are at the right end of the category row.
    for (const width of [1100, 760, 420, 320]) {
      const row = width >= ROW_MIN_WIDTH.zh
      await context.electronApp.evaluate(
        ({ BrowserWindow }, width) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())!
            .setSize(width, 720),
        width
      )
      await expect
        .poll(() => context.page.evaluate(() => innerWidth))
        .toBe(width)
      // The row is laid out again a frame after the window has its new width: measure it then.
      await expect(context.page.locator('.titlebar')).toHaveAttribute(
        'data-search',
        row ? 'full' : width < SEARCH_ICON_BELOW_WIDTH ? 'icon' : 'label'
      )
      const where = async (testId: string) =>
        (await context.page.getByTestId(testId).boundingBox())!
      const search = await where('open-command')
      const settings = await where('open-settings')
      const ball = await where('dock-panel')
      const close = await where('close-window')
      const pinBounds = await pin.boundingBox()
      // Left to right: search, [actions], free space to drag, pin, settings, ball, close.
      expect(search.x).toBeLessThan(20)
      expect(search.x + search.width).toBeLessThanOrEqual(pinBounds!.x)
      expect(pinBounds!.x + pinBounds!.width).toBeLessThanOrEqual(settings.x)
      expect(settings.x + settings.width).toBeLessThanOrEqual(ball.x)
      expect(ball.x + ball.width).toBeLessThanOrEqual(close.x)
      expect(close.x + close.width).toBeLessThan(width)
      const beside = context.page
        .locator('.titlebar')
        .getByTestId('add-loose-item-folders')
      if (!row) {
        await expect(beside).toBeVisible()
        const add = (await beside.boundingBox())!
        expect(add.x).toBeGreaterThanOrEqual(search.x + search.width)
        // Room is left to drag the window by.
        expect(pinBounds!.x - (add.x + add.width)).toBeGreaterThan(24)
      } else {
        await expect(beside).toHaveCount(0)
        await expect(
          context.page
            .locator('.workspace-nav')
            .getByTestId('add-loose-item-folders')
        ).toBeVisible()
        expect(pinBounds!.x - (search.x + search.width)).toBeGreaterThan(24)
      }
    }
    await context.page.getByTestId('open-settings').click()
    await context.page.getByTestId('settings-tab-behavior').click()
    await context.page.getByTestId('pin-panel').click()
    expect((await windowState(context)).panelOnTop).toBe(true)
  } finally {
    await closeApp(context)
  }
})

/** Saves the "show the floating ball" preference the way the settings form does. */
async function saveBubblePreference(
  context: AppContext,
  show: boolean
): Promise<void> {
  const saved = await context.page.evaluate(async (show) => {
    const loaded = await window.quickLaunch.loadData()
    if (!loaded.ok) return false
    loaded.data.prefs.showBubble = show
    return (await window.quickLaunch.saveData(loaded.data)).ok
  }, show)
  expect(saved).toBe(true)
}

async function snapshotOf(context: AppContext) {
  const snapshot = await context.page.evaluate(() =>
    window.quickLaunch.window.getState()
  )
  expect(snapshot.ok).toBe(true)
  return snapshot.ok ? snapshot.data : undefined
}

test('the close button hides only the panel to the tray, the ball stays, and recall leaves search closed', async () => {
  const context = await launchApp()
  try {
    await getBubble(context, false)
    await context.page.getByTestId('close-window').click()
    await expect
      .poll(async () => (await windowState(context)).panelVisible)
      .toBe(false)
    await expect
      .poll(async () => (await windowState(context)).bubbleVisible)
      .toBe(true)
    expect((await snapshotOf(context))?.collapsed).toBe(true)
    await context.electronApp.evaluate(({ app }) => app.emit('second-instance'))
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    expect((await windowState(context)).bubbleVisible).toBe(true)
    await expect(context.page.getByTestId('command-input')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('with the ball turned off, collapse and close both go to the tray and the panel can still be recalled', async () => {
  const context = await launchApp()
  try {
    await saveBubblePreference(context, false)
    await getBubble(context, false)
    // Collapse (logo, Esc and the shortcut take this path) must not wait on itself.
    await context.page.getByTestId('dock-panel').click()
    await expect
      .poll(async () => (await windowState(context)).panelVisible)
      .toBe(false)
    expect((await windowState(context)).bubbleVisible).toBe(false)
    expect((await snapshotOf(context))?.collapsed).toBe(false)
    await context.electronApp.evaluate(({ app }) => app.emit('second-instance'))
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    expect((await windowState(context)).bubbleVisible).toBe(false)
    await context.page.getByTestId('close-window').click()
    await expect
      .poll(async () => (await windowState(context)).panelVisible)
      .toBe(false)
    expect((await windowState(context)).bubbleVisible).toBe(false)
    await context.electronApp.evaluate(({ app }) => app.emit('second-instance'))
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    expect((await windowState(context)).bubbleVisible).toBe(false)
  } finally {
    await closeApp(context)
  }
})

test('the settings switch turns the ball off and on without a restart', async () => {
  const context = await launchApp()
  try {
    await context.page.getByTestId('dock-panel').click()
    const bubble = await getBubble(context)
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    expect((await windowState(context)).bubbleVisible).toBe(true)

    await context.page.getByTestId('open-settings').click()
    await context.page.getByTestId('settings-tab-behavior').click()
    const toggle = context.page.getByTestId('show-bubble')
    await expect(toggle).toBeChecked()
    await toggle.uncheck()
    await context.page.getByTestId('settings-save').click()
    // Saving applies at once: the ball beside the open panel goes, the panel stays.
    await expect
      .poll(async () => (await windowState(context)).bubbleVisible)
      .toBe(false)
    expect((await windowState(context)).panelVisible).toBe(true)

    await context.page.getByTestId('dock-panel').click()
    await expect
      .poll(async () => (await windowState(context)).panelVisible)
      .toBe(false)
    expect((await windowState(context)).bubbleVisible).toBe(false)

    await context.electronApp.evaluate(({ app }) => app.emit('second-instance'))
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    await context.page.getByTestId('open-settings').click()
    await context.page.getByTestId('settings-tab-behavior').click()
    await expect(toggle).not.toBeChecked()
    await toggle.check()
    await context.page.getByTestId('settings-save').click()
    await context.page.getByTestId('dock-panel').click()
    await expect
      .poll(async () => (await windowState(context)).bubbleVisible)
      .toBe(true)
    await expect
      .poll(async () => (await windowState(context)).panelVisible)
      .toBe(false)
  } finally {
    await closeApp(context)
  }
})

test('turning the ball off while it is the only thing on screen brings the panel back', async () => {
  const context = await launchApp()
  try {
    await context.page.getByTestId('dock-panel').click()
    await getBubble(context)

    await saveBubblePreference(context, false)

    await expect
      .poll(async () => (await windowState(context)).panelVisible)
      .toBe(true)
    await expect
      .poll(async () => (await windowState(context)).bubbleVisible)
      .toBe(false)
    expect((await snapshotOf(context))?.collapsed).toBe(false)
  } finally {
    await closeApp(context)
  }
})

test('dismiss after launch collapses to the ball, or goes to the tray when the ball is off', async () => {
  const context = await launchApp()
  try {
    await context.page.evaluate(() =>
      window.quickLaunch.window.dismissAfterLaunch()
    )
    await expect
      .poll(async () => (await windowState(context)).bubbleVisible)
      .toBe(true)
    expect((await windowState(context)).panelVisible).toBe(false)

    await context.electronApp.evaluate(({ app }) => app.emit('second-instance'))
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    await saveBubblePreference(context, false)
    await context.page.evaluate(() =>
      window.quickLaunch.window.dismissAfterLaunch()
    )
    await expect
      .poll(async () => (await windowState(context)).panelVisible)
      .toBe(false)
    expect((await windowState(context)).bubbleVisible).toBe(false)
  } finally {
    await closeApp(context)
  }
})

test('the title bar has exactly two exits: collapse to the ball and close to the tray', async () => {
  const context = await launchApp()
  try {
    await expect(context.page.getByTestId('minimize-window')).toHaveCount(0)
    await expect(context.page.getByTestId('close-window')).toBeVisible()
    // One collapse button, in the shape of the ball: not a logo and a second button for the same thing.
    await expect(context.page.getByTestId('dock-panel')).toHaveCount(1)
    await expect(context.page.getByTestId('dock-panel-button')).toHaveCount(0)
    await context.page.getByTestId('dock-panel').click()
    await getBubble(context)
    expect((await snapshotOf(context))?.collapsed).toBe(true)
  } finally {
    await closeApp(context)
  }
})

test('a collapsed ball is restored after a restart at the same place with the panel hidden', async () => {
  const first = await launchApp()
  const userDataDir = first.userDataDir
  let saved: { x: number; y: number }
  try {
    await first.page.evaluate(async () => {
      const loaded = await window.quickLaunch.loadData()
      if (!loaded.ok) throw new Error(loaded.error)
      loaded.data.prefs.theme = 'light'
      loaded.data.prefs.lang = 'en'
      await window.quickLaunch.saveData(loaded.data)
    })
    await first.page.getByTestId('dock-panel').click()
    const bubble = await getBubble(first)
    const state = await windowState(first)
    await dragBubbleTo(first, bubble, {
      x: state.area!.x + 300,
      y: state.area!.y + 250,
    })
    saved = (await windowState(first)).bounds!
  } finally {
    await closeApp(first, { cleanup: false })
  }
  const second = await launchApp(userDataDir)
  try {
    const bubble = await getBubble(second)
    const restored = await windowState(second)
    expect(restored.panelVisible).toBe(false)
    expect(distance(restored.bounds!, saved!)).toBeLessThanOrEqual(
      POSITION_TOLERANCE
    )
    expect((await snapshotOf(second))?.collapsed).toBe(true)
    // The ball is drawn in the saved theme and language from its first frame.
    await expect(bubble.locator('.dock-root')).toHaveClass(/theme-light/)
    await expect(bubble.getByTestId('dock-bubble')).toHaveAttribute(
      'aria-label',
      'Open Marubako'
    )
    // It opens the panel like any ball, without the two-second handshake timeouts a panel that was
    // never shown could cause.
    await bubble.getByTestId('dock-bubble').click()
    await expect
      .poll(async () => (await windowState(second)).panelReady)
      .toBe(true)
    const log = await fs.readFile(
      path.join(second.userDataDir, 'logs', 'main.log'),
      'utf8'
    )
    expect(log).not.toContain('Timed out preparing window frame')
  } finally {
    await closeApp(second)
  }
})

test('an auto-start with --hidden brings the ball up and keeps the panel hidden', async () => {
  const context = await launchApp(undefined, ['--hidden'])
  try {
    const bubble = await getBubble(context)
    expect((await windowState(context)).panelVisible).toBe(false)
    expect((await snapshotOf(context))?.collapsed).toBe(true)
    // The first appearance of a panel that was never shown is not animated, so it cannot hang on
    // frames its renderer would not paint.
    await bubble.getByTestId('dock-bubble').click()
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    const log = await fs.readFile(
      path.join(context.userDataDir, 'logs', 'main.log'),
      'utf8'
    )
    expect(log).not.toContain('Timed out preparing window frame')
  } finally {
    await closeApp(context)
  }
})

test('an auto-start with --hidden shows nothing when the ball is turned off', async () => {
  const first = await launchApp()
  const userDataDir = first.userDataDir
  try {
    await saveBubblePreference(first, false)
  } finally {
    await closeApp(first, { cleanup: false })
  }
  const second = await launchApp(userDataDir, ['--hidden'])
  try {
    // Give a ball that wrongly appears time to do so once its window is ready.
    await expect.poll(() => second.electronApp.windows().length).toBe(2)
    await second.page.waitForTimeout(1000)
    const state = await windowState(second)
    expect(state.panelVisible).toBe(false)
    expect(state.bubbleVisible).toBe(false)
    // The tray (or the shortcut) still brings the panel back, and without a ball.
    await second.electronApp.evaluate(({ app }) => app.emit('second-instance'))
    await expect
      .poll(async () => (await windowState(second)).panelReady)
      .toBe(true)
    expect((await windowState(second)).bubbleVisible).toBe(false)
  } finally {
    await closeApp(second)
  }
})

test('minimizing the panel from outside the app keeps the ball and restoring it syncs the state', async () => {
  const context = await launchApp()
  try {
    await context.page.getByTestId('dock-panel').click()
    const bubble = await getBubble(context)
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)

    // Win+D reaches the window as a native minimize, not through the title bar.
    await context.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())!
        .minimize()
    )
    await expect
      .poll(async () => (await snapshotOf(context))?.collapsed)
      .toBe(true)
    expect((await windowState(context)).bubbleVisible).toBe(true)

    await context.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())!
        .restore()
    )
    await expect
      .poll(async () => (await snapshotOf(context))?.collapsed)
      .toBe(false)
    expect((await windowState(context)).panelVisible).toBe(true)
    expect((await windowState(context)).bubbleVisible).toBe(true)
  } finally {
    await closeApp(context)
  }
})

test('a click on the ball brings a kept-open panel that is behind other windows forward as a temporary panel', async () => {
  const context = await launchApp()
  try {
    await context.page.getByTestId('dock-panel').click()
    const bubble = await getBubble(context)
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    const panelFocused = () =>
      context.electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.isResizable())!
          .isFocused()
      )
    // The panel takes the focus at the very end of its expansion.
    await expect.poll(panelFocused).toBe(true)
    // Another application has the foreground and the panel stays visible behind it. A window
    // cannot reliably hand its focus away on its own, so the ball takes it, and after a pause the
    // ball's focus event fires again, as it does when the user presses it from another application.
    await context.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => !window.isResizable())!
        .focus()
    )
    await expect.poll(panelFocused).toBe(false)
    await context.page.waitForTimeout(500)
    await context.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => !window.isResizable())!
        .emit('focus')
    )
    // The pointer rests on the ball it presses.
    await holdPointerOnBall(context)
    await bubble.getByTestId('dock-bubble').click()
    // Brought to the front, not collapsed: it holds the focus again.
    await expect.poll(panelFocused).toBe(true)
    // Wait out the delayed collapse of a single click on an open panel.
    await context.page.waitForTimeout(900)
    expect((await windowState(context)).panelVisible).toBe(true)
    expect(await snapshotOf(context)).toMatchObject({
      collapsed: false,
      mode: 'peek',
    })
    // It was called with a single click, so it is a temporary panel now: it folds away once the
    // pointer has left it, instead of staying like the window it was.
    const area = (await windowState(context)).area!
    await context.electronApp.evaluate(
      ({ screen }, point) => {
        screen.getCursorScreenPoint = () => point
      },
      { x: area.x + 10, y: area.y + 10 }
    )
    await expect
      .poll(async () => (await windowState(context)).panelVisible)
      .toBe(false)
    expect((await snapshotOf(context))?.collapsed).toBe(true)
    expect((await windowState(context)).bubbleVisible).toBe(true)
  } finally {
    await closeApp(context)
  }
})

test('a click on the ball still collapses the panel that was in front', async () => {
  const context = await launchApp()
  try {
    await context.page.getByTestId('dock-panel').click()
    const bubble = await getBubble(context)
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    await context.electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows()
      windows.find((window) => window.isResizable())!.focus()
      // Pressing the ball takes the focus from the panel in one step.
      windows.find((window) => !window.isResizable())!.focus()
    })
    await bubble.getByTestId('dock-bubble').click()
    await expect
      .poll(async () => (await windowState(context)).panelVisible)
      .toBe(false)
    expect((await snapshotOf(context))?.collapsed).toBe(true)
  } finally {
    await closeApp(context)
  }
})

test('a bubble stays at a free position through clicks, edits and restart', async () => {
  const first = await launchApp()
  const userDataDir = first.userDataDir
  let savedPosition: { x: number; y: number }
  try {
    await first.page.getByTestId('dock-panel').click()
    const bubble = await getBubble(first)
    const state = await windowState(first)
    savedPosition = { x: state.area!.x + 300, y: state.area!.y + 250 }
    await bubble.evaluate(
      async ({ bounds, target, half }) => {
        const api = window.quickLaunch.window
        const start = { x: bounds.x + half, y: bounds.y + half }
        const end = { x: target.x + half, y: target.y + half }
        await api.dragDock({ phase: 'start', ...start })
        await api.dragDock({ phase: 'move', ...end })
        await api.dragDock({ phase: 'end', ...end })
        // A click has no movement and must not trigger snapping.
        await api.dragDock({ phase: 'start', ...end })
        await api.dragDock({ phase: 'end', ...end })
      },
      { bounds: state.bounds!, target: savedPosition, half: DOCK_SIZE / 2 }
    )
    expect((await windowState(first)).bounds).toMatchObject(savedPosition)
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect
      .poll(async () => (await windowState(first)).panelReady)
      .toBe(true)
    await first.page.getByTestId('add-loose-item-folders').click()
    await first.page.getByTestId('item-name-input').fill('自由悬浮')
    await first.page.getByTestId('item-path-input').fill('C:\\Windows')
    await first.page.getByTestId('item-save').click()
    await first.page.getByTestId('dock-panel').click()
    await expect
      .poll(async () => (await windowState(first)).bubbleVisible)
      .toBe(true)
    expect((await windowState(first)).bounds).toMatchObject(savedPosition)
  } finally {
    await closeApp(first, { cleanup: false })
  }
  const second = await launchApp(userDataDir)
  try {
    // The ball was the last state, so it is restored without collapsing anything first.
    await getBubble(second)
    expect((await windowState(second)).bounds).toMatchObject(savedPosition!)
  } finally {
    await closeApp(second)
  }
})

/** Drags the collapsed bubble to a screen position through the real drag IPC. */
async function dragBubbleTo(
  context: AppContext,
  bubble: Page,
  target: { x: number; y: number }
) {
  const bounds = (await windowState(context)).bounds!
  const results = await bubble.evaluate(
    async ({ bounds, target, half }) => {
      const api = window.quickLaunch.window
      const start = { x: bounds.x + half, y: bounds.y + half }
      const end = { x: target.x + half, y: target.y + half }
      return [
        await api.dragDock({ phase: 'start', ...start }),
        await api.dragDock({ phase: 'move', ...end }),
        await api.dragDock({ phase: 'end', ...end }),
      ]
    },
    { bounds, target, half: DOCK_SIZE / 2 }
  )
  expect(results.every((result) => result.ok)).toBe(true)
}

// DIP rounding on scaled displays can shift a native window by a pixel or two, while the bugs
// these tests guard against move the ball by hundreds of pixels.
const POSITION_TOLERANCE = 2

function distance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

/** Resizes the panel the way a drag on its left edge does: x and width change, only 'resized' fires. */
async function resizePanelFromLeftEdge(context: AppContext, grow: number) {
  await context.electronApp.evaluate(({ BrowserWindow }, grow) => {
    const panel = BrowserWindow.getAllWindows().find((window) =>
      window.isResizable()
    )!
    const bounds = panel.getBounds()
    panel.setBounds({
      x: bounds.x - grow,
      y: bounds.y,
      width: bounds.width + grow,
      height: bounds.height,
    })
    panel.emit('resized')
  }, grow)
}

test('resizing the panel from its left edge does not move the ball when the panel collapses', async () => {
  const context = await launchApp()
  try {
    await context.page.getByTestId('dock-panel').click()
    const bubble = await getBubble(context)
    const state = await windowState(context)
    // Dock the ball to the right edge: the panel then expands to its left.
    const rightEdge = {
      x: state.area!.x + state.area!.width - DOCK_SIZE - 4,
      y: state.area!.y + 250,
    }
    await dragBubbleTo(context, bubble, {
      x: rightEdge.x - 6,
      y: rightEdge.y,
    })
    const docked = (await windowState(context)).bounds!
    expect(distance(docked, rightEdge)).toBeLessThanOrEqual(POSITION_TOLERANCE)
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    const expanded = await windowState(context)
    expect(expanded.panelBounds.x).toBeGreaterThan(state.area!.x + 120)
    expect(distance(expanded.bounds!, docked)).toBeLessThanOrEqual(
      POSITION_TOLERANCE
    )

    await resizePanelFromLeftEdge(context, 120)
    const resized = (await windowState(context)).panelBounds
    expect(resized.x).toBe(expanded.panelBounds.x - 120)
    expect(resized.width).toBe(expanded.panelBounds.width + 120)

    await context.page.getByTestId('dock-panel').click()
    await expect
      .poll(async () => {
        const after = await windowState(context)
        return after.bubbleVisible && !after.panelVisible
      })
      .toBe(true)
    // The ball keeps its position and its edge docking; it never jumps to the panel's corner.
    const collapsed = (await windowState(context)).bounds!
    expect(distance(collapsed, docked)).toBeLessThanOrEqual(POSITION_TOLERANCE)
    const saved = await context.page.evaluate(() =>
      window.quickLaunch.loadData()
    )
    expect(saved.ok && saved.data.window.dockEdge).toBe('right')
    expect(
      saved.ok && distance(saved.data.window.dockPosition!, docked)
    ).toBeLessThanOrEqual(POSITION_TOLERANCE)
  } finally {
    await closeApp(context)
  }
})

test('dragging the panel after a left-edge resize moves the ball by the drag distance only', async () => {
  const context = await launchApp()
  try {
    await context.page.getByTestId('dock-panel').click()
    const bubble = await getBubble(context)
    const state = await windowState(context)
    await dragBubbleTo(context, bubble, {
      x: state.area!.x + 300,
      y: state.area!.y + 250,
    })
    const docked = (await windowState(context)).bounds!
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)

    await resizePanelFromLeftEdge(context, 100)
    const resized = (await windowState(context)).panelBounds
    // A title-bar drag of the panel, as Windows reports it: will-move, a new position, moved.
    await context.electronApp.evaluate(
      ({ BrowserWindow }, { x, y }) => {
        const panel = BrowserWindow.getAllWindows().find((window) =>
          window.isResizable()
        )!
        panel.emit('will-move', { preventDefault() {} }, panel.getBounds())
        panel.setPosition(x + 40, y + 20)
        panel.emit('moved')
      },
      { x: resized.x, y: resized.y }
    )
    await expect
      .poll(async () =>
        distance((await windowState(context)).bounds!, {
          x: docked.x + 40,
          y: docked.y + 20,
        })
      )
      .toBeLessThanOrEqual(POSITION_TOLERANCE)
  } finally {
    await closeApp(context)
  }
})

test('rounded corners have anti-aliased alpha and repeated switching keeps windows prepared', async () => {
  const context = await launchApp()
  try {
    const pixels = await context.electronApp.evaluate(
      async ({ BrowserWindow }) => {
        const panel = BrowserWindow.getAllWindows().find((window) =>
          window.isResizable()
        )!
        const image = await panel.capturePage()
        const { width, height } = image.getSize()
        const bitmap = image.toBitmap()
        const fractional = [0, 0, 0, 0]
        for (let y = 0; y < 28; y++) {
          for (let x = 0; x < 28; x++) {
            const points = [
              [x, y],
              [width - 1 - x, y],
              [x, height - 1 - y],
              [width - 1 - x, height - 1 - y],
            ]
            points.forEach(([px, py], corner) => {
              const alpha = bitmap[(py * width + px) * 4 + 3]
              if (alpha > 0 && alpha < 255) fractional[corner]++
            })
          }
        }
        return { cornerAlpha: bitmap[3], fractional }
      }
    )
    expect(pixels.cornerAlpha).toBe(0)
    expect(pixels.fractional.every((count) => count > 15)).toBe(true)
    const bubble = await getBubble(context, false)
    for (let i = 0; i < 4; i++) {
      await context.page.getByTestId('dock-panel').click()
      await expect
        .poll(async () => (await windowState(context)).bubbleVisible)
        .toBe(true)
      await bubble.getByTestId('dock-bubble').dblclick()
      await expect
        .poll(async () => (await windowState(context)).panelReady)
        .toBe(true)
      expect((await windowState(context)).bubbleVisible).toBe(true)
      await expect(context.page.getByTestId('dock-panel')).toHaveCSS(
        'outline-style',
        'none'
      )
    }
    const log = await fs.readFile(
      path.join(context.userDataDir, 'logs', 'main.log'),
      'utf8'
    )
    expect(log).not.toContain('Timed out preparing window frame')
    await context.page.screenshot({
      path: 'artifacts/window-corners.png',
      omitBackground: true,
    })
  } finally {
    await closeApp(context)
  }
})

test('each mode keeps its outgoing window visible until the incoming frame is ready', async () => {
  const context = await launchApp()
  try {
    const bubble = await getBubble(context, false)
    for (const expanding of [false, true]) {
      await context.electronApp.evaluate(({ ipcMain }, channel) => {
        const listeners = ipcMain.listeners(channel)
        ipcMain.removeAllListeners(channel)
        ipcMain.once(channel, (...args) => {
          listeners.forEach((listener) => ipcMain.on(channel, listener))
          const state = globalThis as typeof globalThis & {
            releaseWindowFrame?: () => void
          }
          state.releaseWindowFrame = () => {
            listeners.forEach((listener) => listener.apply(ipcMain, args))
            delete state.releaseWindowFrame
          }
        })
      }, IPC_CHANNELS.windowFrameReady)
      await (expanding ? bubble : context.page)
        .getByTestId(expanding ? 'dock-bubble' : 'dock-panel')
        .click()
      await expect
        .poll(() =>
          context.electronApp.evaluate(
            () =>
              !!(
                globalThis as typeof globalThis & {
                  releaseWindowFrame?: () => void
                }
              ).releaseWindowFrame
          )
        )
        .toBe(true)
      const before = await windowState(context)
      expect(before.panelVisible).toBe(!expanding)
      expect(before.bubbleVisible).toBe(expanding)
      await context.electronApp.evaluate(() =>
        (
          globalThis as typeof globalThis & { releaseWindowFrame?: () => void }
        ).releaseWindowFrame?.()
      )
      await expect
        .poll(async () => {
          const after = await windowState(context)
          return (
            after.panelVisible === expanding && after.bubbleVisible === true
          )
        })
        .toBe(true)
    }
  } finally {
    await closeApp(context)
  }
})

type PanelFrame = {
  at: number
  phase: string
  transform: string
  opacity: number
  clipPath: string
  pointerEvents: string
  focused: boolean
}

type BallFrame = {
  at: number
  /** The direction of the most recent presentation; it outlives the handshake because the spring does. */
  direction: string
  scale: number
  radius: string
  dotOpacity: number
  morph: string
  pressed: boolean
  bodyOpacity: number
}

/** Samples the panel body on every frame while a presentation is animating. */
async function recordPanelFrames(page: Page) {
  await page.evaluate(() => {
    const root = document.getElementById('root')!
    const frames: PanelFrame[] = []
    Object.assign(window, { panelFrames: frames })
    const sample = () => {
      const phase = root.dataset.presentation ?? ''
      if (phase.endsWith('animating')) {
        const style = getComputedStyle(document.body)
        frames.push({
          at: Date.now(),
          phase,
          transform: style.transform,
          opacity: Number(style.opacity),
          clipPath: style.clipPath,
          pointerEvents: style.pointerEvents,
          focused: document.hasFocus(),
        })
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
}

function readPanelFrames(page: Page): Promise<PanelFrame[]> {
  return page.evaluate(
    () => (window as unknown as { panelFrames: PanelFrame[] }).panelFrames
  )
}

/** Samples the ball on every frame, also after the handshake, while its spring is still playing. */
async function recordBallFrames(bubble: Page) {
  await bubble.evaluate(() => {
    const root = document.getElementById('root')!
    const surface = document.querySelector<HTMLElement>('.dock-bubble-surface')!
    const button = surface.parentElement!
    const frames: BallFrame[] = []
    let direction = ''
    Object.assign(window, { ballFrames: frames })
    const sample = () => {
      const phase = root.dataset.presentation ?? ''
      if (phase) direction = phase.split('-')[0] ?? ''
      const style = getComputedStyle(surface)
      const dot = surface.querySelector('.dock-bubble-dot')
      frames.push({
        at: Date.now(),
        direction,
        scale: new DOMMatrixReadOnly(style.transform).a,
        radius: `${style.borderTopLeftRadius} ${style.borderBottomLeftRadius}`,
        dotOpacity: dot ? Number(getComputedStyle(dot).opacity) : -1,
        morph: surface.dataset.morph ?? '',
        pressed: button.hasAttribute('data-pressed'),
        bodyOpacity: Number(getComputedStyle(document.body).opacity),
      })
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
}

function readBallFrames(bubble: Page): Promise<BallFrame[]> {
  return bubble.evaluate(
    () => (window as unknown as { ballFrames: BallFrame[] }).ballFrames
  )
}

/** The inline styles the presentation animations write; none may outlive them. */
function leftoverBodyStyles(page: Page): Promise<string> {
  return page.evaluate(() => {
    const { style } = document.body
    return [
      style.transform,
      style.opacity,
      style.transformOrigin,
      style.willChange,
      style.pointerEvents,
      style.clipPath,
    ].join('|')
  })
}

/** The state of `leftoverBodyStyles` when nothing is left behind. */
const NO_LEFTOVER_STYLES = '|||||'

/** Both windows have finished their handshake and every inline style the animations left is gone. */
async function expectPresentationSettled(context: AppContext, bubble: Page) {
  await expect
    .poll(
      async () => ({
        panel: await context.page.evaluate(
          () => document.getElementById('root')!.dataset.presentation ?? ''
        ),
        bubble: await bubble.evaluate(
          () => document.getElementById('root')!.dataset.presentation ?? ''
        ),
      }),
      { timeout: 20000 }
    )
    .toEqual({ panel: '', bubble: '' })
}

/** Splits time-ordered frames into separate presentations: a long pause starts a new run. */
function runsOf<T extends { at: number }>(frames: T[], gap = 400): T[][] {
  const runs: T[][] = []
  for (const frame of frames) {
    const run = runs.at(-1)
    if (run && frame.at - run.at(-1)!.at < gap) run.push(frame)
    else runs.push([frame])
  }
  return runs
}

/** The ball's page before it has ever been shown: it exists, and may still be loading. */
async function getHiddenBubble(context: AppContext): Promise<Page> {
  await expect.poll(() => context.electronApp.windows().length).toBe(2)
  const bubble = context.electronApp
    .windows()
    .find((page) => page !== context.page)!
  await bubble
    .locator('.dock-bubble-surface')
    .waitFor({ state: 'attached', timeout: 20000 })
  return bubble
}

/** Keeps the temporary panel open: the pointer counts as resting on the ball. */
async function holdPointerOnBall(context: AppContext) {
  const bounds = (await windowState(context)).bounds!
  await context.electronApp.evaluate(
    ({ screen }, point) => {
      screen.getCursorScreenPoint = () => point
    },
    { x: bounds.x + DOCK_SIZE / 2, y: bounds.y + DOCK_SIZE / 2 }
  )
}

test('mode changes animate through intermediate frames without resizing the native panel', async () => {
  const context = await launchApp()
  try {
    const original = (await windowState(context)).panelBounds
    const bubble = await getHiddenBubble(context)
    await recordPanelFrames(context.page)
    await recordBallFrames(bubble)
    await context.page.evaluate(() => window.quickLaunch.window.collapse())
    expect((await windowState(context)).panelBounds).toEqual(original)
    await getBubble(context)
    const anchor = (await windowState(context)).bounds
    const button = bubble.getByTestId('dock-bubble')
    const surface = bubble.locator('.dock-bubble-surface')
    const hitArea = await button.boundingBox()
    // The first collapse starts from a hidden ball; let its spring settle first.
    await expect(surface).toHaveAttribute('data-morph', 'ball')
    await expect.poll(() => leftoverBodyStyles(bubble)).toBe(NO_LEFTOVER_STYLES)
    await bubble.evaluate(() => window.quickLaunch.window.expand())
    // The ball becomes an icon-free dot once its spring has settled, which takes longer
    // than the panel needs to become usable.
    await expect(surface).toHaveAttribute('data-morph', 'dot')
    await expect(surface.locator('.dock-bubble-dot')).toHaveCSS('opacity', '0')
    await expect(surface).toHaveCSS('border-top-left-radius', '50%')
    await expect(surface).toHaveCSS('border-bottom-left-radius', '50%')
    expect(await button.boundingBox()).toEqual(hitArea)
    await expect(button).toHaveAttribute('aria-label', '收起 Marubako')
    // The panel was opened to stay (a double click), so the hint offers no second click.
    await expect(button).toHaveAttribute('title', '单击收起 · 拖动移动')
    // The panel's tail has ended too, and left nothing behind on the body.
    await expect
      .poll(() => leftoverBodyStyles(context.page))
      .toBe(NO_LEFTOVER_STYLES)
    await expect(context.page.locator('body')).toHaveCSS('transform', 'none')
    await expect(context.page.locator('body')).toHaveCSS('opacity', '1')
    await expectPresentationSettled(context, bubble)
    // The dot remains a working switch, with the same native anchor and full hit area.
    await button.click()
    await expect(surface).toHaveAttribute('data-morph', 'ball')
    await expect(surface.locator('.dock-bubble-dot')).toHaveCSS('opacity', '1')
    await expect(surface).toHaveCSS('border-top-left-radius', '28%')
    await expect(surface).toHaveCSS('border-bottom-left-radius', '50%')
    await expect(button).toHaveAttribute('aria-label', '打开 Marubako')
    expect((await windowState(context)).bounds).toEqual(anchor)
    expect(await button.boundingBox()).toEqual(hitArea)
    await expectPresentationSettled(context, bubble)
    // Leave a few frames after the last switch, so a jump back would be sampled.
    await bubble.waitForTimeout(250)

    const ball = await readBallFrames(bubble)
    const expandBall = ball.filter((frame) => frame.direction === 'expand')
    const collapseBall = ball.filter((frame) => frame.direction === 'collapse')
    // The ball is a drawn shape in a small window: it may spring, but never past the glass.
    expect(Math.max(...ball.map((frame) => frame.scale))).toBeLessThanOrEqual(
      1.08
    )
    // Only a ball that was hidden fades in as a whole; a visible one never dims.
    expect(
      ball
        .filter((frame) => frame.at >= expandBall[0]!.at)
        .every((frame) => frame.bodyOpacity === 1)
    ).toBe(true)
    expect(expandBall.some((frame) => frame.scale < 0.5)).toBe(true)
    expect(collapseBall.some((frame) => frame.scale > 1.03)).toBe(true)
    // Settling into the stylesheet's values must not pop through the press transition.
    const restingDot = expandBall.filter(
      (frame) => frame.morph === 'dot' && !frame.pressed
    )
    expect(restingDot.length).toBeGreaterThan(3)
    expect(
      restingDot.every((frame) => Math.abs(frame.scale - 0.52) < 0.02)
    ).toBe(true)
    const restingBall = collapseBall.filter(
      (frame) => frame.morph === 'ball' && !frame.pressed
    )
    expect(restingBall.length).toBeGreaterThan(3)
    expect(restingBall.every((frame) => Math.abs(frame.scale - 1) < 0.02)).toBe(
      true
    )

    const panel = await readPanelFrames(context.page)
    for (const direction of ['expand', 'collapse']) {
      const frames = panel.filter((frame) => frame.phase.startsWith(direction))
      expect(frames.length).toBeGreaterThan(3)
      // A spring on the compositor: the body scales through many values, never a clip.
      expect(
        new Set(frames.map((frame) => frame.transform)).size
      ).toBeGreaterThan(3)
      expect(frames.every((frame) => frame.clipPath === 'none')).toBe(true)
    }
    const expandPanel = panel.filter((frame) =>
      frame.phase.startsWith('expand')
    )
    expect(expandPanel.some((frame) => frame.opacity < 0.8)).toBe(true)
    expect(expandPanel.every((frame) => frame.pointerEvents !== 'none')).toBe(
      true
    )
    const collapsePanel = panel.filter((frame) =>
      frame.phase.startsWith('collapse')
    )
    expect(collapsePanel.every((frame) => frame.pointerEvents === 'none')).toBe(
      true
    )
    // The ball only rebounds once the panel has all but gone, to catch it, both for the ball
    // that appears out of nowhere and for the one that was already there. The panel's last
    // sampled frame is the one just before it is hidden.
    const ballRuns = runsOf(collapseBall)
    const panelRuns = runsOf(collapsePanel)
    expect(ballRuns).toHaveLength(2)
    expect(panelRuns).toHaveLength(2)
    for (const [index, panelRun] of panelRuns.entries()) {
      const ballRun = ballRuns[index]!
      const lastPanelFrame = panelRun.at(-1)!
      expect(lastPanelFrame.opacity).toBeLessThan(0.5)
      const rebound = ballRun.find((frame) => frame.scale > 1.005)
      expect(rebound, 'the ball swells past its size').toBeDefined()
      expect(rebound!.at).toBeGreaterThanOrEqual(lastPanelFrame.at)
      expect(Math.max(...ballRun.map((frame) => frame.scale))).toBeGreaterThan(
        1.03
      )
    }
    // A ball that was hidden comes in as the dot the open panel stood for, then blooms.
    expect(Math.min(...ballRuns[0]!.map((frame) => frame.scale))).toBeLessThan(
      0.55
    )

    await expect(context.page.locator('#root')).toHaveCSS('transform', 'none')
    await expect(context.page.locator('#root')).toHaveCSS('opacity', '1')
    expect((await windowState(context)).panelSize).toEqual([
      original.width,
      original.height,
    ])
  } finally {
    await closeApp(context)
  }
})

test('the ball is drawn in the shape of the app icon', async () => {
  const context = await launchApp()
  try {
    await context.page.evaluate(() => window.quickLaunch.window.collapse())
    const bubble = await getBubble(context)
    const button = bubble.getByTestId('dock-bubble')
    const surface = bubble.locator('.dock-bubble-surface')
    await expect(surface).toHaveAttribute('data-morph', 'ball')
    await expect(bubble.locator('img')).toHaveCount(0)
    await expect(surface.locator('.dock-bubble-dot')).toHaveCount(1)
    await bubble.mouse.move(0, 0)

    const look = () =>
      surface.evaluate((node) => {
        const style = getComputedStyle(node)
        const dot = node.querySelector('.dock-bubble-dot')!
        const box = node.getBoundingClientRect()
        const mark = dot.getBoundingClientRect()
        return {
          radii: [
            style.borderTopLeftRadius,
            style.borderTopRightRadius,
            style.borderBottomRightRadius,
            style.borderBottomLeftRadius,
          ],
          image: style.backgroundImage,
          shadow: style.boxShadow,
          opacity: style.opacity,
          // The real cursor may rest on the ball; the test cannot move it away.
          hovered: node.parentElement!.matches(':hover'),
          filter: style.filter,
          size: [box.width, box.height],
          dot: {
            size: [mark.width, mark.height],
            x: (mark.left + mark.width / 2 - box.left) / box.width,
            y: (mark.top + mark.height / 2 - box.top) / box.height,
            color: getComputedStyle(dot).backgroundColor,
          },
        }
      })
    const resting = await look()
    expect(resting.size).toEqual([DOCK_BALL_SIZE, DOCK_BALL_SIZE])
    // Three 28% corners and one 50% corner at the bottom left, as in the icon.
    expect(resting.radii).toEqual(['28%', '28%', '28%', '50%'])
    expect(resting.image).toContain('linear-gradient(135deg')
    expect(resting.image).toContain('rgb(154, 133, 255)')
    expect(resting.image).toContain('rgb(85, 68, 218)')
    // A thin ring, nothing that the small window would cut off when the ball swells.
    expect(resting.shadow).toBe(
      'rgba(255, 255, 255, 0.22) 0px 0px 0px 1px inset, rgba(10, 12, 20, 0.18) 0px 0px 0px 1px'
    )
    expect(resting.opacity).toBe(resting.hovered ? '1' : '0.92')
    expect(resting.dot.size).toEqual([8, 8])
    expect(resting.dot.x).toBeCloseTo(0.406, 2)
    expect(resting.dot.y).toBeCloseTo(0.594, 2)
    expect(resting.dot.color).toBe('rgb(255, 255, 255)')

    await button.hover()
    await expect.poll(async () => (await look()).opacity).toBe('1')
    expect((await look()).filter).toMatch(/^brightness\(1\.\d+\)$/)

    await bubble.mouse.move(0, 0)
    // Keyboard focus gets full opacity and a white ring with a dark one next to it.
    await context.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => !window.isResizable())!
        .focus()
    )
    await bubble.keyboard.press('Tab')
    await expect(button).toBeFocused()
    await expect.poll(async () => (await look()).opacity).toBe('1')
    const focused = (await look()).shadow
    expect(focused).toContain('rgb(255, 255, 255) 0px 0px 0px 2px inset')
    expect(focused).toMatch(
      /rgba\(10, 12, 20, [\d.]+\) 0px 0px 0px \d+px inset/
    )
    // The global `button:focus-visible` accent outline must not be drawn on top of that: it would
    // sit half outside the small window of the ball and be cut off.
    expect(
      await button.evaluate((element) => getComputedStyle(element).outlineStyle)
    ).toBe('none')
  } finally {
    await closeApp(context)
  }
})

test('pressing the ball shrinks it within a frame or two and the press clears once the panel opens', async () => {
  const context = await launchApp()
  try {
    await context.page.evaluate(() => window.quickLaunch.window.collapse())
    const bubble = await getBubble(context)
    const button = bubble.getByTestId('dock-bubble')
    const surface = bubble.locator('.dock-bubble-surface')
    await expect(surface).toHaveAttribute('data-morph', 'ball')
    await holdPointerOnBall(context)
    await bubble.evaluate(() => {
      const timing = { downAt: 0, shrunkAt: 0 }
      Object.assign(window, { pressTiming: timing })
      const surface = document.querySelector('.dock-bubble-surface')!
      window.addEventListener(
        'pointerdown',
        () => {
          timing.downAt = performance.now()
          const check = () => {
            const scale = new DOMMatrixReadOnly(
              getComputedStyle(surface).transform
            ).a
            if (scale < 1) timing.shrunkAt = performance.now()
            else requestAnimationFrame(check)
          }
          requestAnimationFrame(check)
        },
        true
      )
    })
    const box = (await button.boundingBox())!
    await bubble.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await bubble.mouse.down()
    await expect(button).toHaveAttribute('data-pressed')
    await expect
      .poll(
        () =>
          bubble.evaluate(
            () =>
              (window as unknown as { pressTiming: { shrunkAt: number } })
                .pressTiming.shrunkAt
          ),
        { timeout: 1000 }
      )
      .toBeGreaterThan(0)
    const timing = await bubble.evaluate(
      () =>
        (
          window as unknown as {
            pressTiming: { downAt: number; shrunkAt: number }
          }
        ).pressTiming
    )
    expect(timing.shrunkAt - timing.downAt).toBeLessThan(150)
    // Held down, the ball settles at 0.92 of its size.
    await expect
      .poll(() =>
        surface.evaluate(
          (node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).a
        )
      )
      .toBeCloseTo(0.92, 2)

    await recordBallFrames(bubble)
    await bubble.mouse.up()
    await expect(surface).toHaveAttribute('data-morph', 'dot')
    await expect(button).not.toHaveAttribute('data-pressed')
    const frames = await readBallFrames(bubble)
    // The spring starts from the pressed size: no jump back to 1 first.
    const started = frames.filter((frame) => frame.direction === 'expand')
    expect(started.length).toBeGreaterThan(3)
    expect(Math.max(...started.map((frame) => frame.scale))).toBeLessThan(0.95)
  } finally {
    await closeApp(context)
  }
})

test('the panel is clickable and focused within 100 ms of its expansion starting', async () => {
  const context = await launchApp()
  try {
    await context.page.evaluate(() => window.quickLaunch.window.collapse())
    const bubble = await getBubble(context)
    await expect(bubble.locator('.dock-bubble-surface')).toHaveAttribute(
      'data-morph',
      'ball'
    )
    await recordPanelFrames(context.page)
    await bubble.evaluate(() => window.quickLaunch.window.expand())
    await expect
      .poll(async () => (await readPanelFrames(context.page)).length, {
        timeout: 5000,
      })
      .toBeGreaterThan(3)
    await expectPresentationSettled(context, bubble)
    const frames = (await readPanelFrames(context.page)).filter((frame) =>
      frame.phase.startsWith('expand')
    )
    const started = frames[0]!.at
    // Input is never blocked while the panel grows ...
    expect(frames.every((frame) => frame.pointerEvents !== 'none')).toBe(true)
    // ... and keyboard focus is already there 100 ms in.
    const early = frames.find((frame) => frame.at >= started + 100)
    expect(early, 'frames continue past 100 ms').toBeDefined()
    expect(early!.focused).toBe(true)
    // It really takes keys: the shortcut opens search before the tail has ended.
    await context.page.keyboard.press('Control+k')
    await expect(context.page.getByTestId('command-input')).toBeVisible()
  } finally {
    await closeApp(context)
  }
})

test('collapsing onto a visible ball skips the shown stage, and every stage carries the motion time scale', async () => {
  const context = await launchApp()
  try {
    await context.electronApp.evaluate(({ BrowserWindow }, channel) => {
      const log: {
        surface: string
        stage: string
        direction: string
        timeScale: unknown
      }[] = []
      Object.assign(globalThis, { presentationLog: log })
      for (const window of BrowserWindow.getAllWindows()) {
        const send = window.webContents.send.bind(window.webContents)
        window.webContents.send = ((name: string, ...args: unknown[]) => {
          if (name === channel) {
            const presentation = args[1] as (typeof log)[number]
            log.push({
              surface: presentation.surface,
              stage: presentation.stage,
              direction: presentation.direction,
              timeScale: presentation.timeScale,
            })
          }
          return send(name, ...args)
        }) as typeof window.webContents.send
        // Where the panel takes native focus, relative to the stages, is part of the order.
        const focus = window.focus.bind(window)
        window.focus = () => {
          log.push({
            surface: window.isResizable() ? 'panel' : 'bubble',
            stage: 'focus',
            direction: '',
            timeScale: null,
          })
          focus()
        }
      }
    }, IPC_CHANNELS.prepareWindowShow)
    /** Returns every presentation message sent since the last call, then forgets them. */
    const takeLog = () =>
      context.electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
          presentationLog: {
            surface: string
            stage: string
            direction: string
            timeScale: unknown
          }[]
        }
        return state.presentationLog.splice(0)
      })
    const stagesOf = (
      log: Awaited<ReturnType<typeof takeLog>>,
      surface: string
    ) => log.filter((entry) => entry.surface === surface).map((e) => e.stage)

    // The first collapse reveals a hidden ball, which needs its transparent warm-up frame.
    await context.page.evaluate(() => window.quickLaunch.window.collapse())
    const bubble = await getBubble(context)
    await expectPresentationSettled(context, bubble)
    const first = await takeLog()
    expect(stagesOf(first, 'bubble')).toEqual([
      'prepare',
      'shown',
      'animate',
      'reset',
    ])
    expect(stagesOf(first, 'panel')).toEqual(['prepare', 'animate', 'reset'])
    // The default motion preference (1.35) is the reference speed.
    expect(first.length).toBeGreaterThan(5)
    expect(first.every((entry) => entry.timeScale === 1)).toBe(true)

    await bubble.evaluate(() => window.quickLaunch.window.expand())
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    // The panel is focused before its animation starts, not once the spring has settled.
    expect(stagesOf(await takeLog(), 'panel')).toEqual([
      'prepare',
      'shown',
      'focus',
      'animate',
      'reset',
    ])

    // The ball is already on screen now, so there is nothing to warm up.
    await context.page.evaluate(() => window.quickLaunch.window.collapse())
    await expect
      .poll(async () => (await windowState(context)).panelVisible)
      .toBe(false)
    await expectPresentationSettled(context, bubble)
    expect(stagesOf(await takeLog(), 'bubble')).toEqual([
      'prepare',
      'animate',
      'reset',
    ])

    // The preference is a duration multiplier; 2.2 is the slowest setting and maps to 1.6.
    await context.page.evaluate(async () => {
      const result = await window.quickLaunch.loadData()
      if (!result.ok) throw new Error(result.error)
      result.data.prefs.motion = 2.2
      await window.quickLaunch.saveData(result.data)
    })
    await bubble.evaluate(() => window.quickLaunch.window.expand())
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    const slow = (await takeLog()).filter((entry) => entry.stage !== 'focus')
    expect(slow.length).toBeGreaterThan(0)
    expect(slow.every((entry) => entry.timeScale === 1.6)).toBe(true)
  } finally {
    await closeApp(context)
  }
})

test('reduced motion turns the springs into short fades without any scaling', async () => {
  const context = await launchApp()
  try {
    await context.page.evaluate(() => window.quickLaunch.window.collapse())
    const bubble = await getBubble(context)
    const surface = bubble.locator('.dock-bubble-surface')
    await expect(surface).toHaveAttribute('data-morph', 'ball')
    await context.page.emulateMedia({ reducedMotion: 'reduce' })
    await bubble.emulateMedia({ reducedMotion: 'reduce' })
    await recordPanelFrames(context.page)
    await recordBallFrames(bubble)

    await bubble.evaluate(() => window.quickLaunch.window.expand())
    await expect(surface).toHaveAttribute('data-morph', 'dot')
    await expectPresentationSettled(context, bubble)
    await context.page.evaluate(() => window.quickLaunch.window.collapse())
    await expect(surface).toHaveAttribute('data-morph', 'ball')
    await expectPresentationSettled(context, bubble)
    await bubble.waitForTimeout(200)

    const panel = await readPanelFrames(context.page)
    expect(panel.length).toBeGreaterThan(2)
    expect(panel.every((frame) => frame.transform === 'none')).toBe(true)
    expect(panel.every((frame) => frame.clipPath === 'none')).toBe(true)
    for (const direction of ['expand', 'collapse']) {
      const frames = panel.filter((frame) => frame.phase.startsWith(direction))
      // A fade of at most 100 ms plus the frames that confirm it, and nothing longer.
      expect(frames.at(-1)!.at - frames[0]!.at).toBeLessThan(250)
    }
    expect(
      panel.some(
        (frame) =>
          frame.phase.startsWith('expand') &&
          frame.opacity > 0 &&
          frame.opacity < 1
      )
    ).toBe(true)

    // The ball changes between its two looks in one step: nothing in between is ever drawn.
    const ball = await readBallFrames(bubble)
    expect(
      ball.every(
        (frame) =>
          Math.abs(frame.scale - 1) < 0.01 ||
          Math.abs(frame.scale - 0.52) < 0.01
      )
    ).toBe(true)
    expect(
      ball.every((frame) => frame.dotOpacity === 0 || frame.dotOpacity === 1)
    ).toBe(true)
    expect(ball.some((frame) => Math.abs(frame.scale - 0.52) < 0.01)).toBe(true)
  } finally {
    await closeApp(context)
  }
})

test('ten rapid clicks leave both windows settled, intact and never clipped', async () => {
  const context = await launchApp()
  try {
    await context.page.evaluate(() => window.quickLaunch.window.collapse())
    const bubble = await getBubble(context)
    const button = bubble.getByTestId('dock-bubble')
    const surface = bubble.locator('.dock-bubble-surface')
    await expect(surface).toHaveAttribute('data-morph', 'ball')
    await holdPointerOnBall(context)
    await recordBallFrames(bubble)
    for (let count = 0; count < 10; count++) await button.click()
    await expectPresentationSettled(context, bubble)
    const visible = (await windowState(context)).panelVisible
    // Whatever order the clicks and the temporary panel's own dismissal took,
    // the ball ends up showing the state the panel is in.
    await expect(surface).toHaveAttribute(
      'data-morph',
      visible ? 'dot' : 'ball'
    )
    await expect(button).not.toHaveAttribute('data-pressed')
    await expect
      .poll(() =>
        surface.evaluate((node) => {
          const { style } = node as HTMLElement
          return [style.transform, style.borderRadius, style.willChange].join(
            '|'
          )
        })
      )
      .toBe('||')
    await expect(surface.locator('.dock-bubble-dot')).toHaveCSS(
      'opacity',
      visible ? '0' : '1'
    )
    const ball = await readBallFrames(bubble)
    expect(Math.max(...ball.map((frame) => frame.scale))).toBeLessThanOrEqual(
      1.08
    )
    expect(ball.every((frame) => frame.bodyOpacity === 1)).toBe(true)
    await expect
      .poll(() => leftoverBodyStyles(context.page))
      .toBe(NO_LEFTOVER_STYLES)
    const log = await fs.readFile(
      path.join(context.userDataDir, 'logs', 'main.log'),
      'utf8'
    )
    expect(log).not.toContain('Timed out preparing window frame')
  } finally {
    await closeApp(context)
  }
})

test('right-clicking the bubble opens the launcher menu and Quit exits completely', async () => {
  const context = await launchApp()
  let exited = false
  const exit = new Promise<number | null>((resolve) => {
    context.electronApp.process().once('exit', (code) => {
      exited = true
      resolve(code)
    })
  })
  try {
    // Observe the actual native-menu request without leaving a desktop popup
    // open during automation. Its item callbacks remain the real app actions.
    await context.electronApp.evaluate(({ Menu }) => {
      Menu.prototype.popup = function (options?: Electron.PopupOptions) {
        Object.assign(globalThis, {
          launcherContextMenu: this,
          launcherPopupOptions: options,
        })
        this.emit('menu-will-show')
      }
      // Exercise the production close-to-tray guard when Quit is selected.
      process.env.QUICKLAUNCH_E2E = '0'
    })
    await context.page.evaluate(() => window.quickLaunch.window.collapse())
    const bubble = await getBubble(context)
    // Far from the screen origin, screen coordinates cannot pass for window coordinates.
    const bubbleBounds = (await windowState(context)).bounds!
    expect(Math.max(bubbleBounds.x, bubbleBounds.y)).toBeGreaterThan(DOCK_SIZE)
    await bubble.getByTestId('dock-bubble').click({ button: 'right' })
    await expect
      .poll(() =>
        context.electronApp.evaluate(() => {
          const menu = (
            globalThis as typeof globalThis & {
              launcherContextMenu?: Electron.Menu
            }
          ).launcherContextMenu
          return menu?.items
            .filter((item) => item.type !== 'separator')
            .map((item) => item.label)
        })
      )
      .toEqual(['打开 Marubako', '退出 (Quit)'])
    // Menu.popup takes coordinates relative to the window it is attached to, and the bubble is
    // 56x56, so the popup point has to land inside the bubble rather than at its screen position.
    const popup = await context.electronApp.evaluate(() => {
      const options = (
        globalThis as typeof globalThis & {
          launcherPopupOptions?: Electron.PopupOptions
        }
      ).launcherPopupOptions
      return { x: options?.x, y: options?.y, hasWindow: !!options?.window }
    })
    expect(popup.hasWindow).toBe(true)
    expect(popup.x).toBeGreaterThanOrEqual(0)
    expect(popup.x).toBeLessThanOrEqual(DOCK_SIZE)
    expect(popup.y).toBeGreaterThanOrEqual(0)
    expect(popup.y).toBeLessThanOrEqual(DOCK_SIZE)
    expect((await windowState(context)).panelVisible).toBe(false)
    await expect(bubble.getByTestId('dock-bubble')).not.toHaveClass(/dragging/)
    await context.electronApp.evaluate(() => {
      const menu = (
        globalThis as typeof globalThis & {
          launcherContextMenu: Electron.Menu
        }
      ).launcherContextMenu
      menu.emit('menu-will-close')
      const item = menu.getMenuItemById('open')!
      item.click(item, undefined, {} as Electron.KeyboardEvent)
    })
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
    await bubble.getByTestId('dock-bubble').click({ button: 'right' })
    await context.electronApp.evaluate(() => {
      const menu = (
        globalThis as typeof globalThis & {
          launcherContextMenu: Electron.Menu
        }
      ).launcherContextMenu
      menu.emit('menu-will-close')
      const item = menu.getMenuItemById('quit')!
      setTimeout(
        () => item.click(item, undefined, {} as Electron.KeyboardEvent),
        20
      )
    })
    expect(await exit).toBe(0)
  } finally {
    await closeApp(context, { alreadyClosed: exited })
  }
})

test('dragging and clicking recover when Chromium pointer capture is unavailable', async () => {
  const context = await launchApp()
  try {
    await context.page.getByTestId('dock-panel').click()
    const bubble = await getBubble(context)
    await bubble.evaluate(() => {
      HTMLButtonElement.prototype.setPointerCapture = () => {
        throw new DOMException('Unavailable native capture', 'NotFoundError')
      }
    })
    const before = await windowState(context)
    await dragNativeMouse(
      context,
      {
        x: before.bounds!.x + DOCK_SIZE / 2,
        y: before.bounds!.y + DOCK_SIZE / 2,
      },
      {
        x: before.bounds!.x + DOCK_SIZE / 2 + 60,
        y: before.bounds!.y + DOCK_SIZE / 2 + 30,
      }
    )
    await expect
      .poll(async () => (await windowState(context)).bounds!.x)
      .toBe(before.bounds!.x + 60)
    await expect(bubble.getByTestId('dock-bubble')).not.toHaveClass(/dragging/)
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect
      .poll(async () => (await windowState(context)).panelReady)
      .toBe(true)
  } finally {
    await closeApp(context)
  }
})
