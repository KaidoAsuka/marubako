import {
  test,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createDefaultAppData } from '../src/shared/default-data'
import type { FolderItem } from '../src/shared/types'
import { closeApp, launchApp } from './test-utils'

// layout-7: one strip at the bottom of the window, there only when there is something to say.

function folder(id: string, name: string): FolderItem {
  return { id, kind: 'folder', name, icon: '📁', path: `C:\\Work\\${name}` }
}

/** Twelve loose folders, so the list fills the window and a card sits right above the bottom. */
async function launchWithFolders(zoom = 1) {
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'marubako-feedback-')
  )
  const data = createDefaultAppData()
  data.folders = [
    {
      id: 'grp-docs',
      name: 'Docs',
      icon: '📚',
      open: true,
      items: [folder('doc-1', 'Doc one'), folder('doc-2', 'Doc two')],
    },
  ]
  data.loose.folders = Array.from({ length: 12 }, (_, index) =>
    folder(`loose-${index}`, `Item ${index + 1}`)
  )
  data.topOrder.folders = [
    { type: 'group', id: 'grp-docs' },
    ...data.loose.folders.map((item) => ({
      type: 'loose' as const,
      id: item.id,
    })),
  ]
  data.prefs.zoom = zoom
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(data),
    'utf8'
  )
  return launchApp(userDataDir)
}

/** The status main pushes to the window; the real write failure is covered in data-safety. */
async function pushDataStatus(
  electronApp: ElectronApplication,
  writeError: string | null
) {
  await electronApp.evaluate(({ BrowserWindow }, error) => {
    for (const window of BrowserWindow.getAllWindows())
      window.webContents.send('data-status-changed', {
        writeError: error,
        notices: [],
      })
  }, writeError)
}

const boxes = (page: Page) =>
  page.evaluate(() => {
    const rect = (selector: string) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const { top, bottom, left, right, height } = node.getBoundingClientRect()
      return { top, bottom, left, right, height }
    }

    return {
      strip: rect('.feedback-strip')!,
      content: rect('.workspace-content')!,
      workspace: rect('.workspace')!,
      shell: rect('.app-shell')!,
      innerHeight: window.innerHeight,
    }
  })

test('there is no status bar, and the strip is nothing until there is something to say', async () => {
  const context = await launchWithFolders()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await expect(page.locator('.statusbar')).toHaveCount(0)
    await expect(page.locator('.toast')).toHaveCount(0)
    await expect(page.getByTestId('feedback-strip')).toBeAttached()
    const closed = await boxes(page)
    expect(closed.strip.height).toBeLessThan(0.5)
    // The content reaches the bottom of the shell: nothing is reserved down there.
    expect(Math.abs(closed.workspace.bottom - closed.strip.top)).toBeLessThan(1)
    expect(closed.shell.bottom - closed.strip.bottom).toBeLessThanOrEqual(2)
    await expect(page.getByTestId('feedback-strip')).toHaveText('')
  } finally {
    await closeApp(context)
  }
})

test('a message takes room from the content above it, covers nothing, and gives the room back', async () => {
  const context = await launchWithFolders()
  try {
    const { page } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const before = await boxes(page)

    const card = page.getByTestId('loose-widget-loose-3')
    await card.hover()
    await card.getByRole('button', { name: '删除' }).click()

    const strip = page.locator('.feedback-strip[data-open]')
    await expect(strip).toContainText('已删除「Item 4」')
    await expect(strip).toHaveAttribute('data-kind', 'undo')
    const open = await boxes(page)

    // 28px for one line, a little more for two; never a floating box over the cards.
    expect(open.strip.height).toBeGreaterThanOrEqual(28)
    expect(open.strip.height).toBeLessThanOrEqual(48)
    expect(open.strip.bottom - before.strip.bottom).toBeLessThan(1)
    expect(before.workspace.bottom - open.workspace.bottom).toBeCloseTo(
      open.strip.height,
      0
    )
    expect(open.content.bottom).toBeLessThanOrEqual(open.strip.top + 0.5)
    // The strip is the width of the window and the last thing in it.
    expect(Math.abs(open.strip.left - open.shell.left)).toBeLessThanOrEqual(2)
    expect(Math.abs(open.strip.right - open.shell.right)).toBeLessThanOrEqual(2)

    // Out of the way: the six seconds pass and the room is given back.
    await page.mouse.move(5, 5)
    await expect(page.locator('.feedback-strip[data-open]')).toHaveCount(0, {
      timeout: 9000,
    })
    await expect
      .poll(async () => (await boxes(page)).strip.height)
      .toBeLessThan(0.5)
    const after = await boxes(page)
    expect(
      Math.abs(after.workspace.bottom - before.workspace.bottom)
    ).toBeLessThan(1)
  } finally {
    await closeApp(context)
  }
})

test('a long message wraps to two lines and never to three', async () => {
  const context = await launchWithFolders()
  try {
    const { page, electronApp } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())!
        .setSize(360, 720)
    })
    await expect
      .poll(() => page.evaluate(() => window.innerWidth))
      .toBeLessThan(380)

    await pushDataStatus(
      electronApp,
      'EBUSY: resource busy or locked, rename C:\\Users\\someone\\AppData\\Roaming\\Marubako\\quicklaunch-data.json.tmp -> C:\\Users\\someone\\AppData\\Roaming\\Marubako\\quicklaunch-data.json'
    )

    const text = page.locator('.feedback-strip[data-open] .feedback-text')
    await expect(text).toBeVisible()
    const lines = await text.evaluate((node) => {
      const style = getComputedStyle(node)
      const lineHeight = parseFloat(style.lineHeight)

      return {
        height: node.getBoundingClientRect().height / lineHeight,
        clamp: style.webkitLineClamp,
        full: node.getAttribute('title'),
        cut: node.scrollHeight > node.clientHeight,
      }
    })
    expect(Math.round(lines.height)).toBe(2)
    expect(lines.clamp).toBe('2')
    // What does not fit is cut, and the whole text is one hover away.
    expect(lines.cut).toBe(true)
    expect(lines.full).toContain('quicklaunch-data.json')
    const strip = (await boxes(page)).strip
    expect(strip.height).toBeGreaterThan(36)
    expect(strip.height).toBeLessThan(52)

    await pushDataStatus(electronApp, null)
    await expect(page.locator('.feedback-strip[data-open]')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

for (const zoom of [1, 1.25]) {
  test(`an error raised while a dialog, the search or a folder popup is open stays in plain sight (zoom ${zoom})`, async () => {
    const context = await launchWithFolders(zoom)
    try {
      const { page, electronApp } = context
      await page.emulateMedia({ reducedMotion: 'reduce' })

      // The strip must be what is under its own centre point, not dimmed behind a scrim.
      const probe = () =>
        page.evaluate(() => {
          const strip = document
            .querySelector('.feedback-strip')!
            .getBoundingClientRect()
          const at = document.elementFromPoint(
            strip.left + strip.width / 2,
            strip.top + strip.height / 2
          )
          const overlay = document.querySelector(
            '.modal-overlay, .command-overlay, .widget-popup-overlay'
          )!
          const dialog = overlay.firstElementChild!.getBoundingClientRect()

          return {
            onTop: Boolean(at?.closest('.feedback-strip')),
            overlayBottom: overlay.getBoundingClientRect().bottom,
            dialogBottom: dialog.bottom,
            stripTop: strip.top,
            stripHeight: strip.height,
          }
        })

      const cases = [
        {
          name: 'settings dialog',
          open: async () => {
            await page.getByTestId('open-settings').click()
            await expect(page.getByTestId('modal-card')).toBeVisible()
          },
          close: async () => {
            await page.keyboard.press('Escape')
            await expect(page.getByTestId('modal-card')).toHaveCount(0)
          },
        },
        {
          name: 'search palette',
          open: async () => {
            await page.keyboard.press('Control+k')
            await expect(page.getByTestId('command-palette')).toBeVisible()
          },
          close: async () => {
            await page.keyboard.press('Escape')
            await expect(page.getByTestId('command-palette')).toHaveCount(0)
          },
        },
        {
          name: 'folder popup',
          open: async () => {
            await page.getByTestId('folder-widget-grp-docs').click()
            await expect(page.locator('.widget-popup')).toBeVisible()
          },
          close: async () => {
            await page.keyboard.press('Escape')
            await expect(page.locator('.widget-popup')).toHaveCount(0)
          },
        },
      ]

      for (const entry of cases) {
        await entry.open()
        await pushDataStatus(
          electronApp,
          `Disk write failed while ${entry.name} was open`
        )
        await expect(
          page.locator('.feedback-strip[data-kind="error"][data-open]')
        ).toBeVisible()
        await page.waitForTimeout(400)

        const seen = await probe()
        expect(seen.onTop, entry.name).toBe(true)
        // The scrim ends where the strip begins, so the dialog never runs under it either.
        expect(seen.overlayBottom, entry.name).toBeLessThanOrEqual(
          seen.stripTop + 1
        )
        expect(seen.dialogBottom, entry.name).toBeLessThanOrEqual(
          seen.stripTop + 1
        )

        await pushDataStatus(electronApp, null)
        await expect(page.locator('.feedback-strip[data-open]')).toHaveCount(0)
        await entry.close()
      }
    } finally {
      await closeApp(context)
    }
  })
}

test('the overlays are as tall as the window again once the strip is gone', async () => {
  const context = await launchWithFolders()
  try {
    const { page, electronApp } = context
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('open-settings').click()
    const overlayBottom = () =>
      page.evaluate(
        () =>
          window.innerHeight -
          document.querySelector('.modal-overlay')!.getBoundingClientRect()
            .bottom
      )
    await expect.poll(overlayBottom).toBe(4)

    await pushDataStatus(electronApp, 'disk full')
    await expect.poll(overlayBottom).toBeGreaterThan(30)
    await pushDataStatus(electronApp, null)
    await expect.poll(overlayBottom).toBe(4)
  } finally {
    await closeApp(context)
  }
})
